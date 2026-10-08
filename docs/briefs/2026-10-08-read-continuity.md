# Reading continuity in Núcleo

A completed analysis now has a visible next step. The reader can skip narration, open the full analysis immediately, save from the first summary card, and return to Bobby without discovering a sideways gesture. Saving waits for native confirmation; failures stay retryable. The summary remains scrollable through its last line.

On iOS, saving also keeps that dated reading for the next local calendar day. Bobby offers it inside the app when the reader returns. This choice requests no notification permission and schedules no notification. Reopening the reading uses its original answer, source and date; it spends no analysis credit and grants no new XP or presentation receipt. A new analysis remains an explicit, metered question.

## Local contract

- `saveThesis({requestId, keepInApp: true, horizonHours?})` retains a bounded local snapshot. The existing call without `keepInApp` keeps its existing behavior.
- Successful iOS confirmation may include `followUp: {kind: "in_app", symbol, name, availableFrom}`. The page describes a next-day return only when native confirms this field. Older native and web replies receive ordinary saved confirmation.
- `savedRead.open: {thesis}` opens the current owner's saved reading only from safe states. All paths into the saved-reading view clear the previous live read.
- Optional saved `synthesis`, `agents`, `language`, and `locale` fields decode alongside older records. Older records retain their existing levels; absent answer text is never reconstructed.
- The local ledger retains 20 readings per owner. Answer text is excluded from XP/plant requests and the harness event ledger. Deleting all memory removes the signed-in owner's saved content even offline; other owners and signed-out readings remain separate.
- The existing server-generated next question is offered after confirmed saving when eligible. The UI creates no question when the server supplies none.

## Scope and integration

This change is based on `v18a/slice1` at `b2e5e18f5ee6c0eb17f9b24500fcd3de7f40d76f`, the latest harness branch Claude identified and GitHub confirmed. It is an additive review candidate, not a merge of the broader pending harness into production.

The iOS engine changes are mirrored into Android and web page sources. Platform transports and existing web narration are retained. Web's older read model uses private stored-answer helpers so its new-reading model and narration remain unchanged. Only iOS implements the native in-app continuation; other platforms do not promise that continuation without a confirmed native field.

## Validation boundary

The candidate is Bobby 1.8 (66). Native unit tests use the dedicated iOS 26.1 simulator and test adapters; they cover persistence, account changes, next-day selection, quota-free reopening and offline erasure. JavaScript tests exercise the shipping state machine, delayed voice and save callbacks, stale gestures, saved-reading scrolling and receipt isolation. Browser screenshots use fixture data and demonstrate layout and real visible control activation.

These checks do not establish physical-iPhone audio, notification delivery, TestFlight availability, App Store review or a production rollout. The broader harness integration and a native distribution decision remain separate from this additive change.
