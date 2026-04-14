const XLAYER_CHAIN_ID = '196';
const NATIVE_TOKEN_ADDRESS = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';

type XLayerToken = {
  symbol: string;
  name: string;
  address: string;
  decimals: number;
  isNative?: boolean;
};

const XLAYER_TOKENS: Record<string, XLayerToken> = {
  OKB: {
    symbol: 'OKB',
    name: 'OKB',
    address: NATIVE_TOKEN_ADDRESS,
    decimals: 18,
    isNative: true,
  },
  WOKB: {
    symbol: 'WOKB',
    name: 'Wrapped OKB',
    address: '0xe538905cf8410324e03A5A23C1c177a474D59b2b',
    decimals: 18,
  },
  USDC: {
    symbol: 'USDC',
    name: 'USD Coin',
    address: '0x74b7F16337b8972027F6196A17a631aC6dE26d22',
    decimals: 6,
  },
  USDT: {
    symbol: 'USDT',
    name: 'Tether USD',
    address: '0x1E4a5963aBFD975d8c9021ce480b42188849D41d',
    decimals: 6,
  },
  USDT0: {
    symbol: 'USDT0',
    name: 'USDT0 (LayerZero)',
    address: '0x779Ded0c9e1022225f8E0630b35a9b54bE713736',
    decimals: 6,
  },
  WETH: {
    symbol: 'WETH',
    name: 'Wrapped Ether',
    address: '0x5A77f1443D16ee5761d310e38b62f77f726bC71c',
    decimals: 18,
  },
  WBTC: {
    symbol: 'WBTC',
    name: 'Wrapped BTC',
    address: '0xEA034fb02eB1808C2cc3adbC15f447B93CbE08e1',
    decimals: 8,
  },
  DAI: {
    symbol: 'DAI',
    name: 'Dai Stablecoin',
    address: '0xC5015b9d9161Dca7e18e32f6f25C4aD850731Fd4',
    decimals: 18,
  },
};

const TOKENS_BY_ADDRESS = Object.fromEntries(
  Object.values(XLAYER_TOKENS).map((token) => [token.address.toLowerCase(), token]),
);

function scale(decimals: number): bigint {
  return BigInt(`1${'0'.repeat(decimals)}`);
}

function toBaseUnits(amount: string, decimals: number): string {
  const normalized = amount.trim();
  if (!/^\d+(\.\d+)?$/.test(normalized)) {
    throw new Error(`Invalid amount "${amount}"`);
  }

  const [whole, fraction = ''] = normalized.split('.');
  const paddedFraction = fraction.padEnd(decimals, '0').slice(0, decimals);
  return (BigInt(whole) * scale(decimals) + BigInt(paddedFraction || '0')).toString();
}

function resolveTokenReference(reference: unknown, fallback: XLayerToken): XLayerToken {
  if (!reference) return fallback;

  const raw = String(reference).trim();
  if (!raw) return fallback;

  const bySymbol = XLAYER_TOKENS[raw.toUpperCase()];
  if (bySymbol) return bySymbol;

  const byAddress = TOKENS_BY_ADDRESS[raw.toLowerCase()];
  if (byAddress) return byAddress;

  throw new Error(
    `Unsupported X Layer token "${raw}". Supported: ${Object.keys(XLAYER_TOKENS).join(', ')}`,
  );
}

export async function getUniswapCompatibleQuote(
  baseUrl: string,
  rawArgs: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const chainId = String(rawArgs.chainId || XLAYER_CHAIN_ID);
  if (chainId !== XLAYER_CHAIN_ID) {
    throw new Error(`bobby_uniswap_quote currently supports X Layer only (chainId ${XLAYER_CHAIN_ID})`);
  }

  const tradeType = String(rawArgs.tradeType || rawArgs.type || 'EXACT_INPUT').toUpperCase();
  if (tradeType !== 'EXACT_INPUT') {
    throw new Error('bobby_uniswap_quote currently supports EXACT_INPUT only');
  }

  const tokenIn = resolveTokenReference(rawArgs.tokenIn || rawArgs.from, XLAYER_TOKENS.OKB);
  const tokenOut = resolveTokenReference(rawArgs.tokenOut || rawArgs.to, XLAYER_TOKENS.USDT);
  const amountIn = String(rawArgs.amount || rawArgs.amountIn || '1');
  const amountInWei = toBaseUnits(amountIn, tokenIn.decimals);
  const slippageBps = Number(rawArgs.slippageBps || 50);

  const query = new URLSearchParams({
    chainId,
    fromToken: tokenIn.address,
    toToken: tokenOut.address,
    amount: amountInWei,
  });

  const response = await fetch(`${baseUrl}/api/dex-quote?${query.toString()}`);
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`DEX quote failed (${response.status}): ${detail.slice(0, 200)}`);
  }

  const payload = await response.json() as {
    ok?: boolean;
    quote?: {
      fromAmount?: number | string;
      toAmount?: number | string;
      effectivePrice?: number | string;
      estimateGasFee?: string;
      routes?: Array<{ percent?: string; path?: Array<{ dex?: string; from?: string; to?: string }> }>;
      dexComparison?: Array<{ dex?: string; receiveAmount?: number | string; fee?: string }>;
    } | null;
    msg?: string;
  };

  if (!payload.ok || !payload.quote) {
    throw new Error(payload.msg || 'No quote available for this pair');
  }

  const quote = payload.quote;

  return {
    provider: 'okx-onchainos',
    interface: 'uniswap-compatible',
    chainId,
    tradeType,
    quoteType: 'exactIn',
    tokenIn,
    tokenOut,
    amountIn,
    amountInWei,
    amountOut: quote.toAmount != null ? String(quote.toAmount) : null,
    executionPrice: quote.effectivePrice != null ? Number(quote.effectivePrice) : null,
    estimateGasFee: quote.estimateGasFee || null,
    slippageBps,
    route: (quote.routes || []).map((route) => ({
      percent: route.percent || null,
      hops: (route.path || []).map((hop) => ({
        dex: hop.dex || null,
        tokenIn: hop.from || null,
        tokenOut: hop.to || null,
      })),
    })),
    dexComparison: (quote.dexComparison || []).map((entry) => ({
      dex: entry.dex || null,
      amountOut: entry.receiveAmount != null ? String(entry.receiveAmount) : null,
      fee: entry.fee || null,
    })),
    raw: quote,
  };
}
