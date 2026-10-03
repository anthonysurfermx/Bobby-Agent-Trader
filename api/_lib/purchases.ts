// ============================================================
// Revenue for the owner dashboard (bobby_purchase_events, migrations 20261001180000 / 20261001210000): one row
// per store event, idempotent by event id. A failed write throws so the webhook answers 5xx and the store
// retries — a purchase is never silently missing from revenue. The environment is stored upper-cased (PRODUCTION,
// SANDBOX): the dashboard counts as money only events whose environment is exactly PRODUCTION.
// ============================================================
import { bobbyRest, bobbyServiceHeaders } from './bobby-db.js';
import { countryCode } from './geo.js';

export interface PurchaseEvent {
  id: string; type: string; environment?: string | null; store?: string | null; productId?: string | null;
  priceUsd?: number | null; takehome?: number | null; commissionPct?: number | null; taxPct?: number | null;
  currency?: string | null; priceLocal?: number | null; identityId?: string | null; at?: number | null;
  country?: string | null;   // the store / billing country (ISO alpha-2)
}

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const text = (v: unknown, max: number) => (typeof v === 'string' && v ? v.slice(0, max) : null);
const share = (v: unknown) => { const x = num(v); return x !== null && x >= 0 && x <= 1 ? x : null; };

export interface PurchaseTransport {
  fetch: (url: string, init?: RequestInit) => Promise<Response>;
  body: <T>(load: () => Promise<T>) => Promise<T>;
}
const defaultTransport: PurchaseTransport = { fetch: (url, init) => fetch(url, init), body: (load) => load() };

export async function recordPurchaseEvent(e: PurchaseEvent, transport: PurchaseTransport = defaultTransport): Promise<void> {
  const id = text(e.id, 80);
  if (!id || e.id.length > 80 || !e.type) throw new Error('purchase event id invalid');
  const r = await transport.fetch(bobbyRest('bobby_purchase_events?on_conflict=id'), {
    method: 'POST', headers: bobbyServiceHeaders({ Prefer: 'resolution=ignore-duplicates,return=minimal' }), signal: AbortSignal.timeout(4000),
    body: JSON.stringify({
      id, type: e.type.slice(0, 40), environment: text(e.environment, 20)?.toUpperCase() ?? null, store: text(e.store, 30), product_id: text(e.productId, 120),
      price_usd: num(e.priceUsd), takehome: share(e.takehome), commission_pct: share(e.commissionPct), tax_pct: share(e.taxPct),
      currency: text(e.currency, 8), price_local: num(e.priceLocal), identity_id: e.identityId ?? null, country: countryCode(e.country),
      event_at: new Date(num(e.at) ?? Date.now()).toISOString(),
    }),
  });
  if (!r.ok) throw new Error(`purchase event ${r.status}`);
}

/** A retry can fill a previously unknown owner; it cannot transfer a recorded charge/refund to another account. */
export async function linkPurchaseIdentity(id: string, identity: string, transport: PurchaseTransport = defaultTransport): Promise<void> {
  if (!id || id.length > 80 || !/^[0-9a-f-]{36}$/i.test(identity)) throw new Error('purchase owner invalid');
  const query = `bobby_purchase_events?id=eq.${encodeURIComponent(id)}`;
  const r = await transport.fetch(bobbyRest(`${query}&identity_id=is.null`), {
    method: 'PATCH', headers: bobbyServiceHeaders({ Prefer: 'return=representation' }), signal: AbortSignal.timeout(4000),
    body: JSON.stringify({ identity_id: identity }),
  });
  if (!r.ok) throw new Error(`purchase owner write ${r.status}`);
  const changed = r.status === 204 ? [] : await transport.body(() => r.json()) as Array<{ identity_id?: string }>;
  if (!Array.isArray(changed)) throw new Error('purchase owner response invalid');
  if (changed.length === 1 && changed[0]?.identity_id === identity) return;
  const current = await transport.fetch(bobbyRest(`${query}&select=identity_id`), { headers: bobbyServiceHeaders(), signal: AbortSignal.timeout(4000) });
  if (!current.ok) throw new Error(`purchase owner read ${current.status}`);
  const rows = await transport.body(() => current.json()) as Array<{ identity_id?: string }>;
  if (!Array.isArray(rows) || rows.length !== 1 || rows[0]?.identity_id !== identity) throw new Error('purchase owner mismatch');
}
