import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { Interface, keccak256 } from 'ethers';

const chainArg = process.argv.find((arg) => arg.startsWith('--chain-id='));
const chainId = Number(chainArg?.split('=')[1] || 8453);
const shouldWrite = process.argv.includes('--write');

if (![8453, 84532].includes(chainId)) {
  throw new Error('chain-id must be 8453 or 84532');
}

const manifestPath = `contracts/deployments/${chainId}.json`;
const broadcastPath = `contracts/broadcast/DeployBase.s.sol/${chainId}/run-latest.json`;
const rpcUrl = chainId === 8453
  ? process.env.BASE_RPC_URL || 'https://mainnet.base.org'
  : process.env.BASE_SEPOLIA_RPC_URL || 'https://sepolia.base.org';

for (const path of [manifestPath, broadcastPath]) {
  if (!existsSync(path)) throw new Error(`${path} is missing`);
}

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as Record<string, any>;
const broadcast = JSON.parse(readFileSync(broadcastPath, 'utf8')) as Record<string, any>;
const transactions = Array.isArray(broadcast.transactions) ? broadcast.transactions : [];
const localReceipts = Array.isArray(broadcast.receipts) ? broadcast.receipts : [];

if (Number(manifest.chainId) !== chainId) throw new Error('manifest chainId does not match target');
if (!transactions.length || transactions.length !== localReceipts.length) {
  throw new Error('Foundry transaction/receipt counts are empty or do not match');
}

let rpcId = 0;
async function rpc<T>(method: string, params: unknown[] = []): Promise<T> {
  const response = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: ++rpcId, method, params }),
  });
  if (!response.ok) throw new Error(`RPC ${method} returned HTTP ${response.status}`);
  const payload = await response.json() as { result?: T; error?: { message?: string } };
  if (payload.error || payload.result === undefined) {
    throw new Error(payload.error?.message || `RPC ${method} returned no result`);
  }
  return payload.result;
}

const liveChainId = Number(BigInt(await rpc<string>('eth_chainId')));
if (liveChainId !== chainId) throw new Error(`RPC chain id ${liveChainId} does not match ${chainId}`);

const manifestKeyByContract: Record<string, string> = {
  BobbyTrackRecord: 'trackRecord',
  BobbyTrackRecordV2: 'trackRecord',
  BobbyConvictionOracle: 'convictionOracle',
  BobbyAgentEconomyV2: 'agentEconomyV2',
  BobbyAdversarialBounties: 'adversarialBounties',
  HardnessRegistry: 'hardnessRegistry',
  BobbyAgentRegistry: 'agentRegistry',
  BobbyIntentEscrow: 'intentEscrow',
};

type LiveReceipt = {
  blockHash: string;
  blockNumber: string;
  contractAddress: string | null;
  from: string;
  gasUsed: string;
  status: string;
  to: string | null;
  transactionHash: string;
};
type LiveTransaction = {
  from: string;
  hash: string;
  input: string;
  to: string | null;
};

const evidence: Array<Record<string, unknown>> = [];
const seenCreates = new Set<string>();
const deployer = String(manifest.deployer || '');
const expectedOwner = String(manifest.expectedOwner || (chainId === 84532 ? deployer : ''));
const scorer = String(manifest.roles?.hardnessScorer || '');
if (!/^0x[0-9a-fA-F]{40}$/.test(deployer)) throw new Error('manifest deployer is invalid');
if (!/^0x[0-9a-fA-F]{40}$/.test(expectedOwner)) throw new Error('manifest expectedOwner is required on mainnet');
if (!/^0x[0-9a-fA-F]{40}$/.test(scorer)) throw new Error('manifest hardnessScorer is invalid');

const ownershipInterface = new Interface(['function transferOwnership(address)']);
const scorerInterface = new Interface(['function setHardnessScorer(address)']);
const expectedCalls = new Map<string, { target: string; functionName: string; argument: string; input: string }>();
function expectCall(target: string, functionName: string, argument: string, input: string) {
  expectedCalls.set(`${target.toLowerCase()}:${functionName}`, { target, functionName, argument, input });
}
expectCall(
  String(manifest.addresses?.hardnessRegistry || ''),
  'setHardnessScorer(address)',
  scorer,
  scorerInterface.encodeFunctionData('setHardnessScorer', [scorer]),
);
if (expectedOwner.toLowerCase() !== deployer.toLowerCase()) {
  for (const target of Object.values(manifest.addresses || {}) as string[]) {
    expectCall(
      String(target),
      'transferOwnership(address)',
      expectedOwner,
      ownershipInterface.encodeFunctionData('transferOwnership', [expectedOwner]),
    );
  }
}
const seenCalls = new Set<string>();

for (let index = 0; index < transactions.length; index += 1) {
  const tx = transactions[index] as Record<string, any>;
  const localReceipt = localReceipts[index] as Record<string, any>;
  const hash = String(localReceipt.transactionHash || '');
  if (!/^0x[0-9a-fA-F]{64}$/.test(hash)) throw new Error(`receipt ${index} has no valid transaction hash`);

  const live = await rpc<LiveReceipt | null>('eth_getTransactionReceipt', [hash]);
  const liveTransaction = await rpc<LiveTransaction | null>('eth_getTransactionByHash', [hash]);
  if (!live) throw new Error(`transaction ${hash} is not mined`);
  if (!liveTransaction || liveTransaction.hash.toLowerCase() !== hash.toLowerCase()) {
    throw new Error(`transaction ${hash} body is unavailable from the live RPC`);
  }
  if (live.status !== '0x1') throw new Error(`transaction ${hash} did not succeed`);
  if (!live.blockHash || /^0x0+$/.test(live.blockHash)) throw new Error(`transaction ${hash} has no canonical block hash`);
  if (live.from.toLowerCase() !== deployer.toLowerCase()) {
    throw new Error(`transaction ${hash} was not sent by the reviewed deployer`);
  }
  if (liveTransaction.from.toLowerCase() !== deployer.toLowerCase()) {
    throw new Error(`transaction ${hash} body was not signed by the reviewed deployer`);
  }

  const isCreate = tx.transactionType === 'CREATE';
  const contractName = String(tx.contractName || '');
  const declaredAddress = String(tx.contractAddress || '');
  if (isCreate) {
    const manifestKey = manifestKeyByContract[contractName];
    if (!manifestKey) throw new Error(`unexpected deployed contract ${contractName}`);
    const expectedAddress = String(manifest.addresses?.[manifestKey] || '');
    if (
      !live.contractAddress ||
      live.contractAddress.toLowerCase() !== declaredAddress.toLowerCase() ||
      live.contractAddress.toLowerCase() !== expectedAddress.toLowerCase()
    ) {
      throw new Error(`${contractName} address differs across receipt, broadcast and manifest`);
    }
    if (seenCreates.has(manifestKey)) throw new Error(`duplicate deployment for ${manifestKey}`);
    seenCreates.add(manifestKey);
  } else if (tx.transactionType === 'CALL') {
    const target = String(tx.transaction?.to || '');
    const functionName = String(tx.function || '');
    const argument = String(Array.isArray(tx.arguments) ? tx.arguments[0] || '' : '');
    const callKey = `${target.toLowerCase()}:${functionName}`;
    const expected = expectedCalls.get(callKey);
    if (!expected) throw new Error(`unexpected broadcast call ${functionName} to ${target}`);
    if (!live.to || live.to.toLowerCase() !== expected.target.toLowerCase()) {
      throw new Error(`${functionName} target differs between live receipt and reviewed manifest`);
    }
    if (!liveTransaction.to || liveTransaction.to.toLowerCase() !== expected.target.toLowerCase()) {
      throw new Error(`${functionName} target differs in the live transaction body`);
    }
    if (argument.toLowerCase() !== expected.argument.toLowerCase()) {
      throw new Error(`${functionName} argument does not match the reviewed manifest`);
    }
    if (liveTransaction.input.toLowerCase() !== expected.input.toLowerCase()) {
      throw new Error(`${functionName} live calldata does not match the reviewed argument`);
    }
    if (seenCalls.has(callKey)) throw new Error(`duplicate broadcast call ${functionName} to ${target}`);
    seenCalls.add(callKey);
  } else {
    throw new Error(`unexpected broadcast transaction type ${String(tx.transactionType)}`);
  }

  evidence.push({
    hash: live.transactionHash,
    block: Number(BigInt(live.blockNumber)),
    blockHash: live.blockHash,
    transactionType: tx.transactionType,
    contractName,
    contractAddress: live.contractAddress,
    from: live.from,
    to: live.to,
    function: tx.function ?? null,
    arguments: Array.isArray(tx.arguments) ? tx.arguments : [],
    inputHash: keccak256(liveTransaction.input),
    gasUsed: Number(BigInt(live.gasUsed)),
    status: live.status,
  });
}

const expectedCreates = new Set(Object.values(manifestKeyByContract));
if (seenCreates.size !== expectedCreates.size || [...expectedCreates].some((key) => !seenCreates.has(key))) {
  throw new Error('broadcast does not contain exactly the seven expected protocol deployments');
}
if (seenCalls.size !== expectedCalls.size || [...expectedCalls.keys()].some((key) => !seenCalls.has(key))) {
  throw new Error('broadcast does not contain exactly the reviewed scorer and ownership calls');
}

const deployBlock = Math.min(...evidence.map((item) => Number(item.block)));
const coreMatches = Number(manifest.deployBlock) === deployBlock && evidence.every((item) => {
  const existing = (manifest.transactions || []).find(
    (candidate: Record<string, unknown>) => candidate.hash === item.hash,
  );
  return existing && existing.status === '0x1' && Number(existing.block) === item.block;
});

if (!shouldWrite) {
  if (!coreMatches) {
    console.error(`Manifest evidence is stale. Re-run with --write after reviewing ${evidence.length} live receipts.`);
    process.exitCode = 1;
  } else {
    console.log(`Manifest evidence verified against ${evidence.length} live receipts on chain ${chainId}.`);
  }
} else {
  manifest.deployBlock = deployBlock;
  manifest.transactions = evidence;
  manifest.receiptEvidence = {
    source: broadcastPath,
    chainId,
    receiptCount: evidence.length,
  };
  delete manifest.deployBlockNote;

  const tempPath = `${manifestPath}.tmp`;
  writeFileSync(tempPath, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 });
  renameSync(tempPath, manifestPath);
  console.log(`Wrote ${manifestPath} from ${evidence.length} live receipts on chain ${chainId}.`);
}
