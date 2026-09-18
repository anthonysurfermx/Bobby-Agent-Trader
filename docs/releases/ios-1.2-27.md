# iOS 1.2 (27): type-only desk, X-ray aura forge, working skin share

Uploaded to App Store Connect on 2026-09-18 for TestFlight (1.1 is live and its
train is closed, so this ships as 1.2). Branch `ios/release-27`.

## What changed since 1.1 (26)
- The 8 wave 2 companions load in 3D (Draco removed). A UI test now loads all
  18 GLBs on the desk stage and the preview.
- Onboarding: swipeable "Pick your friend", silent step 1, voice in step 2, and
  step 3 is the aura forge — a 360° turntable with an X-ray scan, no cards,
  no copy, no hum.
- Desk: type only. Bobby Live (OpenAI Realtime/WebRTC), dictation and the mic
  are gone, with the camera, microphone and speech usage strings and the audio
  entry in the privacy manifest. The companion answers aloud. One title (the
  companion's name), status LIVE, no transcript, no desk log, no proof card,
  no suggested placeholder.
- Menu: Trader Land, streak, Share my skin, account, risk notice, privacy;
  Sign out and Delete account when signed in.
- Share my skin works: preview sheet with Instagram (9:16), WhatsApp and X
  (4:5 + caption), through the system share sheet. Save Image declares the
  photo-add permission.
- One language per device across the app.

## Validation
- Debug simulator build and unit tests passed; CompanionLoadTests: 18/18.
- Release archive with automatic signing; Info.plist 1.2 (27); frameworks:
  GLTFKit2 only; 18 GLBs and 48 vibe clips bundled.

## Build 28 (same day, supersedes 27 for testing)
Fixes from a second review: account awards survive sign-out/sign-in, offline
refresh no longer signs out, in-flight sync cannot restore a deleted account's
XP, Delete account runs once and confirms, EXPLORE returns under the verdict,
share never replays an old request, evolution line waits for the answer.
Tests: unit 4/4, CompanionLoadTests 18/18, StoreShots test04_ShareSkin.

## Before App Review (not done here)
- Sign in with Apple token revocation on account deletion is missing
  (api/account.ts deletes the Supabase user but never calls Apple's
  /auth/revoke). Apple asks for it; plan it before submitting 1.2.
- App Store Connect privacy label: remove User Content → Audio Data.
- Re-capture the store screenshots: the 1.1 set shows the Live toggle and mic.
- Desk voice still uses the free Edge voice for every companion (`free: true`)
  pending Anthony's call on the per-companion OpenAI voice cost.
