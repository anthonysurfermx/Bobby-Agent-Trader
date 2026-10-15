// Source-level regression with measured-layout DOM doubles. This exercises the real first-question
// transition and shipping pointer/keyboard handlers; native captures/VoiceOver remain separate gates.
// BASELINE: BOBBY_CONSENT_SOURCE=/path/to/build-71-85-consent-preview.js node --test <this file>
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const read = file => readFileSync(new URL('../' + file, import.meta.url), 'utf8');
const consent = process.env.BOBBY_CONSENT_SOURCE
  ? readFileSync(process.env.BOBBY_CONSENT_SOURCE, 'utf8') : read('src/onboarding/85-consent-preview.js');
const dom = read('src/onboarding/30-dom.js');
const input = read('src/onboarding/90-input.js');
const fsm = read('src/onboarding/60-fsm.js');
const strings = read('src/onboarding/40-strings.js');
const STR = vm.runInNewContext(strings.slice(strings.indexOf('var STR = '), strings.indexOf('\nvar LANG')) + ';STR');
const legal = JSON.parse(read('fixtures/native/risk-notice.json'));
const LANGS = ['en', 'es', 'fr', 'pt', 'it', 'de'];
const DEVICES = { SE: [375, 667], Max: [440, 956] };

function realFunction(source, name) {
  const start = source.indexOf('function ' + name + '(');
  assert.ok(start >= 0, 'missing real function ' + name);
  let depth = 1, end = source.indexOf('{', start) + 1;
  for (; depth; end++) { if (source[end] === '{') depth++; if (source[end] === '}') depth--; }
  return source.slice(start, end);
}

async function firstQuestion(language, device, textScale) {
  const timers = [], listeners = {}, native = [], errors = [];
  function element() {
    const classes = new Set();
    return {
      style: { setProperty(key, value) { this[key] = value; } }, attributes: {}, children: [], classes,
      parentNode: null, className: '', ownText: '', scrollTop: 0, tabIndex: -1,
      classList: {
        add(name) { classes.add(name); }, remove(name) { classes.delete(name); },
        toggle(name, on) { if (on) classes.add(name); else classes.delete(name); },
      },
      appendChild(child) {
        if (child.parentNode) child.parentNode.removeChild(child);
        this.children.push(child); child.parentNode = this; return child;
      },
      removeChild(child) { this.children.splice(this.children.indexOf(child), 1); child.parentNode = null; },
      set innerHTML(value) { assert.equal(value, ''); this.children.forEach(child => child.parentNode = null); this.children = []; this.ownText = ''; },
      get textContent() { return this.ownText + this.children.map(child => child.textContent).join(''); },
      set textContent(value) { this.ownText = String(value); this.children = []; },
      setAttribute(key, value) { this.attributes[key] = String(value); },
      getAttribute(key) { return this.attributes[key] ?? null; },
      removeAttribute(key) { delete this.attributes[key]; },
      addEventListener(name, fn) { this[name] = fn; }, blur() {},
      get offsetHeight() {
        const fixed = parseFloat(this.style.height);
        return Number.isNaN(fixed) ? this.scrollHeight : fixed;
      },
      get clientHeight() { return this.offsetHeight; },
      get scrollHeight() {
        const title = this.className === 'ln', size = parseFloat(this.style.fontSize) || (title ? 19 : 13);
        const line = parseFloat(this.style.lineHeight) || (title ? 22 : 18);
        const width = parseFloat(this.style.width) || (title ? 350 : 330);
        // Deliberately preserve complete lines; browser/native evidence uses the real font metrics.
        const textHeight = this.ownText ? Math.ceil(this.ownText.length * size * .53 / width) * line : 0;
        return Math.max(textHeight, ...this.children.map(child => (parseFloat(child.style.top) || 0) + child.offsetHeight), 0);
      },
    };
  }
  const stage = element(), sheet = element(), lines = element(), notice = element(), more = element();
  const [width, height] = DEVICES[device], fit = Math.min(width / 390, height / 844);
  const c = {
    document: { createElement: element, addEventListener(name, fn) { listeners['document.' + name] = fn; } },
    window: { PointerEvent: true, addEventListener(name, fn) { listeners['window.' + name] = fn; } },
    linesEl: lines, lineEls: [], lineW: [], rbodyEl: null, RISK_LAYOUT: null,
    noticeEl: notice, rmoreEl: more, stage, pill: element(),
    $: id => id === 'sheet' ? sheet : null,
    W: { state: 'TYPING', gen: 0, qw: [], pr: {}, log: [], txShift: {}, tintAmt: {}, wash: {}, track: { x: 0 } },
    SESSION: { riskAccepted: false, textScale }, RISK_NOTICE: { version: legal.version, statements: legal.statements[language] },
    ENTER: {}, T: 0, FIT: fit, FIT_X: 0, FIT_Y: 0, FIRST_HELLO_UNTIL: 1,
    HARNESS: false, CARDS: [], cardD: {}, DSCROLL: { max: 0 },
    typeIn: { value: STR[language]['ex.1'], blur() {} }, typeComposing: false,
    clamp: (value, lo, hi) => Math.max(lo, Math.min(hi, value)), f1: value => value.toFixed(1),
    performance: { now: () => c.T * 1000 },
    spans(el, text) { el.textContent = text; return []; },
    at(delay, fn) { timers.push({ at: c.T + delay, fn }); },
    clearWords() { c.W.qw = []; }, updateWords(text) { c.W.qw = text.split(' '); },
    showTypeBox() {}, setPill() {}, setHint() {}, isOn: () => true, tg() {}, tb() {},
    to() {}, moveSphere() {}, buzz() {}, after() {}, hap() {}, crit() {}, capGone() {},
    beatPost() {}, harnessOn() {}, signal() {}, agreeRelease() {}, renderTexts() {}, route() {},
    Ls: key => STR[language][key], pillFor: (_, min) => min,
    loadRisk: () => Promise.resolve(), fire: (...args) => native.push(args),
    report: (...args) => errors.push(args), deliverFirstAsk: () => assert.fail('no request before consent'),
  };
  vm.createContext(c);
  vm.runInContext(['sa', 'sc', 'st', 'cls', 'buildRisk', 'riskCue'].map(name => realFunction(dom, name)).join('\n'), c);
  vm.runInContext(input.slice(0, input.indexOf('/* ---------- typing:')), c);
  vm.runInContext(realFunction(fsm, 'go') + '\n' + realFunction(fsm, 'commitQuestion') + '\n' + realFunction(fsm, 'typeSubmit'), c);
  vm.runInContext(fsm.slice(fsm.indexOf('ENTER.COMMIT ='), fsm.indexOf('/* ---------- typing:')), c);
  vm.runInContext(consent, c);
  c.typeSubmit();
  while (timers.length) { timers.sort((a, b) => a.at - b.at); const task = timers.shift(); c.T = task.at; task.fn(); }
  await Promise.resolve(); await Promise.resolve();
  assert.deepEqual(errors, []);
  assert.deepEqual(Array.from(c.W.log, entry => entry[0]), ['COMMIT', 'RISK']);
  assert.equal(c.W.riskOnly, false, 'normal first-question consent, without preview or risk-only routing');
  assert.equal(c.W.question, STR[language]['ex.1']);
  assert.equal(c.SESSION.riskAccepted, false);
  assert.deepEqual(native, [], 'the question is not sent before agreement');
  return { c, listeners, native, fit };
}

for (const language of LANGS) for (const device of Object.keys(DEVICES)) {
  test(`F01 ${language} ${device} AX5: all titles and AI disclosure scroll above pinned Full notice`, async () => {
    const { c, listeners, native, fit } = await firstQuestion(language, device, 3.12);
    const layout = c.RISK_LAYOUT, region = c.rbodyEl;
    const body = region._consentBody || region;
    assert.ok(layout.body + layout.bodyHeight <= layout.notice - 8, 'disclosure viewport ends above Full notice');
    assert.equal(body.textContent, legal.statements[language][0].body, 'the complete native legal copy survives');
    assert.equal(region.attributes.role, 'region');
    c.st(c.linesEl, null, 1);
    assert.equal(region.tabIndex, 0, 'the scrolling region is keyboard/VoiceOver reachable');
    assert.equal(region.style.pointerEvents, 'auto');
    for (const [index, title] of c.lineEls.entries()) {
      assert.equal(title.parentNode, region, 'each title belongs to the same scrolling disclosure');
      assert.equal(title.textContent, legal.statements[language][index].title);
      assert.equal(title.style.fontSize, 19 * 3.12 + 'px', 'accessibility type never shrinks');
      assert.equal(title.style.overflowWrap, 'anywhere', 'long legal words can wrap without horizontal clipping');
    }
    assert.equal(body.style.fontSize, 13 * 3.12 + 'px');
    assert.equal(body.style.overflowWrap, 'anywhere');
    assert.ok(c.riskCue(), 'the existing visible chevron indicates more disclosure');
    assert.ok(parseFloat(c.rmoreEl.style.top) + 7 < layout.notice);
    assert.equal(parseFloat(c.stage.style['--preview-target']) * fit, 44);
    const pinned = c.noticeEl.style.top;
    c.inDown(null, -1, 195, layout.top + 20); c.inMove(195, layout.top - 180); c.inUp(195, layout.top - 180, null, false);
    assert.ok(region.scrollTop > 0, 'the real drag handler scrolls titles and body together');
    listeners['document.keydown']({ target: region, key: 'End', preventDefault() {} });
    assert.equal(region.scrollTop + region.clientHeight, region.scrollHeight, 'the final legal line can be fully revealed');
    assert.equal(c.riskCue(), false);
    assert.equal(c.noticeEl.style.top, pinned, 'Full notice stays fixed while disclosure scrolls');
    c.action('notice', -1);
    assert.deepEqual(JSON.parse(JSON.stringify(native)), [['openNative', { route: 'riskNotice' }]], 'Full notice still opens its native view');
    assert.equal(c.W.agreeReady, true);
    assert.equal(c.consentPreviewNotNow.textContent, STR[language]['risk.notNow']);
  });
}

test('F01: fitting layouts preserve build-71 geometry and DOM in every language', async () => {
  for (const language of LANGS) {
    const { c } = await firstQuestion(language, 'SE', 1);
    assert.equal(c.RISK_LAYOUT.scrollAll, undefined);
    assert.equal(c.rbodyEl.parentNode, c.linesEl);
    assert.ok(c.lineEls.every(line => line.parentNode === c.linesEl));
    assert.equal(c.RISK_LAYOUT.top, 404); assert.equal(c.RISK_LAYOUT.notice, 642);
    let y = 404;
    c.lineEls.forEach((line, index) => { assert.equal(c.RISK_LAYOUT.tops[index], y); y += line.offsetHeight + 4; });
    y += 8;
    assert.equal(c.RISK_LAYOUT.body, y);
    assert.equal(c.RISK_LAYOUT.bodyHeight, Math.min(c.rbodyEl.scrollHeight, Math.max(18, Math.floor((638 - y) / 18) * 18)));
    assert.equal(c.rbodyEl.style['--risk-solid'], '72px');
  }
});

test('F01: repeated accessibility relayout does not nest regions and restores a fitting layout', async () => {
  const { c } = await firstQuestion('de', 'SE', 3.12);
  c.consentRiskLayout();
  assert.equal(c.rbodyEl.parentNode, c.linesEl);
  assert.equal(c.rbodyEl.children.length, 5);
  c.SESSION.textScale = 1; c.consentRiskLayout();
  assert.equal(c.RISK_LAYOUT.scrollAll, undefined);
  assert.equal(c.linesEl.children.length, 5);
  assert.equal(c.rbodyEl.attributes.role, 'region');
  assert.ok(c.lineEls.every(line => line.parentNode === c.linesEl));
});

test('F01: resizing a scrolled fitting disclosure clears the nested body fade and its cached state', async () => {
  const { c } = await firstQuestion('de', 'SE', 1);
  const body = c.rbodyEl;
  assert.equal(c.riskCue(), true); assert.equal(body._kdn, true);
  c.scrollRisk(Infinity); c.riskCue();
  assert.equal(body._kup, true); assert.equal(body._kdn, false);
  c.SESSION.textScale = 3.12; c.consentRiskLayout();
  assert.equal(c.rbodyEl._consentBody, body);
  assert.equal(body.scrollTop, 0);
  assert.equal(body._kup, false); assert.equal(body._kdn, false);
  assert.deepEqual([...body.classes], [], 'only the outer scrolling region may mask its edges');
  c.scrollRisk(Infinity); c.riskCue();
  assert.deepEqual([...body.classes], []);
  c.SESSION.textScale = 1; c.consentRiskLayout(); c.riskCue();
  assert.equal(c.rbodyEl, body); assert.equal(body._kup, false); assert.equal(body._kdn, true);
  c.SESSION.textScale = 3.12; c.consentRiskLayout();
  assert.equal(body._kup, false); assert.equal(body._kdn, false);
  assert.deepEqual([...body.classes], []);
});

test('F01: a preceding question click cannot decline; a new Not now press and accessibility activation can', async () => {
  async function consent() {
    const { c } = await firstQuestion('es', 'SE', 3.12);
    c.firstRunHold = (text, caption) => { c.W.state = 'HELD_DRAFT'; c.W.speechDraft = text; c.W.heldCaption = caption; };
    return c;
  }
  const c = await consent(), later = c.consentPreviewNotNow;
  later.click({ detail: 1 });
  assert.equal(c.W.state, 'RISK', 'an inherited compatibility click has no press on the newly appeared control');
  assert.equal(c.W.question, STR.es['ex.1']);
  later.pointerdown(); later.pointercancel(); later.click({ detail: 1 });
  assert.equal(c.W.state, 'RISK', 'a cancelled press cannot arm a later pointer click');
  later.pointerdown(); later.click({ detail: 1 });
  assert.equal(c.W.state, 'HELD_DRAFT');
  assert.equal(c.W.speechDraft, STR.es['ex.1']); assert.equal(c.W.heldCaption, 'risk.kept');
  assert.equal(c.consentNotNowArmed, false, 'the click consumes its own pointer arm');
  const accessible = await consent();
  accessible.consentPreviewNotNow.click({ detail: 0 });
  assert.equal(accessible.W.state, 'HELD_DRAFT', 'VoiceOver and keyboard activation need no pointer press');
  assert.equal(accessible.W.speechDraft, STR.es['ex.1']);
});
