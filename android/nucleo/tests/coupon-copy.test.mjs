import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const root = new URL('../../../', import.meta.url);
const read = p => fs.readFileSync(new URL(p, root), 'utf8');
const canonical = JSON.parse(read('shared/coupon-copy.json'));
const swift = read('ios/Bobby/Sources/CouponCopy.swift');
const kotlin = read('android/app/src/main/java/xyz/bobbyprotocol/android/ui/CouponCopy.kt');
const stringLiteral = '"(?:[^"\\\\]|\\\\.)*"';
const pairs = new RegExp(`(${stringLiteral})\\s*(?::|to)\\s*(${stringLiteral})`, 'g');

function nativeRows(source) {
  const result = {};
  for (const line of source.split('\n')) {
    const row = /^\s*("(?:[^"\\]|\\.)*")\s*(?:: \[|to mapOf\()(.*)/.exec(line);
    if (!row) continue;
    const key = JSON.parse(row[1]);
    result[key] = Object.fromEntries([...row[2].matchAll(pairs)].map(m => [JSON.parse(m[1]), JSON.parse(m[2])]));
  }
  return result;
}

test('both native coupon catalogs exactly match the shared six-language copy', () => {
  assert.deepEqual(nativeRows(swift), canonical);
  assert.deepEqual(nativeRows(kotlin), canonical);
  for (const [key, row] of Object.entries(canonical)) {
    assert.deepEqual(Object.keys(row).sort(), ['de', 'en', 'es', 'fr', 'it', 'pt']);
    for (const [language, value] of Object.entries(row)) {
      assert.ok(value.trim(), `${key}:${language}`);
      assert.deepEqual([...value.matchAll(/\{n\}/g)].map(m => m[0]), [...row.en.matchAll(/\{n\}/g)].map(m => m[0]), key);
    }
  }
});

test('coupon copy reports the actual grant and explains what to do without a store restore', () => {
  for (const row of Object.values(canonical)) for (const text of Object.values(row)) {
    assert.ok(!/\b10\b/.test(text), 'Real counts must be substituted, not hardcoded');
  }
  assert.equal(canonical.manyReads.es.replace('{n}', '10'), 'Tienes 10 lecturas Rápido más');
  assert.equal(canonical.manyReads.es.replace('{n}', '27'), 'Tienes 27 lecturas Rápido más');
  assert.equal(canonical.noRestore.es, 'No necesitas restaurar compras.');
  assert.match(canonical.alreadyNext.es, /No se añadió otro regalo/);
});
