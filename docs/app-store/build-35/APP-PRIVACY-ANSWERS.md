# Bobby 1.2 (35): App Privacy

Collect data: **Yes**. Tracking: **No**. All purposes below are **App Functionality** only.

| Data type | Linked | Reason |
|---|---|---|
| User ID | Yes | Optional Apple account and synced Bobby identity. |
| Product Interaction | Yes | XP, streak, companion, accepted notice, awards and island placement history. |
| Other Financial Info | Yes | Account-linked educational analysis snapshots used for seed reviews; no balances, payment information or wallet collection in iOS. |
| Other User Content | Yes | Island names/layouts; analysis questions, narrated reply text and moderation reports. Names belong to the account, so this overall type remains linked even though analysis/TTS/report requests do not send account identifiers. |
| Device ID | Yes, to the installation | Random installation UUID sent only with reports, retained as a hash for duplicate prevention. No IDFA, cross-app tracking or advertising use. |
| Gameplay Content | Yes | Account-linked island construction, inventory and saved progression. |
| Customer Support | Yes, to the installation | Abuse reports and optional details, deduplicated with the installation hash. |

No microphone/audio recordings, precise location, contacts, payment information, name or email are requested by the iPhone app. Speech output is generated from text, not recorded audio. Sign in with Apple requests no name/email scopes. Website-only flows remain separately disclosed.

Publish sends the proposed island name to OpenAI moderation; analysis questions go to OpenAI; dynamic narration text and voice options go to OpenAI or Microsoft. Bundled samples remain offline. Muting stops new TTS requests. The version-4 notice obtains permission before analysis and speech processing; the publish sheet explains moderation before the explicit publish action.

Reports contain the reported island code/name, selected reason and optional details. They enter the private operator queue; a random installation identifier is hashed without attaching a Bobby account token. Resolved reports are eligible for pruning after 90 days; open reports stay until reviewed. The operator runbook contains the cleanup command. Local blocks and mute preferences are not uploaded.

The manifest `ios/Bobby/Sources/PrivacyInfo.xcprivacy` declares the same seven types as linked, for App Functionality only. A persistent installation identifier remains device-linked even when hashed; absence of an account token is not a claim of anonymization. The actual App Store Connect questionnaire must be verified against this file before submission; this document does not assert that the online answers were saved.

Classification references: [Apple App Privacy Details](https://developer.apple.com/app-store/app-privacy-details/) and [manifest data types](https://developer.apple.com/documentation/bundleresources/app-privacy-configuration/nsprivacycollecteddatatypes/nsprivacycollecteddatatype).
