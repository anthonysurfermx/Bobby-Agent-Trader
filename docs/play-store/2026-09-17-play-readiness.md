# Bobby on Google Play — what can ship, and what I would hold back

2026-09-17. Written against production `bobbyprotocol.xyz` as it was serving that day,
and against Play's Cryptocurrency Exchanges and Software Wallets policy
([support.google.com/…/16329703](https://support.google.com/googleplay/android-developer/answer/16329703))
and the Financial Services policy.

## The short version

The **whole web app can go up**, including the part Apple rejected. Android ships it as a
Trusted Web Activity over `bobbyprotocol.xyz`, so Play gets the most complete Bobby there
is — Google sign-in, the balance pill, wave-2 companions, thesis close, `/record`, EN/ES —
none of which is in iOS build 24.

The one thing I would cut from v1 is the **tokenized US equities in the swap picker**
(AAPLc, GOOGLc, METAc, NVDAc, TSLAc, MSTRc, SPCXc, MSFTc). Not because Play forbids them
outright, but because they are the single item in the app that turns a non-custodial DeFi
tool into something a reviewer can read as securities trading — and they are worth
approximately nothing to the Android story. Everything else stays.

## Why the crypto side is fine on Play and was not on Apple

Apple rejected 1.1 build 24 under Guideline 3.1.5(iii). Play has no equivalent rule. What
Play has instead is a licensing regime, and Bobby sits outside it:

> "Non-custodial wallets are out of scope of the Cryptocurrency Exchanges and Software
> Wallets policy."

Bobby is non-custodial by construction, and the app says so on its own first screen
("Bobby never takes custody or signs for you"), in the desk menu ("Your wallet signs every
swap") and in the swap sheet ("YOU SIGN"). The server builds calldata; the user's wallet
signs it; no key, no seed, no balance ever reaches Bobby. So none of the licensing that
the policy demands in the US (FinCEN), the EU (MiCA CASP), the UK, Japan, South Korea,
Canada, Hong Kong, the UAE and the rest applies to us.

That exemption covers the wallet and exchange question. It does not exempt us from the
**Financial features declaration**, which every app with financial features must complete.

## What I would change in the app before submitting

### 1. Tokenized stocks out of the Android build (recommended)

Today production quotes them for anyone, no wallet needed:

```
$ curl -s "https://bobbyprotocol.xyz/api/base-swap?tokenIn=USDC&tokenOut=NVDAc&amount=25"
{"ok":true,"quote":{…"tokenOut":{"symbol":"NVDAc","name":"Coinbase Tokenized NVIDIA",
"assetClass":"tokenized-stock","underlyingSymbol":"NVDA","issuer":"Coinbase Toke…
```

Execution is a separate question: `api/_lib/base-swap.ts` withholds the transaction unless
`BASE_STOCK_SWAPS_ENABLED === 'true'` and the viewer's country passes the gate. **I could
not verify from outside which way that flag is set in Vercel production** — the build path
needs a signed session. Confirm it before submitting either way, because a reviewer who
opens "Swap on Base" sees NVDAc and TSLAc in the dropdown with live prices regardless of
what the server would do next.

Three ways to handle it, in the order I would pick them:

1. **Hide the tokenized-stock class in the picker for v1**, everywhere, not just on
   Android. The token list already carries `assetClass: "tokenized-stock"`, so this is a
   filter, not a refactor. Crypto pairs (ETH, cbBTC, AERO) stay. Ship, get the listing
   live, add equities back later as a deliberate move with the declaration to match.
2. Keep them and declare the app as offering tokenized digital assets. Slower review,
   and it invites a licensing conversation we do not need in week one.
3. Ship Android with no swap surface at all, the way iOS build 26 does. This is the
   safest and the most boring; it also throws away the one feature Play would have let us
   keep that Apple would not.

### 2. Nothing else blocks

The debate, the verdict, NO TRADE, XP and gear, Trader Land, the public record and voice
are all ordinary app features. The risk gate that opens the app — "Not investment advice",
"Bobby never takes custody or signs for you", "Markets involve risk. You decide." — is
exactly what a Play reviewer wants to see on a finance app, and it is screenshot 7 of the
store set for that reason.

## Play Console answers, prepared

**Financial features declaration** (App content → Financial features)

| Question | Answer |
|---|---|
| Does the app provide financial features? | Yes |
| Which? | Crypto: *non-custodial* wallet / DeFi interface. Not an exchange, not a custodial wallet. |
| Does it facilitate the buying, selling or storing of cryptocurrency? | It prepares on-chain transaction data for a wallet the user controls; the user signs. No custody, no order book, no fiat. |
| Personal loans / earned wage access / binary options / debt management | No to all |

**Data safety** — what the app actually collects:

| Data | Collected | Shared | Why | Optional? |
|---|---|---|---|---|
| Email address | Yes | No | Google / Apple sign-in, to carry XP across devices | Yes — the desk works signed-out |
| User IDs | Yes | No | account identity | Yes |
| Wallet address (Other financial info) | Yes | No | building swap calldata and receipts | Yes — only if a wallet is connected |
| App interactions | Yes | No | analytics, XP, gear | No |
| Crash logs / diagnostics | Yes | No | Vercel Analytics | No |
| **Voice or sound recordings** | Yes | **Yes — OpenAI** | Bobby Live is a WebRTC call with OpenAI's realtime model; the desk's dictation uses the browser's own speech API | Yes — only when the mic is used |
| Location, contacts, photos, calendar, health, financial account numbers | No | — | — | — |

Audio is the one that needs care in the form: it is collected, it is shared with a third
party, and it is processed ephemerally rather than stored. Answer it honestly; an audit
that finds undeclared audio is a suspension, not a warning.

**Content rating questionnaire** — reference/utility app; no violence, no sexual content,
no user-generated content that is publicly broadcast (Trader Land worlds are shareable by
code, worth mentioning if the form asks about sharing), no real-money gambling, no
simulated gambling. Bobby's XP has no monetary value and cannot be bought — say so, the
form asks.

**Target audience**: 18 and over only. Not "Designed for Families".

**Ads**: none. **In-app purchases**: none.

**Privacy policy**: `https://bobbyprotocol.xyz/privacy` (live, 200).

**App access**: no login wall. Tell the reviewer: open the app, accept the three risk
statements, pick a companion, tap BTC. No credentials needed.

## What is not decided yet, and what it costs

1. **Account type.** If the Play Console developer account is a *personal* account opened
   after November 2023, Google requires a closed test with **12 testers opted in for 14
   continuous days** before production access can even be applied for. An *organization*
   account (D-U-N-S number) skips it. This is the difference between "live next week" and
   "live in three weeks", and it is the first thing to check in the console.
2. **Tokenized stocks in or out** (above).
3. **Package name** `xyz.bobbyprotocol.app` — permanent once published. See `android/README.md`.
4. **The service worker.** Shipping the TWA means shipping the PWA layer to production,
   and a service worker is hard to take back: reverting the commit does not uninstall it
   from browsers that already have it. Rollback is `PWA_SELF_DESTROY=1` in Vercel plus a
   redeploy, which was verified when that branch was built.

## Open engineering items

- **Microphone inside a TWA is unverified.** Chrome Custom Tabs should mean Chrome's own
  permission prompt and Chrome's own Android permission, with nothing needed in our
  manifest — but "should" is not "tested". If it fails, voice is the one feature that
  would justify a native shell.
- `/record` is still the old terminal-style Trade History: total PnL −3.07%, win rate
  0.0%, one trade, and a typo ("NO TRADES RECORED"). It is not in the store set for that
  reason. Worth either fixing or pointing `/record` at the real TrackRecord that
  `/protocol/calls` already reads.
- `/squad` is an internal 3D showcase page in Spanish while the rest of the English app is
  English. The store set uses the onboarding companion picker instead.
