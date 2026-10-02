import { APP_LANGUAGES, APP_LOCALES, appLanguage, appLocale } from '../src/lib/app-language.js';
import { BRIEF_LANGUAGES } from './_lib/briefings/types.js';
// ============================================================
// /api/briefings — Bobby Pro market briefings, the public account surface (one function, keyed by `op`).
// Spec: docs/product/pro-market-briefings-implementation.md §4 (decision D3). vercel.json rewrites map the
// contract paths onto this router (integration adds them):
//   /api/briefing-settings → ?op=settings   GET (account) · PATCH (account, If-Match)
//   /api/briefing-device   → ?op=device     POST register/rebind (account, Idempotency-Key) · DELETE revoke
//   /api/briefing          → ?op=report     GET ?id=<uuid> (account + Pro)
//   /api/briefing-voice    → ?op=voice      POST (account + Pro + audio consent, Idempotency-Key)
//   /api/briefing-audio    → ?op=audio      GET ?id=<audioId> (account + Pro + audio consent) → audio/mpeg
//   /api/briefings         (no op)          GET inbox ?limit&cadence&cursor (account + Pro)
// Order of checks: pre-auth IP limit → op/method/query allowlist → Origin on writes → verified Apple/Google
// account → account-keyed limit → op. Every answer is `Cache-Control: private, no-store`. (The pre-auth 429 is
// request-security's own `{error}` body, without a code.)
// Invariants:
//   · The owner is the verified session's identity, never a body/query field. Foreign and missing ids are the
//     same 404. Feature-specific paid ACTIVE Pro and storage are read from the database; unknown payment fails
//     closed (no referral grants/trials/Sandbox). A storage failure is 503, never "free" or "empty".
//   · Opening a report never generates anything. Narration is synthesized only through voice.ensureAudio (one
//     reserved attempt per cache key, single-flight) and only with BOBBY_BRIEFINGS_ENABLED=on; cached audio and
//     retained reports stay readable with the flag off.
//   · Device registration stores only the encrypted token, its keyed fingerprint and the credential's verifier.
//     The credential is returned once (and kept in the sealed idempotency receipt for a replay); never logged.
//   · Logs: '[briefings]' + op + code (http.ts). No tokens, credentials, identities or report text.
// ============================================================
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createHash, randomUUID } from 'node:crypto';
import { waitUntil } from '@vercel/functions';
import { z } from 'zod';
import { requestOriginHost } from './_lib/origins.js';
import { enforcePublicRateLimit } from './_lib/request-security.js';
import type { Identity } from './_lib/user-identity.js';
import * as db from './_lib/briefings/db.js';
import { BriefingStorageError } from './_lib/briefings/db.js';
import { scheduleSummary, schedulePolicy } from './_lib/briefings/calendar.js';
import { audioCacheKey } from './_lib/briefings/compose.js';
import {
  apnsEnvironments, apnsTopic, AUDIO_MIME, BRIEF_VIBE, briefingsEnabled, COMPANION_VOICES, CONSENT_VERSIONS, isSupportedAsset,
  LIMITS, pushMasterKey, RATE, SUPPORTED_ASSETS, TTS_MODEL,
} from './_lib/briefings/config.js';
import {
  credentialVerifier, cursorKey, encryptToken, newInstallationCredential, openReceipt, sealReceipt, signCursor, tokenFingerprint, verifyCursor,
} from './_lib/briefings/push-crypto.js';
import { supabaseAudioStore, type AudioStore } from './_lib/briefings/audio-store.js';
import { ensureAudio } from './_lib/briefings/voice.js';
import {
  accountLimit, errorBody, etag, fail, header, idempotencyKey, iso, NO_STORE, parseIfMatch, parseWith, queryParams, readJsonBody,
  requestDigest, requireAccount, requireAudioConsent, requirePro, sendError, uuidParam, UUID_RE, type BriefOp,
} from './_lib/briefings/http.js';
import type { BriefSettings, Cadence } from './_lib/briefings/types.js';
import { CADENCES } from './_lib/briefings/types.js';

export const config = { maxDuration: 30 };

// ---- injectable dependencies (tests replace them; production uses the defaults) ----
interface RouterDeps {
  now(): Date;
  ensureAudio: typeof ensureAudio;
  audioStore(): AudioStore;
  waitUntil(p: Promise<unknown>): void;
  /** How long a voice request waits for synthesis before answering 202. */
  voiceWaitMs: number;
}
const DEFAULT_DEPS: RouterDeps = {
  now: () => new Date(),
  ensureAudio,
  audioStore: () => supabaseAudioStore(),
  waitUntil: (p) => waitUntil(p),
  voiceWaitMs: 10_000,
};
let deps: RouterDeps = DEFAULT_DEPS;
/** Tests only: replace some dependencies (null restores the defaults). */
export function setBriefingsDepsForTests(over: Partial<RouterDeps> | null): void {
  deps = over ? { ...DEFAULT_DEPS, ...over } : DEFAULT_DEPS;
}

interface Ctx { req: VercelRequest; res: VercelResponse; identity: Identity; query: Record<string, string>; method: string }

const OPS: Record<BriefOp, { methods: readonly string[]; query: readonly string[] }> = {
  inbox: { methods: ['GET'], query: ['limit', 'cursor', 'cadence'] },
  settings: { methods: ['GET', 'PATCH'], query: [] },
  device: { methods: ['POST', 'DELETE'], query: [] },
  report: { methods: ['GET'], query: ['id'] },
  voice: { methods: ['POST'], query: [] },
  audio: { methods: ['GET'], query: ['id'] },
};

/** Account-keyed limits per minute (contract §Proposed rate and payload bounds). Voice fails closed (paid work). */
function limitFor(op: BriefOp, method: string): { scope: string; limit: number; failClosed: boolean } {
  switch (op) {
    case 'settings': return method === 'PATCH' ? { scope: 'brief-settings', limit: RATE.settingsPatch, failClosed: false } : { scope: 'brief-read', limit: RATE.read, failClosed: false };
    case 'device': return { scope: 'brief-device', limit: RATE.device, failClosed: false };
    case 'voice': return { scope: 'brief-voice', limit: RATE.voice, failClosed: true };
    case 'audio': return { scope: 'brief-audio', limit: RATE.audio, failClosed: false };
    default: return { scope: 'brief-read', limit: RATE.read, failClosed: false };
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', NO_STORE);
  let op: BriefOp | 'unknown' = 'unknown';
  try {
    if (!await enforcePublicRateLimit(req, res, 'briefings', RATE.preAuthPerIp, 60)) return;
    const rawOp = (req.query ?? {}).op;
    if (rawOp !== undefined && (typeof rawOp !== 'string' || !Object.prototype.hasOwnProperty.call(OPS, rawOp))) fail(400, 'invalid_request');
    op = (rawOp as BriefOp | undefined) ?? 'inbox';
    const spec = OPS[op];
    const query = queryParams(req, ['op', ...spec.query]);
    const method = (req.method ?? 'GET').toUpperCase();
    if (!spec.methods.includes(method)) fail(405, 'method_not_allowed', {}, { Allow: spec.methods.join(', ') });
    // Writes come only from Bobby's origins (the iOS client sends Origin: https://bobbyprotocol.xyz).
    if (method !== 'GET' && !requestOriginHost(req.headers)) fail(403, 'invalid_request');

    const identity = await requireAccount(req);
    const lim = limitFor(op, method);
    await accountLimit(lim.scope, identity.id, lim.limit, lim.failClosed);

    const ctx: Ctx = { req, res, identity, query, method };
    switch (op) {
      case 'settings': return method === 'PATCH' ? await patchSettings(ctx) : await getSettings(ctx);
      case 'device': return method === 'DELETE' ? await revokeDevice(ctx) : await postDevice(ctx);
      case 'inbox': return await inbox(ctx);
      case 'report': return await report(ctx);
      case 'voice': return await voice(ctx);
      case 'audio': return await audio(ctx);
    }
  } catch (e) {
    return sendError(res, op, e);
  }
}

// ============================================================ settings (account; Pro not required)

const VOICES: ReadonlySet<string> = new Set(Object.values(COMPANION_VOICES));
const hasOwn = (o: object, k: string) => Object.prototype.hasOwnProperty.call(o, k);

/** The public representation: stored settings (no privacy epoch) + eligibility + effective schedules + options. */
function settingsBody(s: BriefSettings, eligiblePro: boolean): Record<string, unknown> {
  return {
    revision: s.revision,
    openingEnabled: s.openingEnabled,
    closeEnabled: s.closeEnabled,
    weeklyEnabled: s.weeklyEnabled,
    language: appLanguage(s.language),
    locale: appLocale(appLanguage(s.language), s.language),
    companionId: s.companionId,
    assets: s.assets,
    analysisConsentEnabled: s.analysisConsentEnabled,
    analysisConsentVersion: s.analysisConsentVersion,
    audioConsentEnabled: s.audioConsentEnabled,
    audioConsentVersion: s.audioConsentVersion,
    eligiblePro,
    schedules: scheduleSummary(deps.now(), schedulePolicy()),
    options: { assets: Object.keys(SUPPORTED_ASSETS), companions: Object.keys(COMPANION_VOICES), consentVersions: CONSENT_VERSIONS },
  };
}

async function getSettings({ res, identity }: Ctx) {
  const [settings, pro] = await Promise.all([db.getSettings(identity.id), db.isPro(identity.id)]);
  res.setHeader('ETag', etag(settings.revision));
  return res.status(200).json(settingsBody(settings, pro));
}

const AssetSymbol = z.string().regex(/^[A-Z0-9.-]{1,12}$/).refine(isSupportedAsset);
const SettingsPatch = z.object({
  openingEnabled: z.boolean().optional(),
  closeEnabled: z.boolean().optional(),
  weeklyEnabled: z.boolean().optional(),
  language: z.enum(APP_LANGUAGES).optional(),
  locale: z.enum(APP_LOCALES).optional(),
  companionId: z.string().max(32).refine((id) => hasOwn(COMPANION_VOICES, id)).optional(),
  assets: z.array(AssetSymbol).max(LIMITS.assetsPerAccount).refine((a) => new Set(a).size === a.length).optional(),
  analysisConsentEnabled: z.boolean().optional(),
  acceptedAnalysisConsentVersion: z.number().int().min(1).max(1000).optional(),
  audioConsentEnabled: z.boolean().optional(),
  acceptedAudioConsentVersion: z.number().int().min(1).max(1000).optional(),
}).strict().refine((p) => Object.keys(p).length > 0);

/**
 * Consent changes: enabling (or re-accepting) requires the CURRENT server version, which is what gets stored —
 * the client never chooses a version. Withdrawing carries no version.
 */
function consentPatch(patch: Record<string, unknown>, enabled: boolean | undefined, accepted: number | undefined, current: number, enabledKey: string, versionKey: string) {
  if (enabled === false) {
    if (accepted !== undefined) fail(400, 'invalid_request');
    patch[enabledKey] = false;
    return;
  }
  if (enabled === true || accepted !== undefined) {
    if (accepted !== current) fail(400, 'consent_required');
    if (enabled === true) patch[enabledKey] = true;
    patch[versionKey] = current;
  }
}

async function patchSettings({ req, res, identity }: Ctx) {
  const expected = parseIfMatch(header(req, 'if-match'));
  if (expected === undefined) fail(428, 'revision_required');
  if (expected === null) fail(400, 'invalid_request');
  const body = parseWith(SettingsPatch, await readJsonBody(req, LIMITS.settingsBodyBytes));
  // Preserve legacy switches for safe opt-out, but only the weekly product can be enabled.
  if (body.openingEnabled === true || body.closeEnabled === true) fail(400, 'invalid_request');

  if (body.locale && !body.language) fail(400, 'invalid_request');
  if (body.locale && appLanguage(body.locale) !== body.language) fail(400, 'invalid_request');
  const patch: Record<string, unknown> = {};
  for (const k of ['openingEnabled', 'closeEnabled', 'weeklyEnabled', 'language', 'companionId', 'assets'] as const) {
    if (body[k] !== undefined) patch[k] = body[k];
  }
  if (body.language === 'pt' && appLocale('pt', body.locale) === 'pt-BR') patch.language = 'pt-BR';
  consentPatch(patch, body.analysisConsentEnabled, body.acceptedAnalysisConsentVersion, CONSENT_VERSIONS.analysis, 'analysisConsentEnabled', 'analysisConsentVersion');
  consentPatch(patch, body.audioConsentEnabled, body.acceptedAudioConsentVersion, CONSENT_VERSIONS.audio, 'audioConsentEnabled', 'audioConsentVersion');

  // Read eligibility BEFORE writing: a storage failure must not leave a saved change behind a 503 (the client
  // would retry with a stale revision). An expired subscription may still save (to turn things off); spending
  // still requires Pro at preparation time, so opt-ins saved now cost nothing.
  const pro = await db.isPro(identity.id);
  const r = await db.patchSettings(identity.id, expected as number, patch);
  if (!r.ok) {
    const revision = Number((r as { revision?: unknown }).revision);
    return fail(409, 'revision_conflict', { revision: Number.isInteger(revision) ? revision : null }, Number.isInteger(revision) ? { ETag: etag(revision) } : {});
  }
  res.setHeader('ETag', etag(r.settings.revision));
  return res.status(200).json(settingsBody(r.settings, pro));
}

// ============================================================ devices (account; Pro not required)

const HEX_TOKEN = new RegExp(`^(?:[0-9a-fA-F]{2}){${LIMITS.apnsTokenMinHex / 2},${LIMITS.apnsTokenMaxHex / 2}}$`);
const DeviceBody = z.object({
  installationId: z.string().regex(UUID_RE),
  apnsToken: z.string().regex(HEX_TOKEN),
  permissionState: z.enum(['notDetermined', 'denied', 'authorized', 'provisional']),
  appBuild: z.number().int().min(0).max(1_000_000),
  apnsEnvironment: z.enum(['production', 'sandbox']),
  registrationId: z.string().regex(UUID_RE).optional(),
  expectedBindingRevision: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER).optional(),
}).strict();
const DeviceDelete = z.object({
  registrationId: z.string().regex(UUID_RE),
  expectedBindingRevision: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
}).strict();

const PROOF = /^[A-Za-z0-9_-]{43}$/;
/** X-Bobby-Installation-Proof: the 32-byte base64url credential returned at registration. */
function installationProof(req: VercelRequest): string {
  const v = header(req, 'x-bobby-installation-proof');
  if (v === undefined || !PROOF.test(v)) fail(400, 'invalid_request');
  return v as string;
}

const IDEM_TTL_SECONDS = 86_400;

async function postDevice({ req, res, identity }: Ctx) {
  const master = pushMasterKey();
  if (!master) fail(503, 'feature_disabled');
  const key = idempotencyKey(req);
  const body = parseWith(DeviceBody, await readJsonBody(req, LIMITS.deviceBodyBytes));
  if (!apnsEnvironments().has(body.apnsEnvironment)) fail(400, 'invalid_request');
  const rebind = body.registrationId !== undefined;
  if (rebind !== (body.expectedBindingRevision !== undefined)) fail(400, 'invalid_request');
  const proof = rebind ? installationProof(req) : null;
  if (!rebind && header(req, 'x-bobby-installation-proof') !== undefined) fail(400, 'invalid_request');

  // The proof is part of the request's identity (only its hash enters the digest).
  const digest = requestDigest(body, proof ? createHash('sha256').update(proof).digest('hex') : '');
  const topic = apnsTopic();
  const write: db.DeviceWrite = {
    tokenCiphertext: encryptToken(body.apnsToken, master as Buffer),
    tokenFingerprint: tokenFingerprint(body.apnsToken, topic, body.apnsEnvironment, master as Buffer),
    environment: body.apnsEnvironment,
    topic,
    permission: body.permissionState,
    appBuild: body.appBuild,
  };
  const credential = newInstallationCredential();
  const installationId = body.installationId.toLowerCase();
  const operation = await db.writeDeviceOnce({
    identityId: identity.id, key, digest, action: rebind ? 'rebind' : 'register', installationId,
    registrationId: rebind ? (body.registrationId as string).toLowerCase() : null,
    expectedRevision: rebind ? body.expectedBindingRevision as number : null,
    proofVerifier: rebind ? credentialVerifier(proof as string) : null,
    newVerifier: credentialVerifier(credential), sealedCredential: sealReceipt(credential, master as Buffer),
    write, maxActive: LIMITS.devicesPerAccount,
  });
  if (operation.state === 'mismatch') return fail(409, 'idempotency_mismatch');
  if (operation.state === 'in_progress') return fail(409, 'conflict', {}, { 'Retry-After': '5' });
  if (!('response' in operation)) return fail(503, 'storage_unavailable');
  let stored: { device: db.DeviceResult; sealedCredential?: string };
  try {
    stored = JSON.parse(operation.response);
    if (!stored?.device || typeof stored.device !== 'object') throw new Error('receipt_shape');
  } catch {
    return fail(503, 'storage_unavailable');
  }
  const r = stored!.device;
  if (r.ok) {
    let replayedCredential: string;
    try { replayedCredential = openReceipt(stored!.sealedCredential as string, master as Buffer); }
    catch { return fail(409, 'conflict'); } // rotated master key: never invent another credential
    return res.status(operation.status).json({ registrationId: r.registrationId,
      bindingRevision: Number(r.bindingRevision), installationCredential: replayedCredential });
  }
  const code = (r as { code: string }).code;
  console.warn('[briefings] device', code);
  if (code === 'device_limit') return res.status(409).json(errorBody('device_limit'));
  if (code === 'not_found') return res.status(404).json(errorBody('not_found'));
  if (code === 'revision_conflict') {
    const br = Number((r as { bindingRevision?: unknown }).bindingRevision);
    return res.status(409).json(errorBody('revision_conflict', Number.isInteger(br) ? { bindingRevision: br } : {}));
  }
  // An active binding of this installation or token exists (owner never revealed): taking it over needs the proof.
  return res.status(409).json(errorBody('conflict'));
}

async function revokeDevice({ req, res, identity }: Ctx) {
  const body = parseWith(DeviceDelete, await readJsonBody(req, LIMITS.deviceBodyBytes));
  const proof = installationProof(req);
  const r = await db.revokeDevice(identity.id, body.registrationId.toLowerCase(), body.expectedBindingRevision, credentialVerifier(proof));
  if (!r.ok) {
    const br = Number((r as { bindingRevision?: unknown }).bindingRevision);
    return fail(409, 'revision_conflict', Number.isInteger(br) ? { bindingRevision: br } : {});
  }
  // Revoked now, or already revoked / missing / not provable by this caller: the same 204.
  return res.status(204).end();
}

// ============================================================ inbox and reports (account + Pro)

/** Binds a cursor to its owner without putting the identity in it. */
const ownerTag = (identityId: string) => createHash('sha256').update(`bobby-brief-cursor:${identityId}`).digest('hex').slice(0, 24);

function cursorSigningKey(): Buffer {
  try {
    return cursorKey();
  } catch {
    return fail(503, 'storage_unavailable');
  }
}

async function inbox({ res, identity, query }: Ctx) {
  let limit: number = LIMITS.inboxMax;
  if (query.limit !== undefined) {
    if (!/^\d{1,2}$/.test(query.limit)) fail(400, 'invalid_request');
    limit = Number(query.limit);
    if (limit < 1 || limit > LIMITS.inboxMax) fail(400, 'invalid_request');
  }
  let cadence: Cadence | null = null;
  if (query.cadence !== undefined) {
    if (!(CADENCES as readonly string[]).includes(query.cadence)) fail(400, 'invalid_request');
    cadence = query.cadence as Cadence;
  }
  const owner = ownerTag(identity.id);
  let before: { scheduledAt: string; id: string } | null = null;
  if (query.cursor !== undefined) {
    const p = verifyCursor(query.cursor, cursorSigningKey());
    if (!p || p.v !== 1 || p.u !== owner || p.c !== (cadence ?? '') || typeof p.s !== 'string' || !Number.isFinite(Date.parse(p.s))
      || typeof p.d !== 'string' || !UUID_RE.test(p.d)) {
      fail(400, 'invalid_request');
    }
    before = { scheduledAt: p!.s as string, id: p!.d as string };
  }

  await requirePro(identity.id);
  const r = await db.inbox(identity.id, cadence, before, limit);
  const items = r.items.map((it) => ({
    id: it.id, cadence: it.cadence, periodStart: iso(it.periodStart), periodEnd: iso(it.periodEnd), scheduledAt: iso(it.scheduledAt),
    dataAsOf: iso(it.dataAsOf), calendarVersion: it.calendarVersion, contentVersion: it.contentVersion, quality: it.quality, audioState: it.audioState,
  }));
  const last = r.items[r.items.length - 1];
  // The raw stored timestamp keeps the keyset exact (no precision lost to re-formatting).
  const nextCursor = r.items.length === limit && last
    ? signCursor({ v: 1, u: owner, c: cadence ?? '', s: last.scheduledAt, d: last.id }, cursorSigningKey())
    : null;
  const latest = r.latest.map((l) => ({ cadence: l.cadence, periodKey: l.periodKey, scheduledAt: iso(l.scheduledAt), state: l.state }));
  return res.status(200).json({ items, nextCursor, latest });
}

type ReportFields = {
  id: string; cadence: Cadence; contentVersion: number; periodStart: string | null; periodEnd: string | null; scheduledAt: string | null;
  dataAsOf: string | null; calendarVersion: string; quality: string; title: string; opening: string; sections: unknown[];
  narrationSegments: string[]; sources: unknown[]; equitySession: unknown; voice: string | null; language: string;
  personalBasis?: 'asked_assets' | 'explicit_interests' | 'general';
};

/** The owned, ready report (404 for missing or foreign, 403 for an owner without Pro). Never regenerates. */
async function loadReport(identityId: string, id: string): Promise<ReportFields> {
  const row = await db.getReport(identityId, id);
  if ('code' in row) return row.code === 'subscription_required' ? fail(403, 'subscription_required') : fail(404, 'not_found');
  const r = row.report;
  const content = (r.content && typeof r.content === 'object' ? r.content : {}) as Record<string, unknown>;
  const contentVersion = Number(r.contentVersion);
  if (!Number.isInteger(contentVersion)) throw new BriefingStorageError('bobby_brief_get', 200);
  return {
    id: String(r.id), cadence: r.cadence as Cadence, contentVersion,
    periodStart: iso(r.periodStart), periodEnd: iso(r.periodEnd), scheduledAt: iso(r.scheduledAt), dataAsOf: iso(r.dataAsOf ?? content.dataAsOf),
    calendarVersion: String(r.calendarVersion ?? ''), quality: String(r.quality ?? ''),
    title: typeof content.title === 'string' ? content.title : '',
    opening: typeof content.opening === 'string' ? content.opening : '',
    ...(['asked_assets', 'explicit_interests', 'general'].includes(String(content.personalBasis))
      ? { personalBasis: content.personalBasis as ReportFields['personalBasis'] } : {}),
    sections: Array.isArray(content.sections) ? content.sections : [],
    narrationSegments: Array.isArray(content.narrationSegments) ? content.narrationSegments.filter((s): s is string => typeof s === 'string') : [],
    sources: Array.isArray(content.sources) ? content.sources : [],
    equitySession: content.equitySession ?? null,
    voice: typeof r.voice === 'string' ? r.voice : null,
    language: typeof r.language === 'string' ? r.language : String(content.language ?? 'en'),
  };
}

async function report({ res, identity, query }: Ctx) {
  const id = uuidParam(query.id);
  await requirePro(identity.id);
  return res.status(200).json(await loadReport(identity.id, id));
}

// ============================================================ voice and audio (account + Pro + audio consent)

const VoiceBody = z.object({
  briefId: z.string().regex(UUID_RE),
  contentVersion: z.number().int().min(1).max(1_000_000),
  segmentIndex: z.number().int().min(0).max(LIMITS.narrationSegments - 1),
  voice: z.string().max(32),
  language: z.enum(BRIEF_LANGUAGES),
}).strict();

/** A queued answer this far out means the budget refused (voice.ts): narration is unavailable, the text is not. */
const VOICE_UNAVAILABLE_RETRY_S = 60;
const POLL_RETRY_S = 2;

const raceTimeout = async <T>(p: Promise<T>, ms: number): Promise<T | 'timeout'> => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([p, new Promise<'timeout'>((resolve) => { timer = setTimeout(() => resolve('timeout'), ms); })]);
  } finally {
    if (timer) clearTimeout(timer);
  }
};

function pending(res: VercelResponse, state: 'queued' | 'processing', audioId: string, retryAfterSeconds: number) {
  const s = Math.max(1, Math.min(30, Math.round(retryAfterSeconds)));
  res.setHeader('Retry-After', String(s));
  return { status: 202, payload: { state, audioId, retryAfterSeconds: s } };
}

async function voice({ req, res, identity }: Ctx) {
  const key = idempotencyKey(req);
  const body = parseWith(VoiceBody, await readJsonBody(req, LIMITS.voiceBodyBytes));
  if (!VOICES.has(body.voice)) fail(400, 'invalid_request');
  await requirePro(identity.id);
  await requireAudioConsent(identity.id);

  // The key binds one request body (a changed body is refused). Repeats and concurrent duplicates re-evaluate the
  // same work item: storage single-flights the cache key, so they join one synthesis and never pay twice.
  const begin = await db.idemBegin(identity.id, 'voice', key, requestDigest(body), IDEM_TTL_SECONDS);
  if (begin.state === 'mismatch') fail(409, 'idempotency_mismatch');
  const answer = async (status: number, payload: Record<string, unknown>) => {
    if (begin.state === 'new') await db.idemFinish(identity.id, 'voice', key, status, JSON.stringify(payload)).catch(() => console.error('[briefings] voice receipt storage'));
    return res.status(status).json(payload);
  };

  const briefId = body.briefId.toLowerCase();
  const r = await loadReport(identity.id, briefId);
  if (body.contentVersion !== r.contentVersion) fail(409, 'content_version_conflict');
  if (body.segmentIndex >= r.narrationSegments.length) fail(400, 'invalid_request');
  // One frozen voice/language variant per report (contract): a later companion change applies to future reports.
  if (body.voice !== r.voice || body.language !== r.language) fail(409, 'content_version_conflict');
  const text = r.narrationSegments[body.segmentIndex];
  const cacheKey = audioCacheKey(text, body.voice, body.language, BRIEF_VIBE, TTS_MODEL());

  const a = await db.requestAudio(identity.id, briefId, body.contentVersion, body.segmentIndex, cacheKey, body.voice, body.language);
  if ('code' in a) {
    if (a.code === 'subscription_required') fail(403, 'subscription_required');
    return a.code === 'content_version_conflict' ? fail(409, 'content_version_conflict') : fail(404, 'not_found');
  }
  if (a.state === 'ready') return answer(200, { state: 'ready', audioId: a.audioId, mediaType: AUDIO_MIME });
  if (a.state === 'failed') fail(503, 'voice_unavailable');
  if (!briefingsEnabled()) fail(503, 'feature_disabled');

  // Synthesis outlives this response if needed (waitUntil); we wait a bounded time for a quick answer.
  const work = deps.ensureAudio({ audioId: a.audioId, cacheKey, text, voice: body.voice, language: body.language, worker: `api-voice:${randomUUID().slice(0, 8)}` })
    .then((v) => ({ ok: true as const, v }), (e: unknown) => ({ ok: false as const, e }));
  deps.waitUntil(work);
  const out = await raceTimeout(work, deps.voiceWaitMs);
  if (out === 'timeout') { const p = pending(res, 'processing', a.audioId, POLL_RETRY_S); return answer(p.status, p.payload); }
  if (!out.ok) {
    const e = (out as { e: unknown }).e;
    if (e instanceof BriefingStorageError) throw e;
    console.error('[briefings] voice', 'synthesis', e instanceof Error ? e.name : 'error');
    return fail(503, 'voice_unavailable');
  }
  const s = (out as { v: Awaited<ReturnType<typeof ensureAudio>> }).v;
  if (s.state === 'ready') return answer(200, { state: 'ready', audioId: a.audioId, mediaType: AUDIO_MIME });
  if (s.state === 'failed') return fail(503, 'voice_unavailable');
  const retry = s.retryAfterSeconds ?? POLL_RETRY_S;
  if (retry >= VOICE_UNAVAILABLE_RETRY_S) return fail(503, 'voice_unavailable', {}, { 'Retry-After': String(Math.min(retry, 300)) });
  const p = pending(res, s.state, a.audioId, retry);
  return answer(p.status, p.payload);
}

async function audio({ res, identity, query }: Ctx) {
  const id = uuidParam(query.id);
  await requirePro(identity.id);
  await requireAudioConsent(identity.id);
  const a = await db.authorizeAudio(identity.id, id);
  if ('code' in a) return a.code === 'subscription_required' ? fail(403, 'subscription_required') : fail(404, 'not_found');
  if (a.state === 'queued' || a.state === 'processing') {
    // Nothing would ever synthesize a queued item with the kill switch off: say so instead of polling forever.
    if (a.state === 'queued' && !briefingsEnabled()) fail(503, 'feature_disabled');
    const p = pending(res, a.state, id, POLL_RETRY_S);
    return res.status(p.status).json(p.payload);
  }
  if (a.state !== 'ready') return fail(503, 'voice_unavailable');
  if (!a.storagePath) return fail(503, 'storage_unavailable');
  const bytes = await deps.audioStore().get(a.storagePath);
  if (!bytes) return fail(503, 'storage_unavailable');
  res.setHeader('Content-Type', AUDIO_MIME);
  res.setHeader('Content-Length', String(bytes.length));
  return res.status(200).end(bytes);
}
