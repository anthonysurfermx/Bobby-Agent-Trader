# P2-b: localized support subtitle layout

Source base: Bobby 1.7 (63), `393776c332b2c3f6e21d6cad457869431dd28a62`. Final DOM check: 2026-10-04T09:37:51.886Z. This binds to the modified source hashes in `support-source-manifest.json`, not an existing uploaded binary.

Both native and web `src/app/55-read.js` now measure the attached SVG text with `getComputedTextLength()`. Copy wider than 90 px splits at a measured word boundary into two tspans at x=296, 14 px apart. Long words can split by character as a fallback. The full translated words, bracket, delta and chart geometry are preserved. Short/empty subsequent subtitles remove any prior tspans. The template and chart composition were not changed.

The regression invokes the shipping `buildChart` with the shipping SVG template and translation strings in Chrome 154.0.8037.95 at 390 × 844. The market fixture is synthetic; SVG sizing/path geometry is real. Browser requests are blocked. Assertions cover both trees, all six languages above and below support, exact complete copy, 90 px line budget/4 px right margin, title/subtitle separation, plus/minus delta bounds, unchanged path/anchor geometry, and long→short/empty/no-bracket cleanup.

- Original HEAD: **106/126 logical checks passed; 20 failed** across 30 scenarios. Ten scenario combinations fail the line-budget and wrap checks (five localized subtitles in each tree); this is deliberately reproduced regression evidence.
- Fixed source: **126/126 logical checks passed; zero failed** across 30 scenarios.
- JavaScript syntax: both 55-read.js files and the new runner pass `node --check`.
- Geist: **not verified**. No local Geist face is installed or embedded in the native page. The runner accepts `--font-file=/absolute/local/Geist.woff2` to add actual font measurements when available. No font was downloaded and no substitute was claimed to be Geist.

The system-ui measurements are identical in both source trees:

| Language | Direction | Original width (px) | Final text lines / width | Final right edge (px) |
|---|---|---:|---|---:|
| en | above | 75.48 | above support (75.48 px) | 371.48 |
| en | below | 74.97 | below support (74.97 px) | 370.97 |
| es | above | 85.58 | sobre el soporte (85.58 px) | 381.58 |
| es | below | 78.23 | bajo el soporte (78.23 px) | 374.23 |
| fr | above | 115.36 | au-dessus (54.89 px) / du support (57.31 px) | 353.31 |
| fr | below | 81.06 | sous le support (81.06 px) | 377.06 |
| pt | above | 90.95 | acima do (47.45 px) / suporte (40.34 px) | 343.45 |
| pt | below | 94.05 | abaixo do (50.55 px) / suporte (40.34 px) | 346.55 |
| it | above | 88.83 | sopra il supporto (88.83 px) | 384.83 |
| it | below | 86.27 | sotto il supporto (86.27 px) | 382.27 |
| de | above | 122.89 | über der (44.50 px) / Unterstützung (75.23 px) | 371.23 |
| de | below | 126.53 | unter der (48.14 px) / Unterstützung (75.23 px) | 371.23 |

## Reproduction

```sh
PLAYWRIGHT_MODULE=/absolute/playwright/index.mjs CHROME_PATH='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' node scripts/qa/test-ios17-support-subtitle.mjs --json-report=/private/tmp/support-fixed.json
# Expected failure against the original source:
PLAYWRIGHT_MODULE=/absolute/playwright/index.mjs CHROME_PATH='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' node scripts/qa/test-ios17-support-subtitle.mjs --source-ref=393776c332b2c3f6e21d6cad457869431dd28a62 --json-report=/private/tmp/support-baseline.json
```

Evidence: `support-baseline.json`, `support-baseline.log`, `support-fixed.json`, `support-source-manifest.json`. The new committed-test candidate is `scripts/qa/test-ios17-support-subtitle.mjs`. Browser launch required sandbox approval; the approval succeeded. The browser closes in `finally` and uses an ephemeral profile. No native build/simulator command, provider call, production mutation or commit was executed by this agent.

## Backend attribution correction

The backend report at the moved primary checkout was corrected: the prior Web Speech ENOENT came from sparse checkout omissions. Materializing tracked files reproduces **339/339** with no real mic/OS prompt/network (`web-speech-results.json`, `web-speech.log`). The corrected backend total is **38 distinct applicable successful suites** (37 existing plus the new coupon regression), not a claim of full physical/commercial acceptance. The report now records the four then-uncommitted native QA files and that contract `expectedRead()` overwrites expected `language` from the active session as well as locale/country/currency.

One attempted report update did not execute because automatic approval review could not create its writer lock when the disk was full. After space recovered, the same authorized correction passed review and completed; that execution restriction is resolved.
