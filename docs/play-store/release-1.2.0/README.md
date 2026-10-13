# Bobby Android 1.2.0 (10) — Play release dossier

Package: **xyz.bobbyprotocol.bobby**. Target SDK: **36**, minimum SDK: **26**. This candidate disables Firebase messaging and Google purchases; it includes educational reads and the native six-language interface. Claude signs the CI-produced unsigned AAB/APK. No Google publication or real-phone acceptance is implied by this dossier.

## Evidence and review

- [Release evidence](release-evidence.md): exact CI jobs, unsigned artifact verification and remaining device/service checks.
- [Screenshot review](screenshots-review.md): every native capture, locale, resolution and review result; captures live in the external handoff folder.
- [Policy audit](policy-audit.md): code changes and owner responsibilities.
- [Android privacy facts](privacy-android-facts.md): source references for the public privacy paragraph.

## Console material

| Language | Listing | Release notes |
|---|---|---|
| English | [listing.en.md](listing.en.md) | [release-notes.en.txt](release-notes.en.txt) |
| Spanish | [listing.es.md](listing.es.md) | [release-notes.es.txt](release-notes.es.txt) |
| French | [listing.fr.md](listing.fr.md) | [release-notes.fr.txt](release-notes.fr.txt) |
| Portuguese, Brazil | [listing.pt.md](listing.pt.md) | [release-notes.pt.txt](release-notes.pt.txt) |
| Italian | [listing.it.md](listing.it.md) | [release-notes.it.txt](release-notes.it.txt) |
| German | [listing.de.md](listing.de.md) | [release-notes.de.txt](release-notes.de.txt) |

Character counts are in [metadata-lengths.json](metadata-lengths.json). The exact Console labels may vary with Console language; the worksheet values are explicit.

[Data safety](data-safety.md) · [Content rating](content-rating.md) · [Financial features](financial-features.md) · [App access](app-access.md) · [Ads](ads.md).

## Owner and testers

Start with [OWNER-STEPS.es.md](OWNER-STEPS.es.md): internal testing first, then closed testing submitted for review. Send [TESTERS.es.md](TESTERS.es.md) with Console's actual opt-in link. Google decides availability; only qualifying closed participation counts toward twelve continuous testers for fourteen days.

Use [app-icon-512.png](app-icon-512.png) and the existing [feature graphic](feature-graphic-1024x500.png). Neither is a mock of the app. Review screenshot selections in the capture worksheet before uploading.

Server profile sync remains a separate dependency: draft PR #186 and its owner-approved additive migration. The Android client does not bypass the current POST `/api/progress` rejection. Publication also depends on live privacy/support/deletion pages and owner-confirmed service processor/retention facts.
