// Live smoke test for the B20 service: allowlist → status → quote → guards → calldata.
// Read-only against Base mainnet; the only key is a throwaway local account
// used to sign the eligibility attestation (never funded, never broadcast).
import { privateKeyToAccount } from 'viem/accounts';
import { keccak256, toBytes } from 'viem';
import { listB20, quoteB20 } from '../../api/_lib/b20.ts';
import { B20_ATTESTATION_DOMAIN, B20_ATTESTATION_TYPES, B20_TERMS_VERSION } from '../../api/_lib/b20-attestation.ts';

const rows = await listB20();
for (const r of rows) {
  const ref = (r as { reference?: { price: number | null; ageSec: number | null; stale: boolean } }).reference;
  console.log(`${r.symbol.padEnd(7)} dex=${r.dexPrice?.toFixed(2) ?? '—'} ref=${ref?.price?.toFixed(2) ?? '—'} age=${ref?.ageSec ?? '—'}s stale=${ref?.stale} dev=${r.deviationPct?.toFixed(2) ?? '—'}% failedReads=${(r as { failedReads?: string[] }).failedReads?.length ?? '?'} ${r.warnings.join(' | ')}`);
}

// Throwaway signer: deterministic, unfunded, only for the EIP-712 statement.
const account = privateKeyToAccount(keccak256(toBytes('bobby-b20-smoke-signer')));
async function attestation(country: string, wallet = account.address, ttl = 24 * 3600) {
  const issuedAt = Math.floor(Date.now() / 1000);
  const message = { wallet, termsVersion: B20_TERMS_VERSION, notUsPerson: true, country, issuedAt, expiresAt: issuedAt + ttl };
  const signature = await account.signTypedData({
    domain: B20_ATTESTATION_DOMAIN,
    types: B20_ATTESTATION_TYPES,
    primaryType: 'Attestation',
    message: { ...message, termsVersion: BigInt(message.termsVersion), issuedAt: BigInt(message.issuedAt), expiresAt: BigInt(message.expiresAt) },
  });
  return { message, signature };
}

const mx = await attestation('MX');
const cases: Array<[string, number, 'buy' | 'sell', unknown, string | null, string]> = [
  ['NVDAc', 100, 'buy', mx, 'MX', 'signed MX → calldata expected'],
  ['NVDAc', 100, 'buy', mx, 'US', 'US connection → withheld'],
  ['NVDAc', 100, 'buy', mx, null, 'no country → withheld'],
  ['NVDAc', 100, 'buy', undefined, 'MX', 'no attestation → withheld'],
  ['NVDAc', 100, 'buy', { ...mx, signature: '0x' + '11'.repeat(65) }, 'MX', 'bad signature → withheld'],
  ['NVDAc', 100, 'buy', await attestation('AR'), 'MX', 'country mismatch → withheld'],
  ['NVDAc', 100, 'buy', await attestation('MX', account.address, -10), 'MX', 'expired → withheld'],
  ['AAPLc', 0.00001, 'sell', mx, 'MX', 'dust sell → withheld (min ticket)'],
  ['AAPLc', 0.5, 'sell', mx, 'MX', 'sell without balance → withheld (balance)'],
  ['AAPLc', 900, 'buy', mx, 'MX', 'cap → withheld'],
  ['TSLAc', 50, 'buy', mx, 'MX', 'no pool → error'],
];
for (const [token, amount, side, att, country, label] of cases) {
  let q;
  try {
    q = await quoteB20({ token, amount, side, recipient: account.address, attestation: att, country });
  } catch (e) {
    console.log(`${label.padEnd(44)} ${token} ${side} ${amount}: ERROR ${(e as Error).message}`);
    continue;
  }
  console.log(`${label.padEnd(44)} ${token} ${side} ${amount}: out=${Number(q.amountOut).toFixed(5)} px=${q.executionPrice.toFixed(2)} tx=${q.tx ? (q.tx.approve ? 'approve+swap' : 'swap') : 'withheld'} ${q.txWithheld.join(' | ')}`);
  if (q.tx) console.log(`   for ${q.recipient} swap.to=${q.tx.swap.to} data=${q.tx.swap.data.slice(0, 10)}… len=${q.tx.swap.data.length}`);
}
