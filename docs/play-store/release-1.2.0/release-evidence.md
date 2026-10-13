# Android 1.2.0 (10) — release evidence

The FCM-off release handoff uses the completed API35 minified suite, API34/API35 debug suites and one finished journey in each of six languages at the documented checkpoints below. **The shipping source is byte-identical to the final head; these are hosted-emulator results, never physical-phone results.** The final-head device matrix is not claimed all-green. Spanish/German/Portuguese/Italian each reached three consecutive infrastructure failures; chasing those hosts is stopped. A single final-head minified API35 suite attempt, followed by a single French tap-fix journey attempt, is recorded in the external handoff whether it passes or the host dies.

The final unsigned FCM-off artifact identity, exact download command, bytes and SHA-256 belong to `## TO CLAUDE — handoff` and draft PR #185. Artifact `evidence.json.sourceCommit` must match the final commit before owner signing. The FCM-on packaging worker failure is a separate variant limit unless final stacktrace shows an effect on the FCM-off artifact. No signing, merge or Google publication is included.

## Configuration

Package `xyz.bobbyprotocol.bobby`, namespace `xyz.bobbyprotocol.android`, version 1.2.0/code 10, minimum SDK 26, target/compile SDK 36. Release enables R8 minification and resource shrinking. The supplied build disables FCM and leaves Google billing unconfigured. No upload key was accessed: CI creates an unsigned AAB and universal release APK independently of the disposable certificate used only for emulator installation.

## Verified application checkpoint

Shipping application sources, generated-engine sources, build configuration and ProGuard are unchanged after `4a8437ebc06a5f4ec0ef7c5e9a264c7c407d6cb0`. Later changes affect instrumentation, emulator setup/captures and this dossier. This source comparison is exact:

```sh
git diff --stat 4a8437eb..HEAD -- android/app/src/main android/app/build.gradle.kts android/app/proguard-rules.pro
```

Result: **empty output; no tracked shipping file/byte changed**. The separate `android/nucleo/src` comparison is also empty. This establishes source equality, not identical compiled artifact hashes or a physical phone. Final native CI still produces unsigned artifacts for the exact final documentation/test commit; intermediate bundles must not replace them.

- [Native 38150444353](https://github.com/anthonysurfermx/Bobby-Agent-Trader/actions/runs/38150444353): FCM-off/on both passed. Independently downloaded XML totals 997 debug plus 997 release JVM cases per configuration, zero failures/errors/skips. FCM-off lint 73 warnings/2 hints; FCM-on 75 warnings/2 hints; no error/fatal findings.
- [Device 38150444437](https://github.com/anthonysurfermx/Bobby-Agent-Trader/actions/runs/38150444437): API35 Debug and minified Release suites each passed 116 cases: 106 passed, 10 skipped, 0 failures/errors. API34 Debug passed 116 cases: 105 passed, 11 skipped, 0 failures/errors. Eight existing WebGL acceptance cases, one software-GPU island animation and the locale-only class without its argument are skipped. API34 also skips an unsupported binary-message feature. These are named limits, not positive coverage.
- That run's first locale attempt passed es/pt-BR/de; en timed out after 18 captures without finalized JUnit, it/fr failed transport/framework setup. Attempt 2 passed en/it; fr setup still failed. Failed setup and unfinalized reports are excluded from coverage.
- [Generic CI 38150444348](https://github.com/anthonysurfermx/Bobby-Agent-Trader/actions/runs/38150444348) passed on attempt 3 without server or threshold changes. The earlier failures were unchanged admin performance measurements 5291/4689 ms against 4000 ms. A fresh [main 38177246138](https://github.com/anthonysurfermx/Bobby-Agent-Trader/actions/runs/38177246138) also passed. No claim that main is red.

## Latest completed suite checkpoint

[Device 38180370546 at ebaa8cc9](https://github.com/anthonysurfermx/Bobby-Agent-Trader/actions/runs/38180370546) finished all three broad suites successfully: Debug API 34, Debug API 35 and minified Release API 35. Downloaded finalized XML independently totals 116 cases per broad suite: API35 Debug/Release 106 passed, 10 skips, 0 failures/errors; API34 Debug 105 passed, 11 skips, 0 failures/errors, with the same named skip limits as above. French also finished its one unskipped release journey and 18 visually approved 720×1280 frames. Other locale jobs lost the emulator. The subsequent a50ed999 head preserves the identical shipping app and runs the corrected raw-screen capture instrumentation; its device outcome and the final commit’s exact native artifact identity are recorded externally. An individually green minified suite is not an all-green six-locale matrix.

## Release and instrumentation hardening

R8's independently compiled test APK needs the Kotlin/coroutines/AndroidX/OkHttp/Okio ABI, the app's callable public/protected surface and named reflection members. These rules apply to the shipping optimized app, with an explicit size cost; private code/resources can shrink and public names can be optimized/obfuscated. The inspected mapping records 1237 renamed Bobby classes. The bridge is AndroidX WebMessageListener, not JavaScriptInterface. Missing AndroidX Test annotations are suppressed only in the test APK.

API34 showed GMS FontsProvider death killing a stable-client Bobby process. Shipping EmojiCompat automatic downloadable-font initialization is removed; WorkManager remains. Both app and instrumentation manifests are checked and retained before device startup. The independent test APK declares no shared startup provider; the target APK alone starts WorkManager. Newest system emoji coverage depends on the installed font.

API35 exposed the IME-shortened scene shrinking the composer. It now stays at least 280 CSSpx wide within 16px margins. A meaningful local geometry case covers 320/360/393px displays. The release journey physically opens the real keyboard, checks its window and composer bounds, dismisses it with system Back and cancels empty typing with the real surface gesture. Account controls are physically scrolled into the capture. Deletion waits for actual owner-scoped local cleanup, rather than racing the null-session event.

French on a50ed999 reached home but its synchronous test pointer injection was interpreted as a hold and opened the real voice-permission explanation instead of typing. Native raw captures establish this failure; it is not an infrastructure failure or a passed journey. The final test queues real DOWN/UP events 30ms apart without waiting for overloaded WebView acknowledgement between them, and retains the TYPING/focus/IME assertions. CI native packaging now requests stacktrace after an unexplained FCM-on PackageAndroidArtifact worker failure; FCM-off artifacts passed, but the failed variant is not called green.

## Six-locale evidence

Completed checkpoint journeys: en-US, es-MX, fr-FR, pt-BR, it-IT, de-DE, each with one passed finalized JUnit case and no skips. Each exercises actual Activity/session/bridge, risk gating, home, real IME, a controlled read, the report control, Profile/Credits, memory consent, local memory, reminders, invitation and disposable account deletion. Only transport/account data are staged; no real identity or service mutation is used. UI uses the shipping no-WebGL fallback on a software GPU. After hosted 37.2.12 RenderThread segfaults, CI uses the current `-gpu software` mode rather than deprecated `swiftshader_indirect`; [official graphics configuration](https://developer.android.com/studio/run/emulator-acceleration) documents these modes. Renderer/image/adb failures are excluded and retried with a maximum of three consecutive infrastructure failures per job.

| Locale | Completed journey head | Run / attempt | JUnit result |
|---|---|---|---|
| en-US | `4a8437eb` | 38150444437 / 2 | 1 passed, 0 skips/errors/failures |
| es-MX | `4a8437eb` | 38150444437 / 1 | 1 passed, 0 skips/errors/failures |
| fr-FR | `ebaa8cc9` | 38180370546 / 1 | 1 passed, 0 skips/errors/failures |
| pt-BR | `27280754` | 38177652259 / 1 | 1 passed, 0 skips/errors/failures |
| it-IT | `4a8437eb` | 38150444437 / 2 | 1 passed, 0 skips/errors/failures |
| de-DE | `4a8437eb` | 38150444437 / 1 | 1 passed, 0 skips/errors/failures |

Every listed source head has the same shipping-source bytes as the final head. The Italian journey passed JUnit, but its keyboard frame is rejected visually; that capture is excluded from listing/IME evidence. No failed setup, vanished host, cancelled stage or unfinalized report contributes coverage.

Each locale gate requires 18 native 720×1280 RGB PNGs without alpha plus their original system `screencap` frames at exactly the same dimensions. Software decoding/PNG encoding avoids hardware-bitmap readback, but the newest host failures show that this alone does not cure the emulator death; handoff verification compares every RGB pixel against the native raw frame. No resizing/cropping/overlay occurs. This 9:16 display preserves 360×640dp at 320dpi while reducing observed software-WebView tile pressure. It meets Play phone requirements but falls below the recommended 1080px resolution. Suite 720×1600 diagnostic shots exceed Play's maximum 2:1 ratio and must not be uploaded unchanged. The historical handoff has 107 visually approved frames and 1 rejected Italian keyboard frame; [screenshots-review.md](screenshots-review.md) records the results and original provenance manifests accompany the external files.

## Packaging establishes

Actual AAB/universal-APK checks cover version/manifest/permissions, nondebuggable release, HTTPS/no cleartext/no backup, no Firebase/advertising ID/test assets/upload signature, retained language resources, native ELF LOAD alignment, BundleConfig 16KB ZIP alignment and same-build APK uncompressed native-library offsets. This establishes packaging compatibility, not execution on a 16KB device. Local SHA-256/size checks must match CI's evidence before signing.

## Unproved acceptance

No physical Android phone, Play install, actual Google OAuth/deep-link round trip, real dictation/audio, OEM keyboard/cutout, predictive-back gesture animation, GPU/WebGL, battery-delayed notification, live report/deletion service, runtime 16KB or Google policy approval was tested. Production Android profile sync remains HTTP 400 until separate draft server PR #186 and its owner-approved additive migration go live. Purchases/FCM are disabled, not tested as working. Live privacy/support/outside-app deletion pages and processor/retention facts remain owner submission gates.
