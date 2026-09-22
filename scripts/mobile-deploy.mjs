import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync, renameSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { SignClient } from '@walletconnect/sign-client';
import QRCode from 'qrcode';
import { buildPlan, assertSession, digest, DEPLOYER, CHAIN } from './lib/mobile-deploy-plan.mjs';

import { executeStep } from './lib/mobile-deploy-execution.mjs';
import { reconcileJournal } from './lib/mobile-deploy-recovery.mjs';
import { createReadRpc } from './lib/mobile-deploy-rpc.mjs';

const args = Object.fromEntries(process.argv.slice(2).map(a => { const i = a.indexOf('='); return [a.slice(0, i), a.slice(i + 1)]; }));
assert(args['--packet'] && /^[a-f0-9]{64}$/.test(args['--sha256'] || ''), 'Pass --packet=PATH and --sha256=REVIEWED_PACKET_HASH');
const packetPath = resolve(args['--packet']);
const packet = JSON.parse(readFileSync(packetPath, 'utf8'));
assert.equal(digest(packet), args['--sha256'], 'Packet hash mismatch');
const plan = buildPlan(packet.raw, packet.manifest, packet.artifacts, packet.config);
assert.equal(digest(plan), digest(packet.plan), 'Packet plan differs from independent reconstruction');
const allowSigning = args['--sign-plan'] === digest(plan);
assert(!args['--sign-plan'] || allowSigning, 'Signing activation requires the exact plan hash');
assert(!allowSigning || (Number.isFinite(packet.raw.timestamp) && Date.now() >= packet.raw.timestamp && Date.now() - packet.raw.timestamp < 7200000), 'Signing requires a simulation less than two hours old');
const journalPath = resolve(dirname(packetPath), 'mobile-broadcast.json');
const resumeHash = args['--resume-journal'];
assert(!allowSigning || !existsSync(journalPath) || /^[a-f0-9]{64}$/.test(resumeHash || ''), 'Existing journal: explicit reconciliation hash required');
assert(!resumeHash || (allowSigning && existsSync(journalPath)), 'Resume requires an existing journal and explicit signing mode');
const rpcUrl = 'https://mainnet.base.org';
const port = 8787;
const origin = `http://127.0.0.1:${port}`;
const control = randomBytes(32).toString('hex');
const scriptNonce = randomBytes(24).toString('base64');
const rpc = createReadRpc(rpcUrl);
assert.equal(Number(BigInt(await rpc('eth_chainId'))), CHAIN);
let journal = { packetSha256: digest(packet), planSha256: digest(plan), transactions: [], receipts: [], attempts: [] };
if (resumeHash) {
  const saved = JSON.parse(readFileSync(journalPath, 'utf8'));
  assert.equal(digest(saved), resumeHash, 'Journal changed since operator review');
  assert.equal(saved.packetSha256, digest(packet), 'Journal packet mismatch');
  journal = await reconcileJournal(plan, packet.raw, saved, rpc);
  writeFileSync(journalPath + '.before-' + resumeHash + '.json', JSON.stringify(saved, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  const temp = journalPath + '.reconciled.tmp';
  writeFileSync(temp, JSON.stringify(journal, null, 2) + '\n', { mode: 0o600 });
  renameSync(temp, journalPath);
  console.log('Reconciled verified receipts: ' + journal.receipts.length + '; no transactions resent');
}
assert.equal(Number(BigInt(await rpc('eth_getTransactionCount', [DEPLOYER, 'pending']))), plan.startNonce + journal.receipts.length, 'Deployment plan is stale: investigate wallet activity');

// Session encryption material lives in memory only. Never serialize pairing URIs
// or WalletConnect sessions into the public transaction journal or log.
const memory = new Map();
const storage = {
  getKeys: async () => [...memory.keys()],
  getEntries: async () => [...memory.entries()],
  getItem: async key => memory.get(key),
  setItem: async (key, value) => { memory.set(key, value); },
  removeItem: async key => { memory.delete(key); },
};
const client = await SignClient.init({ projectId: process.env.REOWN_PROJECT_ID || '4d0d8421a091e769c3306153621ea088', logger: 'silent', storage, telemetryEnabled: false, metadata: { name: 'Bobby local deployment', description: 'Base contract deployment from your computer. Each transaction needs your approval.', url: origin, icons: [] } });
let session, qr, connecting = false, busy = false, halted = false, index = journal.receipts.length, sessionRevision = 0;
let message = 'Abre Rainbow en tu celular y usa su escáner QR interno. Conectar no firma transacciones.';
function save() {
  const temp = journalPath + '.tmp';
  writeFileSync(temp, JSON.stringify(journal, null, 2) + '\n', { mode: 0o600 });
  renameSync(temp, journalPath);
}
function halt(reason) { halted = true; message = reason; }
for (const event of ['session_update', 'session_delete', 'session_expire', 'session_event']) client.on(event, () => { sessionRevision++; halt('La conexión cambió. Detenido; revisa el estado antes de continuar.'); });

async function next() {
  assert(allowSigning && !busy && !halted && session && index < 19, 'Signing is not available');
  busy = true;
  try {
    await executeStep({ plan, raw: packet.raw, index, journal, rpc, save,
      getSession: () => client.session.get(session.topic),
      isHalted: () => halted,
      report: value => { message = value; },
      send: request => client.request({ topic: session.topic, chainId: 'eip155:8453', request: { method: 'eth_sendTransaction', params: [request] } }),
    });
    index++;
    message = index === 19 ? '19 recibos verificados. Falta finalizar el manifest, aceptar ownership en el Safe y verificar postdeploy.' : 'Recibo verificado. Puedes revisar la siguiente transacción.';
  } catch (error) {
    journal.lastFailure = { at: new Date().toISOString(), index, name: error?.name || 'Error', detail: error?.name === 'AssertionError' || String(error?.message).startsWith('Base ') ? String(error.message).slice(0, 500) : 'Wallet or transport failure' };
    halt('Detenido. Rechazo, cambio de conexión o resultado incierto: revisar el journal y la cadena antes de reintentar.');
    if (journal.attempts.length) save();
  } finally { busy = false; }
}

function canVerify() {
  return allowSigning && halted && !busy && !!session && journal.attempts.length > journal.receipts.length && journal.attempts.every(a => /^0x[0-9a-fA-F]{64}$/.test(a.hash || ''));
}
async function verifySubmitted() {
  if (!canVerify()) return;
  busy = true;
  const revision = sessionRevision;
  try {
    assertSession(client.session.get(session.topic));
    message = 'Verificando las transacciones enviadas. No se solicitará ninguna firma.';
    const recovered = await reconcileJournal(plan, packet.raw, journal, rpc);
    assert.equal(revision, sessionRevision, 'Session changed during receipt verification');
    assertSession(client.session.get(session.topic));
    writeFileSync(journalPath + '.verify-' + digest(journal) + '.json', JSON.stringify(journal, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
    journal = recovered;
    save();
    index = journal.receipts.length;
    halted = false;
    message = 'Recibos confirmados. Continuamos desde el siguiente paso sin repetir envíos.';
  } catch { halt('No se pudo confirmar el estado completo. Sigue detenido; no repitas la firma.'); }
  finally { busy = false; }
}

const html = `<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Bobby · despliegue local</title><style>body{background:#080d0b;color:#e2eee8;font:17px system-ui;max-width:850px;margin:40px auto;padding:20px}h1{color:#56e6a2}code{word-break:break-all;font-size:13px}button{padding:14px;background:#56e6a2;border:0;border-radius:8px;font-weight:bold}button:disabled{opacity:.4}img{max-width:300px}section{border:1px solid #345;padding:20px;margin:20px 0;border-radius:12px}#status{white-space:pre-wrap}</style><h1>Despliegue de Bobby · Base</h1><p id="mode"></p><p>Wallet: <code>${DEPLOYER}</code></p><p>Safe propuesto como propietario: <code>${plan.safe}</code></p><p>Plan: <code>${digest(plan)}</code></p><img id="qr" alt="QR de conexión a la wallet" hidden><button id="renew" hidden>Renovar QR</button><section><p id="status"></p><p id="step"></p><code id="target"></code><p id="fee">Valor enviado: 0 ETH. Cada operación paga gas. Máximo solicitado: 0,02 gwei; gas estimado +30%. Tu wallet muestra el coste final.</p><p>El nuevo TrackRecord comienza vacío; el historial anterior permanece en sus contratos.</p><button id="verify" hidden>Verificar recibo enviado</button><button id="next" disabled>Revisar y pedir la siguiente firma</button></section><p>El Safe debe aceptar ownership con dos firmas después de este despliegue. Los swaps siguen apagados.</p><script nonce="${scriptNonce}">const token=location.hash.slice(1);let current;async function refresh(){const r=await fetch('/state',{headers:{'x-control-token':token}});if(!r.ok)return;const s=await r.json();current=s;document.getElementById('verify').hidden=!s.canVerify;document.getElementById('renew').hidden=!s.canConnect;document.getElementById('mode').textContent=s.allowSigning?'Firma habilitada: cada solicitud requiere tu clic y confirmación en tu wallet.':'Solo conexión y revisión. Las firmas están deshabilitadas.';document.getElementById('status').textContent=s.message;document.getElementById('step').textContent=s.tx?'Paso '+(s.index+1)+' de 19: '+s.tx.label:'';document.getElementById('target').textContent=s.tx?'Destino: '+(s.tx.to||'Creación de contrato')+' · Nonce: '+s.tx.nonce+' · Hash de datos: '+s.tx.inputHash:'';const q=document.getElementById('qr');q.hidden=!s.qr;if(s.qr)q.src=s.qr;document.getElementById('next').disabled=!s.canSign;}document.getElementById('verify').onclick=async()=>{document.getElementById('verify').hidden=true;await fetch('/verify',{method:'POST',headers:{'x-control-token':token,'content-type':'application/json'},body:JSON.stringify({journalHash:current.journalHash})});await refresh();};document.getElementById('renew').onclick=async()=>{document.getElementById('renew').hidden=true;await fetch('/connect',{method:'POST',headers:{'x-control-token':token,'content-type':'application/json'},body:'{}'});await refresh();};document.getElementById('next').onclick=async()=>{document.getElementById('next').disabled=true;await fetch('/next',{method:'POST',headers:{'x-control-token':token,'content-type':'application/json'},body:JSON.stringify({index:current.index})});await refresh();};refresh();setInterval(()=>refresh().catch(()=>{document.getElementById('next').disabled=true}),2000);</script></html>`;
const server = createServer(async (req, res) => {
  const send = (status, value, type = 'application/json') => { res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store', 'x-frame-options': 'DENY', 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer', 'content-security-policy': `default-src 'none'; script-src 'nonce-${scriptNonce}'; style-src 'unsafe-inline'; img-src data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'` }); res.end(typeof value === 'string' ? value : JSON.stringify(value)); };
  if (req.headers.host !== `127.0.0.1:${port}`) return send(403, {});
  if (req.url === '/' && req.method === 'GET') return send(200, html, 'text/html; charset=utf-8');
  const supplied = String(req.headers['x-control-token'] || '');
  if (Buffer.byteLength(supplied) !== Buffer.byteLength(control) || !timingSafeEqual(Buffer.from(supplied), Buffer.from(control))) return send(403, {});
  if (req.url === '/state' && req.method === 'GET') return send(200, { message, allowSigning, index, tx: plan.transactions[index], qr: session ? null : qr, canVerify: canVerify(), journalHash: digest(journal), canConnect: !session && !connecting && !busy && !halted, canSign: allowSigning && !!session && !busy && !halted && index < 19 });
  if (!['/next', '/connect', '/verify'].includes(req.url) || req.method !== 'POST') return send(404, {});
  if (req.headers.origin !== origin || req.headers['content-type'] !== 'application/json') return send(403, {});
  let body = '';
  try {
    for await (const chunk of req) { body += chunk; if (body.length > 128) return send(413, {}); }
    const value = JSON.parse(body);
    if (req.url === '/verify') {
      if (!canVerify() || value.journalHash !== digest(journal)) return send(409, {});
      void verifySubmitted();
      return send(202, {});
    }
    if (req.url === '/connect') {
      if (session || connecting || busy || halted) return send(409, {});
      void connectWallet();
      return send(202, {});
    }
    if (value.index !== index || !allowSigning || !session || busy || halted || index >= 19) return send(409, {});
    void next();
    return send(202, {});
  } catch { return send(400, {}); }
});
await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
console.log('Local connection page: ' + origin + '/#' + control);
console.log('Mode: ' + (allowSigning ? 'individual user-approved signing' : 'connect-only; no transaction requests'));
async function connectWallet() {
  if (session || connecting || busy || halted) return;
  connecting = true;
  qr = null;
  message = 'Preparando un QR nuevo. Usa el escáner dentro de Rainbow.';
  try {
    const { uri, approval } = await client.connect({ optionalNamespaces: { eip155: { chains: ['eip155:8453'], methods: ['eth_sendTransaction'], events: ['accountsChanged', 'chainChanged'] } } });
    if (uri) qr = await QRCode.toDataURL(uri, { width: 300, margin: 2 });
    message = 'Escanea el QR y acepta la conexión en Rainbow. Si caduca, pulsa Renovar QR.';
    void approval().then(async value => {
      try { assertSession(value); }
      catch {
        await client.disconnect({ topic: value.topic, reason: { code: 6000, message: 'Unexpected account or chain' } }).catch(() => {});
        halt('La cuenta o red aprobadas no coinciden con el despliegue. Conexión cerrada.');
        qr = null;
        return;
      }
      session = value;
      qr = null;
      const walletName = String(value.peer?.metadata?.name || 'Wallet');
      message = walletName + ': cuenta correcta conectada. ' + (allowSigning ? 'Revisa el paso antes de pedir una firma.' : 'Modo de revisión: no se enviará ninguna transacción.');
    }).catch(() => {
      qr = null;
      // A proposal timeout happened before any transaction request. It does not
      // clear a transaction halt; only a new, unconnected proposal may be made.
      if (!halted) message = 'La conexión caducó o fue rechazada. Pulsa Renovar QR y escanéalo desde Rainbow.';
    }).finally(() => { connecting = false; });
  } catch {
    connecting = false;
    qr = null;
    if (!halted) message = 'No se pudo preparar la conexión. Pulsa Renovar QR para intentarlo de nuevo.';
  }
}
void connectWallet();
process.on('SIGINT', async () => { if (session) await client.disconnect({ topic: session.topic, reason: { code: 6000, message: 'Local operator stopped' } }).catch(() => {}); server.close(); process.exit(0); });
