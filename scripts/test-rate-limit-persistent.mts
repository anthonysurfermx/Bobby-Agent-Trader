import assert from 'node:assert/strict';

// All requests stay in memory; no production database is contacted or changed.
process.env.BOBBY_SUPABASE_URL = 'https://db.test';
process.env.BOBBY_SUPABASE_SERVICE_ROLE_KEY = 'test-db-key';
const { checkPersistentLimit } = await import('../api/_lib/rate-limit-persistent.js');

let mode: 'ok' | 'save-error' | 'get-hang' | 'save-hang' = 'ok';
let aborts = 0;
globalThis.fetch = async (_input, init) => {
  if (mode === 'get-hang' || (mode === 'save-hang' && init?.method === 'POST')) {
    return new Promise((_resolve, reject) => {
      const backup = setTimeout(() => reject(new Error('Mock fetch missed the deadline')), 2000);
      init?.signal?.addEventListener('abort', () => {
        clearTimeout(backup);
        aborts++;
        reject(init.signal?.reason);
      }, { once: true });
    });
  }
  if (init?.method === 'POST') return new Response(null, { status: mode === 'save-error' ? 503 : 204 });
  return Response.json([]);
};

const saved = await checkPersistentLimit('test', 'one', 3, 60);
assert.deepEqual({ available: saved.available, remaining: saved.remaining }, { available: true, remaining: 2 });

mode = 'save-error';
assert.equal((await checkPersistentLimit('test', 'two', 3, 60)).available, false, 'Failed writes cannot confirm a quota hit');

for (const stalled of ['get-hang', 'save-hang'] as const) {
  mode = stalled;
  const started = Date.now();
  const result = await checkPersistentLimit('test', stalled, 3, 60);
  assert.equal(result.available, false);
  assert.equal(result.limited, false);
  assert(Date.now() - started < 1600, `${stalled} must finish before the voice client times out`);
}
assert.equal(aborts, 2, 'Both stalled store operations receive an abort signal');
console.log('Persistent limit: confirmed writes, failed writes, and stalled reads/writes passed.');
