import { APP_LANGUAGES, appLanguage, appLocale, type AppLanguage } from './app-language';

function supportedLanguage(value: string | null): AppLanguage | undefined {
  const base = value?.trim().toLowerCase().split(/[-_]/)[0];
  return (APP_LANGUAGES as readonly string[]).includes(base ?? '') ? base as AppLanguage : undefined;
}
export function clientLanguage(): AppLanguage {
  if (typeof window !== 'undefined') { const q = supportedLanguage(new URLSearchParams(window.location.search).get('lang')); if (q) return q; }
  try { const saved = supportedLanguage(localStorage.getItem('bobby_lang')); if (saved) return saved; } catch {}
  return appLanguage(typeof navigator === 'undefined' ? 'en' : navigator.language);
}
export function clientLocale(): string {
  const l = clientLanguage();
  if (typeof window !== 'undefined') {
    const params = new URLSearchParams(window.location.search);
    const q = params.get('locale'); if (q && supportedLanguage(q) === l) return appLocale(l, q);
    const language = params.get('lang'); if (language && /[-_]/.test(language) && supportedLanguage(language) === l) return appLocale(l, language.replace('_','-'));
  }
  let saved: string | null = null;
  let savedLanguage: string | null = null;
  try { saved = localStorage.getItem('bobby_locale'); savedLanguage = localStorage.getItem('bobby_lang'); } catch {}
  const persisted = saved && supportedLanguage(saved) === l ? saved : savedLanguage && /[-_]/.test(savedLanguage) && supportedLanguage(savedLanguage) === l ? savedLanguage.replace('_','-') : undefined;
  return appLocale(l, persisted ?? (typeof navigator === 'undefined' ? undefined : navigator.language));
}
/** Update the document without importing the full UI catalogue. */
export function syncDocumentLanguage(): void {
  if (typeof document !== 'undefined' && document.documentElement) document.documentElement.lang = clientLocale();
}
