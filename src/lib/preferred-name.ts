// ============================================================
// "Call me X" — the name a reader asks Bobby to use. Only an explicit, standalone ask counts: a message that is
// nothing but the naming clause ("llámame Tony", "Call me Juan Carlos.", "me chame de João"). A naming phrase
// inside a market question ("call me crazy, but is NVDA overbought?") is never a name. The web desk saves a
// standalone ask through PATCH /api/memory; the server never takes a name from a question. Nothing is inferred.
// ============================================================

/** Words that follow "call me / llámame" in idioms, or that would make Bobby say an instruction. */
const NOT_A_NAME = new Set([
  // time and filler
  'back', 'later', 'now', 'tomorrow', 'maybe', 'when', 'if', 'the', 'a', 'an', 'luego', 'después', 'despues', 'mañana', 'manana',
  'ahora', 'cuando', 'si', 'por', 'para', 'depois', 'amanhã', 'amanha', 'agora', 'quando', 'se', 'de', 'la', 'el', 'lo', 'o',
  // idioms
  'crazy', 'paranoid', 'old', 'oldfashioned', 'old-fashioned', 'out', 'skeptical', 'sceptical', 'naive', 'lazy', 'stupid', 'silly', 'cautious',
  'loco', 'loca', 'ingenuo', 'ingenua', 'paranoico', 'paranoica', 'anticuado', 'anticuada', 'tonto', 'tonta', 'exagerado', 'exagerada',
  'louco', 'louca', 'ingênuo', 'ingenuo', 'paranóico', 'paranoico', 'antiquado', 'antiquada', 'bobo', 'boba',
  // trading and advice words
  'buy', 'sell', 'hold', 'long', 'short', 'invest', 'comprar', 'compra', 'vender', 'vende', 'invierte', 'invertir', 'investir',
]);
const NAME_WORD = /^[\p{L}][\p{L}'’-]{0,23}$/u;

/** A name as stored: one to three words of letters (apostrophes and hyphens inside), 40 characters at most. */
export function cleanName(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const s = v.normalize('NFC').replace(/\s+/g, ' ').trim();
  if (s.length < 1 || s.length > 40) return null;
  const words = s.split(' ');
  if (words.length > 3 || !words.every((w) => NAME_WORD.test(w))) return null;
  if (words.some((w) => NOT_A_NAME.has(w.toLocaleLowerCase()))) return null;
  return s;
}

/** The whole message is a naming ask: "llámame Tony", "Call me Juan Carlos.", "mi nombre es Ana". */
const NAME_ASK = /^\s*(?:ll[aá]mame|mi\s+nombre\s+es|me\s+llamo|call\s+me|my\s+name\s+is|i'?m\s+called|me\s+chame\s+de|chame-me\s+de|pode\s+me\s+chamar\s+de|meu\s+nome\s+[eé])\s+([\p{L}][\p{L}'’ -]{0,40}?)\s*[.!]?\s*$/iu;

const titleCase = (s: string) => s.split(' ').map((w) => w.charAt(0).toLocaleUpperCase() + w.slice(1)).join(' ');

/** The name asked for when the whole message is a naming ask, else null. */
export function preferredNameAsk(text: string): { name: string } | null {
  const m = NAME_ASK.exec(text);
  if (!m) return null;
  const name = cleanName(titleCase(m[1].trim()));
  return name ? { name } : null;
}

export const preferredNameFrom = (text: string): string | null => preferredNameAsk(text)?.name ?? null;
