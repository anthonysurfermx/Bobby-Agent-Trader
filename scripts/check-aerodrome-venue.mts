// Read-only deployment verification; does not simulate or submit transactions.
import { writeFileSync } from 'node:fs';
import { createPublicClient, fallback, http, keccak256, parseAbi } from 'viem';
import { base } from 'viem/chains';
import { AERODROME_BASE } from '../src/lib/base-swap/aerodrome-codec.js';
import { BASE_WETH } from '../src/lib/base-swap/tokens.js';

const output = process.argv[2];
if (!output) throw new Error('Provide an output JSON path.');
const client = createPublicClient({ chain: base, transport: fallback([
  http('https://base-rpc.publicnode.com', { timeout: 15000, retryCount: 1 }),
  http('https://mainnet.base.org', { timeout: 15000, retryCount: 1 }),
]) });
if (await client.getChainId() !== AERODROME_BASE.chainId) throw new Error('Wrong chain.');
const block = await client.getBlock();
const abi = parseAbi(['function factory() view returns (address)', 'function WETH9() view returns (address)']);
const deployments = await Promise.all((['factory', 'router', 'quoter'] as const).map(async role => {
  const address = AERODROME_BASE[role];
  const code = await client.getCode({ address, blockNumber: block.number });
  if (!code || code === '0x') throw new Error(`${role} has no code.`);
  return { role, address, runtimeCodeHash: keccak256(code) };
}));
const [routerFactory, quoterFactory, wrappedNative, spacings] = await Promise.all([
  client.readContract({ address: AERODROME_BASE.router, abi, functionName: 'factory', blockNumber: block.number }),
  client.readContract({ address: AERODROME_BASE.quoter, abi, functionName: 'factory', blockNumber: block.number }),
  client.readContract({ address: AERODROME_BASE.router, abi, functionName: 'WETH9', blockNumber: block.number }),
  client.readContract({ address: AERODROME_BASE.factory, abi: parseAbi(['function tickSpacings() view returns (int24[])']), functionName: 'tickSpacings', blockNumber: block.number }),
]);
for (const factory of [routerFactory, quoterFactory]) {
  if (factory.toLowerCase() !== AERODROME_BASE.factory.toLowerCase()) throw new Error('Factory mismatch.');
}
if (wrappedNative.toLowerCase() !== BASE_WETH.toLowerCase()) throw new Error('Wrapped native token mismatch.');
if (!spacings.includes(AERODROME_BASE.tickSpacing)) throw new Error('Required tick spacing unavailable.');
writeFileSync(output, JSON.stringify({
  status: 'DEPLOYMENT_VERIFIED_NOT_EXECUTION_ADMISSION', checkedAt: new Date().toISOString(),
  chainId: AERODROME_BASE.chainId, blockNumber: String(block.number), blockHash: block.hash,
  deployments, routerFactory, quoterFactory, wrappedNative, tickSpacings: spacings,
}, null, 2) + '\n');
console.log(`Router and quoter factory, wrapped native token and tick spacing verified at Base block ${block.number}.`);
