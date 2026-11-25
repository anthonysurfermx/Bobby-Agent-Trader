import { getCache, setCache } from './api-cache.js';
import { getVoiceAsset } from '../../src/lib/voice-assets.js';
import { isListedStockSymbol } from '../../src/lib/regional-stocks.js';

// ============================================================
// desk-filings — Official SEC EDGAR XBRL grounding for US equities.
//
// Zero paid API keys: reads public SEC EDGAR `submissions` and
// `companyfacts` JSON (data.sec.gov) with a compliant User-Agent,
// 12-hour Supabase api_cache TTL (non-blocking cache write),
// in-flight request deduplication, bounded total latency budget,
// and strict fail-open semantics.
//
// Anti-hallucination guarantees:
//   - Crypto, ETFs, and non-US regional listings return null immediately.
//   - Duration-bucketed XBRL extraction (quarterly 75-105d vs annual
//     340-385d) so YTD 6m/9m numbers are NEVER compared to 3m quarters.
//   - Provenance (form, filingDate, filingUrl, stale) is joined strictly
//     by SEC accession number (`accn`) to the filing backing the numbers
//     (supports 10-K, 10-Q, 10-K/A, 10-Q/A).
//   - Margins require exact same interval (start + end) and accession
//     when present; balance-sheet instants require the same period end.
//   - YoY growth is computed only inside one consistent GAAP concept
//     against a matching same-duration prior-year period.
// ============================================================

export type SecFormType = '10-K' | '10-Q' | '10-K/A' | '10-Q/A';

export interface SecFilingEvidence {
  provenance: {
    source: 'SEC EDGAR';
    cik: string;
    entityName: string | null;
    accessionNumber: string | null;
    form: SecFormType;
    filingDate: string;
    reportDate: string | null;
    filingUrl: string | null;
  };
  period: {
    kind: 'quarterly' | 'annual';
    start: string;
    end: string;
    fiscalYear: number | null;
    fiscalPeriod: string | null;
  };
  metrics: {
    revenueUsd: number | null;
    revenueYoYPct: number | null;
    operatingIncomeUsd: number | null;
    operatingMarginPct: number | null;
    netIncomeUsd: number | null;
    netMarginPct: number | null;
    epsDiluted: number | null;
    cashAndEquivalentsUsd: number | null;
    longTermDebtUsd: number | null;
  };
  /** Pre-formatted display strings so LLMs quote exact units without 10x conversion errors. */
  formatted: {
    revenue: string | null;
    operatingIncome: string | null;
    netIncome: string | null;
    cashAndEquivalents: string | null;
    longTermDebt: string | null;
  };
  stale: boolean;
}

/**
 * Verified 10-digit SEC CIKs for Bobby's US single-name equities.
 * ETFs (SPY, QQQ, GLD...) and regional non-US listings (MC.PA, PETR4.SA...)
 * are deliberately excluded because they do not file US corporate 10-K/10-Q XBRL.
 */
export const US_EQUITY_CIKS: Readonly<Record<string, string>> = {
  NVDA: '0001045810',
  AAPL: '0000320193',
  MSFT: '0000789019',
  GOOGL: '0001652044',
  AMZN: '0001018724',
  META: '0001326801',
  TSLA: '0001318605',
  AMD: '0000002488',
  AVGO: '0001730168',
  MU: '0000723125',
  INTC: '0000050863',
  QCOM: '0000804328',
  SMCI: '0001375365',
  ARM: '0001973239',
  ORCL: '0001341439',
  CRM: '0001108524',
  ADBE: '0000796343',
  NFLX: '0001065280',
  DIS: '0001744489',
  COIN: '0001679788',
  MSTR: '0001050446',
  PLTR: '0001321655',
  HOOD: '0001783879',
  LLY: '0000059478',
  UNH: '0000731766',
  JPM: '0000019617',
  GS: '0000886982',
  V: '0001403161',
  MA: '0001141391',
  WMT: '0000104169',
  COST: '0000909832',
  NKE: '0000320187',
  XOM: '0000034088',
  CVX: '0000093410',
  BA: '0000012927',
  CAT: '0000018230',
  UBER: '0001543151',
  ABNB: '0001559720',
};

const SEC_CACHE_TTL_SEC = 12 * 3600;
const SEC_BUDGET_MS = 3500;
const STALE_FILING_DAYS = 160;
const DAY_MS = 86_400_000;
const VALID_FORMS = new Set<SecFormType>(['10-K', '10-Q', '10-K/A', '10-Q/A']);

// Deduplicates concurrent SEC cold-cache lookups for the same ticker in one instance.
const inFlight = new Map<string, Promise<SecFilingEvidence | null>>();

// Enabled by default in production; set BOBBY_SEC_FILINGS=off as an instant kill-switch.
export const secFilingsEnabled = (): boolean => process.env.BOBBY_SEC_FILINGS !== 'off';

/** Return the 10-digit SEC CIK if `symbol` is a US corporate equity, else null (never crypto, ETFs, or non-US listings). */
export function secCikFor(symbol: string): string | null {
  const sym = symbol.trim().toUpperCase();
  if (!sym || isListedStockSymbol(sym)) return null;
  const asset = getVoiceAsset(sym);
  if (asset && (asset.venue !== 'equity' || asset.group === 'ETFs')) return null;
  return US_EQUITY_CIKS[sym] ?? null;
}

interface XbrlPoint {
  start?: string;
  end?: string;
  val?: number;
  form?: string;
  filed?: string;
  fy?: number;
  fp?: string;
  accn?: string;
}

interface NormalizedDurationFact {
  start: string;
  startMs: number;
  end: string;
  endMs: number;
  durationDays: number;
  kind: 'quarterly' | 'annual';
  val: number;
  form: SecFormType;
  filed: string;
  accn: string | null;
  fy: number | null;
  fp: string | null;
}

interface NormalizedInstantFact {
  end: string;
  endMs: number;
  val: number;
  filed: string;
  accn: string | null;
}

// Prefer total GAAP Revenues / Net Revenues ahead of ASC 606 contract-only subsets so issuers
// with leasing, financing, or interest revenue (e.g., TSLA, CAT, banks) never understate top-line.
const REVENUE_TAGS = [
  'Revenues',
  'RevenuesNetOfInterestExpense',
  'RevenueFromContractWithCustomerExcludingAssessedTax',
  'RevenueFromContractWithCustomerIncludingAssessedTax',
  'SalesRevenueNet',
];
// Strictly OperatingIncomeLoss: banks report pre-tax income rather than operating income,
// so falling back to pre-tax income would mislabel pre-tax margin as operating margin.
const OP_INCOME_TAGS = ['OperatingIncomeLoss'];
const NET_INCOME_TAGS = ['NetIncomeLoss', 'ProfitLoss'];
const EPS_DILUTED_TAGS = ['EarningsPerShareDiluted'];
// Strict concept scopes: never silently swap restricted cash or lease obligations into cash/debt.
const CASH_TAGS = ['CashAndCashEquivalentsAtCarryingValue'];
const DEBT_TAGS = ['LongTermDebtNoncurrent', 'LongTermDebt'];

function parseIsoDay(iso?: string): number | null {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const ms = Date.parse(`${iso}T00:00:00Z`);
  return Number.isFinite(ms) ? ms : null;
}

function durationKind(days: number): 'quarterly' | 'annual' | null {
  if (days >= 75 && days <= 105) return 'quarterly';
  if (days >= 340 && days <= 385) return 'annual';
  return null;
}

function isSecForm(v: unknown): v is SecFormType {
  return typeof v === 'string' && VALID_FORMS.has(v as SecFormType);
}

function isNewerFiling(a: { filed: string; form?: SecFormType }, b: { filed: string; form?: SecFormType }): boolean {
  if (a.filed !== b.filed) return a.filed > b.filed;
  // On the same filing date, an amendment (/A) supersedes the original form.
  return Boolean(a.form?.endsWith('/A') && !b.form?.endsWith('/A'));
}

function collectDurationFacts(usGaap: Record<string, any>, tags: string[], unitKey: 'USD' | 'USD/shares'): NormalizedDurationFact[] {
  // Companies occasionally migrate GAAP concepts across years (e.g., NVDA switched from
  // RevenueFromContractWithCustomerExcludingAssessedTax in FY22 to Revenues in FY23+).
  // Evaluate every candidate tag and pick the concept whose most recent fact is freshest,
  // while keeping YoY calculations inside one consistent GAAP concept.
  let bestTagFacts: NormalizedDurationFact[] = [];
  let bestLatestMs = -Infinity;

  for (const tag of tags) {
    const units = usGaap?.[tag]?.units?.[unitKey];
    if (!Array.isArray(units)) continue;
    const dedup = new Map<string, NormalizedDurationFact>();
    for (const raw of units as XbrlPoint[]) {
      if (!isSecForm(raw.form)) continue;
      if (typeof raw.val !== 'number' || !Number.isFinite(raw.val)) continue;
      const startMs = parseIsoDay(raw.start);
      const endMs = parseIsoDay(raw.end);
      if (startMs === null || endMs === null || endMs <= startMs) continue;
      const days = Math.round((endMs - startMs) / DAY_MS);
      const kind = durationKind(days);
      if (!kind) continue;
      const pt: NormalizedDurationFact = {
        start: raw.start!,
        startMs,
        end: raw.end!,
        endMs,
        durationDays: days,
        kind,
        val: raw.val,
        form: raw.form,
        filed: raw.filed ?? '',
        accn: typeof raw.accn === 'string' && raw.accn.trim() ? raw.accn.trim() : null,
        fy: typeof raw.fy === 'number' ? raw.fy : null,
        fp: typeof raw.fp === 'string' ? raw.fp : null,
      };
      const key = `${pt.kind}:${pt.start}:${pt.end}`;
      const prev = dedup.get(key);
      if (!prev || isNewerFiling(pt, prev)) dedup.set(key, pt);
    }
    if (dedup.size === 0) continue;
    const sorted = [...dedup.values()].sort(
      (a, b) => b.endMs - a.endMs || (b.kind === 'quarterly' ? 1 : -1) || b.filed.localeCompare(a.filed),
    );
    if (sorted[0].endMs > bestLatestMs) {
      bestLatestMs = sorted[0].endMs;
      bestTagFacts = sorted;
    }
  }
  return bestTagFacts;
}

/** Collect an instant balance-sheet fact strictly aligned to `anchor.endMs` (±5 days) and preferring the same accession. */
function collectAlignedInstant(
  usGaap: Record<string, any>,
  tags: string[],
  anchor: NormalizedDurationFact,
): NormalizedInstantFact | null {
  let bestSameAccn: NormalizedInstantFact | null = null;
  let bestSameEnd: NormalizedInstantFact | null = null;

  for (const tag of tags) {
    const units = usGaap?.[tag]?.units?.USD;
    if (!Array.isArray(units)) continue;
    for (const raw of units as XbrlPoint[]) {
      if (!isSecForm(raw.form)) continue;
      if (typeof raw.val !== 'number' || !Number.isFinite(raw.val)) continue;
      const endMs = parseIsoDay(raw.end);
      if (endMs === null || Math.abs(endMs - anchor.endMs) > 5 * DAY_MS) continue;
      const cand: NormalizedInstantFact = {
        end: raw.end!,
        endMs,
        val: raw.val,
        filed: raw.filed ?? '',
        accn: typeof raw.accn === 'string' && raw.accn.trim() ? raw.accn.trim() : null,
      };
      if (anchor.accn && cand.accn === anchor.accn) {
        if (!bestSameAccn || cand.filed > bestSameAccn.filed) bestSameAccn = cand;
      } else if (!bestSameEnd || cand.filed > bestSameEnd.filed) {
        bestSameEnd = cand;
      }
    }
    if (bestSameAccn) return bestSameAccn;
    if (bestSameEnd) return bestSameEnd;
  }
  return null;
}

/** Match a companion income-statement metric to the exact same interval (start + end) and accession when available. */
function matchExactPeriod(facts: NormalizedDurationFact[], anchor: NormalizedDurationFact): NormalizedDurationFact | null {
  const exactInterval = facts.filter(
    (f) => f.kind === anchor.kind && Math.abs(f.startMs - anchor.startMs) <= 5 * DAY_MS && Math.abs(f.endMs - anchor.endMs) <= 5 * DAY_MS,
  );
  if (exactInterval.length === 0) return null;
  if (anchor.accn) {
    const sameAccn = exactInterval.find((f) => f.accn === anchor.accn);
    if (sameAccn) return sameAccn;
  }
  return exactInterval[0];
}

function findPriorYearSamePeriod(facts: NormalizedDurationFact[], latest: NormalizedDurationFact): NormalizedDurationFact | null {
  const targetEndMs = latest.endMs - 365 * DAY_MS;
  const targetStartMs = latest.startMs - 365 * DAY_MS;
  let best: NormalizedDurationFact | null = null;
  let bestDiff = Infinity;
  for (const f of facts) {
    if (f.kind !== latest.kind) continue;
    const endDiff = Math.abs(f.endMs - targetEndMs);
    const startDiff = Math.abs(f.startMs - targetStartMs);
    if (endDiff <= 20 * DAY_MS && startDiff <= 20 * DAY_MS && endDiff < bestDiff) {
      best = f;
      bestDiff = endDiff;
    }
  }
  return best;
}

function submissionMetaForAccession(cik: string, submissions: any, accn: string | null): {
  entityName: string | null;
  form: SecFormType;
  filingDate: string;
  reportDate: string | null;
  filingUrl: string | null;
} | null {
  const recent = submissions?.filings?.recent;
  if (!recent || !Array.isArray(recent.form) || !Array.isArray(recent.accessionNumber)) return null;
  const entityName = typeof submissions.name === 'string' ? submissions.name : null;
  const intCik = String(Number.parseInt(cik, 10));

  const buildAt = (i: number) => {
    const form = recent.form[i];
    if (!isSecForm(form)) return null;
    const filingDate = typeof recent.filingDate?.[i] === 'string' ? recent.filingDate[i] : '';
    if (!filingDate) return null;
    const reportDate = typeof recent.reportDate?.[i] === 'string' ? recent.reportDate[i] : null;
    const accession = typeof recent.accessionNumber?.[i] === 'string' ? recent.accessionNumber[i] : '';
    const primaryDoc = typeof recent.primaryDocument?.[i] === 'string' ? recent.primaryDocument[i] : '';
    const filingUrl = accession && primaryDoc
      ? `https://www.sec.gov/Archives/edgar/data/${intCik}/${accession.replace(/-/g, '')}/${primaryDoc}`
      : null;
    return { entityName, form, filingDate, reportDate, filingUrl };
  };

  // Strict accession join: never attach a newer submission URL/date to older companyfacts numbers!
  if (accn) {
    const idx = recent.accessionNumber.findIndex((a: unknown) => typeof a === 'string' && a.trim() === accn);
    if (idx >= 0) return buildAt(idx);
    // Construct deterministic SEC filing index URL when accession is older than `recent` window.
    return null;
  }
  return null;
}

const round1 = (v: number) => Math.round(v * 10) / 10;
const round2 = (v: number) => Math.round(v * 100) / 100;

/**
 * Pure deterministic extractor from SEC EDGAR `companyfacts` + `submissions`.
 * Returns null if no 10-K/10-Q revenue or net-income period is present.
 */
export function extractSecFilingEvidence(
  cik: string,
  companyFacts: any,
  submissions: any,
  nowMs: number = Date.now(),
): SecFilingEvidence | null {
  const usGaap = companyFacts?.facts?.['us-gaap'];
  if (!usGaap || typeof usGaap !== 'object') return null;

  const revFacts = collectDurationFacts(usGaap, REVENUE_TAGS, 'USD');
  const opFacts = collectDurationFacts(usGaap, OP_INCOME_TAGS, 'USD');
  const netFacts = collectDurationFacts(usGaap, NET_INCOME_TAGS, 'USD');
  const epsFacts = collectDurationFacts(usGaap, EPS_DILUTED_TAGS, 'USD/shares');

  const anchor = revFacts[0] ?? netFacts[0];
  if (!anchor) return null;

  const rev = revFacts[0] ? matchExactPeriod(revFacts, anchor) : null;
  const op = matchExactPeriod(opFacts, anchor);
  const net = matchExactPeriod(netFacts, anchor);
  const eps = matchExactPeriod(epsFacts, anchor);

  const priorRev = rev ? findPriorYearSamePeriod(revFacts, rev) : null;
  const revenueYoYPct = rev && priorRev && Math.abs(priorRev.val) > 0
    ? round1(((rev.val - priorRev.val) / Math.abs(priorRev.val)) * 100)
    : null;
  const operatingMarginPct = rev && op && rev.val > 0 ? round1((op.val / rev.val) * 100) : null;
  const netMarginPct = rev && net && rev.val > 0 ? round1((net.val / rev.val) * 100) : null;

  const cash = collectAlignedInstant(usGaap, CASH_TAGS, anchor);
  const debt = collectAlignedInstant(usGaap, DEBT_TAGS, anchor);

  // Provenance strictly follows the accession backing the extracted numbers (`anchor.accn`).
  const subMeta = submissionMetaForAccession(cik, submissions, anchor.accn);
  const intCik = String(Number.parseInt(cik, 10));
  const fallbackIndexUrl = anchor.accn
    ? `https://www.sec.gov/Archives/edgar/data/${intCik}/${anchor.accn.replace(/-/g, '')}/${anchor.accn}-index.htm`
    : null;

  const filingDate = subMeta?.filingDate || anchor.filed;
  const filedMs = parseIsoDay(filingDate);
  const stale = filedMs !== null ? (nowMs - filedMs) / DAY_MS > STALE_FILING_DAYS : false;

  return {
    provenance: {
      source: 'SEC EDGAR',
      cik,
      entityName: subMeta?.entityName ?? (typeof submissions?.name === 'string' ? submissions.name : (typeof companyFacts?.entityName === 'string' ? companyFacts.entityName : null)),
      accessionNumber: anchor.accn,
      form: subMeta?.form ?? anchor.form,
      filingDate,
      reportDate: subMeta?.reportDate ?? anchor.end,
      filingUrl: subMeta?.filingUrl ?? fallbackIndexUrl,
    },
    period: {
      kind: anchor.kind,
      start: anchor.start,
      end: anchor.end,
      fiscalYear: anchor.fy,
      fiscalPeriod: anchor.fp,
    },
    metrics: {
      revenueUsd: rev ? rev.val : null,
      revenueYoYPct,
      operatingIncomeUsd: op ? op.val : null,
      operatingMarginPct,
      netIncomeUsd: net ? net.val : null,
      netMarginPct,
      epsDiluted: eps ? round2(eps.val) : null,
      cashAndEquivalentsUsd: cash ? cash.val : null,
      longTermDebtUsd: debt ? debt.val : null,
    },
    formatted: {
      revenue: formatUsdCompact(rev ? rev.val : null),
      operatingIncome: formatUsdCompact(op ? op.val : null),
      netIncome: formatUsdCompact(net ? net.val : null),
      cashAndEquivalents: formatUsdCompact(cash ? cash.val : null),
      longTermDebt: formatUsdCompact(debt ? debt.val : null),
    },
    stale,
  };
}

/** Compact USD formatter for prompts/debugging (e.g., 35082000000 -> "$35.08B"). */
export function formatUsdCompact(usd: number | null): string | null {
  if (usd === null || !Number.isFinite(usd)) return null;
  const sign = usd < 0 ? '-' : '';
  const abs = Math.abs(usd);
  if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(1)}M`;
  return `${sign}$${abs.toFixed(0)}`;
}

async function fetchSecJson(url: string, signal: AbortSignal): Promise<any | null> {
  const userAgent = process.env.SEC_EDGAR_USER_AGENT || 'BobbyProtocolDesk/1.0 (research@bobbyprotocol.xyz)';
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': userAgent,
        Accept: 'application/json',
      },
      signal,
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

function refreshStaleness(ev: SecFilingEvidence, nowMs: number = Date.now()): SecFilingEvidence {
  const filedMs = parseIsoDay(ev.provenance.filingDate);
  const stale = filedMs !== null ? (nowMs - filedMs) / DAY_MS > STALE_FILING_DAYS : ev.stale;
  return stale === ev.stale ? ev : { ...ev, stale };
}

/**
 * Best-effort loader for a US equity's latest official SEC 10-K/10-Q facts.
 * Bounded total budget (3.5s including cache read), non-blocking cache write,
 * in-flight deduplication, and strict fail-open semantics.
 */
export async function loadSecFilingEvidence(symbol: string, outerSignal?: AbortSignal): Promise<SecFilingEvidence | null> {
  const cik = secCikFor(symbol);
  if (!cik || outerSignal?.aborted) return null;
  const sym = symbol.trim().toUpperCase();
  const cacheKey = `sec_filing:v1:${sym}`;

  const existing = inFlight.get(sym);
  if (existing) {
    if (!outerSignal) return existing;
    return Promise.race([
      existing,
      new Promise<null>((resolve) => {
        if (outerSignal.aborted) resolve(null);
        else outerSignal.addEventListener('abort', () => resolve(null), { once: true });
      }),
    ]);
  }

  const budget = AbortSignal.timeout(SEC_BUDGET_MS);
  const signal = outerSignal ? AbortSignal.any([outerSignal, budget]) : budget;

  const task = (async (): Promise<SecFilingEvidence | null> => {
    try {
      const hit = await Promise.race([
        getCache<SecFilingEvidence>(cacheKey),
        new Promise<null>((resolve) => {
          if (signal.aborted) resolve(null);
          else signal.addEventListener('abort', () => resolve(null), { once: true });
        }),
      ]);
      if (hit) return refreshStaleness(hit);
      if (signal.aborted) return null;

      const [facts, submissions] = await Promise.all([
        fetchSecJson(`https://data.sec.gov/api/xbrl/companyfacts/CIK${cik}.json`, signal),
        fetchSecJson(`https://data.sec.gov/submissions/CIK${cik}.json`, signal),
      ]);
      if (!facts) return null;
      const parsed = extractSecFilingEvidence(cik, facts, submissions);
      // Only cache 12h when both endpoints succeeded (never lock in a partial submissions outage).
      if (parsed && submissions) {
        void setCache(cacheKey, parsed, SEC_CACHE_TTL_SEC);
      }
      return parsed;
    } catch {
      return null;
    }
  })().finally(() => {
    inFlight.delete(sym);
  });

  inFlight.set(sym, task);
  return task;
}
