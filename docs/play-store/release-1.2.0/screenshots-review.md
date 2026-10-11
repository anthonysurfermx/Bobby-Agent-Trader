# Native release capture review — six languages

All 108frames were visually inspected: 107approved for the listing/UI dossier, and the Italian keyboard frame rejected. The six documented checkpoint journeys have finalized passed JUnit. Their shipping source is byte-identical to the final head, while their commits/attempts remain explicit. The final-head matrix is not claimed all-green; three consecutive infrastructure failures on es/de/pt-BR/it ended further capture chasing. Hosted CI evidence is never physical-phone evidence.

## Capture provenance

The minified release checkpoints use en-US, es-MX, fr-FR, pt-BR, it-IT and de-DE on hosted API35. They show shipping software/no-WebGL fallback, actual native Activity/account/session/bridge/sheets and controlled localized network/account replies. No real Google identity or production service mutation is involved. Shipping app sources/configuration are unchanged after `4a8437eb`; subsequent commits change the test harness, emulator and dossier.

The original RGB PNGs are copied byte-for-byte from CI without resizing, cropping, annotation or repainting. Each `android-shots/<lang>/manifest.json` records commit, run/attempt, artifact identity, bytes, SHA-256, native dimensions and visual result. `android-shots/manifest.json` aggregates the receipts. Contact sheets are separate inspection files, never listing assets.

| Locale | Passed source commit | Run / attempt | Native dimensions |
|---|---|---|---|
| en | `4a8437eb` | [38150444437](https://github.com/anthonysurfermx/Bobby-Agent-Trader/actions/runs/38150444437) / 2 | 1080×1920 |
| es | `4a8437eb` | [38150444437](https://github.com/anthonysurfermx/Bobby-Agent-Trader/actions/runs/38150444437) / 1 | 1080×1920 |
| fr | `ebaa8cc9` | [38180370546](https://github.com/anthonysurfermx/Bobby-Agent-Trader/actions/runs/38180370546) / 1 | 720×1280 |
| pt-BR | `27280754` | [38177652259](https://github.com/anthonysurfermx/Bobby-Agent-Trader/actions/runs/38177652259) / 1 | 1080×1920 |
| it | `4a8437eb` | [38150444437](https://github.com/anthonysurfermx/Bobby-Agent-Trader/actions/runs/38150444437) / 2 | 1080×1920 |
| de | `4a8437eb` | [38150444437](https://github.com/anthonysurfermx/Bobby-Agent-Trader/actions/runs/38150444437) / 1 | 1080×1920 |

The newest capture implementation retains raw system screencap frames and verifies every RGB pixel against the encoded result. The table above describes the downloaded historical checkpoints, whose earlier capture method does not supply a separate raw-source file; only byte equality to their CI PNG is asserted. Newer passing captures, if any, and their raw-pixel receipts are recorded in the external handoff without silently changing this provenance.

## Every image

“Approved” below means visually reviewed historical UI evidence. It does not mean final-head acceptance or Google approval.

| File / surface | en | es | fr | pt-BR | it | de |
|---|---|---|---|---|---|---|
| `01-risk-notice.png` | approved | approved | approved | approved | approved | approved |
| `02-risk-notice-end.png` | approved | approved | approved | approved | approved | approved |
| `03-home.png` | approved | approved | approved | approved | approved | approved |
| `04-keyboard.png` | approved | approved | approved | approved | rejected: IME absent | approved |
| `05-read.png` | approved | approved | approved | approved | approved | approved |
| `06-report-from-read.png` | approved | approved | approved | approved | approved | approved |
| `07-profile-guest.png` | approved | approved | approved | approved | approved | approved |
| `08-credits.png` | approved | approved | approved | approved | approved | approved |
| `09-profile-account-controls.png` | approved | approved | approved | approved | approved | approved |
| `10-memory-consent.png` | approved | approved | approved | approved | approved | approved |
| `11-memory-consent-end.png` | approved | approved | approved | approved | approved | approved |
| `12-memory.png` | approved | approved | approved | approved | approved | approved |
| `13-memory-on-phone.png` | approved | approved | approved | approved | approved | approved |
| `14-reminders.png` | approved | approved | approved | approved | approved | approved |
| `15-invite.png` | approved | approved | approved | approved | approved | approved |
| `16-report-content.png` | approved | approved | approved | approved | approved | approved |
| `17-delete-confirmation.png` | approved | approved | approved | approved | approved | approved |
| `18-account-deleted.png` | approved | approved | approved | approved | approved | approved |

## Visual findings and resolution limits

The five approved keyboard frames show the actual system IME and the full composer; the Italian historical frame has a black IME area and is excluded from upload and keyboard evidence. The updated journey checks the configured IME package/window before and after capture. Profile account-control frames show sign-out and deletion after scrolling. Report titles, reasons and descriptions remain readable and localized; no raw translation keys or fixture/debug marker appears. System keyboard labels, Bobby, permanent brands/tickers and agent names are separate from translated interface copy.

Long risk/memory/report forms intentionally scroll; inactive Send on an empty report can be below the fold. Suggestion chips intentionally scroll horizontally. The frozen Portuguese risk/memory legal wording retains its approved tu/teu forms; ordinary Brazil overrides do not rewrite legal consent.

The five 1080×1920 sets meet the recommended resolution. French is a genuine 720×1280 (9:16) capture above the 320px minimum but below Play’s recommended 1080px resolution. The current CI locale display is also native 720×1280 at 320dpi (360×640dp), reducing observed software-WebView tile pressure without upscaling. Suite 720×1600 diagnostic shots exceed the maximum 2:1 ratio and are excluded from listing selection.

## Listing selection

Prefer home, completed read, Credits, Memory and invitation. Exclude `it/04-keyboard.png`. A report/account/consent image documents the tested client surface, not live moderation, deletion or Google authentication. Approved legal screens remain byte-for-byte frozen. No screenshot fabricates a phone or product UI.

## Remaining acceptance

One final-head minified API35 suite attempt and then one French tap-fix journey attempt are recorded externally. The completed six-locale checkpoints above remain the shipping-equivalent evidence; final-head cancellations and failed attempts are disclosed separately. Failed setup, vanished emulators, cancelled stages and unfinalized JUnit never count as coverage. Native signing/Play delivery, Google OAuth/deep links, dictation/voice, battery-delayed notifications, OEM keyboards/cutouts, predictive-back gestures, GPU/WebGL, runtime 16KB and real backend requests still need separate physical-phone acceptance. Production profile sync depends on owner-approved PR #186/migration; the client contains no bypass.
