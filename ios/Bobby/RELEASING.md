# Internal TestFlight distribution

Development builds must use `ExportOptions-TestFlight.plist`, with
`testFlightInternalTestingOnly = true`. This prevents external TestFlight and
App Store distribution. Do not submit to beta review or add external groups
unless the owner explicitly requests that distribution for a specific build.

Before uploading, confirm the next unused build number and the members of any
internal group receiving automatic builds. On 2026-09-07, Founder contained only
the account owner and had automatic Xcode distribution enabled. Do not assume
that membership stays unchanged for future uploads. Being an App Store Connect
developer alone does not mean someone should receive a beta build.

The web UX release is separate from the native SwiftUI app. Build 18 is based on
native commit 1f8bcd8; it does not port the web-only Trader Land UX changes.
