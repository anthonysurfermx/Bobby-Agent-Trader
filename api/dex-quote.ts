// ============================================================
// GET /api/dex-quote
// Proxy for OKX DEX Aggregator V6 — returns best swap price
// Params: chainId, fromToken, toToken, amount
// ============================================================

import type { VercelRequest, VercelResponse } from '@vercel/node';

const OKX_BASE = 'https://web3.okx.com';

async function hmacSign(message: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(message));
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { chainId, fromToken, toToken, amount } = req.query;

  if (!chainId || !fromToken || !toToken || !amount) {
    return res.status(400).json({
      error: 'Missing params. Required: chainId, fromToken, toToken, amount',
    });
  }

  const apiKey = process.env.OKX_API_KEY;
  const secretKey = process.env.OKX_SECRET_KEY;
  const passphrase = process.env.OKX_PASSPHRASE;
  const projectId = process.env.OKX_PROJECT_ID;

  if (!apiKey || !secretKey || !passphrase || !projectId) {
    return res.status(500).json({
      error: 'OKX DEX credentials not configured',
      hint: 'Set OKX_API_KEY, OKX_SECRET_KEY, OKX_PASSPHRASE, OKX_PROJECT_ID in env',
    });
  }

  try {
    // V6 API uses chainIndex instead of chainId, and requires swapMode
    const queryParams: Record<string, string> = {
      chainIndex: String(chainId),
      fromTokenAddress: String(fromToken),
      toTokenAddress: String(toToken),
      amount: String(amount),
      swapMode: 'exactIn',
    };

    const requestPath = '/api/v6/dex/aggregator/quote';
    const queryString = '?' + new URLSearchParams(queryParams).toString();
    const timestamp = new Date().toISOString();

    const stringToSign = timestamp + 'GET' + requestPath + queryString;
    const signature = await hmacSign(stringToSign, secretKey);

    const url = `${OKX_BASE}${requestPath}${queryString}`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'OK-ACCESS-KEY': apiKey,
        'OK-ACCESS-SIGN': signature,
        'OK-ACCESS-TIMESTAMP': timestamp,
        'OK-ACCESS-PASSPHRASE': passphrase,
        'OK-ACCESS-PROJECT': projectId,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[DEX Quote] OKX Error:', response.status, errorText);
      return res.status(502).json({ error: 'OKX API error', status: response.status, detail: errorText });
    }

    const json = await response.json() as {
      code: string;
      msg: string;
      data: Array<{
        chainIndex: string;
        fromToken: { tokenSymbol: string; tokenUnitPrice: string; decimal: string; tokenContractAddress: string };
        toToken: { tokenSymbol: string; tokenUnitPrice: string; decimal: string; tokenContractAddress: string };
        fromTokenAmount: string;
        toTokenAmount: string;
        estimateGasFee: string;
        dexRouterList: Array<{
          router: string;
          routerPercent: string;
          subRouterList: Array<{
            dexRouter: Array<{
              dexName: string;
              fromToken: { tokenSymbol: string };
              toToken: { tokenSymbol: string };
            }>;
          }>;
        }>;
        quoteCompareList: Array<{
          dexName: string;
          dexLogo: string;
          tradeFee: string;
          receiveAmount: string;
        }>;
      }>;
    };

    if (json.code !== '0') {
      console.error('[DEX Quote] OKX API Error:', json.code, json.msg);
      return res.status(502).json({ error: 'OKX API error', code: json.code, msg: json.msg, detail: `OKX code ${json.code}: ${json.msg}` });
    }

    if (!json.data || json.data.length === 0) {
      return res.status(200).json({ ok: true, quote: null, msg: 'No quote available for this pair' });
    }

    const q = json.data[0];

    // Parse amounts to human-readable
    const fromDecimals = parseInt(q.fromToken.decimal);
    const toDecimals = parseInt(q.toToken.decimal);
    const fromAmount = parseFloat(q.fromTokenAmount) / (10 ** fromDecimals);
    const toAmount = parseFloat(q.toTokenAmount) / (10 ** toDecimals);
    const fromUnitPrice = parseFloat(q.fromToken.tokenUnitPrice) || 0;
    const toUnitPrice = parseFloat(q.toToken.tokenUnitPrice) || 0;

    // Effective price: how much fromToken per toToken (e.g. USDC per WBTC)
    const effectivePrice = toAmount > 0 ? fromAmount / toAmount : 0;

    // DEX comparison: which DEX gives the best rate
    const dexComparison = (q.quoteCompareList || []).map(d => ({
      dex: d.dexName,
      logo: d.dexLogo,
      receiveAmount: parseFloat(d.receiveAmount) / (10 ** toDecimals),
      fee: d.tradeFee,
    }));

    // Route breakdown (V6 uses dexRouterList instead of routerList)
    const routes = (q.dexRouterList || []).map(r => ({
      percent: r.routerPercent,
      path: (r.subRouterList || []).flatMap(sr =>
        (sr.dexRouter || []).map(d => ({
          dex: d.dexName,
          from: d.fromToken.tokenSymbol,
          to: d.toToken.tokenSymbol,
        }))
      ),
    }));

    // Cache 15 seconds
    res.setHeader('Cache-Control', 's-maxage=15, stale-while-revalidate=10');

    return res.status(200).json({
      ok: true,
      quote: {
        chainId: q.chainIndex,
        fromToken: q.fromToken.tokenSymbol,
        toToken: q.toToken.tokenSymbol,
        fromAmount,
        toAmount,
        fromUnitPrice,
        toUnitPrice,
        effectivePrice,
        estimateGasFee: q.estimateGasFee,
        routes,
        dexComparison,
      },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('[DEX Quote] Error:', msg);
    return res.status(500).json({ error: msg });
  }
}
