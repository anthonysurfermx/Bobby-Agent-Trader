# Build 67 UX review candidate

Recovered from the reviewed 2026-10-08 artifact and applied cleanly to main 1e43836f.

Adds skip-voice and read-summary controls, acknowledged save/retry, return-to-orb and new-question actions, explicit new-read handoff, and clearer Memory/harness copy in six languages. Saving retains the asset/verdict pointer, not the complete historical answer; reopening an asset starts a metered new read. No additional notification permission is granted.

Original evidence: 48 page flow tests, 30 next-question assertions, 56 native Memory/harness tests, a Spanish simulator UI pass, and Apple upload acceptance for iOS 1.8 (67). Upload acceptance does not establish current TestFlight availability or physical-device behavior.

This PR preserves the iOS-focused candidate; it does not claim Android parity. The speaking-dial PR builds on this change and includes Android UI adaptation. New production builds and JS tests are rerun before publication. No server deployment, database change or notification activation is part of this PR.

Publication checks: production build passed on Node 24.19.0. Full iOS page suite: 274/276 passed. Two known failures remain in this historical iOS-only candidate: the shared-page equality assertion expects Android to carry the new iOS controls, and the Portuguese save-help phrase uses "seu" despite the suite's tu-language policy. Both are addressed by the stacked build-68 candidate, whose full suites are checked separately. This is a draft review PR, not a merge-ready parity claim.
