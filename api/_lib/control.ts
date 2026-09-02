// ============================================================
// control — Bobby's dynamic kill switches.
//
// Two flags, readable at request time without a redeploy:
//   write_freeze — every Bobby writer answers 503 (migration window,
//                  incident response).
//   canary       — cycles run in dryrun with ZERO external effects
//                  (no Telegram, no Twitter, no on-chain, no payments).
//
// Sources, chosen with BOBBY_CONTROL_SOURCE:
//   table        — row id='global' in public.bobby_control, read with the
//                  service role (RLS on, no anon policy). Flip it from the
//                  Supabase dashboard.
//   edge-config  — item "bobby_control" in the Vercel Edge Config named by
//                  EDGE_CONFIG. Flip it from the Vercel dashboard.
//   (unset)      — static env: PROTOCOL_CUTOVER_FREEZE / BOBBY_WRITE_FREEZE
//                  and BOBBY_CANARY. Needs a redeploy to change, so it is
//                  NOT an emergency switch; the health endpoint reports it.
//
// Fail-closed: when a dynamic source is configured and cannot be read, the
// answer is "frozen + canary". Cached for 10 seconds per lambda instance.
// ============================================================
import type { VercelResponse } from '@vercel/node';
import { bobbyRest, bobbyServiceHeaders } from './bobby-db.js';

export type ControlSource = 'table' | 'edge-config' | 'env' | 'error';

export interface BobbyControl {
  writeFreeze: boolean;
  canary: boolean;
  source: ControlSource;
  /** Human note stored next to the flags (why they were flipped). */
  note: string | null;
  fetchedAt: number;
}

const CACHE_MS = 10_000;
let cached: BobbyControl | null = null;

function fromEnv(env: NodeJS.ProcessEnv = process.env): BobbyControl {
  return {
    writeFreeze: env.PROTOCOL_CUTOVER_FREEZE === 'true' || env.BOBBY_WRITE_FREEZE === 'true',
    canary: env.BOBBY_CANARY === 'true' || env.BOBBY_CYCLE_CANARY === '1',
    source: 'env',
    note: null,
    fetchedAt: Date.now(),
  };
}

function failClosed(reason: string): BobbyControl {
  console.error('[control] control source unreadable — failing closed:', reason);
  return { writeFreeze: true, canary: true, source: 'error', note: reason, fetchedAt: Date.now() };
}

async function fromTable(): Promise<BobbyControl> {
  const res = await fetch(bobbyRest('bobby_control?id=eq.global&select=write_freeze,canary,note&limit=1'), {
    headers: bobbyServiceHeaders(),
  });
  if (!res.ok) return failClosed(`bobby_control HTTP ${res.status}`);
  const rows = (await res.json()) as Array<{ write_freeze?: boolean; canary?: boolean; note?: string | null }>;
  if (!Array.isArray(rows) || rows.length === 0) return failClosed('bobby_control row "global" is missing');
  return {
    writeFreeze: rows[0].write_freeze === true,
    canary: rows[0].canary === true,
    source: 'table',
    note: rows[0].note ?? null,
    fetchedAt: Date.now(),
  };
}

async function fromEdgeConfig(): Promise<BobbyControl> {
  const conn = process.env.EDGE_CONFIG || '';
  // Connection string shape: https://edge-config.vercel.com/<id>?token=<token>
  const match = conn.match(/^https:\/\/edge-config\.vercel\.com\/([^?]+)\?token=(.+)$/);
  if (!match) return failClosed('EDGE_CONFIG connection string is missing or malformed');
  const [, id, token] = match;
  const res = await fetch(`https://edge-config.vercel.com/${id}/item/bobby_control?token=${encodeURIComponent(token)}`);
  if (!res.ok) return failClosed(`edge config HTTP ${res.status}`);
  const item = (await res.json()) as { write_freeze?: boolean; canary?: boolean; note?: string | null } | null;
  if (!item || typeof item !== 'object') return failClosed('edge config item "bobby_control" is missing');
  return {
    writeFreeze: item.write_freeze === true,
    canary: item.canary === true,
    source: 'edge-config',
    note: item.note ?? null,
    fetchedAt: Date.now(),
  };
}

/** Current flags. Dynamic sources are cached 10 s; env is read live. */
export async function getBobbyControl(): Promise<BobbyControl> {
  const source = (process.env.BOBBY_CONTROL_SOURCE || '').trim();
  if (!source) return fromEnv();
  if (cached && Date.now() - cached.fetchedAt < CACHE_MS) return cached;
  try {
    cached = source === 'table' ? await fromTable() : source === 'edge-config' ? await fromEdgeConfig() : failClosed(`unknown BOBBY_CONTROL_SOURCE "${source}"`);
  } catch (error) {
    cached = failClosed(error instanceof Error ? error.message : String(error));
  }
  return cached;
}

/** Last control snapshot seen by this lambda (sync consumers such as the write latch). */
export function lastKnownControl(): BobbyControl | null {
  return cached ?? (process.env.BOBBY_CONTROL_SOURCE ? null : fromEnv());
}

/**
 * Gate for every Bobby endpoint that writes. Answers 503 with the reason when
 * writes are frozen. Returns true when the caller may proceed.
 */
export async function requireWritesOpen(res: VercelResponse): Promise<boolean> {
  const control = await getBobbyControl();
  if (!control.writeFreeze) return true;
  res.setHeader('Retry-After', '60');
  res.status(503).json({ error: 'Bobby writes are frozen', source: control.source, note: control.note });
  return false;
}
