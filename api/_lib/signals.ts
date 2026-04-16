// ============================================================
// signals — shared OKX DEX whale-signal collector + deterministic filter.
// Previously duplicated in api/agent-run.ts and api/bobby-intel.ts with
// only two meaningful differences (timestamp stamping, log prefix). This
// module is the single source of truth.
//
// Scope limited to signal ingest + filter. LLM debate, risk gate, and
// execution stay in their caller files.
// ============================================================

export interface RawSignal {
  source: string;
  chain: string;
  tokenSymbol: string;
  tokenAddress: string;
  signalType: string;
  amountUsd: number;
  triggerWalletCount?: number;
  soldRatioPct?: number;
  marketCapUsd?: number;
  timestamp?: number;
  confidence?: number;
  metadata?: Record<string, unknown>;
}

export interface FilteredSignal extends RawSignal {
  filterScore: number;
  reasons: string[];
}

export interface CollectOptions {
  /** Stamp each signal with Date.now() when ingested (used for signal-age latency). */
  stampTimestamp?: boolean;
  /** Prefix for console.error on per-chain failures. */
  logPrefix?: string;
}

async function hmacSign(message: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(message));
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}

const CHAINS = ['1', '501', '8453']; // ETH, SOL, Base

/**
 * Collect whale DEX signals from OKX OnchainOS across ETH, SOL, Base in parallel.
 * Returns empty array if credentials are missing. Per-chain failures are logged
 * and skipped; they never fail the aggregate call.
 */
export async function collectDexSignals(options: CollectOptions = {}): Promise<RawSignal[]> {
  const apiKey = process.env.OKX_API_KEY;
  const secretKey = process.env.OKX_SECRET_KEY;
  const passphrase = process.env.OKX_PASSPHRASE;
  const projectId = process.env.OKX_PROJECT_ID;

  if (!apiKey || !secretKey || !passphrase || !projectId) return [];

  const logPrefix = options.logPrefix || '[Signals]';
  const now = options.stampTimestamp ? Date.now() : undefined;

  const fetchChain = async (chainIndex: string): Promise<RawSignal[]> => {
    const path = '/api/v6/dex/market/signal/list';
    const body = JSON.stringify({ chainIndex, walletType: '1,2,3', minAmountUsd: '5000' });
    const timestamp = new Date().toISOString();
    const signature = await hmacSign(timestamp + 'POST' + path + body, secretKey);

    const res = await fetch(`https://web3.okx.com${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'OK-ACCESS-KEY': apiKey,
        'OK-ACCESS-SIGN': signature,
        'OK-ACCESS-TIMESTAMP': timestamp,
        'OK-ACCESS-PASSPHRASE': passphrase,
        'OK-ACCESS-PROJECT': projectId,
      },
      body,
    });

    if (!res.ok) return [];
    const json = (await res.json()) as { code: string; data: unknown };
    if (json.code !== '0' || !Array.isArray(json.data)) return [];

    const out: RawSignal[] = [];
    for (const s of json.data as Array<Record<string, unknown>>) {
      const token = s.token as Record<string, unknown> | undefined;
      const sig: RawSignal = {
        source: 'okx_dex_signal',
        chain: chainIndex,
        tokenSymbol: String(token?.symbol || 'UNKNOWN'),
        tokenAddress: String(token?.tokenAddress || ''),
        signalType: String(s.walletType || ''),
        amountUsd: parseFloat(String(s.amountUsd || '0')),
        triggerWalletCount: parseInt(String(s.triggerWalletCount || '0')),
        soldRatioPct: parseFloat(String(s.soldRatioPercent || '0')),
        marketCapUsd: parseFloat(String(token?.marketCapUsd || '0')),
      };
      if (now !== undefined) sig.timestamp = now;
      out.push(sig);
    }
    return out;
  };

  const results = await Promise.allSettled(CHAINS.map(fetchChain));
  const signals: RawSignal[] = [];
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') {
      signals.push(...r.value);
    } else {
      console.error(`${logPrefix} Chain ${CHAINS[i]} signal error:`, r.reason);
    }
  });

  return signals;
}

/**
 * Deterministic filter + score. Keeps the original gate:
 *   - drop if amountUsd < $5K
 *   - drop if soldRatioPct > 70% (already being dumped)
 *   - drop if marketCapUsd < $100K (too small to trust)
 *   - drop if final score < 20
 * Sorted by score descending, top 10 returned.
 */
export function filterSignals(signals: RawSignal[]): FilteredSignal[] {
  const filtered: FilteredSignal[] = [];

  for (const signal of signals) {
    const reasons: string[] = [];
    let score = 0;

    if (signal.source === 'okx_dex_signal') {
      if (signal.amountUsd < 5000) continue;

      const wallets = signal.triggerWalletCount || 0;
      if (wallets >= 3) { score += 30; reasons.push(`${wallets} wallets`); }
      else if (wallets >= 2) { score += 15; reasons.push(`${wallets} wallets`); }
      else score += 5;

      const sold = signal.soldRatioPct || 0;
      if (sold < 10) { score += 25; reasons.push(`Only ${sold}% sold`); }
      else if (sold < 30) { score += 15; }
      else if (sold > 70) continue;

      if (signal.amountUsd > 100000) { score += 20; reasons.push(`$${(signal.amountUsd / 1000).toFixed(0)}K`); }
      else if (signal.amountUsd > 25000) { score += 10; }

      if (signal.signalType === '1') { score += 10; reasons.push('Smart Money'); }
      else if (signal.signalType === '3') { score += 8; reasons.push('Whale'); }
      else if (signal.signalType === '2') { score += 5; reasons.push('KOL'); }

      if (signal.marketCapUsd && signal.marketCapUsd < 100000) continue;
    }

    if (score < 20) continue;
    filtered.push({ ...signal, filterScore: Math.min(100, score), reasons });
  }

  filtered.sort((a, b) => b.filterScore - a.filterScore);
  return filtered.slice(0, 10);
}
