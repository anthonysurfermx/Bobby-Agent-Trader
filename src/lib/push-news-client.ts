export const NEWS_MIN_BUILD = 66;
export const NEWS_CAMPAIGN = 'bobby-languages-2026-10';
export type NewsLanguage = 'en' | 'es' | 'de' | 'fr' | 'it' | 'pt' | 'pt-BR';
export interface NewsFilters { languages: NewsLanguage[]; countries: string[] }
export interface NewsPreview {
  campaignId: string;
  copy: Record<string, { title: string; body: string }>;
  eligible: number;
  byLanguage: Record<string, number>;
  byCountry: Record<string, number>;
  registeredDevices: number;
  optInAccounts: number;
  delivery: Record<string, number>;
  config: { enabled: boolean; apnsConfigured: boolean; tokenKeyConfigured: boolean };
}
export interface NewsSendResult { campaignId: string; processed: number; accepted: number; cancelled: number; blocker: string | null; delivery: Record<string, number> }

const ERRORS: Record<string, string> = {
  feature_disabled: 'Falta activar y configurar Apple Push antes de enviar.',
  idempotency_mismatch: 'Esta campaña ya tiene otro público guardado. Conserva sus filtros originales.',
  news_push_unconfigured: 'Falta configurar Apple Push antes de enviar.',
  push_news_unconfigured: 'Falta configurar Apple Push antes de enviar.',
  news_push_disabled: 'El envío de novedades todavía está desactivado.',
  not_admin: 'Esta cuenta no tiene acceso a las notificaciones.',
  no_eligible_devices: 'La cuenta no tiene un iPhone compatible registrado con permiso para novedades.',
  campaign_conflict: 'Esta campaña ya tiene otro público guardado. Conserva sus filtros originales.',
};

async function request(op: string, method: 'GET' | 'POST', params?: URLSearchParams, body?: unknown, signal?: AbortSignal): Promise<unknown> {
  const { accessHeaders } = await import('@/lib/access-client');
  const headers: Record<string, string> = { ...await accessHeaders() };
  if (body) headers['Content-Type'] = 'application/json';
  const query = params ?? new URLSearchParams();
  query.set('op', op);
  let response: Response;
  try {
    response = await fetch(`/api/push-news?${query}`, { method, headers, cache: 'no-store',
      ...(body ? { body: JSON.stringify(body) } : {}), ...(signal ? { signal } : {}) });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new Error(method === 'POST'
      ? 'No se pudo confirmar el resultado. Actualiza el estado antes de volver a enviar; se conserva el identificador para evitar duplicados.'
      : 'No se pudo consultar el estado de las notificaciones.');
  }
  const data = await response.json().catch(() => null) as Record<string, unknown> | null;
  if (!response.ok) {
    const code = typeof data?.error === 'string' ? data.error : '';
    throw new Error(ERRORS[code] ?? (response.status === 401 ? 'Inicia sesión de nuevo.' : response.status === 503
      ? 'El servicio de notificaciones todavía no está disponible para enviar.' : 'No se pudo completar la operación de notificaciones.'));
  }
  if (!data) throw new Error('El servidor no devolvió el estado de las notificaciones.');
  return data;
}

function counts(value: unknown): Record<string, number> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('El estado recibido está incompleto.');
  const result: Record<string, number> = {};
  for (const [key, count] of Object.entries(value)) {
    if (typeof count !== 'number' || !Number.isFinite(count) || count < 0) throw new Error('El estado recibido está incompleto.');
    result[key] = count;
  }
  return result;
}

export function normalizeNewsPreview(raw: unknown): NewsPreview {
  const value = raw as Partial<NewsPreview> | null;
  if (!value || typeof value.campaignId !== 'string' || !value.copy || !value.config
    || [value.eligible, value.registeredDevices, value.optInAccounts].some((n) => typeof n !== 'number' || !Number.isFinite(n) || n < 0)
    || [value.config.enabled, value.config.apnsConfigured, value.config.tokenKeyConfigured].some((b) => typeof b !== 'boolean')) {
    throw new Error('El estado recibido está incompleto.');
  }
  for (const copy of Object.values(value.copy)) {
    if (!copy || typeof copy.title !== 'string' || typeof copy.body !== 'string') throw new Error('Los mensajes recibidos están incompletos.');
  }
  return { ...value, byLanguage: counts(value.byLanguage), byCountry: counts(value.byCountry), delivery: counts(value.delivery) } as NewsPreview;
}

export async function fetchNewsPreview(filters: NewsFilters, signal?: AbortSignal): Promise<NewsPreview> {
  const params = new URLSearchParams({ minAppBuild: String(NEWS_MIN_BUILD), languages: filters.languages.join(',') });
  if (filters.countries.length) params.set('countries', filters.countries.join(','));
  return normalizeNewsPreview(await request('preview', 'GET', params, undefined, signal));
}

export async function sendNewsCampaign(filters: NewsFilters): Promise<NewsSendResult> {
  return await request('campaign', 'POST', undefined, { campaignId: NEWS_CAMPAIGN, minAppBuild: NEWS_MIN_BUILD, ...filters }) as NewsSendResult;
}

export async function sendNewsTest(identityId: string, testId: string): Promise<NewsSendResult> {
  return await request('test', 'POST', undefined, { identityId, testId, minAppBuild: NEWS_MIN_BUILD }) as NewsSendResult;
}
