# Review brief — landing split (Bobby app / Bobby Protocol)
**For:** Codex + Kimi K3 · **Author:** Claude · **Date:** 2026-08-23
**Status:** not committed, not deployed. Working tree only, on branch `codex/security-r12`
(which also carries unrelated in-flight security-audit work — see "Hygiene" below).

---

## 1. Why this change exists

A non-crypto reader was shown `bobbyprotocol.xyz` and could not say what Bobby does. Root cause
diagnosis (in `core-message.md`):

1. The copy led with categories, not things — *"Make the thesis earn it"*, *"Accountability
   infrastructure for autonomous finance"*.
2. It described the machine (*"Three agents debate"*) instead of the reader's outcome.
3. One page addressed a human at the top and an MCP client two scrolls down. The section header
   literally read **"One protocol. Two ways in. For people. For agents."** — the page admitting it
   could not choose.

The fix is a message (v5) plus a split into two pages, each with one reader.

**Message v5 spine — both pages:**
> Bobby forces an idea to survive an attack before capital moves, and publishes the verdict
> before any outcome exists.

Anchored in the reader's current behaviour: *asking an AI about your asset is no longer an edge;
the edge moved to verification.*

---

## 2. What changed

| File | Change |
|---|---|
| `src/pages/BobbyAppLanding.tsx` | **New**, 625 lines. Consumer landing at `/app`. |
| `src/App.tsx` | +9: lazy import + `/app` route. `/` and `/protocol` untouched. |
| `src/pages/BobbyProtocolLanding.tsx` | +124/−50: new hero, "The two rules" band, integration section replaces the human/agent duality, "Scope and limits" section, Spanish metric labels translated, two duplicate section numbers fixed. |
| `index.html` | Title + OG + Twitter cards carried the retired tagline in 9 places. |
| `src/pages/BobbyLandingPage.tsx`, `public/skill.md` | Removed a Telegram link — see §4. |
| `docs/messaging/*.md` | **New.** `core-message.md` (doctrine, ES), `landing-copy-en.md` (copy spec, EN), this brief. |
| `public/app/iphone-*.png` | **New.** 3 iOS captures, copied from the `app-soon` worktree. |

### Page 1 — `/app` (Bobby, the app)
Reader: someone who already asks an AI about their assets. Register: Gen Z — violet `#7c52ff`
alongside Base blue, phone mockups, marquee, an interactive aura orb.
Sections: hero → marquee → 01 The two eras → 02 Your aura → 03 What you get →
04 How a call is made → 05 The record → 06 What it does not do → close + bridge to `/protocol`.

### Page 2 — `/protocol` (Bobby Protocol)
Reader: developers and agent builders. Register: institutional, no color, rule-shaped.
- H1: *"Make the thesis earn it"* → **"No decision is approved without being refuted."**
- New **"The two rules"** band (the charter).
- `04 / Your interface — One protocol. Two ways in.` → **`04 / Integration — Give any agent a
  second layer.`** Agent card leads at `1.55fr`; the app is a smaller companion card linking to
  `/app`. **This is the core structural fix — please check it did not just recreate the duality.**
- New **`07 / Scope and limits`**.
- Fixed: two different sections were both numbered "What Bobby does" (03 and 05).

---

## 3. What I want from each reviewer

**Codex — code and correctness.** Do not review the prose.
1. `BobbyAppLanding.tsx`: hooks, cleanup, error paths. `useProtocolStats` polls every 60s — leak?
   Does the page degrade correctly when `/api/bobby-protocol-stats` fails or returns partial data?
2. The `WIN_RATE_MIN_SAMPLE = 20` guard is copied from the protocol page (Base audit r4: never show
   a percentage over a tiny sample). Verify my copy of that logic is equivalent, including the
   `resolved === 0` path.
3. `BobbyProtocolLanding.tsx`: the integration section was rebuilt by string surgery in a script —
   **read that diff hunk carefully for broken JSX nesting or a dropped handler.**
4. Routing: `/app` added as a sibling of the `index: true` route. Any conflict, redirect, or
   catch-all interaction?
5. `document.title` is set by `useEffect` *and* Helmet on `/app`. Reason: on a cold load of `/app`
   no `data-rh` tags were emitted at all and the static `index.html` title won; on `/protocol/docs`
   Helmet works. I did not diagnose the root cause. **Is this an app-wide Helmet bug worth fixing
   properly instead of my workaround?**
6. Pre-existing, unfixed: React duplicate-key warning in the protocol footer (two links to
   `/protocol/docs`). Confirm and fix if trivial.
7. Perf: 3 PNGs at ~225 KB each are `loading="lazy"` but the hero ones are above the fold. Worth
   converting to WebP/AVIF?

**Kimi K3 — message, claims and copy.** Do not review the code.
1. Does `/app` pass the comprehension test? A reader should finish able to answer: what does it do,
   who is it for, what problem does it solve, does it touch my money.
2. **Claim audit — the priority.** Every number and assertion must be defensible. Flag anything
   that overstates.
3. Register split: `/app` is deliberately Gen Z, `/protocol` deliberately institutional. Does the
   spine survive the tone change, or did the app page soften a claim?
4. English quality throughout — both pages are now English-only.
5. The aura preset names are Spanish on an English page (`azul voltaje`, `violeta after
   midnight`…). Kept on purpose: they are the iOS build's real vocabulary. Right call?
6. The line *"Bobby runs on the same models everyone else uses. The difference is not the model —
   it is the procedure around it."* exists to pre-empt the "so it's just a wrapper" objection.
   Does it land, and is it in the right place?

---

## 4. Known issues — verify my calls, do not rediscover

**A. The Telegram handle is gone. Treat as security, not copy.**
`t.me/bobbyagentraderbot` now resolves to an unrelated third-party account
(display name *bar672 bar729*, handle *@cash_spin2025*). The handle was released and re-registered.
I removed every user-facing link: `BobbyAppLanding` (CTA), `BobbyLandingPage` (footer),
`public/skill.md`. **Still stale and NOT fixed by me:**
- `CLAUDE.md:41` — "Bobby Telegram bot: @bobbyagentraderbot"
- `src/contexts/WhiteLabelContext.tsx:38` — `telegramChannel: '@bobbyagentraderbot'`
- Anything off-repo: X bio, Moltbook, hackathon submissions, printed material, the OG image.
**Question for both reviewers:** is `api/telegram-webhook.ts` still bound to a token for a bot that
no longer owns this handle, and can that leak anything?

**B. The record numbers do not live where the page implies.**
`864 / 794 / 433 / 244 / 117 / 70 / 54.5%` are real, from `/api/bobby-protocol-stats` →
`debateActivity`. They live in Postgres and in the **X Layer** contracts (last on-chain activity
2026-04-14). The **Base** contracts are deployed and at **zero** (`totalCommitments: 0`).
Neither page says "on-chain" next to these numbers — deliberate. But `/protocol`'s hero metric strip
still renders **`Debates 0`** and **`MCP calls 0`** straight from the empty Base contracts, beside
`Decisions 864`. That reads as a broken page. **Unresolved — I want a recommendation:** hide
zero-valued metrics, label them "Base (new deployment)", or keep reporting X Layer until migration
completes?

**C. `no-hardcode` deviations, both deliberate, both need a ruling.**
- `/app` aura chips are static copy duplicating iOS preset names. Marketing copy, or must it come
  from a data source?
- `/protocol` integration section still carries the `Metric` strip and MCP wiring untouched.

**D. Not verified by me:** `/app` on a real iPhone; the `prefers-reduced-motion` path for the
marquee and the aura animation; screen-reader behaviour of the aura buttons (they have
`aria-pressed`, nothing else).

---

## 5. Blockers before production

- [ ] Telegram handle: recover it, or purge every remaining reference (§4A).
- [ ] Decide the zero-metrics question on `/protocol` (§4B).
- [ ] Decide what lives at `/`. Today the app is additive at `/app`; `/` and `/protocol` both still
      render the protocol page. Moving the root affects every inbound link and the hackathon
      submissions — **this is Anthony's call, not a reviewer's.**
- [ ] OG image (`public/bobby-social-base-v1.png`) still carries the retired tagline. The meta tags
      are updated; the image is not.
- [ ] Commit hygiene (§6).

---

## 6. Hygiene

Nothing is committed. The working tree sits on `codex/security-r12`, which carries ~25 modified
files of unrelated contract-audit work. **Do not commit these landing changes onto that branch.**
Recommended: a dedicated branch off `main` containing only the files listed in §2.

## 7. How to verify

```
npm run build          # passes, 12s
npx tsc --noEmit       # clean
npm run dev            # then open /app and /protocol
```
If Tailwind gradients render as flat black in dev, restart the dev server — the JIT cache does not
pick up arbitrary-value classes from a file created after the server started. The production CSS is
correct; I verified the compiled class is present in `dist/`.
