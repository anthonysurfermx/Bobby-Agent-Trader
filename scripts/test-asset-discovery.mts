// Asset discovery checks: spoken names, dictation mangles, fuzzy typos and
// the browse board — all against the LIVE OKX catalog (network required).
import assert from 'node:assert/strict';
import { browseOkxAssets, resolveOkxInstrument } from '../src/lib/okx-asset-search.js';

let passed = 0;
async function resolves(query: string, symbol: string, label: string) {
  const hit = await resolveOkxInstrument(query);
  assert.ok(hit, `${label}: "${query}" resolved nothing`);
  assert.equal(hit.symbol, symbol, `${label}: "${query}" → ${hit.symbol}, expected ${symbol}`);
  passed += 1;
}

// Spoken names reach the whole universe, not just BTC/ETH
await resolves('worldcoin', 'WLD', 'name');
await resolves('dogwifhat', 'WIF', 'name');
await resolves('celestia', 'TIA', 'name');
await resolves('palantir', 'PLTR', 'name');
await resolves('spacex', 'SPCX', 'name');
await resolves('taiwan semiconductor', 'TSM', 'multi-word name');
await resolves('oro', 'XAUT', 'spanish');
await resolves('petroleo', 'USO', 'spanish');

// Dictation mangles (observed live: "Ethereum" → "Cherry")
await resolves('cherry', 'ETH', 'mangle');
await resolves('eterium', 'ETH', 'mangle');
await resolves('envidia', 'NVDA', 'mangle');

// Fuzzy net for typos and unseen mangles — no exact alias exists for these
await resolves('ethereun', 'ETH', 'fuzzy');
await resolves('solanna', 'SOL', 'fuzzy');
await resolves('palantr', 'PLTR', 'fuzzy');
await resolves('bitcoim', 'BTC', 'fuzzy');
await resolves('cardanno', 'ADA', 'fuzzy');

// Exact matches must still beat fuzzy neighbors
await resolves('SOL', 'SOL', 'exact');
await resolves('bitcoin', 'BTC', 'exact');

// Browse board: grouped, ranked by real volume, deduped and denoised
const browse = await browseOkxAssets();
assert.ok(browse.crypto.length >= 30, `crypto board too small: ${browse.crypto.length}`);
assert.ok(browse.equity.length >= 30, `equity board too small: ${browse.equity.length}`);
assert.ok(browse.commodity.length >= 2, 'metals missing');
assert.ok(browse.crypto[0].vol24hUsd > 0, 'volume ranking empty');
assert.ok(!browse.crypto.some((a) => a.symbol === 'USDT'), 'stablecoin leaked into board');
assert.ok(!browse.equity.some((a) => a.symbol === 'XNVDA'), 'X-duplicate leaked into board');
assert.ok(browse.crypto.slice(0, 5).some((a) => a.symbol === 'BTC'), 'BTC not in top-5 by volume');
const nvda = browse.equity.find((a) => a.symbol === 'NVDA');
assert.ok(nvda && nvda.name === 'Nvidia', `NVDA name: ${nvda?.name}`);
passed += 8;

console.log(`asset-discovery: ${passed} checks passed`);
console.log('top crypto:', browse.crypto.slice(0, 8).map((a) => a.symbol).join(' '));
console.log('top equity:', browse.equity.slice(0, 8).map((a) => a.symbol).join(' '));
