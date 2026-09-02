// ============================================================
// POST /api/voice-tool
// Executes a tool the Realtime voice session asked for, server-side.
//
// The browser never talks to data providers directly and never holds a key.
// Every branch here is READ-ONLY. `propose_trade` returns a draft for the UI
// to render as a confirmation card — it does not place, sign or settle anything.
// ============================================================

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { isEquitySymbol, normalizeAssetSymbol } from '../src/lib/voice-assets.js';
import { analyzeCandles, analysisSummary, type Candle } from '../src/lib/market-indicators.js';
import { buildDeskBrief, type DeskBriefLanguage } from '../src/lib/voice-desk-brief.js';
import { buildTechnicalMarketSummary, type TechnicalRegime } from '../src/lib/bobby-technical.js';
import { getBaseVenues, resolveOkxInstrument } from '../src/lib/okx-asset-search.js';
import { fetchOkxIndicatorBundle } from './_lib/okx-indicators.js';
import { enforcePublicRateLimit } from './_lib/request-security.js';

export const config = { maxDuration: 60 };

const SELF = process.env.BOBBY_PROTOCOL_BASE_URL || 'https://bobbyprotocol.xyz';

type ToolName = 'get_market' | 'run_debate' | 'get_protocol_stats' | 'propose_trade';

const ALLOWED: ToolName[] = ['get_market', 'run_debate', 'get_protocol_stats', 'propose_trade'];

async function getJson(url: string, init?: RequestInit) {
  const response = await fetch(url, {
    ...init,
    // A partial brief is better than a silent desk. Independent sources fail
    // closed after 15s so the whole parallel evidence packet stays well under
    // the product's 60-second response budget.
    signal: init?.signal ?? AbortSignal.timeout(15_000),
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });
  if (!response.ok) throw new Error(`${url} → ${response.status}`);
  return response.json();
}

/**
 * Where an asset actually trades. The static voice list knows the classic
 * equities; the live OKX catalog knows every tokenized-stock swap (CRCL, SNDK,
 * SPCX...) the search can return, so those no longer fall through to a
 * non-existent CRCL-USDT spot pair and come back "unavailable".
 */
interface AssetVenue {
  isEquity: boolean;
  /** OKX instrument to read indicators/candles from, when one exists. */
  okxInstId: string | null;
}

async function resolveVenue(ticker: string): Promise<AssetVenue> {
  const venues = await getBaseVenues(ticker).catch(() => ({ spotId: null, swapId: null }));
  let isEquity = isEquitySymbol(ticker);
  if (!isEquity && !venues.spotId) {
    const instrument = await resolveOkxInstrument(ticker).catch(() => null);
    if (instrument && instrument.baseSymbol === ticker && instrument.assetClass === 'equity') isEquity = true;
  }
  const okxInstId = isEquity ? venues.swapId ?? venues.spotId : venues.spotId ?? venues.swapId;
  return { isEquity, okxInstId };
}

function okxTickerToMarket(ticker: string, t: Record<string, string>, funding?: Record<string, string>, extra: Record<string, unknown> = {}) {
  const last = Number(t.last);
  // okx-market normalizes the 24h move as `change24h` (percent). Reading the
  // raw `open24h` field here left every crypto header without a % move.
  const changePct = t.change24h !== undefined && t.change24h !== null && Number.isFinite(Number(t.change24h))
    ? Number(Number(t.change24h).toFixed(2))
    : Number(t.open24h) ? Number((((last - Number(t.open24h)) / Number(t.open24h)) * 100).toFixed(2)) : null;
  return {
    symbol: ticker,
    ...extra,
    price: last,
    change_24h_pct: changePct,
    high_24h: Number(t.high24h),
    low_24h: Number(t.low24h),
    funding_rate: funding?.fundingRate ? Number(funding.fundingRate) : null,
  };
}

async function getMarket(symbol: string, venue?: AssetVenue) {
  // Same registry the chart reads, so Bobby can never quote one venue while
  // the human is looking at candles from the other.
  const ticker = normalizeAssetSymbol(symbol);
  if (!symbol) throw new Error('symbol required');
  const resolved = venue ?? (await resolveVenue(ticker));
  if (resolved.isEquity) {
    const stock = (await getJson(`${SELF}/api/stock-price?symbols=${ticker}`).catch(() => ({}))) as { quotes?: Array<Record<string, number | string>> };
    const quote = stock.quotes?.[0];
    if (quote && Number(quote.price)) {
      return {
        symbol: ticker, assetType: 'equity', currency: 'USD', marketStatus: 'market-data', available: true,
        price: Number(quote.price), change_24h_pct: Number(quote.change24h || 0), high_24h: Number(quote.dayHigh || 0), low_24h: Number(quote.dayLow || 0),
      };
    }
    // Yahoo has no quote (OKX-only listing, > 5-letter symbol): the tokenized
    // swap is a real 24/7 market with its own last price.
    if (resolved.okxInstId) {
      const data = await getJson(`${SELF}/api/okx-market?instId=${resolved.okxInstId}&type=all`).catch(() => ({}));
      const t = (data as { ticker?: Record<string, string> }).ticker;
      if (t?.last) {
        return okxTickerToMarket(ticker, t, undefined, {
          assetType: 'equity', currency: 'USDT', marketStatus: 'tokenized-swap', available: true, instId: resolved.okxInstId,
        });
      }
    }
    return { symbol: ticker, available: false, assetType: 'equity', price: null };
  }
  const data = await getJson(`${SELF}/api/okx-market?instId=${ticker}-USDT&type=all`);
  const t = (data as { ticker?: Record<string, string> }).ticker;
  const funding = (data as { funding?: Record<string, string> }).funding;
  if (!t?.last) return { symbol: ticker, available: false, price: null };
  return okxTickerToMarket(ticker, t, funding);
}

function legacyOkxMarketShape(t: Record<string, string>, ticker: string, funding?: Record<string, string>) {
  const last = Number(t.last);
  const open = Number(t.open24h);
  return {
    symbol: ticker,
    price: last,
    change_24h_pct: open ? Number((((last - open) / open) * 100).toFixed(2)) : null,
    high_24h: Number(t.high24h),
    low_24h: Number(t.low24h),
    funding_rate: funding?.fundingRate ? Number(funding.fundingRate) : null,
  };
}
void legacyOkxMarketShape;

function normalizeCandles(payload: { candles?: Array<Record<string, number | string>> }): Candle[] {
  return (payload.candles ?? [])
    .map((row) => ({
      time: Math.floor(Number(row.ts) / 1000),
      open: Number(row.open), high: Number(row.high),
      low: Number(row.low), close: Number(row.close), volume: Number(row.volume ?? 0),
    }))
    .filter((c) => Number.isFinite(c.close) && Number.isFinite(c.time))
    .sort((a, b) => a.time - b.time);
}

/**
 * Candles for any asset the desk can chart, normalized to one shape. Crypto
 * comes from OKX, equities and ETFs from Yahoo — the same split the chart uses.
 * When Yahoo cannot chart an equity, its tokenized OKX swap is the fallback.
 */
async function getCandles(ticker: string, venue: AssetVenue): Promise<Candle[]> {
  if (venue.isEquity) {
    const yahoo = await getJson(`${SELF}/api/stock-candles?symbol=${encodeURIComponent(ticker)}&range=7d&interval=1h`)
      .then((p) => normalizeCandles(p as { candles?: Array<Record<string, number | string>> }))
      .catch(() => [] as Candle[]);
    if (yahoo.length || !venue.okxInstId) return yahoo;
    const okx = await getJson(`${SELF}/api/okx-candles?instId=${encodeURIComponent(venue.okxInstId)}&bar=1H&limit=100`);
    return normalizeCandles(okx as { candles?: Array<Record<string, number | string>> });
  }
  const payload = await getJson(`${SELF}/api/okx-candles?instId=${encodeURIComponent(ticker)}-USDT&bar=1H&limit=100`);
  return normalizeCandles(payload as { candles?: Array<Record<string, number | string>> });
}

/** The per-asset technical read bobby-intel already computes, if it covers this asset. */
function pulseFor(intel: Record<string, unknown>, ticker: string) {
  const pulse = intel.technicalPulse as { assets?: Array<Record<string, unknown>> } | undefined;
  const asset = pulse?.assets?.find((a) => String(a.symbol).toUpperCase() === ticker);
  if (!asset) return null;
  return {
    signal: asset.signal ?? null,
    direction: asset.direction ?? null,
    conviction_pct: typeof asset.conviction === 'number' ? Math.round(asset.conviction * 100) : null,
    agreement_pct: typeof asset.agreement === 'number' ? Math.round(asset.agreement * 100) : null,
    overview: asset.overview ?? null,
    trade_plan: asset.tradePlan ?? null,
    source: 'intel' as const,
    instrument: null as string | null,
  };
}

/** Volatility regime for the indicator weights, from the asset's own 1H ATR. */
function regimeFromAtrPct(atrPct: number | null | undefined): TechnicalRegime {
  if (atrPct === null || atrPct === undefined || !Number.isFinite(atrPct)) return 'normal';
  if (atrPct >= 1.2) return 'high_vol';
  if (atrPct <= 0.45) return 'low_vol';
  return 'normal';
}

/**
 * The same multi-indicator engine bobby-intel runs for BTC/ETH/SOL, built on
 * demand for any OKX instrument — tokenized stocks included. Before this,
 * every asset outside the intel trio returned `technical_pulse: null` and the
 * app rendered "the agents did not reach consensus" for NVDA, AAPL, gold...
 * when in fact no engine had run at all.
 */
async function pulseFromOkxIndicators(ticker: string, instId: string | null, price: number | null, atrPct: number | null | undefined) {
  if (!instId || !price) return null;
  const bundle = await fetchOkxIndicatorBundle(instId, '1H');
  if (!bundle) return null;
  const summary = buildTechnicalMarketSummary([bundle], { [ticker]: price }, regimeFromAtrPct(atrPct));
  const asset = summary.assets[0];
  if (!asset) return null;
  return {
    signal: asset.signal,
    direction: asset.direction,
    conviction_pct: Math.round(asset.conviction * 100),
    agreement_pct: Math.round(asset.agreement * 100),
    overview: asset.overview,
    trade_plan: asset.tradePlan,
    source: 'okx-indicators' as const,
    instrument: instId,
  };
}

async function runDebate(symbol: string, context?: string, lang: DeskBriefLanguage = 'es') {
  const startedAt = Date.now();
  const ticker = normalizeAssetSymbol(symbol);
  const venue = await resolveVenue(ticker);
  // The indicator read never depends on the intel service — it is computed from
  // the same candles the chart is drawing, so the two can never disagree.
  const [market, intel, candles] = await Promise.all([
    getMarket(ticker, venue).catch(() => ({ symbol: ticker, available: false, price: null })),
    getJson(`${SELF}/api/bobby-intel?symbol=${ticker}`).catch(() => ({}) as Record<string, unknown>),
    getCandles(ticker, venue).catch(() => [] as Candle[]),
  ]);
  const technicals = candles.length ? analysisSummary(analyzeCandles(candles)) : null;
  const marketPrice = typeof (market as { price?: unknown }).price === 'number' ? (market as { price: number }).price : null;
  const pulse =
    pulseFor(intel as Record<string, unknown>, ticker)
    ?? (await pulseFromOkxIndicators(ticker, venue.okxInstId, marketPrice ?? technicals?.price ?? null, technicals?.atrPct).catch(() => null));
  const quickBrief = buildDeskBrief({
    symbol: ticker,
    market,
    technicals,
    lang,
    latencyMs: Date.now() - startedAt,
  });

  return {
    symbol: ticker,
    context: context ?? null,
    market,
    regime: (intel as Record<string, unknown>).regime ?? null,
    // Real readings off real candles — the anchors for the three agent zones.
    technicals,
    // Deeper multi-indicator scoring, only for the assets the intel desk covers.
    technical_pulse: pulse,
    // Deterministic first paint: the client renders this immediately while the
    // Realtime model turns the same evidence into the richer three-agent view.
    quick_brief: quickBrief,
    how_to_use:
      'Anchor Alpha on the support/demand side, Red Team on the level that breaks the thesis, and the CIO on where you would actually act. Size each zone with atrPct. Never state a level that is not derived from these numbers.',
    note: 'Analysis only. Bobby does not execute trades.',
  };
}

async function getProtocolStats() {
  const stats = (await getJson(`${SELF}/api/bobby-protocol-stats`)) as {
    contracts?: { trackRecord?: { stats?: Record<string, string> }; agentEconomy?: { stats?: Record<string, string> } };
    protocolTotals?: Record<string, unknown>;
  };
  const tr = stats.contracts?.trackRecord?.stats ?? {};
  const ec = stats.contracts?.agentEconomy?.stats ?? {};
  // Audit Base r4 (MEDIUM): never hand the model a naked win rate. The sample
  // size travels WITH the number, and tiny samples are flagged so Bobby cannot
  // honestly say "100% effectiveness" over one resolved trade.
  const revealed = Number(tr.totalTrades ?? 0);
  const winRatePct = tr.winRateBps ? Number(tr.winRateBps) / 100 : null;
  return {
    decisions_committed: tr.totalCommitments ?? null,
    decisions_revealed: revealed,
    win_rate:
      winRatePct === null || revealed === 0
        ? null
        : {
            pct: winRatePct,
            sample_size: revealed,
            statistically_meaningful: revealed >= 20,
            how_to_say_it:
              revealed >= 20
                ? `${winRatePct}% over ${revealed} resolved decisions`
                : `only ${revealed} resolved decision${revealed === 1 ? '' : 's'} so far — too few to quote a percentage as skill`,
          },
    mcp_calls: ec.totalMcpCalls ?? null,
    total_interactions: stats.protocolTotals?.totalInteractions ?? null,
    basis: 'paper/simulated track record, committed on-chain before outcome',
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!await enforcePublicRateLimit(req, res, 'voice-tool', 60, 60)) return;

  const { tool, args } = (req.body ?? {}) as { tool?: ToolName; args?: Record<string, unknown> };

  if (!tool || !ALLOWED.includes(tool)) {
    return res.status(400).json({ error: `unknown tool`, allowed: ALLOWED });
  }

  try {
    switch (tool) {
      case 'get_market':
        return res.status(200).json(await getMarket(String(args?.symbol ?? '')));

      case 'run_debate':
        return res.status(200).json(
          await runDebate(
            String(args?.symbol ?? ''),
            args?.context ? String(args.context) : undefined,
            args?.lang === 'en' ? 'en' : 'es',
          ),
        );

      case 'get_protocol_stats':
        return res.status(200).json(await getProtocolStats());

      // Draft only. Rendered as a card the human must approve; nothing is sent
      // anywhere and no position is opened by this endpoint.
      case 'propose_trade':
        return res.status(200).json({
          status: 'awaiting_human_confirmation',
          proposal: {
            symbol: String(args?.symbol ?? '').toUpperCase(),
            direction: args?.direction === 'short' ? 'short' : 'long',
            size_usd: args?.size_usd ?? null,
            entry: args?.entry ?? null,
            stop: args?.stop ?? null,
            rationale: args?.rationale ?? null,
          },
          note: 'Rendered on screen as a proposal. Not executed. The human must confirm it themselves.',
        });
    }
  } catch (error) {
    console.error('[VoiceTool]', tool, error instanceof Error ? error.message : error);
    return res.status(200).json({ error: 'tool_failed', tool, detail: 'Data unavailable right now.' });
  }
}
