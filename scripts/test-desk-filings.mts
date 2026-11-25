// Unit & integration tests for api/_lib/desk-filings.ts and BOBBY_SEC_FILINGS opt-in wiring.
// Runs completely offline (mocked SEC EDGAR XBRL & submissions JSON) unless --live is passed.
import assert from 'node:assert/strict';

process.env.BOBBY_SUPABASE_URL = '';
process.env.BOBBY_SUPABASE_SERVICE_ROLE_KEY = '';
process.env.OPENAI_API_KEY = 'test-openai';
process.env.ANTHROPIC_API_KEY = 'test-anthropic';
process.env.BOBBY_PROTOCOL_BASE_URL = 'https://bobby.test';

const {
  secCikFor,
  extractSecFilingEvidence,
  loadSecFilingEvidence,
  formatUsdCompact,
  secFilingsEnabled,
} = await import('../api/_lib/desk-filings.ts');
const { notCheckedFor, loadDeskEvidenceV2, runDeskDebate } = await import('../api/_lib/desk-debate.ts');

let checks = 0;
const eq = (a: unknown, b: unknown, msg: string) => { assert.deepEqual(a, b, msg); checks++; };
const ok = (v: unknown, msg: string) => { assert.ok(v, msg); checks++; };

// 1. Asset-class & listing isolation: ONLY US single-name corporate equities map to an SEC CIK.
eq(secCikFor('NVDA'), '0001045810', 'NVDA maps to verified CIK');
eq(secCikFor('msft'), '0000789019', 'lowercase ticker normalized');
eq(secCikFor('BTC'), null, 'crypto BTC never maps to SEC');
eq(secCikFor('SOL'), null, 'crypto SOL never maps to SEC');
eq(secCikFor('SPY'), null, 'ETF SPY excluded from corporate 10-K');
eq(secCikFor('QQQ'), null, 'ETF QQQ excluded from corporate 10-K');
eq(secCikFor('MC.PA'), null, 'non-US Euronext Paris listing excluded');
eq(secCikFor('PETR4.SA'), null, 'non-US B3 listing excluded');
eq(secCikFor('UNKNOWNXYZ'), null, 'unknown ticker returns null');

// 2. Duration-bucketed XBRL extraction: ignores 9M YTD, joins by accession (`accn`), supports 10-Q/A amendments.
const ACCN_Q3 = '0001045810-26-000088';
const ACCN_Q3_AMEND = '0001045810-26-000091';
const MOCK_FACTS = {
  entityName: 'NVIDIA CORP',
  facts: {
    'us-gaap': {
      RevenueFromContractWithCustomerExcludingAssessedTax: {
        units: {
          USD: [
            // 9-month YTD trap (273 days) -> MUST be ignored so quarterly YoY isn't polluted!
            { start: '2026-01-26', end: '2026-10-25', val: 110_000_000_000, form: '10-Q', filed: '2026-11-18', fy: 2027, fp: 'Q3', accn: ACCN_Q3 },
            // Prior-year Q3 (91 days)
            { start: '2025-07-28', end: '2025-10-26', val: 35_082_000_000, form: '10-Q', filed: '2025-11-20', fy: 2026, fp: 'Q3', accn: '0001045810-25-000070' },
            // Original Q3 10-Q superseded by 10-Q/A amendment!
            { start: '2026-07-27', end: '2026-10-25', val: 45_000_000_000, form: '10-Q', filed: '2026-11-15', fy: 2027, fp: 'Q3', accn: ACCN_Q3 },
            { start: '2026-07-27', end: '2026-10-25', val: 46_700_000_000, form: '10-Q/A', filed: '2026-11-18', fy: 2027, fp: 'Q3', accn: ACCN_Q3_AMEND },
          ],
        },
      },
      OperatingIncomeLoss: {
        units: {
          USD: [
            { start: '2026-07-27', end: '2026-10-25', val: 26_000_000_000, form: '10-Q', filed: '2026-11-15', fy: 2027, fp: 'Q3', accn: ACCN_Q3 },
            { start: '2026-07-27', end: '2026-10-25', val: 28_020_000_000, form: '10-Q/A', filed: '2026-11-18', fy: 2027, fp: 'Q3', accn: ACCN_Q3_AMEND },
          ],
        },
      },
      NetIncomeLoss: {
        units: {
          USD: [
            { start: '2026-07-27', end: '2026-10-25', val: 24_284_000_000, form: '10-Q/A', filed: '2026-11-18', fy: 2027, fp: 'Q3', accn: ACCN_Q3_AMEND },
          ],
        },
      },
      EarningsPerShareDiluted: {
        units: {
          'USD/shares': [
            { start: '2026-07-27', end: '2026-10-25', val: 0.99, form: '10-Q/A', filed: '2026-11-18', fy: 2027, fp: 'Q3', accn: ACCN_Q3_AMEND },
          ],
        },
      },
      CashAndCashEquivalentsAtCarryingValue: {
        units: {
          USD: [
            // Stale 2-year-old balance sheet row -> ignored when current period row exists
            { end: '2024-10-25', val: 99_999_000_000, form: '10-Q', filed: '2024-11-18', accn: '0001045810-24-000010' },
            { end: '2026-10-25', val: 12_400_000_000, form: '10-Q/A', filed: '2026-11-18', accn: ACCN_Q3_AMEND },
          ],
        },
      },
      LongTermDebtNoncurrent: {
        units: {
          USD: [
            // Stale prior-year debt only -> MUST NOT attach to 2026-10-25 period!
            { end: '2025-10-26', val: 9_999_000_000, form: '10-Q', filed: '2025-11-20', accn: '0001045810-25-000070' },
          ],
        },
      },
    },
  },
};

const MOCK_SUBMISSIONS = {
  name: 'NVIDIA CORP',
  filings: {
    recent: {
      // Newer 10-Q already in submissions before companyfacts catches up -> MUST NOT be cited for ACCN_Q3_AMEND numbers!
      form: ['10-Q', '10-Q/A', '10-Q', '10-K'],
      filingDate: ['2026-11-24', '2026-11-18', '2026-11-15', '2026-02-26'],
      reportDate: ['2026-11-24', '2026-10-25', '2026-10-25', '2026-01-25'],
      accessionNumber: ['0001045810-26-000199', ACCN_Q3_AMEND, ACCN_Q3, '0001045810-26-000012'],
      primaryDocument: ['nvda-future.htm', 'nvda-20261025a.htm', 'nvda-20261025.htm', 'nvda-20260125.htm'],
    },
  },
};

const nowFresh = Date.parse('2026-11-24T12:00:00Z');
const parsed = extractSecFilingEvidence('0001045810', MOCK_FACTS, MOCK_SUBMISSIONS, nowFresh);
ok(parsed !== null, 'extracts valid SecFilingEvidence');
eq(parsed!.provenance.source, 'SEC EDGAR', 'provenance source');
eq(parsed!.provenance.form, '10-Q/A', 'joins exact amended 10-Q/A form by accession, ignoring newer unmatched submission');
eq(parsed!.provenance.accessionNumber, ACCN_Q3_AMEND, 'carries exact accession number');
eq(parsed!.provenance.filingDate, '2026-11-18', 'uses filing date of backing accession, not newer 2026-11-24 submission');
eq(
  parsed!.provenance.filingUrl,
  'https://www.sec.gov/Archives/edgar/data/1045810/000104581026000091/nvda-20261025a.htm',
  'exact clickable SEC EDGAR URL joined by accession',
);
eq(parsed!.period.kind, 'quarterly', 'duration bucketed as quarterly');
eq(parsed!.period.start, '2026-07-27', 'preserves exact period start');
eq(parsed!.metrics.revenueUsd, 46_700_000_000, 'uses 10-Q/A amended revenue and ignores 9M YTD');
eq(parsed!.metrics.revenueYoYPct, 33.1, 'exact quarterly YoY growth %');
eq(parsed!.metrics.operatingMarginPct, 60.0, 'matches operating income from same 10-Q/A accession');
eq(parsed!.metrics.netMarginPct, 52.0, 'exact net margin %');
eq(parsed!.metrics.epsDiluted, 0.99, 'exact diluted EPS');
eq(parsed!.metrics.cashAndEquivalentsUsd, 12_400_000_000, 'aligns cash to same period end');
eq(parsed!.metrics.longTermDebtUsd, null, 'rejects stale 1-year-old balance-sheet debt');
eq(parsed!.formatted.revenue, '$46.70B', 'pre-formats revenue compactly for LLM');
eq(parsed!.formatted.operatingIncome, '$28.02B', 'pre-formats operating income compactly for LLM');
eq(parsed!.formatted.cashAndEquivalents, '$12.40B', 'pre-formats cash compactly for LLM');
eq(parsed!.formatted.longTermDebt, null, 'null debt formatted as null');
eq(parsed!.stale, false, 'recent filing is not stale');

// Same-date GAAP tie-break regression: total `Revenues` beats narrower ASC 606 contract subset on exact same period end!
const TIE_FACTS = {
  entityName: 'MIXED LEASING CORP',
  facts: {
    'us-gaap': {
      RevenueFromContractWithCustomerExcludingAssessedTax: {
        units: { USD: [{ start: '2026-07-01', end: '2026-09-30', val: 18_000_000_000, form: '10-Q', filed: '2026-10-25', fy: 2026, fp: 'Q3', accn: '0000000001-26-000001' }] },
      },
      Revenues: {
        units: { USD: [{ start: '2026-07-01', end: '2026-09-30', val: 25_000_000_000, form: '10-Q', filed: '2026-10-25', fy: 2026, fp: 'Q3', accn: '0000000001-26-000001' }] },
      },
    },
  },
};
const tieParsed = extractSecFilingEvidence('0000000001', TIE_FACTS, null, nowFresh);
eq(tieParsed!.metrics.revenueUsd, 25_000_000_000, 'prefers total GAAP Revenues over narrower ASC 606 subset on date tie');
eq(tieParsed!.formatted.revenue, '$25.00B', 'pre-formats total Revenues on date tie');

// GAAP tag migration regression test (e.g. NVDA migrating from RevenueFromContract... in 2022 to Revenues in 2023+):
const MIGRATED_ACCN = '0001045810-26-000501';
const MIGRATED_FACTS = {
  entityName: 'MIGRATED CORP',
  facts: {
    'us-gaap': {
      RevenueFromContractWithCustomerExcludingAssessedTax: {
        units: { USD: [{ start: '2021-01-01', end: '2021-12-31', val: 10_000_000_000, form: '10-K', filed: '2022-02-20', fy: 2021, fp: 'FY', accn: '0001045810-22-000001' }] },
      },
      Revenues: {
        units: {
          USD: [
            { start: '2025-07-01', end: '2025-09-30', val: 20_000_000_000, form: '10-Q', filed: '2025-11-05', fy: 2025, fp: 'Q3', accn: '0001045810-25-000501' },
            { start: '2026-07-01', end: '2026-09-30', val: 30_000_000_000, form: '10-Q', filed: '2026-11-05', fy: 2026, fp: 'Q3', accn: MIGRATED_ACCN },
          ],
        },
      },
    },
  },
};
const MIGRATED_SUBS = {
  name: 'MIGRATED CORP',
  filings: {
    recent: {
      form: ['10-Q'],
      filingDate: ['2026-11-05'],
      reportDate: ['2026-09-30'],
      accessionNumber: [MIGRATED_ACCN],
      primaryDocument: ['mig-20260930.htm'],
    },
  },
};
const migrated = extractSecFilingEvidence('0001045810', MIGRATED_FACTS, MIGRATED_SUBS, nowFresh);
eq(migrated!.period.end, '2026-09-30', 'picks freshest GAAP revenue concept after tag migration');
eq(migrated!.metrics.revenueUsd, 30_000_000_000, 'extracts migrated concept revenue');
eq(migrated!.metrics.revenueYoYPct, 50.0, 'computes YoY inside migrated concept');
eq(migrated!.provenance.filingDate, '2026-11-05', 'joins migrated accession date cleanly');
eq(migrated!.provenance.filingUrl, 'https://www.sec.gov/Archives/edgar/data/1045810/000104581026000501/mig-20260930.htm', 'joins migrated accession URL');

// Stale filing (> 160 days old) even when a newer unrelated submission exists!
const staleParsed = extractSecFilingEvidence('0001045810', MOCK_FACTS, MOCK_SUBMISSIONS, Date.parse('2027-06-15T00:00:00Z'));
eq(staleParsed!.stale, true, 'filing older than 160 days flagged stale based on backing accession');

// Compact formatter
eq(formatUsdCompact(46_700_000_000), '$46.70B', 'billions formatted');
eq(formatUsdCompact(450_000_000), '$450.0M', 'millions formatted');
eq(formatUsdCompact(null), null, 'null preserved');

// 3. notCheckedFor backwards compatibility + dynamic update when SEC filings loaded
eq(notCheckedFor('equity'), ['news', 'earnings', 'filings', 'fundamentals', 'macro'], 'default equity notChecked unchanged');
eq(notCheckedFor('equity', { hasFilings: false }), ['news', 'earnings', 'filings', 'fundamentals', 'macro'], 'hasFilings=false unchanged');
eq(notCheckedFor('equity', { hasFilings: true }), ['news', 'earnings', 'fundamentals', 'macro'], 'hasFilings=true removes filings only (keeps fundamentals honest)');
eq(notCheckedFor('crypto', { hasFilings: true }), ['news', 'fundamentals', 'macro'], 'crypto never claims SEC filings');

// 4. Integration with loadDeskEvidenceV2 & runDeskDebate under BOBBY_SEC_FILINGS=off vs on
const origFetch = globalThis.fetch;
const START = Date.now();
const H = 3600_000, DAY = 86_400_000;
const candles = Array.from({ length: 100 }, (_, i) => ({ ts: START - (100 - i) * H, open: 100 + i, high: 102 + i, low: 99 + i, close: 101 + i, volume: 10 }));
const daily = Array.from({ length: 65 }, (_, i) => ({ ts: START - (65 - i) * DAY, open: 140 + i, high: 142 + i, low: 139 + i, close: 141 + i, volume: 20 }));

const jsonRes = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

let secCalls = 0;
let seenFilingsRule = false;
let seenUnauditedNote = false;
let seenFilingsInInput = false;

globalThis.fetch = (async (input: string | URL, init?: RequestInit) => {
  const url = String(input);
  if (url.includes('data.sec.gov/api/xbrl/companyfacts')) { secCalls++; return jsonRes(MOCK_FACTS); }
  if (url.includes('data.sec.gov/submissions')) { secCalls++; return jsonRes(MOCK_SUBMISSIONS); }
  if (url.includes('/api/stock-candles')) return jsonRes({ symbol: 'NVDA', currency: 'USD', exchange: 'NasdaqGS', candles: url.includes('interval=1d') ? daily : candles });
  if (url.includes('forum_threads')) return jsonRes([]);
  if (url.includes('api.openai.com') || url.includes('api.anthropic.com')) {
    const body = JSON.parse(String(init?.body ?? '{}'));
    const sys = Array.isArray(body.system) ? body.system.map((b: any) => b.text).join('') : body.messages?.[0]?.content ?? '';
    const usr = Array.isArray(body.system) ? body.messages?.[0]?.content ?? '' : body.messages?.[1]?.content ?? '';
    if (sys.includes('evidence.filings holds official SEC EDGAR')) seenFilingsRule = true;
    if (sys.includes('10-Q filings are unaudited')) seenUnauditedNote = true;
    if (usr.includes('"filings"') && usr.includes('46700000000')) seenFilingsInInput = true;
    const isCio = sys.includes('Your role is CIO');
    const isRev = sys.includes('You are the thesis reviewer');
    const content = isRev
      ? { supports: ['Revenue grew 33.1% YoY in the latest 10-Q/A.'], challenges: ['Short-term candles still fluctuate.'], unknowns: ['News is not checked.'] }
      : isCio
        ? { analysis: 'NVDA leans long on trend and Q3 10-Q/A revenue growth of 33.1% YoY to $46.70B.', verdict: 'review', direction: 'long', synthesis: { headline: 'NVDA leans up with 33.1% Q3 revenue growth.', why: 'Price above averages backed by 10-Q/A 60% operating margin.', risk: 'News and macro calendar are not checked.', watch: 'Watch support near 190.', watchLevel: 190, followUp: 'What drives NVDA margin durability next quarter?' } }
        : { analysis: 'The trend and Q3 10-Q/A filing figures support a conditional bullish read.' };
    return url.includes('anthropic')
      ? jsonRes({ stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify(content) }], usage: { input_tokens: 100, output_tokens: 40 } })
      : jsonRes({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(content) } }], usage: { prompt_tokens: 100, completion_tokens: 40 } });
  }
  throw new Error(`Unexpected fetch: ${url}`);
}) as typeof fetch;

// With flag OFF (default): zero SEC requests made!
delete process.env.BOBBY_SEC_FILINGS;
eq(secFilingsEnabled(), false, 'disabled by default');
const evOff = await loadDeskEvidenceV2('NVDA', 'equity');
eq(secCalls, 0, 'zero SEC requests when BOBBY_SEC_FILINGS is off');
eq('filings' in evOff, false, 'no filings property attached when off');

// With flag ON: SEC EDGAR loaded, concurrent calls deduplicated, injected into debate!
process.env.BOBBY_SEC_FILINGS = 'on';
eq(secFilingsEnabled(), true, 'enabled when BOBBY_SEC_FILINGS=on');
const [evOn, evConcurrent] = await Promise.all([
  loadDeskEvidenceV2('NVDA', 'equity'),
  loadSecFilingEvidence('NVDA'),
]);
eq(secCalls, 2, 'concurrent SEC calls deduplicated to 2 fetches (facts + submissions)');
ok('filings' in evOn && evOn.filings?.provenance.form === '10-Q/A', 'attaches parsed SEC 10-Q/A filing evidence');
eq(evConcurrent?.provenance.accessionNumber, ACCN_Q3_AMEND, 'concurrent caller gets exact same deduplicated result');

const debate = await runDeskDebate('Does NVDA 10-Q support a bullish read?', evOn, 'en', {
  level: 'profundo',
  thesis: { hypothesis: 'AI data center demand keeps growing', savedAt: new Date(START - 10 * DAY).toISOString(), priceAtSave: 180 },
  now: START,
});
ok(seenFilingsRule, 'FILINGS_RULE injected into agent system prompt when filings present');
ok(seenUnauditedNote, 'prompt clarifies 10-Q filings are unaudited');
ok(seenFilingsInInput, 'official SEC filing figures passed in debate input');
eq((debate.evidenceUsed as any).filings?.form, '10-Q/A', 'evidenceUsed exposes SEC filing provenance');
eq(debate.review?.notChecked, ['news', 'earnings', 'fundamentals', 'macro'], 'thesis review notChecked removes filings only when fresh revenue filing loaded');

// Fail-open test: SEC 503 returns null without throwing
globalThis.fetch = (async () => new Response('Unavailable', { status: 503 })) as typeof fetch;
eq(await loadSecFilingEvidence('NVDA'), null, 'SEC 503 fails open to null');
eq(await loadSecFilingEvidence('BTC'), null, 'crypto returns null without calling fetch');

globalThis.fetch = origFetch;
console.log(`desk-filings: ${checks} offline checks passed.`);

// Optional --live smoke test against real official SEC EDGAR API (7 US equities)
if (process.argv.includes('--live')) {
  for (const sym of ['NVDA', 'MSFT', 'AAPL', 'META', 'TSLA', 'AMZN', 'JPM']) {
    const live = await loadSecFilingEvidence(sym);
    assert.ok(live !== null, `live SEC EDGAR returned data for ${sym}`);
    assert.ok(live.period.end >= '2025-01-01', `${sym} period must be recent, got ${live.period.end}`);
    assert.ok(live.provenance.filingUrl?.startsWith('https://www.sec.gov/Archives/edgar/data/'), `${sym} has valid SEC EDGAR URL`);
    console.log(
      `  [LIVE SEC EDGAR] ${sym.padEnd(5)} (${(live.provenance.entityName ?? '').slice(0, 22).padEnd(22)}) | ${live.provenance.form.padEnd(6)} filed ${live.provenance.filingDate} ` +
      `| ${live.period.kind.padEnd(9)} end=${live.period.end} | rev=${String(formatUsdCompact(live.metrics.revenueUsd)).padEnd(8)} ` +
      `(YoY=${live.metrics.revenueYoYPct}%) | opMargin=${live.metrics.operatingMarginPct}% | EPS=${live.metrics.epsDiluted}`,
    );
  }
}
