# Live privacy/support locale acceptance

Actual rendered production DOM checked at 2026-10-04T13:06:46.041825+00:00 through a scoped CUA Chrome tab. No Safari, simulator or phone interaction; no form, login, permission, purchase or submission.

**Verified:** all eight requested DE/FR/IT/PT privacy/support pages show translated heading/body, matching HTML language and selected dropdown. EN privacy was also checked. This goes beyond HTTP200 or local translation definitions.

| Page | Requested | Rendered heading | HTML language | Selected |
| --- | --- | --- | --- | --- |
| privacy | en | Privacy Policy | en-US | English |
| privacy | de | Datenschutzerklärung | de-DE | Deutsch |
| privacy | fr | Politique de confidentialité | fr-FR | Français |
| privacy | it | Informativa sulla privacy | it-IT | Italiano |
| privacy | pt | Política de privacidade | pt-PT | Português |
| support | de | Wie können wir dir helfen? | de-DE | Deutsch |
| support | fr | Comment pouvons-nous t'aider ? | fr-FR | Français |
| support | it | Come possiamo aiutarti? | it-IT | Italiano |
| support | pt | Como podemos ajudar? | pt-PT | Português |

All five checked privacy languages explicitly distinguish1.7 on-device recognition when the app language is installed from Apple speech-service fallback only after speech-recognition permission. They state Bobby neither stores the audio nor receives it on its servers, distinguish1.5/1.6 on-device-only history, and retain keyboard fallback. The separate AI-consent withdrawal flow and microphone/speech permissions are explained. The four support languages also state the1.7 installed-language/device versus Apple-service fallback and no audio storage. No stale on-device-only1.7 disclosure or English fallback was found.

Minor P3 editing issues: German support’s GitHub-issue sentence lacks its final verb; Italian uses “una ticket” where “un ticket” is expected. No product change was made.

This closes the live disclosure/localized-rendering text gate only. It does not establish served-source SHA, actual microphone/provider behavior, legal compliance or private support delivery. Exact rendered excerpts and URLs are in rendered-receipts.json.
