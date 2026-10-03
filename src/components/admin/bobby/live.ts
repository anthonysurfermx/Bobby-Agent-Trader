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
  if (fetched > now + 60_000) return 'unknown';
  return now - fetched > maxAgeMs ? 'stale' : 'fresh';
}

/** Advance the server's response clock locally so a workstation clock offset cannot invalidate a fresh source. */
export function sourceNow(meta: AdminMeta | null | undefined, now = Date.now()) {
  const generated = meta?.generatedAt ? Date.parse(meta.generatedAt) : NaN;
  return Number.isFinite(generated) && meta?.receivedAt != null ? generated + Math.max(0, now - meta.receivedAt) : now;
}

/** A provider failure keeps the previous observed values and their original timestamp. */
export function mergeProviderSnapshots(previous: AdminIntegrationsResponse | null, next: AdminIntegrationsResponse): AdminIntegrationsResponse {
  if (!previous) return next;
  const integrations = { ...next.integrations };
  const sources = { ...next.meta?.sources };
  let searchConsole = next.searchConsole;
  for (const key of ['appStore', 'revenuecat', 'searchConsole', 'health'] as const) {
    if (next.meta?.sources[key]?.status !== 'error') continue;
    const error = sources[key]?.error ?? 'source_unavailable';
    if (key === 'searchConsole') searchConsole = previous.searchConsole ? { ...previous.searchConsole,
      configured: next.searchConsole?.configured ?? previous.searchConsole.configured, error: next.searchConsole?.error ?? error } : next.searchConsole;
    else if (key === 'health') {
      const health = previous.integrations.health;
      integrations.health = health ? { ...health,
        revenuecatWebhook: { ...health.revenuecatWebhook, lastEventError: error, eventsError: error },
        stripe: { ...health.stripe, lastEventError: error },
        tracking: { ...health.tracking, lastEventError: error, eventsError: error, lastReadError: error, healthError: error },
      } : next.integrations.health;
    }
    else integrations[key] = { ...previous.integrations[key], configured: next.integrations[key].configured,
      error: next.integrations[key].error ?? sources[key]?.error ?? 'source_unavailable' } as never;
    sources[key] = { ...sources[key], fetchedAt: previous.meta?.sources[key]?.fetchedAt ?? null };
  }
  return { integrations, searchConsole, meta: next.meta ? { ...next.meta, sources } : null };
}

export function composeOverview(core: OverviewResponse, providers: AdminIntegrationsResponse | null): OverviewResponse {
  const now = Date.now();
  const coreNow = sourceNow(core.meta, now), providerNow = sourceNow(providers?.meta, now);
  const coreKnown = sourceState(core.meta?.sources.overview, CORE_STALE_MS, coreNow) === 'fresh';
  const growthKnown = sourceState(core.meta?.sources.growth, CORE_STALE_MS, coreNow) === 'fresh';
  const llmCaps = Object.fromEntries((['dayUsd', 'monthUsd', 'alertUsd'] as const).map((key) => [key,
    core.integrations.llmCaps[key] ?? providers?.integrations.llmCaps[key] ?? null])) as OverviewResponse['integrations']['llmCaps'];
  const paywall = core.integrations.paywall ?? providers?.integrations.paywall ?? null;
  const validProvider = (key: string) => {
    const source = providers?.meta?.sources[key];
    if (source?.status === 'not_configured') return true;
    const age = source?.fetchedAt ? providerNow - Date.parse(source.fetchedAt) : NaN;
    return !!source && ['ok', 'partial'].includes(source.status) && age >= -60_000 && age <= PROVIDER_REFRESH_MS * 2;
  };
  const integrations = { llmCaps, paywall,
    llmGuard: core.overview.llm.guard ? { dayUsd: core.overview.llm.guard.day, monthUsd: core.overview.llm.guard.month } : providers?.integrations.llmGuard,
    appStore: validProvider('appStore') ? providers?.integrations.appStore : undefined,
    revenuecat: validProvider('revenuecat') ? providers?.integrations.revenuecat : undefined,
    health: validProvider('health') ? providers?.integrations.health : undefined,
  };
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
    networks: sourceState(core.meta?.sources.networks, CORE_STALE_MS, coreNow) === 'fresh' ? core.networks : null,
    includeInternal: core.overview.includeInternal, now: coreNow }) : [];
  const displayIntegrations = providers ? { ...providers.integrations,
    appStore: { ...providers.integrations.appStore, ...(providers.meta?.sources.appStore?.status === 'error' ? { error: providers.meta.sources.appStore.error ?? 'Falló la actualización; se conserva el reporte anterior.' } : {}) },
    revenuecat: { ...providers.integrations.revenuecat, ...(providers.meta?.sources.revenuecat?.status === 'error' ? { error: providers.meta.sources.revenuecat.error ?? 'Falló la actualización; se conserva el reporte anterior.' } : {}) },
    llmCaps, paywall,
  } : core.integrations;
  const displaySearch = providers?.searchConsole ? { ...providers.searchConsole, ...(providers.meta?.sources.searchConsole?.status === 'error' ? { error: providers.meta.sources.searchConsole.error ?? 'Falló la actualización; se conserva el reporte anterior.' } : {}) } : providers?.searchConsole;
  return { ...core, integrations: displayIntegrations, insights, insightsUnavailable: !coreKnown,
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
