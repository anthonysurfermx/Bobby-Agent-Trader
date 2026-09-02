# Mobile demo readiness — 2026-09-02

Audit A→Z of the iOS app flow (build 6, branch `ios/companion-bond`) against production
`bobbyprotocol.xyz`, run the morning of the investor call. Five passes: infrastructure,
UX/UI in the simulator, decision logic, voice, ticker search.

## 1. Infrastructure — all green

Every endpoint the app consumes answered 200 in production, all under 2.3 s:

| Endpoint | Used for | Latency |
|---|---|---|
| `POST /api/bobby-asset-search` | search-as-you-type, phrase resolution | 0.3–0.6 s |
| `GET /api/bobby-asset-search?browse=1` | Explore board, dictation vocabulary | 0.3 s |
| `POST /api/voice-tool` get_market | header price | 0.5–1.9 s |
| `POST /api/voice-tool` run_debate | the verdict | 0.5–2.2 s |
| `GET /api/stock-candles` | equity chart | 0.4 s |
| `GET /api/okx-candles` | crypto chart | 0.2 s |
| `POST /api/bobby-voice-free` | companion voice (OpenAI TTS, MP3) | 3.6–5.8 s (10 s for 677 chars) |
| `/privacy` | in-app privacy link | 0.4 s |

Not used by the app but broken: `/api/dex-quote` returns 502 because OKX answers 401
(DEX aggregator credentials in Vercel). Irrelevant for the demo.

## 2. Defects found and fixed

### Server (branch `fix/demo-readiness`, deploys with the next push to `main`)

1. **Every asset outside BTC/ETH/SOL was hard-wired to NO TRADE.** `technical_pulse` came
   only from `bobby-intel`, which scores three assets. NVDA, AAPL, gold, any altcoin →
   `null` → the app said "the agents did not reach directional consensus" and paid 20 XP.
   Fix: `api/voice-tool.ts` now builds the same multi-indicator pulse on demand from OKX's
   indicator API (`api/_lib/okx-indicators.ts`) for any OKX instrument, tokenized-stock
   swaps included. Verified locally: NVDA long 31 %, AAPL strong_long 66 % with plan,
   SPY long 29 %, CRCL short 34 %, SKHYNIX short 52 %, XAUT neutral (honest NO TRADE).
2. **56 of the 80 board equities returned "unavailable"** (OKX-only listings like CRCL,
   SNDK, SPCX went to a non-existent `CRCL-USDT` spot pair). Fix: venue resolution uses
   the live OKX catalog; quote and candles fall back to the tokenized swap.
3. **`change_24h_pct` was null for all crypto** (read `open24h`, endpoint emits `change24h`).
4. **"SPY" resolved to the SPX6900 memecoin** (alias `SPX`). Removed.
5. **"GLD" analyzed Adventure Gold (AGLD) with no confirmation.** GLD/SLV are now proxies
   to XAUT/XAG with a confirmation prompt; short substring hits (≤4 chars) ask first.
6. **"in video" resolved INJ via the 2-letter word "IN".** Per-word candidates need ≥3 chars.
7. **Voice rate limit 15 req / 10 min per IP** — one walkthrough (companion taps, vibe
   taps, answers) burned it and the app silently fell back to the robotic system voice.
   Raised to 60. App vibe ids (`chill/directo/pro`) are now accepted server-side.
8. `okx-candles` rejected `-SWAP` instIds.

### iOS (branch `ios/companion-bond`, commit `2abbdd7`, not pushed)

1. A backend failure could render as a disciplined NO TRADE with XP: `regime` (a global
   string, present even for a bogus symbol) counted as "data". Removed from the
   unavailable check; top-level `error` short-circuits; quote back-fill moved after it.
2. Language mixing in one card on an English phone: chip "ALCISTA", agent rail
   "tendencia alcista / soporte $… / invalida $…", momentum "sobrecompra". All localized.
   Spanish phones no longer see "No setup yet. Capital protected." above the Spanish summary.
3. Explore board unreachable after the first analysis (deck only renders on an empty
   desk). Added "Explore markets" to the ⋯ menu.
4. Vibe ids mapped to the server's (`wise/direct/analytical`).
5. Chart: resistance label clipped at the left edge ("0.50" of "R 230.50"); x-axis "TUE 03"
   read like a date → "TUE 03H".
6. Aura share card clipped top and bottom on iPhone 17 Pro; content now fits the frame.

## 3. Verified OK (no action)

Onboarding 3 steps, companion switch + 3D render, live desk, BTC full flow (chart with
entry/stop/target lines, adversarial desk, CIO verdict, desk log), Spanish natural query
"cómo va apple hoy" → AAPL, mic permission prompts, listening state, level-up overlay,
privacy link, voice contract (4 personas × es/en all valid MP3), dictation locale es-MX/en-US.

## 4. Demo script (safe path)

- Pre-grant Speech Recognition + Microphone on the demo phone; run on **cellular**, not
  venue Wi-Fi (shared IP shares the rate-limit bucket).
- Assets that show a complete story today: **BTC, ETH, SOL** (crypto, short plan),
  **AAPL** (strong long, plan), **NVDA** (honest low-conviction NO TRADE), **nasdaq / QQQ**.
- Say "s&p 500" or "nasdaq", never the bare ticker "SPY" until the server fix is live.
- Avoid: JPM, GS, V, WMT, DIS, DIA, IWM, TLT (not listed on OKX → "could not resolve").
- Expect 4–6 s of silence between "complete" and the companion speaking (TTS buffers the
  whole MP3). Keep questions short.

## 5. Still open (not blocking the demo)

- XP is awarded per completed answer (cap 3/day, 60 XP) → Level 2 on day one; the
  store copy says "never with volume". Consider a review gate before awarding.
- Conviction gate differs: server plan gate 25 %, web desk 35 %, iOS 55 %. Send the gate
  in the payload and read it.
- Chart for OKX-only equities (>5-letter symbols) still shows "SYNCING CANDLES" — the
  client only knows Yahoo for equities.
- Board equity section leads with SNDK/SKHYNIX/SOXL by volume; a curated top row would
  read better for an investor.
- `/api/dex-quote` OKX 401 in production.
