// Inventory published Aerodrome factories at one block; this grants no admission.
import { readFileSync, writeFileSync } from 'node:fs';
import { createPublicClient, fallback, http, parseAbi, zeroAddress, type Address } from 'viem';
import { base } from 'viem/chains';

const output = process.argv[2];
if (!output) throw new Error('Provide an evidence JSON path.');
const catalog = JSON.parse(readFileSync(new URL('../src/lib/base-swap/stock-candidates.json', import.meta.url), 'utf8'));
const stocks = catalog.tokens.filter((token: { chainId: number }) => token.chainId === 8453) as Array<{ symbol: string; address: Address }>;
const client = createPublicClient({ chain: base, transport: fallback([
  http('https://base-rpc.publicnode.com', { timeout: 15000, retryCount: 1 }),
  http('https://mainnet.base.org', { timeout: 15000, retryCount: 1 }),
]) });
const block = await client.getBlock();
const usdc = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as const;
const factories: Array<{ name: string; address: Address; kind: 'cl' | 'v2' }> = [
  { name: 'Initial Slipstream', address: '0x5e7BB104d84c7CB9B682AaC2F3d509f5F406809A', kind: 'cl' },
  { name: 'Gauge Caps Slipstream', address: '0xaDe65c38CD4849aDBA595a4323a8C7DdfE89716a', kind: 'cl' },
  { name: 'Gauges V3 Slipstream', address: '0xf8f2eB4940CFE7d13603DDDD87f123820Fc061Ef', kind: 'cl' },
  { name: 'Aerodrome V2', address: '0x420DD381b31aEf6683db6B902084cB0FFECe40Da', kind: 'v2' },
];
const cl = parseAbi(['function tickSpacings() view returns (int24[])', 'function getPool(address,address,int24) view returns (address)']);
const v2 = parseAbi(['function getPool(address,address,bool) view returns (address)']);
const report = {
  checkedAt: new Date().toISOString(), chainId: 8453, blockNumber: String(block.number), blockHash: block.hash,
  status: 'READ_ONLY_NOT_ADMITTED', pairScope: 'Direct USDC only; no claim about other pairs or venues.',
  sources: ['https://github.com/aerodrome-finance/slipstream/blob/main/README.md', 'https://github.com/aerodrome-finance/contracts/blob/main/README.md'],
  factories: [] as Array<Record<string, unknown>>,
};
for (const factory of factories) {
  const evidence: Record<string, unknown> = { ...factory };
  try {
    const variants = factory.kind === 'cl'
      ? await client.readContract({ address: factory.address, abi: cl, functionName: 'tickSpacings', blockNumber: block.number })
      : [false, true];
    const rows = stocks.flatMap(stock => variants.map(variant => ({ stock, variant })));
    const results = await client.multicall({ blockNumber: block.number, contracts: rows.map(({ stock, variant }) => factory.kind === 'cl'
      ? { address: factory.address, abi: cl, functionName: 'getPool', args: [usdc, stock.address, variant as number] }
      : { address: factory.address, abi: v2, functionName: 'getPool', args: [usdc, stock.address, variant as boolean] }) });
    evidence.variants = variants;
    evidence.pools = results.map((result, i) => ({
      symbol: rows[i].stock.symbol, variant: rows[i].variant,
      ...(result.status === 'success'
        ? { status: result.result === zeroAddress ? 'no-pool' : 'pool-found', address: result.result }
        : { status: 'unverified' }),
    }));
  } catch {
    evidence.status = 'unverified';
  }
  report.factories.push(evidence);
  writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
  const pools = (evidence.pools ?? []) as Array<{ status: string; symbol: string }>;
  console.log(factory.name, JSON.stringify({ found: pools.filter(p => p.status === 'pool-found').map(p => p.symbol), unverified: pools.filter(p => p.status === 'unverified').length, status: evidence.status ?? 'read-complete' }));
}
