/**
 * First-visit language by visitor country: a default, never a stored choice. Pure data and one function
 * (no DOM access). public/home/index.html carries an inline copy of both maps and of the rule;
 * scripts/test-geo-language.mjs asserts the two agree.
 */
import type { AppLanguage, AppLocale } from './app-language';

/** Countries with one site language, grouped by the locale they get (the locale decides Portugal vs Brazil, Mexico vs Spain). */
export const GEO_SINGLE: Readonly<Partial<Record<AppLocale, string>>> = {
  'de-DE': 'DE AT',
  // France, Monaco and the French overseas territories.
  'fr-FR': 'FR MC GF GP MQ RE YT PM BL MF NC PF WF TF',
  'it-IT': 'IT SM VA',
  'pt-PT': 'PT AO MZ CV',
  'pt-BR': 'BR',
  'es-ES': 'ES',
  // Spanish-speaking Latin America.
  'es-MX': 'MX AR BO CL CO CR CU DO EC SV GT HN NI PA PY PE PR UY VE',
  'en-GB': 'GB',
  'en-IE': 'IE',
  'en-AU': 'AU NZ',
};

/**
 * Multilingual countries: the first browser language found in the list decides; with none, the first entry is
 * the default. A browser language outside the six can still decide (Dutch-speaking Belgium reads English).
 */
export const GEO_MULTI: Readonly<Record<string, readonly (readonly [browser: string, locale: AppLocale])[]>> = {
  CH: [['de', 'de-DE'], ['fr', 'fr-FR'], ['it', 'it-IT']],
  BE: [['fr', 'fr-FR'], ['de', 'de-DE'], ['nl', 'en-US']],
  LU: [['fr', 'fr-FR'], ['de', 'de-DE']],
  CA: [['en', 'en-CA'], ['fr', 'fr-FR']],
  US: [['en', 'en-US'], ['es', 'es-US']],
};

/** The site language and locale for a two-letter country code, or null when the country does not decide. */
export function countryLanguage(country: unknown, browserLanguages: readonly unknown[] = []): { language: AppLanguage; locale: AppLocale } | null {
  const code = typeof country === 'string' && /^[A-Za-z]{2}$/.test(country) ? country.toUpperCase() : '';
  if (!code) return null;
  let locale: AppLocale | undefined;
  const options = GEO_MULTI[code];
  if (options) {
    for (const value of browserLanguages) {
      const base = String(value ?? '').trim().toLowerCase().split(/[-_]/)[0];
      const match = options.find(option => option[0] === base);
      if (match) { locale = match[1]; break; }
    }
    locale = locale ?? options[0][1];
  } else {
    locale = (Object.keys(GEO_SINGLE) as AppLocale[]).find(key => (GEO_SINGLE[key] ?? '').split(' ').includes(code));
  }
  return locale ? { language: locale.slice(0, 2) as AppLanguage, locale } : null;
}
