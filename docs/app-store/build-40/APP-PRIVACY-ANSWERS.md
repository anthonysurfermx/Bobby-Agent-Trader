# Bobby 1.5 (40): App Privacy

Collect data: **Yes**. Tracking: **No**. All purposes are **App Functionality** only.

The data types are the same seven as 1.2 (35) (`docs/app-store/build-35/APP-PRIVACY-ANSWERS.md`), and `ios/Bobby/Sources/PrivacyInfo.xcprivacy` is unchanged:

| Data type | Linked | Reason |
|---|---|---|
| User ID | Yes | Optional Apple account and synced Bobby identity. |
| Product Interaction | Yes | XP, streak, companion, accepted notice, awards and island placement history. |
| Other Financial Info | Yes | Account-linked educational analysis snapshots (the thesis attached to a saved award); no balances, payment information or wallets. |
| Other User Content | Yes | Island names/layouts; analysis questions (typed, or spoken and transcribed on the device), narrated reply text and moderation reports. |
| Device ID | Yes, to the installation | Random installation UUID sent only with reports, retained as a hash. No IDFA or advertising use. |
| Gameplay Content | Yes | Account-linked island construction, inventory and saved progression. |
| Customer Support | Yes, to the installation | Abuse reports and optional details. |

## What changed in 1.5

- **Microphone and speech recognition are now requested.** The 1.2 note "no microphone/audio recordings are requested" no longer holds, and the Info.plist strings say so.
- **Audio Data stays undeclared.** The microphone is live only while the user holds the button (60 s cap). Recognition is on-device only (`requiresOnDeviceRecognition = true`). If the device language cannot be recognized on device, the microphone is not offered. No audio is recorded, stored or sent. Apple counts data as collected only when it leaves the device. Only the resulting text leaves the device, as the question, exactly like a typed one (Other User Content, already declared).
- **Saved theses are local.** The Núcleo's thesis ledger lives in UserDefaults on the device. A thesis reaches the server only inside a saved XP award, which is the already-declared Other Financial Info and Product Interaction.
- **Pages make no data requests.** The bundled pages have `connect-src 'none'`: every data request is made natively, to the endpoints 1.2 already used. The only other requests the page makes are for Google Fonts CSS and font files (fonts.googleapis.com, fonts.gstatic.com; ARCHITECTURE.md R15). Those carry standard HTTP metadata only, no app data or identifiers. Bundling the fonts (pending Anthony's OK) would remove them.

## Before submission

- Verify the App Store Connect questionnaire against this file. This document does not say that the online answers were saved.
- Apple's speech prompt uses its standard wording ("…may be sent to Apple"). The review notes (`metadata/review-notes.txt`) explain that Bobby forces on-device recognition.

References: [Apple App Privacy Details](https://developer.apple.com/app-store/app-privacy-details/).
