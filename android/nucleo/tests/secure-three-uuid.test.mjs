import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
import { withSecureThreeUUIDs } from '../equipment-stage/secure-three-uuid.mjs';

const core = fs.readFileSync(new URL('../../../node_modules/three/build/three.core.js', import.meta.url), 'utf8');
const secured = withSecureThreeUUIDs(core);
function uuidSource(source) {
  const lookup = source.slice(source.indexOf('const _lut ='), source.indexOf(';', source.indexOf('const _lut =')) + 1);
  const start = source.indexOf('function generateUUID()');
  const end = source.indexOf('\n}', start) + 2;
  assert.ok(start >= 0 && end > start, 'The reviewed UUID function is present');
  return lookup + '\n' + source.slice(start, end) + '\ngenerateUUID';
}
function generator(crypto) {
  return vm.runInNewContext(uuidSource(secured), { crypto, Uint32Array, Math: { random() { throw new Error('Insecure fallback is forbidden'); } } });
}

test('Three UUID uses four cryptographic words and preserves lowercase version/variant formatting', () => {
  let calls = 0;
  const uuid = generator({ getRandomValues(words) {
    calls++;
    assert.equal(words.byteLength, 16);
    words.set([0, 0xffffffff, 0x12345678, 0x87654321]);
    return words;
  } });
  assert.equal(uuid(), '00000000-ffff-4fff-b856-341221436587');
  assert.equal(calls, 1);
  assert.match(generator(webcrypto)(), /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});

test('Missing Web Crypto fails without falling back to Math.random', () => {
  assert.throws(() => generator(undefined)(), /getRandomValues/);
});

test('Unreviewed or duplicate UUID source blocks fail closed', () => {
  assert.throws(() => withSecureThreeUUIDs(''), /exactly one/);
  assert.throws(() => withSecureThreeUUIDs(core.replace('const d0 = Math.random() * 0xffffffff | 0;', 'const d0 = 0;')), /exactly one/);
  assert.throws(() => withSecureThreeUUIDs(core + core), /exactly one/);
});

test('Only the UUID entropy block changes; visual randomness and the formatter stay intact', () => {
  const originalFunction = uuidSource(core), secureFunction = uuidSource(secured);
  assert.equal(core.split('Math.random()').length - secured.split('Math.random()').length, 4);
  assert.equal(originalFunction.slice(originalFunction.indexOf('const uuid =')), secureFunction.slice(secureFunction.indexOf('const uuid =')));
  assert.doesNotMatch(secureFunction, /Math\.random/);
});
