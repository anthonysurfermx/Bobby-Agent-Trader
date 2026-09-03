// ============================================================
// GET /api/bobby-signals — Technical indicators from latest cycle
// Reads cached indicators from Supabase (forum_threads.trigger_data)
// OKX blocks Vercel IPs — we read from Bobby's cycle cache instead.
// ============================================================

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { bobbyAnonKey, bobbyDbUrl, bobbyServiceKey } from './_lib/bobby-db.js';

export const config = { maxDuration: 10 };

const SB_URL = bobbyDbUrl();
const SB_KEY = bobbyServiceKey()
  || bobbyAnonKey()
  || bobbyAnonKey();
const SB_HEADERS = { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` };

async function queryThreads(query: string): Promise<any[]> {
  // C-01 (final audit): this endpoint is public and reads with the service key — pin it to public threads.
  const sbRes = await fetch(`${SB_URL}/rest/v1/forum_threads?scope=eq.public&${query}`, { headers: SB_HEADERS });
  if (!sbRes.ok) {
    const body = await sbRes.text().catch(() => '');
    throw new Error(`Supabase ${sbRes.status}: ${body || 'request failed'}`);
  }
  const rows = await sbRes.json();
  return Array.isArray(rows) ? rows : [];
}

function extractTechnicalCache(row: any): {
  tech: any;
  convictionModel: any;
  sourcePath: string;
} | null {
  const triggerData = row?.trigger_data;
  if (!triggerData || typeof triggerData !== 'object') return null;

  if (triggerData.technical?.assets?.length) {
    return {
      tech: triggerData.technical,
      convictionModel: triggerData.conviction_model || null,
      sourcePath: 'trigger_data.technical',
    };
  }

  if (triggerData.technicalLeader) {
    return {
      tech: {
        regime: triggerData.regime || null,
        leader: triggerData.technicalLeader,
        assets: [triggerData.technicalLeader],
      },
      convictionModel: triggerData.conviction_model || null,
      sourcePath: 'trigger_data.technicalLeader',
    };
  }

  return null;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });

  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=30');

  try {
    const select = 'select=trigger_data,created_at,symbol,conviction_score';
    let directRows: any[] = [];
    try {
      directRows = await queryThreads(`trigger_data->technical=not.is.null&order=created_at.desc&limit=1&${select}`);
    } catch {
      directRows = [];
    }
    const fallbackRows = directRows.length
      ? directRows
      : await queryThreads(`trigger_data=not.is.null&order=created_at.desc&limit=10&${select}`);

    if (!fallbackRows.length) {
      return res.status(503).json({ error: 'No cycle data available yet' });
    }

    const withTech = fallbackRows
      .map((row) => ({ row, cache: extractTechnicalCache(row) }))
      .find((entry) => entry.cache?.tech?.assets?.length > 0);

    if (!withTech) {
      return res.status(503).json({
        error: 'No technical indicator data available yet. Waiting for next cycle with OKX Agent Trade Kit cache.',
      });
    }

    const { row, cache } = withTech;
    const tech = cache!.tech;
    const convictionModel = cache!.convictionModel;

    // Format assets with their indicator breakdowns
    const indicators = (tech.assets || []).map((asset: any) => ({
      symbol: asset.symbol,
      timeframe: asset.timeframe || '1H',
      compositeScore: asset.compositeScore,
      signal: asset.signal,
      conviction: asset.conviction,
      agreement: asset.agreement,
      tradePlan: asset.tradePlan || null,
      indicators: Object.fromEntries(
        Object.entries(asset.breakdown || {}).map(([name, reading]: [string, any]) => [
          name,
          { bias: reading.bias, score: reading.score, weight: reading.weight, values: reading.values || null }
        ])
      ),
    }));

    return res.status(200).json({
      ok: true,
      source: 'OKX Agent Trade Kit (cached from Bobby cycle)',
      sourcePath: cache!.sourcePath,
      ts: new Date(row.created_at).getTime(),
      age: Date.now() - new Date(row.created_at).getTime(),
      regime: tech.regime || row.trigger_data?.regime || null,
      leader: tech.leader || null,
      convictionModel,
      indicators,
    });
  } catch (e: any) {
    return res.status(503).json({ error: e.message || 'Signals cache unavailable' });
  }
}
