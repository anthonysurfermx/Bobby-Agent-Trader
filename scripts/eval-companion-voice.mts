// Real-model check of what the voice-first screen asks of a companion turn (2026-10-10):
//   · intent: a question that names an asset is explained when it asks what the asset is, and offered as a market
//     read only when it asks how the asset is doing or for an analysis of it (candidate.exact);
//   · the sentence in front: how often a reply opens with a sentence a client can show alone (companionGist);
//   · one exchange of memory: "give me an example" after an answer is about that answer (previous).
// It calls the provider and nothing else; no row is read or written. Needs ANTHROPIC_API_KEY; prints no secret.
//   vercel env run -e production -- npx tsx scripts/eval-companion-voice.mts <out.json> [model] [--lang=es,de]
import { writeFileSync } from 'node:fs';

process.env.BOBBY_SUPABASE_URL = 'https://eval.invalid';
process.env.BOBBY_SUPABASE_ANON_KEY = 'eval';
process.env.BOBBY_SUPABASE_SERVICE_ROLE_KEY = 'eval';
process.env.RATE_LIMIT_SALT = process.env.RATE_LIMIT_SALT || 'eval-salt';
if (!process.env.ANTHROPIC_API_KEY) { console.error('ANTHROPIC_API_KEY is not set'); process.exit(2); }

const { runCompanionTurn, companionGist } = await import('../api/_lib/companion.ts');
type Usage = import('../api/_lib/llm.ts').LlmUsage;

const OUT = process.argv[2] ?? 'companion-voice-eval.json';
const MODEL = process.argv.slice(3).find((arg) => arg.startsWith('claude-')) ?? 'claude-sonnet-5-5';
const LANGS = process.argv.find((arg) => arg.startsWith('--lang='))?.slice(7).split(',') ?? null;
type Language = 'es' | 'en' | 'fr' | 'pt' | 'it' | 'de';
const LOCALE: Record<Language, string> = { es: 'es-MX', en: 'en-US', fr: 'fr-FR', pt: 'pt-BR', it: 'it-IT', de: 'de-DE' };
const BTC = { symbol: 'BTC', name: 'Bitcoin', exact: true }, NVDA = { symbol: 'NVDA', name: 'NVIDIA', exact: true };

/** [question, candidate, the person wants a market read]. */
const INTENT: Record<Language, Array<[string, typeof BTC, boolean]>> = {
  es: [['¿Qué es Bitcoin?', BTC, false], ['¿Cómo funciona Bitcoin y por qué vale algo?', BTC, false], ['¿Por qué la gente invierte en Nvidia?', NVDA, false], ['Analiza Bitcoin', BTC, true], ['¿Cómo ves a Nvidia hoy?', NVDA, true], ['¿Cómo va Bitcoin?', BTC, true], ['bitcoin', BTC, true]],
  en: [['What is Bitcoin?', BTC, false], ['How does Bitcoin work and why is it worth anything?', BTC, false], ['Why do people invest in Nvidia?', NVDA, false], ['Analyze Bitcoin', BTC, true], ['How is Nvidia looking today?', NVDA, true], ['How is Bitcoin doing?', BTC, true], ['nvidia', NVDA, true]],
  fr: [["C'est quoi, le Bitcoin ?", BTC, false], ['Comment fonctionne le Bitcoin ?', BTC, false], ['Pourquoi les gens investissent dans Nvidia ?', NVDA, false], ['Analyse le Bitcoin', BTC, true], ["Comment va Nvidia aujourd'hui ?", NVDA, true]],
  pt: [['O que é Bitcoin?', BTC, false], ['Como funciona o Bitcoin?', BTC, false], ['Por que as pessoas investem na Nvidia?', NVDA, false], ['Analisa o Bitcoin', BTC, true], ['Como está a Nvidia hoje?', NVDA, true]],
  it: [["Che cos'è Bitcoin?", BTC, false], ['Come funziona Bitcoin?', BTC, false], ['Perché la gente investe in Nvidia?', NVDA, false], ['Analizza Bitcoin', BTC, true], ['Come va Nvidia oggi?', NVDA, true]],
  de: [['Was ist Bitcoin?', BTC, false], ['Wie funktioniert Bitcoin?', BTC, false], ['Warum investieren Leute in Nvidia?', NVDA, false], ['Analysiere Bitcoin', BTC, true], ['Wie steht Nvidia heute da?', NVDA, true]],
};
/** [first question, the follow-up that only makes sense after it]. */
const THREAD: Record<Language, [string, string]> = {
  es: ['¿Qué es un fondo indexado?', 'Ponme un ejemplo'], en: ['What is an index fund?', 'Give me an example'], fr: ["C'est quoi, un fonds indiciel ?", 'Donne-moi un exemple'],
  pt: ['O que é um fundo de índice?', 'Me dá um exemplo'], it: ["Che cos'è un fondo indicizzato?", 'Fammi un esempio'], de: ['Was ist ein Indexfonds?', 'Gib mir ein Beispiel'],
};

const usage: Usage[] = [];
const rows: Array<Record<string, unknown>> = [];
const ask = async (language: Language, question: string, extra: Record<string, unknown> = {}) => {
  const started = Date.now();
  try {
    const turn = await runCompanionTurn(question, language, { locale: LOCALE[language], speech: 'plain', usage, model: MODEL, ...extra });
    return { ...turn, ms: Date.now() - started, gist: turn.aboutCandidate ? null : companionGist(turn.text) };
  } catch (error) { return { failed: `${(error as Error).name}: ${String((error as Error).message).slice(0, 120)}`, ms: Date.now() - started } as const; }
};

for (const language of (Object.keys(INTENT) as Language[]).filter((l) => !LANGS || LANGS.includes(l))) {
  const answers = await Promise.all(INTENT[language].map(([question, candidate]) => ask(language, question, { candidate })));
  INTENT[language].forEach(([question, , wantsRead], n) => {
    const a = answers[n] as Record<string, unknown>;
    rows.push({ part: 'intent', language, question, wantsRead, offered: a.aboutCandidate ?? null, right: a.aboutCandidate === wantsRead, source: a.source ?? null, rejected: a.rejected ?? null, failed: a.failed ?? null, gist: a.gist ?? null, text: a.text ?? null, ms: a.ms });
  });
  const [first, second] = THREAD[language];
  const one = await ask(language, first) as Record<string, unknown>;
  const two = typeof one.text === 'string' ? await ask(language, second, { previous: { question: first, reply: one.text } }) as Record<string, unknown> : { failed: 'no first reply' };
  const alone = await ask(language, second) as Record<string, unknown>;
  rows.push({ part: 'thread', language, first, firstReply: one.text ?? null, firstGist: one.gist ?? null, second, withPrevious: two.text ?? null, withPreviousRejected: two.rejected ?? null, alone: alone.text ?? null, failed: one.failed ?? two.failed ?? null });
  console.error(language, 'done');
}

const intent = rows.filter((r) => r.part === 'intent');
const explained = intent.filter((r) => r.wantsRead === false && r.offered === false && typeof r.text === 'string');
const cost = usage.reduce((sum, u) => sum + (u.costUsd ?? 0), 0);
const summary = {
  model: MODEL, turns: usage.length, costUsd: Number(cost.toFixed(4)),
  intentRight: `${intent.filter((r) => r.right).length}/${intent.length}`,
  explainRight: `${intent.filter((r) => r.wantsRead === false && r.right).length}/${intent.filter((r) => r.wantsRead === false).length}`,
  readRight: `${intent.filter((r) => r.wantsRead === true && r.right).length}/${intent.filter((r) => r.wantsRead === true).length}`,
  explanationsReplaced: explained.filter((r) => r.source === 'fallback').length,
  explanationsWithGist: `${explained.filter((r) => r.gist).length}/${explained.length}`,
  failed: rows.filter((r) => r.failed).length,
};
writeFileSync(OUT, JSON.stringify({ summary, rows }, null, 2));
console.log(JSON.stringify(summary, null, 2));
