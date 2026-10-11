import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
const ios = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = p => fs.readFileSync(path.join(ios, p), 'utf8');
const langs = ['en','es','fr','pt','it','de'];
const placeholders = s => [...s.matchAll(/\{\w+\}/g)].map(m => m[0]).sort();
const snapshot = JSON.parse(read('Tests/Snapshots/legal-texts.jsonc').split('\n').slice(1).join('\n'));

test('every companion copy row has six non-empty languages and matching placeholders', () => {
  const copy = JSON.parse(read('Resources/Nucleo/companion-copy.json'));
  for (const [key, row] of Object.entries(copy.texts)) {
    assert.deepEqual(Object.keys(row).sort(), [...langs].sort(), key);
    for (const lang of langs) {
      assert.ok(typeof row[lang] === 'string' && row[lang].trim(), `${key}/${lang}`);
      assert.deepEqual(placeholders(row[lang]), placeholders(row.en), `${key}/${lang}`);
    }
  }
  assert.deepEqual(Object.keys(copy.consent).sort(), [...langs].sort());
  for (const lang of langs) {
    assert.equal(copy.consent[lang].length, 7, lang);
    for (const [index, text] of copy.consent[lang].entries()) {
      assert.ok(text.trim(), `${lang}/${index}`);
      assert.deepEqual(placeholders(text), placeholders(copy.consent.en[index]));
      assert.deepEqual(Buffer.from(text), Buffer.from(snapshot.consent[lang][index]), `owner-approved consent ${lang}/${index}`);
    }
  }
});

test('committed iPhone pages are release bundles and embed every shipping source', () => {
  assert.equal(JSON.parse(read('Resources/Nucleo/build-info.json')).release, true);
  for (const page of ['app', 'onboarding']) {
    const html = read(`Resources/Nucleo/${page}.html`);
    assert.ok(!html.includes('window.NUCLEO_FIXTURES='), page);
    assert.ok(!html.includes('90-dev-mock-bridge'), page);
    for (const dir of ['shared', page]) {
      for (const file of fs.readdirSync(path.join(ios, 'Nucleo/src', dir))) {
        if (!file.endsWith('.js') || /^9.*-dev-/.test(file)) continue;
        assert.ok(html.includes(read(`Nucleo/src/${dir}/${file}`).trim()), `${page}: stale ${dir}/${file}`);
      }
    }
  }
});

test('the screenshot labels match current shipping strings in all six languages', () => {
  execFileSync(process.execPath, [path.join(ios, 'scripts/redesign-labels.mjs'), '--check']);
});

test('the bundled server catalog has a non-empty why in all six languages', () => {
  const catalog = JSON.parse(read('Resources/Nucleo/companion-questions.json'));
  for (const question of catalog.questions) {
    assert.deepEqual(Object.keys(question.why).sort(), [...langs].sort(), question.id);
    for (const lang of langs) assert.ok(question.why[lang].trim(), `${question.id}/${lang}`);
  }
});
