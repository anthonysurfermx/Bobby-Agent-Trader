import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const main = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../app/src/main');
const assets = path.join(main, 'assets');
const read = relative => JSON.parse(fs.readFileSync(path.join(assets, relative), 'utf8'));
const original = read('nucleo/native-translations.json');
const android = read('nucleo/native-android-translations.json');
const languages = ['en', 'es', 'fr', 'pt', 'it', 'de'];
const addedLanguages = languages.slice(2);
const localized = (key, language) => android[key]?.[language] ?? original[key]?.[language];

function kotlinFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const target = path.join(directory, entry.name);
    return entry.isDirectory() ? kotlinFiles(target) : target.endsWith('.kt') ? [target] : [];
  });
}

test('every literal native UI string has all four additional translations', () => {
  const literal = /\b(?:t|text)\(\s*"((?:[^"\\]|\\.)*)"\s*,\s*"((?:[^"\\]|\\.)*)"/g;
  let count = 0;
  for (const file of kotlinFiles(path.join(main, 'java'))) {
    for (const match of fs.readFileSync(file, 'utf8').matchAll(literal)) {
      const key = JSON.parse(`"${match[1]}"`);
      // Runtime interpolation needs its own format contract rather than a literal catalog key.
      assert.ok(!key.includes('$'), `Use a catalog template for interpolation in ${file}: ${key}`);
      for (const language of addedLanguages) {
        assert.ok(localized(key, language)?.trim(), `${language}: ${key} (${file})`);
      }
      count++;
    }
  }
  assert.ok(count > 200, 'The native Android UI sources must actually be inspected');
});

test('new Android entries preserve template placeholders and all translated fields', () => {
  assert.ok(Object.keys(android).length >= 150);
  const placeholders = text => [...text.matchAll(/\{\d+\}/g)].map(match => match[0]).sort();
  for (const [key, value] of Object.entries(android)) {
    const fields = Object.keys(value);
    assert.ok(fields.every(language => languages.includes(language)), `Unexpected field: ${key}`);
    assert.equal(fields.includes('en'), fields.includes('es'), `Base languages must be paired: ${key}`);
    assert.deepEqual(fields.filter(language => addedLanguages.includes(language)).sort(), [...addedLanguages].sort(), key);
    if (fields.includes('en')) assert.equal(value.en, key, `English base must match the catalog key: ${key}`);
    for (const language of fields) {
      assert.ok(typeof value[language] === 'string' && value[language].trim(), `${language}: ${key}`);
      assert.deepEqual(placeholders(value[language]), placeholders(key), `${language}: ${key}`);
    }
  }
});

test('every iOS 1.8 translation row is in the Android catalog, in Android words', () => {
  // android/tools/build-v18-translations.py writes them; this is the check that it ran and that
  // nobody retyped a translation iOS already has.
  const root = path.resolve(main, '../../../..');
  const tables = path.join(root, 'ios/Bobby/Sources/V18/Translations');
  const wording = JSON.parse(fs.readFileSync(path.join(root, 'android/tools/v18-android-wording.json'), 'utf8'));
  const row = /^\s*result\["((?:[^"\\]|\\.)*)"\]\s*=\s*\[(.*)\]\s*$/;
  const pair = /"(fr|pt|it|de)"\s*:\s*"((?:[^"\\]|\\.)*)"/g;
  const placeholders = text => [...text.matchAll(/\{\d+\}/g)].map(match => match[0]).sort();
  const apple = /iPhone|iPad|Apple|App Store/;
  const seen = new Set();
  for (const file of fs.readdirSync(tables).filter(name => name.endsWith('.swift')).sort()) {
    for (const line of fs.readFileSync(path.join(tables, file), 'utf8').split('\n')) {
      const match = row.exec(line);
      if (!match) continue;
      const iosKey = JSON.parse(`"${match[1]}"`);
      const ios = Object.fromEntries([...match[2].matchAll(pair)].map(found => [found[1], JSON.parse(`"${found[2]}"`)]));
      const reworded = wording[iosKey];
      const key = reworded ? reworded.en : iosKey;
      const expected = reworded ?? ios;
      const entry = android[key];
      assert.ok(entry, `Missing from the Android catalog (run android/tools/build-v18-translations.py): ${key}`);
      assert.ok(!apple.test(key), `Android wording needed in android/tools/v18-android-wording.json: ${key}`);
      for (const language of addedLanguages) {
        assert.ok(entry[language]?.trim(), `${language}: ${key}`);
        assert.equal(entry[language], expected[language], `${language} differs from its source: ${key}`);
        assert.deepEqual(placeholders(entry[language]), placeholders(key), `${language}: ${key}`);
        assert.ok(!apple.test(entry[language]), `${language} names Apple hardware or a store: ${key}`);
      }
      if (reworded) {
        assert.equal(android[iosKey], undefined, `The iOS wording must not ship on Android: ${iosKey}`);
        for (const language of languages) assert.ok(reworded[language]?.trim() && !apple.test(reworded[language]), `${language}: ${iosKey}`);
        assert.deepEqual(placeholders(reworded.es), placeholders(reworded.en), `es: ${key}`);
        assert.deepEqual(placeholders(reworded.en), placeholders(iosKey), `en: ${key}`);
      }
      seen.add(iosKey);
    }
  }
  assert.ok(seen.size >= 328, `Expected every iOS 1.8 row, found ${seen.size}`);
  for (const iosKey of Object.keys(wording)) assert.ok(seen.has(iosKey), `A rewording without its iOS row: ${iosKey}`);
  // The generator writes the catalog sorted, so two branches adding rows merge cleanly.
  const keys = Object.keys(android);
  assert.deepEqual(keys, [...keys].sort(), 'Run android/tools/build-v18-translations.py to sort the catalog');
});

test('dynamic earned equipment names also resolve in the selected language', () => {
  const { items } = read('equipment/catalog.json');
  assert.equal(items.length, 72);
  for (const item of items) {
    for (const language of addedLanguages) {
      assert.ok(localized(item.name.en, language)?.trim(), `${language}: ${item.name.en}`);
    }
  }
});

test('the actual roster, risk notice and level catalog contain all six languages', () => {
  const { companions } = read('nucleo/roster.json');
  assert.equal(companions.length, 18);
  assert.equal(new Set(companions.map(item => item.id)).size, 18);
  for (const companion of companions) {
    for (const language of languages) {
      for (const field of ['role', 'personality', 'selectLine', 'secretPhrase']) {
        assert.ok(companion.localized[language][field]?.trim(), `${companion.id}/${language}/${field}`);
      }
    }
  }
  const risk = JSON.parse(fs.readFileSync(new URL('../risk-notice.json', import.meta.url), 'utf8'));
  assert.equal(risk.version, 6);
  for (const language of languages) {
    assert.equal(risk.statements[language].length, 4);
    for (const statement of risk.statements[language]) {
      assert.ok(statement.title.trim() && statement.body.trim());
      assert.ok(!/iPhone|Safari|Apple/.test(statement.body), `${language}: Android consent must describe this device`);
    }
  }
  const { levels } = read('nucleo/levels.json');
  assert.deepEqual(levels.map(level => level.minXP), [0, 50, 150, 400, 1000]);
  for (const level of levels) for (const language of languages) assert.ok(level[language]?.trim());
});
