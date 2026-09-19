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

Locales are `en-US` and `es-MX`. Paste the plain text only, with no Markdown.

## URLs

- **Privacy Policy URL:** use `https://bobbyprotocol.xyz/privacy` for en-US and `https://bobbyprotocol.xyz/privacy?lang=es` for es-MX. The `?lang=` switch and the September 19, 2026 text only work once this branch is deployed.
- **Support URL:** `https://bobbyprotocol.xyz`, the same as in earlier submissions. The site has no support email or contact form. The policy's only privacy contact is a GitHub issue, because no monitored Bobby inbox exists in the repo. `hello@bobbyprotocol.xyz` appears only as a proposed sender address, with no confirmed inbox. The owner should add a real, monitored contact before or soon after submission.
- **Marketing URL:** leave it **empty** for 1.2. The `/app` copy now says voice is web-only. But its phone screenshots come from earlier builds: a microphone button, "SPEAKING", "Voice or text", "Tap to hear it" and "Capital protected". Add the URL back after those images are replaced with build-34 captures.

## Gates before saving this metadata

1. `/api/desk-debate` is live in production (a GET returns 405, not 404), and migrations `20260919183000_atomic_progress.sql` and `20260919190000_desk_quota.sql` are applied. Every field describes the three-perspective analysis.
2. The build-34 binary hides "Continue with X". The review notes and the privacy answers assume Sign in with Apple only.
3. The build-34 `PrivacyInfo.xcprivacy` declares Other User Content as **linked** (see `APP-PRIVACY-ANSWERS.md`).
4. The labels quoted in the review notes still match the build-34 UI: "Save progress", "Progress saved · account", "Delete account", "Delete account and synced progress", "Delete account permanently", "Account deleted", "Manage Sign in with Apple", "Island settings" and "Trader Land". Update the notes if the iOS change renames any of them.
5. The deployed `/privacy` shows "Effective September 19, 2026".

## Fixes compared with the build-33 metadata

- **Keywords:** removed `nvidia`, a third-party trademark. Keeping NVIDIA as an example in the description is fine. Spanish keywords now have accents and use Mexican terms (`gráficas`, `bolsa`).
- **Spanish What's New:** "mejora … los errores de los gráficos" said the errors were improved. It now reads "el manejo de errores en las gráficas". Spain-Spanish and calqued phrases were replaced: `añade`, `asesoramiento`, `si no hay un caso claro`.
- **How pieces are earned:** "eligible learning activities" is replaced with the actual rule. A completed read plants a seed, and the seed becomes a piece when the read is reviewed against the market after its time horizon, right or wrong. The review notes state that the execution bonus exists only on the website.
- **What's New disclosures:** it now says that voice conversations and public island sharing are not available in this version, since 1.1 had voice.
- **Review notes:**
  - X sign-in removed.
  - No credentials needed; any Apple ID works.
  - Exact deletion path added, including Apple token revocation, the manual fallback, and the retry case when Apple cannot be reached.
