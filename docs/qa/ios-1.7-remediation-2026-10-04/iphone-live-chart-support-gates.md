# iPhone live chart and support gates — six languages

This is an inventory for the physical acceptance run. No gate below has been executed by this audit agent. The final generated iOS/web resources were reproduced exactly (42 files), and the shipped chart renderer passed 126 offline Chrome assertions across 30 scenarios. Those results do not establish iPhone WebKit rendering, live provider output, archive identity or TestFlight installation. No locally embedded Geist face was available; desktop measurement used `system-ui`.

## Artifact gate

Before accepting any language row, record the installed version/build, originating archive/TestFlight identity, device model, iOS version, physical viewport, app locale/country, display zoom and text-size setting. Match the installed candidate to the approved source and generated resource hashes in `final-bundle-manifest.json`. An older installed build cannot close the candidate's gates. Record consent and account access state without copying credentials.

## Per-language inventory

Each row requires fresh live BTC and NVDA reads for questions explicitly naming **1H, 4H, 1D and 1W**. This is eight reads per language (48 total when all rows can be exercised with available authorized quota). Record request identity, provider response timestamps and screenshots, and mark unavailable states honestly rather than substituting a fixture.

| App language | Live candle/source attribution | Hourly support text above/below | Transitions and clipping | Physical result |
|---|---|---|---|---|
| English (`en`) | Pending: BTC/NVDA × 1H/4H/1D/1W | Both states pending | Pending | Not verified |
| Spanish (`es`) | Pending: BTC/NVDA × 1H/4H/1D/1W | Both states pending | Pending | Not verified |
| French (`fr`) | Pending: BTC/NVDA × 1H/4H/1D/1W | Both states pending | Pending; above-support copy previously exceeded the desktop viewport | Not verified |
| Portuguese (`pt`) | Pending: BTC/NVDA × 1H/4H/1D/1W | Both states pending | Pending; above-support copy previously had almost no right margin | Not verified |
| Italian (`it`) | Pending: BTC/NVDA × 1H/4H/1D/1W | Both states pending | Pending | Not verified |
| German (`de`) | Pending: BTC/NVDA × 1H/4H/1D/1W | Both states pending | Pending; test both long localized support captions | Not verified |

### Required observations for each live asset/horizon read

1. The actual candle request is hourly (`bar=1H` for crypto, `interval=1h` for equity), the successful response declares `candlesTimeframe: "1H"`, and the chart footer says 1H even when the analysis requested 4H/1D/1W.
2. The chart's source time matches the final plotted candle timestamp, independently of the debate/evidence timestamp. Capture the raw times and the displayed localized time; do not infer a precise time solely from a relative label.
3. With explicit mismatched intervals, the hourly chart has no analysis support/resistance lines, support band, support delta/bracket or plan overlays. The separate thesis/debate/plan cards retain the original analysis information and horizon. Hourly matching reads retain eligible overlays.
4. The plotted closes remain visible and the chart domain is unaffected by mismatched analysis levels. The question, result and instrument belong to the same live read, with no stale chart from the preceding asset or locale.

### Required observations for support captions

For each language, capture a real aligned 1H response above support and one below support when those states are available. Confirm the complete localized caption is preserved, long copy uses two visible lines when required, each line fits within the chart viewport with a right margin, and caption lines do not overlap the percentage delta or each other. Preserve the chart layout and confirm the last price and plotted line are unchanged by wrapping.

Exercise long-to-short caption, empty caption and no-bracket transitions to confirm old `<tspan>` lines and deltas disappear. Check ordinary device text settings first; record any additional display-zoom/text-size setting separately. A six-language desktop font check cannot substitute for the physical iPhone font measurements.

A live below-support outcome is provider-data dependent. If the market/evidence does not produce it, mark that branch **not observed**. A separate controlled physical fixture replay can verify rendering, but label it as fixture evidence and do not present it as a live provider or TestFlight result. The same distinction applies when the verdict never produces a plan: do not fabricate a review verdict to close the live plan gate.

## Evidence to retain

Keep a compact row ledger with language/locale, asset, requested horizon, response candle interval, analysis interval, last candle time, analysis time, installed artifact identity, screenshot or recording reference, caption direction, font/display settings, and pass/fail/not-observed status. Link network/response evidence to that same request, redact account tokens, and report any unavailable quota or provider failure as a remaining gate.
