#!/usr/bin/env -S npx tsx
// Offline self-test of the wallet session: token round-trip, tampering,
// expiry, secret rotation, signature recovery, origin allowlist.
// Run: npx tsx scripts/infra/wallet-session-selftest.mts
process.env.BOBBY_SESSION_SECRET = 'test-secret-test-secret-test-secret-1234';
process.env.VERCEL_ENV = 'production';
const { issueWalletSession, verifyWalletSession, verifySignedChallenge, newSignInFields } = await import('../../api/_lib/wallet-session.ts');
const { allowedOriginHosts, requestOriginHost } = await import('../../api/_lib/origins.ts');
const { buildSignInMessage } = await import('../../src/lib/wallet-session-message.ts');
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
const fields = newSignInFields(acct.address, 'bobbyprotocol.xyz');
t(fields.domain === 'bobbyprotocol.xyz' && fields.uri === 'https://bobbyprotocol.xyz' && fields.nonce.length >= 16, 'challenge carries domain, uri, chain id and a nonce');
const msg = buildSignInMessage(fields);
t(msg.startsWith('bobbyprotocol.xyz wants you to sign in with your Ethereum account:') && msg.includes(`Nonce: ${fields.nonce}`) && msg.includes('Chain ID: '), 'EIP-4361 shaped message');
const sig = await acct.signMessage({ message: msg });
const ok = await verifySignedChallenge(fields, acct.address, sig);
t('wallet' in ok && ok.wallet === acct.address.toLowerCase(), 'valid signature over the server-built message → wallet');
t('error' in (await verifySignedChallenge(fields, w, sig)), 'signature presented for another address rejected');
t('error' in (await verifySignedChallenge({ ...fields, nonce: 'AAAAAAAAAAAAAAAAAAAAAAAA' }, acct.address, sig)), 'signature over a different nonce rejected');
t('error' in (await verifySignedChallenge({ ...fields, domain: 'evil.example' }, acct.address, sig)), 'signature bound to the domain');
t('error' in (await verifySignedChallenge(fields, acct.address, sig, Date.parse(fields.expirationTime) + 1)), 'expired challenge rejected');
t(requestOriginHost({ origin: 'https://evil.vercel.app' }) === null && requestOriginHost({ origin: 'https://bobbyprotocol.xyz' }) === 'bobbyprotocol.xyz', 'origin host resolution is exact');
const hosts = allowedOriginHosts({ VERCEL_ENV: 'production', VERCEL_URL: 'bobby-agent-trader-abc.vercel.app', BOBBY_ALLOWED_ORIGINS: 'https://preview.bobbyprotocol.xyz' } as any);
t(hosts.has('bobbyprotocol.xyz') && hosts.has('www.bobbyprotocol.xyz'), 'production hosts allowed');
t(hosts.has('bobby-agent-trader-abc.vercel.app'), 'own deployment host allowed');
t(hosts.has('preview.bobbyprotocol.xyz'), 'BOBBY_ALLOWED_ORIGINS host allowed');
t(!hosts.has('evil.vercel.app') && !hosts.has('localhost'), 'other vercel.app and localhost NOT allowed in production');
const dev = allowedOriginHosts({ VERCEL_ENV: 'development' } as any);
t(dev.has('localhost'), 'localhost allowed outside production');
console.log(fails === 0 ? 'ALL PASSED' : `${fails} FAILED`); process.exit(fails ? 1 : 0);
