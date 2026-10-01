# Bobby 1.5 (45): App Privacy mapping

Prepared 30 September 2026 for the candidate at `.claude/worktrees/agent-aef7b10853bd2a391`. This is the release questionnaire mapping, not proof that App Store Connect answers were saved. Verify the archived PrivacyInfo.xcprivacy and the remote questionnaire separately before submission.

Collect data: **Yes**. Tracking: **No**. Purposes: **App Functionality**, unless an actually enabled feature changes the use below.

| App Store data type | Collected in the enabled native flows | Linked | Evidence and purpose |
| --- | --- | --- | --- |
| User ID | Yes | Yes | Apple/Supabase/Bobby account identifiers, session credentials and account-backed synchronization. |
| Product Interaction | Yes | Yes | Account-linked XP, streaks, selected companion, accepted notice version, awards, read counts and usage limits. |
| Other Financial Info | Yes | Yes | Educational analysis snapshots attached to synced awards, including asset, direction and price/levels. These are not brokerage balances or executed trades. |
| Other User Content | Yes | Yes | Question text and narrated reply text processed by external AI; island names/layouts and report details. A generic free-text field does not mean every possible personal-data category is solicited. |
| Device ID | Yes | Yes, to the installation | Persistent random install identifier in Keychain used for anonymous-read metering; separate random report-install UUID. Server retains hashes for quota/report deduplication. No IDFA, IDFV or advertising use. Keychain identifier can survive reinstallation. |
| Gameplay Content | Yes | Yes | Account-linked Trader Land construction, inventory and progression. |
| Customer Support | Yes | Yes, to the installation where provided | Private moderation reports with reason/details and retained reporter hash. The public support/privacy page offers a private form; a reply email there is optional and it runs in the external browser. |
| Email Address | When an existing authentication grant supplies an email | Yes | The backend persists the authentication service email when present, including prior Apple or website grants. App Functionality. |

## Do not infer collection from permission alone

- **Name:** the native Apple request uses fullName for a local greeting. AppleGivenName stores only the given name and Apple owner key in local UserDefaults; this value is not uploaded by the app. This local-only flow does not require a Name answer. Website authentication/memory can separately retain profile names and must remain described in the website policy.
- **Audio Data:** current recognition requiresOnDeviceRecognition and rejects unsupported recognizers. The microphone recording is neither uploaded nor stored. Only the derived question text leaves the phone. Audio Data stays undeclared for this enabled path; re-evaluate if streaming or server recognition is enabled.
- **Photos or Videos:** the app shares/exports its generated skin card through iOS and requests add-only Photos access. It does not upload the user's photo library. A system share destination is chosen by the user.
- **Email Address:** the native request omits Apple’s email scope, but api/_lib/user-identity.ts persists the authentication service email when present. A prior website/Apple grant may supply one. Declare Email Address as linked, App Functionality to cover grants that include an email. The field can be absent on a particular account; the declaration covers the enabled backend behavior.
- **Purchase History:** paid IAP and RevenueCat purchases are disabled for this build. No native transaction or purchase-history collection should be enabled. Promotional access expiry is an entitlement, not an Apple purchase. If paid Apple purchases are later enabled, declare linked Purchase History and reconcile RevenueCat's SDK data and retained subscription product/status/expiry before shipping. The app manifest omits Purchase History for this candidate: Release configuration has an empty SDK key, and BobbyStore refuses empty/unexpanded keys. Verify the final archived Info.plist and SDK privacy reports before submission; an override that enables paid purchases requires restoring Purchase History.

## AI recipients, consent and privacy choices

Quick uses OpenAI; Deep uses OpenAI and Anthropic; Max uses Anthropic. The AI analysis payload includes the question and market evidence. Native account/device credentials reach the backend for access checks, rather than the analysis provider payload. The website-only personalized memory path is preserved in the public policy and is disabled for the iOS platform.

Narration sends reply text, language, voice/style to OpenAI or Microsoft. Public island title moderation uses OpenAI, separately disclosed at publication. Build 45 bumps the consent wording version and offers withdrawal from Profile → Risk notice. Withdrawal stops future analysis and generated speech until renewed consent; it does not erase requests already processed by providers. Public support/private-data requests: https://bobbyprotocol.xyz/support?lang=en#contact; Spanish ?lang=es#contact. The Privacy Choices URL in App Store Connect is optional; the deployed private support form can be used here.

The app has no tracking/advertising identifiers or cross-app ad tracking. Bundled Núcleo pages use system fonts after removal of Google Fonts links/preconnects/CSP hosts. The website still loads Google Fonts and discloses its standard connection metadata separately.

## Retention to describe accurately

- Local profile/theses/blocks remain on this device until removed; deleting the app removes app-container preferences, while the quota identifier in Keychain can survive reinstall.
- Synced account progress/island records remain until deletion, subject to the limited security/legal records explained in the policy.
- Anonymous/account read-meter records older than 35 days are removed during later service cleanup calls; this is not an exact wall-clock automatic deletion guarantee.
- Private moderation reports remain open until reviewed. Resolved reports are eligible for operator deletion after 90 days; no automatic report-pruning job was established.
- General support messages have no automatic deletion deadline; deletion can be requested through the private form.
- AI/speech providers have their own retention terms; do not invent a specific zero-retention or training opt-out guarantee.

## Pre-submission evidence still required

1. Policy/support and backend fixes from local commit 52d28b3 were deployed and promoted to production deployment dpl_HQbRn8tQ1R85nKRvpF3Ca26WXE4y on 30 September. Spanish privacy/support were verified in the public browser; API access returned private,no-store. The support persistence acknowledgment is covered by mocked success/failure tests; no real user message was submitted. GitHub publication remains pending explicit authorization, so a later unmerged main deployment could overwrite these fixes.
2. Reconcile the eight enabled categories above with the remote label; verify the conditional authentication email behavior and whether any SDK collects additional data in the release archive.
3. Verify AI re-consent, withdrawal, denied permissions, Apple sign-in, deletion, and public report/block flows on the shipping release path. Source/model tests alone do not certify these interactions.
4. Assign a real moderation owner/backup and private queue routine. Neither the private support form nor these notes establishes response-time staffing or a completed real report-to-removal flow.
5. Confirm China mainland is actually deselected in saved App Store Connect Availability before submission.

References: [Apple App Privacy Details](https://developer.apple.com/app-store/app-privacy-details/), [Review Guidelines 5.1](https://developer.apple.com/app-store/review/guidelines/#privacy), [Review Guidelines 1.2](https://developer.apple.com/app-store/review/guidelines/#user-generated-content).
