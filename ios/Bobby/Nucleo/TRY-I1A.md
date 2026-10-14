# Trying the daily conversation (I-1a)

This checkpoint is a signed **Debug simulator** build, version **1.8 (70)**.
Use the fixture launch configurations from `ConversationFixtureCase.launch` in
`UITests/WithoutHelpUITests.swift`; every scenario here is offline. The three
background checks also have captured simulator evidence.

1. **Ask by voice:** tap the microphone, wait for the words, then tap send. The
   answer arrives without asking anything about you. (`companion-plain`, speech `words`)
2. **Switch to typing:** while listening, tap the keyboard. Every heard word is
   there. Tap the field's microphone to append, then return to typing and check
   the complete draft. It grows through four full lines and scrolls beyond four.
3. **Correct an asset:** type Bitcoin, reach its counted confirmation, open the
   keyboard and replace it with Ethereum. The next confirmation names Ethereum
   and no read has started.
4. **Cancel a wait:** use `companion-waiting`, send a question, then tap the stop
   square. The question stays as a draft; sending it again is a deliberate tap.
5. **Recover once:** use `companion-retry`. The failure keeps your question. One
   retry tap brings the answer. Background the app before retrying as well.
6. **See the cost first:** type Bitcoin. The confirmation names the asset and
   counts the read before the action. Change its level, close the native sheet,
   and check the repriced line. Merely changing the level spends nothing.
7. **Finish freely:** close an explanation, ask another question and leave the
   app. No personal question, memory-consent sheet or new reading opens itself.

Also leave and return while typing and while the tap microphone is listening:
words stay, the microphone stops, and nothing sends. A cut capture returns with
its stopped caption. Closing an answer removes it; changing account, language or
withdrawing consent still clears private conversation RAM.

A simulator cannot establish real microphone recognition, call/Siri interruption,
audio routing, silent-switch behavior, speaker-to-microphone echo, haptics,
VoiceOver usability or physical-device timing. Those remain the checks in SPEC 11.6.
