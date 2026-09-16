# Bobby iOS 1.1 (24) — first post-launch submission

**Status 2026-09-16:** 1.0 is live on the App Store since 2026-09-15
(https://apps.apple.com/app/bobby-the-market-argues-back/id6804460489). That listing is an
old binary. Builds 21–23 (native Realtime voice) went to TestFlight under 1.0, so the next
review needs a new marketing version: **1.1, build 24**, from branch `ios/release-24`
(= `codex/mobile-realtime` + version bump). Source lineage: external TestFlight 19 (wave 2
companions, X sign-in, Trader Land place/move/remove, Base stock swaps) + realtime voice 21–23.

Pre-flight on this Mac (2026-09-16): `xcodegen generate` OK, Debug simulator build on
iPhone 17 Pro OK (deprecation warnings only). Unit tests and Release archive: see the
session report. Upload to App Store Connect is Anthony's step
(`xcodebuild -exportArchive -exportOptionsPlist ExportOptions-TestFlight.plist`).

## App Store Connect checklist for 1.1
- Create version 1.1 for App Apple ID 6804460489, attach build 24 once processed.
- App Privacy: builds ≥21 stream microphone audio to OpenAI Realtime; keep
  **User Content → Audio Data** declared (see `docs/app-store/app-privacy-answers.md`).
- What's New (draft): "Bobby Live: talk to your companion in real time (3 free minutes a
  day, shared with the web). Eight new companions. Continue with X. Base stock swaps with
  Buy and Sell."
- Physical-device microphone / Bluetooth / interruption test is still open (never done on
  a real iPhone for 21–23).

## Web → iOS gap at this build (what 1.1 still lacks vs. bobbyprotocol.xyz)

| Feature | Web (main) | iOS 1.1 (24) |
|---|---|---|
| Live Desk 3-agent run, XP, gear, pets, squad, share card | yes | yes |
| Companion roster: 18 (wave 2), 10 starters | yes | yes (identical data) |
| Realtime voice "Bobby Live", 3-min shared allowance, free fallback | yes | yes (builds 21–23) |
| Apple sign-in / account deletion | yes / no | yes / yes |
| Google sign-in | yes | **missing** |
| Continue with X | no | yes |
| Base swaps Buy/Sell | yes | partial: stocks only |
| Swap universe | ETH, cbBTC, AERO + 8 stocks | **4 stocks** (AAPLc, GOOGLc, METAc, NVDAc); TSLAc/MSTRc/SPCXc/MSFTc missing |
| Wallet balance pill, Max, insufficient-funds guard | yes | **missing** (address only) |
| Live debounced quote preview | yes | on-demand quote only |
| Trader Land place/move/remove | yes | yes |
| Trader Land thesis close, Season I on-chain, execution bonus, world share codes / directory | yes | **missing** |
| Thesis snapshot attached to awards | yes | **missing** |
| Track record page (`/record`, `/api/bobby-pnl`) | yes | **missing** |
| In-app EN/ES toggle (English default) | yes | device locale only |
| Country block-list for stocks (#53) | yes | older country gate |
| Protocol / forum / analytics / B2B pages | yes | web-only by design |

Web commits after the iOS fork point that iOS does not mirror: #80 (agents + swaps in
/desk), #81, #82 (balance pill + SELL), #73 (EN default + switch), Trader Land thesis
close + Season I (0091cc2), #52/#53 (second-wave stocks + block-list), 1c176c7 (desk
walkthrough), #83 (protocol claims Base-only).

Suggested order for 1.2: (1) wallet balance pill + Max, (2) second-wave stocks + block-list,
(3) Google sign-in, (4) EN/ES toggle, (5) Trader Land thesis close + Season I, (6) track record.
