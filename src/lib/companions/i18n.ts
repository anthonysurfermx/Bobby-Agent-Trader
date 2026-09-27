// Three product languages: English, Spanish and Brazilian Portuguese. The choice is stored in
// `bobby_lang` (the same key the home page at public/home/index.html and the rest of the web
// honour), switchable from the globe menu on the risk notice and the desk, and from the profile.
// With nothing stored, the language follows the browser exactly as the home does — es* → Spanish,
// pt* → Portuguese, anything else English — so the home and the desk always agree; nothing is
// saved until the visitor picks one.
// Portuguese is being rolled out surface by surface: a string without a `pt` entry falls back to
// English, never to Spanish, so a page that has not been translated yet still reads cleanly.
export type Lang = 'en' | 'es' | 'pt';

export const LANGS: readonly Lang[] = ['es', 'en', 'pt'];

/** Each language named in itself, the way the language menu shows it. */
export const LANG_NAME: Record<Lang, string> = { es: 'Español', en: 'English', pt: 'Português' };

export interface Bi { en: string; es: string; pt?: string }

export function lang(): Lang {
  try {
    const stored = localStorage.getItem('bobby_lang');
    if (stored === 'es' || stored === 'en' || stored === 'pt') return stored;
  } catch { /* private mode */ }
  // Only in a browser: scripts and tests that import the copy keep reading English.
  if (typeof window !== 'undefined' && typeof navigator !== 'undefined') {
    const browser = String(navigator.language || '').toLowerCase();
    if (browser.startsWith('es')) return 'es';
    if (browser.startsWith('pt')) return 'pt';
  }
  return 'en';
}

/** Stores the choice; callers reload (or re-render) so every `t()` reads it. */
export function setLang(next: Lang): void {
  try { localStorage.setItem('bobby_lang', next); } catch { /* private mode */ }
}

export function isSpanish(): boolean { return lang() === 'es'; }
export function isPortuguese(): boolean { return lang() === 'pt'; }

/** `t(en, es, pt?)` — the same shape as `L.t` in the iOS app, plus Portuguese (missing → English). */
export function t(en: string, es: string, pt?: string): string {
  const l = lang();
  if (l === 'es') return es;
  if (l === 'pt') return pt ?? en;
  return en;
}

/**
 * A missing entry used to throw here, and because the root route has an
 * errorElement, one absent record took the whole desk down to a 404 page.
 * Adding a companion without every id-keyed record filled in is a data gap,
 * not a reason to lose the route — so this degrades to an empty string and
 * says so in the console.
 */
export function pick(bi: Bi | null | undefined): string {
  if (!bi) {
    console.error('[i18n] pick() got no bilingual entry — a companion id is missing from an id-keyed record');
    return '';
  }
  const l = lang();
  if (l === 'es') return bi.es ?? '';
  if (l === 'pt') return bi.pt ?? bi.en ?? '';
  return bi.en ?? '';
}

/** Language sent to the TTS endpoint (/api/bobby-voice-free accepts es | en | pt). */
export function ttsLang(): Lang { return lang(); }

/** BCP 47 tag for speech recognition, speech synthesis and date formatting. */
export function speechLocale(): string {
  const l = lang();
  return l === 'es' ? 'es-MX' : l === 'pt' ? 'pt-BR' : 'en-US';
}

/** The `<html lang>` value for the current choice. */
export function htmlLang(): string {
  const l = lang();
  return l === 'pt' ? 'pt-BR' : l;
}
