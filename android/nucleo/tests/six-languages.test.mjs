// node --test android/nucleo/tests/six-languages.test.mjs
// Six-language rules of the Nucleo page, checked against the Android source:
// sentence split (ordinals, abbreviations), the unavailable-voice pill, the greeting hour and the string tables.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const TREES = { android: new URL('../src/', import.meta.url) };
const LANGS = ['en', 'es', 'fr', 'pt', 'it', 'de'];
const read = (tree, file) => fs.readFileSync(new URL(file, TREES[tree]), 'utf8');

function readModel(tree) {
  const sandbox = { console };
  sandbox.globalThis = sandbox; sandbox.window = sandbox; sandbox.self = sandbox;
  vm.runInNewContext(read(tree, 'shared/20-read-model.js'), sandbox);
  return sandbox.NucleoReadModel;
}
function table(tree, file) {
  const src = read(tree, file);
  const from = src.indexOf('var STR = ');
  const body = src.slice(from, src.indexOf('\nvar LANG', from) > 0 ? src.indexOf('\nvar LANG', from) : src.indexOf('\nfunction ', from));
  return vm.runInNewContext(body + '; STR', {});
}

for (const tree of Object.keys(TREES)) {
  const RM = readModel(tree);

  test(`${tree}: German ordinals and abbreviations do not end a sentence`, () => {
    const first = RM.firstSentence;
    assert.equal(first('Der Kurs testet seit dem 3. Oktober den Widerstand bei 85.259 USD. Ein Ausbruch ist offen.'),
      'Der Kurs testet seit dem 3. Oktober den Widerstand bei 85.259 USD.');
    assert.equal(first('Im 4. Quartal stieg der Umsatz. Die Marge fiel.'), 'Im 4. Quartal stieg der Umsatz.');
    assert.equal(first('Am 15. November folgen die Zahlen. Der Markt wartet.'), 'Am 15. November folgen die Zahlen.');
    assert.equal(first('Stand 3. Oktober ist der Trend intakt. Mehr folgt.'), 'Stand 3. Oktober ist der Trend intakt.');
    assert.equal(first('Der 1. Widerstand liegt höher. Der Trend hält.'), 'Der 1. Widerstand liegt höher.');
    assert.equal(first('Anbieter wie z. B. Apple bzw. Nvidia führen. Der Rest folgt.'), 'Anbieter wie z. B. Apple bzw. Nvidia führen.');
    assert.equal(first('Der Umsatz liegt bei 3 Mio. USD laut Nr. 2 der Branche. Mehr nicht.'), 'Der Umsatz liegt bei 3 Mio. USD laut Nr. 2 der Branche.');
    assert.equal(first('Selon M. Dupont, le titre monte. La suite est ouverte.'), 'Selon M. Dupont, le titre monte.');
    assert.equal(first('St. Gobain progresse. Le marché suit.'), 'St. Gobain progresse.');
  });

  test(`${tree}: a number that closes a sentence still ends it`, () => {
    assert.deepEqual(Array.from(RM.sentences('RSI is at 71. The trend is up.')), ['RSI is at 71.', 'The trend is up.']);
    assert.deepEqual(Array.from(RM.sentences('El RSI está en 71. La tendencia sube.')), ['El RSI está en 71.', 'La tendencia sube.']);
    assert.deepEqual(Array.from(RM.sentences('Der RSI liegt bei 71. Der Trend steigt.')), ['Der RSI liegt bei 71.', 'Der Trend steigt.']);
    assert.deepEqual(Array.from(RM.sentences('Support sits at 225.1 today. Resistance is 240.')), ['Support sits at 225.1 today.', 'Resistance is 240.']);
  });

  test(`${tree}: the German rules do not merge sentences in the other languages`, () => {
    const split = (text) => Array.from(RM.sentences(text));
    assert.deepEqual(split('Le RSI repasse au-dessus des 50. La tendance reste haussière.'), ['Le RSI repasse au-dessus des 50.', 'La tendance reste haussière.']);
    assert.deepEqual(split('Le titre casse la barre des 90. L’élan faiblit.'), ['Le titre casse la barre des 90.', 'L’élan faiblit.']);
    assert.deepEqual(split('O mercado abre antes das 10. O volume é baixo.'), ['O mercado abre antes das 10.', 'O volume é baixo.']);
    assert.deepEqual(split('Der RSI liegt bei der 70. Das ist hoch.'), ['Der RSI liegt bei der 70.', 'Das ist hoch.']);
    assert.deepEqual(split('El volumen es de 12 M. La tendencia sigue.'), ['El volumen es de 12 M.', 'La tendencia sigue.']);
    assert.deepEqual(split('Volume reached $5M. The trend is up.'), ['Volume reached $5M.', 'The trend is up.']);
    assert.equal(RM.firstSentence('Die Zahlen des 3. Quartals überzeugen. Der Markt steigt.'), 'Die Zahlen des 3. Quartals überzeugen.');
    assert.equal(RM.firstSentence('Das 2. Ziel liegt höher. Der Trend hält.'), 'Das 2. Ziel liegt höher.');
  });

  test(`${tree}: with voice input unavailable a tap opens the keyboard and a hold asks native again, then explains`, async () => {
    const fsm = read(tree, 'app/60-fsm.js');
    const pill = fsm.slice(fsm.indexOf('function pillDown('), fsm.indexOf('/* ---------- PRE_PERMISSION'));
    for (const state of ['unavailable', 'denied', 'restricted']) {
      // `fresh` is what native answers to speech.permission during the hold (null: the bridge call fails).
      const run = async (seconds, fresh = state) => {
        let time = 0; const calls = [];
        const ctx = vm.createContext({ SES: { mic: { state } }, ST: { name: 'IDLE' }, GEN: 0, A: { press: { to() {} } }, tick() {}, noop() {}, nowT: () => time,
          at: (_s, fn) => calls.push(['later', fn]), hint: (t) => calls.push(['hint', t]), tt: (k) => k,
          pillMode: (m) => calls.push(['pill', m]), idleMode: () => 'icon',
          bcall: (method) => { calls.push(['native', method]); return fresh ? Promise.resolve({ state: fresh, onDevice: false }) : Promise.reject(new Error('bridge')); },
          go: (...a) => calls.push(['go', ...a]), openTyping: (a) => calls.push(['typing', a]) });
        vm.runInContext(pill, ctx);
        const g = ctx.pillDown(null, false);
        time = seconds; g.up();
        for (let i = 0; i < 4; i++) await Promise.resolve();
        return { calls: JSON.parse(JSON.stringify(calls.filter((c) => c[0] !== 'later' && c[0] !== 'pill'))), mic: ctx.SES.mic.state };
      };
      assert.deepEqual((await run(0.1)).calls, [['typing', { fromRead: false }]], state + ': tap types and asks nothing');
      assert.deepEqual(await run(0.6), { calls: [['native', 'speech.permission'], ['hint', 'hint.micOff']], mic: state }, state + ': hold explains');
      assert.deepEqual(await run(0.6, null), { calls: [['native', 'speech.permission'], ['hint', 'hint.micOff']], mic: state }, state + ': a failed re-query keeps the cache');
      // The cache was stale: the button is not dead once native can listen again.
      assert.deepEqual(await run(0.6, 'granted'), { calls: [['native', 'speech.permission'], ['hint', 'hint.hold']], mic: 'granted' }, state + ': stale cache');
      // A future native consent result asks through native and captures nothing; current Android recognition stays on-device.
      assert.deepEqual(await run(0.6, 'consent'), { calls: [['native', 'speech.permission'], ['native', 'speech.requestPermission'], ['typing', { fromRead: false }]], mic: 'consent' }, state + ': consent prompt');
    }
  });

  test(`${tree}: the consent state keeps the mic pill, and both pages ask native before deciding a hold`, () => {
    const actors = read(tree, 'app/50-actors.js');
    const mode = (state) => vm.runInNewContext(actors.slice(actors.indexOf('function idleMode('), actors.indexOf('function ariaPill(')) + '; idleMode()', { SES: { mic: { state } } });
    assert.deepEqual(['granted', 'undetermined', 'consent', 'unavailable', 'denied', 'restricted'].map(mode), ['mic', 'mic', 'mic', 'kbd', 'kbd', 'kbd']);
    for (const file of ['app/60-fsm.js', 'onboarding/60-fsm.js']) {
      const fsm = read(tree, file);
      assert.match(fsm, /speech\.permission/, file + ' re-queries native');
      assert.match(fsm, /=== 'consent'/, file + ' handles the consent state');
    }
  });

  test(`${tree}: the unavailable-voice line offers typing and no longer blames the microphone`, () => {
    for (const file of ['app/40-strings.js', 'onboarding/40-strings.js']) {
      const STR = table(tree, file);
      for (const lang of LANGS) {
        const line = STR[lang]['hint.micOff'];
        assert.ok(line && line.includes(' · '), `${file} ${lang}`);
        assert.doesNotMatch(line, /\b(mic|micro|micrófono|microfone|microfono|mikrofon)\b/i, `${file} ${lang}: ${line}`);
      }
    }
  });

  test(`${tree}: French greets with Bonjour in the afternoon and addresses the user as tu; Portuguese as tu`, () => {
    const formalFr = /\b(vous|votre|vos)\b|[a-zéèêç]{3,}ez\b/i;
    const formalPt = /\b(você|sua|seu|suas|seus|mantenha|toque|deslize|solte|pergunte|escreva)\b/i;
    for (const file of ['app/40-strings.js', 'onboarding/40-strings.js']) {
      const STR = table(tree, file);
      for (const [key, value] of Object.entries(STR.fr)) {
        assert.doesNotMatch(value, formalFr, `${file} fr ${key}`);
        assert.doesNotMatch(value, /Bon après-midi/, `${file} fr ${key}`);
      }
      for (const [key, value] of Object.entries(STR.pt)) assert.doesNotMatch(value, formalPt, `${file} pt ${key}`);
    }
    for (const key of ['err.unknown', 'err.tooLong', 'err.riskSub', 'confirm.prompt', 'thesis.line.wait']) {
      assert.doesNotMatch(RM.t('fr', key), formalFr, 'read model fr ' + key);
      assert.doesNotMatch(RM.t('pt', key), formalPt, 'read model pt ' + key);
    }
  });

  test(`${tree}: the evening greeting starts at 20:00 in Spanish and Portuguese, 18:00 elsewhere`, () => {
    const fsm = read(tree, 'app/60-fsm.js');
    const src = fsm.slice(fsm.indexOf('var EVENING_HOUR'), fsm.indexOf('function idleHint('));
    const greet = (lang, hour) => {
      let key = null;
      const ctx = vm.createContext({ SES: { localHour: hour }, LANG: lang, LEDGER: [], A: {}, el: {}, fin: Number.isFinite,
        tt: (k) => k, lineSet: (_a, k) => { key = k; } });
      vm.runInContext(src, ctx); ctx.setGreeting();
      return key;
    };
    for (const lang of LANGS) {
      assert.equal(greet(lang, 15), 'greet.afternoon', lang);
      assert.equal(greet(lang, 18.5), lang === 'es' || lang === 'pt' ? 'greet.afternoon' : 'greet.evening', lang);
      assert.equal(greet(lang, 21), 'greet.evening', lang);
    }
  });
}

test('Android onboarding: the consent button label names what is agreed to in all six languages', () => {
  const STR = table('android', 'onboarding/40-strings.js');
  for (const lang of LANGS) assert.ok(STR[lang]['risk.activate'].length > 30, lang + ': ' + STR[lang]['risk.activate']);
});
