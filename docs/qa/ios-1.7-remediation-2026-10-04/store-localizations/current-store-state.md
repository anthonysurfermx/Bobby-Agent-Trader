# App Store 1.7 draft: current verified state

Root completed these remote actions; this worker only preserved and checked the receipts. The six locales are en-US, es-MX, pt-PT, de-DE, fr-FR and it.

| Scope | Verified state | Receipt |
| --- | --- | --- |
| iPhone 6.9 screenshots | All 30 images, five per locale in exact 01/02/03/04/06 order, persisted after reload at 12:45:25 UTC. Each locale has its own editable set. DE/FR/IT are new uploads; PT/ES/EN inherited sets were updated. | [Saved screenshots](app-store-screenshots-saved.json) |
| Version fields | All 30 fields across six locales exactly match the full applied copy after reload at 12:53:57 UTC: promotional text, description, release notes, keywords and support URL. Native selection recovered complete body text beyond the 512-character AX truncation. | [Full metadata readback](app-store-metadata-full-readback.json) |
| AppInfo | All 12 name/subtitle fields across six locales were saved and read back after reload at 12:55:28 UTC. | [Full AppInfo readback](app-store-appinfo-full-readback.json) |
| Privacy policy URLs | All six localized URLs were saved and exactly matched after reload at 13:02:48 UTC. Privacy data-disclosure answers were not modified. | [Privacy URL readback](app-store-privacyurls-full-readback.json) |
| UI target | 14/14 classes and 57/57 distinct remaining UI methods officially passed; failed first StoreShots run retained separately. | [Current UI report](../native/ui-serial-run-report.md) |
| Binary | Local Release 1.7 (63) signature/resources verified. Apple accepted the 1.7 (63) upload with explicit success marker and exit 0. TestFlight processing, build attachment and review submission still require separate remote receipts. | [Archive verification with exact QA delta](../release-archive/retry/archive-verification-with-qa-input-delta.json) |

The applied Spanish description includes root's grammar polish (3125 characters); all other prepared locale fields are unchanged. [Actual applied metadata](metadata-final-applied.json) is authoritative for this readback and [its validation](metadata-final-applied-validation.json) passes all field limits. Earlier preparation envelope flags, including `savedInAppStoreConnect:false`, are retained as historical data; the later full remote readback establishes current persistence.

The 30 selected images retain approved historical composition and are not fresh build 63 screenshots. Screens 05/07 were excluded because their historical provider footer conflicts with current 63 branding. Full artwork stays in its original directory; this report copies only manifests and small previews.

Physical installation and six-language iPhone acceptance remain unverified. [Current device blocker](../native/physical-current-blocker.json) records no Bobby installation and the local Mac-login unlock prompt; no password was read or supplied by automation.

All **48 localized metadata fields** are now backed by the three full readbacks. [Final saved metadata](metadata-final-saved.json) has the correct current saved flag; the historical prepared and applied copies are preserved unchanged. Physical acceptance stays pending and does not block the authorized candidate upload needed for TestFlight installation.

[Candidate upload receipt](../release-archive/retry/candidate-upload-receipt.json) preserves the explicit Apple marker, process result, log hash and disk reserve. [Live site rendering](../live-site-locales/report.md) separately covers DE/FR/IT/PT privacy and support plus EN privacy; these nine rendered pages do not establish all six-language hardware behavior.
