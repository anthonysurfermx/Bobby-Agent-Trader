# Trying the first run and conversation (I-1b)

This is a locally signed Debug simulator build, version 1.8 (70), in TAP mode.
Use offline fixture launches from `FirstRunFixtureCase.fresh` and
`ConversationFixtureCase.launch` in `UITests/WithoutHelpUITests.swift`.
A normal launch can contact production; these review steps use fixtures only.

With one iPhone simulator selected and booted in Xcode, install and launch the frozen build:

```sh
xcrun simctl install booted /Users/mrrobot/Developer/GitHub/bobby-wt/_harness/ios/i1b/Bobby.app
xcrun simctl launch --terminate-running-process booted xyz.bobbyprotocol.bobby \
  -nucleo-fixtures companion-plain -nucleo-page onboarding -nucleo-reset-onboarding \
  -qa-speech-fixture words -qa-speech-permission granted -agent.riskNoticeVersion 0 \
  -avatar.voiceMuted YES -nucleo.voiceMuteReset.v1 YES \
  -AppleLanguages '(es)' -app.language es -AppleLocale es_MX
```

This reset is for the simulator review install. The speech fixture supplies the
localized educational question. For German, use `(de)`, `de` and `de_DE`;
for Portuguese, `(pt)`, `pt` and `pt_PT`. The same signed build contains all six languages.

Start fresh with `companion-plain`. The sphere is born, the silent C1 caption
folds into its rim, and the microphone, keyboard and whole example labels work.
Try the educational example: before acceptance it opens the frozen risk notice.
Tap the agreement once: it shows the hold hint and accepts nothing. Tap “Not
now”: the complete question stays as a held draft. Edit it with the keyboard,
close the keyboard, and deliberately send it again. Hold to agree: the docked
question stays through the page change; preparation and the daily answer follow.
Repeat with an asset example: acceptance reaches the counted confirmation and
no read starts until its explicit action. For question-free re-consent, replace
`-agent.riskNoticeVersion 0` with `-agent.riskNoticeVersion 5` and append
`-qa-stale-consent -companion.id momo -companion.selected.v2.local momo` to the
same fixture launch. “Not now” returns to the ready title and C8c sub.

While first-run listening is active, switch to the keyboard: heard words stay.
In TAP, the microphone in the field appends to typed words without sending.
The existing header X discards a listening or held draft. HOLD keeps its original
field with no microphone. After granting the primer, ready returns with the
four-second tap caption and capture does not start.
Append by holding the microphone on the held draft; it returns the entire draft,
with a complete composer line and a physical 44pt send target. Leave and return
while typing or listening: the microphone stops, words stay in RAM and nothing
sends. The fixture variants `minute`, `silence`, `interruption` and `empty` exercise
stops without sending. Pending permission and hand-over are cancelled on
background. Account/language changes and consent withdrawal clear private RAM.

Follow the seven daily checks in [TRY-I1A.md](TRY-I1A.md): voice ask, switching to
typing/appending, correcting a recognised asset, cancelling a wait, one-tap
recovery, cost before spending, and finishing without a personal question.
Also tap outside a populated composer: the keyboard closes without sending;
tapping the field reopens it with the draft intact. Check daily rows with no
reads, with reads, an active nudge, at the wall and explanations off. Labels
stay whole; educational order depends on delivered reads, and no row scrolls.

The capture index records device, text size, test, source commit and per-image
provenance. SE3 is at +1 text; iPhone 17 Pro uses default size. Spanish and German
have complete matrices and hand-over recordings; Portuguese has consent and an
answer. Every final PNG and the recordings were visually reviewed; see QA-I1B.md.

A simulator cannot establish real recognition, call/Siri and route interruptions,
echo, silent-switch behavior, haptics, VoiceOver usability or physical timing.
SPEC 11.6 remains a real-device gate. Four `testLive` methods are excluded because
this Mac's address has exhausted its allowance. No Apple upload or archive is
part of this checkpoint. Owner approval for TAP (G1) remains open; HOLD is a
verified build-time fallback. I-2 and I-3 retain their own briefs.
