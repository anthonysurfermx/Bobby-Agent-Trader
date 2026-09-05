// Compare the real native sources to the shared server/browser execution list.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { BASE_STOCK_SYMBOLS, BASE_USDC, findBaseToken } from '../src/lib/base-swap/tokens.js';

const iosRoot = process.argv[2];
assert.ok(iosRoot, 'Usage: tsx scripts/check-stock-client-parity.mts /path/to/ios/Bobby');
const guard = readFileSync(join(iosRoot, 'Sources/BaseSwap.swift'), 'utf8');
const view = readFileSync(join(iosRoot, 'Sources/BaseSwapView.swift'), 'utf8');
const addressBlock = guard.match(/static let tokenAddresses: \[String: String\] = \[([\s\S]*?)\n {4}\]/)?.[1];
const selectionBlock = view.match(/private static let stocks = \[([^\]]+)\]/)?.[1];
assert.ok(addressBlock && selectionBlock, 'Native stock registry could not be read');
const addresses = Object.fromEntries([...addressBlock.matchAll(/"([^"]+)":\s*"(0x[0-9a-fA-F]{40})"/g)].map((m) => [m[1], m[2].toLowerCase()]));
const selection = [...selectionBlock.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
assert.deepEqual(selection, [...BASE_STOCK_SYMBOLS], 'Native picker differs from web/server');
assert.deepEqual(Object.keys(addresses).sort(), ['USDC', ...BASE_STOCK_SYMBOLS].sort(), 'Native signing allow-list differs from web/server');
assert.equal(addresses.USDC, BASE_USDC.toLowerCase());
for (const symbol of BASE_STOCK_SYMBOLS) assert.equal(addresses[symbol], findBaseToken(symbol)!.address.toLowerCase(), `${symbol}: wrong native chain identity`);
console.log(`${BASE_STOCK_SYMBOLS.length} stock identities and picker entries agree across web, API and iOS.`);
