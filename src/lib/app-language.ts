/** Shared client/server language contract. Region chooses wording, never the requested instrument. */
export const APP_LANGUAGES = ['en', 'es', 'fr', 'pt', 'it', 'de'] as const;
export type AppLanguage = typeof APP_LANGUAGES[number];
// Includes every regional identifier emitted by the native language resolver.
export const APP_LOCALES = ['en-US', 'en-GB', 'en-AU', 'en-CA', 'en-IE', 'es-MX', 'es-ES', 'es-US', 'fr-FR', 'pt-PT', 'pt-BR', 'it-IT', 'de-DE'] as const;
export type AppLocale = typeof APP_LOCALES[number];
export function isAppLanguage(value: unknown): value is AppLanguage {
  return typeof value === 'string' && (APP_LANGUAGES as readonly string[]).includes(value);
}
export function appLanguage(value: unknown, fallback: AppLanguage = 'en'): AppLanguage {
  const base = typeof value === 'string' ? value.toLowerCase().split(/[-_]/)[0] : '';
  return isAppLanguage(base) ? base : fallback;
}
/** Strict request validation: a supported locale must also belong to the selected language. */
export function isAppLocale(value: unknown, language?: AppLanguage): value is AppLocale {
  return typeof value === 'string' && (APP_LOCALES as readonly string[]).includes(value)
    && (language === undefined || value.startsWith(`${language}-`));
}
export function appLocale(language: AppLanguage, value?: unknown): AppLocale {
  const normalized = typeof value === 'string' ? value.replace('_', '-').toLowerCase() : '';
  const regional = APP_LOCALES.find(locale => locale.toLowerCase() === normalized && isAppLocale(locale, language));
  return regional ?? ({ en: 'en-US', es: 'es-MX', fr: 'fr-FR', pt: 'pt-PT', it: 'it-IT', de: 'de-DE' } as const)[language];
}
export function languageName(language: AppLanguage, locale?: unknown): string {
  const regional = appLocale(language, locale);
  if (language === 'pt') return regional === 'pt-BR' ? 'Brazilian Portuguese' : 'European Portuguese (Portugal)';
  if (language === 'es') return regional === 'es-ES' ? 'Spanish (Spain)' : regional === 'es-US' ? 'Spanish (United States)' : 'Mexican Spanish';
  if (language === 'en') return ({ 'en-US': 'English', 'en-GB': 'British English', 'en-AU': 'Australian English', 'en-CA': 'Canadian English', 'en-IE': 'Irish English' } as Partial<Record<AppLocale, string>>)[regional] ?? 'English';
  return ({ fr: 'French (France)', it: 'Italian (Italy)', de: 'German (Germany)' } as const)[language];
}
export function localized<T>(language: AppLanguage, values: Record<AppLanguage, T>): T { return values[language]; }
