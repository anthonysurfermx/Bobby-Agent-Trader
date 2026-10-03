// node --test android/nucleo/tests/read-cards-hints.test.mjs
// The read's cards and the home hints of the daily page, against the Android source:
// the thesis note is measured and the button follows it, the debate header wraps and its scroller keeps every line
// readable, each voice of the debate says what it does, and the idle hints sit next to what they are about.
// Layout itself is checked in a browser; these pin the rules the layout depends on.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const TREES = { android: new URL('../src/', import.meta.url) };
const LANGS = ['en', 'es', 'fr', 'pt', 'it', 'de'];
const read = (tree, file) => fs.readFileSync(new URL(file, TREES[tree]), 'utf8');
const fixture = (name) => JSON.parse(fs.readFileSync(new URL('./fixtures/ask/' + name + '.json', import.meta.url), 'utf8'));
const plain = (value) => JSON.parse(JSON.stringify(value));

function readModel(tree) {
  const sandbox = { console };
  sandbox.globalThis = sandbox; sandbox.window = sandbox; sandbox.self = sandbox;
  vm.runInNewContext(read(tree, 'shared/20-read-model.js'), sandbox);
  return sandbox.NucleoReadModel;
}
function appStrings(tree) {
  const src = read(tree, 'app/40-strings.js');
  return vm.runInNewContext('(' + src.split('/*STRINGS-BEGIN*/')[1].split('/*STRINGS-END*/')[0] + ')', {});
}
function fn(source, name) {
  const start = source.indexOf(`function ${name}(`), open = source.indexOf('{', start);
  assert.ok(start >= 0, 'missing function ' + name);
  let depth = 1, end = open + 1;
  while (depth) { depth += (source[end] === '{') - (source[end] === '}'); end++; }
  return source.slice(start, end);
}
// A node that records what the engine writes to it; `heights` are the measured boxes a browser would report.
function node(height = 0) {
  return { style: { setProperty() {} }, children: [], offsetHeight: height, textContent: '', className: '',
    appendChild(child) { this.children.push(child); return child; }, setAttribute() {}, querySelectorAll: () => [] };
}
function anim() { return new Proxy({ set() {}, to() {}, tween() {} }, { get: (target, key) => key in target ? target[key] : (target[key] = anim()) }); }
function cardWorld(tree, heights = {}) {
  const source = read(tree, 'app/55-read.js');
  const el = {
    cards: [node(), node(), node()], save: node(), saveSw: node(), tpill: node(),
    card0: { ch: node(heights.header ?? 17), lb: node(), mt: node(), scr: node(), inn: node(heights.debate ?? 900), disc: node(heights.footer ?? 16) },
    card1: { lb: node(), mt: node(), ct: node(), rows: node(), ln: node(heights.note ?? 32), hz: node(), xp: node() },
    card2: { lb: node(), mt: node(), ct: node(), rows: node(), go: node() },
  };
  const context = vm.createContext({ el, A: anim(), ISLAND: null, HZ: 24, VC: { wait: { c: [1, 1, 1], css: '#fff' }, review: { c: [1, 1, 1], css: '#fff' } }, C: { cardBg: [0, 0, 0] },
    D: { createTextNode: (text) => ({ textContent: text }) }, mk: (tag, cls, text) => Object.assign(node(), { tag, className: cls || '', textContent: text ?? '' }),
    op() {}, st() {}, css: () => '', mixC: () => [0, 0, 0], tt: (key) => key, saveRoll: { set() {} } });
  vm.runInContext(['fillCards', 'fillRows', 'fillThesisCard'].map((name) => fn(source, name)).join('\n'), context);
  return { el, context };
}
const px = (value) => parseFloat(value);

for (const tree of Object.keys(TREES)) {
  const RM = readModel(tree), STR = appStrings(tree), template = read(tree, 'app/template.html');

  test(`${tree}: the thesis note is measured; the save button and the card's lower edge come after it`, () => {
    const thesis = (rows) => ({ header: 'T', title: 'T', rows: Array.from({ length: rows }, (_, i) => ({ label: 'L' + i, value: 'V' + i })), line: 'note', saveLabel: 's', savedLabel: 'd', pill: 'p' });
    for (const rows of [3, 4, 5]) {
      for (const lines of [1, 2, 3, 4]) {
        const { el, context } = cardWorld(tree, { note: 16 * lines });
        context.fillThesisCard(thesis(rows), { verdict: 'wait', readOnly: false, horizon: { show: false, options: [24, 72, 168], defaultHours: 24 } });
        const noteBottom = px(el.card1.ln.style.top) + 16 * lines, saveTop = px(el.save.style.top), rowHeight = px(el.card1.rows.children[0].style.height);
        assert.ok(saveTop >= noteBottom + 4, `${rows} rows, ${lines}-line note: the button (${saveTop}) starts under the note (${noteBottom})`);
        assert.ok(px(el.card1.ln.style.top) >= 91 + rows * rowHeight, 'the note starts under the last row');
        assert.equal(px(el.cards[1].style.height), saveTop + 76, 'the card ends 24 px under the button');
        // The usual one- and two-line notes keep the card exactly as designed.
        if (lines <= 2) { assert.equal(saveTop, 284); assert.equal(px(el.cards[1].style.height), 360); }
      }
    }
    // Signed in on a Review: the horizon selector takes the note's place and still clears the button.
    const { el, context } = cardWorld(tree, { note: 48 });
    context.fillThesisCard(thesis(5), { verdict: 'review', readOnly: false, horizon: { show: true, options: [24, 72, 168], defaultHours: 24 } });
    assert.ok(px(el.card1.hz.style.top) + 32 + 4 <= px(el.save.style.top));
    assert.equal(px(el.save.style.top), 284);
  });

  test(`${tree}: the debate header may wrap, the scroller starts under it and scrolls until its last line is clear`, () => {
    const model = RM.build(fixture('nvda'), { lang: 'de' });
    const layout = (heights) => { const { el, context } = cardWorld(tree, heights); context.fillCards(model); return { top: px(el.card0.scr.style.top), height: px(el.card0.scr.style.height), el }; };
    assert.deepEqual([layout({}).top, layout({}).height], [62, 250], 'one-line header and footer: the designed scroller');
    const wrapped = layout({ header: 31 });
    assert.equal(wrapped.top, 24 + 31 + 21); assert.equal(wrapped.top + wrapped.height, 312, 'a two-line header takes its room from the scroller');
    const footer = layout({ footer: 32 });
    assert.equal(footer.top + footer.height, 296, 'a two-line footer lifts the lower edge by its extra line');
    // The fade is per edge (.up / .dn) and never part of the scroller itself, so the end of the scroll has no mask.
    assert.doesNotMatch(template, /\.card \.scr\{[^}]*mask/);
    assert.match(template, /\.card \.scr\.dn\{[^}]*mask-image/); assert.match(template, /\.card \.scr\.up\{[^}]*mask-image/);
    const render = read(tree, 'app/80-render.js');
    assert.match(render, /A\.dscrMax - A\.dscr\.x > 1/, 'the lower fade follows what is left to scroll');
    // The time label stays whole and the header label wraps: nothing in the header is cut with an ellipsis.
    const mt = /\.card \.ch \.mt\{([^}]*)\}/.exec(template)[1];
    assert.match(mt, /white-space:nowrap/); assert.match(mt, /flex:none/);
    assert.doesNotMatch(/\.card \.ch \.lb\{([^}]*)\}/.exec(template)[1], /ellipsis|nowrap/);
    // A vertical drag anywhere on the debate card scrolls it.
    assert.match(template, /<article class="card a" id="card0" data-hit="scroll">/);
  });

  test(`${tree}: each voice of the debate carries one short line saying what it does, in six languages`, () => {
    const withSynthesis = { ...fixture('nvda'), synthesis: { headline: 'H.', why: 'W.', risk: 'R.', watch: 'X.' } };
    for (const lang of LANGS) {
      const entries = plain(RM.build(withSynthesis, { lang }).debate.entries);
      const voices = entries.filter((entry) => ['syn', 'alpha', 'red', 'cio'].includes(entry.id));
      assert.ok(voices.length >= 3, lang);
      for (const voice of voices) {
        assert.equal(voice.role, RM.STRINGS[lang]['role.' + voice.id], lang + ' ' + voice.id);
        assert.ok(voice.role.length >= 12 && voice.role.length <= 48, `${lang} ${voice.id}: one short line (${voice.role})`);
        assert.doesNotMatch(voice.role, /[.!?]$/, `${lang} ${voice.id}: a caption, not a sentence`);
      }
      for (const entry of entries) if (!voices.includes(entry)) assert.equal(entry.role, undefined, lang + ' ' + entry.id);
      for (const key of ['role.syn', 'role.alpha', 'role.red', 'role.cio']) {
        assert.doesNotMatch(RM.STRINGS[lang][key], /\b(buy|sell|compr\w*|vend\w*|achet\w*|achèt\w*|kauf\w*|verkauf\w*|profit\w*|ganancia\w*|gewinn\w*|guarant\w*|garant\w*)\b/i, `${lang} ${key}: no advice or outcome language`);
      }
    }
    // The renderer shows it under the name.
    const { el, context } = cardWorld(tree);
    context.fillCards(RM.build(withSynthesis, { lang: 'es' }));
    const firstVoice = el.card0.inn.children.find((row) => row.children[1].children.some((child) => child.className === 'rl'));
    assert.ok(firstVoice, 'a caption row is rendered');
    assert.deepEqual(firstVoice.children[1].children.slice(0, 2).map((child) => child.tag), ['b', 'span']);
    assert.match(template, /\.card \.ar \.rl\{/);
  });

  test(`${tree}: the idle hints are split, each next to what it is about, and stop after three sessions`, () => {
    const fsm = read(tree, 'app/60-fsm.js');
    const run = ({ count = 0, mode = 'mic', faces = 2, swiped = false } = {}) => {
      const calls = [];
      const context = vm.createContext({ SES: { hints: { idle: count } }, HINTED: { swipe: swiped }, FACES: Array(faces).fill({}), idleMode: () => mode, tt: (key) => key,
        hint: (...lines) => calls.push(['hint', ...lines]), markHint: (key) => calls.push(['mark', key]) });
      vm.runInContext(fn(fsm, 'idleHint'), context); context.idleHint(); context.idleHint();
      return plain(calls);
    };
    assert.deepEqual(run(), [['hint', 'hint.hold', 'hint.swipe'], ['mark', 'idle'], ['hint', 'hint.hold', 'hint.swipe']], 'shown again in the session, counted once');
    assert.deepEqual(run({ mode: 'kbd' })[0], ['hint', 'hint.idleType', 'hint.swipe'], 'no voice input: tap to type');
    assert.deepEqual(run({ faces: 1 })[0], ['hint', 'hint.hold', ''], 'nothing to swipe to');
    assert.deepEqual(run({ swiped: true })[0], ['hint', 'hint.hold', ''], 'already swiped in this session');
    assert.deepEqual(run({ count: 3 }), [['hint', ''], ['hint', '']], 'three sessions have shown it');
    // hint(line) alone — every listening, typing and reading state calls it — clears the swipe row too.
    const rows = {};
    const context = vm.createContext({ hintRoll: { set: (text) => { rows.pill = text; } }, swipeRoll: { set: (text) => { rows.sphere = text; } } });
    vm.runInContext(fn(read(tree, 'app/50-actors.js'), 'hint'), context);
    context.hint('a', 'b'); assert.deepEqual(rows, { pill: 'a', sphere: 'b' });
    context.hint('c'); assert.deepEqual(rows, { pill: 'c', sphere: '' });
    context.hint(''); assert.deepEqual(rows, { pill: '', sphere: '' });
    for (const lang of LANGS) {
      assert.ok(!('hint.idle' in STR[lang]), lang + ': the combined line is gone');
      for (const key of ['hint.hold', 'hint.idleType', 'hint.swipe']) assert.ok(STR[lang][key] && !STR[lang][key].includes('·'), `${lang} ${key}: one instruction`);
    }
    // Where they sit on the 390 × 844 stage: under the sphere (its rim is at 460, the greeting at 512) and above the pill (742).
    const top = (id) => px(new RegExp('#' + id + '\\{top:(\\d+)px\\}').exec(template)?.[1] ?? /#hint,#hintS\{[^}]*top:(\d+)px/.exec(template)[1]);
    assert.ok(top('hintS') >= 490 && top('hintS') + 14 <= 512, 'the swipe hint sits between the face dots and the greeting');
    assert.ok(top('hint') >= 700 && top('hint') + 28 <= 742, 'the hold hint ends above the pill, 100 px clear of the bottom edge');
    assert.match(template, /<div id="hintS" class="a" aria-hidden="true"><\/div>/);
  });
}

