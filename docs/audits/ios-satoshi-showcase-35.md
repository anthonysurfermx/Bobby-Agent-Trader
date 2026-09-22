# Permanent Satoshi Nakamoto island — Bobby iOS 1.2 (35)

Date: 2026-09-22. Follows the [Trader Land restoration](ios-traderland-restoration-2026-09-22.md).

## Behavior

The original Quiet Reef construction is now bundled as **Satoshi Nakamoto**, a permanent read-only Bobby showcase. Its 10 placements and awake core retain the original arrangement. It is available to signed-in and anonymous visitors in both English and Spanish, including when the community gallery is empty, loading or offline.

The showcase is the first neighboring island. The app merges up to 23 community islands after it, excluding the viewer's own island and duplicate showcase entries. Visiting and returning home do not change the viewer's placements, inventory or saved progress. The bundled construction is independent of practice saves and account data.

The card identifies it as “Bobby showcase island” / “Isla de muestra de Bobby”; it has no fabricated publication date. Its reserved code cannot collide with server-generated share codes. No production account, island record or publication was created. The other developer fixture islands remain restricted to their existing Debug test path.

## Verification

- **23 native tests passed, zero failures** on the dedicated iPhone 17 Pro / iOS 26.1 simulator: 16 unit tests and seven UI flows.
- Unit coverage checks the construction's bounds and non-overlapping footprints, the awake core, empty/offline gallery responses, deduplication, capacity, and preservation of real community islands.
- English and Spanish UI flows visit the showcase through the ordinary app path without the neighboring-island fixture flag. They confirm the visible name and showcase label, read-only visits, and unchanged personal progress after returning home.
- Existing English/Spanish practice exploration and account naming, publishing, sharing and privacy flows also pass. Account mutations use the existing test fixture; no account changes were made in production.
- The named English and Spanish screenshots were visually inspected. Both show the completed construction, its name, and navigation back to the user's island.
- The native voice boundary check and `git diff --check` pass. This change preserves the prior avatar narration, remembered mute, machine audio and three-step onboarding.

- Release archive and strict code-signature verification pass. All 108 bundled avatar MP3 hashes match the audited catalog. The compiled Release binary contains the permanent showcase and its reserved identifier.
- Executable SHA-256: `83e6c6f84ea9d6486191b2caa2807b8bb33fe26b4ac161b0aac8b04af4175b0d`.

## Artifacts and distribution

Combined candidate: `output/satoshi-island-35/Bobby-1.2-35.xcarchive`. Its folder also contains the native test result, test log and summary, archive verification, and named screenshots in `screenshots/`.

The candidate remains **1.2 (35)** and includes the voice and Trader Land fixes from the earlier revisions. This is a local candidate; making the permanent island available to installed apps requires distributing this update. No physical-device installation, push, TestFlight upload or App Store deployment was performed.
