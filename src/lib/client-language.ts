import { APP_LANGUAGES, appLocale, type AppLanguage } from './app-language';

function supportedLanguage(value: string | null): AppLanguage | undefined {
  const base = value?.trim().toLowerCase().split(/[-_]/)[0];
  return (APP_LANGUAGES as readonly string[]).includes(base ?? '') ? base as AppLanguage : undefined;
}
function preferredLanguages(): readonly string[] {
  if (typeof navigator === 'undefined') return [];
  return navigator.languages?.length ? navigator.languages : [navigator.language];
}
export function clientLanguage(): AppLanguage {
  if (typeof window !== 'undefined') { const q = supportedLanguage(new URLSearchParams(window.location.search).get('lang')); if (q) return q; }
  try { const saved = supportedLanguage(localStorage.getItem('bobby_lang')); if (saved) return saved; } catch {}
  return preferredLanguages().map(value => supportedLanguage(value)).find(Boolean) ?? 'en';
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
  return appLocale(l, persisted ?? preferredLanguages().find(value => supportedLanguage(value) === l));
}
/** Keep an explicit URL choice for reloads and OAuth; automatic device choices remain automatic. */
export function rememberClientLanguage(): void {
  const language = clientLanguage(), locale = clientLocale();
  try { localStorage.setItem('bobby_lang', language); localStorage.setItem('bobby_locale', locale); } catch {}
}
export function rememberQueryLanguage(): void {
  if (typeof window !== 'undefined' && supportedLanguage(new URLSearchParams(window.location.search).get('lang'))) rememberClientLanguage();
}
/** Carry the interface and regional context across routes even when storage is unavailable. */
export function clientLanguagePath(path: string): string {
  if (typeof window === 'undefined' || !path.startsWith('/') || path.startsWith('//')) return path;
  const url = new URL(path, window.location.origin);
  url.searchParams.set('lang', clientLanguage());
  url.searchParams.set('locale', clientLocale());
  const country = new URLSearchParams(window.location.search).get('country');
  if (country && /^[A-Z]{2}$/.test(country)) url.searchParams.set('country', country);
  return url.pathname + url.search + url.hash;
}
/** Update the document without importing the full UI catalogue. */
export function syncDocumentLanguage(): void {
  if (typeof document !== 'undefined' && document.documentElement) document.documentElement.lang = clientLocale();
}
