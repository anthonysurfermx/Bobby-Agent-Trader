// ============================================================
// api/_lib/dm-analysis.ts — Bobby CIO verdict for a Telegram DM
// ------------------------------------------------------------
// "Todo el análisis de la terminal en un mensaje de voz."
// Pulls REAL live market data from OKX v5 public endpoints
// (no API key needed) and asks the CIO persona for a sharp
// Spanish verdict. No hardcoded analysis — numbers are real,
// the verdict text is LLM-generated. (no-hardcode rule)
// ============================================================

const OKX = 'https://www.okx.com';

// Common aliases → OKX base symbol. Extend as needed.
const KNOWN: Record<string, string> = {
  BTC: 'BTC', BITCOIN: 'BTC', XBT: 'BTC',
  ETH: 'ETH', ETHEREUM: 'ETH', ETHER: 'ETH',
  SOL: 'SOL', SOLANA: 'SOL',
  BNB: 'BNB', XRP: 'XRP', RIPPLE: 'XRP',
  DOGE: 'DOGE', OKB: 'OKB', ADA: 'ADA', CARDANO: 'ADA',
  AVAX: 'AVAX', LINK: 'LINK', CHAINLINK: 'LINK',
  SUI: 'SUI', TON: 'TON', PEPE: 'PEPE', WIF: 'WIF',
  ARB: 'ARB', OP: 'OP', LTC: 'LTC', TRX: 'TRX',
};

/** Detect a ticker in free-form text; defaults to BTC (market proxy). */
export function detectSymbol(text: string): string {
  const up = (text || '').toUpperCase();
  for (const key of Object.keys(KNOWN)) {
    if (new RegExp(`\\b${key}\\b`).test(up)) return KNOWN[key];
  }
  return 'BTC';
}

async function okxGet(path: string): Promise<any[]> {
  try {
    const res = await fetch(`${OKX}${path}`, { headers: { 'Content-Type': 'application/json' } });
    if (!res.ok) return [];
    const json = (await res.json()) as { code?: string; data?: any[] };
    if (!json || json.code !== '0') return [];
    return json.data || [];
  } catch {
    return [];
  }
}

export interface MarketSnapshot {
  symbol: string;
  price: number;
  change24h: number;
  high24h: number;
  low24h: number;
  vol24h: number;
  fundingRate: number | null;
  fundingAnnual: number | null;
  oi: number | null;
  trend7d: number | null;
}

/** Fetch a live OKX snapshot (ticker + funding + OI + 7d trend) for a symbol. */
export async function fetchSnapshot(symbol: string): Promise<MarketSnapshot | null> {
  const spot = `${symbol}-USDT`;
  const swap = `${symbol}-USDT-SWAP`;
  const [tickers, funding, oi, candles] = await Promise.all([
    okxGet(`/api/v5/market/ticker?instId=${spot}`),
    okxGet(`/api/v5/public/funding-rate?instId=${swap}`),
    okxGet(`/api/v5/public/open-interest?instType=SWAP&instId=${swap}`),
    okxGet(`/api/v5/market/candles?instId=${spot}&bar=1D&limit=8`),
  ]);
  if (tickers.length === 0) return null;

  const t = tickers[0];
  const last = parseFloat(t.last);
  const open24h = parseFloat(t.open24h);
  const change24h = open24h > 0 ? ((last - open24h) / open24h) * 100 : 0;

  let trend7d: number | null = null;
  if (candles.length >= 7) {
    // OKX candles are newest-first; [0]=latest, index 6 ≈ 7 days ago. Close = idx 4.
    const latest = parseFloat(candles[0][4]);
    const weekAgo = parseFloat(candles[Math.min(6, candles.length - 1)][4]);
    if (weekAgo > 0) trend7d = ((latest - weekAgo) / weekAgo) * 100;
  }

  const f = funding[0];
  const fr = f ? parseFloat(f.fundingRate) : null;

  return {
    symbol,
    price: last,
    change24h: +change24h.toFixed(2),
    high24h: parseFloat(t.high24h),
    low24h: parseFloat(t.low24h),
    vol24h: parseFloat(t.volCcy24h || t.vol24h || '0'),
    fundingRate: fr,
    fundingAnnual: fr != null ? +(fr * 3 * 365 * 100).toFixed(2) : null,
    oi: oi[0] ? parseFloat(oi[0].oiCcy) : null,
    trend7d: trend7d != null ? +trend7d.toFixed(2) : null,
  };
}

export interface DmVerdict {
  voiceScript: string;
  captionHtml: string;
  direction: string;
  conviction: number;
}

const SYSTEM_PROMPT = `Eres Bobby, el CIO soberano de Bobby Agent Trader — arquetipo Bobby Axelrod. Brutalmente honesto, agudo, con vocabulario de trader profesional. Hablas ESPAÑOL neutro latino. Proteges el capital como si fuera tuyo. No prometes, demuestras. Recibes datos REALES de mercado de OKX en vivo y entregas un veredicto claro y accionable. Nunca inventas números: usa solo los datos provistos.`;

function buildUserPrompt(s: MarketSnapshot): string {
  return `DATOS REALES OKX (en vivo) para ${s.symbol}:
- Precio: $${s.price}
- Cambio 24h: ${s.change24h}%
- Rango 24h: $${s.low24h} – $${s.high24h}
- Tendencia 7d: ${s.trend7d != null ? s.trend7d + '%' : 'n/d'}
- Funding rate: ${s.fundingRate != null ? (s.fundingRate * 100).toFixed(4) + '% (' + s.fundingAnnual + '% anualizado)' : 'n/d'}
- Open Interest: ${s.oi != null ? s.oi.toLocaleString('en-US') : 'n/d'}

Entrega tu veredicto de CIO.`;
}

const VERDICT_TOOL = {
  type: 'function' as const,
  function: {
    name: 'emit_verdict',
    description: 'Veredicto del CIO Bobby sobre el activo.',
    parameters: {
      type: 'object',
      properties: {
        voice_script: {
          type: 'string',
          description:
            'Texto HABLADO en español neutro, 60-100 palabras (~25-40s al leerse). Tono Bobby Axelrod: directo, con autoridad. SIN markdown, SIN emojis, SIN símbolos como $ o % (escribe "dólares", "por ciento"). Menciona la dirección, la conviction (di "conviction X sobre 10"), niveles aproximados de entrada/stop/objetivo y el riesgo clave. Empieza con un gancho.',
        },
        direction: { type: 'string', enum: ['long', 'short', 'neutral'] },
        conviction: { type: 'number', description: 'Entero 1-10.' },
        entry: { type: 'string', description: 'Nivel/zona de entrada, p.ej. "67.2k–67.5k" o "n/d".' },
        stop: { type: 'string', description: 'Stop loss sugerido o "n/d".' },
        target: { type: 'string', description: 'Objetivo o "n/d".' },
        thesis: { type: 'string', description: 'Una frase: la tesis central en español.' },
        key_risk: { type: 'string', description: 'Una frase: el riesgo principal en español.' },
      },
      required: ['voice_script', 'direction', 'conviction', 'thesis', 'key_risk'],
    },
  },
};

/** Ask the CIO persona for a structured Spanish verdict from a live snapshot. */
export async function generateDmVerdict(
  symbol: string,
  snapshot: MarketSnapshot,
): Promise<DmVerdict | null> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    console.error('[dm-analysis] OPENAI_API_KEY missing');
    return null;
  }

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: process.env.DM_MODEL || 'gpt-4o',
      max_tokens: 700,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: buildUserPrompt(snapshot) },
      ],
      tools: [VERDICT_TOOL],
      tool_choice: { type: 'function', function: { name: 'emit_verdict' } },
    }),
  });

  if (!res.ok) {
    console.error('[dm-analysis] openai', res.status, (await res.text()).slice(0, 180));
    return null;
  }

  const data = (await res.json()) as any;
  const call = data.choices?.[0]?.message?.tool_calls?.[0];
  if (!call?.function?.arguments) return null;

  let v: any;
  try {
    v = JSON.parse(call.function.arguments);
  } catch {
    return null;
  }
  if (!v.voice_script) return null;

  const conv = Math.max(1, Math.min(10, Math.round(v.conviction || 0)));
  const dirLabel =
    v.direction === 'long' ? '🟢 LONG' : v.direction === 'short' ? '🔴 SHORT' : '⚪ NEUTRAL';
  const s = snapshot;
  const sign = s.change24h >= 0 ? '+' : '';

  const captionHtml =
    `🎯 <b>Bobby CIO — ${symbol}</b>\n\n` +
    `${dirLabel} · Conviction <b>${conv}/10</b>\n` +
    `💵 $${s.price} (${sign}${s.change24h}% 24h)\n\n` +
    `<i>${v.thesis}</i>\n\n` +
    (v.entry && v.entry !== 'n/d' ? `📍 Entrada: ${v.entry}\n` : '') +
    (v.stop && v.stop !== 'n/d' ? `🛑 Stop: ${v.stop}\n` : '') +
    (v.target && v.target !== 'n/d' ? `🎯 Objetivo: ${v.target}\n` : '') +
    `⚠️ Riesgo: ${v.key_risk}\n\n` +
    `<i>Datos en vivo de OKX · Bobby Agent Trader</i>`;

  return { voiceScript: v.voice_script, captionHtml, direction: v.direction, conviction: conv };
}

export interface DmAnalysisResult {
  ok: boolean;
  symbol?: string;
  verdict?: DmVerdict;
  error?: string;
}

/** End-to-end: query string → live snapshot → CIO verdict. */
export async function runDmAnalysis(query: string): Promise<DmAnalysisResult> {
  const symbol = detectSymbol(query);
  const snapshot = await fetchSnapshot(symbol);
  if (!snapshot) {
    return { ok: false, error: `No pude leer datos de ${symbol} en OKX ahora mismo. Intenta de nuevo en un momento.` };
  }
  const verdict = await generateDmVerdict(symbol, snapshot);
  if (!verdict) {
    return { ok: false, error: 'El motor de inteligencia no respondió. Intenta de nuevo en un momento.' };
  }
  return { ok: true, symbol, verdict };
}
