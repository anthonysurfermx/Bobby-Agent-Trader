
### I-1b keyboard and telemetry milestones

- Real outside-tap baseline: Pro/default and SE3/+1, one UI test and two reviewed PNGs each (`H/i1b-keyboard-baseline-*`). Exact draft retained, no answer/send, deliberate send then answers.
- Public `WKWebView.inputAccessoryView` override returning nil: same test passes on both iOS26.1 phones, all four after PNGs reviewed (`H/i1b-keyboard-after-*`); grey arrows/check bar absent. Own commit18caf03c, no private/runtime API.
- Diagnostic before-pro included an extra reopen assertion that failed; baseline specifically pins requested close/retain/send sequence. Reopening observation remains to investigate.
- Telemetry consent gate: native production default predicate reads current risk version. Acceptance/withdrawal notify gate; withdraw clears queue/read receipts/session and cancels bounded retry. Extended existing pre-risk no-network bridge test with recorded telemetry transport; old telemetry tests explicitly represent accepted notice.
- Signed fixture native telemetry+bridge+ReleaseAudit70/70 PASS (`H/i1b-telemetry/iphone-17-pro-es`). No live transport used.

### I-1b RAM handover and consent preview checkpoint (partial)

- T1/4.7.8: firstAsk carries chip/companion/spoken provenance; both onboarding first-question triggers use native `finishOnboarding({ask})`. Old first-read engine remains with the explicit legacy switch fallback.
- T2/4.7.8: native assigns the same first unlocked non-orb level1 starter (Byte); missing risk still blocks. Validated plain question/strict booleans; no retry/token/confirm accepted in handover payload. Long question stays whole so daily ask answers too_long locally.
- T4: ordinary WAKE pin retained; added actual BOOT->SENDING test with stalled collections, docked question, no WAKE, pointer-up ignored and first0.5s cancel guard; deliberate cancellation afterward keeps held draft. ask.start/askStart/ASK_FROM unchanged.
- Native53/53 bridge tests passed in consent-probe4 (that combined run had one preview UI selector failure, isolated below); shipping page312/312 and language13/13 including input1512 green after handover implementation. Native handover deadline/account/background/withdrawal/consume-once/no-storage cases pass.
- Review-only DEBUG+fixtures consent flag; original production composition/bounds/actions unchanged. Preview uses new neutral Profile and a no-op Not now control; it cannot decline real consent. First SE/es+1 PNG reviewed, six-language/device review matrix running. Inactive sheet is hidden only in preview because its old Not now polluted WebKit accessibility and prevented targeting the new control; probe5 UI1/1 passes with44pt measured targets. No legal copy bytes changed. SPEC4.7.6 approval still required to wire this composition; T18 bounds remain frozen until that approval.
- Handover real es/de recordings, final first-run layout and complete multilingual matrices remain pending; this is not I-1b READY.
