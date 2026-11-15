import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source = fs.readFileSync(new URL('../src/app/55-read.js', import.meta.url), 'utf8');
const observe = source.slice(source.indexOf('function observePresentedRead(){'), source.indexOf("/* the header's second line"));
function harness(reply = () => Promise.resolve({accepted: true})) {
  let now = 0;
  const calls = [], card = { textContent: 'Actual result', getBoundingClientRect: () => ({ left: 10, top: 200, right: 300, bottom: 400, width: 290, height: 200 }) };
  const context = vm.createContext({ ST: { name: 'CARDS' }, READ: { model: {}, reply: {status: 'ok'}, requestId: 'test-id' }, A: {cardsOn: true, rev: [{x: 1}]}, el: { cards: [card] },
    W: { innerWidth: 390, innerHeight: 844, getComputedStyle: () => ({visibility: 'visible', display: 'block', opacity: '1'}) },
    performance: {now: () => now}, canRun: () => true, bcall: (method, body) => {calls.push({method,body}); return reply();}, noop() {} });
  vm.runInContext(observe, context);
  return { context, calls, card, tick: () => context.observePresentedRead(), advance: ms => { now += ms; } };
}
test('valid parsed response alone does not claim presentation', () => { const h=harness(); h.context.A.cardsOn=false; h.tick(); h.tick(); assert.equal(h.calls.length,0); });
test('two visible settled frames acknowledge current request once without receipt/content', () => { const h=harness(); h.tick(); assert.equal(h.calls.length,0); h.tick(); h.tick(); assert.equal(h.calls.length,1); assert.equal(h.calls[0].method,'read.rendered'); assert.deepEqual(Object.keys(h.calls[0].body),['requestId']); });
test('hidden/background/sheet and unsettled cards do not acknowledge', () => { for(const kind of ['inactive','empty','unsettled','transparent','offscreen']) { const h=harness(); if(kind==='inactive')h.context.canRun=()=>false; if(kind==='empty')h.card.textContent=''; if(kind==='unsettled')h.context.A.rev[0].x=.8; if(kind==='transparent')h.context.W.getComputedStyle=()=>({opacity:'0',visibility:'visible',display:'block'}); if(kind==='offscreen')h.card.getBoundingClientRect=()=>({left:400,top:0,right:700,bottom:200,width:300,height:200}); h.tick();h.tick();assert.equal(h.calls.length,0,kind); } });
test('network failure and replaced read cannot acknowledge old request', () => { const h=harness(); h.context.READ.reply.status='error';h.tick();h.tick();assert.equal(h.calls.length,0);h.context.READ={model:{},reply:{status:'ok'},requestId:'new'};h.tick();h.tick();assert.equal(h.calls[0].body.requestId,'new'); });

// The shipping observer now knows the saved-view state as well as visual read-only mode.
test('saved snapshots never acknowledge a live read behind them', () => {
  for (const kind of ['state', 'viewOnly']) {
    const h = harness();
    if (kind === 'state') h.context.ST.name = 'THESIS_VIEW'; else h.context.A.viewOnly = true;
    h.tick(); h.tick(); assert.equal(h.calls.length, 0, kind);
    assert.equal(h.context.READ.presented, undefined);
    h.context.ST.name = 'CARDS'; h.context.A.viewOnly = false;
    h.tick(); h.tick(); assert.equal(h.calls.length, 1, 'a real live result remains eligible');
  }
});

test('a pending acknowledgment stays single-flight; a refusal or transport failure can retry after two fresh frames', async () => {
  for (const transportError of [false, true]) {
    const replies = [];
    const h = harness(() => new Promise((resolve, reject) => replies.push({resolve, reject})));
    h.tick(); h.tick();
    h.advance(10000); h.tick(); h.tick();
    assert.equal(h.calls.length, 1);
    if (transportError) replies[0].reject(new Error('bridge unavailable'));
    else replies[0].resolve({accepted: false});
    await Promise.resolve();
    for (let i = 0; i < 30; i++) h.tick();
    assert.equal(h.calls.length, 1, 'no retry storm at frame rate');
    h.advance(2000); h.tick();
    assert.equal(h.calls.length, 1);
    h.tick();
    assert.equal(h.calls.length, 2);
    assert.equal(h.calls[1].body.requestId, 'test-id');
    replies[1].resolve({accepted: true}); await Promise.resolve();
    h.advance(10000); h.tick(); h.tick();
    assert.equal(h.calls.length, 2);
    assert.equal(h.context.READ.presented, true);
  }
});

test('retries stop after three rejected acknowledgments and never send while the original result is offscreen', async () => {
  const h = harness(() => Promise.resolve({accepted: false}));
  h.tick(); h.tick(); await Promise.resolve();
  h.advance(2000);
  const originalRect = h.card.getBoundingClientRect;
  h.card.getBoundingClientRect = () => ({left: 400, top: 10, right: 700, bottom: 100, width: 300, height: 90});
  h.context.el.cards.push({textContent: 'Another visible card', getBoundingClientRect: originalRect});
  h.context.A.rev.push({x: 1});
  h.tick(); h.tick(); assert.equal(h.calls.length, 1);
  h.card.getBoundingClientRect = originalRect;
  h.tick(); assert.equal(h.calls.length, 1);
  h.tick(); await Promise.resolve();
  assert.equal(h.calls.length, 2);
  for (let i = 0; i < 8; i++) { h.advance(10000); h.tick(); h.tick(); await Promise.resolve(); }
  assert.equal(h.calls.length, 3);
  assert.notEqual(h.context.READ.presented, true);
});

test('closing the result while the acknowledgment is pending cannot retry its request from a new read', async () => {
  let refuse;
  const h = harness(() => new Promise(resolve => { refuse = resolve; }));
  h.tick(); h.tick();
  h.context.READ = null;
  refuse({accepted: false}); await Promise.resolve();
  h.advance(10000); h.tick(); h.tick();
  assert.equal(h.calls.length, 1);
  h.context.READ = {model: {}, reply: {status: 'ok'}, requestId: 'replacement'};
  h.tick(); h.tick();
  assert.deepEqual(h.calls.map(({body}) => body.requestId), ['test-id', 'replacement']);
});
