import { createHash } from 'node:crypto';
import { apnsConfig, pushMasterKey } from '../briefings/config.js';
import { closeApns, sendApnsPayload } from '../briefings/apns.js';
import { decryptToken } from '../briefings/push-crypto.js';
import { fail } from '../briefings/http.js';
import { BriefingStorageError } from '../briefings/db.js';
import * as db from './db.js';
import { LANGUAGE_CAMPAIGN_ID, NEWS_COPY, newsPayload, newsPushEnabled, type NewsFilters } from './config.js';

export interface NewsWorkerDeps {
  now: () => Date;
  enabled: typeof newsPushEnabled;
  apnsConfig: typeof apnsConfig;
  pushMasterKey: typeof pushMasterKey;
  prepare: typeof db.prepare;
  claim: typeof db.claim;
  authorize: typeof db.authorize;
  result: typeof db.result;
  status: typeof db.status;
  send: typeof sendApnsPayload;
  close: typeof closeApns;
}
const DEFAULT_DEPS: NewsWorkerDeps = {
  now: () => new Date(), enabled: newsPushEnabled, apnsConfig, pushMasterKey,
  prepare: db.prepare, claim: db.claim, authorize: db.authorize, result: db.result, status: db.status,
  send: sendApnsPayload, close: closeApns,
};

/** The copy, recipient filters and target account are immutable for an idempotent campaign id. */
export function campaignDigest(filters: NewsFilters): string {
  return createHash('sha256').update(JSON.stringify({
    ...filters, languages: [...filters.languages].sort(), countries: [...filters.countries].sort(), copy: NEWS_COPY,
  })).digest('hex');
}

/** Country/language groups can run separately; the database deduplicates the announcement across overlapping groups. */
export function campaignCohortId(campaignId: string, filters: NewsFilters): string {
  return campaignId === LANGUAGE_CAMPAIGN_ID ? `${campaignId}-${campaignDigest(filters).slice(0, 16)}` : campaignId;
}

/** Sends at most once after a possibly accepted APNs request. Crashed/ambiguous reservations are never reclaimed. */
export async function runNewsCampaign(filters: NewsFilters, campaignId: string, actorId: string,
  over: Partial<NewsWorkerDeps> = {}) {
  const d = { ...DEFAULT_DEPS, ...over };
  if (!d.enabled()) fail(503, 'feature_disabled');
  const cfg = d.apnsConfig(), master = d.pushMasterKey();
  if (!cfg || !master || !cfg.environments.has('production')) fail(503, 'feature_disabled');
  const cohortId = campaignCohortId(campaignId, filters);
  const prepared = await d.prepare(cohortId, campaignDigest(filters), filters, actorId);
  if (!prepared.ok) fail(409, 'idempotency_mismatch');
  const deadline = d.now().getTime() + 35_000;
  let processed = 0, accepted = 0, cancelled = 0;
  let blocker: string | null = null;
  try {
    while (!prepared.empty && processed < 100 && d.now().getTime() + 11_000 < deadline) {
      const row = await d.claim(cohortId);
      if (row.state !== 'claimed') break;
      // Last database operation before decrypting/transmitting: current opt-in, version, binding and OS permission.
      const authorized = await d.authorize(row.id, row.fence);
      processed++;
      if (!authorized.ok) { cancelled++; continue; }
      let token: string;
      try { token = decryptToken(authorized.tokenCiphertext, master); }
      catch {
        const recorded = await d.result(row.id, row.fence, 'failed', null, 'token_unavailable');
        if (!recorded.ok) throw new BriefingStorageError('bobby_news_delivery_result', 409);
        continue;
      }
      let outcome;
      try {
        outcome = await d.send(cfg, { token, environment: authorized.environment, topic: authorized.topic,
          apnsId: row.apnsId, collapseId: `news-${createHash('sha256').update(campaignId).digest('hex').slice(0, 40)}`, expiresAt: new Date(row.expiresAt) },
        newsPayload(campaignId, row.language), undefined, d.now());
      } catch {
        // A thrown transport may already have reached Apple. A retry would risk a duplicate banner.
        outcome = { outcome: 'ambiguous' as const, status: null, reason: 'transport_unknown' };
      }
      const recorded = await d.result(row.id, row.fence, outcome.outcome, outcome.status, outcome.reason, outcome.retryAfterSeconds ?? 30);
      if (!recorded.ok) throw new BriefingStorageError('bobby_news_delivery_result', 409);
      if (outcome.outcome === 'accepted') accepted++;
      if (outcome.outcome === 'config') { blocker = 'apns_configuration'; break; }
    }
  } finally { d.close(); }
  return { campaignId, cohortId, processed, accepted, cancelled, blocker, delivery: await d.status(cohortId) };
}
