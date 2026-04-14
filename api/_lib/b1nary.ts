// ============================================================
// b1nary Adapter — read-only client for the public b1nary API
// ------------------------------------------------------------
// b1nary is an options protocol (covered puts / calls) currently
// live on Base. Bobby uses this adapter as a read-only source
// of truth to pressure-test Wheel-strategy decisions before any
// agent commits collateral.
//
// Chain: 8453 (Base) today. X Layer execution path pending b1nary
// deployment on chain 196. Every response surfaces this via the
// `deploymentStatus` field so consumers never mistake current
// reads for on-chain X Layer activity.
// ============================================================

const B1NARY_API_BASE = 'https://api.b1nary.app';
const DEFAULT_TIMEOUT_MS = 8000;

export type B1naryAsset = 'eth' | 'cbbtc';
export type B1naryOptionType = 'put' | 'call';
export type B1naryDeploymentStatus = 'base_live_xlayer_pending';

export const B1NARY_DEPLOYMENT_STATUS: B1naryDeploymentStatus = 'base_live_xlayer_pending';
export const B1NARY_SOURCE_CHAIN_ID = '8453';

export interface B1naryPriceQuote {
  option_type: B1naryOptionType;
  strike: number;
  expiry_days: number;
  expiry_date: string;        // ISO date (UTC day)
  premium: number;            // in quote token (USDC for puts, asset for calls)
  delta: number;
  iv: number;
  spot: number;
  ttl: number;                // seconds until quote expires
  expires_at: number;         // unix seconds
  available_amount: number;   // max fill size in base units (e.g. ETH)
  otoken_address: string;
  signature: string;
  mm_address: string;
  bid_price_raw: number;
  deadline: number;
  quote_id: string;
  max_amount_raw: number;
  maker_nonce: number;
  position_count: number;
}

export interface B1narySpot {
  asset: string;
  spot: number;
  updated_at: number;
}

export interface B1naryCapacity {
  asset: string;
  capacity: number;
  capacity_usd: number;
  market_open: boolean;
  market_status: 'active' | 'paused' | 'breaker' | string;
  max_position: number;
  mm_count: number;
  updated_at: string;
}

export interface B1narySimulation {
  premium_earned: number;
  was_assigned: boolean;
  eth_low_of_week: number;
  eth_close: number;
  eth_open: number;
  strike: number;
  comparison: {
    hold_return: number;
    stake_return: number;
    dca_return: number;
  };
}

export class B1naryCircuitBreakerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'B1naryCircuitBreakerError';
  }
}

async function fetchWithTimeout(url: string, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal, headers: { accept: 'application/json' } });
  } finally {
    clearTimeout(timer);
  }
}

async function b1naryGet<T>(path: string): Promise<T> {
  const url = `${B1NARY_API_BASE}${path}`;
  const res = await fetchWithTimeout(url);
  // b1nary documents 503 as a hard circuit-breaker signal. Surface it as
  // a dedicated error so Bobby can fail closed instead of returning stale
  // or partial verdicts.
  if (res.status === 503) {
    throw new B1naryCircuitBreakerError(`b1nary circuit breaker active on ${path}`);
  }
  if (!res.ok) {
    throw new Error(`b1nary GET ${path} failed: ${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<T>;
}

// ── Spot price for the asset ──
export function getSpot(asset: B1naryAsset): Promise<B1narySpot> {
  return b1naryGet<B1narySpot>(`/spot?asset=${asset}`);
}

// ── Market capacity / open state ──
export function getCapacity(asset: B1naryAsset): Promise<B1naryCapacity> {
  return b1naryGet<B1naryCapacity>(`/capacity?asset=${asset}`);
}

// ── Live quotes across available strikes + expiries ──
export async function getPrices(asset?: B1naryAsset, optionType?: B1naryOptionType): Promise<B1naryPriceQuote[]> {
  const params = new URLSearchParams();
  if (asset) params.set('asset', asset);
  if (optionType) params.set('option_type', optionType);
  const qs = params.toString();
  const rows = await b1naryGet<B1naryPriceQuote[]>(`/prices${qs ? `?${qs}` : ''}`);
  return rows.filter(r => r && typeof r.strike === 'number' && typeof r.premium === 'number');
}

// ── Historical/simulated outcome for a proposed strike ──
export function simulatePrice(params: {
  asset: B1naryAsset;
  strike: number;
  option_type: B1naryOptionType;
  amount: number;
  expiry_days: number;
}): Promise<B1narySimulation> {
  const qs = new URLSearchParams({
    asset: params.asset,
    strike: String(params.strike),
    option_type: params.option_type,
    amount: String(params.amount),
    expiry_days: String(params.expiry_days),
  }).toString();
  return b1naryGet<B1narySimulation>(`/prices/simulate?${qs}`);
}

// ── Positions snapshot for any wallet address ──
export interface B1naryPosition {
  // Shape evolves with b1nary API — we pass meta through as-is and
  // only touch fields we control. Do not model too early.
  [key: string]: unknown;
}

export async function getPositions(address: string): Promise<B1naryPosition[]> {
  if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
    throw new Error('getPositions: invalid address');
  }
  const rows = await b1naryGet<B1naryPosition[]>(`/positions/${address}`);
  return Array.isArray(rows) ? rows : [];
}

// ── Helpers for verdict logic ──

export interface AnnualizedYield {
  annualized_bps: number;    // basis points per year
  collateral_ratio: number;  // premium / collateral
  days_to_expiry: number;
}

// Bobby's guardrails need yield *per year* to compare across expiries.
// Raw premium is misleading: a 1% weekly premium is ~67% APR, a 1%
// monthly premium is only ~13% APR. Always normalize before scoring.
export function annualizeYield(params: {
  premium: number;
  collateral: number;
  expiryDays: number;
}): AnnualizedYield {
  const { premium, collateral, expiryDays } = params;
  const days = Math.max(1, expiryDays);
  const ratio = collateral > 0 ? premium / collateral : 0;
  const annualized = ratio * (365 / days);
  return {
    annualized_bps: Math.round(annualized * 10_000),
    collateral_ratio: ratio,
    days_to_expiry: days,
  };
}

// Strike distance as a signed percentage relative to spot.
// Puts: negative (strike below spot is safer). Calls: positive (strike above spot is safer).
export function strikeDistancePct(strike: number, spot: number): number {
  if (spot <= 0) return 0;
  return (strike - spot) / spot;
}
