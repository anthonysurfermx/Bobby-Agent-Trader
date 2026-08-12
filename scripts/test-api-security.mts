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
  liveKey: process.env.OKX_CEX_API_KEY,
  liveSecret: process.env.OKX_CEX_SECRET_KEY,
  livePassphrase: process.env.OKX_CEX_PASSPHRASE,
};

try {
  process.env.INTERNAL_API_SECRET = 'test-internal-secret';
  delete process.env.BOBBY_CYCLE_SECRET;
  delete process.env.CRON_SECRET;
  process.env.OKX_CEX_API_KEY = 'server-api-key';
  process.env.OKX_CEX_SECRET_KEY = 'server-secret-key';
  process.env.OKX_CEX_PASSPHRASE = 'server-passphrase';

  const [{ default: walletHandler }, { default: perpsHandler }, { default: xlayerHandler }, { default: telegramDeliverHandler }, { default: onchainSignalHandler }] = await Promise.all([
    import('../api/bobby-wallet.js'),
    import('../api/okx-perps.js'),
    import('../api/xlayer-trade.js'),
    import('../api/telegram-deliver.js'),
    import('../api/onchainos-signal.js'),
  ]);

  let fetchCalls = 0;
  let observedAccessKey = '';
  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    fetchCalls += 1;
    const headers = init?.headers as Record<string, string> | undefined;
    observedAccessKey = headers?.['OK-ACCESS-KEY'] || '';
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
    assert.equal(state.status, 401, 'server OKX account data must require internal auth');
    assert.equal(fetchCalls, 0, 'rejected OKX account reads must not call OKX');
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
    assert.equal(state.status, 200);
    assert.equal(state.body?.ok, true);
    assert.equal(observedAccessKey, 'user-api-key', 'user credentials must never unlock Bobby server credentials');
    assert.equal(fetchCalls, 1);
  }

  {
    const { response, state } = responseRecorder();
    await xlayerHandler(request({ action: 'swap', params: {} }), response);
    assert.equal(state.status, 400, 'arbitrary X Layer proxy actions must be rejected');
    assert.equal(fetchCalls, 1);
  }

  {
    const { response, state } = responseRecorder();
    await xlayerHandler(request({ action: 'swap_data', params: {} }), response);
    assert.equal(state.status, 503, 'transaction calldata must not cross an HTTP upstream');
    assert.equal(fetchCalls, 1);
  }

  {
    const { response, state } = responseRecorder();
    await telegramDeliverHandler(request({ thread_id: 'untrusted-thread' }), response);
    assert.equal(state.status, 401, 'Telegram delivery must fail closed without internal auth');
    assert.equal(fetchCalls, 1, 'rejected Telegram delivery must not call Supabase or Telegram');
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
    assert.equal(fetchCalls, 1, 'rejected signals must not reach execution dependencies');
  }

  const [orchestrateSource, registerSource, controlPlaneSource, forumRegisterSource, voiceAssetsSource, executorSource] = await Promise.all([
    readFile(new URL('../api/orchestrate.ts', import.meta.url), 'utf8'),
    readFile(new URL('../api/agents/register.ts', import.meta.url), 'utf8'),
    readFile(new URL('../api/_lib/hardness-control-plane.ts', import.meta.url), 'utf8'),
    readFile(new URL('../api/forum-agent-register.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/lib/voice-assets.ts', import.meta.url), 'utf8'),
    readFile(new URL('../services/executor/index.mjs', import.meta.url), 'utf8'),
  ]);
  assert.match(orchestrateSource, /const commitOnchain = internalRequest &&/, 'public orchestration must not spend recorder gas');
  assert.match(orchestrateSource, /body as unknown as Record<string, unknown>/, 'orchestration signatures must cover the full request');
  assert.match(registerSource, /existing\?\.owner_address \|\| body\.owner/, 'existing agent ownership must not be replaceable by a new signer');
  assert.doesNotMatch(controlPlaneSource, /VITE_SUPABASE_ANON_KEY/, 'control-plane mutations must not fall back to the browser anon key');
  assert.match(forumRegisterSource, /scrypt\(apiKey, pepperedSalt, 32,/, 'forum API keys must use a salted, peppered password KDF');
  assert.doesNotMatch(voiceAssetsSource, /USDT\?\|USDC\|PERP\|SWAP/, 'asset normalization must not use the vulnerable suffix regex');
  assert.match(executorSource, /Object\.hasOwn\(ACTIONS, action\)/, 'executor actions must use own-property allowlisting');
  assert.match(executorSource, /console\.error\('\[executor\] action failed:', action, message\)/, 'executor logs must use a constant format string');

  console.log('api-security: 26/26 checks passed');
} finally {
  globalThis.fetch = originalFetch;
  const restore = (name: string, value: string | undefined) => {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  };
  restore('INTERNAL_API_SECRET', previousEnv.internal);
  restore('BOBBY_CYCLE_SECRET', previousEnv.cycle);
  restore('CRON_SECRET', previousEnv.cron);
  restore('OKX_CEX_API_KEY', previousEnv.liveKey);
  restore('OKX_CEX_SECRET_KEY', previousEnv.liveSecret);
  restore('OKX_CEX_PASSPHRASE', previousEnv.livePassphrase);
}
