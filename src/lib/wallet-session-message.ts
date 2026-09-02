// EIP-4361 (Sign-In with Ethereum) message, built ONLY on the server from
// the fields stored with a single-use nonce. The browser signs the text it
// receives from GET /api/wallet-session verbatim; the server rebuilds it
// from its own copy of the fields, so a captured signature is worthless
// once its nonce is consumed (Codex review #2, blocker 3).
export interface SignInFields {
  domain: string;
  address: string;
  uri: string;
  chainId: number;
  nonce: string;
  issuedAt: string;
  expirationTime: string;
}

export const SIGN_IN_STATEMENT = 'Sign in to Bobby Protocol to prove you own this wallet. This signature is free, sends no transaction and cannot move funds.';

export function buildSignInMessage(f: SignInFields): string {
  return [
    `${f.domain} wants you to sign in with your Ethereum account:`,
    f.address,
    '',
    SIGN_IN_STATEMENT,
    '',
    `URI: ${f.uri}`,
    'Version: 1',
    `Chain ID: ${f.chainId}`,
    `Nonce: ${f.nonce}`,
    `Issued At: ${f.issuedAt}`,
    `Expiration Time: ${f.expirationTime}`,
  ].join('\n');
}
