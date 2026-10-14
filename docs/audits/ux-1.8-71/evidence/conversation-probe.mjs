// Runs the shipping JS engine and bridge with native-shaped replies and a small DOM adapter.
// This verifies boot/event integration, not WebKit layout, canvas rendering or a real account.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';


const sourceURL = new URL('../../../../ios/Bobby/Nucleo/tests/bridge-boot.test.mjs',import.meta.url);
const read = (path) => readFileSync(new URL(path, sourceURL), 'utf8');
const locale = read('../src/shared/05-locale.js');
const bridge = read('../src/shared/10-bridge.js');
const readModel = read('../src/shared/20-read-model.js');
const template = read('../src/app/template.html');
const appFiles = readdirSync(new URL('../src/app/', sourceURL)).filter((name) => name.endsWith('.js')).sort();
const switches = JSON.parse(read('../talk-mode.json'));
const engine = `var TALK_MODE=${JSON.stringify(switches.TALK_MODE)}, READ_CONFIRM=${switches.READ_CONFIRM}, FIRST_RUN_HANDOVER=${switches.FIRST_RUN_HANDOVER};\n` + appFiles.map((name) => read('../src/app/' + name)).join('\n');
const roster = JSON.parse(read('../fixtures/native/roster.json'));
const momo = roster.companions.find((companion) => companion.id === 'momo');
assert.ok(momo, 'the native roster must include Momo');

class Element {
  constructor(attributes = {}) {
    this.attributes = { ...attributes }; this.style = { setProperty() {} };
    this.children = []; this.queries = new Map(); this.listeners = {}; this.value = '';
    this.clientWidth = this.scrollWidth = 200; this.scrollHeight = 50;
    const classes = new Set((attributes.class || '').split(/\s+/).filter(Boolean));
    this.classList = {
      add(...names) { names.forEach((name) => classes.add(name)); },
      remove(...names) { names.forEach((name) => classes.delete(name)); },
      contains(name) { return classes.has(name); },
      toggle(name, on = !classes.has(name)) { if (on) classes.add(name); else classes.delete(name); return on; },
    };
  }
  set textContent(value) { this.text = String(value); this.children = []; }
  get textContent() { return this.text || this.children.map((child) => child.textContent).join(''); }
  get firstChild() { return this.children[0] || this.appendChild(new Element()); }
  appendChild(child) { child.parentNode = this; this.children.push(child); return child; }
  insertBefore(child, before) { child.parentNode = this; const i = this.children.indexOf(before); if (i < 0) this.children.push(child); else this.children.splice(i,0,child); return child; }
  removeChild(child) { this.children = this.children.filter((node) => node !== child); child.parentNode = null; return child; }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  getAttribute(name) { return this.attributes[name] ?? null; }
  removeAttribute(name) { delete this.attributes[name]; }
  querySelector(selector) {
    if(selector === ".conversation-eyebrow") {
      const find = node => node.children.find(child => child.attributes.class === "conversation-eyebrow") || node.children.map(find).find(Boolean);
      return find(this) || null;
    }
    if (!this.queries.has(selector)) this.queries.set(selector, this.appendChild(new Element()));
    return this.queries.get(selector);
  }
  querySelectorAll(selector) {
    if (selector === 'button' && this.id === 'companionPanel') {
      const collect = node => node.children.flatMap(child => child._guideAction ? [child] : collect(child));
      return collect(this);
    }
    return Array.from({ length: this.attributes.id === 'meri' ? 4 : 3 }, (_, index) => this.querySelector(selector + index)); }
  addEventListener(name, callback) { this.listeners[name] = callback; }
  getBoundingClientRect() { return { left: 0, top: 0, width: 100, height: 30 }; }
  // What a browser would measure; a test hands in `measure` when a height decides something.
  get offsetHeight() { return this.measure ? this.measure(this) : undefined; }
  getComputedTextLength() { return 40; }
  getTotalLength() { return 300; }
  getPointAtLength() { return { x: 0, y: 0 }; }
  getContext() { return null; } // Exercise the engine's supported no-WebGL fallback.
  closest(selector) {
    if (selector === '[data-hit]' && this.attributes['data-hit'] || selector === '#' + this.id || selector === 'button' && this._guideAction) return this;
    return this.parentNode?.closest(selector) || null;
  }
  contains() { return true; }
  focus() {}
  blur() {}
}

function harness({ legacyEvents = false, language = 'en', rejectCollections = false, nudgeActive = true,
  suggestions = { v: 1, quickAccess: [] }, holdAsks = false, measure = null, stallCollections = false,
  theses = { v: 1, items: [] }, saved = null, pendingAsk = null, speak = 'muted', speaking = null, chooseFails = false, companionAnswer = () => ({question:null}) } = {}) {
  const nodes = new Map(), calls = [], errors = [], pending = [];
  const made = () => Object.assign(new Element(), { measure });
  for (const match of template.matchAll(/<[^>]+\bid="([^"]+)"[^>]*>/g)) {
    const attributes = Object.fromEntries([...match[0].matchAll(/([\w-]+)="([^"]*)"/g)].map((entry) => [entry[1], entry[2]]));
    nodes.set(match[1], new Element(attributes));
  }
  nodes.get('companions').textContent = JSON.stringify([{ id: momo.webId, dataUri: 'data:image/png;base64,AA==' }]);
  const session = {
    v: 1, page: 'app', onboarded: true, firstRun: false, language, localHour: 9,
    companion: momo, xp: 0, level: { number: 1, progress: 0.2 }, streak: 0,
    signedIn: false, riskAccepted: true, riskVersion: 6, reducedMotion: false,
    mic: { state: 'undetermined', onDevice: true }, hints: {}, pendingRead: null, pendingAsk,
    platform: 'ios', appVersion: '1.5 (45)', speaking,
    analysisLevel: { id: 'rapido', label: language === 'es' ? 'Rápido' : 'Quick', color: '#A795EF' },
  };
  const document = {
    hidden: false, documentElement: {}, addEventListener() {},
    fonts: { ready: Promise.resolve(), load: () => Promise.resolve([]) },
    getElementById(id) { assert.ok(nodes.has(id), 'missing template element ' + id); return nodes.get(id); },
    createElement: made, createElementNS: made,
    createTextNode(text) { const node = new Element(); node.textContent = text; return node; },
  };
  let now = 0, nextFrame;
  const context = vm.createContext({
    document, location: { search: '' }, innerWidth: 440, innerHeight: 956, devicePixelRatio: 3,
    matchMedia: () => ({ matches: false }), addEventListener() {},
    console: { error(...args) { const message = args.map((value) => value?.stack || String(value)).join(' '); if (!errors.includes(message)) errors.push(message); }, warn() {} },
    performance: { now: () => now }, getComputedStyle: () => ({ whiteSpace: 'normal' }),
    setTimeout: () => 0, requestAnimationFrame(callback) { nextFrame = callback; }, Image: class {},
    webkit: { messageHandlers: { nucleo: { postMessage(envelope) {
      calls.push(JSON.parse(JSON.stringify(envelope)));
      if (envelope.method === 'speech.permission') return Promise.resolve({v:1,ok:true,result:session.mic});
      if (envelope.method === 'speech.start') return Promise.resolve({v:1,ok:true,result:{status:'listening'}});
      if (envelope.method === 'speech.stop') return Promise.resolve({v:1,ok:true,result:{status:'processing'}});
      if (envelope.method === 'companion.answer') return Promise.resolve(companionAnswer(envelope.params)).then(result => ({v:1,ok:true,result}));
      if (envelope.method === "speaking.choose") {
        if (chooseFails) return Promise.reject(new Error("storage failed"));
        session.speaking = { ...session.speaking, value: envelope.params.value, offer: false, refine: false };
        return Promise.resolve({ v: 1, ok: true, result: session });
      }
      if (rejectCollections && ['theses', 'roster', 'island', 'suggestions'].includes(envelope.method)) return Promise.reject(new Error('offline'));
      // Native never answers the two collections the page waits for before it starts: the page starts on its own clock.
      if (stallCollections && ['theses', 'roster'].includes(envelope.method)) return new Promise(() => {});
      // A read the test answers itself (answer()), read silently so the page's own clock runs it.
      if (holdAsks && envelope.method === 'ask') return new Promise((resolve) => pending.push((result) => resolve({ v: 1, ok: true, result })));
      if (holdAsks && envelope.method === 'speak') return Promise.resolve({ v: 1, ok: true, result: { status: speak } });
      const result = { session, roster, theses, island: { v: 1, available: false }, suggestions, saveThesis: saved,
        'nudge.seen': { count: 1, active: nudgeActive }, 'nudge.act': { status: 'done' } }[envelope.method] || { v: 1, opened: true };
      return Promise.resolve({ v: 1, ok: true, result });
    } } } },
  });
  context.window = context;
  const client = legacyEvents ? bridge.replace("'account.changed', 'consent.withdrawn', ", '') : bridge;
  vm.runInContext(locale + '\n' + client + '\n' + readModel, context, { filename: 'shipping-shared.js' });
  return {
    context, calls, errors, nodes, session,
    boot() { vm.runInContext(engine, context, { filename: 'shipping-app.js' }); },
    answer(result) { assert.ok(pending.length, 'no ask is waiting'); pending.shift()(JSON.parse(JSON.stringify(result))); },
    advance(seconds) { for (let index = 0; index < Math.ceil(seconds * 60); index++) { now += 1000 / 60; nextFrame(now); } },
  };
}
async function flush() { for (let index = 0; index < 30; index++) await Promise.resolve(); }


const asksOf=app=>app.calls.filter(c=>c.method==='ask').map(c=>c.params);
const tap=(app,node)=>app.nodes.get('stage').listeners.click({target:node,detail:0});
async function idle(options={}){const app=harness({holdAsks:true,...options});app.boot();await flush();app.advance(1.2);await flush();return app;}
async function companionReply(app, reply) {
  keyboardOf(app).listeners.click({detail:0,stopPropagation(){}}); app.nodes.get('ta').value = 'What is investing?';
  app.nodes.get('ta').listeners.input();app.nodes.get('taSend').listeners.click({detail:0,stopPropagation(){}});
  await flush(); app.advance(1.2); await flush(); app.answer(reply);
  await flush(); app.advance(1); await flush();
  assert.equal(app.context.nucleo.state(),'COMPANION');
}
const keyboardOf = app => app.nodes.get('ui').children.find(node => node.id === 'conversation-keyboard');
const companionPanel = app => app.nodes.get('ui').children.find(node => node.id === 'companionPanel');
const guideActionsOf = app => app.nodes.get('ui').children.find(node => node.id === 'conversation-slot');

const memoryPanelOf=app=>app.nodes.get('ui').children.find(n=>n.id==='companion-question-scene');
const interestQuestion={kind:'question',id:'interest',questionId:'interest',text:'Your interest?',why:'The catalog reason.',money:false,options:[{id:'crypto',label:'Crypto'},{id:'companies',label:'Companies'}]};
function memoryStrings(app){app.session.companionPilot={strings:{invite:'May I get to know you?',bobbyAsks:'Bobby asks you: {question}',notNow:'Not now',options:'Options',answerFailed:'Answer failed',noted:'Noted: {label}',notedMany:'Noted: {n} notes',understood:'I understood: {label}',correct:'Correct',ownWords:'Owner-gated disclosure',typeAnswer:'Type my answer',speakAnswer:'Answer with my voice',answerPlaceholder:'My answer',answerSend:'Send answer'}};}

// Memory raw text limit: shipping JS receives complete text but forwards only prefix.
{const app=await idle({companionAnswer:p=>({status:'noted',note:{field:p.questionId,label:'Crypto',source:'said'},next:null})});memoryStrings(app);
await companionReply(app,{status:'companion',gist:'Learning.',text:'Learning. Explanation.',invitation:interestQuestion});app.advance(2);await flush();guideActionsOf(app).children[0]._guideAction();
keyboardOf(app)._guideAction();const typed='a'.repeat(399)+'😀 My interest is companies, not crypto.';app.nodes.get('ta').value=typed;app.nodes.get('ta').listeners.input();app.nodes.get('taSend').listeners.click({detail:0,stopPropagation(){}});await flush();
const sent=app.calls.filter(c=>c.method==='companion.answer').at(-1).params.text;console.log('MEMORY_TRUNCATION',JSON.stringify({typedUTF16:typed.length,sentUTF16:sent.length,sentCodePoints:Array.from(sent).length,lastCodeUnit:sent.charCodeAt(sent.length-1),sentTail:sent.slice(-12),state:app.context.nucleo.state(),field:app.nodes.get('ta').value,errors:app.errors}));}
// Rest domain failure: status must remain visible instead of closing as success.
{const app=await idle({companionAnswer:p=>({message:'Failed'})});memoryStrings(app);
await companionReply(app,{status:'companion',gist:'Learning.',text:'Learning. Explanation.',invitation:interestQuestion});app.advance(2);await flush();guideActionsOf(app).children[0]._guideAction();
memoryPanelOf(app).children[1]._guideAction();await flush();console.log('MEMORY_NOT_NOW_FAILURE',JSON.stringify({calls:app.calls.filter(c=>c.method==='companion.answer'),state:app.context.nucleo.state(),error:app.context.GUIDE_ANSWER_ERROR,errors:app.errors}));}
// AX reading viewport geometry: independent of measured DOM heights.
for(const scale of [1,2,3.118])for(const size of [[375,667],[430,932]])for(const offer of [false,true]){const app=await idle();app.context.innerWidth=size[0];app.context.innerHeight=size[1];app.session.textScale=scale;
await companionReply(app,{status:'companion',requestId:'90d2564c-6064-4275-95cd-5a3c7c0b5b56',gist:'A lead.',text:'A lead. '+('More detail about risk. '.repeat(40)),followUp:'More?',...(offer?{readOffer:{token:'x',label:'Read Bitcoin',levelLabel:'Quick',costLine:'Uses one read',costShort:'one read'}}:{})});app.advance(2);await flush();
console.log('READING_GEOMETRY',JSON.stringify({scale,size,offer,fitS:app.nodes.get('stage').style.transform,height:companionPanel(app).children[0].style.height,fontSize:companionPanel(app).children[0].children[1].style.fontSize,lineHeight:companionPanel(app).children[0].children[1].style.lineHeight,slotTop:guideActionsOf(app).style.top,errors:app.errors}));}
for(const language of ['en','es','fr','pt','it','de']){
 const app=await idle({language});const question='NVIDIA '+ 'é'.repeat(1194);
 keyboardOf(app)._guideAction();app.nodes.get('ta').value=question;app.nodes.get('ta').listeners.input();app.nodes.get('taSend').listeners.click({detail:0,stopPropagation(){}});await flush();app.advance(1.8);await flush();app.answer({status:'too_long',maxLength:1200});await flush();app.advance(.5);await flush();
 const immediate={state:app.context.nucleo.state(),caption:app.nodes.get('note').textContent};app.advance(8);await flush();keyboardOf(app)._guideAction();await flush();const restored=app.nodes.get('ta').value;
 app.nodes.get('ta').value=Array.from(question).slice(0,1200).join('');app.nodes.get('ta').listeners.input();app.nodes.get('taSend').listeners.click({detail:0,stopPropagation(){}});await flush();
 console.log('TOO_LONG_EDIT',JSON.stringify({language,immediate,fullDraftRestored:restored===question,retryLength:Array.from(asksOf(app).at(-1).question).length,retryExact:asksOf(app).at(-1).question===Array.from(question).slice(0,1200).join(''),errors:app.errors}));
}
