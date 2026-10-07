import { postgrestRpc, BriefingStorageError, type RpcFn } from '../briefings/db.js';
import type { BriefLanguage, DeviceEnvironment } from '../briefings/types.js';
import { NEWS_LANGUAGES, type NewsFilters } from './config.js';
import { appLanguage, isAppLocale, type AppLocale } from '../../../src/lib/app-language.js';

let transport: RpcFn = postgrestRpc;
export function setPushNewsRpc(fn: RpcFn | null): void { transport = fn ?? postgrestRpc; }
const object = (value: unknown, name: string): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new BriefingStorageError(name, 200);
  return value as Record<string, unknown>;
};
async function rpc<T>(name: string, body: Record<string, unknown>): Promise<T> {
  return object(await transport(name, body), name) as T;
}
const integer = (v: unknown) => Number.isSafeInteger(v) && (v as number) >= 0;
const invalid = (name: string): never => { throw new BriefingStorageError(name, 200); };
function settings(value: NewsSettings, name: string): NewsSettings {
  if (!integer(value.revision) || typeof value.newsEnabled !== 'boolean' || !NEWS_LANGUAGES.includes(value.language)
    || !isAppLocale(value.locale, appLanguage(value.language)) || (value.language === 'pt-BR') !== (value.locale === 'pt-BR')
    || (value.consentVersion !== null && value.consentVersion !== 1) || (value.newsEnabled && value.consentVersion !== 1)) invalid(name);
  return value;
}
const filterArgs = (f: NewsFilters) => ({ p_languages: f.languages, p_countries: f.countries, p_min_build: f.minAppBuild, p_identity: f.identityId });

export interface NewsSettings {
  revision: number; newsEnabled: boolean; language: BriefLanguage; locale: AppLocale; consentVersion: number | null;
}
export const getSettings = async (identityId: string) => settings(await rpc<NewsSettings>('bobby_news_settings_get', { p_identity: identityId }), 'bobby_news_settings_get');
export const patchSettings = async (identityId: string, revision: number, patch: Record<string, unknown>, country: string | null) => {
  const r = await rpc<{ ok: true; settings: NewsSettings } | { ok: false; revision: number }>('bobby_news_settings_patch', {
    p_identity: identityId, p_expected_revision: revision, p_patch: patch, p_country: country,
  });
  if (r.ok === true) settings(r.settings, 'bobby_news_settings_patch');
  else if (r.ok !== false || !integer((r as { revision: number }).revision)) invalid('bobby_news_settings_patch');
  return r;
};
export interface NewsAudience {
  eligible: number; registeredDevices: number; optInAccounts: number;
  byLanguage: Record<string, number>; byCountry: Record<string, number>;
}
export const audience = async (f: NewsFilters, campaignId: string | null = null) => {
  const r = await rpc<NewsAudience>('bobby_news_audience', { ...filterArgs(f), p_campaign: campaignId });
  if (![r.eligible, r.registeredDevices, r.optInAccounts].every(integer)) invalid('bobby_news_audience');
  for (const counts of [r.byLanguage, r.byCountry]) {
    object(counts, 'bobby_news_audience');
    if (!Object.values(counts).every(integer)) invalid('bobby_news_audience');
  }
  return r;
};
export const prepare = async (campaignId: string, digest: string, filters: NewsFilters, actorId: string) => {
  const r = await rpc<{ ok: boolean; created?: boolean; empty?: boolean; code?: string }>('bobby_news_campaign_prepare', {
    p_campaign: campaignId, p_digest: digest, ...filterArgs(filters), p_actor: actorId,
  });
  if (typeof r.ok !== 'boolean' || (r.empty !== undefined && typeof r.empty !== 'boolean')) invalid('bobby_news_campaign_prepare');
  return r;
};
export interface NewsClaim {
  state: 'claimed'; id: string; fence: number; language: BriefLanguage; apnsId: string; expiresAt: string;
}
export const claim = async (campaignId: string) => {
  const r = await rpc<NewsClaim | { state: 'empty' }>('bobby_news_delivery_claim', { p_campaign: campaignId });
  if (r.state === 'empty') return r;
  if (r.state !== 'claimed' || !integer(r.fence) || r.fence < 1 || !NEWS_LANGUAGES.includes(r.language)
    || !/^[0-9a-f-]{36}$/i.test(r.id) || !/^[0-9a-f-]{36}$/i.test(r.apnsId) || !Number.isFinite(Date.parse(r.expiresAt))) invalid('bobby_news_delivery_claim');
  return r;
};
export interface NewsAuthorization {
  ok: true; tokenCiphertext: string; environment: DeviceEnvironment; topic: string;
}
export const authorize = async (id: string, fence: number) => {
  const r = await rpc<NewsAuthorization | { ok: false }>('bobby_news_delivery_authorize', { p_id: id, p_fence: fence });
  if (r.ok === false) return r;
  if (r.ok !== true || typeof r.tokenCiphertext !== 'string' || !['production','sandbox'].includes(r.environment)
    || typeof r.topic !== 'string') invalid('bobby_news_delivery_authorize');
  return r;
};
export const result = async (id: string, fence: number, outcome: string, status: number | null, reason: string | null, retryAfterSeconds = 30) => {
  const r = await rpc<{ ok: boolean }>('bobby_news_delivery_result', {
    p_id: id, p_fence: fence, p_outcome: outcome, p_apns_status: status, p_reason: reason, p_retry_seconds: retryAfterSeconds,
  });
  if (typeof r.ok !== 'boolean') invalid('bobby_news_delivery_result');
  return r;
};
export interface NewsDeliveryCounts {
  pending: number; sending: number; sent: number; unknown: number; failed: number; cancelled: number; expired: number;
}
export const status = async (campaignId: string) => {
  const r = await rpc<NewsDeliveryCounts>('bobby_news_campaign_status', { p_campaign: campaignId });
  if (!['pending','sending','sent','unknown','failed','cancelled','expired'].every(k => integer(r[k]))) invalid('bobby_news_campaign_status');
  return r;
};
