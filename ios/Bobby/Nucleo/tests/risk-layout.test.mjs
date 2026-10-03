// Exercises the real onboarding layout/input with measured-height DOM stubs, without a browser or network.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const domSource = readFileSync(new URL('../src/onboarding/30-dom.js', import.meta.url), 'utf8');
const inputSource = readFileSync(new URL('../src/onboarding/90-input.js', import.meta.url), 'utf8');
const template = readFileSync(new URL('../src/onboarding/template.html', import.meta.url), 'utf8');
const fixture = JSON.parse(readFileSync(new URL('../fixtures/native/risk-notice.json', import.meta.url), 'utf8'));

function realFunction(source, name) {
  const start = source.indexOf('function ' + name + '(');
  assert.ok(start >= 0, 'missing real function ' + name);
  const open = source.indexOf('{', start);
  let depth = 1, end = open + 1;
  for (; end < source.length && depth; end++) {
    if (source[end] === '{') depth++;
    if (source[end] === '}') depth--;
  }
  assert.equal(depth, 0);
  return source.slice(start, end);
}

function harness(language = 'en', bodyHeight = 180, titleHeights = [44, 22, 22, 44]) {
  const listeners = {}, calls = [];
  let titleIndex = 0;
  function element() {
    return {
      style: {}, attributes: {}, children: [], textContent: '', scrollTop: 0,
      appendChild(child) { this.children.push(child); },
      setAttribute(key, value) { this.attributes[key] = value; },
      get scrollHeight() { return bodyHeight; },
      get offsetHeight() {
        return this.className === 'rb' ? (this.style.height === 'auto' ? bodyHeight : this.clientHeight) : this.measuredHeight;
      },
      get clientHeight() { return parseFloat(this.style.height) || 0; },
    };
  }
  const lines = element();
  const ctx = vm.createContext({
    linesEl: lines, lineW: [], lineEls: [], rbodyEl: null, RISK_LAYOUT: null,
    W: { state: 'RISK', pr: {}, track: { x: 0 } }, T: 1, FIT: 1, FIT_X: 0, FIT_Y: 0,
    HARNESS: false, CARDS: [], cardD: {}, DSCROLL: { max: 0 },
    clamp: (value, lo, hi) => Math.max(lo, Math.min(hi, value)),
    f1: (value) => value.toFixed(1), performance: { now: () => 1000 },
    spans(el, text) { el.textContent = text; el.measuredHeight = titleHeights[titleIndex++]; return []; },
    isOn: () => ctx.W.state === 'RISK', askCapable: () => false,
    agreePress() { calls.push('agreePress'); }, agreeRelease() { calls.push('agreeRelease'); },
    buzz() {}, fire(name, payload) { calls.push([name, payload]); },
    document: { createElement: element, addEventListener(name, fn) { listeners['document.' + name] = fn; } },
    window: { addEventListener(name, fn) { listeners['window.' + name] = fn; } },
  });
  const domFunctions = ['sa', 'sc', 'st', 'buildRisk', 'layoutRisk'].map((name) => realFunction(domSource, name)).join('\n');
  vm.runInContext(domFunctions, ctx);
  // Use the same pointer handlers and DOM listeners as the shipping onboarding.
  vm.runInContext(inputSource.slice(0, inputSource.indexOf('/* ---------- typing:')), ctx);
  ctx.buildRisk(fixture.statements[language]);
  ctx.layoutRisk(452);
  return { ctx, calls, listeners, lines };
}

for (const language of ['en', 'es']) {
  test(language + ': complete version-six copy fits in a scroll region above the full-notice button', () => {
    const { ctx } = harness(language);
    const layout = ctx.RISK_LAYOUT;
    assert.equal(fixture.version, 6);
    assert.equal(ctx.rbodyEl.textContent, fixture.statements[language][0].body);
    assert.equal(ctx.rbodyEl.attributes.role, 'region');
    assert.equal(ctx.rbodyEl.attributes['aria-label'], fixture.statements[language][0].title);
    assert.ok(layout.bodyHeight >= 18);
    assert.ok(ctx.riskScrollMax() > 0, 'long text remains available below the first viewport');
    assert.ok(layout.body + layout.bodyHeight + 8 <= layout.notice);
    assert.ok(layout.notice <= 690);
    assert.ok(layout.notice + 44 < 742, 'full notice remains clear of hold to agree');
    for (let i = 0; i < ctx.lineEls.length - 1; i++) {
      assert.ok(layout.tops[i] + ctx.lineEls[i].offsetHeight < layout.tops[i + 1]);
    }
    assert.ok(layout.tops.at(-1) + ctx.lineEls.at(-1).offsetHeight < layout.body);
  });

  test(language + ': even four wrapped headings and a much longer body retain the final sentence', () => {
    const { ctx } = harness(language, 720, [44, 44, 44, 44]);
    assert.ok(ctx.RISK_LAYOUT.bodyHeight >= 18);
    assert.equal(ctx.RISK_LAYOUT.notice, 690);
    ctx.scrollRisk(Infinity);
    assert.equal(ctx.rbodyEl.scrollTop, ctx.riskScrollMax());
    assert.equal(ctx.rbodyEl.textContent, fixture.statements[language][0].body);
  });
}

test('short copy uses its measured height without introducing overlap or an unnecessary scroll gesture', () => {
  const { ctx } = harness('en', 36, [22, 22, 22, 22]);
  assert.equal(ctx.RISK_LAYOUT.bodyHeight, 36);
  assert.equal(ctx.riskScrollMax(), 0);
  assert.equal(ctx.inRiskBody(195, ctx.RISK_LAYOUT.body + 10), false);
  ctx.layoutRisk(452);
  assert.equal(ctx.RISK_LAYOUT.bodyHeight, 36, 'relayout measures uncapped content first');
});

test('dragging the body to and across the agree button scrolls without accepting or opening a notice', () => {
  const { ctx, calls } = harness('es', 540);
  const y = ctx.RISK_LAYOUT.body + 20;
  ctx.inDown(null, -1, 195, y);
  assert.equal(ctx.PTR.kind, 'risk-scroll');
  ctx.inMove(195, y - 140);
  assert.equal(ctx.rbodyEl.scrollTop, 140);
  ctx.inMove(195, 770);
  assert.equal(ctx.rbodyEl.scrollTop, 0);
  ctx.inUp(195, 770, 'pill', false);
  assert.equal(ctx.PTR, null);
  assert.deepEqual(calls, []);
  ctx.inDown(null, -1, 195, y);
  ctx.inMove(195, y - 1000);
  assert.equal(ctx.rbodyEl.scrollTop, ctx.riskScrollMax());
  ctx.inUp(null, null, null, true);
  assert.deepEqual(calls, []);
});

test('hold to agree and read-full-notice keep their own handlers', () => {
  const { ctx, calls } = harness();
  ctx.inDown('pill', -1, 195, 770);
  ctx.inUp(195, 770, 'pill', false);
  assert.deepEqual(calls, ['agreePress', 'agreeRelease']);
  ctx.inDown('notice', -1, 195, ctx.RISK_LAYOUT.notice + 10);
  ctx.inUp(195, ctx.RISK_LAYOUT.notice + 10, 'notice', false);
  assert.equal(calls[2][0], 'openNative');
  assert.equal(calls[2][1].route, 'riskNotice');
});

test('keyboard and trackpad can reach all copy without activating agreement', () => {
  const { ctx, listeners, calls } = harness();
  let prevented = 0;
  const key = (value, target = ctx.rbodyEl) => listeners['document.keydown']({ key: value, target, preventDefault() { prevented++; } });
  key('End');
  assert.equal(ctx.rbodyEl.scrollTop, ctx.riskScrollMax());
  key('Home');
  assert.equal(ctx.rbodyEl.scrollTop, 0);
  key('ArrowDown');
  assert.equal(ctx.rbodyEl.scrollTop, 18);
  key('PageDown');
  assert.ok(ctx.rbodyEl.scrollTop > 18);
  key('Home', {});
  assert.equal(prevented, 4);
  listeners['window.wheel']({ clientX: 195, clientY: ctx.RISK_LAYOUT.body + 10, deltaY: -1000 });
  assert.equal(ctx.rbodyEl.scrollTop, 0);
  assert.deepEqual(calls, []);
});

test('full accessible copy is hidden from focus outside its visible risk step', () => {
  const { ctx, lines } = harness();
  ctx.st(lines, null, 1);
  assert.equal(ctx.rbodyEl.tabIndex, 0);
  assert.equal(lines.attributes['aria-hidden'], 'false');
  ctx.st(lines, null, 0);
  assert.equal(ctx.rbodyEl.tabIndex, -1);
  assert.equal(lines.attributes['aria-hidden'], 'true');
  ctx.W.state = 'CARDS';
  assert.equal(ctx.inRiskBody(195, ctx.RISK_LAYOUT.body + 10), false);
  assert.match(template, /#lines \.rb\{[^}]*overflow-y:auto/);
});
