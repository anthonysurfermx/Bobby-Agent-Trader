# App Store 1.7 draft: current verified state

Root completed these remote actions; this worker only preserved and checked the receipts. The six locales are en-US, es-MX, pt-PT, de-DE, fr-FR and it.

| Scope | Verified state | Receipt |
| --- | --- | --- |
| iPhone 6.9 screenshots | All 30 images, five per locale in exact 01/02/03/04/06 order, persisted after reload at 12:45:25 UTC. Each locale has its own editable set. DE/FR/IT are new uploads; PT/ES/EN inherited sets were updated. | [Saved screenshots](app-store-screenshots-saved.json) |
| Version fields | All 30 fields across six locales exactly match the full applied copy after reload at 12:53:57 UTC: promotional text, description, release notes, keywords and support URL. Native selection recovered complete body text beyond the 512-character AX truncation. | [Full metadata readback](app-store-metadata-full-readback.json) |
| AppInfo | All 12 name/subtitle fields across six locales were saved and read back after reload at 12:55:28 UTC. | [Full AppInfo readback](app-store-appinfo-full-readback.json) |
| Privacy policy URLs | All six localized URLs were saved and exactly matched after reload at 13:02:48 UTC. Privacy data-disclosure answers were not modified. | [Privacy URL readback](app-store-privacyurls-full-readback.json) |
| UI target | 14/14 classes and 57/57 distinct remaining UI methods officially passed; failed first StoreShots run retained separately. | [Current UI report](../native/ui-serial-run-report.md) |
| Binary / attachment | Apple accepted and processed 1.7 (63); Validado binary has the expected bundle/version/build. Root saved63 on the 1.7 draft and fresh reload retained it with disabled Save/manual release. | [Processed TestFlight 63](testflight63-processed.json), [draft attachment](app-store-build63-attached.json) |

The applied Spanish description includes root's grammar polish (3125 characters); all other prepared locale fields are unchanged. [Actual applied metadata](metadata-final-applied.json) is authoritative for this readback and [its validation](metadata-final-applied-validation.json) passes all field limits. Earlier preparation envelope flags, including `savedInAppStoreConnect:false`, are retained as historical data; the later full remote readback establishes current persistence.

The 30 selected images retain approved historical composition and are not fresh build 63 screenshots. Screens 05/07 were excluded because their historical provider footer conflicts with current 63 branding. Full artwork stays in its original directory; this report copies only manifests and small previews.

Physical installation and six-language iPhone acceptance remain unverified. [Latest physical blocker](../native/physical-current-blocker-latest.json) records root's13:30:47 UTC Mac-login lock refresh; the secure field was untouched. The earlier no-Bobby app inventory is historical only, and current installation was not queried.

All **48 localized metadata fields** are now backed by the three full readbacks. [Final saved metadata](metadata-final-saved.json) has the correct current saved flag; the historical prepared and applied copies are preserved unchanged. Physical acceptance stays pending and does not block the authorized candidate upload needed for TestFlight installation.

[Candidate upload receipt](../release-archive/retry/candidate-upload-receipt.json) preserves the explicit Apple marker, process result, log hash and disk reserve. [Live site rendering](../live-site-locales/report.md) separately covers DE/FR/IT/PT privacy and support plus EN privacy; these nine rendered pages do not establish all six-language hardware behavior.

[Post-attachment checks in all six locales](post-attachment-six-locales.json) reconfirmed exact screenshots 01/02/03/04/06, build 63 and disabled Save at 13:26:03–13:26:21 UTC. This does not verify remote image hashes; the artwork retains its historical approved provenance. Existing internal group Founder has one tester without new invitations or root group changes. App Review was not submitted and the version is not published.

Next hardware steps: the user unlocks Mirroring locally, installs 1.7 (63) from the existing Founder TestFlight, then exercises actual six-language flows, consented speech fallback, Apple login, authorized paid/sandbox restore and APNs. TestFlight/group presence does not prove any completed installation or commercial lifecycle.
