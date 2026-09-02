#!/usr/bin/env -S npx tsx
// Offline self-test of the wallet session: token round-trip, tampering,
// expiry, secret rotation, signature recovery, origin allowlist.
// Run: npx tsx scripts/infra/wallet-session-selftest.mts
process.env.BOBBY_SESSION_SECRET = 'test-secret-test-secret-test-secret-1234';
process.env.VERCEL_ENV = 'production';
const { issueWalletSession, verifyWalletSession, verifyWalletProof } = await import('../../api/_lib/wallet-session.ts');
const { allowedOriginHosts } = await import('../../api/_lib/write-guard.ts');
const { buildWalletSessionMessage } = await import('../../src/lib/wallet-session-message.ts');
const { privateKeyToAccount, generatePrivateKey } = await import('viem/accounts');
let fails = 0; const t = (ok: boolean, l: string) => { if (!ok) fails++; console.log((ok ? 'ok  ' : 'FAIL') + ' ' + l); };
const w = '0x' + 'ab'.repeat(20);
const { token, session } = issueWalletSession(w);
t(verifyWalletSession(token)?.wallet === w, 'token round-trips to the same wallet');
t(verifyWalletSession(token.slice(0, -2) + 'zz') === null, 'tampered mac rejected');
const [p, payload, mac] = token.split('.');
const forged = Buffer.from(JSON.stringify({ w: '0x' + 'cd'.repeat(20), i: session.issuedAt, e: session.expiresAt })).toString('base64url');
t(verifyWalletSession(`${p}.${forged}.${mac}`) === null, 'payload swap with old mac rejected');
t(verifyWalletSession(token, session.expiresAt + 1) === null, 'expired token rejected');
process.env.BOBBY_SESSION_SECRET = 'other-secret-other-secret-other-secret-1';
t(verifyWalletSession(token) === null, 'token from another secret rejected');
process.env.BOBBY_SESSION_SECRET = 'test-secret-test-secret-test-secret-1234';
const acct = privateKeyToAccount(generatePrivateKey());
const ts = new Date().toISOString();
const sig = await acct.signMessage({ message: buildWalletSessionMessage(acct.address, ts) });
const ok = await verifyWalletProof({ address: acct.address, timestamp: ts, signature: sig });
t('wallet' in ok && ok.wallet === acct.address.toLowerCase(), 'valid signature → wallet');
const other = await verifyWalletProof({ address: w, timestamp: ts, signature: sig });
t('error' in other, 'signature for another address rejected');
const stale = await verifyWalletProof({ address: acct.address, timestamp: new Date(Date.now() - 11 * 60_000).toISOString(), signature: sig });
t('error' in stale, 'stale timestamp rejected');
const hosts = allowedOriginHosts({ VERCEL_ENV: 'production', VERCEL_URL: 'bobby-agent-trader-abc.vercel.app', BOBBY_ALLOWED_ORIGINS: 'https://preview.bobbyprotocol.xyz' } as any);
t(hosts.has('bobbyprotocol.xyz') && hosts.has('www.bobbyprotocol.xyz'), 'production hosts allowed');
t(hosts.has('bobby-agent-trader-abc.vercel.app'), 'own deployment host allowed');
t(hosts.has('preview.bobbyprotocol.xyz'), 'BOBBY_ALLOWED_ORIGINS host allowed');
t(!hosts.has('evil.vercel.app') && !hosts.has('localhost'), 'other vercel.app and localhost NOT allowed in production');
const dev = allowedOriginHosts({ VERCEL_ENV: 'development' } as any);
t(dev.has('localhost'), 'localhost allowed outside production');
console.log(fails === 0 ? 'ALL PASSED' : `${fails} FAILED`); process.exit(fails ? 1 : 0);
