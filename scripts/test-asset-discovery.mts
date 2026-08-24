// Asset discovery checks — DETERMINISTIC: a synthetic catalog goes through
// the real normalizer via __setTestCatalog, so CI needs no network and the
// resolver logic (spoken names, mangles, fuzzy, proxy safety, browse) is
// actually protected by the checks. Run with RUN_LIVE=1 to exercise the
// same assertions against the live OKX catalog instead.
import assert from 'node:assert/strict';
import {
  __setTestCatalog,
  __setTestVolumes,
  browseOkxAssets,
  resolveOkxAssetFromText,
  resolveOkxInstrument,
} from '../src/lib/okx-asset-search.js';

const live = process.env.RUN_LIVE === '1';

if (!live) {
  const spot = (base: string) => ({
    instId: `${base}-USDT`, instType: 'SPOT' as const, state: 'live',
    baseCcy: base, quoteCcy: 'USDT',
  });
  const equitySwap = (base: string) => ({
    instId: `${base}-USDT-SWAP`, instType: 'SWAP' as const, state: 'live',
    ctValCcy: base, settleCcy: 'USDT', instCategory: '3',
  });
  __setTestCatalog([
    spot('BTC'), spot('ETH'), spot('SOL'), spot('ADA'), spot('WLD'), spot('WIF'),
    spot('TIA'), spot('XAUT'), spot('XAG'), spot('USDT'), spot('CHZ'), spot('APE'),
    equitySwap('NVDA'), equitySwap('PLTR'), equitySwap('TSM'), equitySwap('SPCX'),
    equitySwap('USO'), equitySwap('XNVDA'), equitySwap('TEST002'), equitySwap('AAPL'),
  ]);
  __setTestVolumes([
    ['BTC', { volUsd: 9e9, last: 77000 }], ['ETH', { volUsd: 8e9, last: 2600 }],
    ['SOL', { volUsd: 2e9, last: 150 }], ['ADA', { volUsd: 4e8, last: 0.6 }],
    ['NVDA', { volUsd: 3e8, last: 180 }], ['PLTR', { volUsd: 2e8, last: 40 }],
    ['XAUT', { volUsd: 1e8, last: 3300 }], ['XAG', { volUsd: 5e7, last: 38 }],
    ['USDT', { volUsd: 99e9, last: 1 }],
  ]);
}

let passed = 0;
async function resolves(query: string, symbol: string, label: string) {
  const hit = await resolveOkxInstrument(query);
  assert.ok(hit, `${label}: "${query}" resolved nothing`);
  assert.equal(hit.symbol, symbol, `${label}: "${query}" → ${hit.symbol}, expected ${symbol}`);
  passed += 1;
}
async function kindOf(query: string, symbol: string, kind: string, confirm: boolean, label: string) {
  const hit = await resolveOkxAssetFromText(query);
  assert.ok(hit, `${label}: "${query}" resolved nothing`);
  assert.equal(hit.instrument.symbol, symbol, `${label}: "${query}" → ${hit.instrument.symbol}, expected ${symbol}`);
  assert.equal(hit.matchKind, kind, `${label}: "${query}" kind ${hit.matchKind}, expected ${kind}`);
  assert.equal(hit.needsConfirmation, confirm, `${label}: "${query}" confirm=${hit.needsConfirmation}, expected ${confirm}`);
  passed += 1;
}

// Spoken names reach the whole universe, not just BTC/ETH
await resolves('worldcoin', 'WLD', 'name');
await resolves('dogwifhat', 'WIF', 'name');
await resolves('celestia', 'TIA', 'name');
await resolves('palantir', 'PLTR', 'name');
await resolves('spacex', 'SPCX', 'name');
await resolves('taiwan semiconductor', 'TSM', 'multi-word name');

// Dictation mangles resolve as first-class aliases (observed live)
await resolves('cherry', 'ETH', 'mangle');
await resolves('eterium', 'ETH', 'mangle');
await resolves('envidia', 'NVDA', 'mangle');

// Match-kind taxonomy: exact analyzes; fuzzy and proxy must be confirmed.
await kindOf('bitcoin', 'BTC', 'exact', false, 'exact name');
await kindOf('SOL', 'SOL', 'exact', false, 'exact ticker');
await kindOf('que pasa con eterium', 'ETH', 'exact', false, 'phrase + mangle alias');
await kindOf('ethereun', 'ETH', 'fuzzy', true, 'fuzzy typo');
await kindOf('solanna', 'SOL', 'fuzzy', true, 'fuzzy typo');
await kindOf('palantr', 'PLTR', 'fuzzy', true, 'fuzzy typo');
await kindOf('oro', 'XAUT', 'proxy', true, 'proxy es');
await kindOf('oil', 'USO', 'proxy', true, 'proxy en');
const oil = await resolveOkxAssetFromText('petroleo');
assert.ok(oil?.proxyNote?.includes('ETF'), 'proxy note missing the honest ETF wording');
passed += 1;

// Dropped-on-purpose aliases: a levered ETF is not the index, a product is
// not the company stock — these must NOT silently resolve via alias.
const vix = await resolveOkxAssetFromText('vix');
assert.ok(!vix || vix.matchKind !== 'exact', 'VIX must not exact-resolve to a levered ETF');
const gpt = await resolveOkxAssetFromText('chatgpt');
assert.ok(!gpt || gpt.matchKind !== 'exact', 'CHATGPT must not exact-resolve to a stock');
passed += 2;

// Browse board: grouped, ranked by volume, deduped and denoised, honest count
const { classes: browse, totalBases } = await browseOkxAssets();
assert.ok(totalBases >= (live ? 500 : 18), `totalBases too small: ${totalBases}`);
assert.ok(browse.crypto.length >= (live ? 30 : 8), `crypto board too small: ${browse.crypto.length}`);
assert.ok(browse.equity.length >= (live ? 30 : 4), `equity board too small: ${browse.equity.length}`);
assert.ok(browse.crypto[0].vol24hUsd > 0, 'volume ranking empty');
assert.ok(!browse.crypto.some((a) => a.symbol === 'USDT'), 'stablecoin leaked into board');
assert.ok(!browse.equity.some((a) => a.symbol === 'XNVDA'), 'X-duplicate leaked into board');
assert.ok(!browse.equity.some((a) => a.symbol.startsWith('TEST')), 'test asset leaked into board');
assert.ok(browse.crypto.slice(0, 5).some((a) => a.symbol === 'BTC'), 'BTC not in top-5 by volume');
const nvda = browse.equity.find((a) => a.symbol === 'NVDA');
assert.ok(nvda && nvda.name === 'Nvidia', `NVDA name: ${nvda?.name}`);
passed += 9;

console.log(`asset-discovery (${live ? 'LIVE' : 'fixtures'}): ${passed} checks passed`);
