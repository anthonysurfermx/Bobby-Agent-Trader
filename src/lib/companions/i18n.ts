// Two product languages, picked the same way the iOS app does: the device
// language, overridable by the `bobby_lang` preference the web already stores.
export type Lang = 'en' | 'es';

export interface Bi { en: string; es: string }

export function lang(): Lang {
  try {
    const stored = localStorage.getItem('bobby_lang');
    if (stored === 'es' || stored === 'en') return stored;
  } catch { /* private mode */ }
  if (typeof navigator !== 'undefined' && navigator.language?.toLowerCase().startsWith('es')) return 'es';
  return 'en';
}

export function isSpanish(): boolean { return lang() === 'es'; }

/** `t(en, es)` — the same shape as `L.t` in the iOS app. */
export function t(en: string, es: string): string { return isSpanish() ? es : en; }

export function pick(bi: Bi): string { return isSpanish() ? bi.es : bi.en; }

/** Language sent to the TTS endpoint. */
export function ttsLang(): Lang { return lang(); }
