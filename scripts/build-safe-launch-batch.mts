import { existsSync, readFileSync } from 'node:fs';
import { Contract, JsonRpcProvider, getAddress, keccak256, toUtf8Bytes } from 'ethers';

type Action = 'accept' | 'pause' | 'unpause';

const actionArg = process.argv.find((arg) => arg.startsWith('--action='));
const action = (actionArg?.split('=')[1] || '') as Action;
const chainArg = process.argv.find((arg) => arg.startsWith('--chain-id='));
const chainId = Number(chainArg?.split('=')[1] || 8453);

if (!['accept', 'pause', 'unpause'].includes(action)) {
  throw new Error('action must be accept, pause, or unpause');
}
if (![8453, 84532].includes(chainId)) throw new Error('chain-id must be 8453 or 84532');

const manifestPath = `contracts/deployments/${chainId}.json`;
if (!existsSync(manifestPath)) throw new Error(`${manifestPath} is missing`);
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as Record<string, any>;
if (Number(manifest.chainId) !== chainId) throw new Error('manifest chainId does not match --chain-id');

const validAddress = (value: string) => /^0x[0-9a-fA-F]{40}$/.test(value) && !/^0x0+$/.test(value);
const safe = String(manifest.expectedOwner || '');
const configuredSafe = String(process.env.OWNER_SAFE_ADDRESS || '').trim();
if (!validAddress(safe)) throw new Error('manifest expectedOwner must be the reviewed Safe address');
if (!validAddress(configuredSafe) || configuredSafe.toLowerCase() !== safe.toLowerCase()) {
  throw new Error('OWNER_SAFE_ADDRESS must equal manifest expectedOwner');
}

const evidence = Array.isArray(manifest.transactions) ? manifest.transactions : [];
const evidenceHash = keccak256(toUtf8Bytes(JSON.stringify(evidence)));
if (
  manifest.receiptEvidence?.schema !== 'bobby-base-receipts-v2' ||
  Number(manifest.receiptEvidence?.chainId) !== chainId ||
  Number(manifest.receiptEvidence?.receiptCount) !== evidence.length ||
  String(manifest.receiptEvidence?.evidenceHash || '').toLowerCase() !== evidenceHash.toLowerCase()
) {
  throw new Error('manifest does not contain canonical finalized receipt evidence');
}

const contracts = [
  'trackRecord',
  'convictionOracle',
  'agentEconomyV2',
  'adversarialBounties',
  'hardnessRegistry',
  'agentRegistry',
  'intentEscrow',
] as const;
for (const key of contracts) {
  const address = String(manifest.addresses?.[key] || '');
  if (!validAddress(address)) throw new Error(`manifest address ${key} is invalid`);
  const creates = evidence.filter((row: Record<string, unknown>) =>
    row.transactionType === 'CREATE' &&
    String(row.contractAddress || '').toLowerCase() === address.toLowerCase() &&
    row.status === '0x1'
  );
  if (creates.length !== 1) throw new Error(`finalized evidence must contain exactly one deployment for ${key}`);
}

const rpcUrl = chainId === 8453
  ? process.env.BASE_RPC_URL || ''
  : process.env.BASE_SEPOLIA_RPC_URL || '';
if (!/^https:\/\//i.test(rpcUrl)) throw new Error(`${chainId === 8453 ? 'BASE_RPC_URL' : 'BASE_SEPOLIA_RPC_URL'} is required`);

const provider = new JsonRpcProvider(rpcUrl, chainId, { staticNetwork: true });
try {
  const network = await provider.getNetwork();
  if (Number(network.chainId) !== chainId) throw new Error(`RPC chain id ${network.chainId} does not match ${chainId}`);
  if (await provider.getCode(safe) === '0x') throw new Error('reviewed Safe has no live code');

  for (const row of evidence as Array<Record<string, unknown>>) {
    const receipt = await provider.getTransactionReceipt(String(row.hash || ''));
    if (
      !receipt ||
      receipt.status !== 1 ||
      receipt.blockHash.toLowerCase() !== String(row.blockHash || '').toLowerCase()
    ) {
      throw new Error(`finalized receipt ${String(row.hash || '')} is not canonical`);
    }
  }

  const ownershipAbi = [
    'function owner() view returns (address)',
    'function pendingOwner() view returns (address)',
  ];
  for (const key of contracts) {
    const address = String(manifest.addresses[key]);
    const contract = new Contract(address, ownershipAbi, provider);
    const [owner, pendingOwner, code] = await Promise.all([
      contract.owner() as Promise<string>,
      contract.pendingOwner() as Promise<string>,
      provider.getCode(address),
    ]);
    if (code === '0x') throw new Error(`${key} has no live runtime code`);
    if (action === 'accept') {
      if (owner.toLowerCase() !== String(manifest.deployer || '').toLowerCase()) {
        throw new Error(`${key}.owner is not the finalized deployer before acceptance`);
      }
      if (pendingOwner.toLowerCase() !== safe.toLowerCase()) {
        throw new Error(`${key}.pendingOwner is not the executing Safe`);
      }
    } else {
      if (owner.toLowerCase() !== safe.toLowerCase()) throw new Error(`${key}.owner is not the executing Safe`);
      if (pendingOwner.toLowerCase() !== '0x0000000000000000000000000000000000000000') {
        throw new Error(`${key}.pendingOwner must be cleared before ${action}`);
      }
    }
  }

  type ContractInput = { internalType: string; name: string; type: string };
  type BuilderTransaction = {
    to: string;
    value: string;
    data: null;
    contractMethod: {
      inputs: ContractInput[];
      name: string;
      payable: boolean;
    };
    contractInputsValues: Record<string, string>;
  };

  const transactions: BuilderTransaction[] = [];
  for (const key of contracts) {
    const to = getAddress(String(manifest.addresses[key]));
    if (action === 'accept') {
      transactions.push({
        to,
        value: '0',
        data: null,
        contractMethod: { inputs: [], name: 'acceptOwnership', payable: false },
        contractInputsValues: {},
      });
    } else if (key === 'agentRegistry') {
      continue;
    } else if (key === 'intentEscrow') {
      transactions.push({
        to,
        value: '0',
        data: null,
        contractMethod: {
          inputs: [{ internalType: 'bool', name: 'paused', type: 'bool' }],
          name: 'setPaused',
          payable: false,
        },
        contractInputsValues: { paused: String(action === 'pause') },
      });
    } else {
      transactions.push({
        to,
        value: '0',
        data: null,
        contractMethod: { inputs: [], name: action, payable: false },
        contractInputsValues: {},
      });
    }
  }

  console.log(JSON.stringify({
    version: '1.0',
    chainId: String(chainId),
    createdAt: Date.now(),
    meta: {
      name: `Bobby Protocol ${action} (${chainId})`,
      description: `${transactions.length} reviewed ${action} calls generated from finalized ${manifestPath}`,
      txBuilderVersion: '1.18.0',
      createdFromSafeAddress: getAddress(safe),
      createdFromOwnerAddress: '',
      checksum: '',
    },
    transactions,
  }, null, 2));
} finally {
  provider.destroy();
}
