# bobbyprotocol.xyz — why a reader can't say what it does (audit 2026-09-03)

**Trigger:** a friend of Anthony's read bobbyprotocol.xyz and could not say what Bobby Protocol does.
**Source audited:** live page 2026-09-03 + `src/pages/BobbyProtocolLanding.tsx` (803 lines).
**Test to pass:** after the first screen, a non-crypto reader can say in one sentence what this is.

## What the first screen says today

```
Eyebrow:  THE VERIFICATION LAYER FOR FINANCIAL INTELLIGENCE
H1:       No decision is approved without being refuted.
Sub:      Every idea follows a fixed procedure — case, refutation, risk gate and verdict —
          and the verdict is published on Base before any outcome exists to justify it.
CTAs:     INSPECT A VERDICT · SEE THE PROCEDURE
Stats:    DEBATES 864 · DECISIONS 864 · MCP CALLS 0 · WIN RATE 54.5% (n=794)
Marquee:  BOBBY IS ONLINE · BTC $81,304 · BASE BLOCK … · EVERY THESIS GETS CHALLENGED · PROOF-OF-DEBATE
```

## Findings

1. **The first screen never says it is about markets or money decisions.** "Financial intelligence"
   is the only hint and it is a category, not a thing. "Decision", "refuted", "verdict", "procedure"
   read as legal or AI-governance to an outsider. This is the exact failure `core-message.md` §0
   calls "v4.1: formal y claro, pero empieza en el protocolo, no en el lector". The doctrine fixed
   it for `/app` (anchor: "you already ask an AI about your asset") but the protocol page never got
   the anchor.
2. **Protocol vocabulary above the fold.** The sub uses case / refutation / risk gate / verdict /
   published on Base in one sentence. The doctrine's own rule: no *agent, on-chain, thesis,
   adversarial, harness, MCP, debate* above the fold.
3. **The mandatory line is missing.** "Bobby runs on the same models everyone else uses. The
   difference is not the model, it is the procedure around it." is required by `core-message.md`
   and does not appear anywhere on the live page. It is the line that tells a reader "this is
   about AI answers".
4. **Zeros in the hero.** MCP CALLS 0, later AGENT CALLS 0, INTERACTIONS 0, ADVERSARIAL BOUNTIES 0,
   ON-CHAIN RECORD n=1 next to 864 debates. Each zero reads as "nobody uses this". The
   methodology note is there (good) but a hero stat should never be 0.
5. **The clearest explanation is in section 05.** "Bring a thesis. Bobby challenges it, checks the
   downside, and gives you one clear decision before the result" + the three cards (Bring the idea /
   Test the downside / Get the call) is the best plain-English on the page and it sits after four
   sections of rules and capabilities.
6. **Marquee is jargon.** "PROOF-OF-DEBATE", "EVERY THESIS GETS CHALLENGED" add words a newcomer
   has to decode instead of reassuring them.
7. **"Refuted" is the hardest word on the page** and it is in the H1. Correct in the institutional
   register, opaque to a non-native, non-technical reader.

## Proposal (keeps the v5 institutional register; adds the anchor)

### Hero
```
Eyebrow:  BOBBY PROTOCOL · THE RULES BEHIND EVERY ANSWER BOBBY GIVES ABOUT A MARKET
H1:       No decision is approved
          without being refuted.            (keep; alt below)
Sub:      When an AI answers a question about an asset, this is what happens before you see it:
          a second system tries to break the answer, a risk check can block it, and the call
          is written down before the market settles it.
Line:     Bobby runs on the same models everyone else uses. The difference is not the model,
          it is the procedure around it.                     (mandatory line, currently missing)
CTAs:     INSPECT A VERDICT · SEE THE PROCEDURE               (keep)
Stats:    DEBATES 864 · RESOLVED 794 · WIN RATE 54.5% (n=794) · RESOLUTION 91.9%
          (drop MCP CALLS 0 from the hero; show agent metrics only once they are > 0)
```
H1 alternative if Anthony wants plainer: **"No call goes out until something has tried to break it."**

### Bridge strip (replaces the jargon marquee items, keeps BTC price + block)
```
IN PLAIN WORDS: CHATGPT ANSWERS. BOBBY CHECKS THE MARKET FIRST.
EVERY ANSWER IS CHALLENGED BEFORE IT SHIPS · EVERY CALL IS WRITTEN DOWN BEFORE THE OUTCOME
```
Uses the consumer one-liner locked 2026-09-03 (`core-message.md` §12) as the bridge from the
reader's world to the rules. ChatGPT is named in the strip, not in the H1, per §12.

### Section order
Move today's **05 / The outcome** ("It turns an idea into a decision" + Bring / Test / Get the
call) to **01**, directly under the hero. Then The two rules, The procedure, Capabilities,
Integration, Track record, Scope and limits. Rules explain a thing the reader already understands;
today they come before the thing.

### Numbers
- Hero and section 02: never render a 0 metric. Hide the tile or replace with a non-zero one
  (RESOLVED, RESOLUTION %).
- Track record: keep ON-CHAIN RECORD n=1 but label it "since the Base cut-over (2026-09-03)" so
  the 1 vs 864 gap reads as "new chain", not "nothing here".

## Files to touch (when approved)
- `src/pages/BobbyProtocolLanding.tsx`: hero eyebrow/sub, add mandatory line, hero stat tiles,
  `marqueeItems`, section order (move `#what-it-does` block up), zero-guard on metric tiles.
- `docs/messaging/landing-copy-en.md` PAGE 2 hero: sync the copy.
- Deploy: `npm run build` then git push on a branch, Anthony merges.

## What this does NOT change
The `/app` landing ("Farm aura, not losses") and the split app/protocol stay as decided 2026-08-22.
