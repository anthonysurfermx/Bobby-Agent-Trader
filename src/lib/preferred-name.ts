// ============================================================
// "Call me X" — the name a reader asks Bobby to use. Only an explicit, standalone ask counts: a message that is
// nothing but the naming clause ("llámame Tony", "Call me Juan Carlos.", "me chame de João"). A naming phrase
// inside a market question ("call me crazy, but is NVDA overbought?") is never a name, and the web desk asks
// "¿Te llamo «Tony»?" before saving, so an idiom it did not catch ("llámame más tarde") is never stored
// silently. The server never takes a name from a question. Nothing is inferred.
// ============================================================
import { VOICE_ASSETS } from './voice-assets.js';

/** First words that make "call me …" an idiom or a time, not a name. */
const NOT_A_NAME = new Set([
  'back', 'later', 'now', 'tomorrow', 'tonight', 'soon', 'anytime', 'sometime', 'maybe', 'when', 'if', 'the', 'a', 'an', 'out',
  'crazy', 'paranoid', 'old', 'old-fashioned', 'skeptical', 'sceptical', 'naive', 'lazy', 'stupid', 'silly', 'cautious', 'whatever',
  'luego', 'después', 'despues', 'mañana', 'manana', 'ahora', 'cuando', 'si', 'por', 'para', 'más', 'mas', 'en', 'al', 'otra', 'otro',
  'pronto', 'tarde', 'temprano', 'rato', 'loco', 'loca', 'ingenuo', 'ingenua', 'paranoico', 'paranoica', 'anticuado', 'anticuada',
  'tonto', 'tonta', 'exagerado', 'exagerada', 'importante', 'como', 'cómo', 'lo', 'la', 'el', 'de',
  'depois', 'amanhã', 'amanha', 'agora', 'quando', 'se', 'mais', 'tarde', 'logo', 'louco', 'louca', 'ingênuo', 'bobo', 'boba', 'o',
]);
const TICKERS = new Set(VOICE_ASSETS.map((a) => a.symbol));
/** Words that make a "name" an instruction. */
const TRADE_WORDS = new Set(['buy', 'sell', 'hold', 'short', 'long', 'invest', 'all-in', 'comprar', 'compra', 'cómpralo', 'vender', 'vende', 'véndelo', 'invierte', 'invertir', 'investir', 'compre', 'venda']);
/** A name word: letters (apostrophes and hyphens inside), optionally an abbreviation dot ("Ma."). */
const NAME_WORD = /^[\p{L}][\p{L}'’-]{0,23}\.?$/u;

/**
 * A name as stored: one to four words of letters (with particles such as "de", "del", "da"), an abbreviation dot
 * allowed ("Ma. Fernanda"), 40 characters at most. What the person typed is kept as typed.
 */
export function cleanName(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const s = v.normalize('NFC').replace(/\s+/g, ' ').trim();
  if (s.length < 1 || s.length > 40) return null;
  const words = s.split(' ');
  if (words.length > 4 || !words.every((w) => NAME_WORD.test(w))) return null;
  // Not a name: a trade word or a ticker typed in capitals ("Ana. Buy NVDA").
  if (words.some((w) => TRADE_WORDS.has(w.replace(/\.$/, '').toLocaleLowerCase()) || (w.length >= 2 && w === w.toLocaleUpperCase() && TICKERS.has(w)))) return null;
  return s;
}

/** The whole message is a naming ask: "llámame Tony", "Call me Juan Carlos.", "mi nombre es María de Jesús". */
const NAME_ASK = /^\s*(?:ll[aá]mame|mi\s+nombre\s+es|me\s+llamo|call\s+me|my\s+name\s+is|me\s+chame\s+de|chame-me\s+de|pode\s+me\s+chamar\s+de|meu\s+nome\s+[eé])\s+([\p{L}][\p{L}'’. -]{0,40}?)\s*[.!]?\s*$/iu;
const PARTICLES = new Set(['de', 'del', 'la', 'las', 'los', 'da', 'das', 'do', 'dos', 'y', 'e', 'van', 'von']);
const titleCase = (s: string) => s.split(' ').map((w, i) => (i > 0 && PARTICLES.has(w.toLowerCase()) ? w.toLowerCase() : w.charAt(0).toLocaleUpperCase() + w.slice(1))).join(' ');

/** The name asked for when the whole message is a naming ask, else null. The desk confirms before saving it. */
export function preferredNameAsk(text: string): { name: string } | null {
  const m = NAME_ASK.exec(text);
  if (!m) return null;
  const raw = m[1].trim();
  if (NOT_A_NAME.has(raw.split(/\s+/)[0].toLocaleLowerCase())) return null;
  const name = cleanName(titleCase(raw));
  return name ? { name } : null;
}

export const preferredNameFrom = (text: string): string | null => preferredNameAsk(text)?.name ?? null;
