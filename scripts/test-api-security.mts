import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import type { VercelRequest, VercelResponse } from '@vercel/node';

function responseRecorder() {
  const state: { status?: number; body?: any; headers: Record<string, string> } = { headers: {} };
  const response = {
    status(code: number) {
      state.status = code;
      return response;
    },
    json(body: unknown) {
      state.body = body;
      return response;
    },
    setHeader(name: string, value: string | number) {
      state.headers[name.toLowerCase()] = String(value);
      return response;
    },
  } as unknown as VercelResponse;
  return { response, state };
}

function request(body: Record<string, unknown>, headers: Record<string, string> = {}): VercelRequest {
  return {
    method: 'POST',
    body,
    headers: { 'x-forwarded-for': '203.0.113.10', ...headers },
    query: {},
  } as unknown as VercelRequest;
}

const originalFetch = globalThis.fetch;
const previousEnv = {
  internal: process.env.INTERNAL_API_SECRET,
  cycle: process.env.BOBBY_CYCLE_SECRET,
  cron: process.env.CRON_SECRET,
  trading: process.env.TRADING_API_SECRET,
  freeze: process.env.PROTOCOL_CUTOVER_FREEZE,
  liveKey: process.env.OKX_CEX_API_KEY,
  liveSecret: process.env.OKX_CEX_SECRET_KEY,
  livePassphrase: process.env.OKX_CEX_PASSPHRASE,
};

try {
  process.env.INTERNAL_API_SECRET = 'test-internal-secret';
  process.env.TRADING_API_SECRET = 'test-trading-secret';
  process.env.PROTOCOL_CUTOVER_FREEZE = 'true';
  delete process.env.BOBBY_CYCLE_SECRET;
  delete process.env.CRON_SECRET;
  process.env.OKX_CEX_API_KEY = 'server-api-key';
  process.env.OKX_CEX_SECRET_KEY = 'server-secret-key';
  process.env.OKX_CEX_PASSPHRASE = 'server-passphrase';

  const [{ default: walletHandler }, { default: perpsHandler }, { default: telegramDeliverHandler }, { default: onchainSignalHandler }] = await Promise.all([
    import('../api/bobby-wallet.js'),
    import('../api/okx-perps.js'),
    import('../api/telegram-deliver.js'),
    import('../api/onchainos-signal.js'),
  ]);

  let fetchCalls = 0;
  let observedAccessKey = '';
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const inputUrl = String(input);
    const dbUrl = process.env.BOBBY_SUPABASE_URL || process.env.SUPABASE_URL || '';
    const isRateLimitCall = Boolean(dbUrl && inputUrl.startsWith(`${dbUrl.replace(/\/+$/, '')}/rest/v1/api_cache`));
    if (!isRateLimitCall) fetchCalls += 1;
    const headers = init?.headers as Record<string, string> | undefined;
    if (!isRateLimitCall) observedAccessKey = headers?.['OK-ACCESS-KEY'] || '';
    return new Response(JSON.stringify({
      code: '0',
      data: [{ totalEq: '100', availBal: '90', details: [] }],
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;

  {
    const { response, state } = responseRecorder();
    await walletHandler(request({ action: 'balance' }), response);
    assert.equal(state.status, 401, 'wallet proxy must reject unauthenticated callers');
    assert.equal(fetchCalls, 0, 'rejected wallet calls must not reach the upstream service');
  }

  {
    const { response, state } = responseRecorder();
    await walletHandler(
      request({ action: 'send' }, { 'x-internal-secret': 'test-internal-secret' }),
      response,
    );
    assert.equal(state.status, 400, 'wallet send must not exist in the proxy allowlist');
    assert.equal(fetchCalls, 0, 'blocked wallet mutations must not reach the upstream service');
  }

  {
    const { response, state } = responseRecorder();
    await perpsHandler(request({ action: 'balance', params: { mode: 'live' } }), response);
    assert.equal(state.status, 410, 'server OKX account rail must be retired');
    assert.equal(fetchCalls, 0, 'retired OKX account reads must not call OKX');
  }

  {
    const { response, state } = responseRecorder();
    await perpsHandler(
      request(
        { action: 'open_position', params: { mode: 'live', symbol: 'BTC' } },
        { 'x-internal-secret': 'test-trading-secret' },
      ),
      response,
    );
    assert.equal(state.status, 410, 'retired OKX rail must reject even authenticated live mutations');
    assert.equal(fetchCalls, 0, 'retired live mutations must not call OKX');
  }

  {
    const { response, state } = responseRecorder();
    await perpsHandler(request({
      action: 'balance',
      credentials: {
        apiKey: 'user-api-key',
        secret: 'user-secret-key',
        passphrase: 'user-passphrase',
      },
      params: { mode: 'live' },
    }), response);
    assert.equal(state.status, 410, 'user credentials cannot reactivate the retired OKX rail');
    assert.equal(observedAccessKey, '', 'retired rail must not inspect or forward user credentials');
    assert.equal(fetchCalls, 0);
  }

  {
    const { response, state } = responseRecorder();
    await telegramDeliverHandler(request({ thread_id: 'untrusted-thread' }), response);
    assert.equal(state.status, 401, 'Telegram delivery must fail closed without internal auth');
    assert.equal(fetchCalls, 0, 'rejected Telegram delivery must not call Supabase or Telegram');
  }

  {
    const { response, state } = responseRecorder();
    await onchainSignalHandler(request({
      walletAddress: '0x0000000000000000000000000000000000000001',
      marketSlug: 'btc',
      score: 100,
      direction: 'YES',
      outcomePrice: 0.5,
      positionDelta: 1,
    }), response);
    assert.equal(state.status, 401, 'live-capable signal processing must require internal auth');
    assert.equal(fetchCalls, 0, 'rejected signals must not reach execution dependencies');
  }

  const [
    orchestrateSource,
    registerSource,
    controlPlaneSource,
    forumRegisterSource,
    voiceAssetsSource,
    executorSource,
    securityWorkflowSource,
    activitySource,
    agentSetupSource,
    protocolStatsSource,
    userCycleSource,
    okxSignalSource,
    explainSource,
    bobbyCycleSource,
    adminAdvocatesSource,
    polymarketSource,
    analyzePanelSource,
    detectIntentSource,
    blogServiceSource,
  ] = await Promise.all([
    readFile(new URL('../api/orchestrate.ts', import.meta.url), 'utf8'),
    readFile(new URL('../api/agents/register.ts', import.meta.url), 'utf8'),
    readFile(new URL('../api/_lib/hardness-control-plane.ts', import.meta.url), 'utf8'),
    readFile(new URL('../api/forum-agent-register.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/lib/voice-assets.ts', import.meta.url), 'utf8'),
    readFile(new URL('../services/executor/index.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../.github/workflows/security.yml', import.meta.url), 'utf8'),
    readFile(new URL('../api/activity.ts', import.meta.url), 'utf8'),
    readFile(new URL('../api/agent-setup.ts', import.meta.url), 'utf8'),
    readFile(new URL('../api/bobby-protocol-stats.ts', import.meta.url), 'utf8'),
    readFile(new URL('../api/user-cycle.ts', import.meta.url), 'utf8'),
    readFile(new URL('../api/okx-signal.ts', import.meta.url), 'utf8'),
    readFile(new URL('../api/explain.ts', import.meta.url), 'utf8'),
    readFile(new URL('../api/bobby-cycle.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/pages/admin/AdminAdvocates.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/services/polymarket.service.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/agent-radar/AnalyzePanel.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/lib/router/detectIntent.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/services/blog.service.ts', import.meta.url), 'utf8'),
  ]);
  assert.match(orchestrateSource, /const commitOnchain = internalRequest &&/, 'public orchestration must not spend recorder gas');
  assert.match(orchestrateSource, /body as unknown as Record<string, unknown>/, 'orchestration signatures must cover the full request');
  assert.match(registerSource, /existing\?\.owner_address \|\| body\.owner/, 'existing agent ownership must not be replaceable by a new signer');
  assert.doesNotMatch(controlPlaneSource, /VITE_SUPABASE_ANON_KEY/, 'control-plane mutations must not fall back to the browser anon key');
  assert.match(forumRegisterSource, /scrypt\(apiKey, pepperedSalt, 32,/, 'forum API keys must use a salted, peppered password KDF');
  assert.doesNotMatch(voiceAssetsSource, /USDT\?\|USDC\|PERP\|SWAP/, 'asset normalization must not use the vulnerable suffix regex');
  assert.match(executorSource, /Object\.hasOwn\(ACTIONS, action\)/, 'executor actions must use own-property allowlisting');
  assert.match(executorSource, /console\.error\('\[executor\] action failed:', action, message\)/, 'executor logs must use a constant format string');
  assert.match(securityWorkflowSource, /build-mode: none/, 'CodeQL must scan source without generating untracked bundles');
  assert.match(securityWorkflowSource, /paths-ignore:[\s\S]*- dist\/\*\*/, 'CodeQL must ignore generated distribution assets');
  assert.doesNotMatch(activitySource, /x-forwarded-host/, 'activity self-fetches must not trust forwarded hosts');
  assert.match(activitySource, /BOBBY_PROTOCOL_BASE_URL.*protocol-heartbeat/, 'activity self-fetches must use the fixed Bobby origin');
  assert.match(agentSetupSource, /BOBBY_PROTOCOL_BASE_URL.*api\/user-cycle/, 'agent setup must use the fixed Bobby origin');
  assert.match(protocolStatsSource, /getPricesFromIntel\(BOBBY_PROTOCOL_BASE_URL\)/, 'protocol stats must use a fixed intelligence origin');
  assert.doesNotMatch(userCycleSource, /req\.headers\.host/, 'user cycle intelligence must not trust the request host');
  assert.match(userCycleSource, /BOBBY_PROTOCOL_BASE_URL.*api\/bobby-intel/, 'user cycle intelligence must use allowlisted origins');
  assert.match(okxSignalSource, /console\.error\('\[OKX Signal\] Chain request failed:', chainIndex, msg\)/, 'OKX signal logs must use a constant format string');
  assert.match(explainSource, /switch \(context\)/, 'explain prompts must use explicit context dispatch');
  assert.doesNotMatch(explainSource, /promptBuilders\s*\[/, 'user input must not select an object method dynamically');
  assert.match(bobbyCycleSource, /extractBoundedSection\(contextBlock/, 'cycle context extraction must use bounded string operations');
  assert.match(bobbyCycleSource, /extractPrefixedLine\(cioPost, 'VERDICT:', 4_000\)/, 'yield verdict JSON must use bounded line extraction');
  assert.doesNotMatch(bobbyCycleSource, /cioPost\.match\(\/VERDICT:/, 'cycle verdicts must not use polynomial regex parsing');
  assert.doesNotMatch(bobbyCycleSource, /\.match\(\/VIBE_PHRASE:/, 'cycle vibe extraction must not use polynomial regex parsing');
  assert.equal(bobbyCycleSource.includes('cioPost.match(/(\\d+)\\s*\\/\\s*10/)'), false, 'cycle conviction must not use a polynomial regex fallback');
  assert.match(adminAdvocatesSource, /allowedHosts\.has\(parsed\.hostname\.toLowerCase\(\)\)/, 'profile URLs must use exact host allowlisting');
  assert.match(polymarketSource, /\['polymarket\.com', 'www\.polymarket\.com'\]\.includes\(u\.hostname\.toLowerCase\(\)\)/, 'Polymarket URLs must use an exact HTTPS host allowlist');
  assert.match(analyzePanelSource, /encodeURIComponent\(/, 'market slugs must be encoded before reaching a DOM URL sink');
  assert.match(detectIntentSource, /const escapedKey = key\.replace/, 'dynamic regular-expression keys must be fully escaped');
  assert.match(blogServiceSource, /new DOMParser\(\)\.parseFromString/, 'blog excerpts must use an HTML parser instead of incomplete regex sanitization');

  console.log('api-security: 47/47 checks passed');
} finally {
  globalThis.fetch = originalFetch;
  const restore = (name: string, value: string | undefined) => {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  };
  restore('INTERNAL_API_SECRET', previousEnv.internal);
  restore('BOBBY_CYCLE_SECRET', previousEnv.cycle);
  restore('CRON_SECRET', previousEnv.cron);
  restore('TRADING_API_SECRET', previousEnv.trading);
  restore('PROTOCOL_CUTOVER_FREEZE', previousEnv.freeze);
  restore('OKX_CEX_API_KEY', previousEnv.liveKey);
  restore('OKX_CEX_SECRET_KEY', previousEnv.liveSecret);
  restore('OKX_CEX_PASSPHRASE', previousEnv.livePassphrase);
}
