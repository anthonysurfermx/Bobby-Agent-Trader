import { WEB_TRANSLATIONS } from './web-translations';
import { appLanguage, appLocale, type AppLanguage } from '../app-language';
import { clientLanguage as lang, clientLocale as locale, syncDocumentLanguage } from '../client-language';
export type Lang = AppLanguage;
export const LANGS: readonly Lang[] = ['es', 'en', 'fr', 'pt', 'it', 'de'];
export const LANG_NAME: Record<Lang, string> = { es: 'Español', en: 'English', fr: 'Français', pt: 'Português', it: 'Italiano', de: 'Deutsch' };
export interface Bi { en: string; es: string; pt?: string; fr?: string; it?: string; de?: string }
export { lang, locale };
export function setLang(next: Lang) { try { localStorage.setItem('bobby_lang', next); } catch {} Promise.resolve().then(syncDocumentLanguage); }
export function setLocale(next: string) { try { localStorage.setItem('bobby_locale', appLocale(appLanguage(next), next)); } catch {} Promise.resolve().then(syncDocumentLanguage); }
export function isSpanish(): boolean { return lang() === 'es'; }
export function isPortuguese(): boolean { return lang() === 'pt'; }
/** Explicit translated arguments retain priority; legacy calls can use the shared UI catalogue. */
export function t(en: string, es: string, pt?: string, fr?: string, it?: string, de?: string): string {
  return pick({ en, es, pt, fr, it, de });
}
type ExtraLanguage = 'fr' | 'pt' | 'it' | 'de';
const patterns = new Map<ExtraLanguage, Array<{ re: RegExp; ids: number[]; value: string }>>();
const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export function translatedEnglish(en: string, language: Lang = lang()): string | undefined {
  if (language === 'en' || language === 'es') return undefined;
  const catalog = WEB_TRANSLATIONS[language];
  if (Object.prototype.hasOwnProperty.call(catalog, en)) return catalog[en];
  if (!patterns.has(language)) {
    const compiled: Array<{ re: RegExp; ids: number[]; value: string }> = [];
    for (const [key, value] of Object.entries(catalog).sort((a,b) => b[0].length - a[0].length)) {
      if (!/\{\d+\}/.test(key) || key.replace(/\{\d+\}/g, '').replace(/[^\p{L}]/gu, '').length < 3) continue;
      const ids: number[] = [];
      const parts = key.split(/(\{\d+\})/g).map(part => {
        const match = /^\{(\d+)\}$/.exec(part);
        if (!match) return escapeRegex(part);
        ids.push(Number(match[1])); return '([\\s\\S]*?)';
      });
      compiled.push({ re: new RegExp('^' + parts.join('') + '$'), ids, value });
    }
    patterns.set(language, compiled);
  }
  for (const template of patterns.get(language)!) {
    const match = template.re.exec(en); if (!match) continue;
    const args = new Map<number, string>(); let valid = true;
    template.ids.forEach((id, i) => { if (args.has(id) && args.get(id) !== match[i+1]) valid = false; args.set(id, match[i+1]); });
    if (valid) return template.value.replace(/\{(\d+)\}/g, (token, id) => args.get(Number(id)) ?? token);
  }
  return undefined;
}
export function pick(entry: Bi | null | undefined): string { return pickIn(entry, lang(), locale()); }
/** `pick` for an explicit language and locale: what the page shows when those are its own. No page state is read. */
export function pickIn(entry: Bi | null | undefined, language: Lang, inLocale: string): string {
  if (!entry) { console.error('[i18n] Missing translation entry'); return ''; }
  // Legacy third arguments use Brazilian wording. The shared catalogue is the Portugal copy.
  if (language === 'pt' && inLocale === 'pt-PT') {
    const european = translatedEnglish(entry.en ?? '', language);
    if (european !== undefined) return european;
  }
  return entry[language] ?? translatedEnglish(entry.en ?? '', language) ?? entry.en ?? '';
}
export function ttsLang(): Lang { return lang(); }
export function speechLocale(): string { return locale(); }
export function htmlLang(): string { return locale(); }

export function translateText(language: Lang, en: string): string { return translatedEnglish(en, language) ?? en; }
