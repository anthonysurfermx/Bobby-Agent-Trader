import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { normalizeAdminLive, normalizeOverview, isMissing, AdminError, type AdminLiveResponse, type Insight } from '../src/lib/admin-client.ts';
import { mockAdminFetch } from '../src/components/admin/bobby/mock.ts';

let checks = 0;
const check = (value: unknown, message: string) => { assert.ok(value, message); checks++; };
const equal = (actual: unknown, expected: unknown, message: string) => { assert.deepEqual(actual, expected, message); checks++; };
(globalThis as Record<string, unknown>).__compassNormalizers = { isMissing, AdminError };
const bundle = await build({ stdin: { contents: `
  export { default as OperationalPanel } from './src/components/admin/bobby/OperationalPanel';
  export { default as InsightsPanel } from './src/components/admin/bobby/InsightsPanel';
  export { default as OverviewTab } from './src/components/admin/bobby/OverviewTab';
  export { default as SourceFreshness } from './src/components/admin/bobby/SourceFreshness';
  export { default as Sidebar } from './src/components/admin/bobby/Sidebar';
  export { default as FunnelDrawing } from './src/components/admin/bobby/FunnelDrawing';
  export { operationalValue, operationalCoverage } from './src/components/admin/bobby/operational-values';
`, resolveDir: process.cwd(), loader: 'ts' }, bundle: true, write: false, format: 'cjs', platform: 'node', packages: 'external', jsx: 'automatic', define: { 'import.meta.env': '{}' }, plugins: [{ name: 'render-only-admin-api', setup(b) {
  b.onResolve({ filter: /^@\/lib\/admin-client$/ }, () => ({ path: 'admin-client', namespace: 'render-only' }));
  b.onLoad({ filter: /.*/, namespace: 'render-only' }, () => ({ loader: 'js', contents: 'export const {isMissing, AdminError} = globalThis.__compassNormalizers; export const adminAction = () => { throw new Error("Rendering must not invoke an action"); };' }));
} }] });
const require = createRequire(import.meta.url), module = { exports: {} as Record<string, any> };
new Function('require', 'module', 'exports', bundle.outputFiles[0].text)(require, module, module.exports);
const React = require('react'), { renderToStaticMarkup } = require('react-dom/server');
const { OperationalPanel, InsightsPanel, OverviewTab, SourceFreshness, Sidebar, FunnelDrawing, operationalValue, operationalCoverage } = module.exports;
const render = (component: unknown, props: Record<string, unknown>) => renderToStaticMarkup(React.createElement(component, props));
const rowValues = (markup: string, label: string) => Array.from(markup.matchAll(/<div class="flex items-baseline justify-between[^\"]*"[^>]*>[\s\S]*?<\/div>/g), (match) => match[0])
  .filter((row) => row.includes(label)).map((row) => row.match(/<span class="shrink-0[^\"]*">([^<]*)<\/span>/)?.[1]);
const raw = await (await mockAdminFetch('admin', 'GET', new URLSearchParams({ view: 'live' }))).json();
const data = normalizeAdminLive(raw);
assert.ok(data.live);

// A missing Android RPC and absent client coverage must stay unknown even beside observed server zeroes.
const legacy: AdminLiveResponse = structuredClone(data);
legacy.live!.windows['15m'].android = null;
legacy.live!.platforms.android = null;
legacy.live!.client = null;
legacy.live!.coverage.clientIngestionEnabled = null;
legacy.live!.windows['15m'].ios.completed = 0;
equal(operationalValue(legacy, '15m', 'ios', 'completed'), 0, 'observed server zero remains zero');
equal(operationalValue(legacy, '15m', 'ios', 'received'), null, 'server emission does not manufacture a client receipt');
equal(operationalValue(legacy, '15m', 'android', 'completed'), null, 'legacy Android response remains unmeasured');
equal(operationalCoverage(legacy, '15m', 'ios'), 'partial', 'unmeasured client makes iOS coverage partial');
equal(operationalCoverage(legacy, '15m', 'android'), 'unmeasured', 'no Android RPC is explicit absent coverage');
const html = render(OperationalPanel, { data: legacy, error: null, loading: false, updatedAt: null, onRetry() {} });
const table = html.match(/<table[\s\S]*?<\/table>/)?.[0] ?? '';
check(table.includes('App Android'), 'the first table includes Android');
const android = table.match(/<tr[^>]*><th[^>]*><span[^>]*>App Android[\s\S]*?<\/tr>/)?.[0] ?? '';
equal((android.match(/>—<\/td>/g) ?? []).length, 5, 'all unmeasured Android metrics render as dashes, never fabricated zeros');
equal((html.match(/role="radiogroup" aria-label="Ventana operativa"/g) ?? []).length, 1, 'one operational time selector governs the whole table');
const mobile = html.match(/aria-label="Actividad de lectura por plataforma en móvil"[\s\S]*?<table/)?.[0] ?? '';
equal((mobile.match(/<dt /g) ?? []).length, 15, 'mobile layout labels all five metrics for each platform');
check(mobile.includes('App Android') && mobile.includes('Recibidas') && mobile.includes('Visibles') && mobile.includes('Fallos'), 'mobile readings include client confirmations and failures without horizontal scrolling');
check(html.includes('App Android<!-- --> · servidor') || html.includes('App Android · servidor'), 'collapsed diagnostics include Android server activity');
check(html.includes('Registro del cliente sin confirmar'), 'unknown ingestion is never called healthy');
check(/<details[^>]*><summary[^>]*>Diagnóstico/.test(html), 'diagnostic text starts collapsed');

// All windows use the selected values; partial metrics and missing paths cannot be silently counted.
for (const [index, windowId] of (['15m', '1h', '24h'] as const).entries()) {
  data.live.windows[windowId].web.completed = 10 + index;
  equal(operationalValue(data, windowId, 'web', 'completed'), 10 + index, `${windowId}: independent selected window`);
}
const missing = structuredClone(data);
missing.missing.push('windows.15m.web.completed');
equal(operationalValue(missing, '15m', 'web', 'completed'), null, 'an omitted server field cannot become an observed zero');
missing.live!.coverage.clientIngestionEnabled = false;
check(render(OperationalPanel, { data: missing, error: null, loading: false, updatedAt: null, onRetry() {} }).includes('Registro del cliente desactivado'), 'disabled ingestion is visible before diagnostics');
equal(operationalValue(data, '15m', 'android', 'received'), null, 'an Android server metric cannot invent a receipt from its app');

// Internal-only Android activity establishes server capture. The external population
// still has a measured zero even though every scoped latest timestamp is absent.
const internalOnlyRaw = structuredClone(raw);
internalOnlyRaw.live.platforms.android = { latestEventAt: null, latestOutcomeAt: null, latestCompletedAt: null, latestReadConsumptionAt: null,
  coverage: { eventCoverageSince: '2026-09-01T00:00:00Z', outcomeCoverageSince: '2026-09-01T00:00:00Z', readConsumptionCoverageSince: '2026-09-01T00:00:00Z' } };
for (const windowId of ['15m', '1h', '24h']) for (const key of ['consumed', 'completed', 'failed']) internalOnlyRaw.live.windows[windowId].android[key] = 0;
const internalOnly = normalizeAdminLive(internalOnlyRaw);
equal(internalOnly.live?.platforms.android?.coverage, internalOnlyRaw.live.platforms.android.coverage, 'normalizer retains independent Android source coverage');
equal(internalOnly.live?.platforms.android?.latestOutcomeAt, null, 'source coverage cannot manufacture an external activity timestamp');
for (const windowId of ['15m', '1h', '24h'] as const) {
  for (const key of ['consumed', 'completed', 'failed'] as const) equal(operationalValue(internalOnly, windowId, 'android', key), 0, `${windowId}: internal-only source permits the recorded external ${key} zero`);
  for (const key of ['received', 'rendered'] as const) equal(operationalValue(internalOnly, windowId, 'android', key), null, `${windowId}: source capture cannot invent an Android ${key} receipt`);
}
const internalOnlyTable = render(OperationalPanel, { data: internalOnly, error: null, loading: false, updatedAt: null, onRetry() {} });
const internalOnlyRow = internalOnlyTable.match(/<tr[^>]*><th[^>]*><span[^>]*>App Android[\s\S]*?<\/tr>/)?.[0] ?? '';
equal((internalOnlyRow.match(/>0<\/td>/g) ?? []).length, 3, 'internal-only Android renders three server zeros in the selected external view');
equal((internalOnlyRow.match(/>—<\/td>/g) ?? []).length, 2, 'unimplemented Android client phases retain two dashes');

delete internalOnlyRaw.live.platforms.android.coverage;
const absentAndroidCoverage = normalizeAdminLive(internalOnlyRaw);
equal(absentAndroidCoverage.live?.platforms.android?.coverage, null, 'legacy Android payload cannot inherit another platform source coverage');
equal(operationalValue(absentAndroidCoverage, '15m', 'android', 'completed'), null, 'unverified Android source remains unknown even when global coverage exists');
internalOnlyRaw.live.platforms.android.coverage = { eventCoverageSince: null, outcomeCoverageSince: 'invalid-timestamp', readConsumptionCoverageSince: null };
const invalidAndroidCoverage = normalizeAdminLive(internalOnlyRaw);
equal(operationalValue(invalidAndroidCoverage, '15m', 'android', 'completed'), null, 'a malformed Android coverage clock cannot validate a measured zero');

// Malformed source clocks previously survived normalization and published four measured zeros.
const globalClocks = ['eventCoverageSince', 'outcomeCoverageSince', 'readConsumptionCoverageSince', 'llmLedgerCoverageSince'] as const;
const clientClocks = ['rolloutSince', 'readStartedSince', 'readReceivedSince', 'readRenderedSince', 'webviewTerminationSince'] as const;
for (const invalid of ['not-a-date', '', 17]) {
  const corrupt = structuredClone(raw);
  for (const key of globalClocks) corrupt.live.coverage[key] = invalid;
  for (const platform of ['ios', 'web'] as const) {
    for (const key of clientClocks) corrupt.live.client.platforms[platform].coverage[key] = invalid;
    for (const windowId of ['15m', '1h', '24h'] as const) {
      for (const key of ['consumed', 'completed', 'failed']) corrupt.live.windows[windowId][platform][key] = 0;
      for (const key of ['received', 'rendered']) corrupt.live.client.platforms[platform].windows[windowId][key] = 0;
    }
  }
  const normalized = normalizeAdminLive(corrupt);
  for (const key of globalClocks) {
    equal(normalized.live?.coverage[key], null, `${key}: malformed global coverage is unknown`);
    check(normalized.missing.includes(`coverage.${key}`), `${key}: malformed global coverage retains its evidence path`);
  }
  for (const platform of ['ios', 'web'] as const) {
    for (const key of clientClocks) {
      equal(normalized.live?.client?.platforms[platform].coverage[key], null, `${platform}.${key}: malformed client coverage is unknown`);
      check(normalized.missing.includes(`client.platforms.${platform}.coverage.${key}`), `${platform}.${key}: malformed client coverage retains its evidence path`);
    }
    for (const windowId of ['15m', '1h', '24h'] as const) for (const metric of ['consumed', 'completed', 'failed', 'received', 'rendered']) {
      equal(operationalValue(normalized, windowId, platform, metric), null, `${platform}.${windowId}.${metric}: malformed coverage cannot publish a measured zero`);
    }
  }
}
const noCoverage = structuredClone(raw);
for (const key of globalClocks) noCoverage.live.coverage[key] = null;
for (const platform of ['ios', 'web']) for (const key of clientClocks) noCoverage.live.client.platforms[platform].coverage[key] = null;
equal(normalizeAdminLive(noCoverage).missing, [], 'explicit null clocks describe absent observation without pretending fields were omitted');
for (const key of globalClocks) delete noCoverage.live.coverage[key];
for (const platform of ['ios', 'web']) for (const key of clientClocks) delete noCoverage.live.client.platforms[platform].coverage[key];
const omittedCoverage = normalizeAdminLive(noCoverage);
for (const key of globalClocks) check(omittedCoverage.missing.includes(`coverage.${key}`), `${key}: an omitted global clock stays distinct from explicit null`);
for (const platform of ['ios', 'web']) for (const key of clientClocks) check(omittedCoverage.missing.includes(`client.platforms.${platform}.coverage.${key}`), `${platform}.${key}: an omitted client clock stays distinct from explicit null`);

// Foreground counts need a valid report clock as well as observed rollout coverage.
for (const clock of ['not-a-date', null, undefined]) {
  const corruptPresence = structuredClone(raw);
  for (const platform of ['ios', 'web']) {
    const presence = corruptPresence.live.client.platforms[platform].presence;
    presence.reportedForegroundInstalls = 0;
    presence.reportedForegroundAccounts = 0;
    presence.reportedForegroundSessions = 0;
    if (clock === undefined) delete presence.latestReportAt;
    else presence.latestReportAt = clock;
  }
  const normalized = normalizeAdminLive(corruptPresence);
  for (const platform of ['ios', 'web'] as const) {
    equal(normalized.live?.client?.platforms[platform].presence.latestReportAt, null, `${platform}: unavailable report clock is null`);
    equal(normalized.missing.includes(`client.platforms.${platform}.presence.latestReportAt`), clock !== null, `${platform}: malformed/missing report clock stays distinct from explicit null`);
  }
  const markup = render(OperationalPanel, { data: normalized, error: null, loading: false, updatedAt: null, onRetry() {} });
  equal(rowValues(markup, 'Instalaciones que reportan primer plano'), ['—', '—'], 'foreground zero with an unavailable report clock remains unknown in client diagnostics');
}
const observedPresence = structuredClone(raw);
for (const platform of ['ios', 'web']) observedPresence.live.client.platforms[platform].presence.reportedForegroundInstalls = 0;
equal(rowValues(render(OperationalPanel, { data: normalizeAdminLive(observedPresence), error: null, loading: false, updatedAt: null, onRetry() {} }), 'Instalaciones que reportan primer plano'), ['0', '0'], 'valid report clocks preserve genuinely observed foreground zeroes');

// Valid coverage cannot rescue a count whose own time window is unavailable.
for (const clock of ['not-a-date', null, undefined]) {
  const corruptWindow = structuredClone(raw);
  for (const windowId of ['15m', '1h', '24h'] as const) {
    if (clock === undefined) delete corruptWindow.live.windows[windowId].since;
    else corruptWindow.live.windows[windowId].since = clock;
    for (const platform of ['ios', 'web', 'android']) {
      const server = corruptWindow.live.windows[windowId][platform];
      for (const key of Object.keys(server)) server[key] = key === 'blocked' ? { 'malformed-window-block': 2 } : 0;
    }
    for (const platform of ['ios', 'web'] as const) {
      const window = corruptWindow.live.client.platforms[platform].windows[windowId];
      if (clock === undefined) delete window.since;
      else window.since = clock;
      for (const key of ['foreground', 'background', 'started', 'received', 'rendered', 'webviewTerminations', 'reportedInstalls', 'reportedAccounts']) window[key] = 0;
    }
  }
  const normalized = normalizeAdminLive(corruptWindow);
  for (const windowId of ['15m', '1h', '24h'] as const) {
    equal(normalized.live?.windows[windowId].since, null, `${windowId}: unavailable server window is null`);
    equal(normalized.missing.includes(`windows.${windowId}.since`), clock !== null, `${windowId}: missing/invalid window is distinct from explicit null`);
    for (const platform of ['ios', 'web'] as const) {
      equal(normalized.live?.client?.platforms[platform].windows[windowId].since, null, `${platform}.${windowId}: unavailable client window is null`);
      equal(normalized.missing.includes(`client.platforms.${platform}.windows.${windowId}.since`), clock !== null, `${platform}.${windowId}: client window retains its evidence path`);
      for (const metric of ['consumed', 'completed', 'failed', 'received', 'rendered']) equal(operationalValue(normalized, windowId, platform, metric), null, `${platform}.${windowId}.${metric}: own window date is required`);
      equal(operationalCoverage(normalized, windowId, platform), 'unmeasured', `${platform}.${windowId}: malformed dates cannot describe observed coverage`);
    }
  }
  if (clock === 'not-a-date') {
    const windowMarkup = render(OperationalPanel, { data: normalized, error: null, loading: false, updatedAt: null, onRetry() {} });
    equal(rowValues(windowMarkup, 'Instalaciones con actividad'), ['—', '—', '—'], 'server diagnostics never publish zero activity from a malformed window');
    equal(rowValues(windowMarkup, 'Interrumpidas'), ['—', '—', '—'], 'server diagnostics never publish zero interruptions from a malformed window');
    equal(rowValues(windowMarkup, 'Muros de registro / pago / nivel'), ['— / — / —', '— / — / —', '— / — / —'], 'server diagnostic wall counts require their valid window');
    equal(rowValues(windowMarkup, 'Solicitudes bloqueadas'), ['—', '—', '—'], 'server diagnostic blocked totals require their valid window');
    check(!windowMarkup.includes('malformed-window-block'), 'a blocked reason and count cannot escape the unavailable server window through its diagnostic breakdown');
    equal(rowValues(windowMarkup, 'Inicios de lectura reportados'), ['—', '—'], 'client diagnostics never publish zero starts from a malformed window');
    equal(rowValues(windowMarkup, 'Respuestas recibidas · reportadas'), ['—', '—'], 'client diagnostic received counts require their valid window');
    equal(rowValues(windowMarkup, 'Respuestas presentadas · reportadas'), ['—', '—'], 'client diagnostic rendered counts require their valid window');
  }
}

// A partial provider row is missing evidence, not a measured free, failure-free day.
const partialProvider = structuredClone(raw);
for (const key of ['calls24h', 'failures24h', 'usd24h']) delete partialProvider.live.providers[0][key];
const unknownProvider = normalizeAdminLive(partialProvider);
for (const key of ['calls24h', 'failures24h', 'usd24h'] as const) {
  equal(unknownProvider.live?.providers[0][key], null, `${key}: absent provider metric is nullable`);
  check(unknownProvider.missing.includes(`providers.0.${key}`), `${key}: absent provider metric has a precise missing path`);
}
const providerMarkup = render(OperationalPanel, { data: unknownProvider, error: null, loading: false, updatedAt: null, onRetry() {} });
equal(rowValues(providerMarkup, 'anthropic · fixture-model'), ['— llamadas · — fallos · —'], 'the rendered provider row preserves unknown calls, failures and cost as dashes');
for (const invalid of [null, '', ' ', 'not-a-number', false, []]) {
  for (const key of ['calls24h', 'failures24h', 'usd24h']) partialProvider.live.providers[0][key] = invalid;
  const normalized = normalizeAdminLive(partialProvider);
  equal([normalized.live?.providers[0].calls24h, normalized.live?.providers[0].failures24h, normalized.live?.providers[0].usd24h], [null, null, null], 'invalid or unavailable provider numbers cannot normalize to measured zero');
}
partialProvider.live.providers[0].calls24h = 0;
partialProvider.live.providers[0].failures24h = '0';
partialProvider.live.providers[0].usd24h = '0.25';
const measuredProvider = normalizeAdminLive(partialProvider);
equal([measuredProvider.live?.providers[0].calls24h, measuredProvider.live?.providers[0].failures24h, measuredProvider.live?.providers[0].usd24h], [0, 0, 0.25], 'real zeroes and valid numeric strings survive provider normalization');
equal(measuredProvider.missing, [], 'measured provider values are complete evidence');

// A busy dashboard opens with three closed, severity-ordered findings. Evidence remains available on demand.
const insights: Insight[] = Array.from({ length: 6 }, (_, i) => ({ id: `finding-${i}`, title: `Finding ${i}`, detail: `Evidence ${i}`, action: `Action ${i}`,
  level: i === 5 ? 'critical' : i === 4 ? 'warn' : 'info', area: 'medicion', sample: 5, impact: 1, tab: 'integraciones', evidence: [] }));
const priority = render(InsightsPanel, { insights, period: 30, internal: false });
equal((priority.match(/aria-expanded="false"/g) ?? []).length, 3, 'exactly three findings start collapsed');
check(priority.indexOf('Finding 5') < priority.indexOf('Finding 4'), 'critical finding appears before warnings');
check(!priority.includes('Finding 1') && !priority.includes('Evidence 5'), 'extra findings and expanded evidence do not dominate the initial view');
check(priority.includes('Ver los 6 hallazgos') && priority.includes('Incluye oportunidades e información'), 'extra findings count is clearly the total with opportunities and information');

// Business summaries preserve scope and payment uncertainty; they never divide all-team cost by external reads.
const overviewRaw = await (await mockAdminFetch('admin', 'GET', new URLSearchParams({ view: 'overview', days: '30' }))).json();
const overview = normalizeOverview(overviewRaw);
overview.overview.coverage!.purchasesSince = null;
const summary = render(OverviewTab, { data: overview, period: 30, cmp: null });
check(summary.includes('Sin eventos de compra: cobertura sin comprobar'), 'payer zero carries unverified purchase coverage');
check(summary.toLowerCase().includes('no son personas únicas'), 'accounts and installations are not presented as unique humans');
check(!summary.includes('por lectura'), 'mixed-scope spend is not converted into a cost per external read');
check(/<details[^>]*><summary[^>]*>Cuentas, lecturas y activación/.test(summary), 'historical breakdown starts collapsed');

const sidebar = render(Sidebar, { tab: 'resumen', onSelect() {}, onSearch() {}, collapsed: false, email: 'fixture@example.com', onSignOut() {},
  platforms: { web: 3, ios: 0, android: null, days: 30 } });
check(sidebar.includes('Android') && sidebar.includes('Dato no disponible'), 'sidebar includes Android while preserving unavailable totals');

const freshness = render(SourceFreshness, { label: 'Fuentes', maxAgeMs: 90_000, meta: { generatedAt: '2026-10-04T12:00:00Z', durationMs: 20, partial: true,
  sources: { live: { status: 'ok', fetchedAt: '2026-10-04T12:00:00Z' }, searchConsole: { status: 'deferred', fetchedAt: null } } } });
check(freshness.includes('Consulta separada'), 'deferred providers stay visible as sources queried separately');
const stamp = new Date().toISOString();
const mixed = render(SourceFreshness, { label: 'Bobby', maxAgeMs: 90_000, meta: { generatedAt: stamp, durationMs: 20, partial: true,
  sources: { overview: { status: 'ok', fetchedAt: stamp }, appStore: { status: 'deferred', fetchedAt: null } } } });
check(mixed.match(/<summary[\s\S]*?<\/summary>/)?.[0].includes('Actualizado'), 'a fresh core response is not marked pending because providers have their own request');
const deferred = render(SourceFreshness, { label: 'Providers', maxAgeMs: 90_000, meta: { generatedAt: stamp, durationMs: 20, partial: true,
  sources: { appStore: { status: 'deferred', fetchedAt: null } } } });
check(deferred.match(/<summary[\s\S]*?<\/summary>/)?.[0].includes('Pendiente de consulta'), 'an entirely deferred response still has pending freshness');

// External counts are different populations/units, so their numerical difference cannot imply cohort attrition.
// The two observed stages are nested within the same cohort and can report a missing recorded next step.
const funnel = render(FunnelDrawing, { idPrefix: 'mixed-fixture', stages: [
  { key: 'impressions', label: 'External impressions', value: 1000, aggregate: true, hint: 'Search-result impressions' },
  { key: 'clicks', label: 'External clicks', value: 100, aggregate: true, hint: 'Search-result clicks' },
  { key: 'arrived', label: 'Observed installs', value: 20, hint: 'Install cohort' },
  { key: 'read1', label: 'Consumed a read', value: 10, hint: 'Subset of the observed install cohort' },
] });
const transitionLines = Array.from(funnel.matchAll(/<div class="grid h-\[22px\][\s\S]*?<span class="text-center[^\"]*">([^<]*)<\/span>/g), (match) => match[1]);
equal(transitionLines.length, 3, 'the mixed fixture exercises all three transitions');
equal(transitionLines.slice(0, 2), ['', ''], 'external-to-external and external-to-cohort differences do not claim missing cohort members');
check(transitionLines[2].startsWith('10 ') && transitionLines[2].includes('registrado'), 'only the observed 20-to-10 subset reports ten without a recorded next step');
check(!/se fueron|abandonaron|personas perdidas/i.test(funnel), 'the rendered funnel never converts a missing event into departed humans');
const unknownStep = render(FunnelDrawing, { idPrefix: 'unknown-fixture', stages: [
  { key: 'arrived', label: 'Observed installs', value: 20, hint: 'Install cohort' },
  { key: 'read1', label: 'Consumption unavailable', value: null, missing: 'Source unavailable', hint: 'No verified measurement' },
] });
check(!unknownStep.includes('sin siguiente paso registrado'), 'an unavailable next stage cannot manufacture twenty missing steps');
console.log(`test-admin-compass-ui: ${checks} checks passed`);
