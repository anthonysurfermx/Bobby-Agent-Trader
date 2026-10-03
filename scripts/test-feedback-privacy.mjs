import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

// All provider, queue, rate-limit, and write-control effects are fixtures.
// No test path calls the network or writes a real support report.
const compiled = await build({
  entryPoints: [fileURLToPath(new URL('../api/feedback.ts', import.meta.url))], bundle: true,
  platform: 'node', format: 'esm', write: false,
  plugins: [{ name: 'private-feedback-fixtures', setup(plugin) {
    plugin.onResolve({filter: /(?:@vercel\/functions|bobby-db\.js|request-security\.js|control\.js)$/}, args => ({path: args.path, namespace: 'fixture'}));
    plugin.onLoad({filter: /.*/, namespace: 'fixture'}, args => ({contents:
      args.path === '@vercel/functions' ? 'export const waitUntil = promise => globalThis.__feedbackFixturePending.push(promise);' :
      args.path.endsWith('bobby-db.js') ? 'export const bobbyDbUrl = () => "https://fixture.invalid"; export const bobbyServiceKeyOptional = () => "fixture-service-key";' :
      args.path.endsWith('request-security.js') ? 'export const enforcePublicRateLimit = async () => true;' :
      'export const requireWritesOpen = async () => true;'
    }));
  }}],
});
const code = compiled.outputFiles[0].text;
const originalFetch = globalThis.fetch;
const originalError = console.error;
const originalKey = process.env.BREVO_API_KEY;
let passed = 0;
try {
  for (const scenario of ['no-config', 'configured', 'provider-error', 'provider-throws', 'queue-error']) {
    process.env.BREVO_API_KEY = scenario === 'no-config' ? '  ' : 'fixture-not-a-real-key';
    globalThis.__feedbackFixturePending = [];
    const calls = []; const logs = [];
    console.error = (...values) => logs.push(values.join(' '));
    globalThis.fetch = async (url, init) => {
      calls.push({url: String(url), body: JSON.parse(init.body)});
      if (String(url).includes('/rest/v1/user_feedback')) {
        return {ok: scenario !== 'queue-error', status: scenario === 'queue-error' ? 503 : 201, text: async () => 'private-report-body qa@example.invalid'};
      }
      assert.equal(String(url), 'https://api.brevo.com/v3/smtp/email');
      if (scenario === 'provider-throws') throw new Error('private-report-body qa@example.invalid');
      return {ok: scenario !== 'provider-error', status: scenario === 'provider-error' ? 401 : 201, text: async () => 'private-report-body qa@example.invalid'};
    };
    const {default: handler} = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}#${scenario}`);
    const result = {statusCode: 200, payload: null, setHeader() {}, status(code) {this.statusCode = code; return this;}, json(body) {this.payload = body; return this;}};
    await handler({method: 'POST', headers: {}, body: {type: 'general', page: 'android:ai-content', message: '<script>private-report-body</script>', user_email: 'qa@example.invalid'}}, result);
    await Promise.all(globalThis.__feedbackFixturePending);
    assert.equal(calls.filter(call => call.url.includes('/rest/v1/user_feedback')).length, 1);
    const emails = calls.filter(call => call.url.includes('api.brevo.com'));
    assert.equal(emails.length, ['no-config', 'queue-error'].includes(scenario) ? 0 : 1);
    if (emails.length) {
      assert.equal(emails[0].body.htmlContent.includes('<script>'), false, 'raw markup must be escaped');
      assert.equal(emails[0].body.htmlContent.includes('&lt;script&gt;'), true, 'escaped user text must remain available to reviewers');
    }
    assert.equal(logs.some(value => value.includes('private-report-body') || value.includes('qa@example.invalid')), false, 'private report data must not enter error logs');
    assert.equal(result.statusCode, scenario === 'queue-error' ? 503 : 200);
    assert.equal(result.payload.saved, scenario !== 'queue-error');
    passed++;
  }
} finally {
  globalThis.fetch = originalFetch; console.error = originalError;
  if (originalKey === undefined) delete process.env.BREVO_API_KEY; else process.env.BREVO_API_KEY = originalKey;
  delete globalThis.__feedbackFixturePending;
}
console.log(`Feedback privacy contract: ${passed}/5 fixture scenarios passed; no real network or queue writes.`);
