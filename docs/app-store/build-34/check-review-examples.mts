// Gate for the App Review notes: every example question the notes tell the
// reviewer to type must resolve to the intended asset as an EXACT match that
// needs no "Did you mean …?" confirmation. Uses the same resolver as
// /api/bobby-asset-search (resolveOkxAssetFromText) against the live public
// OKX instrument catalog (read-only GETs to www.okx.com; nothing of ours is
// called).
//
//   npx tsx docs/app-store/build-34/check-review-examples.mts
//
// It also reports phrasings the build-34 review found resolving to the wrong
// asset ("What are the main risks in NVIDIA's current chart?" → NET via "ARE",
// "¿Cuáles son los riesgos de NVIDIA?" → SONIC via "SON"). Those are printed,
// not asserted: they document why the notes avoid them until the resolver is
// fixed. Exit code 1 means the notes must change before they are saved.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveOkxAssetFromText } from '../../../src/lib/okx-asset-search.js';

const here = dirname(fileURLToPath(import.meta.url));
const notes = readFileSync(join(here, 'metadata', 'app-review-notes-en.txt'), 'utf8');

/** The asset each example question names, keyed by the name as written in the notes. */
const EXPECTED: Record<string, string> = { Bitcoin: 'BTC', NVIDIA: 'NVDA' };

const step3 = notes.split('\n').find((line) => line.startsWith('3. '));
if (!step3) throw new Error('review notes have no step 3');
const examples = [...step3.matchAll(/"([^"]+\?)"/g)].map((match) => match[1]);
if (examples.length === 0) throw new Error('step 3 quotes no example question');

let failed = 0;
for (const question of examples) {
  const name = Object.keys(EXPECTED).find((key) => question.includes(key));
  const resolved = await resolveOkxAssetFromText(question);
  const got = resolved
    ? `${resolved.instrument.symbol} ${resolved.matchKind} term=${resolved.matchedTerm} confirm=${resolved.needsConfirmation}`
    : 'unresolved';
  const ok = Boolean(name && resolved
    && resolved.instrument.symbol === EXPECTED[name]
    && resolved.matchKind === 'exact'
    && !resolved.needsConfirmation);
  if (!ok) failed += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  "${question}" → ${got}${name ? ` (want ${EXPECTED[name]} exact)` : ' (no expected asset for this question)'}`);
}

const KNOWN_BAD = [
  "What are the main risks in NVIDIA's current chart?",
  '¿Cuáles son los riesgos de NVIDIA?',
  '¿Cuáles son los riesgos de Bitcoin?',
];
for (const question of KNOWN_BAD) {
  const resolved = await resolveOkxAssetFromText(question);
  const got = resolved ? `${resolved.instrument.symbol} ${resolved.matchKind} term=${resolved.matchedTerm} confirm=${resolved.needsConfirmation}` : 'unresolved';
  console.log(`INFO  avoid in notes/screenshots: "${question}" → ${got}`);
}

if (failed) {
  console.error(`${failed} example question(s) in the review notes do not resolve cleanly`);
  process.exit(1);
}
console.log(`${examples.length} example question(s) resolve exactly`);
