// Builds a set of met watches from REAL closes and writes their notes exactly as production would.
// Costs money. Never with production's key: see README.md.
//   EVAL_ANTHROPIC_API_KEY=… npx tsx scripts/agent-watch-note-eval/run.mts [--max-usd 3] [--seed 7] [--notes 30] [--theses 18] [--control] [--dry]
import { mkdirSync, readFileSync, writeFileSync, appendFileSync } from 'node:fs';

const arg = (name: string, fallback: string) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : fallback; };
const flag = (name: string) => process.argv.includes(`--${name}`);
const dry = flag('dry'), control = flag('control');
const evalKey = process.env.EVAL_ANTHROPIC_API_KEY?.trim();
if (!dry) {
  if (!evalKey) { console.error('EVAL_ANTHROPIC_API_KEY is not set. This run spends money and never uses production\'s key.'); process.exit(2); }
  if (evalKey === process.env.ANTHROPIC_API_KEY?.trim()) { console.error('EVAL_ANTHROPIC_API_KEY is production\'s key. Use a separate one.'); process.exit(2); }
  process.env.ANTHROPIC_API_KEY = evalKey;
}
process.env.BOBBY_SUPABASE_URL ??= 'https://eval.invalid'; process.env.BOBBY_SUPABASE_ANON_KEY ??= 'eval'; process.env.BOBBY_SUPABASE_SERVICE_ROLE_KEY ??= 'eval';

const { UNIVERSE, readDaily } = await import('../../api/_lib/agent/tools.ts');
const { checkWatch, WATCH_PERCENTS } = await import('../../api/_lib/agent/watch.ts');
const note = await import('../../api/_lib/agent/watch-note.ts');
type AppLanguage = import('../../src/lib/app-language.ts').AppLanguage;

const maxUsd = Number(arg('max-usd', '3')), wantNotes = Number(arg('notes', '30')), wantTheses = Number(arg('theses', '18'));
let seed = Number(arg('seed', '7'));
const random = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
const LANGUAGES: AppLanguage[] = ['en', 'es', 'fr', 'pt', 'it', 'de'];

// ---------- cases: every window of the last 150 days where a watch would have been met ----------
const tools = { now: () => new Date(), fetchJson: async (url: string) => { try { const r = await fetch(url, { signal: AbortSignal.timeout(8000), headers: { 'User-Agent': 'Mozilla/5.0 (compatible; BobbyAgentTrader/1.0)' } }); return r.ok ? await r.json() : null; } catch { return null; } } };
interface Case { id: string; symbol: string; direction: 'falls' | 'rises'; percent: number; language: AppLanguage; reference: { day: string; close: number; currency: string }; met: { day: string; close: number; changePct: number } }
const found: Case[] = [];
for (const instrument of UNIVERSE) {
  const read = await readDaily(instrument.symbol, tools as never);
  if (!read) { console.error('unreadable, skipped:', instrument.symbol); continue; }
  const bars = read.bars.slice(-150);
  for (let start = 0; start < bars.length - 2; start += 5) for (const direction of ['falls', 'rises'] as const) for (const percent of WATCH_PERCENTS) {
    const reference = { day: bars[start].day, close: bars[start].close, currency: read.currency };
    const check = checkWatch({ reference, direction, percent }, bars.slice(start, start + 8));
    if (check.kind === 'met') found.push({ id: `${instrument.symbol}-${reference.day}-${direction}-${percent}`, symbol: instrument.symbol, direction, percent, language: 'en', reference, met: check.met });
  }
}
// One case per (asset, day it was met): the largest size that was met, then a seeded sample spread over the assets.
const byEvent = new Map<string, Case>();
for (const c of found) { const key = `${c.symbol}|${c.met.day}`; const had = byEvent.get(key); if (!had || c.percent > had.percent) byEvent.set(key, c); }
const pool = [...byEvent.values()].sort(() => random() - 0.5);
const perAsset = new Map<string, number>(), cases: Case[] = [];
for (const c of pool) { const n = perAsset.get(c.symbol) ?? 0; if (n >= 4 || cases.length >= wantNotes) continue; perAsset.set(c.symbol, n + 1); cases.push({ ...c, language: LANGUAGES[cases.length % LANGUAGES.length] }); }
const theses = JSON.parse(readFileSync(new URL('./theses.json', import.meta.url), 'utf8')) as Array<{ id: string; language: AppLanguage; hypothesis: string; worry: string; changeMind: string }>;

const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const out = new URL(`./out/${stamp}${control ? '-control' : ''}/`, import.meta.url);
mkdirSync(out, { recursive: true });
writeFileSync(new URL('cases.json', out), JSON.stringify({ seed: arg('seed', '7'), control, cases }, null, 2));
console.log(`${found.length} met windows, ${byEvent.size} distinct events, ${cases.length} cases, ${Math.min(wantTheses, cases.length)} thesis paragraphs. Output: ${out.pathname}`);
if (dry) { console.log('--dry: no model was asked.'); process.exit(0); }

// ---------- the run: production's own functions, a local tally instead of the briefings' ledger ----------
let spent = 0, asked = 0;
const lastReply: { value: unknown } = { value: null };
const call: typeof note.callNoteOnce = async (request) => {
  const r = await note.callNoteOnce(control ? { ...request, system: 'Explain why this asset moved and what the person should do about it.' } : request);
  asked++; if ('usd' in r) spent += r.usd; lastReply.value = r;
  return r;
};
const reserve = (async (p: { reserveUsd: number }, run: () => Promise<any>) => {
  if (spent + p.reserveUsd > maxUsd) return { ok: false, code: 'budget_exhausted' };
  const r = await run(); return r.ok ? { ok: true, value: r.value } : { ok: false, code: r.outcome === 'charged' ? `charged:${r.code}` : 'provider_failed' };
}) as never;
const deps = note.noteDeps({ call, reserve });
const file = new URL('notes.jsonl', out);
const written: Array<{ c: Case; n: Awaited<ReturnType<typeof note.writeWatchNote>> }> = [];
for (const c of cases) {
  if (spent + note.noteReserveUsd(deps.model()) > maxUsd) { console.log('stopped at the budget'); break; }
  const watch = { id: `watch_eval_${c.id}`, symbol: c.symbol, language: c.language, locale: null, reference: c.reference };
  const n = await note.writeWatchNote(watch, c.met, deps);
  const raw = lastReply.value as { ok?: boolean; value?: { evidence?: unknown; text?: string }; code?: string };
  appendFileSync(file, JSON.stringify({ kind: 'note', case: c, note: n, dropped: n ? null : (raw?.ok ? 'rejected_by_code' : raw?.code ?? 'unknown'), rawText: raw?.ok ? raw.value?.text : null, evidence: raw?.ok ? raw.value?.evidence ?? [] : [] }) + '\n');
  written.push({ c, n });
  console.log(`${c.id} [${c.language}] ${n ? (n.found ? 'note' : 'nothing found') : 'dropped'}  $${spent.toFixed(3)}`);
}
const withNote = written.filter((w) => w.n);
for (let i = 0; i < Math.min(wantTheses, withNote.length * 2); i++) {
  if (spent + note.thesisReserveUsd(deps.model()) > maxUsd) { console.log('stopped at the budget'); break; }
  const { c, n } = withNote[i % withNote.length], thesis = theses[i % theses.length];
  const watch = { id: `watch_eval_${c.id}`, symbol: c.symbol, language: thesis.language, locale: null, reference: c.reference, met: c.met, result: { note: n } as never };
  const paragraph = await note.thesisParagraph(watch as never, thesis, deps);
  const raw = lastReply.value as { ok?: boolean; value?: { text?: string }; code?: string };
  appendFileSync(file, JSON.stringify({ kind: 'thesis', case: c, thesis, reported: n?.why ?? null, paragraph, dropped: paragraph ? null : (raw?.ok ? 'rejected_by_code' : raw?.code ?? 'unknown'), rawText: raw?.ok ? raw.value?.text : null }) + '\n');
  console.log(`${c.id} × ${thesis.id} ${paragraph ? 'paragraph' : 'dropped'}  $${spent.toFixed(3)}`);
}
console.log(`done: ${asked} calls, $${spent.toFixed(3)} spent. Grade with: npx tsx scripts/agent-watch-note-eval/grade.mts ${out.pathname}`);
