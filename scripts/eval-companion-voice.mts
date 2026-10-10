// Real-model check of what the voice-first screen asks of a companion turn (2026-10-10):
//   · intent: a question that names an asset is explained when it asks what the asset is, and offered as a market
//     read only when it asks how the asset is doing or for an analysis of it (candidate.exact);
//   · the sentence in front: how often a reply opens with a sentence a client can show alone (companionGist);
//   · one exchange of memory: "give me an example" after an answer is about that answer (previous);
//   · results a person can use: a comparison compares and chooses nothing; a question that needs today's data,
//     or the future, is answered by saying so first; "shorter" shortens and "I get it" ends without an invitation;
//   · how often a reply comes with a next question at all: Bobby knowing when to stop.
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

/** [question, candidate or null]: two things to compare, never one to pick. */
const COMPARE: Record<Language, Array<[string, typeof BTC | null]>> = {
  es: [['¿Qué diferencia hay entre un ETF y una acción?', null], ['Compárame Bitcoin y Ethereum', BTC], ['¿Qué me conviene más, CETES o dólares?', null]],
  en: [['What is the difference between an ETF and a stock?', null], ['Compare Bitcoin and Ethereum for me', BTC], ['Which is better for me, bonds or stocks?', null]],
  fr: [['Quelle est la différence entre un ETF et une action ?', null], ['Compare-moi le Bitcoin et Ethereum', BTC]],
  pt: [['Qual é a diferença entre um ETF e uma ação?', null], ['Compara o Bitcoin com o Ethereum', BTC]],
  it: [["Che differenza c'è tra un ETF e un'azione?", null], ['Confrontami Bitcoin ed Ethereum', BTC]],
  de: [['Was ist der Unterschied zwischen einem ETF und einer Aktie?', null], ['Vergleich mir Bitcoin und Ethereum', BTC]],
};
/** Questions nobody can answer from here: today's market, or the future. The first sentence must say so. */
const NODATA: Record<Language, string[]> = {
  es: ['¿Va a subir el dólar esta semana?', '¿Cómo está la bolsa hoy?'], en: ['Will the dollar go up this week?', 'How is the stock market doing today?'],
  fr: ['Le dollar va monter cette semaine ?', "Comment va la bourse aujourd'hui ?"], pt: ['O dólar vai subir esta semana?', 'Como está a bolsa hoje?'],
  it: ['Il dollaro salirà questa settimana?', 'Come va la borsa oggi?'], de: ['Steigt der Dollar diese Woche?', 'Wie steht die Börse heute?'],
};
/** What a first sentence says when it owns up to what it cannot know. Loose on purpose: a person reads the rows. */
const OWNS_UP: Record<Language, RegExp> = {
  es: /no (tengo|cuento con|puedo ver|sé)|nadie (lo )?(sabe|puede saber)|no se puede saber|imposible saber/i, en: /(do not|don't|can't|cannot) (have|know|see|tell)|no (current|live|real-time)( market)? data|nobody (knows|can know)|no one (knows|can know)/i,
  fr: /je n['’]ai pas|personne ne (le )?(sait|peut)|impossible de (le )?savoir|je ne (peux|sais) pas/i, pt: /não (tenho|sei|consigo|posso)|ninguém (sabe|pode saber|consegue)|não dá para saber|impossível saber/i,
  it: /non (ho|so|posso)|nessuno (lo )?(sa|può)|impossibile saper/i, de: /(ich )?(habe|hab) (hier )?keine|kann (das )?niemand|niemand (kann|weiß)|weiß niemand|lässt sich nicht (sagen|vorhersagen)|kann ich (dir )?(hier )?nicht|keine aktuellen/i,
};
/** [what they say after an answer, what it should do]. */
const PACE: Record<Language, { shorter: string; done: string }> = {
  es: { shorter: 'Más breve', done: 'Ya lo entendí, gracias' }, en: { shorter: 'Shorter', done: 'Got it, thanks' }, fr: { shorter: 'Plus court', done: "C'est bon, j'ai compris, merci" },
  pt: { shorter: 'Mais curto', done: 'Já entendi, obrigado' }, it: { shorter: 'Più breve', done: 'Ho capito, grazie' }, de: { shorter: 'Kürzer', done: 'Verstanden, danke' },
};
const firstSentence = (text: string) => /^.*?[.!?…](?=\s|$)/s.exec(text)?.[0] ?? text;

const usage: Usage[] = [];
const rows: Array<Record<string, unknown>> = [];
const ask = async (language: Language, question: string, extra: Record<string, unknown> = {}) => {
  const started = Date.now(), own: Usage[] = [];
  try {
    const turn = await runCompanionTurn(question, language, { locale: LOCALE[language], speech: 'plain', usage: own, model: MODEL, ...extra });
    return { ...turn, ms: Date.now() - started, gist: turn.aboutCandidate ? null : companionGist(turn.text) };
  } catch (error) {
    // The stop of every attempt, so a failure can be named afterwards (an http status, a timeout, the network).
    return { failed: `${(error as Error).name}: ${String((error as Error).message).slice(0, 120)}`, stops: own.map((row) => `${row.role}:${row.stop}@${row.latencyMs}`), ms: Date.now() - started } as const;
  } finally { usage.push(...own); }
};

for (const language of (Object.keys(INTENT) as Language[]).filter((l) => !LANGS || LANGS.includes(l))) {
  const answers = await Promise.all(INTENT[language].map(([question, candidate]) => ask(language, question, { candidate })));
  INTENT[language].forEach(([question, , wantsRead], n) => {
    const a = answers[n] as Record<string, unknown>;
    rows.push({ part: 'intent', language, question, wantsRead, offered: a.aboutCandidate ?? null, right: a.aboutCandidate === wantsRead, source: a.source ?? null, rejected: a.rejected ?? null, failed: a.failed ?? null, stops: a.stops ?? null, gist: a.gist ?? null, followUp: a.followUp ?? null, text: a.text ?? null, ms: a.ms });
  });
  const [first, second] = THREAD[language];
  const one = await ask(language, first) as Record<string, unknown>;
  const two = typeof one.text === 'string' ? await ask(language, second, { previous: { question: first, reply: one.text } }) as Record<string, unknown> : { failed: 'no first reply' };
  const alone = await ask(language, second) as Record<string, unknown>;
  rows.push({ part: 'thread', language, first, firstReply: one.text ?? null, firstGist: one.gist ?? null, firstFollowUp: one.followUp ?? null, second, withPrevious: two.text ?? null, withPreviousRejected: two.rejected ?? null, alone: alone.text ?? null, failed: one.failed ?? two.failed ?? null, stops: one.stops ?? two.stops ?? null });
  const compared = await Promise.all(COMPARE[language].map(([question, candidate]) => ask(language, question, candidate ? { candidate } : {})));
  COMPARE[language].forEach(([question, candidate], n) => {
    const a = compared[n] as Record<string, unknown>;
    rows.push({ part: 'compare', language, question, candidate: candidate?.symbol ?? null, offered: a.aboutCandidate ?? null, source: a.source ?? null, rejected: a.rejected ?? null, gist: a.gist ?? null, followUp: a.followUp ?? null, text: a.text ?? null, failed: a.failed ?? null, stops: a.stops ?? null, ms: a.ms });
  });
  const unknowable = await Promise.all(NODATA[language].map((question) => ask(language, question)));
  NODATA[language].forEach((question, n) => {
    const a = unknowable[n] as Record<string, unknown>;
    const opens = typeof a.text === 'string' ? firstSentence(a.text) : null;
    rows.push({ part: 'nodata', language, question, source: a.source ?? null, rejected: a.rejected ?? null, ownsUp: a.source === 'model' && opens ? OWNS_UP[language].test(opens) : null, opens, followUp: a.followUp ?? null, text: a.text ?? null, failed: a.failed ?? null, stops: a.stops ?? null, ms: a.ms });
  });
  if (typeof one.text === 'string') {
    const previous = { question: first, reply: one.text };
    const [shorter, done] = await Promise.all([ask(language, PACE[language].shorter, { previous }), ask(language, PACE[language].done, { previous })]) as Array<Record<string, unknown>>;
    rows.push({ part: 'pace', language, said: PACE[language].shorter, was: one.text.length, now: typeof shorter.text === 'string' ? shorter.text.length : null, right: typeof shorter.text === 'string' && shorter.source === 'model' && shorter.text.length < one.text.length, text: shorter.text ?? null, followUp: shorter.followUp ?? null, failed: shorter.failed ?? null });
    rows.push({ part: 'pace', language, said: PACE[language].done, now: typeof done.text === 'string' ? done.text.length : null, right: typeof done.text === 'string' && done.source === 'model' && done.followUp === null && done.text.length <= 119 && !/[?¿]/.test(done.text), gistIsWhole: typeof done.text === 'string' && companionGist(done.text) === done.text, text: done.text ?? null, followUp: done.followUp ?? null, failed: done.failed ?? null });
  }
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
  // Bobby knowing when to stop: how many explanations come with a next question at all.
  explanationsWithFollowUp: `${explained.filter((r) => r.followUp).length}/${explained.length}`,
  comparedNotOffered: `${rows.filter((r) => r.part === 'compare' && r.offered !== true && !r.failed).length}/${rows.filter((r) => r.part === 'compare').length}`,
  comparisonsReplaced: rows.filter((r) => r.part === 'compare' && r.source === 'fallback').map((r) => `${r.language}:${r.rejected}`),
  ownsUpFirst: `${rows.filter((r) => r.part === 'nodata' && r.ownsUp).length}/${rows.filter((r) => r.part === 'nodata').length}`,
  noDataReplaced: rows.filter((r) => r.part === 'nodata' && r.source === 'fallback').map((r) => `${r.language}:${r.rejected}`),
  paceRight: `${rows.filter((r) => r.part === 'pace' && r.right).length}/${rows.filter((r) => r.part === 'pace').length}`,
  failed: rows.filter((r) => r.failed).length,
};
writeFileSync(OUT, JSON.stringify({ summary, rows }, null, 2));
console.log(JSON.stringify(summary, null, 2));
