# Bobby iOS — App Review notes (copy-paste en App Store Connect)

Campo "Notes" del review. En inglés, directo al guideline que un reviewer
de fintech va a mirar (3.1.5 / 2.3 / 5.1.1):

```
Bobby is an educational market-analysis companion. Key facts for review:

WHAT IT IS
- The user picks a 3D companion, asks about an asset (e.g. "bitcoin",
  "NVDA"), and receives an AI-generated analysis: price, trend, levels,
  and a verdict from a three-agent debate (opportunity case, risk case,
  final read). Often the verdict is "NO TRADE" — no setup, capital
  protected. The companion levels up through discipline (asking,
  reviewing, accepting no-trade days), never through trade volume or
  frequency.

WHAT IT IS NOT (guideline 3.1.5 / financial apps)
- No trading or order execution of any kind.
- No connection to exchanges or brokerage accounts; no custody of funds
  or keys. The app is read-only over public market data.
- No personalized investment advice: analysis is generic market
  commentary, and every analysis is labeled "Analysis, not advice". The
  onboarding shows a disclaimer: Bobby does not manage money, execute
  trades, or give personalized recommendations.
- No in-app purchases, no subscriptions, no payments in this version.

ACCOUNTS & DATA (guideline 5.1.1)
- No account, no sign-in, no registration. All personalization
  (companion, discipline XP) is stored locally on the device.
- Microphone and speech recognition are OPTIONAL (dictating a question);
  the full app works by typing. Permission prompts appear only when the
  user taps the mic.

VOICE
- Spoken analysis uses a server-side TTS relay (our backend at
  bobbyprotocol.xyz). Text in, audio out; nothing is retained.

TESTING TIPS
- Language follows the device language (English / Spanish).
- To see the signature moment quickly: ask "bitcoin" — if the desk finds
  no clean setup you'll get the NO TRADE halo with Discipline XP.
```

Cuenta demo: **no aplica** (no hay login) — marcar "Sign-in required: No".
