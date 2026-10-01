# Bobby 1.5 (50): release preparation

Final App Review submission and release remain for the owner. This is not an approval guarantee.

## Completed in this follow-up
- Persona narration never silently substitutes Apple/system speech or a different provider. Both native attempts and the server request have bounded waits; desk and first-run voice clocks allow those attempts.
- Local account deletion removes only the deleted owner’s thesis ledger after a successful backend response. Guest and other account records are retained.
- With purchases unavailable, Invite a friend shows no future Pro promotion or reward promise.
- Keyboard/VoiceOver activation can explicitly accept the loaded consent notice. Pointer activation retains the hold requirement; loading/busy gates prevent early or repeated acceptance. Physical VoiceOver validation is still pending.
- Production backend voice commit f6ef369 deployed READY at dpl_4r2SJZpgUSPLK3Atq6ZDiYhQnTiR. No new paid provider probes performed.
- Support/privacy wording corrected to reflect the inactive notification integration and actual hashed counter retention. Final production deployment dpl_2JbwENEfzeZg8tHumySaNXqHr99Z is READY and aliased to bobbyprotocol.xyz (backend commit 4a46b7c).
- All 21 upload copies verified byte-identical to the owner-approved originals. Rejected experiment renders quarantined under rejected-experiment-do-not-upload.

## Test evidence
- 244 native unit tests passed: /private/tmp/bobby-build50-unit.xcresult. Includes successful deletion isolation and persona failure/retry tests. Mock services do not prove production purchase or account flows.
- 41 JavaScript tests passed: /private/tmp/bobby-build50-js-tests.log. These are local VM/DOM checks, not physical-device UI tests.
- Backend persona checks and 51 App Review regression checks passed with no real network/database calls.
- Four targeted simulator UI scenarios passed across the initial run and the corrected consent-label rerun: /private/tmp/bobby-build50-ui.xcresult and /private/tmp/bobby-build50-consent-final.xcresult. These do not prove physical VoiceOver or device voice.
- Archive succeeded: /private/tmp/bobby-release-20260930/Bobby-1.5-50.xcarchive. Info.plist verifies 1.5 (50), xyz.bobbyprotocol.bobby, empty RevenueCat purchase key; source commit e08d328.
- Xcode Organizer explicitly reported “Bobby 1.5 (50) uploaded”. Apple processed build 50, it appeared in Add Build, and it was selected and saved for version 1.5. No Update Review or release action was taken. Apple now displays Prepare for Submission.
- Original media uploaded in EN/ES/PT: seven per locale. Portuguese processing briefly inverted the last two; accessible reorder corrected it to 01 through 07. The owner’s English order was retained. 6.5-inch inherits each locale’s 6.9-inch media.
- Build-50 reviewer notes saved; EN keywords and all three prepared subtitles saved. Manual release remains selected. Final remote readback is recorded in apple-build50-final.txt; China mainland exclusion was verified again.

## Required owner/device or external checks
- Physical-device acceptance and unresolved external gates below remain before a release-ready claim. Chrome input trouble was resolved; upload and Apple selection are now verified.
- Confirm final persona narration, background cancellation, mic denial, consent withdrawal, real Sign in with Apple, account isolation/deletion and report/block on a physical iPhone.
- Supply the public support contact and moderation owner/backup. BREVO configuration is absent; requests currently enter a private queue without alerts.
- Apple automatic revocation credentials are absent; manual Apple revocation remains the disclosed fallback, not verified end to end on a device.
- Paid subscription release is not enabled. Apple agreements/banking/tax and real Sandbox purchase/restore/cancellation remain separate gates; RevenueCat/Amplitude production purchase integration is not proven.
- Approved UI imagery predates this build. Reviewer notes disclose this; do not silently redesign the approved images.
- Provider region coverage, commercial data permissions and equivalent data-protection contract evidence remain owner decisions from Claude’s report.
- Backend commits are local; a later main-triggered Vercel deploy could overwrite them until merged through an authorized release process.
