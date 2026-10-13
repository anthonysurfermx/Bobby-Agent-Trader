# App access — reviewer instructions

Select **“All or some functionality in my app is restricted”**: initial guest reads are available without an account, but account memory, invitation claims, publishing an island and account deletion require Google sign-in. An allowance can also limit reads. Do not tell Google that every feature is unrestricted.

Suggested review instruction text (English):

> Launch Bobby and select a companion/language. Read and accept the risk notice before the first market request. Tap the input control below the sphere to type, or select the NVIDIA asset shortcut, and request a Quick read. Allow internet access. Microphone and notification permissions are optional; typing and the main app remain usable if denied. Open Profile to change language, then Credits to inspect the available allowances. A guest can explore the app without payment or a wallet. Local theses/reminders are reached from the main sheets. Account Memory and invitation claims require Google sign-in. No subscription purchase is offered in this release. If the guest allowance is exhausted, contact the developer for review access; do not expect reinstalling to grant extra reads.

Reviewer credentials: **owner input required** if Google requires access to account-only functionality. Supply a dedicated developer-controlled review Google account and a safe, repeatable sign-in method accepted by Play; do not put real credentials in git. Enable its service allowance server-side if needed through the owner/server workflow. No bypass, hardcoded bearer, fixture mode, payment or geography VPN is included in the release.

In-app deletion: signed-in Profile → Delete account → Confirm. This is destructive to that review account; provision it accordingly. Owner verifies live Google OAuth/callback and real deletion before submission. CI's staged identity/deletion confirms client behavior only.

Production dependency: Android `POST /api/progress` still returns 400 until server PR #186 and its additive migration are approved/deployed. Saved/local state must not be presented as verified cross-device synchronization. [Owner steps](OWNER-STEPS.es.md) records this publication dependency.

[Google app access preparation](https://support.google.com/googleplay/android-developer/answer/9859455).
