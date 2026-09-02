import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  browseOkxAssets,
  getCatalogAgeMs,
  OKX_SEARCH_INST_TYPES,
  resolveOkxAssetFromText,
  searchOkxInstruments,
  type OkxSearchInstType,
} from '../src/lib/okx-asset-search.js';

export const config = { maxDuration: 15 };

function parseInstTypes(raw: unknown): OkxSearchInstType[] {
  const value = String(raw || '')
    .split(',')
    .map((part) => part.trim().toUpperCase())
    .filter(Boolean);

  if (!value.length) return [...OKX_SEARCH_INST_TYPES];

  return value.filter((part): part is OkxSearchInstType => OKX_SEARCH_INST_TYPES.includes(part as OkxSearchInstType));
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // POST carries the phrase in the body so a user's raw question never rides in
  // a URL. Query strings land in platform runtime logs, and data readable there
  // after the request is served is exactly what Apple counts as "collected".
  // GET stays for the web app and the browse board, which send no user prose.
  const src: Record<string, unknown> =
    req.method === 'POST'
      ? ((req.body ?? {}) as Record<string, unknown>)
      : (req.query as unknown as Record<string, unknown>);

  const q = String(src.q || '').trim();
  const limit = Math.min(Math.max(Number(src.limit || 8) || 8, 1), 20);
  const instTypes = parseInstTypes(src.instTypes);

  // Only the shared GET responses are cacheable; a POST body is per-caller.
  if (req.method === 'GET') {
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=1800');
  } else {
    res.setHeader('Cache-Control', 'no-store');
  }

  // Browse mode: the whole explorable universe grouped by class and ranked
  // by real 24h volume — powers the in-app board and dictation vocabulary.
  if (String(src.browse || '') === '1') {
    try {
      const { classes, totalBases, movers } = await browseOkxAssets();
      return res.status(200).json({
        ok: true,
        browse: classes,
        totalBases,
        movers,
        source: 'OKX public instruments + tickers',
        catalogAgeMs: getCatalogAgeMs(),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Browse unavailable';
      return res.status(503).json({ error: message });
    }
  }

  if (!q) {
    return res.status(200).json({
      ok: true,
      query: '',
      results: [],
      resolved: null,
      source: 'OKX public instruments',
      catalogAgeMs: getCatalogAgeMs(),
    });
  }

  try {
    const [results, resolution] = await Promise.all([
      searchOkxInstruments(q, { instTypes, limit }),
      resolveOkxAssetFromText(q, { instTypes }),
    ]);

    return res.status(200).json({
      ok: true,
      query: q,
      instTypes,
      results,
      resolved: resolution?.instrument ?? null,
      // Safety metadata: fuzzy/proxy matches must be user-confirmed before
      // any analysis runs — better to ask once than to confidently analyze
      // the wrong instrument.
      resolution: resolution
        ? {
          matchKind: resolution.matchKind,
          matchedTerm: resolution.matchedTerm,
          needsConfirmation: resolution.needsConfirmation,
          proxyNote: resolution.proxyNote,
        }
        : null,
      source: 'OKX public instruments',
      catalogAgeMs: getCatalogAgeMs(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Search unavailable';
    return res.status(503).json({ error: message });
  }
}
