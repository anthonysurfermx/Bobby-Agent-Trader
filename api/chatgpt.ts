import type { VercelRequest, VercelResponse } from '@vercel/node';
import { allowedOriginHosts } from './_lib/origins.js';
import { enforcePublicRateLimit } from './_lib/request-security.js';
import { resolveIdentity } from './_lib/user-identity.js';
import { carriesAccountToken, hasMemory } from './_lib/user-memory.js';
import { accountConnection, authorizeAccount, chatgptEnabled, CHATGPT_ISSUER, CHATGPT_RESOURCE, CHATGPT_SCOPES, ChatgptAuthError,
  exchangeCode, oauthMetadata, registerClient, resolveChatgptGrant, resourceMetadata, revokeAccountConnection, revokeToken, validateAuthorization } from './_lib/chatgpt-auth.js';
import { handleChatgptMcp } from './_lib/chatgpt-mcp.js';

export const config = { maxDuration: 20 };
const OPERATIONS = new Set(['mcp', 'metadata', 'oauth-metadata', 'register', 'authorize', 'token', 'revoke', 'connection']);

/** Consent and account revocation require an explicit first-party Origin, never an inferred Referer. */
export function isChatgptFirstPartyOrigin(req: VercelRequest): boolean {
  const raw = req.headers.origin;
  if (typeof raw !== 'string') return false;
  try {
    const url = new URL(raw);
    if (url.origin !== raw || url.username || url.password || url.pathname !== '/' || !allowedOriginHosts().has(url.hostname)) return false;
    if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') return process.env.VERCEL_ENV !== 'production' && ['http:', 'https:'].includes(url.protocol);
    return url.protocol === 'https:' && !url.port;
  } catch { return false; }
}

function bodyOf(req: VercelRequest): unknown {
  const raw = req.body;
  if (typeof raw !== 'string') {
    if (Buffer.byteLength(JSON.stringify(raw ?? {}), 'utf8') > 16384) throw new ChatgptAuthError('invalid_request', 413);
    return raw;
  }
  if (Buffer.byteLength(raw, 'utf8') > 16384) throw new ChatgptAuthError('invalid_request', 413);
  const contentType = req.headers['content-type'];
  if (typeof contentType === 'string' && contentType.startsWith('application/x-www-form-urlencoded')) {
    const fields = new URLSearchParams(raw);
    const keys = [...fields.keys()];
    if (new Set(keys).size !== keys.length) throw new ChatgptAuthError('invalid_request');
    return Object.fromEntries(fields);
  }
  try { return JSON.parse(raw); } catch { throw new ChatgptAuthError('invalid_request'); }
}

function authorizationQuery(req: VercelRequest) {
  const fields: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(req.query ?? {})) {
    if (key === 'op') continue;
    if (Array.isArray(value)) throw new ChatgptAuthError('invalid_request');
    fields[key] = value;
  }
  return fields;
}

async function requireAccount(req: VercelRequest): Promise<string> {
  if (!carriesAccountToken(req)) throw new ChatgptAuthError('signin_required', 401);
  const identity = await resolveIdentity(req);
  if (!hasMemory(identity)) throw new ChatgptAuthError('signin_required', 401);
  return identity.id;
}

function mcpAuthentication(res: VercelResponse, code: string, status: number) {
  res.setHeader('WWW-Authenticate', `Bearer resource_metadata="${CHATGPT_ISSUER}/.well-known/oauth-protected-resource/api/chatgpt", error="${code}"${status === 403 ? `, scope="${CHATGPT_SCOPES.join(' ')}"` : ''}`);
  return res.status(status).json({ error: code });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  const rawOp = req.query?.op;
  // Reject unknown operations before allocating a limiter or writing any persistent counters.
  if (rawOp !== undefined && (typeof rawOp !== 'string' || !OPERATIONS.has(rawOp))) return res.status(400).json({ error: 'invalid_request' });
  const op = typeof rawOp === 'string' ? rawOp : 'mcp';
  const method = req.method || 'GET';
  const origin = req.headers.origin;
  const clientOrigin = origin === 'https://chatgpt.com' || isChatgptFirstPartyOrigin(req);
  if (typeof origin === 'string' && clientOrigin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Expose-Headers', 'WWW-Authenticate');
  }
  if (method === 'OPTIONS') {
    if (!clientOrigin) return res.status(403).json({ error: 'origin_not_allowed' });
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, MCP-Protocol-Version');
    return res.status(204).end();
  }
  if (typeof origin === 'string' && !clientOrigin) return res.status(403).json({ error: 'origin_not_allowed' });
  if (method === 'GET' && op === 'metadata') return res.status(200).json(resourceMetadata());
  if (method === 'GET' && op === 'oauth-metadata') return res.status(200).json(oauthMetadata());

  try {
    // Shared ChatGPT egress gets a coarse authentication ceiling; each verified account keeps its own 60/min bucket.
    if (!await enforcePublicRateLimit(req, res, op === 'mcp' ? 'chatgpt-mcp-authentication' : `chatgpt-${op}`, op === 'mcp' ? 600 : op === 'register' ? 10 : 60, 60)) return;
    if (op === 'connection') {
      if (method === 'GET') {
        if (typeof req.query?.client_id === 'string') {
          const { client, scopes } = await validateAuthorization(authorizationQuery(req));
          return res.status(200).json({ connected: false, scopes: [], available: chatgptEnabled(), client: { id: client.id, name: client.name }, requestedScopes: scopes, resource: CHATGPT_RESOURCE });
        }
        return res.status(200).json(await accountConnection(await requireAccount(req)));
      }
      if (method === 'DELETE') {
        if (!isChatgptFirstPartyOrigin(req)) throw new ChatgptAuthError('origin_not_allowed', 403);
        await revokeAccountConnection(await requireAccount(req));
        return res.status(200).json({ connected: false, scopes: [], available: chatgptEnabled() });
      }
      throw new ChatgptAuthError('method_not_allowed', 405);
    }
    if (op === 'revoke') {
      if (method !== 'POST') throw new ChatgptAuthError('method_not_allowed', 405);
      const body = bodyOf(req);
      const tokenRequest = typeof body === 'object' && body !== null && Object.hasOwn(body, 'token');
      if (!tokenRequest && carriesAccountToken(req) && isChatgptFirstPartyOrigin(req)) {
        await revokeAccountConnection(await requireAccount(req));
        return res.status(200).json({ connected: false, scopes: [], available: chatgptEnabled() });
      }
      await revokeToken(body);
      return res.status(200).json({});
    }
    if (op === 'authorize' && method === 'POST') {
      if (!isChatgptFirstPartyOrigin(req)) throw new ChatgptAuthError('origin_not_allowed', 403);
      const body = bodyOf(req);
      const denied = typeof body === 'object' && body !== null && (body as { approved?: unknown }).approved === false;
      if (!denied && !chatgptEnabled()) throw new ChatgptAuthError('temporarily_unavailable', 503);
      return res.status(200).json(await authorizeAccount(denied ? null : await requireAccount(req), body));
    }
    if (!chatgptEnabled()) throw new ChatgptAuthError('temporarily_unavailable', 503);
    if (op === 'authorize') {
      if (method === 'GET') {
        const { params } = await validateAuthorization(authorizationQuery(req));
        const url = new URL('/chatgpt/connect', CHATGPT_ISSUER);
        Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
        return res.redirect(302, url.href);
      }
      throw new ChatgptAuthError('method_not_allowed', 405);
    }
    if (op === 'register' || op === 'token') {
      if (method !== 'POST') throw new ChatgptAuthError('method_not_allowed', 405);
      const body = bodyOf(req);
      if (op === 'register') return res.status(201).json(await registerClient(body));
      return res.status(200).json(await exchangeCode(body));
    }
    if (op !== 'mcp') throw new ChatgptAuthError('invalid_request');
    if (method === 'DELETE') return res.status(405).json({ error: 'Stateless MCP has no sessions to delete.' });
    if (method === 'GET') {
      const grant = await resolveChatgptGrant(req);
      if (!grant) return mcpAuthentication(res, 'invalid_token', 401);
      if (!await enforcePublicRateLimit(req, res, 'chatgpt-mcp-account', 60, 60, { trustedIdentityId: grant.identityId })) return;
      res.setHeader('Allow', 'POST');
      return res.status(405).json({ error: 'Use POST for stateless MCP JSON requests.' });
    }
    if (method !== 'POST') throw new ChatgptAuthError('method_not_allowed', 405);
    const protocol = req.headers['mcp-protocol-version'];
    if (protocol !== undefined && (typeof protocol !== 'string' || !['2025-06-18', '2025-03-26', '2024-11-05'].includes(protocol))) throw new ChatgptAuthError('unsupported_protocol_version');
    const grant = await resolveChatgptGrant(req);
    if (!grant) return mcpAuthentication(res, 'invalid_token', 401);
    if (!await enforcePublicRateLimit(req, res, 'chatgpt-mcp-account', 60, 60, { trustedIdentityId: grant.identityId })) return;
    const reply = await handleChatgptMcp(bodyOf(req), grant);
    return reply.body === undefined ? res.status(reply.status).end() : res.status(reply.status).json(reply.body);
  } catch (error) {
    if (error instanceof ChatgptAuthError) {
      if (error.code === 'insufficient_scope') return mcpAuthentication(res, error.code, error.status);
      if (error.status === 503) res.setHeader('Retry-After', '5');
      return res.status(error.status).json({ error: error.code, ...(op === 'authorize' ? { iss: CHATGPT_ISSUER } : {}) });
    }
    // Never log tokens, financial facts, identities, redirects, request bodies or provider errors.
    return res.status(503).json({ error: 'temporarily_unavailable' });
  }
}
