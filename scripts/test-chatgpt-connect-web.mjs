import assert from 'node:assert/strict';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// Local fixture only. Every API, provider, and callback request is intercepted.
// VITE_BOBBY_SUPABASE_URL=http://localhost VITE_BOBBY_SUPABASE_ANON_KEY=anon npm run dev -- --host 127.0.0.1 --port 5193 --strictPort
// PLAYWRIGHT_MODULE and BROWSER_EXECUTABLE may select an existing bundled runtime.
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const origin = process.env.BOBBY_WEB_ORIGIN || 'http://127.0.0.1:5193';
const storageKey = process.env.BOBBY_AUTH_STORAGE_KEY || 'sb-localhost-auth-token';
const evidenceDirectory = process.env.BOBBY_UI_EVIDENCE_DIR || tmpdir();
const accountId = '00000000-0000-4000-8000-000000000001';
const user = { id: accountId, email: 'fixture@example.invalid', app_metadata: { provider: 'google' }, user_metadata: { name: 'Fixture' }, aud: 'authenticated' };
const session = { access_token: 'fixture-token', refresh_token: 'fixture-refresh', expires_at: Math.floor(Date.now() / 1000) + 3600, expires_in: 3600, token_type: 'bearer', user };
const query = { client_id: 'fixture-client', redirect_uri: 'https://chatgpt.com/connector_platform_oauth_redirect', response_type: 'code', code_challenge: 'a'.repeat(43), code_challenge_method: 'S256', state: 'fixture-state-1234567890', scope: 'bobby.context.read bobby.context.write', resource: 'https://bobbyprotocol.xyz/api/chatgpt' };
const connectionPath = '/chatgpt/connect?lang=en&locale=en-GB&' + new URLSearchParams(query);
const callback = approved => {
  const url = new URL(query.redirect_uri);
  url.search = new URLSearchParams({ ...(approved ? { code: 'fixture-code' } : { error: 'access_denied' }), state: query.state, iss: 'https://bobbyprotocol.xyz' }).toString();
  return url.href;
};
const browser = await chromium.launch({ headless: true, ...(process.env.BROWSER_EXECUTABLE ? { executablePath: process.env.BROWSER_EXECUTABLE } : {}) });
const pageErrors = [];

async function fixture(signedIn = true) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  if (signedIn) await context.addInitScript(({ storageKey, session }) => localStorage.setItem(storageKey, JSON.stringify(session)), { storageKey, session });
  const state = { writes: [], validations: [], callbacks: [], available: true, validRequest: true, denialRedirect: callback(false), approvalRedirect: callback(true), holdNavigation: false, releaseNavigation: null, holdApproval: false, releaseApproval: null, financialStatus: 200, financialBody: {} };
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.pathname === '/auth/v1/user') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(user) });
    if (url.pathname === '/auth/v1/token') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(session) });
    if (url.origin !== origin) {
      if (request.isNavigationRequest()) {
        state.callbacks.push(url.href);
        if (state.holdNavigation) await new Promise(resolve => { state.releaseNavigation = resolve; });
        return route.fulfill({ status: 200, contentType: 'text/html', body: '<html><body>ChatGPT callback fixture</body></html>' }).catch(() => {});
      }
      return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    }
    if (url.pathname === '/api/chatgpt') {
      if (url.searchParams.get('op') === 'authorize') {
        const body = request.postDataJSON();
        state.writes.push({ body, authorization: request.headers().authorization });
        if (body.approved && state.holdApproval) await new Promise(resolve => { state.releaseApproval = resolve; });
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ redirectUrl: body.approved ? state.approvalRedirect : state.denialRedirect }) });
      }
      if (url.searchParams.has('client_id')) {
        state.validations.push(Object.fromEntries(url.searchParams));
        assert.deepEqual([...url.searchParams.keys()].sort(), [...Object.keys(query), 'op'].sort(), 'public validation carries only known OAuth fields');
        return route.fulfill({ status: state.validRequest ? 200 : 400, contentType: 'application/json', body: JSON.stringify(state.validRequest ? { client: { id: query.client_id, name: 'ChatGPT fixture' }, requestedScopes: ['bobby.context.read', 'bobby.context.write'], resource: query.resource, connected: false, scopes: [], available: state.available } : { error: 'invalid_request' }) });
      }
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ connected: false, scopes: [], available: true }) });
    }
    if (url.pathname === '/api/financial-context') return route.fulfill({ status: state.financialStatus, contentType: 'application/json', body: JSON.stringify(state.financialBody) });
    if (url.pathname.startsWith('/api/')) return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    return route.continue();
  });
  const page = await context.newPage();
  page.on('pageerror', error => pageErrors.push(error.message));
  return { context, page, state };
}

try {
  // A valid cancellation completes the OAuth request with a denial, both with and without an account.
  for (const signedIn of [false, true]) {
    const { context, page, state } = await fixture(signedIn);
    await page.goto(origin + connectionPath + '&prompt=consent');
    await page.getByText('ChatGPT fixture', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    await page.waitForURL('https://chatgpt.com/**');
    assert.equal(page.url(), callback(false));
    assert.equal(state.writes.length, 1);
    assert.deepEqual(state.writes[0].body, { ...query, approved: false });
    assert.equal(state.writes[0].authorization, signedIn ? 'Bearer fixture-token' : undefined);
    assert.deepEqual(state.callbacks, [callback(false)]);
    await context.close();
  }

  // A validated but disabled connection still offers a clean denial, never an approval.
  {
    const { context, page, state } = await fixture(false);
    state.available = false;
    await page.goto(origin + connectionPath);
    await page.getByText('This connection is unavailable. You can cancel this request and return to ChatGPT.', { exact: true }).waitFor();
    assert(await page.getByRole('button', { name: 'Sign in to review permissions' }).isDisabled());
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    await page.waitForURL(callback(false));
    assert.deepEqual(state.writes[0].body, { ...query, approved: false });
    await context.close();
  }

  // Response tampering cannot navigate the browser, even after the request itself was verified.
  {
    const { context, page, state } = await fixture(false);
    const valid = callback(false);
    const rejected = [
      valid.replace('https://chatgpt.com/', 'https://untrusted.example.invalid/'),
      valid.replace('connector_platform_oauth_redirect', 'other_callback'),
      valid.replace(query.state, 'wrong-state'),
      valid.replace('iss=https%3A%2F%2Fbobbyprotocol.xyz', 'iss=https%3A%2F%2Funtrusted.example.invalid'),
      valid.replace('&iss=https%3A%2F%2Fbobbyprotocol.xyz', ''),
      valid + '&state=duplicate',
      valid + '&code=must-not-appear-on-denial',
      valid + '#fragment',
      valid.replace('https:', 'http:'),
    ];
    for (const denialRedirect of rejected) {
      state.denialRedirect = denialRedirect;
      await page.goto(origin + connectionPath);
      await page.getByRole('button', { name: 'Cancel', exact: true }).click();
      await page.getByText('The return to ChatGPT could not be verified. No redirect was opened. Start again from ChatGPT.', { exact: true }).waitFor();
      assert.equal(new URL(page.url()).origin, origin);
      assert.equal(state.callbacks.length, 0);
      assert(await page.getByRole('button', { name: 'Cancel', exact: true }).isEnabled(), 'failed verification can be retried');
    }
    await page.screenshot({ path: join(evidenceDirectory, 'bobby-chatgpt-cancel-untrusted.png'), fullPage: true });
    await context.close();
  }

  // An invalid request has only a local back link and cannot hit the decision endpoint.
  {
    const { context, page, state } = await fixture(false);
    state.validRequest = false;
    await page.goto(origin + connectionPath);
    await page.getByText('This connection could not be verified. Start again from ChatGPT.', { exact: true }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Cancel', exact: true }).count(), 0);
    await page.getByRole('link', { name: 'Cancel', exact: true }).click();
    await page.waitForURL(url => url.pathname === '/chatgpt');
    assert.equal(state.writes.length, 0);
    assert.equal(state.callbacks.length, 0);
    await context.close();
  }

  // Lock both simultaneous clicks and a second click while callback navigation awaits a response.
  {
    const { context, page, state } = await fixture();
    const protocol = await context.newCDPSession(page);
    state.holdApproval = true; state.holdNavigation = true;
    await page.goto(origin + connectionPath);
    const approve = page.getByRole('button', { name: 'Approve connection', exact: true });
    const consent = page.getByLabel('I approve these permissions for my Bobby account.', { exact: true });
    await consent.check();
    await approve.evaluate(button => { button.click(); button.click(); });
    await page.waitForFunction(() => document.querySelector('section[aria-busy="true"]') !== null);
    assert(await approve.isDisabled()); assert(await consent.isDisabled());
    for (let attempt = 0; !state.releaseApproval && attempt < 100; attempt++) await page.waitForTimeout(10);
    assert(state.releaseApproval, 'approval reached the fixture endpoint');
    assert.equal(state.writes.length, 1);
    state.releaseApproval();
    for (let attempt = 0; !state.callbacks.length && attempt < 100; attempt++) await page.waitForTimeout(10);
    assert(state.callbacks.length, 'validated callback navigation started');
    await protocol.send('Page.stopLoading');
    state.releaseNavigation();
    await page.waitForTimeout(100);
    assert.equal(state.callbacks[0], callback(true));
    assert.equal(new URL(page.url()).origin, origin);
    assert(await approve.isDisabled(), 'successful decision stays locked until unload');
    assert(await consent.isDisabled());
    assert(await page.getByRole('button', { name: 'Cancel', exact: true }).isDisabled());
    await approve.evaluate(button => button.click());
    assert.equal(state.writes.length, 1, 'delayed navigation never issues another grant');
    assert.deepEqual(state.writes[0].body, { ...query, approved: true });
    await page.screenshot({ path: join(evidenceDirectory, 'bobby-chatgpt-approval-locked.png'), fullPage: true });
    await context.close();
  }

  // Sign-in roundtrip preserves known OAuth state while discarding extensions and UI-only fields at the API boundary.
  {
    const { context, page, state } = await fixture(false);
    await page.goto(origin + connectionPath + '&prompt=consent&client_hint=untrusted&next=https%3A%2F%2Funtrusted.example.invalid');
    await page.getByRole('button', { name: 'Sign in to review permissions', exact: true }).click();
    await page.waitForURL(url => url.pathname === '/signin');
    const stored = await page.evaluate(() => sessionStorage.getItem('bobby:return:v1'));
    assert(stored);
    const restored = new URL(stored, origin);
    assert.equal(restored.pathname, '/chatgpt/connect');
    for (const [key, value] of Object.entries(query)) assert.equal(restored.searchParams.get(key), value, key + ' survives sign-in unchanged');
    for (const key of ['prompt', 'client_hint', 'next']) assert(!restored.searchParams.has(key));
    await page.evaluate(({ storageKey, session }) => localStorage.setItem(storageKey, JSON.stringify(session)), { storageKey, session });
    await page.goto(origin + '/auth/callback?source=bobby&code=fixture&lang=en&locale=en-GB');
    await page.waitForURL(url => url.pathname === '/chatgpt/connect');
    await page.getByRole('button', { name: 'Approve connection', exact: true }).waitFor();
    assert(await page.getByRole('button', { name: 'Approve connection', exact: true }).isDisabled());
    const returned = new URL(page.url());
    for (const [key, value] of Object.entries(query)) assert.equal(returned.searchParams.get(key), value);
    assert.equal(await page.evaluate(() => sessionStorage.getItem('bobby:return:v1')), null);
    assert.equal(state.writes.length, 0, 'sign-in never grants permissions');
    assert(state.validations.length >= 2, 'authorization validated again after sign-in');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.screenshot({ path: join(evidenceDirectory, 'bobby-chatgpt-signin-return.png'), fullPage: true });

    const rejectedReturns = ['//untrusted.example.invalid/chatgpt/connect', '/chatgpt/connect?state=one&state=two', '/chatgpt/connect?extension=one&extension=two', '/chatgpt/connect#fragment', '/chatgpt/connect/../../desk', '/chatgpt/connect\\untrusted', '/chatgpt?next=https%3A%2F%2Funtrusted.example.invalid'];
    for (const path of rejectedReturns) {
      const result = await page.evaluate(async path => {
        const { rememberReturn, takeReturn } = await import('/src/lib/access-client.ts');
        rememberReturn('/chatgpt'); rememberReturn(path); return takeReturn();
      }, path);
      assert.equal(result, null, 'unsafe return rejected and stale return removed: ' + path);
    }

    // API status 429 maps to a useful message, even if the limiter returns human text.
    for (const [status, body, code] of [[400, { code: 'invalid_context' }, 'invalid_context'], [413, { code: 'context_too_large' }, 'context_too_large'], [429, { error: 'Rate limit exceeded' }, 'rate_limited']]) {
      state.financialStatus = status; state.financialBody = body;
      const result = await page.evaluate(async accountId => {
        const { fetchFinancialContext } = await import('/src/lib/financial-context-client.ts');
        try { await fetchFinancialContext(accountId); return null; } catch (error) { return error.code; }
      }, accountId);
      assert.equal(result, code);
    }
    for (const language of ['en', 'es', 'pt', 'fr', 'it', 'de']) {
      const messages = await page.evaluate(async language => {
        const { setLang } = await import('/src/lib/companions/i18n.ts');
        const { financialContextErrorMessage } = await import('/src/components/nucleo/FinancialContextDialog.tsx');
        const { FinancialContextError } = await import('/src/lib/financial-context-client.ts');
        history.replaceState({}, '', '/chatgpt/connect?lang=' + language); setLang(language);
        return ['invalid_context', 'context_too_large', 'rate_limited'].map(code => financialContextErrorMessage(new FinancialContextError(code)));
      }, language);
      assert(messages.every(message => message.length > 40 && !message.includes('This could not be completed')), language + ' has actionable financial errors');
      if (language !== 'en') assert(messages.every(message => !message.startsWith('Use the JSON') && !message.startsWith('This import') && !message.startsWith('Too many requests')), language + ' errors translated');
    }
    for (const language of ['en', 'es', 'pt', 'fr', 'it', 'de']) {
      await page.goto(origin + '/privacy?lang=' + language);
      const heading = page.getByRole('heading', { name: /ChatGPT/, exact: false });
      await heading.waitFor();
      const section = heading.locator('..');
      const text = await section.innerText();
      for (const limit of ['100', '20', '90', '24']) assert(text.includes(limit), language + ' privacy describes retention and visibility limits');
      if (language === 'en') {
        assert(text.includes('On the web, saving analysis snapshots requires financial memory and account memory'));
        assert(text.includes('The native apps also require that device'));
        assert(text.includes('does not prove you received or viewed'));
        assert(!text.includes('delivered analyses'));
      } else assert(!text.includes('On the web, saving analysis snapshots'), language + ' financial privacy translated');
    }
    await page.screenshot({ path: join(evidenceDirectory, 'bobby-chatgpt-privacy-limits.png'), fullPage: true });
    await context.close();
  }
  assert.deepEqual(pageErrors, [], 'no uncaught browser errors');
  console.log('PASS ChatGPT consent: signed-in/out denial, exact callback validation, locked approval, safe sign-in roundtrip with extensions, actionable errors and financial privacy in six languages.');
} finally {
  await browser.close();
}
