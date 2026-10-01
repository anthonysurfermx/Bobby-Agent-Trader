// ============================================================
// Revenue for the owner dashboard (bobby_purchase_events, migrations 20261001180000 / 20261001210000): one row
// per store event, idempotent by event id. A failed write throws so the webhook answers 5xx and the store
// retries — a purchase is never silently missing from revenue.
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

export async function recordPurchaseEvent(e: PurchaseEvent): Promise<void> {
  const id = text(e.id, 80);
  if (!id || !e.type) return;
  const r = await fetch(bobbyRest('bobby_purchase_events?on_conflict=id'), {
    method: 'POST', headers: bobbyServiceHeaders({ Prefer: 'resolution=ignore-duplicates,return=minimal' }), signal: AbortSignal.timeout(4000),
    body: JSON.stringify({
      id, type: e.type.slice(0, 40), environment: text(e.environment, 20), store: text(e.store, 30), product_id: text(e.productId, 120),
      price_usd: num(e.priceUsd), takehome: share(e.takehome), commission_pct: share(e.commissionPct), tax_pct: share(e.taxPct),
      currency: text(e.currency, 8), price_local: num(e.priceLocal), identity_id: e.identityId ?? null, country: countryCode(e.country),
      event_at: new Date(num(e.at) ?? Date.now()).toISOString(),
    }),
  });
  if (!r.ok) throw new Error(`purchase event ${r.status}`);
}
