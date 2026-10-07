import type { BriefLanguage } from '../briefings/types.js';

/** Product news is an independent, explicit consent; weekly briefings never imply it. */
export const NEWS_CONSENT_VERSION = 1;
export const LANGUAGE_CAMPAIGN_ID = 'bobby-languages-2026-10';
export const NEWS_MIN_BUILD = 66;
export const NEWS_LANGUAGES = ['en', 'es', 'de', 'fr', 'it', 'pt', 'pt-BR'] as const;
export const LAUNCH_LANGUAGES: readonly BriefLanguage[] = ['es', 'de', 'fr', 'it', 'pt', 'pt-BR'];
export const newsPushEnabled = (env: NodeJS.ProcessEnv = process.env) => env.BOBBY_NEWS_PUSH_ENABLED === 'on';

/** Fixed, reviewable product announcement. No private account or financial data reaches the lock screen. */
export const NEWS_COPY: Readonly<Record<BriefLanguage, { title: string; body: string }>> = {
  en: { title: 'Bobby speaks more languages', body: 'Open Bobby and try it in your preferred language.' },
  es: { title: 'Bobby ya está en español', body: 'Abre Bobby y pruébalo en tu idioma.' },
  de: { title: 'Bobby spricht jetzt Deutsch', body: 'Öffne Bobby und probiere ihn auf Deutsch aus.' },
  fr: { title: 'Bobby parle maintenant français', body: 'Ouvre Bobby et découvre-le en français.' },
  it: { title: 'Bobby ora parla italiano', body: 'Apri Bobby e provalo in italiano.' },
  pt: { title: 'O Bobby já fala português', body: 'Abre o Bobby e experimenta-o em português.' },
  'pt-BR': { title: 'O Bobby já fala português', body: 'Abra o Bobby e experimente em português.' },
};

export interface NewsFilters {
  languages: BriefLanguage[];
  countries: string[];
  minAppBuild: number;
  identityId: string | null;
}

export function newsPayload(campaignId: string, language: BriefLanguage): Record<string, unknown> {
  const copy = NEWS_COPY[language];
  return {
    aps: { alert: { title: copy.title, body: copy.body }, sound: 'default', 'thread-id': 'bobby-news' },
    newsCampaignId: campaignId, language, screen: 'language',
  };
}
