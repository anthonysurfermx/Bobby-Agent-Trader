# Native telemetry: remaining coverage

Read-only source inventory, 2026-10-03. None of these missing emitters is claimed by the dashboard. No native source, build, device or distribution change was performed in this phase.

| Required signal | Existing source | Missing evidence/path |
| --- | --- | --- |
| Foreground/background | `ios/Bobby/Sources/Nucleo/NucleoSession.swift` lifecycle state; `ios/Bobby/Sources/Nucleo/NucleoWebView.swift` JS notification | Local state does not reach the backend. Add a supported first-party lifecycle event and coverage/version stamp. |
| Online presence | `ios/Bobby/Sources/BobbyAccess.swift` installation/platform identity; `api/bobby-access.ts` device touch | An access request is not ongoing presence. Requires foreground-only heartbeat, expiry and a scoped last-seen model. |
| Installed build | `ios/Bobby/Sources/Nucleo/NucleoSession.swift` session JSON; optional APNs registration through `ios/Bobby/Sources/Briefings/PushRegistrar.swift` / `BriefingsAPI.swift` | Optional registration does not cover every desk event/install. Associate build with new lifecycle/request events before displaying distribution claims. |
| Client-rendered response | `ios/Bobby/Sources/BobbyAPI.swift` final response parse; `ios/Bobby/Resources/nucleo/app.html` final response model | Native NucleoDesk requestId is not propagated into the desk-debate request body. Need server correlation plus acknowledgement after presentation; server completion alone is insufficient. |
| Crashes/termination | `ios/Bobby/Sources/Nucleo/NucleoWebView.swift` WK termination reload; `ios/Bobby/Resources/nucleo/app.html` console logging | No general native crash collector was found. A WK termination event covers that path only; cannot relabel it as complete app crash coverage. |

Smallest follow-up: carry one request correlation ID across server/native rendering, implement lifecycle/build events and expiring foreground presence, report a render acknowledgement, and expose per-signal rollout timestamps. Prefer the current first-party event pipeline and bounded best-effort emission; telemetry must not block a reading or leak prompts, wallet secrets or personal fields. Keep unknown coverage until an installed build actually emits the events.

Acceptance needs the exact installed build and a physical iPhone: launch/background/resume, app killed/offline, successful rendered reading, provider failure, interrupted response and WK termination/recovery. Verify event correlation, duplicates/retries, logout/account isolation, team exclusion, event coverage and presence expiry against the database. A simulator or synthetic HTTP call cannot close these device-only checks.
