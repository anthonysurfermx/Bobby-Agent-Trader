import { useEffect, useState } from 'react';
import { bobbySupabase } from '@/lib/bobby-db-client';
import { ContextImportSchema, type FinancialItem, type FinancialContextState, type BobbyRecommendation } from '../../shared/financial-context';
export type { FinancialContextState } from '../../shared/financial-context';

export interface SavedFinancialItem extends FinancialItem {
  id: string; source: 'chatgpt'; verification: 'user_reported'; createdAt: string; updatedAt: string;
}
export interface FinancialDraft { id: string; items: FinancialItem[]; expiresAt: string }
export type SavedRecommendation = BobbyRecommendation;
export class FinancialContextError extends Error {
  constructor(public code: string) { super(code); }
}
export interface FinancialAccount { id: string | null; revision: number; ready: boolean }

/** The user ID, rather than email, owns every draft and response. Re-sign-in resets in-memory edits. */
export function useFinancialAccount(): FinancialAccount {
  const [account, setAccount] = useState<FinancialAccount>({ id: null, revision: 0, ready: false });
  useEffect(() => {
    let active = true, events = 0;
    const client = bobbySupabase();
    const { data: subscription } = client.auth.onAuthStateChange((event, session) => {
      events += 1;
      const id = session?.user.id ?? null;
      if (active) setAccount(previous => ({ id, ready: true,
        revision: previous.revision + (previous.id !== id || event === 'SIGNED_OUT' ? 1 : 0) }));
    });
    const observed = events;
    void client.auth.getSession().then(({ data }) => {
      if (active && events === observed) setAccount(previous => ({ id: data.session?.user.id ?? null,
        revision: previous.revision + (previous.id !== (data.session?.user.id ?? null) ? 1 : 0), ready: true }));
    }).catch(() => { if (active && events === observed) setAccount({ id: null, revision: 0, ready: true }); });
    return () => { active = false; subscription.subscription.unsubscribe(); };
  }, []);
  return account;
}

async function accountHeaders(expectedId: string): Promise<Record<string, string>> {
  const { data } = await bobbySupabase().auth.getSession();
  if (!data.session || data.session.user.id !== expectedId) throw new FinancialContextError('signin_required');
  return { Authorization: `Bearer ${data.session.access_token}`, 'x-bobby-platform': 'web' };
}

async function request<T>(path: string, method: string, accountId: string | null, body?: unknown, signal?: AbortSignal): Promise<T> {
  try {
    const headers = accountId ? await accountHeaders(accountId) : {};
    if (signal?.aborted) throw new FinancialContextError('cancelled');
    const response = await fetch(path, { method, cache: 'no-store', signal,
      headers: { ...headers, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}) });
    const data = await response.json().catch(() => null);
    if (accountId) await accountHeaders(accountId);
    if (signal?.aborted) throw new FinancialContextError('cancelled');
    if (!response.ok) throw new FinancialContextError(response.status === 401 ? 'signin_required' : response.status === 429 ? 'rate_limited' :
      typeof data?.code === 'string' ? data.code : typeof data?.error === 'string' ? data.error : 'context_unavailable');
    return data as T;
  } catch (error) {
    if (error instanceof FinancialContextError) throw error;
    throw new FinancialContextError(signal?.aborted ? 'cancelled' : 'context_unavailable');
  }
}

export const fetchFinancialContext = (accountId: string, signal?: AbortSignal) =>
  request<FinancialContextState>('/api/financial-context', 'GET', accountId, undefined, signal);
export const importFinancialContext = (accountId: string, items: FinancialItem[], requestId: string, draftId?: string, signal?: AbortSignal) =>
  request<FinancialContextState>('/api/financial-context', 'POST', accountId,
    { action: 'import', items, consent: true, requestId, ...(draftId ? { draftId } : {}) }, signal);
export const updateFinancialItem = (accountId: string, id: string, item: FinancialItem, signal?: AbortSignal) =>
  request<FinancialContextState>('/api/financial-context', 'PATCH', accountId, { id, item, consent: true }, signal);
export const setFinancialContextEnabled = (accountId: string, enabled: boolean, signal?: AbortSignal) =>
  request<FinancialContextState>('/api/financial-context', 'PATCH', accountId, { enabled }, signal);
export const deleteFinancialContext = (accountId: string, target: { id: string } | { draftId: string } | { scope: 'all' }, signal?: AbortSignal) =>
  request<FinancialContextState>(`/api/financial-context?${new URLSearchParams(target)}`, 'DELETE', accountId, undefined, signal);

/** Parsing happens on the device; only individually reviewed structured facts go to the API. */
export function parseFinancialImport(text: string): FinancialItem[] {
  if (new TextEncoder().encode(text).length > 16_384) throw new FinancialContextError('invalid_import');
  const trimmed = text.trim().replace(/^```(?:json)?\s*\n?([\s\S]*?)\n?```$/i, '$1');
  try { return ContextImportSchema.parse(JSON.parse(trimmed)).items; }
  catch { throw new FinancialContextError('invalid_import'); }
}

export interface ChatGPTConnection { connected: boolean; scopes: string[]; available: boolean }
export interface ChatGPTAuthorizationRequest extends ChatGPTConnection {
  client: { id: string; name: string }; requestedScopes: string[]; resource: string;
}
export const fetchChatGPTConnection = (accountId: string, signal?: AbortSignal) =>
  request<ChatGPTConnection>('/api/chatgpt?op=connection', 'GET', accountId, undefined, signal);
export const revokeChatGPTConnection = (accountId: string, signal?: AbortSignal) =>
  request<ChatGPTConnection>('/api/chatgpt?op=revoke', 'POST', accountId, {}, signal);
function oauthParameters(query: URLSearchParams): Record<string, string> {
  if (OAUTH_QUERY_KEYS.some(key => query.getAll(key).length > 1)) throw new FinancialContextError('invalid_authorization');
  return Object.fromEntries([...query].filter(([key]) => OAUTH_QUERY_KEYS.includes(key)));
}
export async function validateChatGPTAuthorization(query: URLSearchParams, signal?: AbortSignal) {
  return request<ChatGPTAuthorizationRequest>(`/api/chatgpt?${new URLSearchParams({ ...oauthParameters(query), op: 'connection' })}`,
    'GET', null, undefined, signal);
}
export async function authorizeChatGPT(accountId: string, query: URLSearchParams, signal?: AbortSignal): Promise<string> {
  return decideChatGPTAuthorization(accountId, query, true, signal);
}
export async function denyChatGPTAuthorization(accountId: string | null, query: URLSearchParams, signal?: AbortSignal): Promise<string> {
  return decideChatGPTAuthorization(accountId, query, false, signal);
}
async function decideChatGPTAuthorization(accountId: string | null, query: URLSearchParams, approved: boolean, signal?: AbortSignal): Promise<string> {
  const body = oauthParameters(query);
  const response = await request<{ redirectUrl: string }>('/api/chatgpt?op=authorize', 'POST', accountId,
    { ...body, approved }, signal);
  try {
    const expected = new URL(query.get('redirect_uri') ?? ''), redirect = new URL(response.redirectUrl);
    const keys = [...redirect.searchParams.keys()];
    const allowedKeys = approved ? ['code', 'state', 'iss'] : ['error', 'state', 'iss'];
    if (redirect.protocol !== 'https:' || redirect.username || redirect.password || redirect.hash ||
      redirect.origin !== expected.origin || redirect.pathname !== expected.pathname ||
      redirect.searchParams.get('state') !== query.get('state') ||
      (approved ? !redirect.searchParams.get('code') : redirect.searchParams.get('error') !== 'access_denied') ||
      redirect.searchParams.get('iss') !== 'https://bobbyprotocol.xyz' ||
      new Set(keys).size !== keys.length || keys.some(key => !allowedKeys.includes(key))) throw new Error('redirect');
    return redirect.href;
  } catch { throw new FinancialContextError('invalid_authorization'); }
}
export const OAUTH_QUERY_KEYS = ['client_id', 'redirect_uri', 'response_type', 'code_challenge', 'code_challenge_method', 'state', 'scope', 'resource'];

export function exportRecommendations(recommendations: SavedRecommendation[]): string {
  return JSON.stringify({ format: 'bobby-recommendations-v1', exportedAt: new Date().toISOString(),
    note: 'Saved Bobby analysis at the stated dates. Not a current market quote or verified financial transaction.',
    recommendations }, null, 2);
}
