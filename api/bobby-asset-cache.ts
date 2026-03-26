import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  buildIndicatorCacheRecord,
  INDICATOR_CACHE_TTL_MS,
} from '../src/lib/okx-asset-technical.js';
import { resolveOkxInstrument, type OkxAssetInstrument } from '../src/lib/okx-asset-search.js';

export const config = { maxDuration: 15 };

const SB_URL = process.env.VITE_SUPABASE_URL || 'https://egpixaunlnzauztbrnuz.supabase.co';
const SB_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY
  || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVncGl4YXVubG56YXV6dGJybnV6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTUyOTc3MDQsImV4cCI6MjA3MDg3MzcwNH0.jlWxBgUiBLOOptESdBYzisWAbiMnDa5ktzFaCGskew4';
const SB_WRITE_KEY = process.env.SUPABASE_SERVICE_KEY || SB_ANON_KEY;

const memoryCache = new Map<string, any>();

function cacheKey(instId: string, timeframe: string): string {
  return `${instId.trim().toUpperCase()}::${timeframe.trim().toUpperCase()}`;
}

function readTimestamp(row: any): string | null {
  return row?.updated_at || row?.fetched_at || row?.created_at || null;
}

function readAgeMs(row: any): number | null {
  const ts = readTimestamp(row);
  if (!ts) return null;
  const millis = new Date(ts).getTime();
  if (!Number.isFinite(millis)) return null;
  return Date.now() - millis;
}

function isFresh(row: any): boolean {
  const ageMs = readAgeMs(row);
  return ageMs !== null && ageMs < INDICATOR_CACHE_TTL_MS;
}

async function queryIndicatorCache(instId: string, timeframe: string): Promise<any | null> {
  const query = new URLSearchParams({
    select: '*',
    inst_id: `eq.${instId}`,
    timeframe: `eq.${timeframe}`,
    limit: '1',
  });
  const res = await fetch(`${SB_URL}/rest/v1/indicator_cache?${query.toString()}`, {
    headers: {
      apikey: SB_ANON_KEY,
      Authorization: `Bearer ${SB_ANON_KEY}`,
    },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Supabase ${res.status}: ${body || 'cache read failed'}`);
  }

  const rows = await res.json();
  return Array.isArray(rows) && rows[0] ? rows[0] : null;
}

async function upsertIndicatorCache(row: any): Promise<{ persisted: boolean; row: any; error?: string }> {
  const res = await fetch(`${SB_URL}/rest/v1/indicator_cache?on_conflict=inst_id,timeframe&select=*`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SB_WRITE_KEY,
      Authorization: `Bearer ${SB_WRITE_KEY}`,
      Prefer: 'resolution=merge-duplicates,return=representation',
    },
    body: JSON.stringify(row),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    return {
      persisted: false,
      row,
      error: `Supabase ${res.status}: ${body || 'cache upsert failed'}`,
    };
  }

  const rows = await res.json();
  return {
    persisted: true,
    row: Array.isArray(rows) ? rows[0] || row : row,
  };
}

function parseBody(req: VercelRequest): any {
  if (!req.body) return {};
  if (typeof req.body === 'string') {
    try {
      return JSON.parse(req.body);
    } catch {
      return {};
    }
  }
  return req.body;
}

async function resolveInstrumentForRequest(instId?: string, q?: string): Promise<OkxAssetInstrument | null> {
  if (instId) {
    return resolveOkxInstrument(instId);
  }
  if (q) {
    return resolveOkxInstrument(q);
  }
  return null;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!['GET', 'POST'].includes(req.method || '')) {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (req.method === 'GET') {
    const requestedInstId = String(req.query.instId || '').trim().toUpperCase();
    const q = String(req.query.q || '').trim();
    const timeframe = String(req.query.timeframe || '1H').trim().toUpperCase();

    try {
      const instrument = await resolveInstrumentForRequest(requestedInstId || undefined, q || undefined);
      const instId = requestedInstId || instrument?.instId || '';

      if (!instId) {
        return res.status(400).json({ error: 'instId or q is required' });
      }

      const key = cacheKey(instId, timeframe);
      let row = memoryCache.get(key) || null;

      if (!row) {
        try {
          row = await queryIndicatorCache(instId, timeframe);
        } catch {
          row = null;
        }
      }

      res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=120');

      return res.status(200).json({
        ok: true,
        instId,
        timeframe,
        instrument,
        row,
        fresh: row ? isFresh(row) : false,
        stale: row ? !isFresh(row) : false,
        ageMs: row ? readAgeMs(row) : null,
        source: row ? (memoryCache.get(key) ? 'memory_or_supabase' : 'supabase') : 'miss',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Cache read failed';
      return res.status(503).json({ error: message });
    }
  }

  try {
    const body = parseBody(req);
    const instId = String(body.instId || '').trim().toUpperCase();
    const timeframe = String(body.timeframe || '1H').trim().toUpperCase();
    const indicators = body.indicators && typeof body.indicators === 'object' ? body.indicators : null;
    const currentPrice = body.currentPrice == null ? null : Number(body.currentPrice);

    if (!instId || !indicators) {
      return res.status(400).json({ error: 'instId and indicators are required' });
    }

    const instrument = body.instrument && typeof body.instrument === 'object'
      ? body.instrument as OkxAssetInstrument
      : await resolveOkxInstrument(instId);

    const record = buildIndicatorCacheRecord({
      instId,
      timeframe,
      indicators,
      currentPrice,
      instrument,
      regime: body.regime,
      source: body.source,
    });

    memoryCache.set(cacheKey(instId, timeframe), record);

    const persisted = await upsertIndicatorCache(record);
    if (persisted.row) {
      memoryCache.set(cacheKey(instId, timeframe), persisted.row);
    }

    return res.status(200).json({
      ok: true,
      instId,
      timeframe,
      instrument,
      persisted: persisted.persisted,
      persistenceError: persisted.error || null,
      row: persisted.row,
      fresh: true,
      ageMs: 0,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Cache write failed';
    return res.status(503).json({ error: message });
  }
}
