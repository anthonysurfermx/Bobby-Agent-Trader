#!/usr/bin/env node

const BASE_URL = process.env.BOBBY_BASE_URL || 'https://defimexico.org';
const SECRET = process.env.BOBBY_CYCLE_SECRET;

if (!SECRET) {
  console.error('Missing BOBBY_CYCLE_SECRET');
  process.exit(1);
}

const cycleHeaders = {
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${SECRET}`,
};

const internalHeaders = {
  'Content-Type': 'application/json',
  'x-internal-secret': SECRET,
};

async function postJson(path, body, headers) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  let json = null;
  try {
    json = await res.json();
  } catch {
    json = { ok: false, error: 'Non-JSON response' };
  }

  return { status: res.status, json };
}

async function closePaperPosition(symbol) {
  const { status, json } = await postJson('/api/okx-perps', {
    action: 'close_position',
    params: {
      symbol,
      mode: 'paper',
      internalSecret: SECRET,
    },
  }, internalHeaders);

  const outcome = status === 200 && json?.ok ? 'closed' : 'skipped';
  console.log(`[cleanup] ${symbol}: ${outcome}`);
}

async function cleanupPaperPositions() {
  for (const symbol of ['BTC', 'ETH', 'SOL']) {
    try {
      await closePaperPosition(symbol);
    } catch (error) {
      console.log(`[cleanup] ${symbol}: skipped (${error instanceof Error ? error.message : String(error)})`);
    }
  }
}

function expect(condition, message) {
  if (!condition) throw new Error(message);
}

async function runScenario(name, payload, assertResponse) {
  const { status, json } = await postJson('/api/bobby-cycle', {
    kind: 'manual',
    mode: 'challenge_paper',
    language: 'en',
    ...payload,
  }, cycleHeaders);

  try {
    expect(status === 200, `HTTP ${status}`);
    assertResponse(json);
    console.log(`PASS ${name}`);
    console.log(`  executed=${json.executed} reason=${json.tradeRejectedReason || 'none'} venue=${json.executionVenue}`);
    return true;
  } catch (error) {
    console.error(`FAIL ${name}`);
    console.error(`  status=${status}`);
    console.error(`  response=${JSON.stringify(json)}`);
    console.error(`  error=${error instanceof Error ? error.message : String(error)}`);
    return false;
  }
}

const scenarios = [
  {
    name: 'BTC long conviction 8 executes',
    payload: {
      testVerdict: {
        execute: true,
        conviction: 8,
        symbol: 'BTC',
        direction: 'long',
        entry: 70000,
        stop: 68600,
        target: 72800,
      },
      testState: {
        positionsOverride: [],
      },
    },
    assertResponse: (json) => {
      expect(json.challengeMode === 'paper', 'expected paper mode');
      expect(json.executionVenue === 'paper', 'expected paper venue');
      expect(json.usedTestVerdict === true, 'expected testVerdict path');
      expect(json.executed === true, 'expected trade execution');
      expect(json.tpslOk === true, 'expected TP/SL success');
    },
  },
  {
    name: 'ETH short conviction 4 rejects below threshold',
    payload: {
      testVerdict: {
        execute: true,
        conviction: 4,
        symbol: 'ETH',
        direction: 'short',
        entry: 3500,
        stop: 3570,
        target: 3320,
      },
      testState: {
        positionsOverride: [],
      },
    },
    assertResponse: (json) => {
      expect(json.executed === false, 'expected rejection');
      expect(String(json.tradeRejectedReason || '').includes('Conviction below 6/10 threshold'), 'expected conviction rejection');
    },
  },
  {
    name: 'SOL long conviction 7 without stop rejects',
    payload: {
      testVerdict: {
        execute: true,
        conviction: 7,
        symbol: 'SOL',
        direction: 'long',
        entry: 180,
        target: 194,
      },
      testState: {
        positionsOverride: [],
      },
    },
    assertResponse: (json) => {
      expect(json.executed === false, 'expected rejection');
      expect(String(json.tradeRejectedReason || '').includes('missing stop'), 'expected stop-loss rejection');
    },
  },
  {
    name: 'BTC long conviction 8 with 3 open positions rejects',
    payload: {
      testVerdict: {
        execute: true,
        conviction: 8,
        symbol: 'BTC',
        direction: 'long',
        entry: 70000,
        stop: 68600,
        target: 72800,
      },
      testState: {
        positionsOverride: [
          { symbol: 'BTC', direction: 'long', leverage: '5x', unrealizedPnl: 0, unrealizedPnlPct: 0 },
          { symbol: 'ETH', direction: 'short', leverage: '3x', unrealizedPnl: 0, unrealizedPnlPct: 0 },
          { symbol: 'SOL', direction: 'long', leverage: '2x', unrealizedPnl: 0, unrealizedPnlPct: 0 },
        ],
      },
    },
    assertResponse: (json) => {
      expect(json.executed === false, 'expected rejection');
      expect(String(json.tradeRejectedReason || '').includes('Max concurrent positions'), 'expected max positions rejection');
    },
  },
  {
    name: 'BTC long conviction 8 with $5 balance trips circuit breaker',
    payload: {
      testVerdict: {
        execute: true,
        conviction: 8,
        symbol: 'BTC',
        direction: 'long',
        entry: 70000,
        stop: 68600,
        target: 72800,
      },
      testState: {
        balanceOverride: 5,
        availableBalanceOverride: 5,
        positionsOverride: [],
      },
    },
    assertResponse: (json) => {
      expect(json.executed === false, 'expected rejection');
      expect(String(json.tradeRejectedReason || '').includes('CIRCUIT BREAKER'), 'expected circuit breaker rejection');
    },
  },
];

async function main() {
  console.log(`Running Bobby paper smoke against ${BASE_URL}`);
  await cleanupPaperPositions();

  let passed = 0;
  for (const scenario of scenarios) {
    const ok = await runScenario(scenario.name, scenario.payload, scenario.assertResponse);
    if (ok) passed += 1;
  }

  console.log(`\nSummary: ${passed}/${scenarios.length} passed`);
  process.exit(passed === scenarios.length ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
