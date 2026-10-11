# Data safety — Bobby Android 1.2.0 (10)

Audited 2026-10-11. Scope: FCM-off release with no Google RevenueCat key. Source inventory: [privacy-android-facts.md](privacy-android-facts.md). Complete the form for the whole service, including server processors, rather than only the bundled page. This is a submission worksheet, not a claim that Google has approved it.

## Top-level answers

| Console question | Answer / condition |
|---|---|
| Does the app collect user data? | **Yes.** Questions, installation identifier and service requests leave the device. Collection includes failed or ephemeral requests; the current rejected Android progress POST does not make its submitted contents device-only. |
| Encrypted in transit? | **Yes for app-controlled transport.** HTTPS-only endpoints, no cleartext, no cross-host redirects. Server-to-processor transport must be confirmed by the service owner. |
| Account creation | **OAuth** (Google via Supabase Auth). Guest use is also available. No in-app password account creation. |
| Request account deletion | **Yes, in the app:** Profile → Delete account → confirmation. Outside-app deletion URL: `https://bobbyprotocol.xyz/support?platform=android#contact`, **pending Claude's explicit deletion instructions/functional public form verification**. Do not submit it as verified until that page is live. |
| Request deletion without deleting the account | **Yes, some data:** Memory offers forget-one and erase-account-memory, and locally stored notes can be erased separately. Do not claim a universal server-data deletion form. |

## Types to declare

Select each type below that the final production service actually receives. “Optional” means the person can avoid the feature, not that a later mandatory field is optional within it. Required app identifiers/access checks apply to guest use after consent.

| Play type | Collected | Required/optional | Purpose and evidence |
|---|---|---|---|
| Personal info → User IDs | Yes | Optional account; required for signed-in features | Supabase account UUID/auth state; account management, access, optional account memory and server analytics (`api/_lib/access.ts:125`). `data/BobbyRepository.kt:93`, `:325`, `:562`. |
| Personal info → Name / Email address | Yes in account service | Optional account | Google/Supabase sign-in identity; display name on Profile and identity used for support/deletion. Native does not append email to AI reports. `data/BobbyRepository.kt:344`; `api/account.ts`. Owner confirms the server's actual identity fields. |
| Device or other IDs | Yes | Required for guest allowances/service protection | Random installation UUID in `x-bobby-device` and salted server install/network hashes: app functionality, security and server analytics (`api/_lib/access.ts:105`), not Android advertising ID. `data/BobbyRepository.kt:43`, `:93`; island reports explicitly include installation id, `ui/TraderLandSheet.kt:580`. |
| App activity → Other user-generated content | Yes | Optional requests/features | Question text, thesis text when explicitly reviewed, optional memory preferences, named island/layout when saved/published, report details and support messages. `BobbyRepository.kt:130`, `:282`; `TraderLandSheet.kt:266`, `:565`, `:580`; `ui/ReportContentPolicy.kt:16`. |
| App activity → In-app search history | Yes | Optional search/read | Asset search query and requested symbol/timeframe. `BobbyRepository.kt:182`, `:211`; `nucleo/NucleoSession.kt:335`. |
| App activity → App interactions | Yes | Feature-dependent; service access required | Access/use allowances, referral claims, attempted progress/XP/saved-read sync, briefing preferences and server-recorded read outcomes (`api/_lib/access.ts:125`). Purposes: app functionality, account management, security and analytics. Local-only harness taps are not independently uploaded as analytics. `BobbyRepository.kt:245`, `:263`, `:291`; `nucleo/NucleoSession.kt:555`. |
| Approximate location | No in audited Android funnel; owner verifies infrastructure logs before final No | Service-dependent | No GPS/location permission. Locale/country are interface/system region. Access/outcome geo applies only to web (`api/_lib/access.ts:112`, `:128`), excluding Android. Hosting sees IP; any other retained/used IP-derived location must still be declared. |

No microphone audio collection: only explicit on-device recognition, no remote fallback. Its resulting question text is declared as user-generated content. Narration sends answer text/voice/locale to the voice API and receives generated audio; it does not upload a user's voice. `platform/AndroidVoice.kt:77`, `:114`, `:180`; `BobbyRepository.kt:309`.

Do not select financial payment information, purchase history, audio recordings, contacts, photos/video, files/documents, health, precise location, advertising ID or crash diagnostics solely because a library exists. This supplied configuration cannot purchase or initialize RevenueCat and excludes Firebase. If server processing actually records another listed data type, update the form. Account tier received from the server is still account information. Free-text prompts can contain unsolicited sensitive information; the app asks people not to include it.

## Sharing and ephemeral processing

AI, speech synthesis, hosting/database, optional support email and optional server-to-Amplitude analytics are server-mediated. Amplitude receives salted install id/account UUID and access/read outcome metadata if configured (`api/_lib/amplitude.ts:25`, `:47`), not raw questions/email/IP. Confirm whether that integration is enabled; the absence of an Android SDK does not disable server analytics. The Android code proves external processing but cannot prove each processor's contractual role or retention. Owner must list current processors and determine the service-provider exception from their actual agreements. Select **not shared** for processor-only transfers only after confirming that exception; do not assert no sharing from the absence of an SDK.

Publishing an island deliberately exposes its title/layout and share code to other people; sharing an avatar/invite uses an explicit system share action. Evaluate Google's user-initiated transfer exception separately. Unpublished content and reports are not silently posted publicly. `TraderLandSheet.kt:553-567`, `:580`; `MainActivity.kt:416`.

Do not mark all collection ephemeral: account, memory and support records are persisted server-side. For a particular question or narration, only mark ephemeral if the owner verifies every relevant server/provider retention path. Private local preferences and the local follow-up ledger are not collection while they stay on the phone.

## Deletion and permissions

Successful deletion removes the server identity/cascading account records and retires owner-scoped local state. Public blockchain records and limited security/audit retention are exceptions; Android creates no chain transactions. Sign-out retains isolated local account theses/history; deletion on a different phone cannot guarantee erasure on this phone. Detailed limits and sources are in the facts file.

Declared app permissions: Internet for service calls; microphone for explicit optional local dictation; notifications for opted-in local reminders; vibration for local notices. Denial retains typing and in-app use. WorkManager/Billing may add non-runtime scheduling/network/billing declarations to the merged manifest; inspect the supplied artifact, not only the source manifest. No exact alarms, GPS, contacts or storage permission is requested.

Official worksheet guidance: [Google Data safety](https://support.google.com/googleplay/android-developer/answer/10787469) and [account deletion](https://support.google.com/googleplay/android-developer/answer/13327111). Owner-owned unresolved facts are visible above; Android source facts are separately documented.
