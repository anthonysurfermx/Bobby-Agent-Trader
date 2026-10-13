// The agent engine in a browser, on this machine only: one page that talks to the engine's own door
// (api/agent-task.ts) with the real model and the real sources. It is how the owner tries an errand end to end
// (ask, the card, yes or no, the answer, a follow-up) before any app does. Nothing here is deployed.
//
//   vercel env run -e production -- npx tsx scripts/agent-lab.mts          then open http://127.0.0.1:4318
//
// The store is one file in the system's temporary folder (BOBBY_AGENT_LAB_STORE to choose another): no database is
// read or written. The provider's money is the engine's own daily ceiling (BOBBY_AGENT_DAILY_USD, one dollar here
// unless set). It listens on 127.0.0.1 and nowhere else. Prints no secret.
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.BOBBY_SUPABASE_URL ||= 'https://lab.invalid'; process.env.BOBBY_SUPABASE_ANON_KEY ||= 'lab'; process.env.BOBBY_SUPABASE_SERVICE_ROLE_KEY ||= 'lab';
process.env.RATE_LIMIT_SALT ||= 'lab-salt-lab-salt-lab-salt';
process.env.BOBBY_AGENT_ENGINE = 'on';
process.env.BOBBY_AGENT_STORE = process.env.BOBBY_AGENT_LAB_STORE?.startsWith('/') ? process.env.BOBBY_AGENT_LAB_STORE : join(tmpdir(), 'bobby-agent-lab.json');
process.env.BOBBY_AGENT_DAILY_USD ||= '1';
if (!process.env.ANTHROPIC_API_KEY) { console.error('ANTHROPIC_API_KEY is not set: run it through "vercel env run -e production -- …"'); process.exit(2); }
const { default: door } = await import('../api/agent-task.ts');

const PORT = Number(process.env.BOBBY_AGENT_LAB_PORT) || 4318;
const PAGE = /* html */ `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Bobby · motor (laboratorio)</title>
<style>
  :root { color-scheme: dark; --ink: #f4f1ff; --soft: #a7a1bd; --line: #2a2738; --lav: #b9a8ff; }
  * { box-sizing: border-box; }
  body { margin: 0; min-height: 100vh; background: #08070c; color: var(--ink); font: 16px/1.5 -apple-system, "SF Pro Text", Inter, system-ui, sans-serif; display: flex; flex-direction: column; align-items: center; }
  main { width: 100%; max-width: 560px; padding: 16px; flex: 1; display: flex; flex-direction: column; }
  header { display: flex; justify-content: space-between; align-items: center; color: var(--soft); font-size: 13px; padding: 4px 2px 0; }
  select { background: transparent; color: var(--soft); border: 1px solid var(--line); border-radius: 999px; padding: 4px 10px; font: inherit; }
  .orb { width: 168px; height: 168px; margin: 28px auto 20px; border-radius: 50%; background: radial-gradient(circle at 34% 30%, #f7b7e6 0, #b58cf2 34%, #5a54c9 62%, #1b2a6b 86%); box-shadow: 0 0 60px #7d6cf255, inset 0 0 28px #ffffff30; transition: transform .6s ease, filter .6s ease; }
  .orb.busy { animation: breathe 1.6s ease-in-out infinite; }
  @keyframes breathe { 50% { transform: scale(1.05); filter: brightness(1.15); } }
  #gist { font-size: 23px; line-height: 1.28; text-align: center; letter-spacing: -.01em; min-height: 60px; margin: 0 6px; }
  #text { color: var(--soft); margin: 14px 6px 0; text-align: center; }
  #limits { color: #7f7997; font-size: 13px; margin: 12px 6px 0; text-align: center; }
  #limits div + div { margin-top: 4px; }
  .card { border: 1px solid var(--line); border-radius: 18px; padding: 14px 16px; margin: 18px 0 0; background: #100e17; }
  .card b { font-weight: 600; } .card small { color: var(--soft); display: block; margin-top: 2px; }
  .row { display: flex; gap: 10px; margin-top: 12px; }
  button { font: inherit; color: var(--ink); background: #1a1726; border: 1px solid var(--line); border-radius: 999px; padding: 10px 16px; cursor: pointer; flex: 1; }
  button:hover { border-color: #4a4466; }
  #next { display: none; margin: 16px auto 0; flex: none; color: var(--lav); border-color: #3a3357; background: #15121f; max-width: 100%; }
  form { display: flex; gap: 8px; margin-top: auto; padding-top: 22px; }
  input { flex: 1; font: inherit; color: var(--ink); background: #0f0d15; border: 1px solid var(--line); border-radius: 999px; padding: 12px 16px; outline: none; }
  input:focus { border-color: #4a4466; }
  form button { flex: none; }
  footer { color: #5f5a73; font-size: 12px; text-align: center; padding: 10px 16px 16px; }
  details { margin-top: 14px; color: var(--soft); font-size: 13px; } summary { cursor: pointer; text-align: center; list-style: none; }
  table { width: 100%; border-collapse: collapse; margin-top: 8px; } td { padding: 3px 4px; border-top: 1px solid var(--line); } td:last-child { text-align: right; font-variant-numeric: tabular-nums; color: var(--ink); }
</style></head>
<body><main>
  <header><span>Bobby · motor · laboratorio local</span>
    <span><span id="left"></span> <select id="lang"><option value="es">Español</option><option value="en">English</option><option value="fr">Français</option><option value="pt">Português</option><option value="it">Italiano</option><option value="de">Deutsch</option></select></span></header>
  <div class="orb" id="orb"></div>
  <p id="gist">Pregunta algo.</p>
  <p id="text"></p>
  <div id="limits"></div>
  <div id="card"></div>
  <button id="next"></button>
  <details id="more" hidden><summary>Las cifras que leyó el código</summary><table id="figures"></table></details>
  <form id="ask"><input id="q" autocomplete="off" placeholder="¿Qué quieres entender?" autofocus><button>Enviar</button></form>
</main>
<footer>Solo en este Mac. Modelo y datos reales; nada se guarda en la base.</footer>
<script>
  const $ = (id) => document.getElementById(id);
  const session = 'lab-' + crypto.randomUUID().slice(0, 18);
  const CARD = { es: ['Leer', 'días', 'Usa 1 de tus lecturas', 'Sí, léelo', 'Ahora no'], en: ['Read', 'days', 'Uses 1 of your reads', 'Yes, read it', 'Not now'], fr: ['Lire', 'jours', 'Utilise 1 de tes lectures', 'Oui, lis-le', 'Pas maintenant'], pt: ['Ler', 'dias', 'Usa 1 das suas leituras', 'Sim, leia', 'Agora não'], it: ['Leggi', 'giorni', 'Usa 1 delle tue letture', 'Sì, leggilo', 'Non ora'], de: ['Lesen', 'Tage', 'Nutzt 1 deiner Lesungen', 'Ja, lies es', 'Jetzt nicht'] };
  let answered = false, asked = '';
  const call = async (body, id) => { const r = await fetch(id ? '/api/agent-task?id=' + id : '/api/agent-task', body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : undefined); return r.json(); };
  const busy = (on) => $('orb').classList.toggle('busy', on);
  function show(view) {
    const lang = $('lang').value, words = CARD[lang];
    $('card').innerHTML = ''; $('next').style.display = 'none'; $('limits').innerHTML = ''; $('more').hidden = true;
    if (view.allowance && view.allowance.remaining != null) $('left').textContent = view.allowance.remaining + ' ·';
    if (view.error && !view.taskId) { $('gist').textContent = view.error.message || view.error.code; $('text').textContent = ''; return; }
    if (view.state === 'waiting_approval' && view.approval) {
      const a = view.approval;
      $('gist').textContent = asked; $('text').textContent = '';
      const card = document.createElement('div'); card.className = 'card';
      card.innerHTML = '<b></b><small></small><div class="row"><button id="yes"></button><button id="no"></button></div>';
      card.querySelector('b').textContent = words[0] + ': ' + a.assets.join(', ') + ' · ' + a.windowDays + ' ' + words[1];
      card.querySelector('small').textContent = words[2];
      $('card').appendChild(card);
      $('yes').textContent = words[3]; $('no').textContent = words[4];
      $('yes').onclick = () => act({ op: 'approve', taskId: view.taskId, digest: a.digest }, view);
      $('no').onclick = () => act({ op: 'deny', taskId: view.taskId }, view);
      return;
    }
    if (view.result) {
      answered = true;
      const r = view.result;
      $('gist').textContent = r.gist;
      $('text').textContent = r.text.startsWith(r.gist) ? r.text.slice(r.gist.length).trim() : r.text;
      for (const line of r.limitations || []) { const d = document.createElement('div'); d.textContent = line; $('limits').appendChild(d); }
      if (r.next) { $('next').textContent = r.next; $('next').style.display = 'block'; $('next').onclick = () => ask(r.next); }
      const figures = (r.analysis && r.analysis.figures || []).filter((f) => f.value !== null);
      if (figures.length) { $('more').hidden = false; $('figures').innerHTML = ''; for (const f of figures) { const tr = document.createElement('tr'); tr.innerHTML = '<td></td><td></td>'; tr.children[0].textContent = f.metric + ' · ' + f.subject + (f.day ? ' · ' + f.day : ''); tr.children[1].textContent = (f.unit === 'percent' ? f.value.toFixed(1) + ' %' : f.unit === 'ratio' ? f.value.toFixed(2) : f.value.toFixed(2) + (f.currency ? ' ' + f.currency : '')); $('figures').appendChild(tr); } }
      return;
    }
    if (view.notice) { $('gist').textContent = view.notice; $('text').textContent = ''; return; }
    if (view.error) { $('gist').textContent = view.error.message || view.error.code; $('text').textContent = ''; return; }
    $('gist').textContent = '…'; $('text').textContent = '';
  }
  async function settle(view, again) {
    // An errand nobody is running goes on only when the same request is sent again.
    for (let n = 0; n < 4 && view && view.resume; n++) view = await call(again);
    show(view); return view;
  }
  async function act(body, view) { busy(true); try { await settle(await call(body), body.op === 'approve' ? body : null); } finally { busy(false); } }
  async function ask(question) {
    if (!question.trim()) { show(await call({ op: 'ask', version: 1, requestId: crypto.randomUUID(), sessionId: session, question: ' ', language: $('lang').value })); return; }
    const body = { op: 'ask', version: 1, requestId: crypto.randomUUID(), sessionId: session, question, language: $('lang').value, ...($('lang').value === 'pt' ? { locale: 'pt-BR' } : {}), follow: answered };
    asked = question; $('gist').textContent = question; $('text').textContent = ''; $('card').innerHTML = ''; $('limits').innerHTML = ''; $('next').style.display = 'none'; $('more').hidden = true;
    busy(true); try { await settle(await call(body), body); } finally { busy(false); }
  }
  $('ask').onsubmit = (event) => { event.preventDefault(); const q = $('q').value; $('q').value = ''; ask(q); };
</script></body></html>`;

interface LabResponse { statusCode: number; headers: Record<string, string>; body: unknown; setHeader(key: string, value: string): LabResponse; status(code: number): LabResponse; json(value: unknown): LabResponse }
const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? '/', `http://127.0.0.1:${PORT}`);
  if (request.method === 'GET' && url.pathname === '/') { response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }); response.end(PAGE); return; }
  if (url.pathname !== '/api/agent-task') { response.writeHead(404).end(); return; }
  let raw = '';
  for await (const chunk of request) { raw += chunk; if (raw.length > 20_000) { response.writeHead(413).end(); return; } }
  let body: unknown = null;
  try { body = raw ? JSON.parse(raw) : null; } catch { body = null; }
  const out: LabResponse = { statusCode: 200, headers: {}, body: null, setHeader(key, value) { this.headers[key] = value; return this; }, status(code) { this.statusCode = code; return this; }, json(value) { this.body = value; return this; } };
  // The door sees what it sees in production: an allowed origin, an address and an install id. They are this machine's.
  await door({ method: request.method, query: Object.fromEntries(url.searchParams), body, headers: { origin: 'https://bobbyprotocol.xyz', 'x-forwarded-for': '127.0.0.1', 'x-bobby-device': 'lab-device-0000000000000001' } } as never, out as never);
  response.writeHead(out.statusCode, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }).end(JSON.stringify(out.body));
});
server.listen(PORT, '127.0.0.1', () => console.log(`Bobby's engine, on this machine only: http://127.0.0.1:${PORT}  (store: ${process.env.BOBBY_AGENT_STORE})`));
