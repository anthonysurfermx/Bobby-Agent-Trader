import { APP_LANGUAGES, appLocale, type AppLanguage } from './app-language';
import { countryLanguage } from './geo-language';

const GEO_KEY = 'bobby_geo', GEO_TIMEOUT_MS = 1500;
let countryRequested = false;
// Set when the country arrived but this page could not switch to it: it applies from the next load, never mid-page.
let countryDeferred = false;

function supportedLanguage(value: string | null): AppLanguage | undefined {
  const base = value?.trim().toLowerCase().split(/[-_]/)[0];
  return (APP_LANGUAGES as readonly string[]).includes(base ?? '') ? base as AppLanguage : undefined;
}
function preferredLanguages(): readonly string[] {
  if (typeof navigator === 'undefined') return [];
  return navigator.languages?.length ? navigator.languages : [navigator.language];
}
/** The visitor's country cached from /api/geo (two letters). null: not asked yet; undefined: storage unavailable or deferred. */
function cachedCountry(): string | null | undefined {
  if (countryDeferred) return undefined;
  try { const value = localStorage.getItem(GEO_KEY); return value && /^[A-Z]{2}$/.test(value) ? value : null; } catch { return undefined; }
}
/** The default the cached country gives. Reads the cache only: it never starts a request. */
function countryDefault(): ReturnType<typeof countryLanguage> {
  const country = cachedCountry();
  return country ? countryLanguage(country, preferredLanguages()) : null;
}
/**
 * First visit only (no ?lang, no stored choice, no cached country): ask /api/geo once for the two-letter country
 * (never the IP), cache it, and when it changes the language on screen reload, the re-render a language change
 * uses (LangMenu). The reload carries no ?lang and nothing here writes `bobby_lang`: a default, not a choice.
 */
function requestCountry(shown: AppLanguage): void {
  if (countryRequested || typeof window === 'undefined' || typeof fetch !== 'function') return;
  countryRequested = true;
  const controller = typeof AbortController === 'function' ? new AbortController() : undefined;
  let expired = false;
  // Left to fire: after an answer it has nothing to abort, and a late answer must not switch the page.
  setTimeout(() => { expired = true; controller?.abort(); }, GEO_TIMEOUT_MS);
  fetch('/api/geo', { signal: controller?.signal })
    .then(response => (response.ok ? response.json() : null))
    .then((body: { country?: unknown } | null) => {
      const country = typeof body?.country === 'string' ? body.country.toUpperCase() : '';
      if (!/^[A-Z]{2}$/.test(country)) return;
      // The reload relies on this cache: without it the next load would ask, and reload, again.
      try { localStorage.setItem(GEO_KEY, country); if (localStorage.getItem(GEO_KEY) !== country) return; } catch { return; }
      if (clientLanguage() === shown) { syncDocumentLanguage(); return; }
      // Not after the timeout, not under a sign-in callback (its code is single use), not once the visitor is using the page.
      const active = typeof navigator !== 'undefined' && navigator.userActivation?.hasBeenActive;
      if (expired || active || /^\/auth\//.test(window.location.pathname)) { countryDeferred = true; return; }
      window.location.reload();
    })
    .catch(() => {});
}
/** Precedence: ?lang, then the stored choice, then the visitor's country, then the browser, then English. */
export function clientLanguage(): AppLanguage {
  if (typeof window !== 'undefined') { const q = supportedLanguage(new URLSearchParams(window.location.search).get('lang')); if (q) return q; }
  try { const saved = supportedLanguage(localStorage.getItem('bobby_lang')); if (saved) return saved; } catch {}
  const browser = preferredLanguages().map(value => supportedLanguage(value)).find(Boolean) ?? 'en';
  if (cachedCountry() === null) requestCountry(browser);
  return countryDefault()?.language ?? browser;
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
  // The country gives the region too (Portugal vs Brazil, Mexico vs Spain) when it speaks the language in use.
  const geo = countryDefault();
  return appLocale(l, persisted ?? (geo?.language === l ? geo.locale : undefined) ?? preferredLanguages().find(value => supportedLanguage(value) === l));
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
