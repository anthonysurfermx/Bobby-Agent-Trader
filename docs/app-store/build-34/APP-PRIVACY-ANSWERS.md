# App Store Connect App Privacy answers for Bobby 1.2 (build 34)

These answers come from the data flows in the build-34 source (branch base `95c520a`), not from earlier declarations. The file `docs/app-store/appeal-4.3a/privacy-declaration-evidence.md` concluded "Data Not Collected". That is obsolete now that accounts, synced progress and AI questions exist. The public policy is `src/pages/PrivacyPage.tsx` (https://bobbyprotocol.xyz/privacy); keep both documents in step.

Scope: App Store Connect asks about **this app only**. Website-only features (wallets and wallet accounts, Base swaps, live voice, Google sign-in, the website's Apple sign-in with name and email, public islands, the email early-access list) are not collected by the iPhone app and do not belong in these answers. They are covered in the privacy policy.

## Answers to enter

**Do you or your third-party partners collect data from this app?** Yes.

| App Store Connect data type | Collected | Linked to the user | Used for tracking | Purposes |
|---|---|---|---|---|
| Identifiers → **User ID** | Yes | Yes | No | App Functionality |
| Usage Data → **Product Interaction** | Yes | Yes | No | App Functionality |
| Financial Info → **Other Financial Info** | Yes | Yes | No | App Functionality |
| User Content → **Other User Content** | Yes | Yes | No | App Functionality |

Nothing else. The label should end up showing **Data Linked to You**: User ID, Product Interaction, Other Financial Info and Other User Content. There is no **Data Used to Track You** section and no **Data Not Linked to You** section.

For every type, leave Analytics, Developer's Advertising or Marketing, Third-Party Advertising, Product Personalization and Other Purposes unchecked. Nothing is used for analytics, advertising or personalization beyond running the feature itself.

## Reasoning per data type

### User ID (linked, App Functionality)

- **What:** Bobby's internal identity ID (`bobby_identities.id`), the Supabase Auth user ID, and the stable Apple user identifier (`sub`) that the authentication provider stores for Sign in with Apple.
- **When:** only after the user chooses Sign in with Apple (`ios/Bobby/Sources/AccountSheet.swift`). Without an account, no identifier leaves the device.
- **Why linked:** it *is* the account identity. It keys synced progress and Trader Land, and it is what `/api/account` deletes.
- **Not tracking:** the app contains no IDFA, IDFV, ATT, attribution or advertising SDKs, and `NSPrivacyTracking` is `false`.
- **No name or email:** the app sets `request.requestedScopes = []` (`AccountSession.swift`, `prepareAppleRequest`, and the same in `AppleDeletionAuthorization.swift`). An Apple identity created by the app holds no email and no name. X sign-in is not offered in 1.2, and Google sign-in is website-only, so **Name** and **Email Address** are not collected by this app.
- **Web Apple sign-in:** the website's "Continue with Apple" asks Apple for `scope=email name` (Supabase authorize redirect with `client_id=xyz.bobbyprotocol.web`). Apple's `sub` is shared across the team's apps, so an Apple ID that also signs in on bobbyprotocol.xyz ends up with a name and an email address (real or private relay) on the same account the app uses. That data is collected by the website, not by this app: the app never requests it, sends it or reads it back. The answer therefore stays **not collected** for Name and Email Address. The privacy policy discloses the website flow under "Website only".

### Product Interaction (linked, App Functionality)

- **What:** the progress events the app syncs to `/api/progress` (`ProgressSync.swift:231-247`):
  - award events (`read_complete`, `no_trade_respected`, `thesis_closed`) with their ID, timestamp, time-zone offset and platform;
  - XP, streak, aura and gear state;
  - the selected companion, the onboarding flag and the accepted risk-notice version.
- **Also:** Trader Land actions sent to `/api/trader-land` with the account token (`TraderLandSync.swift:253-270`, `:386`): place, move, remove, extend, close and move-core. These produce the stored island layout.
- **Why linked:** everything is stored against the account identity so it survives reinstalls and follows the user to bobbyprotocol.xyz.
- **Why only App Functionality, not Analytics:** these records drive XP, streaks and the island. They are not used to measure or analyse behaviour.
- **Island layout:** declared here, together with the island name under Other User Content. Gameplay Content would be an equally valid label, but declaring it would add a fifth type that the manifest does not list. Pick one mapping, and keep App Store Connect and `PrivacyInfo.xcprivacy` identical.

### Other Financial Info (linked, App Functionality)

- **What:** the snapshot of each read that plants a Trader Land seed (`AwardThesis`, `ProgressSync.swift:20-44`), synced with the award. It holds the asset symbol, whether it is a stock or a crypto asset, and the direction of Bobby's analysis (long, short or none). It also holds the price, entry, stop and target levels from the analysis, plus the review outcome the server records when the seed is closed.
- **Why declared:** these values describe markets rather than the user's own finances. They are still declared, conservatively, because a history of assets and directions linked to an account reveals investment interest. The build-33 review judged this a harmless over-declaration.
- **Why linked:** the snapshots are stored per account.
- **Not collected by the app:** wallet addresses, balances, swap amounts and transaction data. The app has no wallet and no trading. Those records exist only on the website. **Payment Info** and **Credit Info** are also not collected, because the app has no in-app purchases or payments.

### Other User Content (linked, App Functionality)

There are two flows. App Store Connect asks the "linked?" question once per data type, so any linked flow makes the whole type **linked**.

1. **Typed questions: not linked in practice.**
   - After the user acknowledges the first-launch notice, the question, asset symbol, asset type and language are POSTed to `/api/desk-debate` (`BobbyAPI.swift:453`).
   - `BobbyAPI.json` (`:345`) attaches no `Authorization` header, so the request carries no account identity.
   - The backend sends the question plus public market evidence to OpenAI (`api/_lib/desk-debate.ts`), and never logs or stores the question (`api/desk-debate.ts`).
   - OpenAI may keep API requests for a limited time under its own terms, for example for abuse monitoring. That makes this collection by a third-party partner, so it must be declared.
   - The question is also POSTed to `/api/bobby-asset-search` to identify the asset. It is not stored there either.
2. **Private island name: linked.**
   - Signed-in users can set a name in "Island settings" (`TraderLandGateHarness.swift`, Release branch of `shareSheet`).
   - It is sent with the account token as `{action: 'rename_private', title}` and stored in `tl_lands.title` against `identity_id` (`api/trader-land.ts:160-164`).

**Result:** Other User Content is Linked, App Functionality, not tracking.

## Types considered and not declared

| Type | Why not |
|---|---|
| Name, Email Address, Phone, Physical Address, Other Contact Info | The app's Sign in with Apple requests no scopes. The website's Apple sign-in does request name and email, but that is website collection (see User ID). X is hidden in 1.2. Google sign-in is web-only. There is no contact form in the app. |
| Coarse / Precise Location | No Core Location. The time-zone offset only computes streak day boundaries; it is not location data and is not derived from location services. Country inference exists only for web swaps. |
| Device ID | No IDFA or IDFV. The desk's rate limit keys on salted SHA-256 prefixes computed server-side (`api/_lib/rate-limit.ts` getClientQuotaKeys): one of the caller (an IPv4 address, or the IPv6 /64) and one of its network (the IPv4 /24 or IPv6 /48). No address reaches the database. They are used only for abuse prevention, are not linked to the account, expire after 24 h and are swept by every later desk request once a day past expiry (migration `20260919200000_desk_quota_networks.sql`). IP addresses are not an App Store data type. This is a judgment call; revisit it if the hash is ever joined to an account. |
| Audio Data | Build 34 has no microphone or speech usage strings and no recording or speech-recognition code paths. Voice existed only up to 1.1 and on the website. |
| Photos or Videos | The app only *adds* a companion image to the library (`NSPhotoLibraryAddUsageDescription`). It never reads or uploads photos. |
| Gameplay Content | See Product Interaction. It is covered by Product Interaction plus Other User Content. |
| Search History | Asset searches are processed in real time and not stored. The local watchlist of asked assets never leaves the device (`DeskMemory.swift`). |
| Browsing History, Contacts, Emails or Text Messages, Customer Support, Health, Fitness, Sensitive Info, Purchases, Advertising Data, Other Usage Data, Other Data Types | Not handled by the app. |
| Crash Data, Performance Data, Other Diagnostic Data | No crash or analytics SDK. Server request and error logs are short-lived operational logs from hosting and authentication providers, not data the app collects for diagnostics. |

## Tracking

**Does this app track users?** No. There is no data linking with third-party data for advertising and no data brokers. `NSPrivacyTracking` is `false`, `NSPrivacyTrackingDomains` is empty, and there is no ATT prompt.

## Consistency gates before submitting

1. **Manifest:** `ios/Bobby/Sources/PrivacyInfo.xcprivacy` in build 34 must declare `NSPrivacyCollectedDataTypeOtherUserContent` with `Linked = true`. Build 33 had `false`. It must also declare User ID, Product Interaction and Other Financial Info as linked, all with App Functionality purpose and tracking false. This file is owned by the iOS build-34 change, so verify the archived binary's copy.
2. **X sign-in:** if any build still shows "Continue with X", these answers are wrong. They would then need **Name** (linked), plus **Email Address** if X returns it. The policy would also need an X section.
3. **Asset-search GET fallback:** build 33's `BobbyAPI.assetSearch` retried as a GET with the raw question in the URL. The build-34 iOS change makes it POST-only. Confirm that in the archived binary's source; it does not change these answers either way.
4. **Policy:** the deployed https://bobbyprotocol.xyz/privacy must show "Effective September 19, 2026" before these answers are published.
