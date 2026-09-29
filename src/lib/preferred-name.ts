// ============================================================
// "Call me X" — the name a reader asks Bobby to use, read from what they typed or said ("llámame Tony",
// "call me Tony", "me chame de Tony", "mi nombre es Ana"). Shared by the desk endpoint (it stores the name after
// a delivered read) and the web desk (a message that is only the name is saved without running a read).
// Only an explicit ask counts; nothing is inferred.
// ============================================================

/** A name as stored: 1–40 characters of letters, spaces, apostrophes, dots and hyphens. */
export function cleanName(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const s = v.normalize('NFC').replace(/\s+/g, ' ').trim();
  return s.length >= 1 && s.length <= 40 && /^[\p{L}][\p{L}\p{M}'’. -]*$/u.test(s) ? s : null;
}

const NAME_STOP = new Set(['back', 'later', 'now', 'tomorrow', 'maybe', 'when', 'if', 'the', 'a', 'an', 'luego', 'después', 'despues', 'mañana', 'manana', 'ahora', 'cuando', 'si', 'por', 'para', 'depois', 'amanhã', 'amanha', 'agora', 'quando', 'se', 'de', 'la', 'el', 'lo', 'o']);
const NAME_ASK = /(?:^|[\s,.;:!¿?¡"'(])(?:ll[aá]mame|mi\s+nombre\s+es|me\s+llamo|call\s+me|my\s+name\s+is|me\s+chame\s+de|chame-me\s+de|pode\s+me\s+chamar\s+de|meu\s+nome\s+[eé])\s+([\p{L}][\p{L}\p{M}'’-]{0,39})/iu;

/** The name asked for in `text` and the text without that clause, or null when there is no such ask. */
export function preferredNameAsk(text: string): { name: string; rest: string } | null {
  const m = NAME_ASK.exec(text);
  if (!m) return null;
  const word = m[1];
  if (NAME_STOP.has(word.toLowerCase())) return null;
  const name = cleanName(word.charAt(0).toLocaleUpperCase() + word.slice(1));
  if (!name) return null;
  const rest = (text.slice(0, m.index) + text.slice(m.index + m[0].length)).replace(/^[\s,.;:!¿?¡]+|[\s,.;:]+$/g, '').trim();
  return { name, rest };
}

export const preferredNameFrom = (text: string): string | null => preferredNameAsk(text)?.name ?? null;
