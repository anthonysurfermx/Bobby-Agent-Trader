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
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const q = String(req.query.q || '').trim();
  const limit = Math.min(Math.max(Number(req.query.limit || 8) || 8, 1), 20);
  const instTypes = parseInstTypes(req.query.instTypes);

  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=1800');

  // Browse mode: the whole explorable universe grouped by class and ranked
  // by real 24h volume — powers the in-app board and dictation vocabulary.
  if (String(req.query.browse || '') === '1') {
    try {
      const { classes, totalBases } = await browseOkxAssets();
      return res.status(200).json({
        ok: true,
        browse: classes,
        totalBases,
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
