// Admin truth r2, WP3: the diagnosis, the digest email, the credit alert and the weekly plan say only what is true.
//   F02 the desk is "recovered" only when a desk analysis finished after the last one that did not;
//   F07 a balance mark never clears a credit alert; F14 no percentage from fewer than 5 samples ("x de n");
//   F01 payers are verified paid memberships only; the network rule also reports accounts;
//   F03 an email counts as sent only when Resend accepted it, and two runs never both send;
//   F15 a plan priority citing an unknown finding or an unknown figure is dropped (7 and the period length only as
//       days); one generation at a time, released only by its holder; bounded by the caller's deadline;
//   D4 runs the reader abandoned are not failures;  F16 a partial Apple load says "parcial";  F08 Apple's counts
//       include the team.
// Backend mocked: an in-memory api_cache with an atomic bobby_cache_claim, Resend and Anthropic fakes.
import assert from 'node:assert/strict';

process.env.BOBBY_SUPABASE_URL = 'https://db.test';
process.env.BOBBY_SUPABASE_ANON_KEY = 'test-anon';
process.env.BOBBY_SUPABASE_SERVICE_ROLE_KEY = 'test-service';
process.env.RATE_LIMIT_SALT = 'test-salt';
process.env.ANTHROPIC_API_KEY = 'test-anthropic';
process.env.OPENAI_API_KEY = 'test-openai';
for (const k of ['RESEND_API_KEY', 'BOBBY_ALERT_EMAIL', 'WAITLIST_NOTIFY_EMAIL', 'BOBBY_ALERT_FROM', 'WAITLIST_NOTIFY_FROM', 'REVENUECAT_V2_SECRET_KEY', 'REVENUECAT_SECRET_KEY',
  'ASC_KEY_ID', 'ASC_ISSUER_ID', 'ASC_PRIVATE_KEY', 'ASC_VENDOR_NUMBER', 'GSC_SERVICE_ACCOUNT_JSON', 'STRIPE_SECRET_KEY', 'STRIPE_PRICE_ID']) delete process.env[k];

const { buildInsights } = await import('../api/_lib/admin-insights.ts');
const { buildDigest, runDigest, sendDigestNow, isoWeek } = await import('../api/_lib/admin-digest.ts');
const { growthPlan } = await import('../api/_lib/admin-plan.ts');
const { alertProviderCredit, notifyOwner, resetProviderAlerts } = await import('../api/_lib/provider-alert.ts');
const { AdminError } = await import('../api/_lib/admin.ts');

let checks = 0;
const eq = (got: unknown, want: unknown, what: string) => { assert.deepEqual(got, want, what); checks++; };
const ok = (v: unknown, what: string) => { assert.ok(v, what); checks++; };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------- backend fakes
interface Call { url: string; method: string; body: any }
let calls: Call[] = [];
const store = new Map<string, { payload: unknown; expires: number }>();
let claimDown = false;
let resend: (c: Call) => Response | Promise<Response> = () => json({ id: 'email-ok' });
let anthropic: (c: Call) => Response | Promise<Response> = () => json({ message: 'unset' }, 500);
let fixture: { overview: unknown; growth: unknown; networks: unknown } = { overview: {}, growth: {}, networks: [] };
let growthUnavailable = false, pruneUnavailable = false;

globalThis.fetch = (async (input: string | URL, init?: RequestInit) => {
  const raw = init?.body ? String(init.body) : '';
  let body: any = null;
  try { body = raw ? JSON.parse(raw) : null; } catch { body = raw; }
  const c: Call = { url: String(input), method: init?.method ?? 'GET', body };
  calls.push(c);
  const url = new URL(c.url);
  if (url.host === 'api.resend.com') return resend(c);
  if (url.host === 'api.anthropic.com') return anthropic(c);
  if (url.host !== 'db.test') return json({ message: `unexpected ${c.method} ${c.url}` }, 500);
  await sleep(Math.random() * 3); // lets concurrent runs interleave at every storage call
  if (url.pathname === '/rest/v1/rpc/bobby_cache_claim') {
    if (claimDown) return json({ message: 'down' }, 503);
    const held = store.get(body.p_key);
    if (held && held.expires > Date.now()) return json(false);
    store.set(body.p_key, { payload: body.p_payload, expires: Date.now() + body.p_ttl_seconds * 1000 });
    return json(true);
  }
  if (url.pathname === '/rest/v1/api_cache') {
    const key = (url.searchParams.get('cache_key') ?? '').replace(/^eq\./, '');
    if (c.method === 'GET') {
      const row = store.get(key);
      const gt = url.searchParams.get('expires_at');
      const live = row && (!gt || row.expires > Date.parse(gt.replace(/^gt\./, '')));
      return json(live ? [{ payload: row!.payload }] : []);
    }
    if (c.method === 'DELETE') {
      // PostgREST's json filter: payload->>nonce=eq.X deletes only while the stored payload still carries X.
      const nonce = url.searchParams.get('payload->>nonce')?.replace(/^eq\./, '');
      const row = store.get(key);
      if (!nonce || (row?.payload as { nonce?: unknown } | undefined)?.nonce === nonce) store.delete(key);
      return new Response(null, { status: 204 });
    }
    store.set(body.cache_key, { payload: body.payload, expires: Date.parse(body.expires_at) });
    return new Response(null, { status: 201 });
  }
  if (url.pathname === '/rest/v1/rpc/bobby_admin_overview') return json(fixture.overview);
  if (url.pathname === '/rest/v1/rpc/bobby_admin_growth') return growthUnavailable ? json({ error: 'unavailable' }, 503) : json(fixture.growth);
  if (url.pathname === '/rest/v1/rpc/bobby_prune_client_telemetry') return pruneUnavailable ? json({ error: 'missing function' }, 404) : json({ deleted: 0 });
  if (url.pathname === '/rest/v1/rpc/bobby_admin_internal_networks') return json(fixture.networks);
  if (url.pathname === '/rest/v1/rpc/bobby_llm_spend') return json({ day: 0, month: 0 });
  return c.method === 'GET' ? json([]) : new Response(null, { status: 201 });
}) as typeof fetch;

const resendPosts = () => calls.filter((c) => c.url.startsWith('https://api.resend.com/'));
const digestKeys = () => [...store.keys()].filter((k) => k.startsWith('admin-digest:'));
const until = async (cond: () => boolean, what: string) => {
  for (let i = 0; i < 100 && !cond(); i++) await sleep(5);
  ok(cond(), what);
};
const textOf = (i: { title: string; detail: string; evidence: string[] }) => [i.title, i.detail, ...i.evidence].join(' | ');
const NOW = Date.parse('2026-10-02T12:00:00Z');
const at = (hhmm: string) => `2026-10-02T${hhmm}:00Z`;

// ---------------------------------------------------------------- F02: desk recovery needs a finished desk read
{
  const desk = (deskRuns: Record<string, unknown>, providers: Record<string, unknown> = {}) =>
    buildInsights({ days: 30, now: NOW, overview: { llm: { deskRuns, providers } }, growth: {}, integrations: {}, searchConsole: {} }).find((i) => i.id === 'desk-failures');

  // 5 analyses, none finished; the last desk failure at 10:00 and a probe of the other provider OK at 10:01.
  const probe = desk({ runs: 5, finished: 0, lastFinishedAt: null, lastUnfinishedAt: at('10:00'), byDay: [{ day: '2026-10-02', runs: 5, finished: 0 }] },
    { openai: { lastFailure: { at: at('10:00'), stop: 'http_429', surface: 'desk' } }, anthropic: { lastOk: at('10:01') } });
  eq(probe?.level, 'critical', 'F02: 0 of 5 finished + another provider answering after the failure is still urgent');
  ok(!/desde la última falla el desk responde|terminó bien/.test(probe!.title), 'F02: it never claims the desk answered');

  // 8 of 10 finished historically (80% in the last 48 h), but the last finished one is before the last failure.
  const average = desk({ runs: 10, finished: 8, lastFinishedAt: at('09:00'), lastUnfinishedAt: at('10:00'),
    byDay: [{ day: '2026-10-01', runs: 5, finished: 4 }, { day: '2026-10-02', runs: 5, finished: 4 }] },
  { anthropic: { lastOk: at('11:30') } });
  eq(average?.level, 'warn', 'F02: a good historical average with the last failure after the last finished read is not healed');
  ok(average!.evidence.includes('últimas 48 h: 8/10'), 'F02: the 48 h figure stays as evidence only');

  const healed = desk({ runs: 10, finished: 8, lastFinishedAt: at('11:00'), lastUnfinishedAt: at('10:00'), byDay: [] });
  eq(healed?.level, 'info', 'F02: a finished desk read after the last unfinished one heals it');
  ok(/el último terminó bien \(.+\), después de la última falla \(.+\)/.test(healed!.title), 'F02: the healed title names both moments');
  ok(healed!.evidence.some((e) => e.startsWith('último terminado:')) && healed!.evidence.some((e) => e.startsWith('último sin terminar:')), 'F02: evidence carries both stamps');

  // D4: runs the reader abandoned are counted apart by the server; the finding never calls them failures.
  const left = desk({ runs: 10, finished: 8, abandoned: 3, lastFinishedAt: at('11:00'), lastUnfinishedAt: at('10:00'), byDay: [] });
  eq(left?.level, 'info', 'D4: abandoned runs after the last finished read do not reopen the wave (the server keeps them out of lastUnfinishedAt)');
  ok(left!.detail.includes('3 análisis que el lector abandonó no cuentan como falla') && left!.evidence.includes('abandonados por el lector: 3'), 'D4: they are said apart');
  const open = desk({ runs: 10, finished: 5, abandoned: 2, lastFinishedAt: at('09:00'), lastUnfinishedAt: at('10:00'), byDay: [] });
  ok(!/vio "no disponible"|lector que vio/.test(textOf(open!)) && open!.detail.includes('el ledger no prueba lo que recibió el cliente'), 'D4: no claim that every unfinished run was a reader who saw an error');

  // A server without the new keys can never claim recovery.
  eq(desk({ runs: 24, finished: 14, byDay: [{ day: '2026-10-02', runs: 1, finished: 1 }] }, { anthropic: { lastOk: at('11:00') } })?.level, 'critical',
    'F02: no lastFinishedAt (older server) ⇒ not healed, 10 of 24 unfinished is critical');
}

// ---------------------------------------------------------------- F07: only a top-up or a later OK clears a credit alert
{
  const credit = (openai: Record<string, unknown>) =>
    buildInsights({ days: 30, now: NOW, overview: { llm: { providers: { openai } } }, growth: {}, integrations: {}, searchConsole: {} }).find((i) => i.id === 'credit-openai');
  const alert = { lastCreditAlert: at('10:00'), creditAlert: { code: 'insufficient_quota', endpoint: 'desk' }, lastOk: at('08:00') };
  eq(credit({ ...alert, balanceMark: { amount: 0, at: at('11:00') }, lastTopup: null })?.level, 'critical', 'F07: a $0 balance mark after the alert does not clear it');
  eq(credit({ ...alert, balanceMark: { amount: 0, at: at('11:00') }, lastTopup: at('11:00') })?.level, 'critical',
    'F07: nor when an older server reports that balance mark as lastTopup');
  eq(credit({ ...alert, balanceMark: { amount: 50, at: at('11:00') }, lastTopup: null })?.level, 'critical', 'F07: a balance mark of any amount never heals');
  eq(credit({ ...alert, balanceMark: { amount: 0, at: at('11:00') }, lastOk: at('12:00') }), undefined, 'F07: a successful call or probe after the alert clears it');
  eq(credit({ ...alert, lastTopup: at('11:30'), balanceMark: { amount: 0, at: at('11:00') } }), undefined, 'F07: a positive top-up after the alert clears it');
  eq(credit({ ...alert, lastTopup: at('10:00') })?.level, 'critical', 'F07: a top-up at the alert instant is not after it');
}

// ---------------------------------------------------------------- F14: "x de n" under 5 samples, in every rule
{
  const small = buildInsights({
    days: 30, now: NOW,
    overview: { llm: { providers: { openai: { calls24h: 3, failures24h: 2, lastFailure: { stop: 'http_500' } } } } },
    growth: {
      cohorts: { web: { wall: 3, accountAfterWall: 0, arrived: 4, deskOrRead: 1, read1: 1, signinStart: 3, account: 1 }, ios: { arrived: 0 } },
      history: { ios: { installsInPeriod: 0 } },
      acquisition: { visitors: 4, visits: 4, visitsWithUtm: 1, sources: [{ source: 'utm:tiktok', installs: 3, read1: 3 }, { source: 'direct', installs: 3, read1: 1 }] },
      outcomes: { consumedTotal: 4, consumedInternal: 2 },
    },
    integrations: { appStore: { configured: true, totals: { downloads: 3 }, byCountry: [{ country: 'FR', downloads: 3 }] }, paywall: true, health: { stripe: { configured: true } } },
    searchConsole: {},
  });
  const byId = new Map(small.map((i) => [i.id, i]));
  ok(byId.get('failing-openai')?.title.includes('2 de 3') && !byId.get('failing-openai')!.title.includes('%'), 'F14: 2 failures of 3 calls ⇒ "2 de 3", not 67%');
  ok(byId.get('ios-gap')?.detail.includes('No hay una unión entre ambas fuentes') && !/\d+%|De esas descargas faltan/.test(textOf(byId.get('ios-gap')!)), 'Apple downloads and observed installs never supply a loss rate');
  ok(byId.get('wall-conversion')?.title.includes('convierte 0 de 3') && !/0%/.test(byId.get('wall-conversion')!.title), 'F14: 0 accounts after 3 walls ⇒ "0 de 3", not 0%');
  ok(!byId.has('best-source'), 'F14: no best source from sources with 3 installs (3 of 3 is not "100%")');
  const percentages = small.filter((i) => /\d\s?%/.test(textOf(i))).map((i) => i.id);
  eq(percentages, [], 'F14: no rule shows a percentage when every sample is under 5');

  const big = buildInsights({
    days: 30, now: NOW,
    overview: { llm: { providers: { openai: { calls24h: 10, failures24h: 6 } } } },
    growth: { acquisition: { visitors: 40, sources: [{ source: 'utm:tiktok', installs: 5, read1: 4 }, { source: 'direct', installs: 6, read1: 1 }, { source: 'utm:x', installs: 4, read1: 4 }] } },
    integrations: {}, searchConsole: {},
  });
  ok(big.find((i) => i.id === 'failing-openai')?.title.includes('60%'), 'F14: from 5 samples up the rate is a percentage');
  const best = big.find((i) => i.id === 'best-source');
  ok(best?.title.includes('tiktok (80%') && !best.evidence.some((e) => e.startsWith('utm:x')), 'F14: best source compares only sources with 5+ installs');
}

// ---------------------------------------------------------------- F01: payers are verified paid memberships only
{
  const money = (subscriptions: Record<string, unknown>, grossUsd = 0, people: Record<string, unknown> = {}) =>
    buildInsights({ days: 30, now: NOW, overview: { subscriptions, revenue: { grossUsd, unattributedEvents: 0, unattributedGrossUsd: 0, unconvertedEvents: 0 } }, growth: { people }, integrations: { health: { revenuecatWebhook: { configured: true, lastEventAt: at('06:54') } } }, searchConsole: {} });
  const one = money({ active: 1, paid: 0, paidVerified: 0, unverified: 1, unverifiedReasons: { unknown_environment: 1, no_charge: 0 }, test: 0, testReasons: { sandbox: 0, trial: 0 } });
  const pu = one.find((i) => i.id === 'payers-unverified');
  ok(pu && pu.level === 'warn' && pu.tab === 'membresias' && pu.area === 'monetizacion' && pu.impact === 66, 'F01: an active membership without verification is its own finding');
  ok(pu!.evidence.includes('entorno desconocido: 1') && pu!.evidence.includes('pagando (verificado): 0') && /no cuenta como pago/.test(pu!.title), 'F01: it says why and that it is not a payment');
  ok(!one.some((i) => i.id === 'no-payers'), 'F01: "no payers" is not claimed while a membership is unverified');
  ok(!money({ paidVerified: 1, unverified: 0 }).some((i) => i.id === 'no-payers'), 'F01: a verified payer means there are payers');
  ok(money({ paidVerified: 0, unverified: 0, test: 1 }, 0).some((i) => i.id === 'no-payers'), 'F01: test memberships are not payers');
  const foreignMoney = buildInsights({ days: 30, now: NOW, overview: { subscriptions: { paidVerified: 0, unverified: 0 }, revenue: { grossUsd: 0, unattributedEvents: 0, unconvertedEvents: 1 } }, growth: {}, integrations: {}, searchConsole: {} });
  ok(foreignMoney.some((i) => i.id === 'revenue-unconverted') && !foreignMoney.some((i) => i.id === 'no-payers'), 'missing USD conversion never becomes zero money');
  const unlinked = buildInsights({ days: 30, now: NOW, overview: { subscriptions: { paidVerified: 0, unverified: 0 }, revenue: { grossUsd: 0, unattributedEvents: 1, unattributedGrossUsd: 5 } }, growth: {}, integrations: {}, searchConsole: {} });
  ok(unlinked.some((i) => i.id === 'revenue-unattributed') && !unlinked.some((i) => i.id === 'no-payers'), 'unknown-owner receipts are explicit and cannot prove no revenue or customers');
  ok(!money({ paid: 0 }).some((i) => i.id === 'no-payers'), 'F01: missing commercial coverage cannot prove zero payers');
  ok(!money({ paidVerified: 0, unverified: 0 }, 4.99).some((i) => i.id === 'no-payers'), 'F01: verified revenue means there are payers');
  const test = money({ paidVerified: 0, unverified: 0, test: 2, testReasons: { sandbox: 1, trial: 1 } }).find((i) => i.id === 'pro-test');
  ok(test && test.level === 'info' && test.impact === 25 && test.evidence.includes('sandbox: 1') && test.evidence.includes('periodo de prueba: 1'), 'F01: sandbox/trial Pro is reported apart, as info');
  const inactive = money({ paidVerified: 1 }, 0, { proInactive: 2, proInactivePaid: 1, stages: { pro: 3 } }).find((i) => i.id === 'pro-inactive');
  ok(inactive?.detail.includes('pago verificado, sin verificar, prueba o regalo') && inactive.evidence.includes('de pago verificado: 1'), 'F01: inactive Pro says it is access, with the verified payers apart');
  ok(!one.some((i) => /\bPagan\b/.test(textOf(i))), 'F01: no finding says access means paying');
  // Synthetic fixture: an unverified membership's production charge is in gross revenue, never a payer. The copy
  // says exactly that (it no longer claims the money is out of "ingresos").
  const prod = buildInsights({ days: 30, now: NOW, overview: { subscriptions: { active: 1, paidVerified: 0, unverified: 1, unverifiedReasons: { unknown_environment: 1, no_charge: 0 } },
    revenue: { grossUsd: 4.99, unverifiedGrossUsd: 4.99, newPaying: 0 } }, growth: {}, integrations: {}, searchConsole: {} }).find((i) => i.id === 'payers-unverified')!;
  ok(!/fuera de pagadores, MRR e ingresos/.test(prod.detail) && prod.detail.includes('No cuentan como pagadores, nuevos pagadores ni MRR'), 'F01: the copy no longer claims the money is out of revenue');
  ok(prod.detail.includes('$4.99 en cobros de producción de cuentas que aún no son pagadores verificados (30d): están en Ingresos brutos, no en pagadores.')
    && prod.evidence.includes('cobros sin verificar 30d: $4.99'), 'F01: the unverified money is named, with where it is counted');
  const testMoney = buildInsights({ days: 30, now: NOW, overview: { subscriptions: { paidVerified: 0, unverified: 0, test: 1, testReasons: { sandbox: 0, trial: 1 } },
    revenue: { grossUsd: 4.99, unverifiedGrossUsd: 4.99 } }, growth: {}, integrations: {}, searchConsole: {} }).find((i) => i.id === 'pro-test')!;
  ok(!/no son ingresos/.test(testMoney.detail) && testMoney.detail.includes('están en Ingresos brutos, no en pagadores'), 'F01: a trial with a production charge is "not a payer", not "not revenue"');
}

// ---------------------------------------------------------------- F16 / F08: Apple's figures say when they are partial and that they include the team
{
  const apple = (appStore: Record<string, unknown>, includeInternal?: boolean) => buildInsights({ days: 30, now: NOW, includeInternal,
    overview: {}, growth: { acquisition: { visitors: 2 }, cohorts: { ios: { arrived: 1 } }, history: { ios: { installsInPeriod: 0 } } }, integrations: { appStore: { configured: true, ...appStore } }, searchConsole: {} });
  const partial = apple({ totals: { downloads: 6 }, byCountry: [{ country: 'MX', downloads: 5 }], partial: true, missingDays: Array.from({ length: 23 }, (_, k) => `2026-09-${String(k + 1).padStart(2, '0')}`), coveredFrom: '2026-09-24', coveredTo: '2026-10-01' });
  const byId = new Map(partial.map((i) => [i.id, i]));
  ok(byId.get('ios-gap')!.title.includes('Apple: 6 descargas (parcial: faltan 23 días); Bobby: 1 instalación iOS observada') && byId.get('ios-gap')!.evidence.some((e) => e.endsWith(': 6 (parcial)')), 'F16: ios-gap says the Apple count is partial');
  ok(byId.get('low-traffic')!.detail.includes('Apple reporta 6 descargas (parcial: faltan 23 días) en el mismo periodo'), 'F16: low-traffic too');
  ok(byId.get('appstore-country')!.title.endsWith('(parcial: faltan 23 días)'), 'F16: appstore-country too');
  ok(byId.get('ios-gap')!.detail.includes('Apple cuenta también las descargas del propio equipo') && byId.get('low-traffic')!.detail.includes('incluidas las del equipo')
    && byId.get('appstore-country')!.detail.includes('Incluye las descargas del equipo'), 'F08: without the team, every Apple figure says it includes the team');
  const full = new Map(apple({ totals: { downloads: 6 }, byCountry: [{ country: 'MX', downloads: 5 }] }, true).map((i) => [i.id, i]));
  ok(!textOf(full.get('ios-gap')!).includes('parcial') && !full.get('ios-gap')!.detail.includes('propio equipo') && !full.get('low-traffic')!.detail.includes('incluidas las del equipo'),
    'F16/F08: a complete load with the team included says neither');
}

// Reader-return windows start after a complete later day, not after a mature week.
// A recent cohort with no return cannot justify a weekly-retention warning.
{
  const returns = buildInsights({ days: 30, now: NOW, overview: {},
    growth: { cohorts: { ios: { oldestDays: 2, retention: { readersBack: { eligible: 5, returned: 1, read: 0 } } } } },
    integrations: {}, searchConsole: {} }).find((i) => i.id === 'readers-back');
  ok(returns?.level === 'info' && returns.title.includes('0 de 5') && !returns.title.includes('%'), 'five immature readers remain a provisional count');
  ok(returns?.detail.includes('no mide retención semanal madura') && returns.action.includes('siete días completos'), 'provisional reader returns state the incomplete observation window');
  const incomplete = buildInsights({ days: 30, now: NOW, overview: {},
    growth: { cohorts: { web: { retention: { readersBack: { eligible: 100 } } }, android: { retention: { readersBack: { eligible: 5, returned: 2, read: 1 } } } } },
    integrations: {}, searchConsole: {} }).find((i) => i.id === 'readers-back');
  ok(incomplete?.title.startsWith('1 de 5') && incomplete.sample === 5, 'missing return counts are excluded, while observed Android readers remain included');

  const truncated = buildInsights({ days: 30, now: NOW, overview: {},
    growth: { people: { accounts: 40, accountsNeverRead: 28 }, attention: { neverRead: Array.from({ length: 20 }, (_, i) => ({ identityId: `example-${i}` })) } },
    integrations: {}, searchConsole: {} }).find((i) => i.id === 'accounts-never-read');
  ok(truncated?.title.startsWith('28 de 40') && truncated.evidence.includes('sin lectura registrada: 28'), 'account attention uses the total, not the bounded example slice');
  ok(truncated?.detail.includes('no prueba que nunca hayan leído como invitadas'), 'missing account reads cannot prove no prior guest use');

  const pending = buildInsights({ days: 30, now: NOW, overview: {},
    growth: { cohorts: { ios: { arrived: 1 } }, history: { ios: { installsInPeriod: 0 } } },
    integrations: { appStore: { configured: true, totals: { downloads: 6 }, partial: true,
      missingDays: ['2026-09-01'], pendingDays: ['2026-09-02', '2026-09-03'] } }, searchConsole: {} }).find((i) => i.id === 'ios-gap');
  ok(pending?.title.includes('faltan 3 días'), 'Apple unpublished days count alongside unloaded days');

  const included = buildInsights({ days: 30, now: NOW, includeInternal: true, overview: {},
    growth: { outcomes: { consumedTotal: 10, consumedInternal: 8 } }, integrations: {}, searchConsole: {} }).find((i) => i.id === 'internal-share');
  ok(included?.detail.includes('Esta vista las incluye.') && !included.detail.includes('Ya están fuera'), 'internal traffic is interpreted according to the selected scope');
}

// ---------------------------------------------------------------- network rule reports accounts too
{
  const nets = (networks: unknown[]) => buildInsights({ days: 30, now: NOW, overview: {}, growth: {}, integrations: {}, searchConsole: {}, networks }).filter((i) => i.id.startsWith('network-'));
  const acc = nets([{ network: 'netprefix0', installs: 1, onlyByNetwork: 0, accountsOnlyByNetwork: 1 }]);
  eq(acc.map((i) => i.id), ['network-netprefix0'], 'F05: one account kept out only by a team network raises the finding');
  ok(acc[0].evidence.includes('cuentas solo por la red: 1') && acc[0].evidence.includes('instalaciones solo por la red: 0') && acc[0].title.includes('1 cuenta'), 'F05: the finding names both counts');
  eq(nets([{ network: 'netprefix1', installs: 2, onlyByNetwork: 2, accountsOnlyByNetwork: 0 }]).length, 0, 'F05: 2 installs and no account stay below the threshold');
  eq(nets([{ network: 'netprefix2', installs: 3, onlyByNetwork: 3 }]).length, 1, 'F05: 3 installs only by the network (older server without accounts) still fire');
}

// ---------------------------------------------------------------- F03: the digest and the email result
eq([isoWeek(Date.parse('2026-10-02T23:59:00Z')), isoWeek(Date.parse('2026-12-31T12:00:00Z')), isoWeek(Date.parse('2027-01-01T00:00:00Z')),
  isoWeek(Date.parse('2024-12-30T00:00:00Z')), isoWeek(Date.parse('2026-09-28T00:00:00Z')), isoWeek(Date.parse('2026-10-04T23:59:59Z'))],
['2026-W40', '2026-W53', '2026-W53', '2025-W01', '2026-W40', '2026-W40'], 'isoWeek: UTC ISO-8601 weeks');

fixture = {
  overview: {
    days: ['2026-09-26', '2026-10-02'], accounts: { new: 2 }, activity: { reads: 9 },
    subscriptions: { active: 1, paid: 0, paidVerified: 0, unverified: 1, unverifiedReasons: { unknown_environment: 1, no_charge: 0 }, test: 0, testReasons: { sandbox: 0, trial: 0 } },
    revenue: { grossUsd: 0 },
    llm: { providers: { openai: { lastCreditAlert: '2026-10-02T06:00:00Z', creditAlert: { code: 'insufficient_quota', endpoint: 'desk' }, lastOk: '2026-10-01T06:00:00Z' } } },
  },
  growth: { people: { active7d: 5, readers7d: 3, accounts: 2 }, acquisition: { visitors: 40, visits: 50, visitsWithUtm: 5 }, cohorts: {}, outcomes: {}, attention: {}, coverage: {} },
  networks: [{ network: 'netprefix0', installs: 1, onlyByNetwork: 0, accountsOnlyByNetwork: 1 }],
};
const TUESDAY = Date.parse('2026-09-29T08:00:00Z'), MONDAY = Date.parse('2026-10-05T08:00:00Z'), NEXT_MONDAY = Date.parse('2026-10-12T08:00:00Z');
{
  const d = await buildDigest(TUESDAY);
  ok(d.fresh.some((i) => i.id === 'network-netprefix0') && d.text.includes('Una red del equipo deja fuera 1 cuenta'), 'F03: the network finding of the panel reaches the digest');
  ok(d.text.includes('pagando Pro (verificado): 0 · Pro sin verificar: 1'), 'F01: the digest KPI line counts verified payers and unverified Pro apart');
  ok(d.fresh.some((i) => i.id === 'payers-unverified') && d.text.includes('No repito un mismo hallazgo en la misma semana (lunes a domingo, UTC).'), 'F01/F03: unverified Pro is a digest finding; the footer states the week rule');
  ok(!/entregad|delivered/i.test(d.text), 'F03: the email never claims delivery');
  eq([d.isoWeek, d.weekly], ['2026-W40', false], 'a Tuesday is not the weekly summary');

  // Resend refuses: nothing is marked, the claims are released, the next run finds the same findings fresh.
  process.env.RESEND_API_KEY = 'test-resend';
  process.env.BOBBY_ALERT_EMAIL = 'owner@bobby.test';
  store.clear(); calls = [];
  resend = () => json({ statusCode: 403, message: 'domain not verified' }, 403);
  const refused = await runDigest(TUESDAY);
  eq([refused.sent, refused.accepted, refused.emailId, refused.error], [false, false, null, 'resend_403'], 'F03: Resend 403 ⇒ not accepted');
  eq(resendPosts().length, 1, 'F03: the refused email was attempted once');
  eq(digestKeys(), [], 'F03: a refused email leaves no dedup row');
  ok(calls.some((c) => c.method === 'DELETE' && c.url.includes('admin-digest%3A2026-W40%3A')), 'F03: the claimed keys were released');
  ok(!calls.some((c) => c.method === 'POST' && c.url.includes('/rest/v1/api_cache') && c.body?.payload?.state === 'sent'), 'F03: nothing written as sent');
  const again = await buildDigest(TUESDAY);
  eq(again.fresh.map((i) => i.id), d.fresh.map((i) => i.id), 'F03: the next run finds the same findings fresh');

  // No recipient configured: not accepted, nothing marked, no request to Resend.
  delete process.env.BOBBY_ALERT_EMAIL;
  calls = [];
  const unconfigured = await runDigest(TUESDAY);
  eq([unconfigured.accepted, unconfigured.error, resendPosts().length, digestKeys()], [false, 'not_configured', 0, []], 'F03: no recipient ⇒ not accepted, nothing marked');
  process.env.BOBBY_ALERT_EMAIL = 'owner@bobby.test';

  // Accepted: every reported finding is marked sent for this ISO week, with Resend's id; the next run sends nothing.
  calls = [];
  resend = () => json({ id: 'email-1' });
  const accepted = await runDigest(TUESDAY);
  eq([accepted.sent, accepted.accepted, accepted.emailId, accepted.error, accepted.fresh], [true, true, 'email-1', null, d.fresh.length], 'F03: accepted ⇒ sent with its id');
  eq(digestKeys().length, d.fresh.length, 'F03: one dedup row per reported finding');
  ok(digestKeys().every((k) => /^admin-digest:2026-W40:[0-9a-f]{16}$/.test(k) && (store.get(k)!.payload as { state: string; emailId: string }).state === 'sent'), 'F03: keys carry the ISO week and a hash, never finding text');
  ok(resendPosts()[0].body.text.includes('Una red del equipo') && resendPosts()[0].body.to[0] === 'owner@bobby.test', 'F03: the sent text is the claimed findings');
  calls = [];
  const quiet = await runDigest(TUESDAY + 3_600_000);
  eq([quiet.sent, quiet.fresh, resendPosts().length], [false, 0, 0], 'F03: the same week sends nothing twice');

  // "Send now" from the panel: sends, reports acceptance, marks nothing.
  store.clear(); calls = [];
  const manual = await sendDigestNow(TUESDAY);
  eq([manual.accepted, manual.emailId, resendPosts().length, digestKeys()], [true, 'email-1', 1, []], 'F03: send-now reports acceptance and writes no dedup');

  // Two concurrent cron runs: exactly one email.
  store.clear(); calls = [];
  resend = async () => { await sleep(20); return json({ id: 'email-2' }); };
  const both = await Promise.all([runDigest(TUESDAY), runDigest(TUESDAY)]);
  eq(resendPosts().length, 1, 'F03: two concurrent runs ⇒ exactly one POST to Resend');
  eq(both.map((r) => r.sent).sort(), [false, true], 'F03: one run sent, the other found everything claimed');
  for (let round = 0; round < 5; round++) {
    store.clear(); calls = [];
    await Promise.all([runDigest(TUESDAY), runDigest(TUESDAY), runDigest(TUESDAY)]);
    eq(resendPosts().length, 1, `F03: three concurrent runs ⇒ one email (round ${round + 1})`);
  }

  // Monday: the weekly summary once per ISO week.
  store.clear(); calls = [];
  resend = () => json({ id: 'weekly-1' });
  const monday = await runDigest(MONDAY);
  eq([monday.sent, monday.weekly], [true, true], 'F03: Monday sends the weekly summary');
  ok(store.has('admin-digest:2026-W41:weekly') && resendPosts()[0].body.subject.startsWith('Bobby:'), 'F03: the weekly key of that ISO week is marked');
  calls = [];
  const mondayAgain = await runDigest(MONDAY + 3_600_000);
  eq([mondayAgain.sent, mondayAgain.weekly, resendPosts().length], [false, false, 0], 'F03: a second Monday run sends no second weekly summary');
  const nextWeek = await runDigest(NEXT_MONDAY);
  eq([nextWeek.sent, nextWeek.weekly, isoWeek(NEXT_MONDAY)], [true, true, '2026-W42'], 'F03: the next ISO week sends its own summary');

  // A claim that cannot be made (storage down) sends nothing rather than risk repeats.
  store.clear(); calls = []; claimDown = true;
  const down = await runDigest(TUESDAY);
  eq([down.sent, resendPosts().length], [false, 0], 'F03: without an atomic claim the cron does not send');
  claimDown = false;
}

// ADM-8: missing growth cannot send a weekly all-clear or hide independent provider failures.
{
  store.clear(); calls = [];
  growthUnavailable = true; pruneUnavailable = true;
  const preview = await buildDigest(MONDAY);
  ok(preview.subject.includes('diagnóstico parcial') && preview.text.includes('no se pudieron consultar growth'), 'ADM-8: preview declares partial diagnosis');
  ok(preview.fresh.some((i) => i.id === 'credit-openai'), 'ADM-8: independently verified operational failures remain actionable');
  eq(preview.weekly, false, 'ADM-8: missing growth does not claim the full weekly summary');
  resend = () => json({ id: 'partial-1' });
  const partial = await runDigest(MONDAY);
  eq([partial.sent, partial.weekly], [true, false], 'ADM-8: partial urgent findings can be sent without an all-clear');
  ok(!store.has('admin-digest:2026-W41:weekly'), 'ADM-8: missing growth leaves the weekly summary key retryable');
  ok(calls.some((c) => c.url.endsWith('/rpc/bobby_prune_client_telemetry')) && calls.some((c) => c.url.includes('/rpc/bobby_admin_growth')), 'retention runs independently of growth availability');
  growthUnavailable = false; pruneUnavailable = false;
  const complete = await runDigest(MONDAY + 3_600_000);
  eq([complete.sent, complete.weekly], [true, true], 'ADM-8: restored growth can still send the complete weekly summary');
  store.clear(); calls = [];
}

// ---------------------------------------------------------------- the email helper and the credit alert fact
{
  calls = [];
  resend = () => { throw new TypeError('fetch failed'); };
  eq(await notifyOwner('s', 't'), { accepted: false, error: 'network' }, 'notifyOwner resolves (never rejects) with the network error');
  resend = () => { throw new DOMException('timed out', 'TimeoutError'); };
  eq(await notifyOwner('s', 't'), { accepted: false, error: 'timeout' }, 'a timeout is reported as such');
  resend = () => json({ id: 'email-9' });
  eq(await notifyOwner('s', 't'), { accepted: true, id: 'email-9' }, 'accepted carries Resend\'s id');

  // No recipient: the dashboard still learns the provider ran out of credit, with the email outcome.
  delete process.env.RESEND_API_KEY; delete process.env.BOBBY_ALERT_EMAIL;
  store.clear(); calls = []; resetProviderAlerts();
  alertProviderCredit('openai', 'insufficient_quota', 'desk');
  await until(() => Boolean((store.get('provider-credit-alert:openai')?.payload as { email?: unknown } | undefined)?.email), 'F03: the alert fact is written without a recipient');
  const fact = store.get('provider-credit-alert:openai')!.payload as Record<string, any>;
  eq([fact.code, fact.endpoint, fact.email], ['insufficient_quota', 'desk', { accepted: false, error: 'not_configured' }], 'F03: …with email.accepted false (not_configured)');
  eq(resendPosts().length, 0, 'F03: no email attempted without a recipient');
  ok(calls.some((c) => c.url.endsWith('/rpc/bobby_cache_claim') && c.body.p_key === 'provider-credit-alert:openai' && c.body.p_ttl_seconds === 6 * 3600), 'the alert window is claimed atomically (6 h)');

  // Another instance already holds the window: no second email.
  process.env.RESEND_API_KEY = 'test-resend'; process.env.BOBBY_ALERT_EMAIL = 'owner@bobby.test';
  calls = []; resetProviderAlerts();
  alertProviderCredit('openai', 'insufficient_quota', 'tts');
  await until(() => calls.some((c) => c.url.endsWith('/rpc/bobby_cache_claim')), 'the second alert tries the claim');
  await sleep(20);
  eq([resendPosts().length, (store.get('provider-credit-alert:openai')!.payload as Record<string, unknown>).endpoint], [0, 'desk'], 'a held window sends nothing and keeps the first fact');

  store.clear(); calls = []; resetProviderAlerts();
  resend = () => json({ id: 'alert-1' });
  alertProviderCredit('anthropic', 'billing_hard_limit_reached', 'desk');
  await until(() => Boolean((store.get('provider-credit-alert:anthropic')?.payload as { email?: unknown } | undefined)?.email), 'the accepted alert is recorded');
  eq([(store.get('provider-credit-alert:anthropic')!.payload as Record<string, unknown>).email, resendPosts().length], [{ accepted: true, id: 'alert-1' }, 1], 'an accepted alert carries Resend\'s id');

  store.clear(); calls = []; resetProviderAlerts();
  resend = () => json({ message: 'forbidden' }, 403);
  alertProviderCredit('anthropic', 'billing_hard_limit_reached', 'desk');
  await until(() => Boolean((store.get('provider-credit-alert:anthropic')?.payload as { email?: unknown } | undefined)?.email), 'the refused alert is recorded');
  eq((store.get('provider-credit-alert:anthropic')!.payload as Record<string, unknown>).email, { accepted: false, error: 'resend_403' }, 'F03: a refused alert email is recorded as not accepted');
  resetProviderAlerts();
}

// ---------------------------------------------------------------- F15: the plan
{
  const finding = (id: string, title: string, evidence: string[], detail = '', action = '') =>
    ({ id, level: 'critical' as const, area: 'adquisicion' as const, tab: 'funnel' as const, impact: 90, sample: null, title, detail, action, evidence });
  const insights = [
    finding('low-traffic', 'Solo 3 visitantes web externos en 30 días', ['visitantes web externos: 3', 'personas activas 7d: 6'], 'Con tan pocas personas cualquier tasa es ruido.', 'Prioriza traer tráfico con enlaces UTM.'),
    finding('ios-gap', 'Apple reporta 15 descargas; Bobby solo vio 4 instalaciones iOS', ['instalaciones iOS vistas: 4'], 'De esas descargas faltan 73%.', 'Libera iOS 1.5.'),
  ];
  let modelCalls = 0;
  let model: () => unknown = () => ({ summary: '', priorities: [] });
  let modelDelay = 0;
  let lastSystem = '';
  anthropic = async () => {
    modelCalls++;
    if (modelDelay) await sleep(modelDelay);
    return json({ stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify(model()) }], usage: { input_tokens: 1000, output_tokens: 200 } });
  };
  const p = (title: string, why: string, findings: string[]) => ({ title, why, steps: ['Publica enlaces con UTM'], measure: 'visitantes en 7 días', findings });

  store.clear(); calls = [];
  model = () => ({
    summary: 'Hoy llegan 3 visitantes y Apple reporta 15 descargas.',
    priorities: [
      p('Traer gente: solo 3 visitantes en 30 días', 'Con 3 visitantes no hay embudo que medir; 7 días para probar.', ['low-traffic']),
      p('Cerrar la fuga de iOS', 'Apple reporta 15 descargas y solo 4 instalaciones.', ['ios-gap', 'invented-id']),
      p('Subir a 500 visitantes', 'Meta de 500 visitantes semanales.', ['low-traffic']),
    ],
  });
  const plan = await growthPlan(insights, { days: 30 }, false);
  eq(plan.priorities.map((x) => x.title), ['Traer gente: solo 3 visitantes en 30 días'], 'F15: an invented id drops its whole priority; a number not in the cited findings drops it too');
  eq([plan.cached, modelCalls, plan.summary], [false, 1, 'Hoy llegan 3 visitantes y Apple reporta 15 descargas.'], 'F15: one model call; a summary with input figures is kept');
  ok(!store.has('admin-plan:lock') && calls.some((c) => c.method === 'DELETE' && c.url.includes('admin-plan%3Alock')), 'F15: the lock is released after a success');
  ok(calls.some((c) => c.url.endsWith('/rpc/bobby_cache_claim') && c.body.p_key === 'admin-plan:lock' && c.body.p_ttl_seconds === 120), 'F15: the generation claims the plan lock (120 s)');

  // A figure from a finding the priority does not cite is not evidence for it.
  model = () => ({ summary: 'Hay 999 usuarios.', priorities: [p('Traer gente', 'Apple reporta 15 descargas.', ['low-traffic']), p('iOS primero', 'Apple reporta 15 descargas y Bobby vio 4.', ['ios-gap'])] });
  const foreign = await growthPlan(insights, { days: 30 }, true);
  eq([foreign.priorities.map((x) => x.title), foreign.summary], [['iOS primero'], ''], 'F15: a number only in an uncited finding drops the priority; an invented summary figure is left out');

  model = () => ({ summary: '', priorities: [
    { ...p('Traer gente', 'Solo 3 visitantes.', ['low-traffic']), steps: ['Hay 999 clientes que contactar.'] },
    { ...p('Traer gente', 'Solo 3 visitantes.', ['low-traffic']), measure: 'La conversión actual es 88%.' },
  ] });
  const unsupportedActions = await growthPlan(insights, { days: 30 }, true);
  eq(unsupportedActions.priorities, [], 'F15: unsupported figures in steps and measurement are withheld too');

  // Cached: no model call and no lock.
  calls = []; const before = modelCalls;
  const hit = await growthPlan(insights, { days: 30 }, false);
  eq([hit.cached, modelCalls - before, calls.some((c) => c.url.endsWith('/rpc/bobby_cache_claim'))], [true, 0, false], 'F15: a cache hit returns without the model or the lock');

  // Lock held by another generation: 409, even when forced; the model is not called.
  store.set('admin-plan:lock', { payload: { at: 'x' }, expires: Date.now() + 60_000 });
  const held = await growthPlan(insights, { days: 30 }, true).then(() => null, (e) => e);
  ok(held instanceof AdminError && held.status === 409 && held.message === 'A plan is already being generated. Try again in a minute.', 'F15: a held lock ⇒ 409, even with force');
  eq(modelCalls - before, 0, 'F15: …and no model call');
  ok(store.has('admin-plan:lock'), 'F15: a refused generation does not release someone else\'s lock');
  store.delete('admin-plan:lock');

  claimDown = true;
  const unavailable = await growthPlan(insights, { days: 7 }, false).then(() => null, (e) => e);
  ok(unavailable instanceof AdminError && unavailable.status === 503 && unavailable.message === 'The plan lock is unavailable. Try again.', 'F15: no lock storage ⇒ 503, no generation');
  claimDown = false;

  // Two presses at once: one model call, the other is refused.
  store.clear(); calls = []; modelDelay = 30;
  model = () => ({ summary: '', priorities: [p('Traer gente', 'Solo 3 visitantes.', ['low-traffic'])] });
  const callsBefore = modelCalls;
  const race = await Promise.allSettled([growthPlan(insights, { days: 30 }, false), growthPlan(insights, { days: 30 }, false)]);
  eq([modelCalls - callsBefore, race.map((r) => r.status).sort()], [1, ['fulfilled', 'rejected']], 'F15: concurrent generation ⇒ one model call');
  const refused = race.find((r) => r.status === 'rejected') as PromiseRejectedResult;
  ok(refused.reason instanceof AdminError && refused.reason.status === 409, 'F15: the second press gets 409');
  modelDelay = 0;

  // A failed generation releases the lock too.
  store.clear(); calls = [];
  anthropic = () => json({ type: 'error', error: { type: 'invalid_request_error', message: 'bad' } }, 400);
  const failed = await growthPlan(insights, { days: 30 }, true).then(() => null, (e) => e);
  ok(failed instanceof Error && !store.has('admin-plan:lock') && calls.some((c) => c.method === 'DELETE' && c.url.includes('admin-plan%3Alock')), 'F15: the lock is released after a failure');

  anthropic = async (c) => {
    modelCalls++;
    lastSystem = String(c.body?.system ?? '');
    if (modelDelay) await sleep(modelDelay);
    return json({ stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify(model()) }], usage: { input_tokens: 1000, output_tokens: 200 } });
  };
  // 7 and the period length are free only as a span of days; as any other figure they must be in the cited findings.
  const utm = finding('utm-missing', 'Ninguna visita trae etiqueta de campaña (utm_source)', ['visitas: 12', 'con UTM: 0'], '12 visitas web externas en 30d y 0 con utm_source.');
  store.clear(); calls = [];
  model = () => ({ summary: 'Faltan 45 cuentas.', priorities: [
    p('7 lectores no vuelven', 'Revisa el canal.', ['utm-missing']),
    p('Medir canales', 'Hay 45 cuentas Pro sin usar.', ['utm-missing']),
    p('Etiquetar cada post en 7 días', 'Con 0 visitas con UTM en 45d no se sabe qué canal trae gente; mide en 7 días.', ['utm-missing']),
  ] });
  const units = await growthPlan([...insights, utm], { days: 45 }, true);
  eq([units.priorities.map((x) => x.title), units.summary], [['Etiquetar cada post en 7 días'], ''],
    'F15: "7 lectores" and "45 cuentas" (45 = the period) are invented figures (dropped); "7 días" / "45d" are spans of days (kept); the summary\'s "45 cuentas" is left out');

  // The lock carries a nonce and is released only while it still holds that nonce.
  store.clear(); calls = []; modelDelay = 40;
  model = () => ({ summary: '', priorities: [p('Traer gente', 'Solo 3 visitantes.', ['low-traffic'])] });
  const slow = growthPlan(insights, { days: 30 }, true);
  await until(() => store.has('admin-plan:lock'), 'F15: the lock is held while the model runs');
  const mine = (store.get('admin-plan:lock')!.payload as { nonce?: string }).nonce;
  ok(typeof mine === 'string' && mine.length >= 16, 'F15: the lock carries a random nonce');
  // The claim expires and someone else takes the lock before the slow generation ends.
  store.set('admin-plan:lock', { payload: { at: 'other', nonce: 'someone-else' }, expires: Date.now() + 60_000 });
  await slow;
  ok(store.has('admin-plan:lock') && (store.get('admin-plan:lock')!.payload as { nonce?: string }).nonce === 'someone-else', 'F15: the former holder does not release the new holder\'s lock');
  ok(calls.some((c) => c.method === 'DELETE' && decodeURIComponent(c.url).includes(`payload->>nonce=eq.${mine}`)), 'F15: the release is conditional on its own nonce');
  modelDelay = 0; store.clear();

  // The caller's deadline: too little time left ⇒ no model call, the lock is released, a clear 503.
  calls = []; const beforeDeadline = modelCalls;
  const late = await growthPlan(insights, { days: 30 }, true, { deadline: Date.now() + 5_000 }).then(() => null, (e) => e);
  ok(late instanceof AdminError && late.status === 503 && late.message === 'There is not enough time left to write the plan. Try again.', 'F16: too close to the deadline ⇒ 503');
  eq([modelCalls - beforeDeadline, store.has('admin-plan:lock')], [0, false], 'F16: no model call and the lock is released');
  // The ledger row is written right after the model answered, before the lock is released.
  calls = [];
  await growthPlan(insights, { days: 30 }, true, { deadline: Date.now() + 40_000 });
  const ledgerAt = calls.findIndex((c) => c.method === 'POST' && c.url.endsWith('/rest/v1/bobby_llm_usage'));
  const releaseAt = calls.findIndex((c) => c.method === 'DELETE' && c.url.includes('admin-plan%3Alock'));
  ok(ledgerAt >= 0 && releaseAt > ledgerAt, 'F16: the spend reaches the ledger before the lock is released');
  eq(calls.find((c) => c.url.endsWith('/rest/v1/bobby_llm_usage'))?.body?.[0]?.surface, 'admin', 'F16: …as surface admin');

  // F10: what the model is told about the team follows the mark.
  await growthPlan(insights, { days: 30 }, true, { team: 'unverified' });
  ok(lastSystem.includes('no se pudo marcar el navegador del dueño') && !lastSystem.includes('con datos reales, sin el tráfico del equipo.'), 'F10: an unverified exclusion is not stated as a fact');
  await growthPlan(insights, { days: 30 }, true, { team: 'excluded' });
  ok(lastSystem.includes('con datos reales, sin el tráfico del equipo.'), 'F10: a verified one is');
  await growthPlan(insights, { days: 30 }, true, { team: 'included' });
  ok(lastSystem.includes('incluyendo el tráfico del propio equipo'), 'F10: and the team included is said as such');
}

console.log(`admin-r2-insights: ${checks} checks passed`);
