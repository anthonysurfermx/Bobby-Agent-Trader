// Read-only quote/depth evidence. No recipient, approval, signing or transaction building.
import { readFileSync, writeFileSync } from 'node:fs';
import { createPublicClient, fallback, http, parseAbi, formatUnits, type Address } from 'viem';
import { base } from 'viem/chains';
import { evaluateStockReference } from '../api/_lib/base-swap.js';

const [inventoryPath, output] = process.argv.slice(2);
if (!inventoryPath || !output) throw new Error('Provide pool inventory and output JSON paths.');
const inventory = JSON.parse(readFileSync(inventoryPath, 'utf8'));
const catalog = JSON.parse(readFileSync(new URL('../src/lib/base-swap/stock-candidates.json', import.meta.url), 'utf8'));
const factory = '0xf8f2eB4940CFE7d13603DDDD87f123820Fc061Ef' as const;
const quoter = '0x514c8B5f54112481E28028F1166Bd78501089259' as const;
const usdc = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as const;
const client = createPublicClient({ chain: base, transport: fallback([
  http('https://base-rpc.publicnode.com', { timeout: 15000, retryCount: 1 }),
  http('https://mainnet.base.org', { timeout: 15000, retryCount: 1 }),
]) });
const block = await client.getBlock();
const quoterAbi = parseAbi([
  'function factory() view returns (address)',
  'function quoteExactInputSingle((address tokenIn,address tokenOut,uint256 amountIn,int24 tickSpacing,uint160 sqrtPriceLimitX96) params) view returns (uint256,uint160,uint32,uint256)',
]);
const poolAbi = parseAbi(['function liquidity() view returns (uint128)', 'function token0() view returns (address)', 'function token1() view returns (address)', 'function tickSpacing() view returns (int24)', 'function slot0() view returns (uint160,int24,uint16,uint16,uint16,bool)']);
const factoryAbi = parseAbi(['function getPool(address,address,int24) view returns (address)']);
const b20Abi = parseAbi(['function symbol() view returns (string)', 'function decimals() view returns (uint8)', 'function multiplier() view returns (uint256)', 'function isPaused(uint8) view returns (bool)', 'function totalSupply() view returns (uint256)']);
const feedAbi = parseAbi(['function decimals() view returns (uint8)', 'function latestRoundData() view returns (uint80,int256,uint256,uint256,uint80)']);
const registryAbi = parseAbi(['function getOracleParams(address) view returns (uint256,bool)']);
const actualFactory = await client.readContract({ address: quoter, abi: quoterAbi, functionName: 'factory', blockNumber: block.number });
if (actualFactory.toLowerCase() !== factory.toLowerCase()) throw new Error('Quoter factory mismatch.');
const report = { status: 'READ_ONLY_NOT_ADMITTED', checkedAt: new Date().toISOString(), chainId: 8453, blockNumber: String(block.number), blockHash: block.hash, factory, quoter, pools: [] as Array<Record<string, unknown>> };
const pools = inventory.factories.find((f: { address: string }) => f.address.toLowerCase() === factory.toLowerCase())?.pools.filter((p: { status: string }) => p.status === 'pool-found') ?? [];
for (const pool of pools) {
  const token = catalog.tokens.find((t: { symbol: string; chainId: number }) => t.symbol === pool.symbol && t.chainId === 8453);
  if (!token) throw new Error('Pool inventory contains a stock outside the catalog.');
  const row: Record<string, unknown> = { symbol: pool.symbol, address: pool.address, tickSpacing: pool.variant, quotes: [] };
  try {
    const metadata = await client.multicall({ blockNumber: block.number, allowFailure: false, contracts: [
      { address: token.address, abi: b20Abi, functionName: 'symbol' },
      { address: token.address, abi: b20Abi, functionName: 'decimals' },
      { address: token.address, abi: b20Abi, functionName: 'multiplier' },
      { address: token.address, abi: b20Abi, functionName: 'isPaused', args: [0] },
      { address: token.address, abi: b20Abi, functionName: 'totalSupply' },
      { address: token.referenceFeed, abi: feedAbi, functionName: 'decimals' },
      { address: token.referenceFeed, abi: feedAbi, functionName: 'latestRoundData' },
      { address: '0x3f3E8cf41cdd3b1D118c16471aB0113DfDDd5CaD', abi: registryAbi, functionName: 'getOracleParams', args: [token.address] },
    ] });
    const [symbol, decimals, multiplier, transferPaused, supply, feedDecimals, round, params] = metadata;
    if (symbol !== token.symbol || decimals !== token.decimals || supply <= 0n) throw new Error('Stock identity or supply mismatch.');
    const usdPrice = Number(formatUnits(round[1], feedDecimals));
    const ageSec = Number(block.timestamp - round[3]);
    const verdict = evaluateStockReference({ ageSec, issuerPaused: params[1], registryMultiplier: String(params[0]), multiplier: String(multiplier), roundComplete: round[4] >= round[0], answerPositive: round[1] > 0n });
    row.reference = { usdPrice, ageSec, status: verdict.status, usable: verdict.usable, transferPaused, issuerPaused: params[1], tokenMultiplier: String(multiplier), registryMultiplier: String(params[0]) };
    const registered = await client.readContract({ address: factory, abi: factoryAbi, functionName: 'getPool', args: [usdc, token.address, pool.variant], blockNumber: block.number });
    if (registered.toLowerCase() !== pool.address.toLowerCase()) throw new Error('Pool is not registered for this pair.');
    const read = (functionName: 'liquidity' | 'token0' | 'token1' | 'tickSpacing' | 'slot0') => client.readContract({ address: registered, abi: poolAbi, functionName, blockNumber: block.number });
    const [liquidity, token0, token1, spacing, slot] = await Promise.all([read('liquidity'), read('token0'), read('token1'), read('tickSpacing'), read('slot0')]);
    if (spacing !== pool.variant || ![token0, token1].map(String).map(t => t.toLowerCase()).includes(token.address.toLowerCase()) || ![token0, token1].map(String).map(t => t.toLowerCase()).includes(usdc.toLowerCase())) throw new Error('Pool identity mismatch.');
    row.activeLiquidityRaw = String(liquidity);
    const rawRatio = (Number((slot as readonly unknown[])[0]) / 2 ** 96) ** 2;
    const buyMid = (String(token0).toLowerCase() === usdc.toLowerCase() ? rawRatio : 1 / rawRatio) * 10 ** (6 - token.decimals);
    for (const dollars of [10, 100]) {
      try {
        const quote = (tokenIn: Address, tokenOut: Address, amountIn: bigint) => client.readContract({ address: quoter, abi: quoterAbi, functionName: 'quoteExactInputSingle', args: [{ tokenIn, tokenOut, amountIn, tickSpacing: pool.variant, sqrtPriceLimitX96: 0n }], blockNumber: block.number });
        const buy = await quote(usdc, token.address, BigInt(dollars) * 1_000_000n);
        const sell = await quote(token.address, usdc, buy[0]);
        const stockOut = Number(formatUnits(buy[0], token.decimals));
        const usdcOut = Number(formatUnits(sell[0], 6));
        (row.quotes as object[]).push({ inputUsdc: dollars, stockOutRaw: String(buy[0]), independentSellUsdc: usdcOut, buyImpactPct: (1 - stockOut / dollars / buyMid) * 100, sellImpactPct: (1 - usdcOut / stockOut * buyMid) * 100, buyReferenceDeviationPct: Math.abs(dollars / stockOut / usdPrice - 1) * 100, sellReferenceDeviationPct: Math.abs(usdcOut / stockOut / usdPrice - 1) * 100 });
      } catch { (row.quotes as object[]).push({ inputUsdc: dollars, status: 'quote-unavailable' }); }
    }
  } catch { row.status = 'unverified'; }
  report.pools.push(row);
  writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
  console.log(pool.symbol, pool.variant, JSON.stringify(row.quotes));
}
