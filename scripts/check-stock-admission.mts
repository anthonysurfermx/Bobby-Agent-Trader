// Read-only admission evidence. Never signs, builds transactions or modifies the allow-list.
import { readFileSync, writeFileSync } from 'node:fs';
import { createPublicClient, http, fallback, parseAbi, formatUnits } from 'viem';
import { base, mainnet } from 'viem/chains';

const catalog = JSON.parse(readFileSync(new URL('../src/lib/base-swap/stock-candidates.json', import.meta.url), 'utf8'));
const clients = {
  8453: createPublicClient({ chain: base, transport: fallback(['https://base-rpc.publicnode.com', 'https://mainnet.base.org'].map(url => http(url, { timeout: 15000, retryCount: 1 }))) }),
  1: createPublicClient({ chain: mainnet, transport: http('https://ethereum-rpc.publicnode.com', { timeout: 15000, retryCount: 0 }) }),
};
const identityAbi = parseAbi(['function symbol() view returns (string)', 'function decimals() view returns (uint8)']);
const feedAbi = parseAbi(['function latestRoundData() view returns (uint80,int256,uint256,uint256,uint80)', 'function decimals() view returns (uint8)']);
const registryAbi = parseAbi(['function getOracleParams(address) view returns (uint256,bool)']);
const quoteAbi = parseAbi(['function quoteExactInputSingle((address tokenIn,address tokenOut,uint256 amountIn,uint24 fee,uint160 sqrtPriceLimitX96) params) view returns (uint256,uint160,uint32,uint256)']);
const factoryAbi = parseAbi(['function getPool(address,address,uint24) view returns (address)']);
const poolAbi = parseAbi(['function liquidity() view returns (uint128)']);
const usdc = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const report = { checkedAt: new Date().toISOString(), admission: 'NO-GO', tokens: [] as object[] };
const output = process.argv[2];
if (!output) throw new Error('Provide an output JSON path.');
for (const token of catalog.tokens) {
  const client = clients[token.chainId as keyof typeof clients];
  const evidence: Record<string, unknown> = { symbol: token.symbol, chainId: token.chainId, address: token.address, admission: 'pending-review' };
  try {
    const block = await client.getBlock();
    evidence.blockNumber = block.number.toString();
    evidence.blockHash = block.hash;
    const read = (address: any, abi: any, functionName: string, args?: any[]) => client.readContract({ address, abi, functionName, args, blockNumber: block.number } as any);
    const [symbol, decimals] = await Promise.all([read(token.address, identityAbi, 'symbol'), read(token.address, identityAbi, 'decimals')]);
    evidence.identityMatches = symbol === token.symbol && decimals === token.decimals;
    evidence.symbol = symbol;
    evidence.decimals = decimals;
    if (token.chainId === 8453) {
      const [round, feedDecimals, registry]: any[] = await Promise.all([
        read(token.referenceFeed, feedAbi, 'latestRoundData'), read(token.referenceFeed, feedAbi, 'decimals'),
        read('0x3f3E8cf41cdd3b1D118c16471aB0113DfDDd5CaD', registryAbi, 'getOracleParams', [token.address]),
      ]);
      evidence.oracle = { price: formatUnits(round[1], feedDecimals), ageSec: Number(block.timestamp - round[3]), complete: round[4] >= round[0], positive: round[1] > 0n, paused: registry[1], multiplier: String(registry[0]) };
      const quotes = [];
      const unavailableFees = [];
      const pools = [];
      for (const fee of [100, 500, 3000, 10000]) {
        try {
          const pool: any = await read('0x33128a8fC17869897dcE68Ed026d694621f6FDfD', factoryAbi, 'getPool', [usdc, token.address, fee]);
          if (pool === '0x0000000000000000000000000000000000000000') {
            pools.push({ fee, status: 'no-pool' });
            continue;
          }
          const liquidity = await read(pool, poolAbi, 'liquidity');
          pools.push({ fee, address: pool, activeLiquidityRaw: String(liquidity) });
          const buy: any = await read('0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a', quoteAbi, 'quoteExactInputSingle', [{ tokenIn: usdc, tokenOut: token.address, amountIn: 10_000_000n, fee, sqrtPriceLimitX96: 0n }]);
          const sell: any = await read('0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a', quoteAbi, 'quoteExactInputSingle', [{ tokenIn: token.address, tokenOut: usdc, amountIn: buy[0], fee, sqrtPriceLimitX96: 0n }]);
          quotes.push({ fee, buyOutRaw: String(buy[0]), sellOutUsdc: formatUnits(sell[0], 6) });
        } catch { unavailableFees.push(fee); }
      }
      evidence.tenUsdcRoundTripQuotes = quotes;
      evidence.pools = pools;
      evidence.unverifiedFeeTiers = unavailableFees;
      evidence.remainingGates = ['ticket-cap depth and impact', 'policy and transfer checks', 'issuer legal review', 'final-candidate web/API/iOS regression', 'independent release approval'];
    } else {
      evidence.remainingGates = ['issuer-specific oracle', 'eligible execution venue and liquidity', 'issuer-specific eligibility', 'chain adapter', 'web/API/iOS integration', 'independent release approval'];
    }
  } catch (error) {
    evidence.error = 'Read verification failed; no admission granted.';
    evidence.errorType = error instanceof Error ? error.name : 'UnknownError';
  }
  report.tokens.push(evidence);
  writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
  console.log(token.symbol, evidence.identityMatches === true ? 'identity verified' : 'unverified', JSON.stringify(evidence.tenUsdcRoundTripQuotes ?? []));
}
