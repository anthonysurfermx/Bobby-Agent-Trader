// Exercises the shipping risk route, visible profile control and pointer/keyboard handlers.
// No browser, account, provider or network is contacted.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const fsm = read('../src/onboarding/60-fsm.js');
const render = read('../src/onboarding/82-render-dom.js');
const dom = read('../src/onboarding/30-dom.js');
const input = read('../src/onboarding/90-input.js');
const strings = read('../src/onboarding/40-strings.js');
const template = read('../src/onboarding/template.html');

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

function harness(language = 'en') {
  const calls = [], listeners = {}, classes = new Set();
  const profile = {
    style: {}, attributes: {}, disabled: true, tabIndex: -1,
    classList: { toggle(name, on) { if (on) classes.add(name); else classes.delete(name); } },
    setAttribute(name, value) { this.attributes[name] = value; },
  };
  const ctx = vm.createContext({
    W: { state: 'BOOT', agreeBusy: false, agree: null, pr: {} }, T: 0,
    SESSION: { onboarded: true, signedIn: true, riskAccepted: false, riskVersion: 6 },
    LANG: language, HASH: '', riskProfileEl: profile, linesEl: {}, rbodyEl: null,
    HARNESS: false, FIT: 1, FIT_X: 0, FIT_Y: 0,
    enterBorn() {}, go(name, args) { ctx.W.state = name; ctx.W.riskOnly = !!args?.only; },
    fire(name, payload) { calls.push([name, payload]); }, buzz() {},
    performance: { now: () => 1000 },
    document: { addEventListener(name, fn) { listeners['document.' + name] = fn; } },
    window: { addEventListener(name, fn) { listeners['window.' + name] = fn; } },
  });
  vm.runInContext(strings, ctx);
  ctx.LANG = language;
  vm.runInContext(['txt', 'sa', 'sc', 'st', 'cls'].map((name) => realFunction(dom, name)).join('\n'), ctx);
  vm.runInContext(realFunction(fsm, 'route') + '\n' + realFunction(fsm, 'agreeRelease'), ctx);
  vm.runInContext(realFunction(render, 'renderRiskProfile'), ctx);
  // Uses the same click, pointer-down/up and cancelled-gesture handlers as the built page.
  vm.runInContext(input.slice(0, input.indexOf('/* ---------- typing:')), ctx);
  return { ctx, calls, listeners, profile, classes };
}

for (const language of ['en', 'es']) {
  for (const scenario of ['withdrawal and relaunch', 'build 60 consent v5 upgraded to v6']) {
    test(language + ': ' + scenario + ' keeps Profile accessible without renewed AI consent', () => {
      const { ctx, profile, classes, calls } = harness(language);
      ctx.SESSION.previousRiskVersion = scenario.startsWith('build') ? 5 : 0;
      ctx.route(ctx.SESSION);
      assert.equal(ctx.W.state, 'RISK');
      assert.equal(ctx.W.riskOnly, true);
      ctx.renderRiskProfile();
      assert.equal(profile.disabled, false);
      assert.equal(profile.tabIndex, 0);
      assert.equal(profile.style.opacity, 1);
      assert.equal(profile.attributes['aria-hidden'], 'false');
      assert.equal(profile.attributes['aria-label'], language === 'es' ? 'Perfil' : 'Profile');
      assert.ok(classes.has('tap'));
      ctx.inDown('profile', -1, 328, 76);
      ctx.inUp(328, 76, 'profile', false);
      assert.equal(calls.length, 1);
      assert.equal(calls[0][0], 'openNative');
      assert.equal(calls[0][1].route, 'account');
      assert.equal(ctx.SESSION.riskAccepted, false);
      assert.equal(ctx.W.state, 'RISK');
    });
  }
}

test('a new guest at the risk step can open Profile without accepting AI processing', () => {
  const { ctx, profile, calls } = harness();
  ctx.SESSION = { onboarded: false, signedIn: false, riskAccepted: false };
  ctx.W.state = 'RISK'; ctx.W.riskOnly = false;
  ctx.renderRiskProfile();
  assert.equal(profile.disabled, false);
  ctx.action('profile', -1);
  assert.equal(calls[0][1].route, 'account');
  assert.equal(ctx.SESSION.riskAccepted, false);
});

test('opening Profile releases a pending hold so it cannot accept while the native sheet is open', () => {
  const { ctx, calls } = harness();
  ctx.W.state = 'RISK'; ctx.W.agree = { t0: 0 }; ctx.T = 0.5;
  ctx.agreeRaw = () => 0.4;
  ctx.action('profile', -1);
  assert.equal(ctx.W.agree.rel, 0.5);
  assert.equal(ctx.W.agree.p, 0.4);
  assert.equal(calls.length, 1);
  assert.equal(ctx.SESSION.riskAccepted, false);
});

test('cancelled profile pointer does not open an account sheet or accept risk', () => {
  const { ctx, calls } = harness();
  ctx.W.state = 'RISK';
  ctx.inDown('profile', -1, 328, 76);
  ctx.inUp(null, null, null, true);
  assert.deepEqual(calls, []);
  assert.equal(ctx.SESSION.riskAccepted, false);
});

test('VoiceOver or keyboard activates the same Profile action without invoking hold-to-agree', () => {
  const { ctx, listeners, calls } = harness('es');
  ctx.W.state = 'RISK';
  listeners['document.click']({ detail: 0, target: {
    closest(selector) { return selector === '[data-hit]' ? { getAttribute(name) { return name === 'data-hit' ? 'profile' : null; } } : null; },
  } });
  assert.equal(calls.length, 1);
  assert.equal(calls[0][1].route, 'account');
  assert.equal(ctx.SESSION.riskAccepted, false);
});

test('Profile leaves focus and pointer access outside RISK or while acceptance is being committed', () => {
  for (const state of ['BIRTH', 'ASK_TEACH', 'RESOLVING', 'HOME', 'DONE', 'RISK']) {
    const { ctx, profile, classes, calls } = harness();
    ctx.W.state = state; ctx.W.agreeBusy = state === 'RISK';
    ctx.renderRiskProfile();
    assert.equal(profile.disabled, true);
    assert.equal(profile.tabIndex, -1);
    assert.equal(profile.attributes['aria-hidden'], 'true');
    assert.equal(profile.style.opacity, 0);
    assert.equal(classes.has('tap'), false);
    ctx.action('profile', -1);
    assert.deepEqual(calls, []);
  }
});

test('the release template contains a 44-point profile button hidden until the risk state renders it', () => {
  assert.match(template, /<button id="riskProfile"[^>]*data-hit="profile"[^>]*aria-hidden="true"[^>]*tabindex="-1"[^>]*disabled>/);
  assert.match(template, /#riskProfile\{[^}]*height:44px/);
  assert.match(realFunction(render, 'renderLines'), /renderRiskProfile\(\)/);
});

for (const ready of [false, true]) {
  test('accessible consent activation is explicit and readiness guarded: ' + ready, () => {
    const { ctx, listeners } = harness();
    ctx.W.state = 'RISK'; ctx.W.agreeReady = ready; ctx.RISK_NOTICE = { version: 6 };
    let accepted = 0; ctx.agreeComplete = () => { accepted++; ctx.W.agreeBusy = true; };
    const target = { closest(selector) { return selector === '[data-hit]' ? { getAttribute: () => 'pill' } : null; } };
    listeners['document.click']({ detail: 1, target });
    assert.equal(accepted, 0, 'pointer click cannot bypass the hold');
    listeners['document.click']({ detail: 0, target });
    assert.equal(accepted, ready ? 1 : 0);
    listeners['document.click']({ detail: 0, target });
    assert.equal(accepted, ready ? 1 : 0, 'no repeated acceptance while busy');
  });
}
