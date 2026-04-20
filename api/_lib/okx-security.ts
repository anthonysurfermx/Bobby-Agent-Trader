// ============================================================
// okx-security — token risk check via OKX OnchainOS security API.
// Pre-trade gate: blocks tokens flagged as honeypot / rugpull / blacklisted
// / high-tax before the Red Team agent even sees them. Deterministic, cheap,
// and faster than an LLM round-trip.
//
// Docs: https://web3.okx.com/onchainos/dev-docs (okx-security skill, v2.2.9)
// ============================================================

import { hmacSign } from './okx-hmac';

export interface TokenRiskVerdict {
  chainIndex: string;
  tokenAddress: string;
  /** true if the token is SAFE to trade (no blocking flags). */
  safe: boolean;
  /** Raw risk labels returned by OKX (e.g. 'honeypot', 'blacklist', 'high_tax'). */
  flags: string[];
  /** Buy tax as a decimal, e.g. 0.05 = 5%. 0 if unknown. */
  buyTax: number;
  /** Sell tax as a decimal. 0 if unknown. */
  sellTax: number;
  /** Raw verdict from OKX: 'safe' | 'risky' | 'unknown'. */
  raw: string;
}

const BLOCKING_FLAGS = new Set([
  'honeypot',
  'blacklist',
  'is_blacklisted',
  'rugpull',
  'mint_function',
  'self_destruct',
  'proxy_contract',
  'hidden_owner',
]);

const MAX_TAX_ALLOWED = 0.10; // 10% buy/sell tax — anything above is a trap.

/**
 * Check a single token via OKX OnchainOS security endpoint.
 * Returns a permissive verdict (safe=true, raw='unknown') if credentials are missing
 * or the endpoint errors — the Red Team agent is still the final adversarial check.
 */
export async function checkTokenRisk(
  chainIndex: string,
  tokenAddress: string,
): Promise<TokenRiskVerdict> {
  const apiKey = process.env.OKX_API_KEY;
  const secretKey = process.env.OKX_SECRET_KEY;
  const passphrase = process.env.OKX_PASSPHRASE;
  const projectId = process.env.OKX_PROJECT_ID;

  const fallback: TokenRiskVerdict = {
    chainIndex, tokenAddress, safe: true, flags: [], buyTax: 0, sellTax: 0, raw: 'unknown',
  };

  if (!apiKey || !secretKey || !passphrase || !projectId) return fallback;
  if (!tokenAddress) return fallback;

  try {
    const path = `/api/v6/dex/security/token/detection?chainIndex=${chainIndex}&tokenContractAddress=${tokenAddress}`;
    const timestamp = new Date().toISOString();
    const signature = await hmacSign(timestamp + 'GET' + path, secretKey);

    const res = await fetch(`https://web3.okx.com${path}`, {
      method: 'GET',
      headers: {
        'OK-ACCESS-KEY': apiKey,
        'OK-ACCESS-SIGN': signature,
        'OK-ACCESS-TIMESTAMP': timestamp,
        'OK-ACCESS-PASSPHRASE': passphrase,
        'OK-ACCESS-PROJECT': projectId,
      },
    });
    if (!res.ok) {
      console.warn(`[OkxSecurity] HTTP ${res.status} for ${tokenAddress.slice(0, 10)} — defaulting to safe.`);
      return fallback;
    }
    const json = (await res.json()) as { code: string; data: unknown };
    if (json.code !== '0' || !Array.isArray(json.data) || json.data.length === 0) return fallback;

    const row = (json.data as Array<Record<string, unknown>>)[0];
    const flagsRaw = Array.isArray(row.risks) ? (row.risks as unknown[]).map(String) : [];
    const buyTax = parseFloat(String(row.buyTax ?? '0')) || 0;
    const sellTax = parseFloat(String(row.sellTax ?? '0')) || 0;

    const hasBlocker = flagsRaw.some(f => BLOCKING_FLAGS.has(f.toLowerCase()));
    const taxTooHigh = buyTax > MAX_TAX_ALLOWED || sellTax > MAX_TAX_ALLOWED;

    return {
      chainIndex,
      tokenAddress,
      safe: !hasBlocker && !taxTooHigh,
      flags: flagsRaw,
      buyTax,
      sellTax,
      raw: hasBlocker || taxTooHigh ? 'risky' : 'safe',
    };
  } catch (err) {
    console.warn(`[OkxSecurity] Error for ${tokenAddress.slice(0, 10)} — defaulting to safe:`, err);
    return fallback;
  }
}

/** Batch check — returns a map keyed by `${chainIndex}:${tokenAddress}`. */
export async function checkTokenRiskBatch(
  tokens: Array<{ chainIndex: string; tokenAddress: string }>,
): Promise<Map<string, TokenRiskVerdict>> {
  const out = new Map<string, TokenRiskVerdict>();
  // Cap concurrency at 5 (matches project convention for external rate-limited APIs).
  const BATCH = 5;
  for (let i = 0; i < tokens.length; i += BATCH) {
    const slice = tokens.slice(i, i + BATCH);
    const verdicts = await Promise.all(slice.map(t => checkTokenRisk(t.chainIndex, t.tokenAddress)));
    for (const v of verdicts) {
      out.set(`${v.chainIndex}:${v.tokenAddress}`, v);
    }
  }
  return out;
}
