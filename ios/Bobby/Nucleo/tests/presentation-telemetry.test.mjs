import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source = fs.readFileSync(new URL('../src/app/55-read.js', import.meta.url), 'utf8');
const observe = source.slice(source.indexOf('function observePresentedRead(){'), source.indexOf("/* the header's second line"));
function harness() {
  const calls = [], card = { textContent: 'Actual result', getBoundingClientRect: () => ({ left: 10, top: 200, right: 300, bottom: 400, width: 290, height: 200 }) };
  const context = vm.createContext({ READ: { model: {}, reply: {status: 'ok'}, requestId: 'test-id' }, A: {cardsOn: true, rev: [{x: 1}]}, el: { cards: [card] },
    W: { innerWidth: 390, innerHeight: 844, getComputedStyle: () => ({visibility: 'visible', display: 'block', opacity: '1'}) },
    canRun: () => true, bcall: (method, body) => {calls.push({method,body}); return Promise.resolve({accepted: true});}, noop() {} });
  vm.runInContext(observe, context);
  return { context, calls, card, tick: () => context.observePresentedRead() };
}
test('valid parsed response alone does not claim presentation', () => { const h=harness(); h.context.A.cardsOn=false; h.tick(); h.tick(); assert.equal(h.calls.length,0); });
test('two visible settled frames acknowledge current request once without receipt/content', () => { const h=harness(); h.tick(); assert.equal(h.calls.length,0); h.tick(); h.tick(); assert.equal(h.calls.length,1); assert.equal(h.calls[0].method,'read.rendered'); assert.deepEqual(Object.keys(h.calls[0].body),['requestId']); });
test('hidden/background/sheet and unsettled cards do not acknowledge', () => { for(const kind of ['inactive','empty','unsettled','transparent','offscreen']) { const h=harness(); if(kind==='inactive')h.context.canRun=()=>false; if(kind==='empty')h.card.textContent=''; if(kind==='unsettled')h.context.A.rev[0].x=.8; if(kind==='transparent')h.context.W.getComputedStyle=()=>({opacity:'0',visibility:'visible',display:'block'}); if(kind==='offscreen')h.card.getBoundingClientRect=()=>({left:400,top:0,right:700,bottom:200,width:300,height:200}); h.tick();h.tick();assert.equal(h.calls.length,0,kind); } });
test('network failure and replaced read cannot acknowledge old request', () => { const h=harness(); h.context.READ.reply.status='error';h.tick();h.tick();assert.equal(h.calls.length,0);h.context.READ={model:{},reply:{status:'ok'},requestId:'new'};h.tick();h.tick();assert.equal(h.calls[0].body.requestId,'new'); });
