// node --test android/nucleo/tests/first-read-cards.test.mjs
// The first read on the ONBOARDING page, against the Android source: the thesis note is
// measured and the button follows it, the debate header wraps and its scroller keeps every line readable, each voice
// says what it does, and the docked question stays clear of the Profile button during the consent step.
// The real buildCards runs on measured-height DOM stubs; layout itself is checked in a browser.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const TREES = { android: new URL('../src/', import.meta.url) };
const LANGS = ['en', 'es', 'fr', 'pt', 'it', 'de'];
const read = (tree, file) => fs.readFileSync(new URL(file, TREES[tree]), 'utf8');
const fixture = (name) => JSON.parse(fs.readFileSync(new URL('./fixtures/ask/' + name + '.json', import.meta.url), 'utf8'));
const px = (value) => parseFloat(value);

function fn(source, name) {
  const start = source.indexOf(`function ${name}(`), open = source.indexOf('{', start);
  assert.ok(start >= 0, 'missing function ' + name);
  let depth = 1, end = open + 1;
  while (depth) { depth += (source[end] === '{') - (source[end] === '}'); end++; }
  return source.slice(start, end);
}
function readModel(tree) {
  const sandbox = { console };
  sandbox.globalThis = sandbox; sandbox.window = sandbox; sandbox.self = sandbox;
  vm.runInNewContext(read(tree, 'shared/20-read-model.js'), sandbox);
  return sandbox.NucleoReadModel;
}
// A wait read, a directional read (five thesis rows) and a read with a synthesis and scenarios.
const wait = () => fixture('btc');
const plan = () => { const r = fixture('btc'); r.agents.verdict = 'review'; r.agents.direction = 'long'; return r; };
const full = () => ({ ...fixture('btc'), synthesis: { headline: 'H.', why: 'W.', risk: 'R.', watch: 'X.' },
  agents: { ...fixture('btc').agents, scenarios: { confirm: 'C.', invalidate: 'I.' } } });

// The card's nodes, with the boxes a browser would report: `note` and `header` are the measured heights.
function cards(tree, model, { note = 18, header = 14, rows = 900 } = {}) {
  const nodes = {};
  const node = (id) => nodes[id] ??= { id, style: { setProperty() {} }, textContent: '', innerHTML: '', offsetHeight: 0,
    classList: { toggle() {} } };
  node('hz').offsetHeight = note;
  node('dH').parentNode = { offsetHeight: header };
  node('dRows').offsetHeight = rows;
  // .dsc{top:<set by buildCards>;bottom:46px} inside the card's 418 px padding box
  Object.defineProperty(node('dScroll'), 'offsetHeight', { get() { return 418 - px(this.style.top || '50px') - 46; } });
  const context = vm.createContext({ $: node, CARDS: [], DSCROLL: { y: 7, max: 0 }, cardD: node('cD'), cardT: node('cT'), cardI: node('cI'),
    timeFmt: () => '', Ls: (key) => key, hexA: () => '' });
  vm.runInContext(fn(read(tree, 'onboarding/10-core.js'), 'esc') + '\n' +
    ['txt', 'sc', 'cls', 'buildCards'].map((name) => fn(read(tree, 'onboarding/30-dom.js'), name)).join('\n'), context);
  context.buildCards(model, null, model.lang);
  return { nodes, context };
}

// CSS selectors remain literal strings when matched against the source stylesheet.
function cssRule(template, selector) {
  const literalSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp('^' + literalSelector + '\\{([^}]*)\\}', 'm').exec(template)?.[1];
}

test('CSS card rules match literal backslashes, attributes and adjacent-sibling selectors', () => {
  for (const [selector, decoy] of [
    [String.raw`.token\+name`, '.token+name'],
    ['.card[data-state="open"]', '.carda'],
    ['.row + .row', '.row  .row'],
  ]) {
    const template = `${decoy}{color:red}\n${selector}{height:52px}`;
    assert.equal(cssRule(template, selector), 'height:52px', selector);
    assert.equal(cssRule(`${decoy}{color:red}`, selector), undefined, 'no regex interpretation: ' + selector);
  }
});

for (const tree of Object.keys(TREES)) {
  const RM = readModel(tree), template = read(tree, 'onboarding/template.html');
  const rule = (selector) => cssRule(template, selector);

  test(`${tree}: the thesis note is measured; the button comes after it and stays inside the card`, () => {
    for (const lang of LANGS) {
      for (const [reply, count] of [[wait(), 4], [plan(), 5]]) {
        const model = RM.build(reply, { lang, firstRead: true });
        assert.equal(model.thesis.rows.filter((row) => row.value).length, count, lang);
        for (const lines of [1, 2, 3]) {
          const { nodes } = cards(tree, model, { note: 18 * lines });
          const noteTop = px(nodes.hz.style.top), saveTop = px(nodes.save.style.top), rowsBottom = 99 + 32 * count;
          assert.ok(noteTop >= rowsBottom + 12, `${lang} ${count} rows, ${lines}-line note: it starts under the last row`);
          assert.ok(saveTop >= noteTop + 18 * lines + 8, `${lang} ${count} rows, ${lines}-line note: the button (${saveTop}) starts under the note (${noteTop + 18 * lines})`);
          assert.ok(saveTop + 52 <= 420 - 24, 'the button ends inside the card padding');
          assert.equal(px(nodes.xp.style.top), noteTop - 4, 'the XP chip takes the place of the note');
          // The footer leaves when the button reaches it; otherwise it keeps 12 px.
          assert.equal(nodes.tFoot.style.display, saveTop + 52 + 12 > 382 ? 'none' : '');
        }
        // A one-line note keeps the card exactly as designed; a two-line note on four rows moves up, the button stays.
        assert.deepEqual([px(cards(tree, model).nodes.hz.style.top), px(cards(tree, model).nodes.save.style.top)], [275, 304], lang);
        if (count === 4) assert.deepEqual([px(cards(tree, model, { note: 36 }).nodes.hz.style.top), px(cards(tree, model, { note: 36 }).nodes.save.style.top)], [257, 304], lang);
      }
    }
    assert.match(rule('.hz'), /font:400 13px\/18px/, 'the 18 px line the note is counted in');
    assert.match(rule('.btn'), /height:52px/);
  });

  test(`${tree}: the debate header wraps instead of being cut, and the scroller starts under it`, () => {
    const model = RM.build(full(), { lang: 'de', firstRead: true });
    const one = cards(tree, model), two = cards(tree, model, { header: 28 });
    assert.equal(one.nodes.dScroll.style.top, '50px', 'one-line header: the designed scroller');
    assert.equal(two.nodes.dScroll.style.top, '64px', 'a second header line takes its room from the scroller');
    assert.equal(one.context.DSCROLL.max, 900 - (418 - 50 - 46)); assert.equal(two.context.DSCROLL.max, 900 - (418 - 64 - 46));
    assert.equal(one.context.DSCROLL.y, 0, 'a new read starts at the top');
    assert.equal(cards(tree, model, { rows: 200 }).context.DSCROLL.max, 0, 'a short debate does not scroll');
    // The count stays whole and the label wraps: nothing in a card header is cut with an ellipsis.
    assert.match(rule('.ch'), /display:flex/); assert.match(rule('.ch'), /align-items:baseline/);
    assert.equal(rule('.ch span:last-child'), 'flex:none;white-space:nowrap');
    assert.doesNotMatch(template, /^\.ch span\{/m);
    // The scroller's height holds the first row's margin and ends 16 px under the last line.
    assert.equal(rule('#dRows'), 'display:flow-root;padding-bottom:16px');
    // The fade is per edge and follows the scroll, so at either end the last line has no mask over it.
    assert.doesNotMatch(rule('.dsc'), /mask/);
    for (const state of ['.dsc.more', '.dsc.up', '.dsc.up.more']) assert.match(rule(state), /^-webkit-mask-image:linear-gradient\([^;]*;mask-image:linear-gradient\(/, state);
    const render = fn(read(tree, 'onboarding/82-render-dom.js'), 'renderCards');
    assert.match(render, /cls\(dRows\.parentNode, 'more', DSCROLL\.max - DSCROLL\.y > 1\); cls\(dRows\.parentNode, 'up', DSCROLL\.y > 1\);/);
    assert.doesNotMatch(fn(read(tree, 'onboarding/30-dom.js'), 'buildCards'), /cls\(/, 'the fades are not decided once at build time');
    assert.match(template, /<div class="dsc" id="dScroll"><div id="dRows"><\/div><\/div>/);
  });

  test(`${tree}: each voice shows its caption under its name, and labeled lines are kept, in six languages`, () => {
    for (const lang of LANGS) {
      const model = RM.build(full(), { lang, firstRead: true }), html = cards(tree, model).nodes.dRows.innerHTML;
      const voices = model.debate.entries.filter((entry) => entry.role);
      assert.ok(voices.length >= 3, lang);
      for (const voice of voices) {
        assert.equal(voice.role, RM.STRINGS[lang]['role.' + voice.id], lang + ' ' + voice.id);
        assert.ok(html.includes(`<b>${voice.name}</b><span class="rl">${voice.role}</span><p>`), `${lang} ${voice.id}: name, caption, text`);
      }
      for (const entry of model.debate.entries) {
        if (!entry.role) assert.ok(html.includes(`<b>${entry.name}</b>${entry.text ? '<p>' : '<p><span class="lk">'}`), `${lang} ${entry.id}: no caption`);
        for (const line of entry.lines || []) assert.ok(html.includes(`<p><span class="lk">${line.label}:</span> ${line.text}</p>`), `${lang} ${entry.id}: ${line.label}`);
      }
      assert.equal((html.match(/<div class="row lbl"/g) || []).length, model.debate.entries.length, lang);
      assert.doesNotMatch(html, /<p><\/p>/, lang + ': an entry without text leaves no empty paragraph');
    }
    // Server text is escaped wherever it lands.
    const hostile = full(); hostile.agents.alpha = 'a <b> & "c"'; hostile.synthesis.why = '<i>';
    const html = cards(tree, RM.build(hostile, { lang: 'en', firstRead: true })).nodes.dRows.innerHTML;
    assert.ok(html.includes('<p>a &lt;b&gt; &amp; &quot;c&quot;</p>')); assert.doesNotMatch(html, /<i>(?!<\/i>)/);
    assert.match(rule('.row .rl'), /display:block/); assert.match(rule('.row .rl'), /text-transform:none/);
    assert.equal(rule('.row p .lk'), 'font-weight:600');
    // A word wider than the text column breaks inside it instead of widening the column past the card.
    assert.equal(rule('.row > div'), 'min-width:0;overflow-wrap:anywhere');
  });
}

test('Android consent step: the docked question stops 8 px before the Profile button and has its line back afterwards', () => {
  const template = read('android', 'onboarding/template.html'), render = fn(read('android', 'onboarding/82-render-dom.js'), 'renderTexts');
  const dq = /^#dq\{([^}]*)\}/m.exec(template)[1], profile = /^#riskProfile\{([^}]*)\}/m.exec(template)[1];
  assert.match(dq, /left:75px;width:240px/); assert.match(dq, /white-space:nowrap;overflow:hidden;text-overflow:ellipsis/);
  assert.match(profile, /left:auto;right:20px/); assert.match(profile, /min-width:82px/);
  assert.match(template, /^\*\{box-sizing:border-box/m, 'padding narrows the line, it does not widen the box');
  const statement = /sc\(dqEl, 'paddingRight', [^\n]*\);/.exec(render)[0];
  assert.match(statement, /W\.state === 'RISK' && !W\.agreeBusy \?/, 'exactly while the Profile button shows (renderRiskProfile)');
  const pad = (state, busy, width) => {
    const dqEl = { style: {}, offsetLeft: 75, offsetWidth: 240 };
    const context = vm.createContext({ dqEl, riskProfileEl: { offsetLeft: 390 - 20 - width }, W: { state, agreeBusy: busy } });
    vm.runInContext(fn(read('android', 'onboarding/30-dom.js'), 'sc') + '\n' + statement, context);
    return dqEl.style.paddingRight;
  };
  // The button grows with its label (82 px for "Profile" and "Perfil", about 110 px for "Il tuo profilo").
  for (const width of [82, 92, 98, 105, 110, 140]) {
    const right = 75 + 240 - px(pad('RISK', false, width));
    assert.equal(right, 390 - 20 - width - 8, width + ' px button: the line ends 8 px before it');
  }
  assert.equal(pad('RISK', false, 40), '0px', 'a button that does not reach the line leaves it whole');
  assert.equal(pad('RISK', true, 110), '', 'accepted: the button leaves and the full line is back');
  for (const state of ['COMMIT', 'RESOLVING', 'THINK_WAIT', 'VERDICT', 'CARDS']) assert.equal(pad(state, false, 110), '', state);
});
