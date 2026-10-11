
### I-1b keyboard and telemetry milestones

- Real outside-tap baseline: Pro/default and SE3/+1, one UI test and two reviewed PNGs each (`H/i1b-keyboard-baseline-*`). Exact draft retained, no answer/send, deliberate send then answers.
- Public `WKWebView.inputAccessoryView` override returning nil: same test passes on both iOS26.1 phones, all four after PNGs reviewed (`H/i1b-keyboard-after-*`); grey arrows/check bar absent. Own commit18caf03c, no private/runtime API.
- Diagnostic before-pro included an extra reopen assertion that failed; baseline specifically pins requested close/retain/send sequence. Reopening observation remains to investigate.
- Telemetry consent gate: native production default predicate reads current risk version. Acceptance/withdrawal notify gate; withdraw clears queue/read receipts/session and cancels bounded retry. Extended existing pre-risk no-network bridge test with recorded telemetry transport; old telemetry tests explicitly represent accepted notice.
- Signed fixture native telemetry+bridge+ReleaseAudit70/70 PASS (`H/i1b-telemetry/iphone-17-pro-es`). No live transport used.
