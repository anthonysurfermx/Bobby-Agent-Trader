// Offline regression for the actual browser queue -> storage -> sync request.
// Bundling supplies Vite's DEV constant; storage and HTTP stay entirely in memory.
import assert from 'node:assert/strict';
import { build } from 'esbuild';

const storage = new Map<string, string>();
const oldStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
const oldFetch = globalThis.fetch;
Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => storage.set(key, value),
} });

const bundle = await build({
  stdin: { contents: "export { progressStore } from './src/lib/companions/progress'; export { configureProgressSync, syncProgress } from './src/lib/companions/sync';", resolveDir: process.cwd() },
  bundle: true, write: false, platform: 'node', format: 'esm',
  define: { 'import.meta.env.DEV': 'false', 'process.env.NODE_ENV': '"production"' },
});
const moduleUrl = `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`;
const first = await import(`${moduleUrl}#first`);
let restored: typeof first | undefined;
try {
  const thesis = { symbol: 'ETH', isEquity: false, direction: 'long', price: 3000, entry: 3000, stop: 2900, target: 3200 };
  const expected = { ...thesis };
  const readId='b26445f8-5b88-4e8d-aaef-7f7b1cbcf451';
  first.progressStore.awardDiscipline('read_complete', new Date('2026-09-05T12:00:00Z'), thesis, readId);
  thesis.symbol = 'BTC'; // A later view change must not rewrite a queued verdict.
  const queued = first.progressStore.get().pendingEvents[0];
  assert.deepEqual(queued.thesis, expected);
  assert.deepEqual(JSON.parse(storage.get('bobby.companion.progress.v1')!).pendingEvents[0].thesis, expected);

  globalThis.fetch = async (url, init) => {
    assert.equal(url, '/api/progress');
    assert.equal(init?.method, 'POST');
    assert.deepEqual(JSON.parse(String(init?.body)).events[0].thesis, expected);
    assert.equal(JSON.parse(String(init?.body)).events[0].thesisReadId,readId);
    return new Response('{}', { status: 503 });
  };
  first.configureProgressSync(() => ({ Authorization: 'Bearer local-test-only' }));
  assert.equal(await first.syncProgress(), 'error');
  assert.equal(first.progressStore.get().pendingEvents[0].id, queued.id);
  first.configureProgressSync(null);

  // Reload the real store from the persisted queue, then retry and acknowledge.
  restored = await import(`${moduleUrl}#reload`);
  assert.deepEqual(restored.progressStore.get().pendingEvents[0].thesis, expected);
  assert.equal(restored.progressStore.get().pendingEvents[0].thesisReadId,readId);
  globalThis.fetch = async (url, init) => {
    assert.equal(url, '/api/progress');
    const body = JSON.parse(String(init?.body));
    assert.equal(body.events[0].id, queued.id);
    assert.equal(body.events[0].thesisReadId,readId);
    assert.deepEqual(body.events[0].thesis, expected);
    return Response.json({ progress: { ...restored!.progressStore.get(), xp: 10 }, results: [{ id: queued.id }] });
  };
  restored.configureProgressSync(() => ({ Authorization: 'Bearer local-test-only' }));
  assert.equal(await restored.syncProgress(), 'synced');
  assert.equal(restored.progressStore.get().pendingEvents.length, 0);
  restored.configureProgressSync(null);

  restored.progressStore.reset();
  restored.progressStore.awardDiscipline('no_trade_respected', new Date('2026-09-05T12:00:00Z'));
  assert.equal(restored.progressStore.get().pendingEvents[0].thesis, undefined);
  console.log('PASS: thesis snapshot persists, survives failed sync/reload, reaches the HTTP payload and clears only on acknowledgement; legacy events remain valid.');
} finally {
  first.configureProgressSync(null);
  restored?.configureProgressSync(null);
  globalThis.fetch = oldFetch;
  if (oldStorage) Object.defineProperty(globalThis, 'localStorage', oldStorage);
  else Reflect.deleteProperty(globalThis, 'localStorage');
}
