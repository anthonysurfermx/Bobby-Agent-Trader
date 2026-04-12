// GET /api/smart-money-leaderboard
// Aggregates OKX OnchainOS smart money data for Bobby pre-debate intelligence
// Params: chains (comma-sep chain IDs, default "196,1"), tokens (comma-sep, default "OKB,ETH,BTC"), limit (default 10)
// Returns: smart money leaderboard with wallet PnL, signal strength, and trading patterns

import type { VercelRequest, VercelResponse } from '@vercel/node';

export const config = { maxDuration: 30 };

const OKX_BASE = 'https://web3.okx.com';

// Token addresses on different chains for OKX API
const TOKEN_REGISTRY: Record<string, Record<string, string>> = {
  '196': { // X Layer
    OKB: '0x0000000000000000000000000000000000000000', // native
    USDT: '0x1E4a5963aBFD975d8c9021ce480b42188849D41d',
    WETH: '0x5a77f1443d16ee5761d310e38b7308399f0a7d3d',
  },
  '1': { // Ethereum
    ETH: '0x0000000000000000000000000000000000000000',
    WBTC: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599',
    USDT: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
  },
};

async function hmacSign(message: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(message));
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}

async function fetchOKXGet(path: string, apiKey: string, secretKey: string, passphrase: string, projectId: string) {
  const timestamp = new Date().toISOString();
  const signature = await hmacSign(timestamp + 'GET' + path, secretKey);
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
  if (!res.ok) return null;
  const json = await res.json() as { code: string; data: unknown };
  return json.code === '0' ? json.data : null;
}

async function fetchOKXPost(path: string, body: Record<string, string>, apiKey: string, secretKey: string, passphrase: string, projectId: string) {
  const timestamp = new Date().toISOString();
  const bodyStr = JSON.stringify(body);
  const signature = await hmacSign(timestamp + 'POST' + path + bodyStr, secretKey);
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
  if (!res.ok) return null;
  const json = await res.json() as { code: string; data: unknown };
  return json.code === '0' ? json.data : null;
}

interface SmartMoneyEntry {
  address: string;
  chain: string;
  walletType: string;
  tokenSymbol: string;
  amountUsd: number;
  triggerWalletCount: number;
  pnl: number | null;
  winRate: number | null;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { chains = '196,1', tokens = 'OKB,ETH', limit = '10' } = req.query;

  const apiKey = process.env.OKX_API_KEY;
  const secretKey = process.env.OKX_SECRET_KEY;
  const passphrase = process.env.OKX_PASSPHRASE;
  const projectId = process.env.OKX_PROJECT_ID;

  if (!apiKey || !secretKey || !passphrase || !projectId) {
    return res.status(500).json({ error: 'OKX credentials not configured' });
  }

  try {
    const chainList = String(chains).split(',').map(c => c.trim());
    const tokenList = String(tokens).split(',').map(t => t.trim().toUpperCase());
    const maxEntries = Math.min(parseInt(String(limit)) || 10, 50);

    // Phase 1: Fetch smart money signals for each chain
    const signalPromises = chainList.map(chain =>
      fetchOKXPost('/api/v6/dex/market/signal/list', {
        chainIndex: chain,
        walletType: '1,2,3',
        minAmountUsd: '5000',
      }, apiKey, secretKey, passphrase, projectId)
    );

    // Phase 2: Fetch top traders for tokens we care about
    const traderPromises: Promise<{ chain: string; token: string; data: unknown }>[] = [];
    for (const chain of chainList) {
      const registry = TOKEN_REGISTRY[chain];
      if (!registry) continue;
      for (const token of tokenList) {
        const addr = registry[token];
        if (!addr || addr === '0x0000000000000000000000000000000000000000') continue;
        const params = new URLSearchParams({
          chainIndex: chain,
          tokenContractAddress: addr,
          limit: '10',
        });
        traderPromises.push(
          fetchOKXGet(`/api/v5/dex/market/top-traders?${params}`, apiKey, secretKey, passphrase, projectId)
            .then(data => ({ chain, token, data }))
        );
      }
    }

    const [signalResults, traderResults] = await Promise.all([
      Promise.all(signalPromises),
      Promise.all(traderPromises),
    ]);

    // Process signals
    const entries: SmartMoneyEntry[] = [];
    const seenAddresses = new Set<string>();

    for (let i = 0; i < chainList.length; i++) {
      const data = signalResults[i];
      if (!Array.isArray(data)) continue;
      for (const s of data as Array<Record<string, unknown>>) {
        const token = s.token as Record<string, unknown> | undefined;
        const address = String(s.walletAddress || s.address || '');
        if (!address || seenAddresses.has(address.toLowerCase())) continue;
        seenAddresses.add(address.toLowerCase());

        entries.push({
          address,
          chain: chainList[i],
          walletType: s.walletType === '1' ? 'SmartMoney' : s.walletType === '2' ? 'KOL' : 'Whale',
          tokenSymbol: String(token?.symbol || 'UNKNOWN'),
          amountUsd: parseFloat(String(s.amountUsd || '0')),
          triggerWalletCount: parseInt(String(s.triggerWalletCount || '0')),
          pnl: null,
          winRate: null,
        });
      }
    }

    // Phase 3: Enrich top entries with wallet PnL (limit to top 5 to stay within rate limits)
    const topAddresses = entries.slice(0, 5);
    const pnlPromises = topAddresses.map(entry => {
      const params = new URLSearchParams({
        chainIndex: entry.chain,
        address: entry.address,
      });
      return fetchOKXGet(`/api/v5/dex/market/wallet-pnl?${params}`, apiKey, secretKey, passphrase, projectId)
        .then(data => ({ address: entry.address, data }))
        .catch(() => ({ address: entry.address, data: null }));
    });

    const pnlResults = await Promise.all(pnlPromises);
    for (const result of pnlResults) {
      if (!result.data) continue;
      const pnlData = Array.isArray(result.data) ? result.data[0] : result.data;
      if (!pnlData || typeof pnlData !== 'object') continue;
      const entry = entries.find(e => e.address === result.address);
      if (entry) {
        entry.pnl = parseFloat(String((pnlData as Record<string, unknown>).pnl || '0'));
        entry.winRate = parseFloat(String((pnlData as Record<string, unknown>).winRate || '0'));
      }
    }

    // Sort by amount and return
    entries.sort((a, b) => b.amountUsd - a.amountUsd);

    // Process top traders
    const topTraders: Array<{ chain: string; token: string; traders: unknown }> = [];
    for (const result of traderResults) {
      if (result.data) {
        topTraders.push({
          chain: result.chain,
          token: result.token,
          traders: Array.isArray(result.data) ? result.data.slice(0, 5) : result.data,
        });
      }
    }

    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=30');
    return res.status(200).json({
      ok: true,
      leaderboard: entries.slice(0, maxEntries),
      topTraders,
      meta: {
        chains: chainList,
        tokens: tokenList,
        totalSignals: entries.length,
        enrichedWithPnl: pnlResults.filter(r => r.data).length,
        fetchedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('[SmartMoneyLeaderboard] Error:', msg);
    return res.status(500).json({ error: msg });
  }
}
