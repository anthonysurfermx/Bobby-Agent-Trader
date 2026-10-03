// Exercises the real onboarding layout/input with measured-height DOM stubs, without a browser or network.
// The Android source is checked: the consent copy is laid out by the same rules.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const read = (url) => readFileSync(new URL(url, import.meta.url), 'utf8');
const TREES = { android: { src: '../src/onboarding/', fixture: '../risk-notice.json' } };
const LANGS = ['en', 'es', 'fr', 'pt', 'it', 'de'];

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

for (const [tree, paths] of Object.entries(TREES)) {
  const domSource = read(paths.src + '30-dom.js');
  const inputSource = read(paths.src + '90-input.js');
  const renderSource = read(paths.src + '82-render-dom.js');
  const fsmSource = read(paths.src + '60-fsm.js');
  const template = read(paths.src + 'template.html');
  const fixture = JSON.parse(read(paths.fixture));

  function harness(language = 'en', bodyHeight = 180, titleHeights = [44, 22, 22, 44]) {
    const listeners = {}, calls = [];
    let titleIndex = 0;
    function element() {
      const classes = new Set();
      return {
        style: {}, attributes: {}, children: [], textContent: '', scrollTop: 0, classes,
        classList: { toggle(name, on) { if (on) classes.add(name); else classes.delete(name); } },
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
    const domFunctions = ['sa', 'sc', 'st', 'cls', 'buildRisk', 'layoutRisk', 'riskCue'].map((name) => realFunction(domSource, name)).join('\n');
    vm.runInContext(domFunctions, ctx);
    // Use the same pointer handlers and DOM listeners as the shipping onboarding.
    vm.runInContext(inputSource.slice(0, inputSource.indexOf('/* ---------- typing:')), ctx);
    ctx.buildRisk(fixture.statements[language]);
    ctx.layoutRisk(452);
    return { ctx, calls, listeners, lines };
  }

  for (const language of LANGS) {
    test(tree + ' ' + language + ': the complete consent copy fits in a scroll region above the full-notice button', () => {
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

    test(tree + ' ' + language + ': even four wrapped headings and a much longer body retain the final sentence', () => {
      const { ctx } = harness(language, 720, [44, 44, 44, 44]);
      const layout = ctx.RISK_LAYOUT;
      assert.ok(layout.bodyHeight >= 18);
      assert.ok(layout.body + layout.bodyHeight + 8 <= layout.notice);
      assert.ok(layout.notice <= 690);
      ctx.scrollRisk(Infinity);
      assert.equal(ctx.rbodyEl.scrollTop, ctx.riskScrollMax());
      assert.equal(ctx.rbodyEl.scrollTop + ctx.rbodyEl.clientHeight, ctx.rbodyEl.scrollHeight, 'the last line ends inside the viewport');
      assert.equal(ctx.rbodyEl.textContent, fixture.statements[language][0].body);
    });
  }

  test(tree + ': short copy uses its measured height without introducing overlap or an unnecessary scroll gesture', () => {
    const { ctx } = harness('en', 36, [22, 22, 22, 22]);
    assert.equal(ctx.RISK_LAYOUT.bodyHeight, 36);
    assert.equal(ctx.riskScrollMax(), 0);
    assert.equal(ctx.inRiskBody(195, ctx.RISK_LAYOUT.body + 10), false);
    ctx.layoutRisk(452);
    assert.equal(ctx.RISK_LAYOUT.bodyHeight, 36, 'relayout measures uncapped content first');
  });

  test(tree + ': copy that fits is shown whole, at its own height, with no fade and no cue', () => {
    // 118 px is the room four single-line headings leave with 8 px above the button: the copy that exactly fills it is not cut to whole lines.
    for (const natural of [36, 50, 118]) {
      const { ctx } = harness('en', natural, [22, 22, 22, 22]);
      assert.equal(ctx.RISK_LAYOUT.bodyHeight, natural);
      assert.equal(ctx.riskCue(), false);
      assert.deepEqual([...ctx.rbodyEl.classes], []);
    }
  });

  test(tree + ': copy taller than its viewport ends on a whole line and fades where it continues until the end is in view', () => {
    for (const [natural, titles] of [[144, [22, 22, 22, 22]], [180, [44, 22, 22, 22]], [162, [44, 22, 44, 22]], [720, [44, 44, 44, 44]]]) {
      const { ctx } = harness('de', natural, titles);
      const layout = ctx.RISK_LAYOUT, body = ctx.rbodyEl;
      assert.ok(layout.bodyHeight < natural);
      assert.equal(layout.bodyHeight % 18, 0, 'never cut through a line');
      assert.equal(layout.notice, layout.body + layout.bodyHeight + 8, 'the full-notice button follows the viewport');
      assert.equal(ctx.riskCue(), true, 'more below at rest');
      assert.deepEqual([...body.classes], ['dn']);
      ctx.scrollRisk(18);
      assert.equal(ctx.riskCue(), ctx.riskScrollMax() > 18);
      assert.ok(body.classes.has('up'));
      ctx.scrollRisk(Infinity);
      assert.equal(ctx.riskCue(), false, 'the cue leaves once the last line is in view');
      assert.deepEqual([...body.classes], ['up']);
      assert.equal(body.scrollTop + body.clientHeight, body.scrollHeight);
      assert.ok(layout.body + body.clientHeight <= layout.notice, 'the end of the copy is revealed above the button, never under it');
      ctx.scrollRisk(0);
      assert.equal(ctx.riskCue(), true);
      assert.deepEqual([...body.classes], ['dn']);
    }
  });

  test(tree + ': a viewport cut at the cap takes one more whole line when 4 px above the button are enough for it', () => {
    // Two wrapped statements on the web (26 px a line: the Italian notice) and three on iOS (22 px a line) leave 54 to
    // 58 px over the button's cap: with the usual 8 px above the button that is 4 px short of a third line.
    for (const titles of [[52, 26, 52, 26], [44, 44, 44, 22]]) {
      const { ctx } = harness('it', 162, titles);
      const layout = ctx.RISK_LAYOUT, body = ctx.rbodyEl;
      assert.equal(layout.bodyHeight, 54, 'three whole lines, not two');
      assert.equal(layout.notice, 690, 'the button is not pushed below its cap');
      assert.ok(layout.notice - (layout.body + layout.bodyHeight) >= 4, 'the copy still ends above the button');
      assert.ok(layout.notice + 44 < 742, 'full notice remains clear of hold to agree');
      assert.equal(ctx.riskCue(), true);
      ctx.scrollRisk(Infinity);
      assert.equal(body.scrollTop + body.clientHeight, body.scrollHeight);
      assert.ok(layout.body + body.clientHeight <= layout.notice, 'the end of the copy is revealed above the button, never under it');
    }
    // With room to spare nothing moves: the button keeps its 8 px under the viewport.
    const { ctx } = harness('it', 162, [26, 26, 52, 26]);
    assert.equal(ctx.RISK_LAYOUT.bodyHeight, 72);
    assert.equal(ctx.RISK_LAYOUT.notice, ctx.RISK_LAYOUT.body + ctx.RISK_LAYOUT.bodyHeight + 8);
  });

  test(tree + ': dragging the body to and across the agree button scrolls without accepting or opening a notice', () => {
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

  test(tree + ': a drag that starts on a statement or just under the body scrolls the body too', () => {
    const { ctx, calls } = harness('fr');
    const layout = ctx.RISK_LAYOUT;
    for (const y of [layout.tops[0] + 5, layout.tops[3] + 5, layout.body + layout.bodyHeight + 4]) {
      ctx.inDown(null, -1, 195, y);
      assert.equal(ctx.PTR.kind, 'risk-scroll');
      ctx.inMove(195, y - 36);
      assert.equal(ctx.rbodyEl.scrollTop, 36);
      ctx.inUp(195, y - 36, null, false);
      ctx.scrollRisk(0);
    }
    assert.equal(ctx.inRiskBody(195, layout.top - 6), false, 'the ring and the sphere stay out of it');
    assert.equal(ctx.inRiskBody(195, layout.notice + 6), false, 'the full-notice button keeps its own taps');
    assert.equal(ctx.inRiskBody(10, layout.body + 10), false);
    assert.deepEqual(calls, []);
  });

  test(tree + ': hold to agree and read-full-notice keep their own handlers', () => {
    const { ctx, calls } = harness();
    ctx.inDown('pill', -1, 195, 770);
    ctx.inUp(195, 770, 'pill', false);
    assert.deepEqual(calls, ['agreePress', 'agreeRelease']);
    ctx.inDown('notice', -1, 195, ctx.RISK_LAYOUT.notice + 10);
    ctx.inUp(195, ctx.RISK_LAYOUT.notice + 10, 'notice', false);
    assert.equal(calls[2][0], 'openNative');
    assert.equal(calls[2][1].route, 'riskNotice');
  });

  test(tree + ': keyboard and trackpad can reach all copy without activating agreement', () => {
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

  test(tree + ': full accessible copy is hidden from focus outside its visible risk step', () => {
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

  test(tree + ': the page carries the fades and the more-below chevron, placed under the viewport and driven by the scroll position', () => {
    assert.match(template, /#lines \.rb\{[^}]*font:400 13px\/18px/, 'the 18 px line the viewport is cut to');
    for (const state of ['dn', 'up', 'up\\.dn']) {
      assert.match(template, new RegExp('#lines \\.rb\\.' + state + '\\{-webkit-mask-image:linear-gradient\\([^}]*;mask-image:linear-gradient\\('));
    }
    assert.match(template, /<div id="rmore" class="a" aria-hidden="true"><svg /);
    assert.match(realFunction(fsmSource, 'riskLinesIn'), /sc\(rmoreEl, 'top', f1\(L\.body \+ L\.bodyHeight \+ 1\) \+ 'px'\)/);
    const renderLines = realFunction(renderSource, 'renderLines');
    assert.match(renderLines, /st\(rmoreEl, [^;]*riskCue\(\) \? ro : 0\);/);
    assert.match(renderLines, /st\(linesEl, null, 0\); st\(rmoreEl, null, 0\);/, 'no chevron without the copy');
  });
}

