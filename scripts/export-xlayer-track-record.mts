import { createHash, randomUUID } from 'node:crypto';
import {
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { Interface, getAddress, keccak256 } from 'ethers';

const CHAIN_ID = 196;
const DEFAULT_CONTRACT = '0xF841b428E6d743187D7BE2242eccC1078fdE2395';
const DEFAULT_DEPLOYMENT_BLOCK = 0x34775f3;
const DEFAULT_CONFIRMATIONS = 64;
const DEFAULT_RPC_URL = 'https://xlayerrpc.okx.com';
const RPC_URL = process.env.XLAYER_ARCHIVE_RPC_URL
  || process.env.XLAYER_RPC_URL
  || DEFAULT_RPC_URL;
const CONTRACT = getAddress(process.env.XLAYER_TRACK_RECORD_ADDRESS || DEFAULT_CONTRACT);

function argValue(name: string): string | undefined {
  const prefix = `${name}=`;
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}

function parsePositiveInteger(value: string, label: string, allowZero = false): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < (allowZero ? 0 : 1)) {
    throw new Error(`${label} must be ${allowZero ? 'a non-negative' : 'a positive'} safe integer`);
  }
  return parsed;
}

function parseBlockNumber(value: string, label: string): number {
  let parsed: bigint;
  try {
    parsed = BigInt(value);
  } catch {
    throw new Error(`${label} must be a decimal or 0x-prefixed block number`);
  }
  if (parsed < 0n || parsed > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error(`${label} is outside the safe integer range`);
  }
  return Number(parsed);
}

const writeRequested = process.argv.includes('--write');
const verifySwitch = process.argv.includes('--verify');
const verifyArg = argValue('--verify');
const verifyRequested = verifySwitch || verifyArg !== undefined;
const outputArg = argValue('--output');
const endBlockArg = argValue('--end-block');
const finalizedRequestedFlag = process.argv.includes('--finalized');
const includeEventsFlag = process.argv.includes('--include-events');
const verificationPath = verifyRequested
  ? resolve(verifyArg || outputArg || '')
  : null;

if (writeRequested && verifyRequested) {
  throw new Error('--write and --verify are mutually exclusive');
}
if (verifyRequested && !verifyArg && !outputArg) {
  throw new Error('Use --verify=<archive.json> (or --verify --output=<archive.json>)');
}

let expectedArchive: any = null;
let expectedJson = '';
let expectedDigest = '';
if (verificationPath) {
  expectedJson = readFileSync(verificationPath, 'utf8');
  expectedArchive = JSON.parse(expectedJson);
  const digestPath = `${verificationPath}.sha256`;
  const digestLine = readFileSync(digestPath, 'utf8').trim();
  expectedDigest = digestLine.split(/\s+/)[0]?.toLowerCase() || '';
  if (!/^[0-9a-f]{64}$/.test(expectedDigest)) {
    throw new Error(`Invalid SHA-256 sidecar: ${digestPath}`);
  }
  const storedDigest = createHash('sha256').update(expectedJson).digest('hex');
  if (storedDigest !== expectedDigest) {
    throw new Error(`Stored archive digest mismatch: expected ${expectedDigest}, got ${storedDigest}`);
  }
}

const expectedSnapshotBlock = expectedArchive?.snapshot?.blockNumber;
if (verifyRequested && !Number.isSafeInteger(expectedSnapshotBlock)) {
  throw new Error('Verification archive does not contain a valid snapshot.blockNumber');
}
if (verifyRequested && endBlockArg && parseBlockNumber(endBlockArg, '--end-block') !== expectedSnapshotBlock) {
  throw new Error('--end-block does not match the verification archive');
}

const includeEvents = includeEventsFlag
  || Boolean(verifyRequested && Array.isArray(expectedArchive?.events) && expectedArchive.events.length > 0);
const finalizedRequested = finalizedRequestedFlag
  || expectedArchive?.snapshot?.selectionPolicy === 'finalized';
const confirmationDepth = parsePositiveInteger(
  argValue('--confirmations')
    || process.env.XLAYER_EXPORT_CONFIRMATIONS
    || String(expectedArchive?.snapshot?.requiredConfirmations ?? DEFAULT_CONFIRMATIONS),
  '--confirmations / XLAYER_EXPORT_CONFIRMATIONS',
  true,
);
const deploymentBlock = parsePositiveInteger(
  process.env.XLAYER_TRACK_RECORD_DEPLOYMENT_BLOCK || String(DEFAULT_DEPLOYMENT_BLOCK),
  'XLAYER_TRACK_RECORD_DEPLOYMENT_BLOCK',
);
const logChunkSize = parsePositiveInteger(
  process.env.XLAYER_EXPORT_LOG_CHUNK || '10000',
  'XLAYER_EXPORT_LOG_CHUNK',
);
const callBatchSize = parsePositiveInteger(
  process.env.XLAYER_EXPORT_CALL_BATCH || '100',
  'XLAYER_EXPORT_CALL_BATCH',
);
if (callBatchSize > 250) {
  throw new Error('XLAYER_EXPORT_CALL_BATCH must be at most 250');
}

let parsedRpcUrl: URL;
try {
  parsedRpcUrl = new URL(RPC_URL);
} catch {
  throw new Error('X Layer archive RPC must be a valid URL');
}
if (!['https:', 'http:'].includes(parsedRpcUrl.protocol)) {
  throw new Error('X Layer archive RPC must use HTTP(S)');
}

const unsafeRpcParts: string[] = [];
if (parsedRpcUrl.username || parsedRpcUrl.password) unsafeRpcParts.push('basic-auth credentials');
if (parsedRpcUrl.search) unsafeRpcParts.push('query parameters');
if (parsedRpcUrl.hash) unsafeRpcParts.push('URL fragment');
if (parsedRpcUrl.pathname && parsedRpcUrl.pathname !== '/') unsafeRpcParts.push('non-root path');
if (writeRequested && unsafeRpcParts.length > 0) {
  throw new Error(
    `Refusing --write with a potentially credential-bearing RPC URL (${unsafeRpcParts.join(', ')}). `
    + 'Use a credential-free root endpoint or a local credential-stripping proxy.',
  );
}

// Never serialize the endpoint. Custom hostnames and path-based provider keys
// are deliberately collapsed to a generic label.
const rpcProvider = parsedRpcUrl.origin === new URL(DEFAULT_RPC_URL).origin
  && parsedRpcUrl.pathname === '/'
  && !parsedRpcUrl.search
  ? 'xlayerrpc.okx.com'
  : 'custom-rpc';

let nextRpcId = 1;

async function postRpc(payload: unknown): Promise<any> {
  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    try {
      const response = await fetch(RPC_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(30_000),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt < 5) await new Promise((resolveDelay) => setTimeout(resolveDelay, 1_000 * attempt));
    }
  }
  throw new Error(`X Layer RPC request failed: ${lastError?.message || 'unknown error'}`);
}

async function rpc<T>(method: string, params: unknown[]): Promise<T> {
  const id = nextRpcId++;
  const body = await postRpc({ jsonrpc: '2.0', id, method, params });
  if (body?.error) throw new Error(`${method}: ${body.error.message || JSON.stringify(body.error)}`);
  return body?.result as T;
}

async function rpcBatch<T>(
  calls: Array<{ method: string; params: unknown[] }>,
  retryAttempt = 0,
): Promise<T[]> {
  const payload = calls.map((call) => ({ jsonrpc: '2.0', id: nextRpcId++, ...call }));
  const body = await postRpc(payload);
  if (!Array.isArray(body)) {
    if (calls.length === 1) return [await rpc<T>(calls[0].method, calls[0].params)];
    const subBatchSize = Math.min(10, Math.max(1, Math.floor(calls.length / 2)));
    const subBatches: Array<Array<{ method: string; params: unknown[] }>> = [];
    for (let start = 0; start < calls.length; start += subBatchSize) {
      subBatches.push(calls.slice(start, start + subBatchSize));
    }
    const fallbackResults: T[] = [];
    for (let start = 0; start < subBatches.length; start += 2) {
      const wave = await Promise.all(
        subBatches.slice(start, start + 2).map((subBatch) => rpcBatch<T>(subBatch)),
      );
      fallbackResults.push(...wave.flat());
    }
    return fallbackResults;
  }
  const byId = new Map(body.map((item: any) => [item.id, item]));
  const rateLimited = payload.some((item) => {
    const response = byId.get(item.id);
    return /rate limit/i.test(String(response?.error?.message || ''));
  });
  if (rateLimited && retryAttempt < 5) {
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 1_000 * (retryAttempt + 1)));
    return rpcBatch<T>(calls, retryAttempt + 1);
  }
  return payload.map((item) => {
    const response = byId.get(item.id);
    if (!response) throw new Error(`RPC batch response omitted id ${item.id}`);
    if (response.error) throw new Error(`${item.method}: ${response.error.message || JSON.stringify(response.error)}`);
    return response.result as T;
  });
}

const contractInterface = new Interface([
  'function totalCommitments() view returns (uint256)',
  'function totalTrades() view returns (uint256)',
  'function wins() view returns (uint256)',
  'function losses() view returns (uint256)',
  'function pendingCount() view returns (uint256)',
  'function totalPnlBps() view returns (int256)',
  'function getWinRate() view returns (uint256)',
  'function owner() view returns (address)',
  'function pendingOwner() view returns (address)',
  'function bobby() view returns (address)',
  'function paused() view returns (bool)',
  'function minCommitAge() view returns (uint256)',
  'function getAgentStats(uint8) view returns (uint256 wins,uint256 losses,uint256 total,uint256 winRate)',
  'function commitments(uint256) view returns (bytes32 debateHash,uint96 entryPrice,uint96 targetPrice,uint64 committedAt,uint96 stopPrice,address recorder,uint64 minResolveAt,uint8 agent,uint8 conviction,bool resolved,string symbol)',
  'function trades(uint256) view returns (bytes32 debateHash,uint96 entryPrice,uint96 exitPrice,uint64 committedAt,uint64 resolvedAt,address recorder,uint8 agent,uint8 conviction,uint8 result,int256 pnlBps,string symbol)',
]);

const eventInterface = new Interface([
  'event TradeCommitted(uint256 indexed commitId,string symbol,uint8 indexed agent,uint8 conviction,uint256 entryPrice,bytes32 indexed debateHash)',
  'event TradeResolved(uint256 indexed tradeId,string symbol,uint8 indexed agent,uint8 result,int256 pnlBps,uint8 conviction,bytes32 indexed debateHash)',
  'event CommitmentExpired(uint256 indexed commitId,bytes32 indexed debateHash,string symbol)',
]);

const agentNames = ['CIO', 'ALPHA', 'REDTEAM'] as const;
const resultNames = ['PENDING', 'WIN', 'LOSS', 'EXPIRED', 'BREAK_EVEN'] as const;
const toHexBlock = (value: number) => `0x${value.toString(16)}`;
const toNumber = (value: bigint) => Number(value);
const toString = (value: bigint) => value.toString();
type BlockReference = string | { blockHash: string; requireCanonical: true };

async function callFunctions(
  calls: Array<{ name: string; args?: readonly unknown[] }>,
  blockReference: BlockReference,
): Promise<any[]> {
  const results = await rpcBatch<string>(calls.map(({ name, args = [] }) => ({
    method: 'eth_call',
    params: [{ to: CONTRACT, data: contractInterface.encodeFunctionData(name, args) }, blockReference],
  })));
  return results.map((result, index) => contractInterface.decodeFunctionResult(calls[index].name, result));
}

async function fetchLogs(fromBlock: number, toBlock: number, topics: string[]): Promise<any[]> {
  try {
    return await rpc<any[]>('eth_getLogs', [{
      address: CONTRACT,
      fromBlock: toHexBlock(fromBlock),
      toBlock: toHexBlock(toBlock),
      topics: [topics],
    }]);
  } catch (error) {
    if (fromBlock >= toBlock) throw error;
    const middle = Math.floor((fromBlock + toBlock) / 2);
    const left = await fetchLogs(fromBlock, middle, topics);
    const right = await fetchLogs(middle + 1, toBlock, topics);
    return [...left, ...right];
  }
}

function assertSequentialEventIds(
  events: Record<string, any>[],
  eventName: string,
  idField: string,
  expectedCount: number,
): void {
  const ids = events
    .filter((event) => event.event === eventName)
    .map((event) => Number(event[idField]))
    .sort((a, b) => a - b);
  if (ids.length !== expectedCount || ids.some((id, index) => id !== index)) {
    throw new Error(`${eventName} IDs are incomplete or duplicated: expected contiguous 0..${expectedCount - 1}`);
  }
}

function canonicalState(archive: any): unknown {
  return {
    source: {
      chainId: archive?.source?.chainId,
      chain: archive?.source?.chain,
      contract: archive?.source?.contract,
      contractCodeHash: archive?.source?.contractCodeHash,
      deploymentBlock: archive?.source?.deploymentBlock,
    },
    snapshot: {
      blockNumber: archive?.snapshot?.blockNumber,
      blockHash: archive?.snapshot?.blockHash,
      blockTimestamp: archive?.snapshot?.blockTimestamp,
    },
    stats: archive?.stats,
    commitments: archive?.commitments,
    trades: archive?.trades,
    events: archive?.events,
  };
}

function preflightOutput(path: string): void {
  if (existsSync(path)) throw new Error(`Refusing to overwrite existing file: ${path}`);
}

function writeSyncedTemp(finalPath: string, data: string): string {
  const temporaryPath = `${finalPath}.tmp-${process.pid}-${randomUUID()}`;
  const descriptor = openSync(temporaryPath, 'wx', 0o600);
  try {
    writeFileSync(descriptor, data, 'utf8');
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
  return temporaryPath;
}

function fsyncDirectory(path: string): void {
  const descriptor = openSync(path, 'r');
  try {
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
}

function writeArchiveAtomically(outputPath: string, json: string, digest: string): void {
  const hashPath = `${outputPath}.sha256`;
  const outputDirectory = dirname(outputPath);
  mkdirSync(outputDirectory, { recursive: true });
  preflightOutput(outputPath);
  preflightOutput(hashPath);

  let jsonTemp = '';
  let hashTemp = '';
  let jsonPublished = false;
  let hashPublished = false;
  try {
    jsonTemp = writeSyncedTemp(outputPath, json);
    hashTemp = writeSyncedTemp(hashPath, `${digest}  ${basename(outputPath)}\n`);
    renameSync(jsonTemp, outputPath);
    jsonTemp = '';
    jsonPublished = true;
    renameSync(hashTemp, hashPath);
    hashTemp = '';
    hashPublished = true;
    fsyncDirectory(outputDirectory);
  } catch (error) {
    if (jsonTemp && existsSync(jsonTemp)) unlinkSync(jsonTemp);
    if (hashTemp && existsSync(hashTemp)) unlinkSync(hashTemp);
    // Both destinations were proven absent before this run. Remove only files
    // published by this run if the pair could not be committed completely.
    if (jsonPublished && !hashPublished && existsSync(outputPath)) unlinkSync(outputPath);
    if (hashPublished && !jsonPublished && existsSync(hashPath)) unlinkSync(hashPath);
    throw error;
  }
}

const chainId = Number(BigInt(await rpc<string>('eth_chainId', [])));
if (chainId !== CHAIN_ID) throw new Error(`RPC chain id ${chainId} does not match X Layer ${CHAIN_ID}`);

const latestBlock = await rpc<any>('eth_getBlockByNumber', ['latest', false]);
if (!latestBlock?.number || !latestBlock?.hash) throw new Error('Could not read the latest X Layer block');
const latestBlockNumber = Number(BigInt(latestBlock.number));
let endBlock: number;
let selectionPolicy: 'confirmed-depth' | 'finalized';

if (verifyRequested) {
  endBlock = expectedSnapshotBlock;
  selectionPolicy = expectedArchive?.snapshot?.selectionPolicy === 'finalized'
    ? 'finalized'
    : 'confirmed-depth';
} else if (endBlockArg) {
  endBlock = parseBlockNumber(endBlockArg, '--end-block');
  selectionPolicy = finalizedRequested ? 'finalized' : 'confirmed-depth';
} else if (finalizedRequested) {
  const finalizedBlock = await rpc<any>('eth_getBlockByNumber', ['finalized', false]);
  if (!finalizedBlock?.number || !finalizedBlock?.hash) {
    throw new Error('RPC did not return a finalized block; use --confirmations=<depth> instead');
  }
  endBlock = Number(BigInt(finalizedBlock.number));
  selectionPolicy = 'finalized';
} else {
  if (latestBlockNumber < confirmationDepth) {
    throw new Error(`Latest block ${latestBlockNumber} is below confirmation depth ${confirmationDepth}`);
  }
  endBlock = latestBlockNumber - confirmationDepth;
  selectionPolicy = 'confirmed-depth';
}

if (endBlock < deploymentBlock) throw new Error('Snapshot block predates the TrackRecord deployment range');
if (selectionPolicy === 'confirmed-depth' && latestBlockNumber - endBlock < confirmationDepth) {
  throw new Error(
    `Snapshot block ${endBlock} has only ${latestBlockNumber - endBlock} confirmations; ${confirmationDepth} required`,
  );
}
if (selectionPolicy === 'finalized') {
  const finalizedHead = await rpc<any>('eth_getBlockByNumber', ['finalized', false]);
  if (!finalizedHead?.number || !finalizedHead?.hash) {
    throw new Error('RPC cannot prove finalized-block status; use a confirmed depth instead');
  }
  const finalizedHeadNumber = Number(BigInt(finalizedHead.number));
  if (endBlock > finalizedHeadNumber) {
    throw new Error(`Snapshot block ${endBlock} is newer than finalized head ${finalizedHeadNumber}`);
  }
}

const blockTag = toHexBlock(endBlock);
const snapshotBlock = await rpc<any>('eth_getBlockByNumber', [blockTag, false]);
if (!snapshotBlock?.number || !snapshotBlock?.hash || !snapshotBlock?.timestamp) {
  throw new Error('Could not pin the snapshot block');
}

const canonicalReference = { blockHash: snapshotBlock.hash, requireCanonical: true } as const;
let blockReference: BlockReference = canonicalReference;
let code: string;
try {
  code = await rpc<string>('eth_getCode', [CONTRACT, canonicalReference]);
  await rpc<string>('eth_call', [{
    to: CONTRACT,
    data: contractInterface.encodeFunctionData('totalCommitments'),
  }, canonicalReference]);
} catch {
  blockReference = blockTag;
  code = await rpc<string>('eth_getCode', [CONTRACT, blockTag]);
  console.warn('RPC lacks EIP-1898 canonical block-hash reads; using a pinned block number with hash revalidation.');
}
if (!code || code === '0x') throw new Error(`No TrackRecord code at ${CONTRACT} on block ${endBlock}`);

const scalarCalls = [
  { name: 'totalCommitments' }, { name: 'totalTrades' }, { name: 'wins' },
  { name: 'losses' }, { name: 'pendingCount' }, { name: 'totalPnlBps' },
  { name: 'getWinRate' }, { name: 'owner' },
  { name: 'pendingOwner' }, { name: 'bobby' }, { name: 'paused' },
  { name: 'minCommitAge' },
] as const;
const scalarValues = await callFunctions([...scalarCalls], blockReference);
const scalars = Object.fromEntries(scalarCalls.map((call, index) => [call.name, scalarValues[index][0]]));
const totalCommitments = toNumber(scalars.totalCommitments);
const totalTrades = toNumber(scalars.totalTrades);

const agentValues = await callFunctions(
  agentNames.map((_, agent) => ({ name: 'getAgentStats', args: [agent] })),
  blockReference,
);
const agentStats = Object.fromEntries(agentValues.map((value, agent) => [agentNames[agent], {
  wins: toString(value[0]),
  losses: toString(value[1]),
  total: toString(value[2]),
  winRateBps: toString(value[3]),
}]));

const commitments: Record<string, unknown>[] = [];
for (let start = 0; start < totalCommitments; start += callBatchSize) {
  const end = Math.min(totalCommitments, start + callBatchSize);
  const calls = Array.from({ length: end - start }, (_, offset) => ({ name: 'commitments', args: [start + offset] }));
  const values = await callFunctions(calls, blockReference);
  values.forEach((value, offset) => commitments.push({
    id: start + offset,
    debateHash: value[0],
    entryPriceE8: toString(value[1]),
    targetPriceE8: toString(value[2]),
    committedAt: toNumber(value[3]),
    stopPriceE8: toString(value[4]),
    recorder: value[5],
    minResolveAt: toNumber(value[6]),
    agent: agentNames[toNumber(value[7])] || `UNKNOWN_${value[7].toString()}`,
    conviction: toNumber(value[8]),
    resolved: value[9],
    symbol: value[10],
  }));
}

const trades: Record<string, unknown>[] = [];
for (let start = 0; start < totalTrades; start += callBatchSize) {
  const end = Math.min(totalTrades, start + callBatchSize);
  const calls = Array.from({ length: end - start }, (_, offset) => ({ name: 'trades', args: [start + offset] }));
  const values = await callFunctions(calls, blockReference);
  values.forEach((value, offset) => trades.push({
    id: start + offset,
    debateHash: value[0],
    entryPriceE8: toString(value[1]),
    exitPriceE8: toString(value[2]),
    committedAt: toNumber(value[3]),
    resolvedAt: toNumber(value[4]),
    recorder: value[5],
    agent: agentNames[toNumber(value[6])] || `UNKNOWN_${value[6].toString()}`,
    conviction: toNumber(value[7]),
    result: resultNames[toNumber(value[8])] || `UNKNOWN_${value[8].toString()}`,
    pnlBps: toString(value[9]),
    symbol: value[10],
  }));
}

let events: Record<string, unknown>[] = [];
if (includeEvents) {
  const topicNames = ['TradeCommitted', 'TradeResolved', 'CommitmentExpired'] as const;
  const topics = topicNames.map((name) => eventInterface.getEvent(name)!.topicHash);
  const rawLogs: any[] = [];
  for (let start = deploymentBlock; start <= endBlock; start += logChunkSize) {
    rawLogs.push(...await fetchLogs(start, Math.min(endBlock, start + logChunkSize - 1), topics));
  }
  rawLogs.sort((a, b) => Number(BigInt(a.blockNumber) - BigInt(b.blockNumber))
    || Number(BigInt(a.logIndex) - BigInt(b.logIndex)));

  events = rawLogs.map((log) => {
    const parsed = eventInterface.parseLog({ topics: log.topics, data: log.data });
    if (!parsed) throw new Error(`Unable to decode log ${log.transactionHash}:${log.logIndex}`);
    const common = {
      event: parsed.name,
      blockNumber: Number(BigInt(log.blockNumber)),
      blockHash: log.blockHash,
      transactionHash: log.transactionHash,
      transactionIndex: Number(BigInt(log.transactionIndex)),
      logIndex: Number(BigInt(log.logIndex)),
    };
    if (parsed.name === 'TradeCommitted') return {
      ...common,
      commitId: toNumber(parsed.args.commitId),
      symbol: parsed.args.symbol,
      agent: agentNames[toNumber(parsed.args.agent)],
      conviction: toNumber(parsed.args.conviction),
      entryPriceE8: toString(parsed.args.entryPrice),
      debateHash: parsed.args.debateHash,
    };
    if (parsed.name === 'TradeResolved') return {
      ...common,
      tradeId: toNumber(parsed.args.tradeId),
      symbol: parsed.args.symbol,
      agent: agentNames[toNumber(parsed.args.agent)],
      result: resultNames[toNumber(parsed.args.result)],
      pnlBps: toString(parsed.args.pnlBps),
      conviction: toNumber(parsed.args.conviction),
      debateHash: parsed.args.debateHash,
    };
    return {
      ...common,
      commitId: toNumber(parsed.args.commitId),
      debateHash: parsed.args.debateHash,
      symbol: parsed.args.symbol,
    };
  });

  assertSequentialEventIds(events, 'TradeCommitted', 'commitId', totalCommitments);
  assertSequentialEventIds(events, 'TradeResolved', 'tradeId', totalTrades);
  const expiredIds = events
    .filter((event: any) => event.event === 'CommitmentExpired')
    .map((event: any) => Number(event.commitId));
  if (new Set(expiredIds).size !== expiredIds.length
    || expiredIds.some((id) => !Number.isInteger(id) || id < 0 || id >= totalCommitments)) {
    throw new Error('CommitmentExpired events contain duplicate or out-of-range commitment IDs');
  }
}

const finalBlockCheck = await rpc<any>('eth_getBlockByNumber', [blockTag, false]);
if (finalBlockCheck?.hash !== snapshotBlock.hash) {
  throw new Error('Snapshot block is no longer canonical at its block number');
}
const finalHashCheck = await rpc<any>('eth_getBlockByHash', [snapshotBlock.hash, false]);
if (!finalHashCheck?.number || Number(BigInt(finalHashCheck.number)) !== endBlock) {
  throw new Error('Snapshot block hash is no longer retrievable at the pinned height');
}
const latestBlockCheck = await rpc<any>('eth_getBlockByNumber', ['latest', false]);
const finalLatestNumber = Number(BigInt(latestBlockCheck.number));
if (selectionPolicy === 'confirmed-depth' && finalLatestNumber - endBlock < confirmationDepth) {
  throw new Error('Snapshot lost its required confirmation depth during export');
}

const outputPath = resolve(outputArg || `docs/archive/xlayer-track-record-${endBlock}.json`);
const archive = {
  schema: 'bobby.xlayer.track-record.archive.v2',
  source: {
    chainId: CHAIN_ID,
    chain: 'X Layer',
    rpcProvider,
    contract: CONTRACT,
    contractCodeHash: keccak256(code),
    deploymentBlock,
  },
  snapshot: {
    blockNumber: endBlock,
    blockHash: snapshotBlock.hash,
    blockTimestamp: Number(BigInt(snapshotBlock.timestamp)),
    selectionPolicy,
    requiredConfirmations: selectionPolicy === 'confirmed-depth' ? confirmationDepth : null,
  },
  stats: {
    totalCommitments: toString(scalars.totalCommitments),
    totalTrades: toString(scalars.totalTrades),
    wins: toString(scalars.wins),
    losses: toString(scalars.losses),
    pendingCount: toString(scalars.pendingCount),
    totalPnlBps: toString(scalars.totalPnlBps),
    winRateBps: toString(scalars.getWinRate),
    decidedCount: (scalars.wins + scalars.losses).toString(),
    owner: scalars.owner,
    pendingOwner: scalars.pendingOwner,
    bobby: scalars.bobby,
    paused: scalars.paused,
    minCommitAgeSeconds: toString(scalars.minCommitAge),
    agents: agentStats,
  },
  commitments,
  trades,
  events,
  integrity: {
    algorithm: 'sha256',
    canonicalEncoding: 'UTF-8, two-space JSON indentation, LF newline',
    eventProvenance: includeEvents
      ? 'complete contract event sequence through snapshot block; IDs and counts validated'
      : 'not included; state arrays are complete but event provenance is absent',
  },
};

const json = `${JSON.stringify(archive, null, 2)}\n`;
const digest = createHash('sha256').update(json).digest('hex');

console.log(`X Layer TrackRecord @ block ${endBlock} (${snapshotBlock.hash})`);
console.log(`selection=${selectionPolicy}${selectionPolicy === 'confirmed-depth' ? ` confirmations>=${confirmationDepth}` : ''}`);
console.log(`blockReads=${typeof blockReference === 'string' ? 'number+canonical-recheck' : 'EIP-1898 blockHash'}`);
console.log(`commitments=${totalCommitments} trades=${totalTrades} events=${includeEvents ? events.length : 'skipped'}`);
console.log(`sha256=${digest}`);

if (verifyRequested) {
  if (expectedArchive.schema === archive.schema) {
    if (json !== expectedJson || digest !== expectedDigest) {
      throw new Error('Live regeneration does not byte-match the v2 archive');
    }
    console.log(`verified exact v2 archive and live state: ${verificationPath}`);
  } else {
    const expectedCanonical = JSON.stringify(canonicalState(expectedArchive));
    const actualCanonical = JSON.stringify(canonicalState(archive));
    if (expectedCanonical !== actualCanonical) {
      throw new Error('Live state does not match the legacy archive canonical content');
    }
    console.log(`verified legacy digest and live canonical state: ${verificationPath}`);
  }
} else if (!writeRequested) {
  console.log('Dry run only. Re-run with --write after reviewing the pinned block and totals.');
} else {
  writeArchiveAtomically(outputPath, json, digest);
  console.log(`wrote ${outputPath}`);
  console.log(`wrote ${outputPath}.sha256`);
}
