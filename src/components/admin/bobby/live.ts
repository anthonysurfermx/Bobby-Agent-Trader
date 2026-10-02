import type { AdminIntegrationsResponse, AdminMeta, AdminSourceMeta, AudienceResponse, OverviewResponse } from '@/lib/admin-client';
import { buildInsights } from '../../../../shared/admin-insights';

export const CORE_REFRESH_MS = 30_000;
export const PROVIDER_REFRESH_MS = 300_000;
export const CORE_STALE_MS = 90_000;

/** Publish only the newest response for the current key, and never after disposal. */
export class LoadGeneration {
  private generation = 0;
  private alive = true;
  next() { return ++this.generation; }
  accepts(id: number) { return this.alive && id === this.generation; }
  invalidate() { this.generation++; }
  dispose() { this.alive = false; this.invalidate(); }
}

export function sourceState(source: AdminSourceMeta | undefined, maxAgeMs: number, now = Date.now()) {
  if (!source) return 'unknown';
  if (source.status !== 'ok') return source.status;
  const fetched = source.fetchedAt ? Date.parse(source.fetchedAt) : NaN;
  if (!Number.isFinite(fetched)) return 'unknown';
  return now - fetched > maxAgeMs ? 'stale' : 'fresh';
}

/** A provider failure keeps the previous observed values and their original timestamp. */
export function mergeProviderSnapshots(previous: AdminIntegrationsResponse | null, next: AdminIntegrationsResponse): AdminIntegrationsResponse {
  if (!previous) return next;
  const integrations = { ...next.integrations };
  const sources = { ...next.meta?.sources };
  let searchConsole = next.searchConsole;
  for (const key of ['appStore', 'revenuecat', 'searchConsole', 'health'] as const) {
    if (next.meta?.sources[key]?.status !== 'error') continue;
    if (key === 'searchConsole') searchConsole = previous.searchConsole;
    else if (key === 'health') integrations.health = previous.integrations.health;
    else integrations[key] = previous.integrations[key] as never;
    sources[key] = { ...sources[key], fetchedAt: previous.meta?.sources[key]?.fetchedAt ?? null };
  }
  return { integrations, searchConsole, meta: next.meta ? { ...next.meta, sources } : null };
}

export function composeOverview(core: OverviewResponse, providers: AdminIntegrationsResponse | null): OverviewResponse {
  const now = Date.now();
  const coreKnown = sourceState(core.meta?.sources.overview, CORE_STALE_MS, now) === 'fresh';
  const growthKnown = sourceState(core.meta?.sources.growth, CORE_STALE_MS, now) === 'fresh';
  const validProvider = (key: string) => {
    const source = providers?.meta?.sources[key];
    return !!source && ['ok', 'partial', 'not_configured'].includes(source.status) && !!source.fetchedAt && now - Date.parse(source.fetchedAt) <= PROVIDER_REFRESH_MS * 2;
  };
  const integrations = providers ? { ...providers.integrations,
    appStore: validProvider('appStore') ? providers.integrations.appStore : undefined,
    revenuecat: validProvider('revenuecat') ? providers.integrations.revenuecat : undefined,
    health: validProvider('health') ? providers.integrations.health : undefined,
    paywall: validProvider('health') ? providers.integrations.paywall : undefined,
  } : null;
  const overview = structuredClone(core.overview) as unknown as Record<string, unknown>;
  // Normalized placeholders cannot support a finding: omit unknown fields before the shared rules.
  for (const path of core.overview.missing) {
    const parts = path.split('.'), last = parts.pop()!;
    let parent = overview;
    for (const part of parts) parent = parent?.[part] as Record<string, unknown>;
    if (parent && typeof parent === 'object') delete parent[last];
  }
  const insights = coreKnown ? buildInsights({ days: core.overview.days.length, overview,
    growth: growthKnown ? core.growth : null, integrations,
    searchConsole: validProvider('searchConsole') ? providers?.searchConsole : null,
    networks: sourceState(core.meta?.sources.networks, CORE_STALE_MS, now) === 'fresh' ? core.networks : null,
    includeInternal: core.overview.includeInternal, now }) : [];
  const displayIntegrations = providers ? { ...providers.integrations,
    appStore: { ...providers.integrations.appStore, ...(providers.meta?.sources.appStore?.status === 'error' ? { error: providers.meta.sources.appStore.error ?? 'Falló la actualización; se conserva el reporte anterior.' } : {}) },
    revenuecat: { ...providers.integrations.revenuecat, ...(providers.meta?.sources.revenuecat?.status === 'error' ? { error: providers.meta.sources.revenuecat.error ?? 'Falló la actualización; se conserva el reporte anterior.' } : {}) },
  } : null;
  const displaySearch = providers?.searchConsole ? { ...providers.searchConsole, ...(providers.meta?.sources.searchConsole?.status === 'error' ? { error: providers.meta.sources.searchConsole.error ?? 'Falló la actualización; se conserva el reporte anterior.' } : {}) } : providers?.searchConsole;
  return { ...core, insights, insightsUnavailable: !coreKnown,
    ...(providers ? { integrations: displayIntegrations!, searchConsole: displaySearch, providerMeta: providers.meta, providersLoaded: true } : {}) };
}

export function composeAudience(core: AudienceResponse, providers: OverviewResponse | undefined | null): AudienceResponse {
  if (!providers?.providersLoaded) return core;
  const as = providers.integrations.appStore, sc = providers.searchConsole;
  return { ...core,
    missing: core.missing.filter((p) => p !== 'appStore' && (sc ? p !== 'searchConsole' : true)),
    appStore: { configured: as.configured, error: as.error ?? null, countries: as.byCountry ?? null, partial: as.partial === true, missingDays: as.missingDays ?? [] },
    searchConsole: { configured: sc?.configured ?? false, error: sc?.error ?? null, countries: sc?.byCountry ?? null, partial: sc?.partial === true, missingDays: sc?.missingDays ?? [] } };
}

export function sourceMetaForError(meta: AdminMeta | null | undefined, error: string | null | undefined): AdminMeta | null {
  if (!meta || !error) return meta ?? null;
  return { ...meta, partial: true, sources: Object.fromEntries(Object.entries(meta.sources).map(([key, value]) => [key, { ...value, status: 'error', error }])) };
}
