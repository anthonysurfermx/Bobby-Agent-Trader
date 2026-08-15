import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Interface } from 'ethers';
import { isNonceConflict } from '../api/_lib/chain-tx.ts';
import {
  DEFAULT_HERMES_URL,
  CURRENT_HERMES_URL,
  PRICE_MODE,
  PYTH_FEEDS,
  PYTH_CONTRACTS,
  TRACK_RECORD_V1_READ_ABI,
  TRACK_RECORD_V2_ABI,
  canonicalizeTrackSymbol,
  fetchHermesPriceUpdate,
  hermesUrlForPyth,
  modeForSymbol,
  pnlBpsFromOracle,
  pythPriceToE8,
  resultFromPnlBps,
  readTrackRecordPublicStats,
  toV1DebateHash,
  toV2DebateHash,
} from '../api/_lib/track-record-v2.ts';

let checks = 0;
function check(run: () => void) {
  run();
  checks += 1;
}

const previousApiKey = process.env.PYTH_HERMES_API_KEY;
const previousHermesUrl = process.env.PYTH_HERMES_URL;

try {
  delete process.env.PYTH_HERMES_URL;
  check(() => assert.equal(canonicalizeTrackSymbol('btc-usdt-swap'), 'BTC'));
  check(() => assert.equal(canonicalizeTrackSymbol(' ETH '), 'ETH'));
  check(() => assert.throws(() => canonicalizeTrackSymbol('BTC/../../ETH'), /canonicalize/));
  check(() => assert.equal(modeForSymbol('BTC'), PRICE_MODE.VERIFIED));
  check(() => assert.equal(modeForSymbol('OKB'), PRICE_MODE.ATTESTED));
  check(() => assert.equal(hermesUrlForPyth(8453, PYTH_CONTRACTS[8453].upgraded), DEFAULT_HERMES_URL));
  check(() => assert.equal(hermesUrlForPyth(8453, PYTH_CONTRACTS[8453].current), CURRENT_HERMES_URL));
  check(() => assert.throws(() => hermesUrlForPyth(8453, '0x0000000000000000000000000000000000000001'), /canonical set/));

  const threadId = 'thread-123';
  const btcHash = toV2DebateHash(threadId, 'BTC', PRICE_MODE.VERIFIED);
  check(() => assert.notEqual(btcHash, toV1DebateHash(threadId)));
  check(() => assert.notEqual(btcHash, toV2DebateHash(threadId, 'ETH', PRICE_MODE.VERIFIED)));
  check(() => assert.notEqual(btcHash, toV2DebateHash(threadId, 'BTC', PRICE_MODE.ATTESTED)));

  check(() => assert.equal(pythPriceToE8(123456789n, -8), 123456789n));
  check(() => assert.equal(pythPriceToE8(123456n, -6), 12345600n));
  check(() => assert.equal(pnlBpsFromOracle(true, 100_00000000n, 105_00000000n), 500n));
  check(() => assert.equal(pnlBpsFromOracle(false, 100_00000000n, 105_00000000n), -500n));
  check(() => assert.equal(resultFromPnlBps(-1n), 'loss'));
  check(() => assert.equal(isNonceConflict(new Error('replacement transaction underpriced')), true));
  check(() => assert.equal(isNonceConflict(new Error('execution reverted')), false));

  const iface = new Interface(TRACK_RECORD_V2_ABI);
  check(() => assert.equal(iface.getFunction('commitTrade')?.inputs.length, 9));
  check(() => assert.equal(iface.getFunction('resolveTrade')?.inputs.length, 6));
  check(() => assert.equal(iface.getFunction('expireCommitment')?.inputs.length, 1));
  check(() => assert.equal(iface.getFunction('getWinRate'), null));

  const v2ReadValues: Record<string, unknown[]> = {
    totalTrades: [9n],
    totalCommitments: [12n],
    getVerifiedScorecard: [6000n, 5n, 6n, 1n, 2n, 6666n],
    winsVerified: [3n],
    lossesVerified: [2n],
    totalPnlBpsVerified: [125n],
    getAttestedWinRate: [5000n],
    winsAttested: [1n],
    lossesAttested: [1n],
    totalPnlBpsAttested: [-50n],
    getCoverage: [2n, 0n, 1n],
  };
  const v2Calls: string[] = [];
  const v2Stats = await readTrackRecordPublicStats(async (data) => {
    const tx = iface.parseTransaction({ data });
    assert.ok(tx);
    v2Calls.push(tx.name);
    return iface.encodeFunctionResult(tx.name, v2ReadValues[tx.name]);
  }, true);
  check(() => assert.equal(v2Stats.winRateBps, '6000'));
  check(() => assert.equal(v2Stats.resolutionBps, '6666'));
  check(() => assert.equal(v2Stats.attested?.totalPnlBps, '-50'));
  check(() => assert.ok(!v2Calls.includes('getWinRate')));

  const v1Iface = new Interface(TRACK_RECORD_V1_READ_ABI);
  const v1ReadValues: Record<string, unknown[]> = {
    totalTrades: [4n], totalCommitments: [6n], getWinRate: [7500n], wins: [3n],
    losses: [1n], totalPnlBps: [200n], pendingCount: [2n],
  };
  const v1Stats = await readTrackRecordPublicStats(async (data) => {
    const tx = v1Iface.parseTransaction({ data });
    assert.ok(tx);
    return v1Iface.encodeFunctionResult(tx.name, v1ReadValues[tx.name]);
  }, false);
  check(() => assert.equal(v1Stats.winRateBps, '7500'));
  check(() => assert.equal(v1Stats.pending, '2'));

  delete process.env.PYTH_HERMES_API_KEY;
  await assert.rejects(
    fetchHermesPriceUpdate({ feedId: PYTH_FEEDS.BTC, kind: 'latest', fetchImpl: async () => new Response() }),
    /PYTH_HERMES_API_KEY/,
  );
  checks += 1;

  process.env.PYTH_HERMES_API_KEY = 'test-pyth-key';
  delete process.env.PYTH_HERMES_URL;
  let observedUrl = '';
  let observedAuth = '';
  const validFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    observedUrl = String(input);
    observedAuth = String((init?.headers as Record<string, string>)?.Authorization || '');
    return new Response(JSON.stringify({
      binary: { encoding: 'hex', data: ['aabb'] },
      parsed: [{
        id: PYTH_FEEDS.BTC.slice(2),
        price: { price: '10000000000000', conf: '1000', expo: -8, publish_time: 1_776_000_000 },
      }],
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;

  const update = await fetchHermesPriceUpdate({
    feedId: PYTH_FEEDS.BTC,
    kind: 'timestamp',
    publishTime: 1_776_000_000,
    fetchImpl: validFetch,
  });
  check(() => assert.equal(update.updateData, '0xaabb'));
  check(() => assert.equal(update.priceE8, 10000000000000n));
  check(() => assert.equal(observedAuth, 'Bearer test-pyth-key'));
  check(() => assert.ok(observedUrl.startsWith(`${DEFAULT_HERMES_URL}/v2/updates/price/1776000000`)));
  check(() => assert.ok(observedUrl.includes(`ids%5B%5D=${PYTH_FEEDS.BTC}`)));

  const badFeedFetch = (async () => new Response(JSON.stringify({
    binary: { encoding: 'hex', data: ['aabb'] },
    parsed: [{
      id: PYTH_FEEDS.ETH.slice(2),
      price: { price: '100000000', conf: '1', expo: -8, publish_time: 1_776_000_000 },
    }],
  }), { status: 200, headers: { 'content-type': 'application/json' } })) as typeof fetch;
  await assert.rejects(
    fetchHermesPriceUpdate({ feedId: PYTH_FEEDS.BTC, kind: 'latest', fetchImpl: badFeedFetch }),
    /different price feed/,
  );
  checks += 1;

  const [cycleSource, recordSource, resolveSource, perpsSource] = await Promise.all([
    readFile(new URL('../api/bobby-cycle.ts', import.meta.url), 'utf8'),
    readFile(new URL('../api/xlayer-record.ts', import.meta.url), 'utf8'),
    readFile(new URL('../api/forum-resolve.ts', import.meta.url), 'utf8'),
    readFile(new URL('../api/okx-perps.ts', import.meta.url), 'utf8'),
  ]);
  check(() => assert.doesNotMatch(cycleSource, /function commitTrade\(bytes32,string,uint8,uint8,uint96,uint96,uint96\)/));
  check(() => assert.match(cycleSource, /fetchLocalApi\('\/api\/xlayer-record'/));
  check(() => assert.match(cycleSource, /shouldCommitOnchain && cioSaysExecute && symbol && direction/));
  check(() => assert.match(cycleSource, /TrackRecord precommit not confirmed/));
  check(() => assert.ok(
    cycleSource.indexOf('if (riskValidation.valid)') < cycleSource.indexOf("fetchLocalApi('/api/xlayer-record', trackRecordCommitPayload"),
  ));
  check(() => assert.match(cycleSource, /track_record_required: true/));
  check(() => assert.match(recordSource, /PYTH_HERMES_API_KEY|fetchHermesPriceUpdate/));
  check(() => assert.match(recordSource, /waitForSuccessfulReceipt\(tx\)/));
  check(() => assert.doesNotMatch(recordSource, /kind: 'latest'/));
  check(() => assert.match(recordSource, /Math\.max\(lowerBound, exitAt - 5\)/));
  check(() => assert.match(resolveSource, /chain first, database second/i));
  check(() => assert.match(resolveSource, /symbol: thread\.symbol/));
  check(() => assert.match(resolveSource, /x-vercel-protection-bypass/));
  check(() => assert.doesNotMatch(resolveSource, /prices\[thread\.symbol\] = verifiedExit/));
  check(() => assert.match(resolveSource, /const trackRecordRequired = thread\.trigger_data\?\.track_record_required === true/));
  check(() => assert.ok(
    perpsSource.indexOf('On-chain precommit failed; live order was not submitted') <
    perpsSource.indexOf('// Step 6: Place market order'),
  ));
  check(() => assert.doesNotMatch(perpsSource, /chain: 'X Layer \(196\)'/));
  check(() => assert.match(perpsSource, /const requiresTrackRecord = tradingMode === 'live' && internalCaller/));

  console.log(`track-record-v2-adapter: ${checks}/${checks} checks passed`);
} finally {
  if (previousApiKey === undefined) delete process.env.PYTH_HERMES_API_KEY;
  else process.env.PYTH_HERMES_API_KEY = previousApiKey;
  if (previousHermesUrl === undefined) delete process.env.PYTH_HERMES_URL;
  else process.env.PYTH_HERMES_URL = previousHermesUrl;
}
