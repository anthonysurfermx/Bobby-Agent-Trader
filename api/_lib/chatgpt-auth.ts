import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { VercelRequest } from '@vercel/node';
import { z } from 'zod';
import { bobbyRest, bobbyServiceHeaders } from './bobby-db.js';

export const CHATGPT_ISSUER = 'https://bobbyprotocol.xyz';
export const CHATGPT_RESOURCE = `${CHATGPT_ISSUER}/api/chatgpt`;
export const CHATGPT_SCOPES = ['bobby.context.read', 'bobby.context.write'] as const;
export type ChatgptScope = typeof CHATGPT_SCOPES[number];
export const ACCESS_TOKEN_SECONDS = 3600;
export const AUTHORIZATION_CODE_SECONDS = 300;
const UUID = z.string().uuid();
const OPAQUE = /^bcg\.[A-Za-z0-9_-]{43}$/;

export class ChatgptAuthError extends Error {
  constructor(public code: string, public status = 400) { super(code); this.name = 'ChatgptAuthError'; }
}

export function chatgptEnabled(env: NodeJS.ProcessEnv = process.env): boolean { return env.BOBBY_CHATGPT === 'on'; }
export function digest(value: string): string { return createHash('sha256').update(value).digest('hex'); }
export function pkceChallenge(value: string): string { return createHash('sha256').update(value).digest('base64url'); }
const opaque = () => `bcg.${randomBytes(32).toString('base64url')}`;

/** Exact callback matches only. No attacker-controlled host suffixes, callback wildcards or fetched URLs. */
export function allowedRedirectUri(value: string, env: NodeJS.ProcessEnv = process.env): boolean {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.hash || url.href !== value) return false;
    const allowed = new Set(['https://chatgpt.com/connector_platform_oauth_redirect',
      ...(env.BOBBY_CHATGPT_REDIRECT_URIS || '').split(',').map(v => v.trim()).filter(Boolean)]);
    return allowed.has(value);
  } catch { return false; }
}

export function parseScopes(raw: unknown): ChatgptScope[] {
  if (typeof raw !== 'string' || raw.length > 200) throw new ChatgptAuthError('invalid_scope');
  const scopes = [...new Set(raw.trim().split(/\s+/).filter(Boolean))];
  if (!scopes.length || scopes.some(s => !(CHATGPT_SCOPES as readonly string[]).includes(s))) throw new ChatgptAuthError('invalid_scope');
  return scopes.sort() as ChatgptScope[];
}

async function db(path: string, init: RequestInit = {}): Promise<unknown> {
  try {
    const response = await fetch(bobbyRest(path), { ...init, headers: bobbyServiceHeaders(init.headers as Record<string, string>), signal: AbortSignal.timeout(5000) });
    if (!response.ok) throw new ChatgptAuthError('temporarily_unavailable', 503);
    const raw = await response.text();
    return raw ? JSON.parse(raw) : null;
  } catch (error) {
    if (error instanceof ChatgptAuthError) throw error;
    throw new ChatgptAuthError('temporarily_unavailable', 503);
  }
}
const rpc = (name: string, body: unknown) => db(`rpc/${name}`, { method: 'POST', body: JSON.stringify(body) });

const Registration = z.object({
  redirect_uris: z.array(z.string().max(2048)).min(1).max(5),
  client_name: z.string().trim().min(1).max(100).default('ChatGPT'),
  token_endpoint_auth_method: z.literal('none').default('none'),
  grant_types: z.array(z.literal('authorization_code')).length(1).default(['authorization_code']),
  response_types: z.array(z.literal('code')).length(1).default(['code']),
  scope: z.string().optional(),
}).strict();

export async function registerClient(input: unknown) {
  const result = Registration.safeParse(input);
  if (!result.success || result.data.redirect_uris.some(uri => !allowedRedirectUri(uri))) throw new ChatgptAuthError('invalid_client_metadata');
  const data = result.data;
  const scopes = data.scope === undefined ? [...CHATGPT_SCOPES] : parseScopes(data.scope);
  const id = randomUUID();
  await db('bobby_chatgpt_clients', { method: 'POST', body: JSON.stringify({ id, name: data.client_name, redirect_uris: [...new Set(data.redirect_uris)], scopes }) });
  return { client_id: id, client_id_issued_at: Math.floor(Date.now() / 1000), client_name: data.client_name, redirect_uris: [...new Set(data.redirect_uris)], token_endpoint_auth_method: 'none', grant_types: ['authorization_code'], response_types: ['code'], scope: scopes.join(' ') };
}

interface Client { id: string; name: string; redirect_uris: string[]; scopes: ChatgptScope[] }
async function getClient(id: string): Promise<Client> {
  if (!UUID.safeParse(id).success) throw new ChatgptAuthError('invalid_client');
  const raw = await db(`bobby_chatgpt_clients?id=eq.${id}&select=id,name,redirect_uris,scopes&limit=1`);
  const client = Array.isArray(raw) ? raw[0] as Client | undefined : undefined;
  if (!client || client.id !== id || !Array.isArray(client.redirect_uris) || !Array.isArray(client.scopes)) throw new ChatgptAuthError('invalid_client');
  return client;
}

export const AuthorizationRequest = z.object({
  response_type: z.literal('code'), client_id: UUID, redirect_uri: z.string().max(2048),
  code_challenge: z.string().regex(/^[A-Za-z0-9_-]{43}$/), code_challenge_method: z.literal('S256'),
  state: z.string().min(16).max(512), scope: z.string().max(200), resource: z.literal(CHATGPT_RESOURCE),
}).strict();
export type AuthorizationParams = z.infer<typeof AuthorizationRequest>;

export async function validateAuthorization(input: unknown) {
  const result = AuthorizationRequest.safeParse(input);
  if (!result.success) throw new ChatgptAuthError('invalid_request');
  const params = result.data;
  if (!allowedRedirectUri(params.redirect_uri)) throw new ChatgptAuthError('invalid_request');
  const client = await getClient(params.client_id);
  if (!client.redirect_uris.includes(params.redirect_uri)) throw new ChatgptAuthError('invalid_request');
  const scopes = parseScopes(params.scope);
  if (scopes.some(s => !client.scopes.includes(s))) throw new ChatgptAuthError('invalid_scope');
  return { params, client, scopes };
}

export async function authorizeAccount(identityId: string, input: unknown): Promise<{ redirectUrl: string }> {
  const parsed = AuthorizationRequest.extend({ approved: z.literal(true) }).safeParse(input);
  if (!parsed.success) throw new ChatgptAuthError('invalid_request');
  const { approved: _approved, ...request } = parsed.data;
  const { params, scopes } = await validateAuthorization(request);
  const code = opaque();
  const expiresAt = new Date(Date.now() + AUTHORIZATION_CODE_SECONDS * 1000).toISOString();
  const issued = await rpc('bobby_chatgpt_authorize', { p_identity: identityId, p_client: params.client_id, p_scopes: scopes,
    p_code_hash: digest(code), p_challenge: params.code_challenge, p_redirect_uri: params.redirect_uri,
    p_resource: CHATGPT_RESOURCE, p_issuer: CHATGPT_ISSUER, p_expires_at: expiresAt });
  if (issued !== true) throw new ChatgptAuthError('access_denied', 403);
  const redirect = new URL(params.redirect_uri);
  redirect.searchParams.set('code', code); redirect.searchParams.set('state', params.state); redirect.searchParams.set('iss', CHATGPT_ISSUER);
  return { redirectUrl: redirect.href };
}

const TokenRequest = z.object({
  grant_type: z.literal('authorization_code'), client_id: UUID, code: z.string().regex(OPAQUE),
  redirect_uri: z.string().max(2048), code_verifier: z.string().regex(/^[A-Za-z0-9._~-]{43,128}$/), resource: z.literal(CHATGPT_RESOURCE),
}).strict();

export async function exchangeCode(input: unknown) {
  const result = TokenRequest.safeParse(input);
  if (!result.success) throw new ChatgptAuthError('invalid_request');
  const data = result.data;
  if (!allowedRedirectUri(data.redirect_uri)) throw new ChatgptAuthError('invalid_grant');
  const token = opaque();
  const raw = await rpc('bobby_chatgpt_exchange_code', { p_code_hash: digest(data.code), p_client: data.client_id, p_redirect_uri: data.redirect_uri,
    p_challenge: pkceChallenge(data.code_verifier), p_resource: CHATGPT_RESOURCE, p_issuer: CHATGPT_ISSUER,
    p_token_hash: digest(token), p_expires_at: new Date(Date.now() + ACCESS_TOKEN_SECONDS * 1000).toISOString() }) as { scopes?: unknown } | null;
  if (!raw || !Array.isArray(raw.scopes) || raw.scopes.some(s => !(CHATGPT_SCOPES as readonly unknown[]).includes(s))) throw new ChatgptAuthError('invalid_grant');
  return { access_token: token, token_type: 'Bearer', expires_in: ACCESS_TOKEN_SECONDS, scope: raw.scopes.join(' ') };
}

export interface ChatgptGrant { identityId: string; clientId: string; scopes: ChatgptScope[] }
export async function resolveChatgptGrant(req: VercelRequest): Promise<ChatgptGrant | null> {
  const header = req.headers.authorization;
  if (typeof header !== 'string' || !header.startsWith('Bearer ')) return null;
  const token = header.slice(7);
  if (!OPAQUE.test(token)) return null;
  const raw = await rpc('bobby_chatgpt_token_identity', { p_token_hash: digest(token), p_resource: CHATGPT_RESOURCE, p_issuer: CHATGPT_ISSUER }) as { identity_id?: unknown; client_id?: unknown; scopes?: unknown } | null;
  if (!raw || !UUID.safeParse(raw.identity_id).success || !UUID.safeParse(raw.client_id).success || !Array.isArray(raw.scopes) || !raw.scopes.length || raw.scopes.some(s => !(CHATGPT_SCOPES as readonly unknown[]).includes(s))) return null;
  return { identityId: raw.identity_id as string, clientId: raw.client_id as string, scopes: raw.scopes as ChatgptScope[] };
}

export async function accountConnection(identityId: string) {
  const raw = await db(`bobby_chatgpt_connections?identity_id=eq.${identityId}&revoked_at=is.null&select=scopes&limit=20`);
  const rows = Array.isArray(raw) ? raw as { scopes?: unknown }[] : [];
  const scopes = CHATGPT_SCOPES.filter(s => rows.some(row => Array.isArray(row.scopes) && row.scopes.includes(s)));
  return { connected: rows.length > 0, scopes, available: chatgptEnabled() };
}

export async function revokeAccountConnection(identityId: string): Promise<void> {
  await rpc('bobby_chatgpt_revoke_account', { p_identity: identityId });
}

const Revocation = z.object({ token: z.string().max(200), client_id: UUID, token_type_hint: z.literal('access_token').optional() }).strict();
export async function revokeToken(input: unknown): Promise<void> {
  const parsed = Revocation.safeParse(input);
  if (!parsed.success) throw new ChatgptAuthError('invalid_request');
  if (OPAQUE.test(parsed.data.token)) await rpc('bobby_chatgpt_revoke_token', { p_token_hash: digest(parsed.data.token), p_client: parsed.data.client_id });
}

export function resourceMetadata() {
  return { resource: CHATGPT_RESOURCE, authorization_servers: [CHATGPT_ISSUER], scopes_supported: [...CHATGPT_SCOPES], bearer_methods_supported: ['header'], resource_name: 'Bobby financial context', resource_documentation: `${CHATGPT_ISSUER}/chatgpt` };
}
export function oauthMetadata() {
  return { issuer: CHATGPT_ISSUER, authorization_endpoint: `${CHATGPT_ISSUER}/chatgpt/connect`, token_endpoint: `${CHATGPT_RESOURCE}?op=token`, registration_endpoint: `${CHATGPT_RESOURCE}?op=register`, revocation_endpoint: `${CHATGPT_RESOURCE}?op=revoke`,
    response_types_supported: ['code'], grant_types_supported: ['authorization_code'], token_endpoint_auth_methods_supported: ['none'], code_challenge_methods_supported: ['S256'], scopes_supported: [...CHATGPT_SCOPES], authorization_response_iss_parameter_supported: true };
}
