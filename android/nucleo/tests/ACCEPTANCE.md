# MainActivity guest acceptance

`MainActivityAcceptanceInstrumentedTest` launches the production MainActivity,
NucleoSession, bundled engine and secured native bridge. It does not use a mock
session, renderer harness, sample market response, awarded XP or saved analysis.

The class only runs on an emulator with no signed-in account and no initialized
billing SDK. A public SDK key can be configured without initializing the SDK; the
real guest coordinator does not identify/configure a billing customer. The class
backs up/restores the guest's `bobby.nucleo` and permission
preferences. Before accepting local test consent, it replaces the instance's
private OkHttpClient by test reflection with an application interceptor that
returns a 503 before calling `proceed`; no API request reaches DNS or a server.
Real app browsing therefore fails truthfully into its empty/offline behavior.
Every case checks that transport attempts are only read-only asset browsing;
no desk, narration, account, billing, report or other mutation is attempted.

Four cases cover:

1. Native risk-version rejection, pre-consent request refusal, valid local consent,
   real starter selection and transition from onboarding to the actual guest app.
   Consent/selection/finish are driven through the production bridge rather than
   claiming to verify every animated onboarding gesture.
2. All six account-sheet language choices, actual localized typing placeholders,
   native language/locale agreement and disabled empty send controls.
3. Native account/risk/squad/locker/memory/briefing/content-report navigation, real Android Back,
   and completion of awaited sign-in/paywall bridge requests as `cancelled`.
4. On a device without on-device recognition, unavailable permission/start status,
   the real pill's keyboard path, viewport bounds, a local Unicode draft and Escape
   cancellation without sending it. This case skips if recognition is available;
   it is not a physical microphone/dictation or granted-permission acceptance test.

The tests inject Android touch/key events into the shipped WebView and click the
native Compose language controls. The expected read state remains no analysis,
zero XP and an empty real local thesis ledger. No fixtures or private session
tokens may appear in the bridge model.

The test waits for the separate native Dialog window to be displayed and receive
focus before Back, and for its removal and WebView focus before sending another
real touch. It does not equate an assigned route or a reloaded IDLE web page with
a completed native sheet animation. Timeouts include safe focus/IME/DOM geometry
diagnostics. Content-report acceptance only opens and cancels the sheet; it does
not enter text, press Send or touch the separate reporting transport.

Run/rebuild through the normal project instrumentation workflow on a dedicated
emulator. Compile or test source presence is not passing runtime evidence; record
the generated instrumentation result separately. Real OAuth, backend progress,
subscriptions, voice recognition and deployment remain independent checks.
