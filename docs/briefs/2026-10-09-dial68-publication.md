# Speaking dial, build 68 review candidate

Stacked on the build-67 UX PR. This incremental diff adds the first-run orb-centered Sencillo / Con términos / Técnico dial, persisted per local owner, optional speech on desk/thesis requests, editing through Memory and one third-read refinement. New users may skip and keep plain wording. Existing completed-onboarding installs are not forced through the dial. Guest preference inheritance and account boundaries are explicit. The candidate also mirrors the read controls onto Android and uses the platform-specific mic/visual behavior.

Server support already exists in production #169/#170; no server edits are required here. Original candidate evidence: 284 iOS-page tests, 165 Android-page tests, four native dial-store tests, two ES/EN real WebKit/native-bridge UI tests, and iOS simulator build. These use muted voice/recorded responses, not real model or physical voice evidence. Publication build and full page suites are rerun separately. Native Android compilation/device/TalkBack and iOS physical-device voice/VoiceOver remain unverified. Build 68 has not been uploaded to TestFlight or Google Play.

No production deployment, migration or notification activation is part of this PR. The branch is based on current production main plus build-67 UX rather than the old server PR169 snapshot. A Windows wrapper line-ending-only change was intentionally excluded.

Publication result: production build passed on Node 24.19.0; full iOS page suite 284/284 and Android page suite 165/165 passed. These are JavaScript checks, not native Android runtime evidence.
