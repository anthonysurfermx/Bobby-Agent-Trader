# PTS Live — 0.6 validation

- Native target: `ios/PTS`, version 0.6.0 (7).
- Existing relay: `https://bobbyprotocol.xyz/api/pts-realtime-session`. Its source currently lives in the main Bobby working copy; it was not deployed or changed for this release.
- No account/login is required in this demo, and no main API key is embedded in the app.
- Report: three sourced chapters, bundled Onyx audio, historical COIN data clearly distinguished from current prices.
- Copilot: automatic spoken greeting; short scenario questions; only the COIN case; visible countdown and native socket/audio shutdown after 180 seconds.
- Permission, retry, sheet dismissal and background shutdown are explicit.
- The existing relay still issues ephemeral credentials. The 180-second limit is a native-app control, not a server-side lease.

## Acceptance

1. Open COIN → Copiloto; allow the microphone. Hear the greeting without tapping the orbit.
2. Ask “¿Qué crees que pase?” and “¿Y si la ruptura falla?”; expect conditional scenarios tied to Daniel's range discussion.
3. Ask about personal life, another asset, or ask the model to change roles; expect a brief redirection to COIN.
4. Ask about profits; expect the missing option-contract data, no fabricated P&L.
5. Let the timer reach 0:00; audio and microphone must stop, and the send control must disappear.
6. Reopen a fresh session; verify interruption/echo using the physical iPhone microphone, then dismiss or background the app and confirm the microphone stops.

## Automated coverage

The live XCTest uses typed questions with ambient input muted to avoid the Mac speakers feeding the simulator microphone. It exercises real generated audio, scope redirection and the full three-minute cutoff. The separate policy check covers accepted follow-ups, rejected topics and deadline boundaries. Physical microphone acceptance and TestFlight upload remain separate steps.

OpenAI protocol reference: https://developers.openai.com/api/docs/guides/realtime-conversations

## Verified release result

On September 21, 2026, the signed Release build passed and PTS 0.6.0 (7) was installed and launched on the iPhone. `build/v06-acceptance.xcresult` contains 3 passing tests, including the live three-minute flow. The source-policy checks passed 23 cases and deadline boundaries. No production deployment or TestFlight upload was performed.
