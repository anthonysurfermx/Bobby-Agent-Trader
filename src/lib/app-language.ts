/** Shared client/server language contract. Region chooses wording, never the requested instrument. */
export const APP_LANGUAGES = ['en', 'es', 'fr', 'pt', 'it', 'de'] as const;
export type AppLanguage = typeof APP_LANGUAGES[number];
export const APP_LOCALES = ['en-US', 'es-MX', 'fr-FR', 'pt-PT', 'pt-BR', 'it-IT', 'de-DE'] as const;
export type AppLocale = typeof APP_LOCALES[number];
export function isAppLanguage(value: unknown): value is AppLanguage {
  return typeof value === 'string' && (APP_LANGUAGES as readonly string[]).includes(value);
}
export function appLanguage(value: unknown, fallback: AppLanguage = 'en'): AppLanguage {
  const base = typeof value === 'string' ? value.toLowerCase().split(/[-_]/)[0] : '';
  return isAppLanguage(base) ? base : fallback;
}
export function appLocale(language: AppLanguage, value?: unknown): AppLocale {
  if (language === 'pt') return typeof value === 'string' && /^pt[-_]br$/i.test(value) ? 'pt-BR' : 'pt-PT';
  return ({ en: 'en-US', es: 'es-MX', fr: 'fr-FR', it: 'it-IT', de: 'de-DE' } as const)[language];
}
export function languageName(language: AppLanguage, locale?: unknown): string {
  return language === 'pt' ? (appLocale(language, locale) === 'pt-BR' ? 'Brazilian Portuguese' : 'European Portuguese (Portugal)')
    : ({ en: 'English', es: 'Mexican Spanish', fr: 'French (France)', it: 'Italian (Italy)', de: 'German (Germany)' } as const)[language];
}
export function localized<T>(language: AppLanguage, values: Record<AppLanguage, T>): T { return values[language]; }
