// ============================================================
// GET /api/asset-fact?symbol=NVDA&class=equity
// The completed-day market fact of one asset (api/_lib/harness/README.md, layer 2a): its last
// completed close, the change from the close before, and whether that day was larger than the
// asset's own usual day or closed outside its previous 20-day range.
//   · Shared by everyone: the reply depends on the asset and the day only. No identity, no cookie,
//     no header is read, and nothing about who asks is stored. The cache key names the asset.
//   · Fails closed: bars that are incomplete, stale, gapped or implausible give `fact: null` with
//     the reason, never a guessed number and never a zero.
//   · Off unless BOBBY_HARNESS_FACTS is exactly 'on' (404 otherwise), read per request.
//   · No LLM and no trading or cycle route is called: one public daily-candle request per asset,
//     cached.
// ============================================================
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getCache, setCache } from './_lib/api-cache.js';
import { createLimiter, getClientIpKey } from './_lib/rate-limit.js';
import { parseOkxDaily, parseYahooDaily, validateBars, type AssetClass, type BarsRejection } from './_lib/harness/bars.js';
import { assetFact, type AssetFact } from './_lib/harness/facts.js';

export const config = { maxDuration: 10 };

/** Same rule as the desk's symbols: exchange suffixes and share classes are kept. */
export const EQUITY_SYMBOL = /^[A-Z0-9][A-Z0-9.^=-]{0,19}$/;
export const CRYPTO_SYMBOL = /^[A-Z0-9]{1,12}$/;
/** A computed fact is shared this long; a refusal is retried sooner (the source may have recovered). */
export const FACT_TTL_SECONDS = 900;
export const NO_FACT_TTL_SECONDS = 300;
const PROVIDER_TIMEOUT_MS = 6000;

export type NoFactReason = BarsRejection | 'no_data';
export type FactReply = { ok: true; fact: AssetFact } | { ok: true; fact: null; reason: NoFactReason };

export function harnessFactsOn(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.BOBBY_HARNESS_FACTS === 'on';
}

export interface FactDeps {
  /** One provider request; null on any transport or HTTP failure. */
  fetchJson: (url: string) => Promise<unknown | null>;
  now: () => Date;
  cacheGet: (key: string) => Promise<FactReply | null>;
  cacheSet: (key: string, value: FactReply, ttlSec: number) => Promise<void>;
}

const DEFAULT_DEPS: FactDeps = {
  fetchJson: async (url) => {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS), headers: { 'User-Agent': 'Mozilla/5.0 (compatible; BobbyAgentTrader/1.0)' } });
      if (!r.ok) return null;
      return await r.json();
    } catch {
      return null;
    }
  },
  now: () => new Date(),
  cacheGet: (key) => getCache<FactReply>(key),
  cacheSet: (key, value, ttlSec) => setCache(key, value, ttlSec),
};

export function validSymbol(raw: unknown, assetClass: AssetClass): string | null {
  if (typeof raw !== 'string') return null;
  const symbol = raw.trim().toUpperCase();
  return (assetClass === 'equity' ? EQUITY_SYMBOL : CRYPTO_SYMBOL).test(symbol) ? symbol : null;
}

export function providerUrl(symbol: string, assetClass: AssetClass): string {
  return assetClass === 'equity'
    ? `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=3mo&interval=1d&events=split`
    : `https://www.okx.com/api/v5/market/candles?instId=${encodeURIComponent(`${symbol}-USDT`)}&bar=1Dutc&limit=60`;
}

/** `harness:asset:<class>:<symbol>`: public by construction, it names an asset and nothing else. */
export function cacheKey(symbol: string, assetClass: AssetClass): string {
  return `harness:asset:${assetClass}:${symbol}`;
}

/** The fact of one asset: from the shared cache, else one provider read, validated and computed. */
export async function loadAssetFact(symbol: string, assetClass: AssetClass, deps: FactDeps = DEFAULT_DEPS): Promise<FactReply> {
  const key = cacheKey(symbol, assetClass);
  const hit = await deps.cacheGet(key);
  if (hit && hit.ok === true) return hit;
  const reply = await computeAssetFact(symbol, assetClass, deps);
  await deps.cacheSet(key, reply, reply.fact ? FACT_TTL_SECONDS : NO_FACT_TTL_SECONDS);
  return reply;
}

async function computeAssetFact(symbol: string, assetClass: AssetClass, deps: FactDeps): Promise<FactReply> {
  const now = deps.now();
  const json = await deps.fetchJson(providerUrl(symbol, assetClass));
  if (json === null) return { ok: true, fact: null, reason: 'no_data' };
  // Crypto is read as the spot pair against USDT, and says so in `currency`; the reply names the asset.
  const series = assetClass === 'equity' ? parseYahooDaily(json, symbol, now) : parseOkxDaily(json, `${symbol}-USDT`, now);
  if (!series) return { ok: true, fact: null, reason: 'no_data' };
  const valid = validateBars(series, now);
  // `'reason' in` rather than `!valid.ok`: this project's API build does not narrow on booleans.
  if ('reason' in valid) return { ok: true, fact: null, reason: valid.reason };
  const fact = assetFact(series, valid.bars, now);
  return fact ? { ok: true, fact: { ...fact, symbol } } : { ok: true, fact: null, reason: 'no_data' };
}

const limiter = createLimiter(60, 60_000);

/** The route with its dependencies stated, so tests run it without a network or a database. */
export function createHandler(deps: FactDeps = DEFAULT_DEPS, env: () => NodeJS.ProcessEnv = () => process.env) {
  return async function handler(req: VercelRequest, res: VercelResponse) {
    if (!harnessFactsOn(env())) return res.status(404).json({ error: 'not_found' });
    if (req.method !== 'GET') return res.status(405).json({ error: 'method_not_allowed' });
    let caller: string;
    try {
      caller = getClientIpKey(req);
    } catch {
      return res.status(503).json({ error: 'unavailable' });
    }
    if (limiter.check(caller).limited) return res.status(429).json({ error: 'rate_limited' });

    const rawClass = Array.isArray(req.query.class) ? req.query.class[0] : req.query.class;
    if (rawClass !== 'equity' && rawClass !== 'crypto') return res.status(400).json({ error: 'invalid_class' });
    const symbol = validSymbol(Array.isArray(req.query.symbol) ? req.query.symbol[0] : req.query.symbol, rawClass);
    if (!symbol) return res.status(400).json({ error: 'invalid_symbol' });

    const reply = await loadAssetFact(symbol, rawClass, deps);
    // The same answer for everyone, for a while: the CDN may keep it.
    res.setHeader('Cache-Control', reply.fact ? 'public, s-maxage=600, stale-while-revalidate=300' : 'public, s-maxage=120');
    return res.status(200).json(reply);
  };
}

export default createHandler();
