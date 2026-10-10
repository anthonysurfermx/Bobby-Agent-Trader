// ============================================================
// The agent engine: the tools its one agent may ask for, and the arithmetic no model is allowed to do.
//
// The server owns every tool: the model names one and proposes arguments, code validates them (zod), decides
// whether the person must approve first (`metered`), runs it and writes what it found as EVIDENCE and FIGURES.
// Whatever a tool returns is data. Nothing in it can grant a permission, add a tool or change an instruction.
//
// Tools of this version (TOOLSET_VERSION):
//   · resolve_assets  free. Which instruments a mention means, inside the universe the engine can read
//     with evidence. Deterministic, no network: an alias table, exact after folding case and accents.
//   · read_assets  METERED: one read of the person's allowance, asked for before it runs. Daily bars
//     of one, two or three instruments over one window (the model gives names as the person wrote them; the
//     server turns them into symbols, and a name it cannot read is refused before the person is asked anything), read by the strict reader of the harness
//     (api/_lib/harness/bars.ts: the same provider request as /api/asset-fact, so there is one source and one
//     as-of per instrument), then compared by code.
// What the engine cannot establish is not here on purpose: a fund's holdings or concentration, fees,
// fundamentals, news, forecasts. The agent is told to say so (loop.ts) instead of answering from memory.
//
// Arithmetic rules (each has a test):
//   · Percent is always percent (12.3 means 12.3 %), never a fraction; a price is in the series' own currency.
//   · A figure is computed only from a series the reader accepted. A refused series gives evidence with a
//     quality other than `valid`, figures with value null, and a limitation: never a zero.
//   · Instruments of different trading calendars are compared on the days both traded, and the figure says so.
//   · The window is the same for every instrument and is stated in every figure's basis.
// ============================================================
import { z } from 'zod';
import { providerUrl } from '../../asset-fact.js';
import { parseOkxDaily, parseYahooDaily, validateBars, type AssetClass, type BarSeries, type DailyBar } from '../harness/bars.js';
import type { Analysis, ApprovalScope, Evidence, Figure, Quality } from './types.js';

export interface ToolContext { now: () => Date; /** One provider request; null on any transport or HTTP failure. */ fetchJson: (url: string) => Promise<unknown | null> }
export interface ToolOutput { evidence: Evidence[]; data: Record<string, unknown>; analysis?: Analysis }
export interface Tool<A = unknown> {
  name: string; description: string; metered: boolean;
  schema: z.ZodType<A>; wire: Record<string, unknown>;
  /** Turns what the model wrote into what will run (names into symbols), or says why it cannot: checked by the server before anything is asked of the person. */
  prepare?: (args: A) => { ok: true; args: unknown } | { ok: false; reason: string; detail: string };
  /** What the person is asked to approve, for a metered tool. Given the prepared arguments. */
  scope?: (args: any) => Omit<ApprovalScope, 'digest'>;
  run: (args: any, ctx: ToolContext) => Promise<ToolOutput>;
}

// ---------- the universe: what the engine can read with evidence ----------
interface Instrument { symbol: string; name: string; kind: 'crypto' | 'equity' | 'etf'; assetClass: AssetClass; aliases: readonly string[] }
export const UNIVERSE: readonly Instrument[] = [
  { symbol: 'BTC', name: 'Bitcoin', kind: 'crypto', assetClass: 'crypto', aliases: ['bitcoin', 'btc'] },
  { symbol: 'ETH', name: 'Ethereum', kind: 'crypto', assetClass: 'crypto', aliases: ['ethereum', 'eth', 'ether'] },
  { symbol: 'SOL', name: 'Solana', kind: 'crypto', assetClass: 'crypto', aliases: ['solana', 'sol'] },
  { symbol: 'SPY', name: 'SPDR S&P 500 ETF', kind: 'etf', assetClass: 'equity', aliases: ['spy', 's&p 500', 'sp500', 's&p500', 'sp 500', 'etf del s&p 500', 's&p 500 etf'] },
  { symbol: 'QQQ', name: 'Invesco QQQ (Nasdaq-100) ETF', kind: 'etf', assetClass: 'equity', aliases: ['qqq', 'nasdaq 100', 'nasdaq-100', 'nasdaq100', 'nasdaq', 'etf del nasdaq', 'nasdaq 100 etf'] },
  { symbol: 'NVDA', name: 'NVIDIA', kind: 'equity', assetClass: 'equity', aliases: ['nvidia', 'nvda'] },
  { symbol: 'AAPL', name: 'Apple', kind: 'equity', assetClass: 'equity', aliases: ['apple', 'aapl'] },
  { symbol: 'TSLA', name: 'Tesla', kind: 'equity', assetClass: 'equity', aliases: ['tesla', 'tsla'] },
  { symbol: 'META', name: 'Meta Platforms', kind: 'equity', assetClass: 'equity', aliases: ['meta', 'facebook', 'meta platforms'] },
  { symbol: 'MSFT', name: 'Microsoft', kind: 'equity', assetClass: 'equity', aliases: ['microsoft', 'msft'] },
  { symbol: 'GOOGL', name: 'Alphabet (Google)', kind: 'equity', assetClass: 'equity', aliases: ['google', 'alphabet', 'googl'] },
  { symbol: 'AMZN', name: 'Amazon', kind: 'equity', assetClass: 'equity', aliases: ['amazon', 'amzn'] },
  { symbol: 'AMD', name: 'AMD', kind: 'equity', assetClass: 'equity', aliases: ['amd', 'advanced micro devices'] },
  { symbol: 'COIN', name: 'Coinbase', kind: 'equity', assetClass: 'equity', aliases: ['coinbase', 'coin'] },
];
const BY_SYMBOL = new Map(UNIVERSE.map((instrument) => [instrument.symbol, instrument]));
const fold = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[¿?¡!.,;:"“”«»()]/g, ' ').replace(/\s+/g, ' ').trim();
/** Words that may stand around a name without changing which instrument it is. */
const AROUND = /^(el|la|los|las|le|les|il|lo|der|die|das|den|o|a|os|as|the|de|del|du|di|von|acciones? de|accion de|shares? of|stock|aktie|action|azioni di|acoes da|acoes de)\s+|\s+(stock|shares|acciones|etf|aktie|aktien)$/g;
export function resolveMention(mention: string): Instrument | null {
  let text = fold(mention);
  for (let n = 0; n < 3; n++) text = text.replace(AROUND, '').trim();
  if (!text) return null;
  return UNIVERSE.find((instrument) => instrument.symbol.toLowerCase() === text || instrument.aliases.includes(text) || fold(instrument.name) === text) ?? null;
}

// ---------- arithmetic ----------
const pct = (ratio: number) => 100 * ratio;
/** Sample standard deviation; null under two values. */
function stdev(values: number[]): number | null {
  if (values.length < 2) return null;
  const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
  const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / (values.length - 1);
  return Number.isFinite(variance) ? Math.sqrt(variance) : null;
}
function correlation(a: number[], b: number[]): number | null {
  if (a.length !== b.length || a.length < 2) return null;
  const ma = a.reduce((s, v) => s + v, 0) / a.length, mb = b.reduce((s, v) => s + v, 0) / b.length;
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < a.length; i++) { num += (a[i] - ma) * (b[i] - mb); da += (a[i] - ma) ** 2; db += (b[i] - mb) ** 2; }
  const r = num / Math.sqrt(da * db);
  return Number.isFinite(r) ? Math.max(-1, Math.min(1, r)) : null;
}
/** Fewer daily changes than this say nothing about how much something moves. */
export const MIN_CHANGES = 15;
const dayMs = (day: string) => Date.parse(`${day}T00:00:00Z`);
export interface Metrics { first: DailyBar; last: DailyBar; changes: number[]; totalReturn: number; volatility: number | null; maxDrawdown: number; worst: { pct: number; day: string } | null; best: { pct: number; day: string } | null }
/** What a run of closes did. Percent everywhere; a change is close over the previous close of the run. */
export function metrics(bars: DailyBar[]): Metrics | null {
  if (bars.length < 2 || bars.some((bar) => !(bar.close > 0) || !Number.isFinite(bar.close))) return null;
  const changes: number[] = [];
  let peak = bars[0].close, maxDrawdown = 0, worst: Metrics['worst'] = null, best: Metrics['best'] = null;
  for (let i = 1; i < bars.length; i++) {
    const change = pct(bars[i].close / bars[i - 1].close - 1);
    changes.push(change);
    if (!worst || change < worst.pct) worst = { pct: change, day: bars[i].day };
    if (!best || change > best.pct) best = { pct: change, day: bars[i].day };
    peak = Math.max(peak, bars[i].close);
    maxDrawdown = Math.min(maxDrawdown, pct(bars[i].close / peak - 1));
  }
  return { first: bars[0], last: bars.at(-1)!, changes, totalReturn: pct(bars.at(-1)!.close / bars[0].close - 1), volatility: changes.length >= MIN_CHANGES ? stdev(changes) : null, maxDrawdown, worst, best };
}
/** The whole window must be sound, not only the reader's last 22 bars: no missing crypto day, no equity gap over five days, no impossible jump. */
function windowSound(bars: DailyBar[], assetClass: AssetClass): boolean {
  for (let i = 1; i < bars.length; i++) {
    const gap = (dayMs(bars[i].day) - dayMs(bars[i - 1].day)) / 86_400_000;
    if (assetClass === 'crypto' ? gap !== 1 : gap < 1 || gap > 5) return false;
    if (Math.abs(Math.log(bars[i].close / bars[i - 1].close)) > (assetClass === 'equity' ? 0.5 : 0.6)) return false;
  }
  return true;
}

// ---------- read_assets ----------
export const WINDOWS = [30, 60] as const;
const Read = z.object({ assets: z.array(z.string().trim().min(1).max(60)).min(1).max(3), windowDays: z.union([z.literal(30), z.literal(60)]) }).strict();
/** What runs after the server resolved the names. */
export interface ReadArgs { symbols: string[]; windowDays: 30 | 60 }
type CompareArgs = ReadArgs;
function prepareRead(args: z.infer<typeof Read>): { ok: true; args: ReadArgs } | { ok: false; reason: string; detail: string } {
  const symbols: string[] = [];
  for (const mention of args.assets) {
    const hit = resolveMention(mention);
    if (!hit) return { ok: false, reason: 'unknown_asset', detail: mention.slice(0, 40) };
    if (symbols.includes(hit.symbol)) return { ok: false, reason: 'same_asset_twice', detail: hit.symbol };
    symbols.push(hit.symbol);
  }
  return { ok: true, args: { symbols, windowDays: args.windowDays } };
}
interface Read { instrument: Instrument; url: string; series: BarSeries | null; bars: DailyBar[] | null; quality: Quality; note: string | null }

async function readSeries(instrument: Instrument, ctx: ToolContext): Promise<Read> {
  const url = providerUrl(instrument.symbol, instrument.assetClass), now = ctx.now();
  const json = await ctx.fetchJson(url);
  if (json === null) return { instrument, url, series: null, bars: null, quality: 'error', note: 'the source did not answer' };
  // Crypto is read as the spot pair against USDT, and says so in `currency`.
  const series = instrument.assetClass === 'equity' ? parseYahooDaily(json, instrument.symbol, now) : parseOkxDaily(json, `${instrument.symbol}-USDT`, now);
  if (!series) return { instrument, url, series: null, bars: null, quality: 'missing', note: 'the source returned nothing the reader understands' };
  const valid = validateBars(series, now);
  if ('reason' in valid) return { instrument, url, series, bars: null, quality: valid.reason === 'stale' ? 'stale' : valid.reason === 'too_few' ? 'missing' : 'error', note: `series refused: ${valid.reason}` };
  return { instrument, url, series, bars: valid.bars, quality: 'valid', note: null };
}

export async function readAssets(args: CompareArgs, ctx: ToolContext): Promise<ToolOutput> {
  const now = ctx.now(), reads = await Promise.all(args.symbols.map((symbol) => readSeries(BY_SYMBOL.get(symbol)!, ctx)));
  const limitations: string[] = ['past_window_only'];
  const evidence: Evidence[] = reads.map((read) => ({
    id: `ev_${read.instrument.symbol}`, tool: 'read_assets', source: read.series?.source ?? (read.instrument.assetClass === 'equity' ? 'yahoo' : 'okx'), url: read.url,
    instrument: read.instrument.assetClass === 'crypto' ? `${read.instrument.symbol}-USDT spot` : read.instrument.symbol,
    asOf: read.bars?.at(-1)?.day ?? null, retrievedAt: now.toISOString(), unit: 'price', scale: 1, currency: read.series?.currency ?? null, quality: read.quality, note: read.note,
  }));
  // One window for all: the last `windowDays` calendar days ending at the earliest "last completed bar" of those read.
  const usable = reads.filter((read) => read.bars);
  const end = usable.length ? usable.map((read) => read.bars!.at(-1)!.day).sort()[0] : null;
  const start = end ? new Date(dayMs(end) - (args.windowDays - 1) * 86_400_000).toISOString().slice(0, 10) : null;
  const mixed = new Set(usable.map((read) => read.instrument.assetClass)).size > 1;
  if (mixed) limitations.push('mixed_calendars');
  // Days every usable instrument traded inside the window: what a mixed comparison, and every correlation, is computed on.
  const inWindow = (read: Read) => read.bars!.filter((bar) => bar.day >= start! && bar.day <= end!);
  const common = usable.length ? usable.map((read) => new Set(inWindow(read).map((bar) => bar.day))).reduce((a, b) => new Set([...a].filter((day) => b.has(day)))) : new Set<string>();
  const figures: Figure[] = [];
  const used = new Map<string, DailyBar[]>();
  for (const read of reads) {
    const symbol = read.instrument.symbol, ev = [`ev_${symbol}`];
    let bars = read.bars ? inWindow(read) : null;
    if (bars && mixed) bars = bars.filter((bar) => common.has(bar.day));
    let quality: Quality = read.quality;
    if (bars && !windowSound(bars, mixed ? 'equity' : read.instrument.assetClass)) { quality = 'error'; evidence.find((item) => item.id === ev[0])!.quality = 'error'; evidence.find((item) => item.id === ev[0])!.note = 'series refused: the window has a gap or an impossible move'; bars = null; }
    const m = bars ? metrics(bars) : null;
    if (bars && !m) quality = 'missing';
    if (!m) limitations.push(`no_series:${symbol}`);
    else used.set(symbol, bars!);
    const basis = m ? `${mixed ? 'days both traded' : read.instrument.assetClass === 'crypto' ? 'UTC days' : 'exchange sessions'} from ${m.first.day} to ${m.last.day} (${m.changes.length} daily changes, close to close)` : `no usable series (${read.note ?? 'too few days in the window'})`;
    const figure = (metric: string, value: number | null, unit: Figure['unit'], extra = '', q: Quality = quality): Figure => ({ id: `${metric}_${symbol}`, metric, subject: symbol, value: m && value !== null && Number.isFinite(value) ? value : null, unit, currency: unit === 'price' ? read.series?.currency ?? null : null, basis: basis + extra, from: m?.first.day ?? null, to: m?.last.day ?? null, days: m ? m.changes.length : null, evidence: ev, quality: m && value !== null ? q : m ? 'missing' : quality === 'valid' ? 'missing' : quality });
    figures.push(
      figure('close', m?.last.close ?? null, 'price'),
      figure('return', m?.totalReturn ?? null, 'percent', '; last close over first close of the window, minus one'),
      figure('volatility', m?.volatility ?? null, 'percent', `; sample standard deviation of the daily changes, not annualised${m && m.volatility === null ? `; needs ${MIN_CHANGES} changes` : ''}`),
      figure('drawdown', m?.maxDrawdown ?? null, 'percent', '; largest fall from a previous high inside the window'),
      figure('worst', m?.worst?.pct ?? null, 'percent', m?.worst ? `; the day was ${m.worst.day}` : ''),
      figure('best', m?.best?.pct ?? null, 'percent', m?.best ? `; the day was ${m.best.day}` : ''),
    );
  }
  const symbols = [...used.keys()];
  for (let i = 0; i < symbols.length; i++) for (let j = i + 1; j < symbols.length; j++) {
    const a = used.get(symbols[i])!.filter((bar) => common.has(bar.day)), b = used.get(symbols[j])!.filter((bar) => common.has(bar.day));
    const ma = metrics(a), mb = metrics(b);
    const r = ma && mb && ma.changes.length >= MIN_CHANGES ? correlation(ma.changes, mb.changes) : null;
    figures.push({ id: `corr_${symbols[i]}_${symbols[j]}`, metric: 'correlation', subject: `${symbols[i]}~${symbols[j]}`, value: r, unit: 'ratio', currency: null, basis: `correlation of the daily changes on the ${ma?.changes.length ?? 0} days both traded${r === null ? `; needs ${MIN_CHANGES}` : ''}`, from: ma?.first.day ?? null, to: ma?.last.day ?? null, days: ma?.changes.length ?? null, evidence: [`ev_${symbols[i]}`, `ev_${symbols[j]}`], quality: r === null ? 'missing' : 'valid' });
  }
  const analysis: Analysis = { kind: args.symbols.length > 1 ? 'comparison' : 'single', subjects: args.symbols, windowDays: args.windowDays, figures, evidence, limitations, computedAt: now.toISOString() };
  return { evidence, analysis, data: { figures: figures.map(forModel), evidence: evidence.map(({ id, source, instrument, asOf, quality, note }) => ({ id, source, instrument, asOf, quality, note })), limitations, windowDays: args.windowDays } };
}
/** A figure as the model sees it: rounded, so it can reason about more and less; it may only cite the id. */
export const forModel = (figure: Figure) => ({ id: figure.id, metric: figure.metric, subject: figure.subject, value: figure.value === null ? null : Number(figure.value.toFixed(figure.unit === 'ratio' ? 2 : figure.unit === 'price' ? 2 : 1)), unit: figure.unit, basis: figure.basis, quality: figure.quality });

// ---------- the registry ----------
const Resolve = z.object({ mentions: z.array(z.string().trim().min(1).max(60)).min(1).max(4) }).strict();
export const TOOLS: Record<string, Tool<any>> = {
  resolve_assets: {
    name: 'resolve_assets', metered: false, schema: Resolve,
    description: 'Says which instruments the person means, when you are not sure. Give each name or ticker exactly as they wrote it. Free. You do not need it before read_assets, which takes names. Returns, for each, the instrument or that it is not one Bobby can read with evidence.',
    wire: { type: 'object', additionalProperties: false, required: ['mentions'], properties: { mentions: { type: 'array', minItems: 1, maxItems: 4, items: { type: 'string' } } } },
    run: async (args: z.infer<typeof Resolve>) => ({
      evidence: [],
      data: {
        resolved: args.mentions.map((mention) => { const hit = resolveMention(mention); return hit ? { mention, match: 'exact', symbol: hit.symbol, name: hit.name, kind: hit.kind } : { mention, match: 'none' }; }),
        readable: UNIVERSE.map((instrument) => `${instrument.symbol} (${instrument.name})`),
      },
    }),
  },
  read_assets: {
    name: 'read_assets', metered: true, schema: Read, prepare: prepareRead,
    description: 'Reads the daily closes of one, two or three instruments over the last 30 or 60 days and measures them by code: change over the window, how much each moved day to day, its largest fall from a high, its worst and best day and, for two or three, how alike their daily changes were. Give each instrument by the name or ticker the person wrote. Uses one read of the person\'s allowance: the app asks them before it runs. Returns figures with ids; cite a figure only by its id.',
    wire: { type: 'object', additionalProperties: false, required: ['assets', 'windowDays'], properties: { assets: { type: 'array', minItems: 1, maxItems: 3, items: { type: 'string' } }, windowDays: { type: 'integer', enum: [30, 60] } } },
    scope: (args: ReadArgs) => ({ action: 'read_assets', assets: [...args.symbols], windowDays: args.windowDays, depth: 'standard', consumption: { reads: 1 } }),
    run: readAssets,
  },
};
export const instrumentName = (symbol: string) => BY_SYMBOL.get(symbol)?.name ?? symbol;
