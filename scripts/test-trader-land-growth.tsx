import React from 'react';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import LandGrowthGuide from '../src/components/companion/LandGrowthGuide';
import IslandThumb from '../src/components/companion/IslandThumb';
import LandSeedCard from '../src/components/companion/LandSeedCard';
import { setGrant } from '../src/lib/companions/sync';
import { parseGrant } from '../src/lib/trader-land/seed';
import { landGeometry } from '../src/lib/trader-land/geometry';
import type { LandManifest } from '../src/lib/trader-land/public';

// tsx compiles src/*.tsx with the classic JSX runtime (the app build uses the automatic one),
// so components that do not import React find it here.
(globalThis as { React?: typeof React }).React = React;
// react-router's MemoryRouter warns about useLayoutEffect under renderToStaticMarkup; nothing to see.
const consoleError = console.error;
console.error = (...args: unknown[]) => { if (typeof args[0] === 'string' && args[0].includes('useLayoutEffect does nothing on the server')) return; consoleError(...args); };

// ---------- LandGrowthGuide: one question = one seed, patience decides the piece, the island grows ----------
const base = { practice: false, available: 0, seeds: 0, reviewReady: 0, disabled: false, onReview() {}, onBuild() {}, onSignIn() {} };
function render(overrides: Partial<React.ComponentProps<typeof LandGrowthGuide>> = {}) {
  return renderToStaticMarkup(<MemoryRouter><LandGrowthGuide {...base} {...overrides} /></MemoryRouter>);
}
const practice = render({ practice: true });
assert.match(practice, /Start my earned island/);
assert.doesNotMatch(practice, /<progress/);
const review = render({ reviewReady: 1, seeds: 1, available: 2 });
assert.match(review, /<button[^>]*>Review thesis/);
assert.doesNotMatch(review, /<button[^>]*>Place a ready piece/);
assert.match(render({ available: 2 }), /<button[^>]*>Place a ready piece/);
assert.match(render({ seeds: 1 }), /Your seeds are waiting/);
assert.doesNotMatch(render({ seeds: 1 }), /<button[^>]*>Review thesis/);
const idle = render();
assert.match(idle, /one question plants one seed/);
assert.match(idle, /One question = one seed/);
assert.match(idle, /Patience decides the piece/);
assert.match(idle, /3 days into a 2×1 building, 7 days into a 2×2 landmark/);
assert.match(idle, /8×8 → 10×10 → 12×12 → 16×16/);
// The old promises are gone: no route that ends, no island that never expands.
assert.doesNotMatch(idle, /Discovery route|discovery route|route has no more pieces|does not expand|8 × 8 island/);
const growing = render({ size: 10, growth: { occupied: 22, threshold: 60, nextSize: 12 }, core: { x: 4, y: 4, stage: 0 }, pieces: 3, nextByHorizon: [{ hours: 24, name: 'Risk Shield' }, { hours: 72, name: 'Double Gate' }, { hours: 168, name: 'Waiting Lighthouse' }] });
assert.match(growing, /10×10 · 22\/60/);
assert.match(growing, /<progress[^>]*max="60"[^>]*value="22"/);
assert.match(growing, /grows to 12×12/);
assert.match(growing, /Aura Core dormant · 3\/5 pieces to wake it/);
assert.match(growing, /24 h → <strong>Risk Shield<\/strong> · 3 days → <strong>Double Gate<\/strong> · 7 days → <strong>Waiting Lighthouse<\/strong>/);
const full = render({ size: 16, growth: { occupied: 140, threshold: null, nextSize: null }, core: { x: 7, y: 2, stage: 1 } });
assert.match(full, /16×16 · full size/);
assert.doesNotMatch(full, /<progress/);
assert.match(full, /Aura Core awake/);
assert.match(render({ available: 1, disabled: true }), /<button[^>]*disabled/);
console.log('PASS: guide — practice separation, review priority, building, waiting, seed/horizon copy, growth progress, core state, next piece per horizon');

// ---------- IslandThumb draws a grown island at its size with its core ----------
const manifest = JSON.parse(await readFile(new URL('../public/land/v1/gate-A/asset-manifest.json', import.meta.url), 'utf8')) as LandManifest;
const thumb = (size: number, core?: { x: number; y: number; stage: 0 | 1 } | null, placements = [{ item_id: 'crypto_bay_water_walkway', x: size - 1, y: 0, rotation: 0 }]) =>
  renderToStaticMarkup(<IslandThumb manifest={manifest} placements={placements} size={size} core={core} title="t" />);
for (const size of [8, 10, 12, 16]) {
  const svg = thumb(size, { x: size - 2, y: size - 2, stage: 1 });
  assert.equal((svg.match(/<polygon /g) ?? []).length, size * size, `N=${size} draws N×N tiles`);
  // The slab never changes (constant extent).
  assert.match(svg, /M62 391 L430 575 L798 391 L798 412 L430 602 L62 412 Z/);
  // Filaments and the tile outline scale by 8/N.
  assert.match(svg, new RegExp(`stroke-width="${4 * 8 / size}"`), `N=${size} filament stroke scales`);
  // A piece on the last column stays inside the slab: its tile's right corner is x ≤ 798.
  const geom = landGeometry(size);
  assert.ok(geom.iso(size - 1, 0).x + geom.tileW / 2 <= 798 + 1e-9, `N=${size} last column is on the slab`);
}
const dormant = thumb(10, { x: 6, y: 1, stage: 0 }, []);
assert.match(dormant, /aura_core\/ne\/stage0_albedo/, 'a dormant core draws its stage-0 art');
assert.doesNotMatch(dormant, /aura_core\/ne\/stage1_albedo/);
assert.match(thumb(8, null, []), /aura_core\/ne\/stage1_albedo/, 'no core from an older server: stage 1 at 3,3');
console.log('PASS: IslandThumb — sizes 8/10/12/16 on the same slab, scaled strokes, dormant/awake core');

// ---------- LandSeedCard: the desk card after a read ----------
const piece = (id: string, kind: string, footprint: [number, number], en: string) => ({ id, world: id.split('_').slice(0, 2).join('_'), attribution: '', kind, name: { en, es: `ES ${en}` }, footprint });
// The card reads the clock (no extension once the review opens), so the fixture reviews a day from now.
const seedWorld = {
  routeIndex: 3, item: piece('thesis_citadel_risk_shield', 'decor', [1, 1], 'Risk Shield'), inventoryId: 'inv-1', state: 'seed', bloomedInventoryId: null, routeComplete: false,
  horizon: { hours: 24, tier: 'common', reviewAt: new Date(Date.now() + 24 * 3600_000).toISOString(), extendable: true, extendTo: [72, 168] },
  tiers: { common: piece('thesis_citadel_risk_shield', 'decor', [1, 1], 'Risk Shield'), building: piece('thesis_citadel_double_gate', 'building', [2, 1], 'Double Gate'), landmark: piece('crypto_bay_waiting_lighthouse', 'landmark', [2, 2], 'Waiting Lighthouse') },
};
const card = (eventId: string) => renderToStaticMarkup(<MemoryRouter><LandSeedCard eventId={eventId} onClose={() => {}} /></MemoryRouter>);
assert.equal(card('nothing-yet'), '', 'no card until the grant arrives (signed out, capped, or still syncing)');
setGrant('e-seed', parseGrant(seedWorld)!);
const seedCard = card('e-seed');
assert.match(seedCard, /SEED PLANTED/);
assert.match(seedCard, /One question = one seed\. Patience decides the piece\./);
assert.match(seedCard, /role="radio" aria-checked="true"[^>]*>.*24 h · common 1×1.*Risk Shield.*Planted/s);
assert.match(seedCard, /3 days · building 2×1<\/span><span[^>]*>Double Gate/);
assert.match(seedCard, /7 days · landmark 2×2<\/span><span[^>]*>Waiting Lighthouse/);
assert.equal((seedCard.match(/role="radio"/g) ?? []).length, 3);
assert.doesNotMatch(seedCard, /role="radio"[^>]*disabled=""/, 'every offered horizon is selectable right after a read');
assert.match(seedCard, /href="\/trader-land"/);
setGrant('e-late', parseGrant({ ...seedWorld, horizon: { ...seedWorld.horizon, extendable: false, extendTo: [] } })!);
assert.equal((card('e-late').match(/role="radio"[^>]*disabled=""/g) ?? []).length, 2, 'an open review locks the longer horizons');
// The server said extendable at sync time, but the desk stayed open past reviewAt.
setGrant('e-stale', parseGrant({ ...seedWorld, horizon: { ...seedWorld.horizon, reviewAt: new Date(Date.now() - 60_000).toISOString() } })!);
assert.equal((card('e-stale').match(/role="radio"[^>]*disabled=""/g) ?? []).length, 2, 'a review that opened since the sync locks the longer horizons too');
setGrant('e-old', parseGrant({ ...seedWorld, horizon: undefined, tiers: undefined })!);
assert.equal((card('e-old').match(/role="radio"/g) ?? []).length, 1, 'an older server (no horizon): the planted piece only');
setGrant('e-nt', parseGrant({ ...seedWorld, inventoryId: 'inv-2', state: 'bloomed', item: piece('crypto_bay_data_dock', 'ground', [1, 1], 'Data Dock'), horizon: undefined, tiers: undefined })!);
const bloomedCard = card('e-nt');
assert.match(bloomedCard, /PIECE READY/);
assert.match(bloomedCard, /Data Dock.*1×1/s);
assert.doesNotMatch(bloomedCard, /role="radio"/, 'NO TRADE: bloomed 1×1, no picker');
console.log('PASS: seed card — hidden until granted, 24 h planted + 3 days · building + 7 days · landmark with their pieces, locked once the review opens (by the server or the clock), NO TRADE bloomed card without picker');

const { fetchPublicWorlds } = await import('../src/lib/trader-land/public');
const originalFetch = globalThis.fetch;
try {
  globalThis.fetch = async () => new Response('<html>Missing API</html>', { status: 200 });
  await assert.rejects(fetchPublicWorlds(), /Worlds unavailable/);
  globalThis.fetch = async () => Response.json({ ok: true, worlds: [], catalog: [] });
  assert.deepEqual((await fetchPublicWorlds()).worlds, []);
  globalThis.fetch = async () => Response.json({ ok: false, worlds: [], catalog: [] });
  await assert.rejects(fetchPublicWorlds(), /Worlds unavailable/);
} finally { globalThis.fetch = originalFetch; }
console.log('PASS: unavailable gallery is distinct from a valid empty community');
