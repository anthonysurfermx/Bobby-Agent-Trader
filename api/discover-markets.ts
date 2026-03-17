// ============================================================
// GET /api/discover-markets?asset=btc
// Descubre mercados Polymarket activos para un crypto asset
// Retorna mercados disponibles por timeframe (5m, 15m, daily, weekly, monthly)
// ============================================================

import type { VercelRequest, VercelResponse } from '@vercel/node';

const GAMMA_URL = 'https://gamma-api.polymarket.com';

// Slug patterns por asset — derivados de investigación directa de Polymarket
const ASSET_PATTERNS: Record<string, Record<string, string[]>> = {
  btc: {
    '5m': ['btc-updown-5m-'],
    '15m': ['btc-updown-15m-'],
    'daily': ['bitcoin-above-', 'btc-above-'],
    'weekly': ['what-price-will-bitcoin-hit-', 'bitcoin-hit-'],
    'monthly': ['what-price-will-bitcoin-hit-in-', 'will-bitcoin-reach-'],
  },
  eth: {
    '5m': ['eth-updown-5m-'],
    '15m': ['eth-updown-15m-'],
    'daily': ['ethereum-above-', 'eth-above-'],
    'weekly': ['what-price-will-ethereum-hit-'],
    'monthly': ['what-price-will-ethereum-hit-in-', 'will-ethereum-reach-'],
  },
  sol: {
    '5m': ['sol-updown-5m-'],
    '15m': ['sol-updown-15m-'],
    'daily': ['solana-above-', 'sol-above-'],
    'weekly': ['what-price-will-solana-hit-'],
    'monthly': ['what-price-will-solana-hit-in-', 'will-solana-reach-'],
  },
  xrp: {
    '5m': ['xrp-updown-5m-'],
    '15m': ['xrp-updown-15m-'],
    'daily': ['xrp-above-', 'ripple-above-'],
    'weekly': ['what-price-will-xrp-hit-'],
    'monthly': ['what-price-will-xrp-hit-in-', 'will-xrp-reach-'],
  },
};

interface MarketInfo {
  slug: string;
  conditionId: string;
  question: string;
  yesPrice: number;
  noPrice: number;
  endDate: string;
  volume: number;
}

function parseOutcomePrices(raw: string | string[]): number[] {
  if (Array.isArray(raw)) return raw.map(Number);
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(Number) : [0, 0];
  } catch {
    return [0, 0];
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const asset = ((req.query.asset as string) || 'btc').toLowerCase();
  const patterns = ASSET_PATTERNS[asset];

  if (!patterns) {
    return res.status(400).json({
      error: `Unsupported asset: ${asset}. Supported: ${Object.keys(ASSET_PATTERNS).join(', ')}`,
    });
  }

  try {
    // Bulk-fetch active markets (Gamma API no soporta slug_contains)
    const response = await fetch(
      `${GAMMA_URL}/markets?active=true&closed=false&limit=200&order=volume24hr&ascending=false`
    );

    if (!response.ok) {
      throw new Error(`Gamma API: ${response.status}`);
    }

    const allMarkets: any[] = await response.json();
    const now = Date.now();

    const markets: Record<string, MarketInfo> = {};

    // Para cada timeframe, buscar el mejor match
    for (const [tf, slugPatterns] of Object.entries(patterns)) {
      for (const pattern of slugPatterns) {
        const matches = allMarkets.filter((m: any) => {
          const slug = (m.slug || '').toLowerCase();
          return slug.startsWith(pattern) || slug.includes(pattern);
        });

        // Filtrar expirados y tomar el más próximo a vencer (más relevante)
        const valid = matches
          .filter((m: any) => new Date(m.endDate).getTime() > now)
          .sort((a: any, b: any) => new Date(a.endDate).getTime() - new Date(b.endDate).getTime());

        if (valid.length > 0) {
          const m = valid[0];
          const prices = parseOutcomePrices(m.outcomePrices);
          markets[tf] = {
            slug: m.slug,
            conditionId: m.conditionId || '',
            question: m.question || m.slug,
            yesPrice: prices[0] || 0,
            noPrice: prices[1] || 0,
            endDate: m.endDate,
            volume: parseFloat(m.volume) || 0,
          };
          break; // Encontramos match para este tf
        }
      }
    }

    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=30');
    return res.status(200).json({
      ok: true,
      asset: asset.toUpperCase(),
      markets,
      availableTimeframes: Object.keys(markets),
      meta: { computedAt: new Date().toISOString(), totalMarketsScanned: allMarkets.length },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('[DiscoverMarkets] ERROR', msg);
    return res.status(500).json({ ok: false, error: msg });
  }
}
