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

## Build 29 (branch `ios/release-29`, from 28): the Squad sells the next unlock
Anthony's report (screens from live 1.1): some companions show "Could not load
the model" in the Squad, and locked ones read as black holes behind a lock.
- The load failure was 1.1's Draco GLBs (fixed in 27). New `SquadGalleryTests`
  loads all 18 on the Squad stage itself, not only on the desk fixture.
- Locked companions are an unpainted silver figurine: a Metal fragment pass
  (`MascotSceneView.statue`) lifts the texture's luminance into silver, shaded by
  facing and rim, so the whole character is on show and the colour is what
  discipline earns. The lock card no longer covers the face: a chip above the
  figure reads "LEVEL 3 · MARKET READER".
- Under the name, a locked companion shows the real distance to it: "60
  DISCIPLINE XP TO GO · 90/150" (same ladder as the evolution bar).
- Rail portraits of locked companions are silver and fully visible with a small
  lock badge, instead of a desaturated tile under a black veil. The rail opens
  scrolled to the selected portrait.
- A tinted dot sat on every companion's chest: the particle burst was drawn at
  rest. It is now visible only while it flies (never with Reduce Motion), and
  every pick replays it (only the first one did).
- Your own companion is never shown locked: sign-out resets XP to 0 but keeps
  it, and it now stays in colour in the Squad instead of turning grey.
- DEBUG: `-qa-squad -qa-select <id> -companion.disciplineXP <n>` opens the
  Squad without a backend.
- Review: 4 lenses (SceneKit, SwiftUI, UX, tests) + one refuter per finding,
  20 agents; 3 confirmed (Reduce Motion dot, simulator-state leak into the
  test, active companion shown locked), all fixed; 10 refuted.
- Tests: unit 4/4, CompanionLoadTests 18/18, SquadGalleryTests 4/4 (18/18
  companions on the Squad stage); Release configuration compiles.

## Before App Review (not done here)
- Sign in with Apple token revocation on account deletion is missing
  (api/account.ts deletes the Supabase user but never calls Apple's
  /auth/revoke). Apple asks for it; plan it before submitting 1.2.
- App Store Connect privacy label: remove User Content → Audio Data.
- Re-capture the store screenshots: the 1.1 set shows the Live toggle and mic.
- Desk voice still uses the free Edge voice for every companion (`free: true`)
  pending Anthony's call on the per-companion OpenAI voice cost.
