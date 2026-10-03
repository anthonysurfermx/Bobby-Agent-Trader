import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

// Read-only public market-data smoke. Plan mode performs no network request.
// No AI, speech, billing, authentication, admin or execution route is allowed.
const REGIONS = [
  { country: 'FR', language: 'fr', locale: 'fr-FR', symbols: ['MC.PA', 'OR.PA'], currency: 'EUR', exchange: 'Euronext Paris', venue: /paris|\bpar\b/i },
  { country: 'PT', language: 'pt', locale: 'pt-PT', symbols: ['EDP.LS', 'GALP.LS'], currency: 'EUR', exchange: 'Euronext Lisbon', venue: /lisbon|lisboa|\blis\b/i },
  { country: 'BR', language: 'pt', locale: 'pt-BR', symbols: ['PETR4.SA', 'VALE3.SA'], currency: 'BRL', exchange: 'B3 São Paulo', venue: /s[ãa]o\s*paulo|b3|bovespa|\bsao\b/i },
  { country: 'IT', language: 'it', locale: 'it-IT', symbols: ['ENEL.MI', 'ISP.MI'], currency: 'EUR', exchange: 'Euronext Milan', venue: /milan|milano|\bmil\b/i },
  { country: 'DE', language: 'de', locale: 'de-DE', symbols: ['SAP.DE', 'SIE.DE'], currency: 'EUR', exchange: 'Xetra', venue: /xetra|\bger\b/i },
];
// These visible Desk suggestions are dynamically discovered rather than curated.
const DYNAMIC_SUGGESTIONS = [{ symbol: 'TTE.PA', country: 'FR' }, { symbol: 'ENI.MI', country: 'IT' }];
const ALLOWED_PATHS = new Set(['/api/bobby-asset-search', '/api/stock-price', '/api/stock-candles']);
const RETRY_STATUSES = new Set([429, 500, 502, 503, 504]);
const argv = process.argv.slice(2);
const allowedArgs = new Set(['--run', '--base-url', '--deployment', '--out', '--help']);
function argument(name, fallback) {
  const index = argv.indexOf(name);
  if (index < 0) return fallback;
  const value = argv[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`${name} requires a value`);
  return value;
}
for (let i = 0; i < argv.length; i++) {
  if (!allowedArgs.has(argv[i])) throw new Error(`Unknown argument: ${argv[i]}`);
  if (!['--run', '--help'].includes(argv[i])) i++;
}
if (argv.includes('--help')) {
  console.log('Plan: node scripts/smoke-locale55-regional.mjs');
  console.log('After confirmed build55 deployment: node scripts/smoke-locale55-regional.mjs --run --deployment <confirmed-commit-or-deployment-id> --base-url https://bobbyprotocol.xyz --out work/locale55-regional-remote.json');
  process.exit(0);
}
const run = argv.includes('--run');
const baseUrl = new URL(argument('--base-url', 'https://bobbyprotocol.xyz'));
if (!['http:', 'https:'].includes(baseUrl.protocol) || baseUrl.username || baseUrl.password || baseUrl.search || baseUrl.hash || baseUrl.pathname !== '/') {
  throw new Error('--base-url must be an HTTP(S) origin without credentials, path, query or fragment');
}
if (baseUrl.protocol === 'http:' && !['localhost', '127.0.0.1', '[::1]'].includes(baseUrl.hostname)) throw new Error('Remote origins require HTTPS');
const deployment = argument('--deployment', null);
if (run && !deployment) throw new Error('Execution requires --deployment after the owner confirms the build55 deployment');
const out = resolve(argument('--out', 'work/locale55-regional-remote.json'));
const plan = [];
for (const region of REGIONS) {
  const symbol = region.symbols[0];
  plan.push({ kind: 'search', country: region.country, symbol, method: 'POST', path: '/api/bobby-asset-search', body: { q: symbol, language: region.language, locale: region.locale, country: region.country, limit: 8 } });
  plan.push({ kind: 'price', country: region.country, symbol, method: 'GET', path: `/api/stock-price?${new URLSearchParams({ symbols: symbol, language: region.language, locale: region.locale })}` });
  plan.push({ kind: 'candles', country: region.country, symbol, method: 'GET', path: `/api/stock-candles?${new URLSearchParams({ symbol, range: '7d', interval: '1h' })}` });
}
const curatedListings = REGIONS.flatMap((region) => region.symbols);
plan.push({ kind: 'batch-price', symbols: curatedListings, method: 'GET', path: `/api/stock-price?${new URLSearchParams({ symbols: curatedListings.join(',') })}` });
for (const suggestion of DYNAMIC_SUGGESTIONS) {
  const region = REGIONS.find((entry) => entry.country === suggestion.country);
  const symbol = suggestion.symbol;
  plan.push({ kind: 'search', discovery: 'dynamic-yahoo', country: region.country, symbol, method: 'POST', path: '/api/bobby-asset-search', body: { q: symbol, language: region.language, locale: region.locale, country: region.country, limit: 8 } });
  plan.push({ kind: 'candles', country: region.country, symbol, method: 'GET', path: `/api/stock-candles?${new URLSearchParams({ symbol, range: '7d', interval: '1h' })}` });
}
// Preserve the original ten-symbol batch. The API caps batches at ten symbols.
const dynamicSymbols = DYNAMIC_SUGGESTIONS.map((entry) => entry.symbol);
plan.push({ kind: 'batch-price', symbols: dynamicSymbols, method: 'GET', path: `/api/stock-price?${new URLSearchParams({ symbols: dynamicSymbols.join(',') })}` });
if (!run) {
  console.log(JSON.stringify({ mode: 'plan', networkRequests: 0, plannedRequests: plan.length, baseUrl: baseUrl.origin, deployment, plan }, null, 2));
  process.exit(0);
}

const report = {
  mode: 'remote-read-only', expectedDeployment: deployment,
  deploymentEvidence: 'Owner-supplied reference; HTTP response headers are recorded, but do not establish the deployed Git commit.',
  startedAt: new Date().toISOString(), baseUrl: baseUrl.origin,
  boundaries: 'Public search, quotes and candles only; no AI/TTS, paid generation, authentication, admin, database or trade execution requests. Discovery contains no live price. Quote timestamps are retained; old observations are not presented as live.',
  exchangeEvidence: 'Curated search venues are listing metadata. Dynamic Yahoo search verifies the identifier/name, while its returned currency/venue are mapped from the suffix by the handler. Curated price venues may use a listing fallback when Yahoo omits the venue; the two dynamic suggestions have no such fallback. Candle venues come directly from Yahoo snapshots.',
  plannedRequests: plan.length, results: [],
};
function check(result, condition, description) {
  result.checks.push({ description, passed: Boolean(condition) });
}
function quoteChecks(result, quote, symbol) {
  const suggestion = DYNAMIC_SUGGESTIONS.find((entry) => entry.symbol === symbol);
  const region = REGIONS.find((item) => item.symbols.includes(symbol) || item.country === suggestion?.country);
  check(result, quote?.symbol === symbol, `${symbol}: exact local symbol, no ADR or substituted asset`);
  check(result, typeof quote?.price === 'number' && Number.isFinite(quote.price) && quote.price > 0, `${symbol}: positive finite provider price`);
  check(result, quote?.currency === region.currency, `${symbol}: declared ${region.currency} currency`);
  check(result, typeof quote?.exchange === 'string' && region.venue.test(quote.exchange), `${symbol}: returned exchange matches regional listing`);
  check(result, quote?.provider === 'Yahoo Finance', `${symbol}: expected price provider`);
  const timestamp = typeof quote?.asOf === 'string' ? Date.parse(quote.asOf) : NaN;
  check(result, Number.isFinite(timestamp) && timestamp > 0 && timestamp <= result.receivedAtMs, `${symbol}: provider asOf is valid and not future`);
  if (Number.isFinite(timestamp)) result.observations.push({ symbol, price: quote.price, currency: quote.currency, exchange: quote.exchange, asOf: quote.asOf, observationAgeMs: result.receivedAtMs - timestamp });
}
function validate(result, item) {
  const body = result.body;
  check(result, result.status === 200, 'HTTP 200');
  check(result, body?.ok === true, 'Handler reports ok=true');
  if (result.status !== 200 || body?.ok !== true) return;
  const region = REGIONS.find((entry) => entry.country === item.country);
  if (item.kind === 'search') {
    const hit = body.resolved;
    if (item.discovery === 'dynamic-yahoo') {
      check(result, hit?.symbol === item.symbol, `Dynamic Yahoo search preserves ${item.symbol}`);
      for (const key of ['baseSymbol', 'instId', 'displaySymbol']) {
        if (hit?.[key] !== undefined) check(result, hit[key] === item.symbol, `Returned dynamic ${key} preserves ${item.symbol}`);
      }
      check(result, body.source === 'Yahoo Finance cash-market search' && hit?.provider === 'yahoo', 'Literal ticker resolved through dynamic Yahoo search');
      if (hit?.currency !== undefined) check(result, hit.currency === region.currency, 'Optional dynamic search currency matches listing region');
      if (hit?.exchange !== undefined) check(result, typeof hit.exchange === 'string' && region.venue.test(hit.exchange), 'Optional dynamic search venue matches listing region');
    } else {
      for (const key of ['symbol', 'baseSymbol', 'instId', 'displaySymbol']) check(result, hit?.[key] === item.symbol, `Discovery ${key} preserves ${item.symbol}`);
      check(result, hit?.currency === region.currency && hit?.quoteSymbol === region.currency, 'Discovery retains listed currency');
      check(result, hit?.exchange === region.exchange, 'Discovery retains curated regional venue');
    }
    check(result, hit?.instType === 'EQUITY' && hit?.assetClass === 'equity', 'Discovery resolves a cash equity');
    check(result, hit?.last === null, 'Discovery does not invent a quote');
    check(result, body.resolution?.matchKind === 'exact' && body.resolution?.needsConfirmation === false && body.resolution?.proxyNote === null, 'Exact local listing without proxy substitution');
    check(result, Array.isArray(body.results) && body.results.some((entry) => entry.symbol === item.symbol), 'Exact listing is present in search results');
  } else if (item.kind === 'price' || item.kind === 'batch-price') {
    const wanted = item.kind === 'price' ? [item.symbol] : item.symbols;
    const quotes = Array.isArray(body.quotes) ? body.quotes : [];
    const actual = quotes.map((quote) => quote.symbol);
    check(result, quotes.length === wanted.length && new Set(actual).size === actual.length && actual.every((symbol) => wanted.includes(symbol)), 'Exact requested symbol set, no omissions or extras');
    check(result, Array.isArray(body.unavailable) && body.unavailable.length === 0, 'All requested local listings are available');
    for (const symbol of wanted) quoteChecks(result, quotes.find((quote) => quote.symbol === symbol), symbol);
  } else if (item.kind === 'candles') {
    check(result, body.symbol === item.symbol, 'Candle symbol preserves exact local ticker');
    check(result, body.currency === region.currency, 'Candles retain provider currency');
    check(result, typeof body.exchange === 'string' && region.venue.test(body.exchange), 'Candles retain regional exchange');
    check(result, body.provider === 'Yahoo Finance', 'Expected candle provider');
    const candles = Array.isArray(body.candles) ? body.candles : [];
    check(result, candles.length > 0, 'Nonempty provider candles');
    check(result, candles.every((candle, index) => {
      const fields = [candle.ts, candle.open, candle.high, candle.low, candle.close];
      return fields.every((value) => typeof value === 'number' && Number.isFinite(value))
        && candle.ts > 0 && candle.ts <= result.receivedAtMs
        && candle.open > 0 && candle.low > 0 && candle.close > 0
        && candle.high >= Math.max(candle.low, candle.open, candle.close)
        && candle.low <= Math.min(candle.open, candle.close)
        && (index === 0 || candle.ts > candles[index - 1].ts);
    }), 'Finite positive OHLC, chronological timestamps, no future candles');
    const asOf = typeof body.asOf === 'string' ? Date.parse(body.asOf) : NaN;
    check(result, Number.isFinite(asOf) && asOf > 0 && asOf <= result.receivedAtMs && asOf === candles.at(-1)?.ts, 'Candle asOf matches last provider candle and is not future');
    if (candles.length) result.observations.push({ symbol: body.symbol, currency: body.currency, exchange: body.exchange, asOf: body.asOf, candleCount: candles.length, lastClose: candles.at(-1).close, observationAgeMs: result.receivedAtMs - asOf });
  }
}
async function request(item) {
  const url = new URL(item.path, baseUrl);
  if (!ALLOWED_PATHS.has(url.pathname) || url.origin !== baseUrl.origin) throw new Error('Request outside public market-data allowlist');
  const result = { kind: item.kind, discovery: item.discovery ?? null, country: item.country ?? null, symbol: item.symbol ?? null, symbols: item.symbols ?? null, url: url.href, method: item.method, attempts: [], checks: [], observations: [] };
  for (let attempt = 0; attempt < 3; attempt++) {
    const startedAt = new Date().toISOString();
    try {
      const response = await fetch(url, {
        method: item.method, redirect: 'error', signal: AbortSignal.timeout(20_000),
        headers: { Accept: 'application/json', ...(item.body ? { 'Content-Type': 'application/json' } : {}) },
        ...(item.body ? { body: JSON.stringify(item.body) } : {}),
      });
      const text = await response.text();
      result.receivedAtMs = Date.now();
      result.status = response.status;
      result.headers = Object.fromEntries(['date', 'cache-control', 'x-vercel-cache', 'x-vercel-id', 'retry-after'].map((key) => [key, response.headers.get(key)]));
      try { result.body = JSON.parse(text); } catch { result.body = { nonJsonBody: text.slice(0, 500) }; }
      result.attempts.push({ startedAt, receivedAt: new Date(result.receivedAtMs).toISOString(), status: response.status });
      if (!RETRY_STATUSES.has(response.status) || attempt === 2) break;
      const retryAfterSeconds = Number(response.headers.get('retry-after'));
      const waitMs = Math.max([1000, 3000][attempt], Number.isFinite(retryAfterSeconds) ? Math.min(5000, Math.max(0, retryAfterSeconds * 1000)) : 0);
      await new Promise((done) => setTimeout(done, waitMs));
    } catch (error) {
      result.receivedAtMs = Date.now();
      result.attempts.push({ startedAt, receivedAt: new Date(result.receivedAtMs).toISOString(), error: String(error) });
      result.error = String(error);
      if (attempt === 2) break;
      await new Promise((done) => setTimeout(done, [1000, 3000][attempt]));
    }
  }
  validate(result, item);
  result.passed = result.checks.every((entry) => entry.passed);
  if (result.passed) delete result.error;
  return result;
}
for (const item of plan) {
  const result = await request(item);
  report.results.push(result);
  console.log(`${result.passed ? 'PASS' : 'FAIL'} ${item.kind} ${item.symbol ?? item.symbols.join(',')} HTTP=${result.status ?? 'network-error'} checks=${result.checks.filter((entry) => entry.passed).length}/${result.checks.length}`);
}
report.completedAt = new Date().toISOString();
report.passed = report.results.every((result) => result.passed);
report.summary = {
  passedRequests: report.results.filter((result) => result.passed).length,
  totalRequests: report.results.length,
  actualHttpAttempts: report.results.reduce((total, result) => total + result.attempts.length, 0),
  failedChecks: report.results.flatMap((result) => result.checks.filter((check) => !check.passed).map((check) => ({ kind: result.kind, symbol: result.symbol, description: check.description }))),
};
await mkdir(dirname(out), { recursive: true });
await writeFile(out, `${JSON.stringify(report, null, 2)}\n`);
console.log(`Evidence: ${out}`);
process.exitCode = report.passed ? 0 : 1;
