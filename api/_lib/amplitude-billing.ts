// Production billing events use the same Bobby identity as the usage exporter. No direct store integration:
// RevenueCat's app_user_id is a different UUID, and Stripe's fallback identifiers can contain an email.
import { rpc } from './admin.js';

export interface AmplitudePurchase {
  id: string; type: string; environment: string | null; store: string | null; product: string | null;
  identity: string | null; at: string; priceUsd: number | null; takehome: number | null;
  currency: string | null; priceLocal: number | null;
  firstPaid?: boolean;
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);
const charges = new Set(['INITIAL_PURCHASE', 'RENEWAL', 'NON_RENEWING_PURCHASE']);

/** Unknown environments and unlinked purchases never become users or revenue in production analytics. */
export function toAmplitudePurchase(row: AmplitudePurchase) {
  if (row.environment !== 'PRODUCTION' || !row.identity || !uuid.test(row.identity)
    || !row.id || row.id.length > 80 || !/^[A-Z_]{1,40}$/.test(row.type) || !Number.isFinite(Date.parse(row.at))) return null;
  const platform = row.store === 'APP_STORE' ? 'ios' : row.store === 'PLAY_STORE' ? 'android' : 'web';
  const props: Record<string, string | number> = { store: row.store ?? 'unknown', environment: 'PRODUCTION', platform };
  if (row.product) props.product_id = row.product;
  if (row.currency) props.local_currency = row.currency;
  if (finite(row.priceLocal)) props.local_amount = row.priceLocal;
  if (finite(row.priceUsd)) props.gross_usd = row.priceUsd;
  if (finite(row.priceUsd) && finite(row.takehome) && row.takehome >= 0 && row.takehome <= 1) {
    props.net_usd = row.priceUsd * row.takehome;
  }
  // Cancellation can mean disabled auto-renewal; only an explicit negative amount is a refund. Expiration,
  // billing issues, transfers and product changes can carry a price without collecting it again.
  const charge = charges.has(row.type) && finite(row.priceUsd) && row.priceUsd > 0;
  const refund = (row.type === 'REFUND' || row.type === 'CANCELLATION') && finite(row.priceUsd) && row.priceUsd < 0;
  return {
    event_type: `billing_${row.type.toLowerCase()}`, user_id: row.identity, time: Date.parse(row.at),
    insert_id: `bobby-purchase-${row.id}`, platform, event_properties: props,
    ...(charge || refund ? {
      revenue: row.priceUsd, currency: 'USD', revenueType: refund ? 'refund' : row.type.toLowerCase(),
      ...(row.product ? { productId: row.product } : {}),
    } : {}),
  };
}

/** One person can reach the paid conversion step once. The original billing event carries all revenue. */
export function toAmplitudeFirstPaid(row: AmplitudePurchase) {
  if (!row.firstPaid || row.store !== 'STRIPE' || !charges.has(row.type)
    || !(finite(row.priceUsd) && row.priceUsd > 0 || finite(row.priceLocal) && row.priceLocal > 0)) return null;
  const event = toAmplitudePurchase(row);
  if (!event) return null;
  return { event_type: 'billing_first_paid', user_id: row.identity!, time: event.time,
    insert_id: `bobby-first-paid-${row.identity}`, platform: 'web', event_properties: event.event_properties };
}

/** Acknowledge only after acceptance; failed uploads leave every row pending for the next cron. */
export async function runAmplitudeBilling(): Promise<number> {
  const key = (process.env.AMPLITUDE_API_KEY || '').trim();
  if (!key) return 0;
  const rows = await rpc<AmplitudePurchase[]>('bobby_amplitude_purchase_batch', { p_limit: 500 });
  const batch = rows.map((row) => ({ id: row.id, event: toAmplitudePurchase(row), first: toAmplitudeFirstPaid(row) })).filter((row) => row.event !== null);
  if (!batch.length) return 0;
  const endpoint = (process.env.AMPLITUDE_REGION || '').trim().toLowerCase() === 'eu'
    ? 'https://api.eu.amplitude.com/batch' : 'https://api2.amplitude.com/batch';
  const response = await fetch(endpoint, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(15_000),
    body: JSON.stringify({ api_key: key, events: batch.flatMap(({ event, first }) => first ? [event, first] : [event]), options: { min_id_length: 5 } }),
  });
  // Do not log the response body: an ingestion service can echo the request's key or identifiers on error.
  if (response.status !== 200) throw new Error(`amplitude billing ${response.status}`);
  await rpc('bobby_amplitude_purchase_ack', { p_ids: batch.map((row) => row.id), p_first_ids: batch.filter((row) => row.first).map((row) => row.id) });
  return batch.length;
}
