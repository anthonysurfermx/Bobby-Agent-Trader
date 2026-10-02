// ============================================================
// Server-side forwarding of Bobby's first-party events to Amplitude (migration 20261002090000).
// No SDK, cookie or advertising id in the app: the cron reads bobby_events after a cursor (team traffic already
// dropped by bobby_amplitude_batch) and posts them to Amplitude's Batch API. What Amplitude receives is exactly
// what the dashboard stores: the salted install hash as device_id, the account uuid as user_id, the event, a short
// surface name, the referring host, utm_source, approximate country/region and the outcome detail. Never an IP,
// email, user agent or free text. Off unless AMPLITUDE_API_KEY is set (AMPLITUDE_REGION=eu for EU projects).
// ============================================================
import { rpc } from './admin.js';
import { runAmplitudeBilling } from './amplitude-billing.js';

const MAX_BATCHES = 5;

interface Row {
  id: number; at: string; event: string; platform: string | null; surface: string | null; device: string | null;
  identity: string | null; referrer: string | null; utm: string | null; country: string | null; region: string | null; detail: string | null;
}
interface Batch { cursor: number; last: number | null; scanned: number; events: Row[] }

export const amplitudeReady = () => Boolean((process.env.AMPLITUDE_API_KEY || '').trim());

const endpoint = () => ((process.env.AMPLITUDE_REGION || '').trim().toLowerCase() === 'eu'
  ? 'https://api.eu.amplitude.com/batch' : 'https://api2.amplitude.com/batch');

/** One stored event → one Amplitude event. insert_id makes a retried batch idempotent on Amplitude's side. */
export function toAmplitude(r: Row) {
  const props: Record<string, string> = {};
  if (r.surface) props.surface = r.surface;
  if (r.referrer) props.referrer = r.referrer;
  if (r.utm) props.utm_source = r.utm;
  if (r.detail) props.detail = r.detail;
  return {
    event_type: r.event,
    ...(r.device ? { device_id: r.device } : {}),
    ...(r.identity ? { user_id: r.identity } : {}),
    time: Date.parse(r.at),
    insert_id: `bobby-${r.id}`,
    platform: r.platform ?? 'web',
    // Location comes from our own record (Vercel geo, web only); without it Amplitude would place every event at
    // the server that uploads the batch.
    ...(r.country ? { country: r.country } : {}),
    ...(r.region ? { region: r.region } : {}),
    event_properties: props,
    user_properties: { platform: r.platform ?? 'web' },
  };
}

/** Sends everything pending (up to MAX_BATCHES × 500 events per run). */
export async function runAmplitude(): Promise<{ ok: boolean; skipped?: string; sent: number; purchasesSent?: number; scanned: number; cursor: number | null }> {
  const apiKey = (process.env.AMPLITUDE_API_KEY || '').trim();
  if (!apiKey) return { ok: true, skipped: 'AMPLITUDE_API_KEY not set', sent: 0, scanned: 0, cursor: null };
  let sent = 0, scanned = 0, cursor: number | null = null;
  for (let i = 0; i < MAX_BATCHES; i += 1) {
    const b = await rpc<Batch>('bobby_amplitude_batch', { p_limit: 500 });
    cursor = b.cursor;
    if (!b.scanned || b.last == null) break;
    if (b.events.length) {
      const r = await fetch(endpoint(), {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(15_000),
        body: JSON.stringify({ api_key: apiKey, events: b.events.map(toAmplitude), options: { min_id_length: 5 } }),
      });
      if (!r.ok) {
        // The cursor stays put: the same batch is retried on the next run (insert_id dedupes on Amplitude's side).
        const text = (await r.text().catch(() => '')).slice(0, 200);
        throw new Error(`amplitude ${r.status} ${text}`);
      }
      sent += b.events.length;
    }
    scanned += b.scanned;
    const moved = await rpc<boolean>('bobby_amplitude_advance', { p_from: b.cursor, p_to: b.last });
    cursor = b.last;
    if (!moved || b.scanned < 500) break;
  }
  // Billing has its own acknowledgement ledger: late store events or a repaired identity cannot fall behind
  // the usage cursor. One batch bounds the extra work in this 15-minute cron.
  const purchasesSent = await runAmplitudeBilling();
  return { ok: true, sent, purchasesSent, scanned, cursor };
}
