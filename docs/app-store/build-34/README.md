# App Store metadata for Bobby 1.2 (build 34)

This folder replaces the build-33 handoff metadata. The changes follow the independent review of build 33 (PR #97, head `95c520a`, lens `appstore-privacy`).

## What goes where in App Store Connect

| File | App Store Connect field |
|---|---|
| `metadata/<locale>/name.txt` | Name |
| `metadata/<locale>/subtitle.txt` | Subtitle |
| `metadata/<locale>/promotional-text.txt` | Promotional Text |
| `metadata/<locale>/description.txt` | Description |
| `metadata/<locale>/keywords.txt` | Keywords |
| `metadata/<locale>/whats-new.txt` | What's New in This Version |
| `metadata/app-review-notes-en.txt` | App Review Information → Notes. Leave the sign-in fields empty: no credentials are needed. |
| `APP-PRIVACY-ANSWERS.md` | App Privacy questionnaire |
| `metadata-validation.json` | Length and keyword checks, produced by a script. Every field passes. |
| `check-review-examples.mts` | Checks that the example questions in review-notes step 3 resolve to the right asset with no confirmation prompt. |

Locales are `en-US` and `es-MX`. Paste the plain text only, with no Markdown.

## URLs

- **Privacy Policy URL:** use `https://bobbyprotocol.xyz/privacy` for en-US and `https://bobbyprotocol.xyz/privacy?lang=es` for es-MX. The `?lang=` switch and the September 19, 2026 text only work once this branch is deployed.
- **Support URL:** `https://bobbyprotocol.xyz`, the same as in earlier submissions. The site has no support email or contact form. The policy's only privacy contact is a GitHub issue, because no monitored Bobby inbox exists in the repo. `hello@bobbyprotocol.xyz` appears only as a proposed sender address, with no confirmed inbox. The owner should add a real, monitored contact before or soon after submission.
- **Marketing URL:** leave it **empty** for 1.2. The `/app` copy now says voice is web-only. But its phone screenshots come from earlier builds: a microphone button, "SPEAKING", "Voice or text", "Tap to hear it" and "Capital protected". Add the URL back after those images are replaced with build-34 captures.

## Gates before saving this metadata

1. `/api/desk-debate` is live in production (a GET returns 405, not 404), and migrations `20260919183000_atomic_progress.sql`, `20260919190000_desk_quota.sql` and `20260919200000_desk_quota_networks.sql` are applied, in that order (the API sends `p_network`, which only the two-argument quota function from 200000 accepts). Every field describes the three-perspective analysis.
2. The build-34 binary hides "Continue with X". The review notes and the privacy answers assume Sign in with Apple only.
3. The build-34 `PrivacyInfo.xcprivacy` declares Other User Content as **linked** (see `APP-PRIVACY-ANSWERS.md`).
4. The labels quoted in the review notes still match the build-34 UI: "Save progress", "Progress saved · account", "Delete account", "Delete account and synced progress", "Delete account permanently", "Account deleted", "Open Apple's steps", "NO TRADE", "Island settings" and "Trader Land". The manual Apple steps in note 9 must match `AccountSession.manualRevocationSteps`. Re-check after the build-34 iOS change is committed, and update the notes if it renames any label.
5. The deployed `/privacy` shows "Effective September 19, 2026".
6. **Apple token revocation is configured in production.** Vercel Production has all four of `APPLE_SIGN_IN_TEAM_ID`, `APPLE_SIGN_IN_KEY_ID`, `APPLE_SIGN_IN_CLIENT_ID` (= the app's bundle ID, `xyz.bobbyprotocol.bobby`) and `APPLE_SIGN_IN_PRIVATE_KEY` (a key enabled for Sign in with Apple). Without them, `GET /api/account` never asks for Apple's sheet (`appleRevocationReady()` is false), so note 8 would not happen. Prove it on a real device with a test Apple account: deletion shows Apple's re-authorization sheet, the DELETE returns `appleRevocation: "revoked"`, and Bobby disappears from Settings > your name > Sign in with Apple. `docs/audits/ios-remediation-33.md` still lists the key as pending.
   If this gate cannot be met before submission, replace notes 8 and 9 with the text below. The account is still deleted, but Apple's rule 5.1.1(v) expects apps with Sign in with Apple to revoke tokens through Apple's REST API, so expect a rejection risk.
   > 8. The app deletes the account, its synced progress, and its Trader Land data, and shows "Account deleted".
   > 9. In this build the server cannot yet revoke Apple access automatically, so the "Account deleted" message lists Apple's steps (Settings > your name > Sign in with Apple > Bobby > Delete) with an "Open Apple's steps" button that opens https://support.apple.com/en-us/102571.
7. `npx tsx docs/app-store/build-34/check-review-examples.mts` passes. RESOLVED in eb2a92c: "What are the main risks in NVIDIA's current chart?" and "¿Cuáles son los riesgos de NVIDIA?" now resolve to NVDA as exact matches (a named asset beats a prefix of a question word; possessives are stripped). Verify against production after the deploy.

## Fixes compared with the build-33 metadata

- **Keywords:** removed `nvidia`, a third-party trademark. Keeping NVIDIA as an example in the description is fine. Spanish keywords now have accents and use Mexican terms (`gráficas`, `bolsa`).
- **Spanish What's New:** "mejora … los errores de los gráficos" said the errors were improved. It now reads "el manejo de errores en las gráficas". Spain-Spanish and calqued phrases were replaced: `añade`, `asesoramiento`, `si no hay un caso claro`.
- **How pieces are earned:** "eligible learning activities" is replaced with the actual rule. Up to three completed reads a day count (`MAX_DAILY_AWARDS = 3`). Each plants a seed, and the seed becomes a piece when the read is reviewed against the market after its time horizon, right or wrong. A read that ends in NO TRADE grows a piece right away. The review notes state that the execution bonus exists only on the website.
- **What's New disclosures:** it now says that voice conversations and public island sharing are not available in this version, since 1.1 had voice.
- **Review notes:**
  - X sign-in removed.
  - No credentials needed; any Apple ID works.
  - Exact deletion path added, including Apple token revocation (gate 6), the manual fallback with the "Open Apple's steps" button, and the retry case when Apple cannot be reached.
  - The example questions resolve cleanly (gate 7). The build-33 example "What are the main risks in NVIDIA's current chart?" triggered a "Did you mean … (NET)?" prompt.
  - The verdict is quoted as it appears on screen: "NO TRADE".
