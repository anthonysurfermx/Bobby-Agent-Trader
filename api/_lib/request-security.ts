import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createHash, timingSafeEqual } from 'node:crypto';
import { checkPersistentLimit } from './rate-limit-persistent.js';
import { createLimiter, getClientIp, type Limiter } from './rate-limit.js';

const localLimiters = new Map<string, Limiter>();

function secretsMatch(provided: string, expected: string): boolean {
  const providedDigest = createHash('sha256').update(provided).digest();
  const expectedDigest = createHash('sha256').update(expected).digest();
  return timingSafeEqual(providedDigest, expectedDigest);
}

function configuredInternalSecrets(): string[] {
  return Array.from(new Set([
    process.env.INTERNAL_API_SECRET,
    process.env.BOBBY_CYCLE_SECRET,
    process.env.CRON_SECRET,
  ].filter((value): value is string => Boolean(value))));
}

function providedInternalSecret(req: VercelRequest): string {
  const headerSecret = req.headers['x-internal-secret'];
  if (typeof headerSecret === 'string') return headerSecret;

  const authorization = req.headers.authorization;
  if (typeof authorization === 'string' && authorization.startsWith('Bearer ')) {
    return authorization.slice('Bearer '.length);
  }
  return '';
}

/** Non-mutating check for optional privileged features on otherwise public routes. */
export function isInternalRequest(req: VercelRequest): boolean {
  const provided = providedInternalSecret(req);
  return Boolean(provided && configuredInternalSecrets().some((expected) => secretsMatch(provided, expected)));
}

/** Fail-closed guard for endpoints that access server wallets or privileged data. */
export function requireInternalAuth(req: VercelRequest, res: VercelResponse): boolean {
  if (configuredInternalSecrets().length === 0) {
    res.status(503).json({ error: 'Internal authentication not configured' });
    return false;
  }

  if (!isInternalRequest(req)) {
    res.status(401).json({ error: 'Unauthorized' });
    return false;
  }
  return true;
}

/** Header object for server-to-server calls to privileged endpoints. */
export function internalAuthHeaders(): Record<string, string> {
  const secret = configuredInternalSecrets()[0] || '';
  return secret ? { 'x-internal-secret': secret } : {};
}

type CapabilitySecretEnv = 'TRADING_API_SECRET' | 'PROTOCOL_AUTOMATION_SECRET';

function isCapabilityRequest(req: VercelRequest, envName: CapabilitySecretEnv): boolean {
  const provided = providedInternalSecret(req);
  const expected = process.env[envName] || '';
  return Boolean(provided && expected && secretsMatch(provided, expected));
}

function requireCapabilityAuth(
  req: VercelRequest,
  res: VercelResponse,
  envName: CapabilitySecretEnv,
): boolean {
  if (!process.env[envName]) {
    res.status(503).json({ error: `${envName} not configured` });
    return false;
  }
  if (!isCapabilityRequest(req, envName)) {
    res.status(401).json({ error: 'Unauthorized' });
    return false;
  }
  return true;
}

function capabilityAuthHeaders(envName: CapabilitySecretEnv): Record<string, string> {
  const secret = process.env[envName] || '';
  return secret ? { 'x-internal-secret': secret } : {};
}

export const isTradingRequest = (req: VercelRequest) => isCapabilityRequest(req, 'TRADING_API_SECRET');
export const requireTradingAuth = (req: VercelRequest, res: VercelResponse) =>
  requireCapabilityAuth(req, res, 'TRADING_API_SECRET');
export const tradingAuthHeaders = () => capabilityAuthHeaders('TRADING_API_SECRET');

export const requireProtocolAutomationAuth = (req: VercelRequest, res: VercelResponse) =>
  requireCapabilityAuth(req, res, 'PROTOCOL_AUTOMATION_SECRET');
export const protocolAutomationAuthHeaders = () => capabilityAuthHeaders('PROTOCOL_AUTOMATION_SECRET');

/**
 * Layered public rate limit: a fast per-instance limit plus the existing
 * Supabase-backed cross-instance counter. The local limiter still protects a
 * warm function when the persistent store is unavailable.
 */
export async function enforcePublicRateLimit(
  req: VercelRequest,
  res: VercelResponse,
  scope: string,
  limit: number,
  windowSec: number,
): Promise<boolean> {
  let limiter = localLimiters.get(scope);
  if (!limiter) {
    limiter = createLimiter(limit, windowSec * 1000);
    localLimiters.set(scope, limiter);
  }

  const ip = getClientIp(req);
  const local = limiter.check(ip);
  const persistent = await checkPersistentLimit(scope, ip, limit, windowSec);
  const limited = local.limited || persistent.limited;
  const remaining = Math.min(local.remaining, persistent.remaining);
  const resetAt = Math.max(local.resetAt, persistent.resetAt);

  res.setHeader('X-RateLimit-Limit', String(limit));
  res.setHeader('X-RateLimit-Remaining', String(Math.max(0, remaining)));
  res.setHeader('X-RateLimit-Reset', String(Math.ceil(resetAt / 1000)));

  if (limited) {
    res.setHeader('Retry-After', String(Math.max(1, Math.ceil((resetAt - Date.now()) / 1000))));
    res.status(429).json({ error: 'Rate limit exceeded' });
    return false;
  }
  return true;
}
