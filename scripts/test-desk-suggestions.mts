// The web desk's chips: a question Bobby wrote never sits beside a transaction surface.
//
// The CIO's next question (synthesis.followUp, or the fixed one the server serves in its place) is Bobby's
// wording, one tap from being asked. The swap card under a LONG, the wallet pill, the swap sheet and the profile
// drawer are where a reader acts with their own wallet. This script fails when the two can share a screen:
//   · the decision is a pure function (src/lib/desk-suggestions.ts); every state of the screen is enumerated
//     here, with the swap flag on and off, and no state with a transaction surface offers Bobby's question;
//   · the surfaces themselves come from one function, checked against the conditions the desk used to write
//     inline (a LONG on an asset the allow-list offers, the wide layout with consent and a connected wallet);
//   · the desk renders from those same values: its source is read here, and a swap card, a wallet pill, a swap
//     sheet or a profile drawer rendered any other way, or a next question that reaches a chip by another road,
//     fails the script. So does a new wallet or swap surface on the desk that the function does not know.
// What stays as it was is pinned too: the chips of an idle desk and of a finished read, label by label.
// The rendered desk itself is walked in scripts/test-web-activation.mjs (section 3b).
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const { deskSuggestions, deskSurfaces, deskSwapOffer, besideTransaction, howLooksIn } = await import('../src/lib/desk-suggestions.ts');
type Surfaces = ReturnType<typeof deskSurfaces>;
type Lang = 'en' | 'es' | 'fr' | 'pt' | 'it' | 'de';

let checks = 0;
const eq = (got: unknown, want: unknown, what: string) => { assert.deepEqual(got, want, what); checks++; };
const ok = (v: unknown, what: string) => { assert.ok(v, what); checks++; };
const read = (file: string) => readFileSync(fileURLToPath(new URL(`../${file}`, import.meta.url)), 'utf8');

const NONE: Surfaces = { swapCard: false, walletPill: false, swapSheet: false, profile: false };
const QUICK = [{ symbol: 'BTC', name: 'BTC' }, { symbol: 'MC.PA', name: 'LVMH' }, { symbol: 'NVDA', name: 'NVIDIA' }, { symbol: 'ETH', name: 'ETH' }, { symbol: 'SOL', name: 'SOL' }];
const NEXT = 'What would confirm the NVDA trend?';
const FIXED = 'What would have to change in NVDA for this read to change?';
const base = { done: true, symbol: 'NVDA', followUp: NEXT, surfaces: NONE, quickAccess: QUICK, language: 'en' as Lang, locale: 'en-US' };

// ---------- what the swap card offers, with the swap flag on and off ----------
eq([deskSwapOffer('BTC', false)?.symbol, deskSwapOffer('BTC', true)?.symbol, deskSwapOffer('ETH', false)?.symbol], ['cbBTC', 'cbBTC', 'ETH'], 'a crypto asset on the allow-list is offered whatever the stock flag says');
eq([deskSwapOffer('NVDA', true)?.symbol, deskSwapOffer('NVDA', false), deskSwapOffer('AAPL', true)?.symbol, deskSwapOffer('AAPL', false)], ['NVDAc', null, 'AAPLc', null], 'a tokenized stock is offered only with the swap flag on');
eq([deskSwapOffer('SOL', true), deskSwapOffer('MC.PA', true), deskSwapOffer('USDC', true), deskSwapOffer('', true), deskSwapOffer(null, true), deskSwapOffer(undefined, false)], [null, null, null, null, null, null], 'an asset off the list, a stablecoin and no asset: nothing to offer');

// ---------- the surfaces: the conditions the desk renders them under ----------
const screen = { done: true, direction: 'long' as const, symbol: 'BTC', stocksVisible: false, desktop: false, consented: true, walletConnected: false, sheet: 'none' };
eq(deskSurfaces(screen), { ...NONE, swapCard: true }, 'a finished LONG on BTC: the swap card');
eq([deskSurfaces({ ...screen, done: false }).swapCard, deskSurfaces({ ...screen, direction: 'short' }).swapCard, deskSurfaces({ ...screen, direction: 'none' }).swapCard, deskSurfaces({ ...screen, direction: null }).swapCard, deskSurfaces({ ...screen, symbol: null }).swapCard, deskSurfaces({ ...screen, symbol: 'SOL' }).swapCard],
  [false, false, false, false, false, false], 'no swap card before the read is finished, on any other direction, or on an asset the desk cannot offer');
eq([deskSurfaces({ ...screen, symbol: 'NVDA', stocksVisible: true }).swapCard, deskSurfaces({ ...screen, symbol: 'NVDA', stocksVisible: false }).swapCard], [true, false], 'a LONG on NVDA: the swap card with the flag on, none with it off');
for (const desktop of [true, false]) for (const consented of [true, false]) for (const walletConnected of [true, false]) {
  eq(deskSurfaces({ ...screen, direction: 'none', desktop, consented, walletConnected }).walletPill, desktop && consented && walletConnected, `the wallet pill: wide ${desktop}, consent ${consented}, wallet ${walletConnected}`);
}
eq(['none', 'profile', 'board', 'risk', 'catalog', 'pet', 'swap'].map((sheet) => { const s = deskSurfaces({ ...screen, direction: 'none', sheet }); return [s.swapSheet, s.profile]; }),
  [[false, false], [false, true], [false, false], [false, false], [false, false], [false, false], [true, false]], 'the swap sheet and the profile drawer are surfaces; the other sheets are not');
eq([besideTransaction(NONE), ...(['swapCard', 'walletPill', 'swapSheet', 'profile'] as const).map((key) => besideTransaction({ ...NONE, [key]: true }))], [false, true, true, true, true], 'any one of the four is a transaction surface on screen');

// ---------- the chips as they were ----------
eq(deskSuggestions({ ...base, done: false, symbol: null, followUp: null }).map((c) => [c.kind, c.label, c.kind === 'asset' ? c.ariaLabel : null, c.kind === 'asset' ? c.question : null, c.kind === 'asset' ? c.symbol : null]),
  [['asset', 'BTC', 'How does BTC look?', 'How does BTC look?', 'BTC'], ['asset', 'LVMH', 'How does MC.PA look?', 'How does MC.PA look?', 'MC.PA'], ['asset', 'NVIDIA', 'How does NVDA look?', 'How does NVDA look?', 'NVDA']],
  'an idle desk: the first three quick-access assets, by name, each asking how it looks by its symbol');
eq(deskSuggestions(base), [
  { kind: 'followUp', label: NEXT, question: NEXT },
  { kind: 'another', label: 'Another question about NVDA', symbol: 'NVDA' },
  { kind: 'asset', label: 'How does BTC look?', symbol: 'BTC', question: 'How does BTC look?' },
], 'a finished read: the CIO\'s next question, another question of the reader\'s own, one other asset');
eq(deskSuggestions({ ...base, followUp: null }).map((c) => [c.kind, c.label]), [['another', 'Another question about NVDA'], ['asset', 'How does BTC look?'], ['asset', 'How does MC.PA look?']], 'no next question (the agents did not finish): two other assets take its place');
eq(deskSuggestions({ ...base, symbol: 'BTC' }).map((c) => (c.kind === 'asset' ? c.symbol : c.kind)), ['followUp', 'another', 'MC.PA'], 'the asset just read is not offered again');
// The symbol leads the question unless the question writes the ticker itself, in capitals and as a whole word.
eq([NEXT, 'What is missing for the trend?', 'What would end the consolidation near resistance?', 'What changed for nvda this week?'].map((followUp) => (deskSuggestions({ ...base, followUp })[0] as { question: string }).question),
  [NEXT, 'NVDA · What is missing for the trend?', 'NVDA · What would end the consolidation near resistance?', 'NVDA · What changed for nvda this week?'], 'a tap asks the question about this asset');
eq((deskSuggestions({ ...base, symbol: 'NEAR', followUp: 'What would end the consolidation near resistance?' })[0] as { question: string }).question, 'NEAR · What would end the consolidation near resistance?', '"near resistance" does not name NEAR');
eq((deskSuggestions({ ...base, symbol: 'MC.PA', followUp: 'What is missing for MC.PA?' })[0] as { question: string }).question, 'What is missing for MC.PA?', 'a dotted symbol is one word');
// The reader's own chips, in the six languages (the wording the desk already had).
eq((['en', 'es', 'fr', 'pt', 'it', 'de'] as const).map((language) => deskSuggestions({ ...base, language, locale: language === 'pt' ? 'pt-BR' : language }).slice(1).map((c) => c.label)), [
  ['Another question about NVDA', 'How does BTC look?'], ['Otra pregunta sobre NVDA', '¿Cómo se ve BTC?'], ['Autre question sur NVDA', 'Que penser de BTC ?'],
  ['Outra pergunta sobre NVDA', 'Como está BTC?'], ['Un’altra domanda su NVDA', 'Come si presenta BTC?'], ['Weitere Frage zu NVDA', 'Wie sieht BTC aus?'],
], 'the labels in each language');
eq(howLooksIn('NVDA', 'fr', 'fr-FR'), 'Que penser de NVDA ?', 'the question a chip asks is built for an explicit language');

// ---------- the rule ----------
const questions = [NEXT, FIXED, 'Is now a good moment for NVDA?', '¿Qué tendría que cambiar en NVDA para que cambie esta lectura?'];
for (const surface of ['swapCard', 'walletPill', 'swapSheet', 'profile'] as const) {
  const chips = deskSuggestions({ ...base, surfaces: { ...NONE, [surface]: true } });
  eq(chips.map((c) => c.kind), ['another', 'asset', 'asset'], `${surface} on screen: Bobby's question is not offered, and the reader's own chips stand as when there is none`);
}
// Every state of the screen: no transaction surface and Bobby's question together, and nothing else is lost.
let states = 0;
for (const done of [true, false]) for (const direction of ['long', 'short', 'none', null] as const) for (const symbol of ['BTC', 'ETH', 'NVDA', 'AAPL', 'SOL', 'MC.PA', 'USDC', null])
  for (const stocksVisible of [true, false]) for (const desktop of [true, false]) for (const consented of [true, false]) for (const walletConnected of [true, false])
    for (const sheet of ['none', 'profile', 'board', 'risk', 'catalog', 'pet', 'swap']) for (const followUp of [...questions, null]) {
      const surfaces = deskSurfaces({ done, direction, symbol, stocksVisible, desktop, consented, walletConnected, sheet });
      const chips = deskSuggestions({ done, symbol, followUp, surfaces, quickAccess: QUICK, language: 'en', locale: 'en-US' });
      const authored = chips.filter((c) => c.kind === 'followUp' || (followUp !== null && (c.label.includes(followUp) || ('question' in c && c.question.includes(followUp)))));
      const where = JSON.stringify({ done, direction, symbol, stocksVisible, desktop, consented, walletConnected, sheet, followUp });
      // The card the desk draws is the offer for this very symbol and flag: no second opinion about what is on screen.
      assert.equal(surfaces.swapCard, done && direction === 'long' && deskSwapOffer(symbol, stocksVisible) !== null, `the swap card is the offer: ${where}`);
      if (besideTransaction(surfaces)) assert.equal(authored.length, 0, `a transaction surface and Bobby's question on one screen: ${where}`);
      else if (done && symbol && followUp) assert.deepEqual([chips[0].kind, chips[0].label, authored.length], ['followUp', followUp, 1], `no surface: the next question leads, once: ${where}`);
      else assert.equal(authored.length, 0, `no read or no next question: none is shown: ${where}`);
      // The reader's own chips never depend on the surfaces.
      assert.deepEqual(chips.filter((c) => c.kind !== 'followUp').map((c) => c.kind), !done || !symbol ? ['asset', 'asset', 'asset'] : authored.length ? ['another', 'asset'] : ['another', 'asset', 'asset'], `the reader's own chips: ${where}`);
      states++;
    }
checks += states;
ok(states === 2 * 4 * 8 * 2 * 2 * 2 * 2 * 7 * 5, `${states} states of the screen, the swap flag on and off: none shows Bobby's question beside a transaction surface`);

// ---------- the desk renders from these values, and from nothing else ----------
const desk = read('src/components/nucleo/NucleoDesk.tsx');
const count = (source: string, needle: string) => source.split(needle).length - 1;
eq(count(desk, 'deskSurfaces('), 1, 'the desk decides its surfaces once');
ok(/const surfaces = deskSurfaces\(\{ done, direction: debate\?\.direction \?\? null, symbol: snapshot\?\.symbol \?\? null, stocksVisible: STOCK_SWAPS_VISIBLE, desktop, consented, walletConnected, sheet: shown \}\);/.test(desk), '…from the read, the swap flag, the layout, the consent, the wallet and the sheet on screen');
ok(/const walletConnected = useWalletConnected\(\);/.test(desk) && /import \{ STOCK_SWAPS_VISIBLE \} from '@\/lib\/base-swap\/stock-visibility';/.test(desk), '…the wallet from the hook the pill itself reads, the flag from the switch the swap card reads');
ok(/const shown: Sheet = consented \? sheet : 'none';/.test(desk), '…and the sheet as shown (none before consent)');
// Each surface has one place in the desk, behind its own value.
for (const [tag, guard] of [
  ['<WalletBalancePill', '{surfaces.walletPill && <WalletBalancePill'],
  ['<DeskSwapCard', 'const swapCard = surfaces.swapCard && snapshot ? ('],
  ['<SwapSheet', '{surfaces.swapSheet && <SwapSheet'],
  ['<NucleoProfile', '{surfaces.profile && ('],
] as const) {
  eq([count(desk, tag), count(desk, guard)], [1, 1], `${tag}> is rendered once, behind its surface`);
}
ok(desk.indexOf('const swapCard = surfaces.swapCard && snapshot ? (') < desk.indexOf('<DeskSwapCard') && desk.indexOf('<DeskSwapCard') - desk.indexOf('const swapCard = surfaces.swapCard && snapshot ? (') < 400, 'the swap card sits inside that condition');
ok(desk.indexOf('{surfaces.profile && (') < desk.indexOf('<NucleoProfile') && desk.indexOf('<NucleoProfile') - desk.indexOf('{surfaces.profile && (') < 60, 'the profile drawer sits inside that condition');
// The next question has one road to the screen: through deskSuggestions.
eq(count(desk, '.followUp'), 1, 'the desk reads synthesis.followUp in one place');
const uses = desk.split('\n').filter((line) => /\bfollowUp\b/.test(line) && !line.trim().startsWith('//'));
eq(uses.length, 3, 'followUp appears on three lines: where it is read, where it is handed to deskSuggestions, where its chip is built');
ok(/const followUp = done && snapshot && !agentsFailed \? agents\?\.synthesis\?\.followUp \?\? null : null;/.test(uses[0]), '…read only from a finished read whose agents finished');
ok(/done, symbol: snapshot\?\.symbol \?\? null, followUp, surfaces,/.test(uses[1]) && /chip\.kind === 'followUp' \? \{ label: chip\.label, go: \(\) => \{ void ask\(chip\.question, chip\.label\); \} \}/.test(uses[2]), '…and shown only as the chip deskSuggestions returned');
eq(count(desk, 'deskSuggestions('), 1, 'the chips are decided once');
ok(/suggestions\.map\(\(c, i\) => \(/.test(desk) && count(desk, 'className={`n-chip ${i === 0') === 1, 'the chip row renders that list');
// The components behind the surfaces agree with the function about when they show anything.
const swap = read('src/components/companion/DeskSwap.tsx'), wallet = read('src/components/companion/DeskWallet.tsx');
ok(/const token = useMemo\(\(\) => deskSwapOffer\(symbol, STOCK_SWAPS_VISIBLE\), \[symbol\]\);\s+if \(!token\) return null;/.test(swap), 'the swap card offers exactly what deskSwapOffer says, with the same flag');
ok(/export function useWalletConnected\(\): boolean \{\s+return useAccount\(\)\.isConnected;\s+\}/.test(wallet) && /const \{ address, isConnected \} = useAccount\(\);/.test(wallet) && /if \(!isConnected\) return null;/.test(wallet), 'the pill shows nothing without a connected wallet, by the same account state the desk reads');
// A wallet or swap surface the function does not know must not appear on the desk unnoticed.
const SURFACE = /<(WalletBalancePill|DeskSwapCard|SwapSheet|SwapPanel|SwapConfirm)\b|\b(useBaseBalances|useBalance|useAccount|useAppKit|useSendTransaction|useWriteContract)\(/g;
const found: string[] = [];
const dir = fileURLToPath(new URL('../src/components/nucleo/', import.meta.url));
for (const file of readdirSync(dir).filter((name) => /\.tsx?$/.test(name)).sort()) {
  for (const match of readFileSync(`${dir}${file}`, 'utf8').matchAll(SURFACE)) found.push(`${file}:${match[1] ?? match[2]}`);
}
eq(found, ['NucleoDesk.tsx:WalletBalancePill', 'NucleoDesk.tsx:DeskSwapCard', 'NucleoDesk.tsx:SwapSheet', 'NucleoProfile.tsx:WalletBalancePill'],
  'the desk\'s wallet and swap surfaces are the four deskSurfaces knows (the profile drawer holds the fourth): a new one must be added there first');

console.log(`desk-suggestions: ${checks} checks passed`);
