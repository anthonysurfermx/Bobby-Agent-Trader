// Live smoke test for the B20 service: allowlist → status → quote → calldata.
// Read-only against Base mainnet; no key, no signing, no broadcast.
import { listB20, quoteB20 } from '../../api/_lib/b20.ts';

const rows = await listB20();
for (const r of rows) {
  console.log(`${r.symbol.padEnd(7)} dex=${r.dexPrice?.toFixed(2) ?? '—'} ref=${(r as { reference?: { price: number | null; ageSec: number | null } }).reference?.price?.toFixed(2) ?? '—'} dev=${r.deviationPct?.toFixed(2) ?? '—'}% mult=${(r as { multiplier?: number }).multiplier ?? '—'} paused=${(r as { pausedFeatures?: string }).pausedFeatures ?? '—'} ${r.warnings.join(' | ')}`);
}

const recipient = '0x09a81ff70ddbc5e8b88f168b3eef01384b6cdcea';
for (const [token, amount, side, attested, country] of [
  ['NVDAc', 100, 'buy', true, 'MX'],
  ['NVDAc', 100, 'buy', true, 'US'],
  ['AAPLc', 0.5, 'sell', true, 'MX'],
  ['AAPLc', 900, 'buy', true, 'MX'],
  ['TSLAc', 50, 'buy', false, 'MX'],
] as const) {
  let q;
  try { q = await quoteB20({ token, amount, side, recipient, attested, country }); } catch (e) { console.log(`${token} ${side} ${amount}: ERROR ${(e as Error).message}`); continue; }
  console.log(`${token} ${side} ${amount}: out=${Number(q.amountOut).toFixed(5)} px=${q.executionPrice.toFixed(2)} dev=${q.deviationPct?.toFixed(2)}% tx=${q.tx ? (q.tx.approve ? 'approve+swap' : 'swap') : 'withheld'} ${q.txWithheld.join(' | ')}`);
  if (q.tx) console.log(`   swap.to=${q.tx.swap.to} data=${q.tx.swap.data.slice(0, 10)}… len=${q.tx.swap.data.length}`);
}
