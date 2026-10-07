# Bobby 1.8 (64) — store text and release notes

Draft text for the 1.8 listing. Nothing here has been entered in App Store Connect.

- `<locale>/whatsNew.txt` for en-US, es-MX, fr-FR, pt-PT, it and de-DE. The other listing fields are unchanged from `../release-55`.
- `review-notes.txt`: what changed and how to check it. It tells App Review that Restore Purchases moved to Profile > Credits.

## State on 2026-10-07

- Code: branch `release/1.8`, draft pull request #149. 888 unit tests and the Núcleo page tests pass.
- Not done: archive, TestFlight upload, a pass on a physical iPhone, new screenshots.
- Owner actions before a signed build works end to end: enable Associated Domains on the App ID `xyz.bobbyprotocol.bobby` and regenerate the profile; deploy the web and server parts of #149 (the `/i/CODE` page, the association file and the desk's `thesis` field); update the privacy policy text and the App Privacy answers for the thesis review and local reminders.
- Not verified on a device: a real universal link, a real invitation claim, a delivered reminder, a thesis review against the live model.

## App Privacy answers to revisit

- User content: a thesis review sends the person's thesis text to Bobby's server and its AI providers for that one answer; it is not stored by Bobby. Declare it under "Other User Content", linked to the person, used for app functionality, not for tracking.
- Reminders are local notifications and add no collected data.
- Memory is unchanged in what it stores; consent now happens before any capture from iPhone.
