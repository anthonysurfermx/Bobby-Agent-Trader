import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { getAddress } from 'viem';
import { findBaseToken } from '../src/lib/base-swap/tokens.js';

const catalog = JSON.parse(readFileSync(new URL('../src/lib/base-swap/stock-candidates.json', import.meta.url), 'utf8'));
assert.equal(catalog.tokens.length, 20);
assert.equal(new Set(catalog.tokens.map((t: { underlyingSymbol: string }) => t.underlyingSymbol)).size, 20, 'Count distinct stocks, not duplicate issuers of the same stock');
const identities = new Set();
for (const token of catalog.tokens) {
  assert.equal(getAddress(token.address), token.address, 'Pin checksummed addresses');
  const identity = `${token.chainId}:${token.address.toLowerCase()}`;
  assert.ok(!identities.has(identity), 'Duplicate chain/address');
  identities.add(identity);
  assert.equal(token.admissionStatus, 'pending-review');
  if (token.builderQuest) {
    assert.equal(token.issuer, 'Coinbase Tokenized Stocks');
    assert.equal(token.chainId, 8453);
    assert.equal(getAddress(token.referenceFeed), token.referenceFeed);
  } else {
    assert.equal(token.issuer, 'Ondo Global Markets');
    assert.equal(token.chainId, 1);
    for (const ref of [token.symbol, token.address, token.underlyingSymbol]) {
      assert.equal(findBaseToken(ref), null, 'An Ethereum candidate must never resolve to the Base execution rail');
    }
  }
}
console.log('20 distinct stock identities checked; additional issuer remains outside the Base execution rail.');
