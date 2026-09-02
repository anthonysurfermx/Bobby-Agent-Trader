// Shared between the browser (signs) and the API (verifies). Keep it tiny and
// dependency-free: this text is what the wallet shows the user.
export const WALLET_SESSION_ACTION = 'bobby-wallet-session';

export function buildWalletSessionMessage(address: string, timestamp: string): string {
  return [
    'Bobby Protocol',
    '',
    'Sign in to prove you own this wallet.',
    'This signature is free, sends no transaction and cannot move funds.',
    '',
    `Wallet: ${address.toLowerCase()}`,
    `Issued: ${timestamp}`,
    `Action: ${WALLET_SESSION_ACTION}`,
  ].join('\n');
}
