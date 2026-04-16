// ============================================================
// GET /api/okx-signal
// Proxy for OKX OnchainOS dex-signal — Smart Money / Whale / KOL buy signals
// Params: chains (comma-sep), walletType (1=SmartMoney,2=KOL,3=Whale), minAmountUsd
// Returns: real-time on-chain buy signals from tracked wallets
// ============================================================

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { hmacSign } from './_lib/okx-hmac';

const OKX_BASE = 'https://web3.okx.com';

async function fetchOKXSignal(
  path: string,
  body: Record<string, string>,
  apiKey: string,
  secretKey: string,
  passphrase: string,
  projectId: string,
) {
  const timestamp = new Date().toISOString();
  const bodyStr = JSON.stringify(body);
  const stringToSign = timestamp + 'POST' + path + bodyStr;
  const signature = await hmacSign(stringToSign, secretKey);

  const res = await fetch(`${OKX_BASE}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'OK-ACCESS-KEY': apiKey,
      'OK-ACCESS-SIGN': signature,
      'OK-ACCESS-TIMESTAMP': timestamp,
      'OK-ACCESS-PASSPHRASE': passphrase,
      'OK-ACCESS-PROJECT': projectId,
    },
    body: bodyStr,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OKX ${res.status}: ${text}`);
  }

  const json = await res.json() as { code: string; msg: string; data: unknown };
  if (json.code !== '0') throw new Error(`OKX code ${json.code}: ${json.msg}`);
  return json.data;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const {
    chains = '1,501',        // Ethereum + Solana by default
    walletType = '1,2,3',    // All: Smart Money, KOL, Whale
    minAmountUsd = '5000',
  } = req.query;

  const apiKey = process.env.OKX_API_KEY;
  const secretKey = process.env.OKX_SECRET_KEY;
  const passphrase = process.env.OKX_PASSPHRASE;
  const projectId = process.env.OKX_PROJECT_ID;

  if (!apiKey || !secretKey || !passphrase || !projectId) {
    return res.status(500).json({ error: 'OKX credentials not configured' });
  }

  try {
    // Fetch signals for each chain in parallel
    const chainList = String(chains).split(',').map(c => c.trim());

    const allSignals = await Promise.all(
      chainList.map(async (chainIndex) => {
        try {
          const body: Record<string, string> = {
            chainIndex,
            walletType: String(walletType),
            minAmountUsd: String(minAmountUsd),
          };

          const data = await fetchOKXSignal(
            '/api/v6/dex/market/signal/list',
            body,
            apiKey,
            secretKey,
            passphrase,
            projectId,
          );

          return { chainIndex, signals: data, error: null };
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Unknown error';
          console.error(`[OKX Signal] Chain ${chainIndex} error:`, msg);
          return { chainIndex, signals: [], error: msg };
        }
      })
    );

    // Flatten and normalize signals
    const signals: Array<{
      chain: string;
      tokenSymbol: string;
      tokenAddress: string;
      walletType: string;
      amountUsd: number;
      triggerWalletCount: number;
      soldRatioPct: number;
      marketCapUsd: number;
      timestamp: string;
    }> = [];

    for (const result of allSignals) {
      if (!result.signals || result.error) continue;
      const arr = Array.isArray(result.signals) ? result.signals : [];

      for (const s of arr as Array<Record<string, unknown>>) {
        const token = s.token as Record<string, unknown> | undefined;
        signals.push({
          chain: result.chainIndex,
          tokenSymbol: String(token?.symbol || token?.tokenSymbol || 'UNKNOWN'),
          tokenAddress: String(token?.tokenAddress || token?.tokenContractAddress || ''),
          walletType: String(s.walletType || ''),
          amountUsd: parseFloat(String(s.amountUsd || '0')),
          triggerWalletCount: parseInt(String(s.triggerWalletCount || '0')),
          soldRatioPct: parseFloat(String(s.soldRatioPercent || s.soldRatioPct || '0')),
          marketCapUsd: parseFloat(String(token?.marketCapUsd || '0')),
          timestamp: String(s.timestamp || new Date().toISOString()),
        });
      }
    }

    // Sort by amount descending
    signals.sort((a, b) => b.amountUsd - a.amountUsd);

    res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=15');
    return res.status(200).json({
      ok: true,
      signals,
      meta: {
        chains: chainList,
        walletType: String(walletType),
        minAmountUsd: String(minAmountUsd),
        totalSignals: signals.length,
        fetchedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('[OKX Signal] Error:', msg);
    return res.status(500).json({ error: msg });
  }
}
