// ============================================================
// api/_lib/dm-analysis.ts — Bobby CIO verdict for a Telegram DM
// ------------------------------------------------------------
// "Todo el análisis de la terminal en un mensaje de voz."
// Pulls REAL live market data from OKX v5 public endpoints
// (no API key needed) and asks the CIO persona for a sharp
// verdict in the bot's language. No hardcoded analysis —
// numbers are real, the verdict text is LLM-generated.
// (no-hardcode rule)
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

type Lang = 'es' | 'en';

interface LangStrings {
  system: string;
  voiceDesc: string;
  thesisDesc: string;
  riskDesc: string;
  entryDesc: string;
  stopDesc: string;
  targetDesc: string;
  dataHeader: (s: string) => string;
  rowPrice: string;
  rowChange: string;
  rowRange: string;
  rowTrend: string;
  rowFunding: string;
  rowOi: string;
  annualized: string;
  deliver: string;
  capEntry: string;
  capStop: string;
  capTarget: string;
  capRisk: string;
  capFooter: string;
  errData: (s: string) => string;
  errEngine: string;
}

const I18N: Record<Lang, LangStrings> = {
  es: {
    system: `Eres Bobby, el CIO soberano de Bobby Agent Trader — arquetipo Bobby Axelrod. Brutalmente honesto, agudo, con vocabulario de trader profesional. Hablas ESPAÑOL neutro latino. Proteges el capital como si fuera tuyo. No prometes, demuestras. Recibes datos REALES de mercado de OKX en vivo y entregas un veredicto claro y accionable. Nunca inventas números: usa solo los datos provistos.`,
    voiceDesc:
      'Texto HABLADO en español neutro, 60-100 palabras (~25-40s al leerse). Tono Bobby Axelrod: directo, con autoridad. SIN markdown, SIN emojis, SIN símbolos como $ o % (escribe "dólares", "por ciento"). Menciona la dirección, la conviction (di "conviction X sobre 10"), niveles aproximados de entrada/stop/objetivo y el riesgo clave. Empieza con un gancho.',
    thesisDesc: 'Una frase: la tesis central en español.',
    riskDesc: 'Una frase: el riesgo principal en español.',
    entryDesc: 'Nivel/zona de entrada, p.ej. "67.2k–67.5k" o "n/d".',
    stopDesc: 'Stop loss sugerido o "n/d".',
    targetDesc: 'Objetivo o "n/d".',
    dataHeader: (s: string) => `DATOS REALES OKX (en vivo) para ${s}:`,
    rowPrice: 'Precio', rowChange: 'Cambio 24h', rowRange: 'Rango 24h', rowTrend: 'Tendencia 7d',
    rowFunding: 'Funding rate', rowOi: 'Open Interest', annualized: 'anualizado', deliver: 'Entrega tu veredicto de CIO.',
    capEntry: 'Entrada', capStop: 'Stop', capTarget: 'Objetivo', capRisk: 'Riesgo',
    capFooter: 'Datos en vivo de OKX · Bobby Agent Trader',
    errData: (s: string) => `No pude leer datos de ${s} en OKX ahora mismo. Intenta de nuevo en un momento.`,
    errEngine: 'El motor de inteligencia no respondió. Intenta de nuevo en un momento.',
  },
  en: {
    system: `You are Bobby, the Sovereign CIO of Bobby Agent Trader — a Bobby Axelrod archetype. Brutally honest, sharp, fluent in professional trader vocabulary. You speak ENGLISH. You protect capital like it's your own. You don't promise, you prove. You receive REAL live OKX market data and deliver a clear, actionable verdict. Never invent numbers: use only the data provided.`,
    voiceDesc:
      'SPOKEN text in English, 60-100 words (~25-40s read aloud). Bobby Axelrod tone: direct, authoritative. NO markdown, NO emojis, NO symbols like $ or % (write "dollars", "percent"). Mention the direction, conviction (say "conviction X out of 10"), approximate entry/stop/target levels and the key risk. Open with a hook.',
    thesisDesc: 'One sentence: the core thesis in English.',
    riskDesc: 'One sentence: the key risk in English.',
    entryDesc: 'Entry level/zone, e.g. "67.2k–67.5k" or "n/a".',
    stopDesc: 'Suggested stop loss or "n/a".',
    targetDesc: 'Target or "n/a".',
    dataHeader: (s: string) => `REAL live OKX data for ${s}:`,
    rowPrice: 'Price', rowChange: '24h change', rowRange: '24h range', rowTrend: '7d trend',
    rowFunding: 'Funding rate', rowOi: 'Open Interest', annualized: 'annualized', deliver: 'Deliver your CIO verdict.',
    capEntry: 'Entry', capStop: 'Stop', capTarget: 'Target', capRisk: 'Risk',
    capFooter: 'Live OKX data · Bobby Agent Trader',
    errData: (s: string) => `Couldn't read ${s} data from OKX right now. Try again in a moment.`,
    errEngine: 'The intelligence engine did not respond. Try again in a moment.',
  },
};

function buildUserPrompt(s: MarketSnapshot, t: LangStrings): string {
  return `${t.dataHeader(s.symbol)}
- ${t.rowPrice}: $${s.price}
- ${t.rowChange}: ${s.change24h}%
- ${t.rowRange}: $${s.low24h} – $${s.high24h}
- ${t.rowTrend}: ${s.trend7d != null ? s.trend7d + '%' : 'n/d'}
- ${t.rowFunding}: ${s.fundingRate != null ? (s.fundingRate * 100).toFixed(4) + '% (' + s.fundingAnnual + '% ' + t.annualized + ')' : 'n/d'}
- ${t.rowOi}: ${s.oi != null ? s.oi.toLocaleString('en-US') : 'n/d'}

${t.deliver}`;
}

function buildTool(t: LangStrings) {
  return {
    type: 'function' as const,
    function: {
      name: 'emit_verdict',
      description: 'Bobby CIO verdict on the asset.',
      parameters: {
        type: 'object',
        properties: {
          voice_script: { type: 'string', description: t.voiceDesc },
          direction: { type: 'string', enum: ['long', 'short', 'neutral'] },
          conviction: { type: 'number', description: '1-10 integer.' },
          entry: { type: 'string', description: t.entryDesc },
          stop: { type: 'string', description: t.stopDesc },
          target: { type: 'string', description: t.targetDesc },
          thesis: { type: 'string', description: t.thesisDesc },
          key_risk: { type: 'string', description: t.riskDesc },
        },
        required: ['voice_script', 'direction', 'conviction', 'thesis', 'key_risk'],
      },
    },
  };
}

// Gemini native structured-output schema (OpenAPI subset, uppercase types).
function geminiSchema(t: LangStrings) {
  return {
    type: 'OBJECT',
    properties: {
      voice_script: { type: 'STRING', description: t.voiceDesc },
      direction: { type: 'STRING', enum: ['long', 'short', 'neutral'] },
      conviction: { type: 'INTEGER', description: '1-10' },
      entry: { type: 'STRING', description: t.entryDesc },
      stop: { type: 'STRING', description: t.stopDesc },
      target: { type: 'STRING', description: t.targetDesc },
      thesis: { type: 'STRING', description: t.thesisDesc },
      key_risk: { type: 'STRING', description: t.riskDesc },
    },
    required: ['voice_script', 'direction', 'conviction', 'thesis', 'key_risk'],
    propertyOrdering: ['voice_script', 'direction', 'conviction', 'entry', 'stop', 'target', 'thesis', 'key_risk'],
  };
}

async function callGemini(key: string, t: LangStrings, snapshot: MarketSnapshot): Promise<any> {
  const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: t.system }] },
        contents: [{ role: 'user', parts: [{ text: buildUserPrompt(snapshot, t) }] }],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 1200,
          responseMimeType: 'application/json',
          responseSchema: geminiSchema(t),
          // Gemini 2.5 "thinking" eats output tokens and truncates the JSON;
          // disable it — we want the structured verdict directly.
          thinkingConfig: { thinkingBudget: 0 },
        },
      }),
    },
  );
  if (!res.ok) throw new Error(`gemini ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = (await res.json()) as any;
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('gemini: empty response');
  return JSON.parse(text);
}

async function callOpenAI(key: string, t: LangStrings, snapshot: MarketSnapshot): Promise<any> {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: process.env.DM_MODEL || 'gpt-4o-mini',
      max_tokens: 700,
      messages: [
        { role: 'system', content: t.system },
        { role: 'user', content: buildUserPrompt(snapshot, t) },
      ],
      tools: [buildTool(t)],
      tool_choice: { type: 'function', function: { name: 'emit_verdict' } },
    }),
  });
  if (!res.ok) throw new Error(`openai ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = (await res.json()) as any;
  const args = data.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
  if (!args) throw new Error('openai: no tool call returned');
  return JSON.parse(args);
}

/** Provider-agnostic verdict. Gemini (free tier) first, OpenAI fallback. */
async function callLLM(t: LangStrings, snapshot: MarketSnapshot): Promise<any | null> {
  const geminiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;
  const provider = (process.env.DM_PROVIDER || (geminiKey ? 'gemini' : 'openai')).toLowerCase();

  const tryGemini = () => {
    if (!geminiKey) throw new Error('GEMINI_API_KEY missing');
    return callGemini(geminiKey, t, snapshot);
  };
  const tryOpenAI = () => {
    if (!openaiKey) throw new Error('OPENAI_API_KEY missing');
    return callOpenAI(openaiKey, t, snapshot);
  };
  const chain = provider === 'openai' ? [tryOpenAI, tryGemini] : [tryGemini, tryOpenAI];

  for (const fn of chain) {
    try {
      return await fn();
    } catch (e) {
      console.error('[dm-analysis] llm', e instanceof Error ? e.message : e);
    }
  }
  return null;
}

/** Ask the CIO persona for a structured verdict from a live snapshot. */
export async function generateDmVerdict(
  symbol: string,
  snapshot: MarketSnapshot,
  lang: Lang = 'es',
): Promise<DmVerdict | null> {
  const t = I18N[lang] || I18N.es;
  const v = await callLLM(t, snapshot);
  if (!v || !v.voice_script) return null;

  const conv = Math.max(1, Math.min(10, Math.round(v.conviction || 0)));
  const dirLabel =
    v.direction === 'long' ? '🟢 LONG' : v.direction === 'short' ? '🔴 SHORT' : '⚪ NEUTRAL';
  const s = snapshot;
  const sign = s.change24h >= 0 ? '+' : '';
  const naSet = new Set(['n/d', 'n/a', 'na', '']);
  const has = (x: string | undefined) => x != null && !naSet.has(String(x).toLowerCase().trim());

  const captionHtml =
    `🎯 <b>Bobby CIO — ${symbol}</b>\n\n` +
    `${dirLabel} · Conviction <b>${conv}/10</b>\n` +
    `💵 $${s.price} (${sign}${s.change24h}% 24h)\n\n` +
    `<i>${v.thesis}</i>\n\n` +
    (has(v.entry) ? `📍 ${t.capEntry}: ${v.entry}\n` : '') +
    (has(v.stop) ? `🛑 ${t.capStop}: ${v.stop}\n` : '') +
    (has(v.target) ? `🎯 ${t.capTarget}: ${v.target}\n` : '') +
    `⚠️ ${t.capRisk}: ${v.key_risk}\n\n` +
    `<i>${t.capFooter}</i>`;

  return { voiceScript: v.voice_script, captionHtml, direction: v.direction, conviction: conv };
}

export interface DmAnalysisResult {
  ok: boolean;
  symbol?: string;
  verdict?: DmVerdict;
  error?: string;
}

/** End-to-end: query string → live snapshot → CIO verdict (in `lang`). */
export async function runDmAnalysis(query: string, lang: Lang = 'es'): Promise<DmAnalysisResult> {
  const t = I18N[lang] || I18N.es;
  const symbol = detectSymbol(query);
  const snapshot = await fetchSnapshot(symbol);
  if (!snapshot) return { ok: false, error: t.errData(symbol) };
  const verdict = await generateDmVerdict(symbol, snapshot, lang);
  if (!verdict) return { ok: false, error: t.errEngine };
  return { ok: true, symbol, verdict };
}
