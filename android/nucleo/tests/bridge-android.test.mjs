import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const source = await readFile(new URL('../src/shared/10-bridge.js', import.meta.url), 'utf8');

function bridge() {
  const requests = [], timers = new Map();
  let timerId = 0;
  const window = { BobbyNucleo: { postMessage(raw) { requests.push(JSON.parse(raw)); } } };
  vm.runInNewContext(source, {
    window, Promise, setTimeout(callback) { timers.set(++timerId, callback); return timerId; },
    clearTimeout(id) { timers.delete(id); },
  });
  return { api: window.nucleoBridge, requests, timers };
}

test('Android request is correlated with one asynchronous JSON reply', async () => {
  const { api, requests, timers } = bridge();
  assert.equal(api.native, true);
  const result = api.call('ask', { question: 'BTC?' });
  assert.deepEqual(requests, [{ id: '1', v: 1, method: 'ask', params: { question: 'BTC?' } }]);
  api.receive('1', { v: 1, ok: true, result: { status: 'confirm', token: 'opaque' } });
  assert.deepEqual(await result, { status: 'confirm', token: 'opaque' });
  assert.equal(timers.size, 0);
  api.receive('1', { v: 1, ok: true, result: { status: 'ok' } }); // A late duplicate has no effect.
});

test('unknown methods are refused before they cross the native transport', async () => {
  const { api, requests } = bridge();
  await assert.rejects(api.call('fetchSecret', {}), { code: 'unknown_method' });
  assert.equal(requests.length, 0);
});

test('protocol faults and malformed native replies remain errors', async () => {
  const { api, requests } = bridge();
  const fault = api.call('session', {});
  api.receive(requests[0].id, { v: 1, ok: false, error: { code: 'forbidden', message: 'main frame required' } });
  await assert.rejects(fault, { code: 'forbidden' });
  const malformed = api.call('session', {});
  api.receive(requests[1].id, { v: 2, ok: true, result: {} });
  await assert.rejects(malformed, { code: 'bad_reply' });
});

test('a missing native reply times out without retaining a pending request', async () => {
  const { api, timers } = bridge();
  const result = api.call('session', {});
  const timeout = [...timers.values()][0];
  timeout();
  await assert.rejects(result, { code: 'timeout' });
  api.receive('1', { v: 1, ok: true, result: {} });
});


test('account and withdrawn-consent events reach the Android page without crossing transport', () => {
  const { api, requests } = bridge();
  const events = [];
  const off = api.on('account.changed', payload => events.push(['account', payload]));
  api.on('consent.withdrawn', payload => events.push(['consent', payload]));
  api.emit('account.changed', { signedIn: false });
  api.emit('consent.withdrawn', {});
  off();
  api.emit('account.changed', { signedIn: true });
  assert.deepEqual(events, [['account', { signedIn: false }], ['consent', {}]]);
  assert.equal(requests.length, 0);
});

test('a development transport cannot replace the Android native transport', async () => {
  const { api, requests } = bridge();
  let replaced = false;
  api.installTransport(() => { replaced = true; });
  const result = api.call('session', {});
  assert.equal(requests.length, 1);
  api.receive(requests[0].id, { v: 1, ok: true, result: { platform: 'android' } });
  assert.equal((await result).platform, 'android');
  assert.equal(replaced, false);
});

test('visible-read request carries only its UUID and accepts an honest negative native acknowledgment', async () => {
  const { api, requests } = bridge();
  const requestId = '92d74f61-43e7-4e1a-99f7-124a0b107f09';
  const result = api.call('read.rendered', { requestId });
  assert.deepEqual(requests, [{ id: '1', v: 1, method: 'read.rendered', params: { requestId } }]);
  api.receive('1', { v: 1, ok: true, result: { accepted: false } });
  assert.deepEqual(await result, { accepted: false });
});

test('the nudge crosses the Android transport as two reports and native starts a read with one event', async () => {
  const { api, requests } = bridge();
  const seen = api.call('nudge.seen', { id: 'credits.low.2026-w41' });
  const tapped = api.call('nudge.act', { id: 'credits.low.2026-w41' });
  assert.deepEqual(requests.map(request => [request.method, request.params]), [
    ['nudge.seen', { id: 'credits.low.2026-w41' }],
    ['nudge.act', { id: 'credits.low.2026-w41' }],
  ]);
  // Native answers what it counted and whether the nudge is still its own; the page never decides either.
  api.receive(requests[0].id, { v: 1, ok: true, result: { count: 2, active: true } });
  api.receive(requests[1].id, { v: 1, ok: true, result: { status: 'done' } });
  assert.deepEqual(await seen, { count: 2, active: true });
  assert.deepEqual(await tapped, { status: 'done' });
  const starts = [];
  api.on('ask.start', payload => starts.push(payload));
  api.emit('ask.start', { token: 'single-use', question: 'What changed in NVDA since I asked?' });
  assert.deepEqual(starts, [{ token: 'single-use', question: 'What changed in NVDA since I asked?' }]);
  // The page has no method to open a 1.8 screen by itself: only openNative, which native checks.
  await assert.rejects(api.call('present', { route: 'credits' }), { code: 'unknown_method' });
  assert.equal(requests.length, 2);
});
