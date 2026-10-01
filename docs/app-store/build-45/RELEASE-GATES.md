# Bobby 1.5 (45): release gates

These files are local submission drafts. The rejected App Store version still references build 38; do not describe source changes as an uploaded replacement.

- Verify the final Release artifact separately from the Debug/offline test product. Offline fixtures must be absent, purchases must remain disabled, and the current AI notice must be version 5.
- Save and verify the exclusion of China mainland in App Store Connect. Removing provider names from marketing copy alone does not suppress the AI functionality.
- Save the eight enabled App Privacy categories, support/privacy URLs, reviewer notes, age-rating answers and the approved screenshots from the parallel media session. Confirm availability on any enabled Mac/Vision platforms.
- Configure automatic Sign in with Apple revocation in the production backend. On 30 September, the production environment did not list `APPLE_SIGN_IN_TEAM_ID`, `APPLE_SIGN_IN_KEY_ID`, `APPLE_SIGN_IN_CLIENT_ID` or `APPLE_SIGN_IN_PRIVATE_KEY`. Use an authorized Sign in with Apple key and secure environment entry; never put its contents in this repository or chat. The implementation's manual fallback is not evidence of automatic token revocation.
- Verify Apple sign-in, cancelled/failed/successful account deletion and token revocation on the shipping build with an authorized disposable account. Confirm immediately before permanently deleting the account. Also verify denied speech/microphone permissions and background capture interruption on a physical device.
- Verify authenticated Deep/Max and the actual reviewer access path with available allowance. An anonymous shared-IP budget already exhausted during audits cannot demonstrate successful premium analysis.
- Assign a real moderator and backup, then verify a private report-to-review/removal flow. Report/block code alone does not establish operational coverage.
- Integrate backend commit `52d28b3dd4dd396b4eb6f01067535b58a1265ddb` into the repository after authorization. It is deployed in production, but a future deployment from unmerged main could overwrite it.

No App Review submission, real purchase or real account deletion was performed by this remediation run.
