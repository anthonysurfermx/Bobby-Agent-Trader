// F02: shipping companion render/layout and pointer handlers, with measured DOM heights.
// These geometry regressions do not replace the native WebKit capture review.
// BOBBY_COMPANION_SOURCE can point to build 71's source to demonstrate the red baseline.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const source = process.env.BOBBY_COMPANION_SOURCE
  ? readFileSync(process.env.BOBBY_COMPANION_SOURCE, 'utf8') : read('../src/app/65-companion.js');
const stringsSource = read('../src/app/40-strings.js');
const strings = vm.runInNewContext('(' + stringsSource.split('/*STRINGS-BEGIN*/')[1].split('/*STRINGS-END*/')[0] + ')');
const languages = ['en', 'es', 'fr', 'pt', 'it', 'de'];
const devices = { SE: Math.min(375 / 390, 667 / 844), ProMax: Math.min(440 / 390, 956 / 844) };

function harness({ language = 'en', scale = devices.SE, textScale = 3.12, replyLines = 4 } = {}) {
  const k = textScale / scale, calls = [];
  class Element {
    constructor(tag, className, text = '') {
      this.tag = tag; this.className = className || ''; this.text = text;
      this.style = { setProperty(key, value) { this[key] = value; } };
      this.children = []; this.attributes = {}; this.listeners = {}; this.top = 0;
      const classes = new Set(this.className.split(' '));
      this.classList = { toggle(name, on) { if (on) classes.add(name); else classes.delete(name); }, contains: (name) => classes.has(name) };
    }
    appendChild(child) { child.parentNode = this; this.children.push(child); return child; }
    insertBefore(child, before) { child.parentNode = this; this.children.splice(Math.max(0, this.children.indexOf(before)), 0, child); return child; }
    get firstChild() { return this.children[0]; }
    set textContent(value) { this.text = String(value); this.children = []; }
    get textContent() { return this.text || this.children.map((child) => child.textContent).join(''); }
    setAttribute(key, value) { this.attributes[key] = String(value); }
    getAttribute(key) { return this.attributes[key]; }
    addEventListener(name, callback) { this.listeners[name] = callback; }
    setPointerCapture() {}
    querySelector(selector) {
      const className = selector.slice(1);
      return this.children.find((child) => child.className.split(' ').includes(className)) || this.children.map((child) => child.querySelector(selector)).find(Boolean) || null;
    }
    get offsetHeight() {
      if (this.style.display === 'none' || !this.textContent) return 0;
      if (this.id === 'companion-reply') return replyLines * parseFloat(this.style.lineHeight);
      if (this.id === 'conversation-body') return 10 * 25 * k + 14;
      if (this.tag === 'button') {
        // Actual CSS: retry has 20*k line-height and 30px padding. Chips have
        // at most two 20*k label lines and 28px padding, plus an offer eyebrow.
        const primary = this.className.includes('quiet-primary');
        const eyebrow = this.querySelector('.conversation-eyebrow');
        return Math.max(44 / scale, primary ? 20 * k + 30 : 40 * k + 28 + (eyebrow ? 18 * k : 0));
      }
      return this.children.reduce((sum, child) => sum + child.offsetHeight, 0);
    }
    get scrollHeight() { return this.children.reduce((sum, child) => sum + child.offsetHeight, 0); }
    get clientHeight() { return parseFloat(this.style.height) || this.scrollHeight; }
    set scrollTop(value) { this.top = Math.max(0, Math.min(value, this.scrollHeight - this.clientHeight)); }
    get scrollTop() { return this.top; }
  }
  const context = vm.createContext({
    mk: (...args) => new Element(...args), uiEl: new Element('div'), STATES: {},
    SES: { textScale }, fitS: scale, RM: true, READ: { question: 'What is investing?' },
    tt: (key) => strings[language][key] || key,
    clamp: (value, low, high) => Math.max(low, Math.min(high, value)),
    moveSphere() {}, noop() {}, go: (state, params) => calls.push({ state, params }),
    el: { live: new Element('div') },
  });
  vm.runInContext(source, context);
  return { context, calls, k, scale, render(reply) { context.GUIDE = reply; context.guideRender(); } };
}

const answer = (extra = {}) => ({ status: 'companion', requestId: 'fixture-request',
  gist: 'Investing means putting money into something whose value may change.',
  text: 'Investing means putting money into something whose value may change. You can learn the terms first.',
  followUp: 'What does value mean?', slotReady: true, ...extra });

function frames(app) {
  const c = app.context, narrativeTop = parseFloat(c.guidePanel.style.top), actionTop = parseFloat(c.guideActions.style.top);
  return { narrativeTop, narrativeBottom: narrativeTop + c.guideNarrative.clientHeight,
    actionTop, actionBottom: actionTop + (c.guideActions.children[0]?.offsetHeight || 0), micTop: 742 };
}

for (const language of languages) {
  test(`F02 ${language}: AX5 on SE keeps a complete 27*k lead line and compacts the follow-up first`, () => {
    const app = harness({ language }); app.render(answer());
    const c = app.context, f = frames(app), oldSlot = 68 * app.k;
    assert.equal(c.GUIDE.reading, true);
    assert.ok(c.guideNarrative.clientHeight >= parseFloat(c.guideReply.style.lineHeight), 'the whole lead line is inside the reading window');
    assert.ok(parseFloat(c.guideActions.style.minHeight) < oldSlot, 'the slot releases its unused reservation before the narrative is reduced');
    assert.equal(c.guideReply.style.fontSize, 22 * app.k + 'px', 'type never shrinks');
    assert.ok(f.narrativeBottom <= f.actionTop - 16);
    assert.ok(f.actionBottom <= 700);
    assert.ok(c.guideActions.children[0].offsetHeight * app.scale >= 44);
    assert.ok(f.actionBottom < f.micTop);
  });

  test(`F02 ${language}: an overflowing AX5 error scrolls above a separate Retry and microphone`, () => {
    const app = harness({ language, replyLines: 6 });
    app.render({ status: 'companion_error', requestId: 'fixture-request', retryable: true });
    const c = app.context, f = frames(app), retry = c.guideActions.children[0];
    assert.equal(c.GUIDE.reading, true, 'errors enter the same bounded recovery as answers');
    assert.ok(c.guideNarrative.classList.contains('conversation-reading'));
    assert.ok(c.guideNarrative.clientHeight >= 27 * app.k);
    assert.ok(c.guideNarrative.scrollHeight > c.guideNarrative.clientHeight, 'the complete error remains in the scrollable region');
    assert.ok(f.narrativeBottom <= f.actionTop - 16, 'no error text crosses Retry');
    assert.ok(f.actionBottom <= 700 && f.actionBottom < f.micTop, 'Retry stays above the microphone');
    assert.ok(retry.offsetHeight * app.scale >= 44, 'Retry keeps its physical 44pt target');
    assert.equal(c.guideNarrative.tabIndex, 0, 'the scroll region can receive keyboard and accessibility focus');
    assert.equal(c.guideNarrative.getAttribute('aria-label'), strings[language]['aria.answer']);
    assert.equal(c.guideReply.textContent, strings[language]['fail.answer']);
    const event = (y) => ({ clientY: y, pointerId: 1, stopPropagation() {} });
    c.guideNarrative.listeners.pointerdown(event(300));
    c.guideNarrative.listeners.pointermove(event(-5000));
    c.guideNarrative.listeners.pointerup(event(-5000));
    assert.equal(c.guideNarrative.scrollTop + c.guideNarrative.clientHeight, c.guideNarrative.scrollHeight, 'the last error line is reachable above Retry');
    retry._guideAction();
    assert.equal(app.calls.length, 1);
    assert.equal(app.calls[0].state, 'SENDING');
    assert.equal(app.calls[0].params.params.retry, 'fixture-request', 'scrolling preserves retry of the same request');
  });
}

for (const textScale of [2.8, 3, 3.12, 3.2]) for (const offer of [false, true]) {
  test(`F02 SE scale ${textScale}, offer ${offer}: a whole lead and separated controls`, () => {
    const app = harness({ textScale });
    app.render(answer(offer ? { readOffer: { label: 'Read Bitcoin', levelLabel: 'Quick', costLine: 'Uses one read', costShort: 'one read' } } : {}));
    const c = app.context, f = frames(app);
    assert.ok(c.guideNarrative.clientHeight >= 27 * app.k);
    assert.ok(f.narrativeBottom <= f.actionTop - 16);
    assert.ok(f.actionBottom <= 700);
  });
}

for (const [device, scale] of Object.entries(devices)) for (const textScale of [1, 1.118, 1.5, 2, 3.12]) {
  const k = textScale / scale, slot = Math.max(44 / scale, 68 * k);
  const legacyHeight = Math.floor((700 - slot - 16 - 240) / (25 * k)) * 25 * k;
  if (legacyHeight < 27 * k) continue;
  test(`F02 ${device} scale ${textScale}: an already fitting reading layout stays identical to 71`, () => {
    const app = harness({ scale, textScale }); app.render(answer({ reading: true }));
    const c = app.context;
    assert.equal(c.guidePanel.style.top, '240px');
    assert.equal(c.guideNarrative.style.height, legacyHeight + 'px');
    assert.equal(c.guideActions.style.top, 700 - slot + 'px');
    assert.equal(c.guideActions.style.minHeight, slot + 'px');
    assert.equal(c.guideReply.style.fontSize, 22 * k + 'px');
    assert.equal(c.guideReply.style.lineHeight, 27 * k + 'px');
  });
}

for (const [device, scale] of Object.entries(devices)) for (const error of [false, true]) {
  test(`F02 ${device}: default-size ${error ? 'error' : 'spoken answer'} stays identical to 71`, () => {
    const app = harness({ scale, textScale: 1, replyLines: 1 });
    app.render(error ? { status: 'companion_error', retryable: true } : answer());
    const c = app.context, k = app.k, slot = 68 * k, p = (error ? 27 : 32) * k;
    const d = error ? 0 : 44 / scale, radius = Math.max(44, 44 / scale, Math.min(98, (602 - 12 - 32 - p - 4 - d - 16 - slot) / 2));
    const spare = 602 - (12 + 2 * radius + 32 + p + 4 + d + 16 + slot);
    assert.ok(spare >= 0);
    assert.equal(!!c.GUIDE.reading, false);
    assert.equal(c.guideNarrative.style.height, 'auto');
    assert.equal(c.guidePanel.style.top, 110 + .4 * Math.max(0, spare) + 2 * radius + 32 + 'px');
    assert.equal(c.guideActions.style.top, 700 - slot + 'px');
    assert.equal(c.guideReply.style.lineHeight, (error ? 27 : 32) * k + 'px');
  });
}
