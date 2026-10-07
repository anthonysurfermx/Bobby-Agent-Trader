// Product news: independent versioned consent and admin-only, fixed-copy iOS announcements.
// Device tokens retain the encrypted installation binding used by /api/briefing-device; no Pro subscription gate.
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { APP_LANGUAGES, APP_LOCALES, appLanguage, appLocale } from '../src/lib/app-language.js';
import { requireAdmin, auditStart } from './_lib/admin.js';
import { requestOriginHost } from './_lib/origins.js';
import { enforcePublicRateLimit } from './_lib/request-security.js';
import { apnsConfig, pushMasterKey } from './_lib/briefings/config.js';
import {
  accountLimit, etag, fail, header, NO_STORE, parseIfMatch, parseWith, queryParams, readJsonBody,
  requireAccount, sendError, UUID_RE,
} from './_lib/briefings/http.js';
import * as db from './_lib/push-news/db.js';
import { campaignCohortId, runNewsCampaign } from './_lib/push-news/worker.js';
import {
  LANGUAGE_CAMPAIGN_ID, LAUNCH_LANGUAGES, NEWS_CONSENT_VERSION, NEWS_COPY, NEWS_LANGUAGES,
  NEWS_MIN_BUILD, newsPushEnabled, type NewsFilters,
} from './_lib/push-news/config.js';

export const config = { maxDuration: 60 };
const configuration = () => ({ enabled: newsPushEnabled(), apnsConfigured: !!apnsConfig(), tokenKeyConfigured: !!pushMasterKey() });
async function requireNewsAccount(req: VercelRequest) {
  const identity = await requireAccount(req);
  if (!['apple', 'google'].includes(identity.provider ?? '')) fail(401, 'signin_required');
  return identity;
}
async function requireNewsAdmin(req: VercelRequest, res: VercelResponse) {
  const identity = await requireAdmin(req, res);
  if (identity && !['apple', 'google'].includes(identity.provider ?? '')) fail(403, 'signin_required');
  return identity;
}
export interface PushNewsDeps {
  requireAccount: typeof requireAccount; requireAdmin: typeof requireAdmin;
  publicLimit: typeof enforcePublicRateLimit; accountLimit: typeof accountLimit; auditStart: typeof auditStart;
  getSettings: typeof db.getSettings; patchSettings: typeof db.patchSettings;
  audience: typeof db.audience; status: typeof db.status; runCampaign: typeof runNewsCampaign;
  configuration: typeof configuration;
}
const DEFAULT_DEPS: PushNewsDeps = {
  requireAccount: requireNewsAccount, requireAdmin: requireNewsAdmin, publicLimit: enforcePublicRateLimit, accountLimit, auditStart,
  getSettings: db.getSettings, patchSettings: db.patchSettings, audience: db.audience, status: db.status,
  runCampaign: runNewsCampaign, configuration,
};
const Countries = z.array(z.string().regex(/^[A-Z]{2}$/)).max(250).refine(a => new Set(a).size === a.length);
const Languages = z.array(z.enum(NEWS_LANGUAGES)).min(1).max(7).refine(a => new Set(a).size === a.length);
const Build = z.number().int().min(NEWS_MIN_BUILD).max(1_000_000);
const FilterBody = z.object({
  countries: Countries.optional(), languages: Languages.optional(), minAppBuild: Build.optional(),
});
const CampaignBody = FilterBody.extend({ campaignId: z.literal(LANGUAGE_CAMPAIGN_ID), dryRun: z.boolean().optional() }).strict();
const TestBody = z.object({ testId: z.string().regex(UUID_RE), identityId: z.string().regex(UUID_RE),
  minAppBuild: Build.optional(), dryRun: z.boolean().optional() }).strict();
const SettingsPatch = z.object({
  newsEnabled: z.boolean().optional(), acceptedConsentVersion: z.number().int().optional(),
  language: z.enum(APP_LANGUAGES).optional(), locale: z.enum(APP_LOCALES).optional(),
}).strict().refine(p => Object.keys(p).length > 0);

function filters(body: z.infer<typeof FilterBody>, identityId: string | null = null): NewsFilters {
  return { languages: [...(body.languages ?? LAUNCH_LANGUAGES)].sort(), countries: [...(body.countries ?? [])].sort(),
    minAppBuild: body.minAppBuild ?? NEWS_MIN_BUILD, identityId };
}
function observedCountry(req: VercelRequest): string | null {
  const value = header(req, 'x-vercel-ip-country')?.trim().toUpperCase();
  return value && /^[A-Z]{2}$/.test(value) && !['XX', 'ZZ'].includes(value) ? value : null;
}
function settingsBody(settings: db.NewsSettings, d: PushNewsDeps) {
  const cfg = d.configuration();
  return { ...settings, language: appLanguage(settings.language), locale: appLocale(appLanguage(settings.language), settings.language),
    options: { consentVersion: NEWS_CONSENT_VERSION }, deliveryAvailable: cfg.enabled && cfg.apnsConfigured && cfg.tokenKeyConfigured };
}
async function preview(campaignId: string, selected: NewsFilters, d: PushNewsDeps) {
  const cohortId = campaignCohortId(campaignId, selected);
  const [audience, delivery] = await Promise.all([d.audience(selected, cohortId), d.status(cohortId)]);
  return { campaignId, cohortId, copy: NEWS_COPY, ...audience, delivery, config: d.configuration(), filters: selected };
}

export function createPushNewsHandler(over: Partial<PushNewsDeps> = {}) {
  const d = { ...DEFAULT_DEPS, ...over };
  return async function handler(req: VercelRequest, res: VercelResponse) {
    res.setHeader('Cache-Control', NO_STORE);
    let op = 'unknown';
    try {
      if (!await d.publicLimit(req, res, 'push-news', 60, 60)) return;
      const query = queryParams(req, ['op', 'campaignId', 'countries', 'languages', 'minAppBuild']);
      op = query.op ?? 'settings';
      if (!['settings', 'preview', 'campaign', 'test'].includes(op)) fail(400, 'invalid_request');
      const method = (req.method ?? 'GET').toUpperCase();
      const allowed = op === 'settings' ? ['GET', 'PATCH'] : op === 'preview' ? ['GET'] : ['POST'];
      if (!allowed.includes(method)) fail(405, 'method_not_allowed', {}, { Allow: allowed.join(', ') });
      if (op !== 'preview' && Object.keys(query).some(k => k !== 'op')) fail(400, 'invalid_request');
      if (method !== 'GET' && !requestOriginHost(req.headers)) fail(403, 'invalid_request');

      if (op === 'settings') {
        const account = await d.requireAccount(req);
        await d.accountLimit('push-news-settings', account.id, 20, true);
        if (method === 'GET') {
          const settings = await d.getSettings(account.id);
          res.setHeader('ETag', etag(settings.revision));
          return res.status(200).json(settingsBody(settings, d));
        }
        const expected = parseIfMatch(header(req, 'if-match'));
        if (expected === undefined) fail(428, 'revision_required');
        if (expected === null) fail(400, 'invalid_request');
        const body = parseWith(SettingsPatch, await readJsonBody(req, 2048));
        if (body.locale && (!body.language || appLanguage(body.locale) !== body.language)) fail(400, 'invalid_request');
        if (body.newsEnabled === true && body.acceptedConsentVersion !== NEWS_CONSENT_VERSION) fail(400, 'consent_required');
        if (body.newsEnabled !== true && body.acceptedConsentVersion !== undefined) fail(400, 'invalid_request');
        const patch: Record<string, unknown> = {};
        if (body.newsEnabled !== undefined) patch.newsEnabled = body.newsEnabled;
        if (body.newsEnabled === true) patch.consentVersion = NEWS_CONSENT_VERSION;
        if (body.language) patch.language = body.language === 'pt' && appLocale('pt', body.locale) === 'pt-BR' ? 'pt-BR' : body.language;
        const saved = await d.patchSettings(account.id, expected, patch, observedCountry(req));
        if (!saved.ok) fail(409, 'revision_conflict', { revision: (saved as { revision: number }).revision });
        const settings = (saved as { settings: db.NewsSettings }).settings;
        res.setHeader('ETag', etag(settings.revision));
        return res.status(200).json(settingsBody(settings, d));
      }

      const admin = await d.requireAdmin(req, res);
      if (!admin) return;
      await d.accountLimit('push-news-admin', admin.id, 10, true);
      if (op === 'preview') {
        if (query.campaignId !== undefined && query.campaignId !== LANGUAGE_CAMPAIGN_ID) fail(400, 'invalid_request');
        const selected = parseWith(FilterBody.strict(), {
          ...(query.languages !== undefined ? { languages: query.languages.split(',') } : {}),
          ...(query.countries !== undefined ? { countries: query.countries ? query.countries.split(',') : [] } : {}),
          ...(query.minAppBuild !== undefined ? { minAppBuild: Number(query.minAppBuild) } : {}),
        });
        return res.status(200).json(await preview(LANGUAGE_CAMPAIGN_ID, filters(selected), d));
      }
      const body = await readJsonBody(req, 4096);
      const parsed = op === 'test' ? parseWith(TestBody, body) : parseWith(CampaignBody, body);
      const target = op === 'test' ? (parsed as z.infer<typeof TestBody>).identityId.toLowerCase() : null;
      const campaignId = op === 'test' ? `test-${(parsed as z.infer<typeof TestBody>).testId.toLowerCase()}` : LANGUAGE_CAMPAIGN_ID;
      const selected = op === 'test'
        ? filters({ languages: [...NEWS_LANGUAGES], minAppBuild: parsed.minAppBuild }, target)
        : filters(parsed as z.infer<typeof CampaignBody>);
      if (parsed.dryRun) return res.status(200).json(await preview(campaignId, selected, d));
      const cfg = d.configuration();
      if (!cfg.enabled || !cfg.apnsConfigured || !cfg.tokenKeyConfigured) fail(503, 'feature_disabled');
      const finish = await d.auditStart(admin, op === 'test' ? 'push_news_test' : 'push_news_campaign', campaignId, { filters: selected });
      try {
        const outcome = await d.runCampaign(selected, campaignId, admin.id);
        await finish('ok', { processed: outcome.processed, accepted: outcome.accepted, blocker: outcome.blocker });
        return res.status(200).json(outcome);
      } catch (e) {
        await finish('failed');
        throw e;
      }
    } catch (e) { return sendError(res, op, e); }
  };
}

export default createPushNewsHandler();
