// ============================================================
// GET /api/okx-onchain
// Proxy for OKX Web3 OnchainOS data — token holders, top traders
// Params: action (holders|traders|trending|token-info), chainIndex, tokenAddress
// Uses same OKX API keys as DEX aggregator
// ============================================================

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { hmacSign } from './_lib/okx-hmac';

const OKX_BASE = 'https://web3.okx.com';

async function fetchOKXWeb3(path: string, apiKey: string, secretKey: string, passphrase: string, projectId: string) {
  const timestamp = new Date().toISOString();
  const stringToSign = timestamp + 'GET' + path;
  const signature = await hmacSign(stringToSign, secretKey);

  const res = await fetch(`${OKX_BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      'OK-ACCESS-KEY': apiKey,
      'OK-ACCESS-SIGN': signature,
      'OK-ACCESS-TIMESTAMP': timestamp,
      'OK-ACCESS-PASSPHRASE': passphrase,
      'OK-ACCESS-PROJECT': projectId,
    },
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

  const { action, chainIndex = '1', tokenAddress, limit = '20' } = req.query;

  const apiKey = process.env.OKX_API_KEY;
  const secretKey = process.env.OKX_SECRET_KEY;
  const passphrase = process.env.OKX_PASSPHRASE;
  const projectId = process.env.OKX_PROJECT_ID;

  if (!apiKey || !secretKey || !passphrase || !projectId) {
    return res.status(500).json({ error: 'OKX credentials not configured' });
  }

  try {
    let data: unknown;

    switch (action) {
      case 'holders': {
        // Top token holders
        if (!tokenAddress) return res.status(400).json({ error: 'tokenAddress required' });
        const params = new URLSearchParams({
          chainIndex: String(chainIndex),
          tokenContractAddress: String(tokenAddress),
          limit: String(limit),
        });
        data = await fetchOKXWeb3(
          `/api/v5/dex/market/token-holders?${params}`,
          apiKey, secretKey, passphrase, projectId
        );
        break;
      }

      case 'traders': {
        // Top traders for a token
        if (!tokenAddress) return res.status(400).json({ error: 'tokenAddress required' });
        const params = new URLSearchParams({
          chainIndex: String(chainIndex),
          tokenContractAddress: String(tokenAddress),
          limit: String(limit),
        });
        data = await fetchOKXWeb3(
          `/api/v5/dex/market/top-traders?${params}`,
          apiKey, secretKey, passphrase, projectId
        );
        break;
      }

      case 'trending': {
        // Hot/trending tokens
        const params = new URLSearchParams({
          chainIndex: String(chainIndex),
        });
        data = await fetchOKXWeb3(
          `/api/v5/dex/market/hot-token?${params}`,
          apiKey, secretKey, passphrase, projectId
        );
        break;
      }

      case 'token-info': {
        // Token metadata + market data
        if (!tokenAddress) return res.status(400).json({ error: 'tokenAddress required' });
        const params = new URLSearchParams({
          chainIndex: String(chainIndex),
          tokenContractAddress: String(tokenAddress),
        });
        data = await fetchOKXWeb3(
          `/api/v5/dex/market/token-detail?${params}`,
          apiKey, secretKey, passphrase, projectId
        );
        break;
      }

      case 'wallet-pnl': {
        // Wallet PnL analysis
        const { address } = req.query;
        if (!address) return res.status(400).json({ error: 'address required' });
        const params = new URLSearchParams({
          chainIndex: String(chainIndex),
          address: String(address),
        });
        data = await fetchOKXWeb3(
          `/api/v5/dex/market/wallet-pnl?${params}`,
          apiKey, secretKey, passphrase, projectId
        );
        break;
      }

      default:
        return res.status(400).json({
          error: 'Invalid action. Use: holders, traders, trending, token-info, wallet-pnl',
        });
    }

    // Cache 60 seconds
    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=30');
    return res.status(200).json({ ok: true, data });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('[OKX OnchainOS] Error:', msg);
    return res.status(500).json({ error: msg });
  }
}
