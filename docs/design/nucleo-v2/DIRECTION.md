# Núcleo v2 — Art Direction (single source of truth)

Files to build: `nucleo-v2.html` (daily core loop, returning user) and `nucleo-onboarding.html` (first run). Frame: 390×844 CSS px, iPhone 15/16 class. Every number here is a target the reviewers will measure; where a critic disagreed, the ruling is in Appendix A.

---

## 1. North star and non-negotiables

**North star.** Bobby is one living glass nucleus. What Bobby says is born from the sphere and returns to it, and what you say is born from the black pill and is sent into it. v2 keeps every idea Anthony approved in v1 and raises the craft until any frame could ship as a still, and every motion has a cause, a mass, a direction and a destination.

**The 5 non-negotiables**

1. **Same soul as v1.** Keep these moments. They get retimed and refined, never replaced:
   - the breathing iridescent idle sphere;
   - the black Monogram mic pill (96→236 px, 22 bars, conic glow);
   - the three coloured currents fighting and converging inside the glass;
   - the one serif word "Wait" condensing, with the amber conviction ring at 64%;
   - the to-scale chart exhaled from the sphere's bottom, with a single NOW focal point;
   - karaoke captions;
   - cards that appear only on pull-down, with a peek;
   - "+20 discipline XP for waiting";
   - faces reached by swiping, with no tab bar.
2. **One organism, two origins.** The sphere is the origin of everything Bobby says; the pill is the origin of everything the user says. Nothing fades in place. Every element has a declared origin and a declared destination (see §3.6). Exits are inhaled to the nearest rim point and masked by the glass.
3. **Physics, not timelines.**
   - One spring integrator drives every position, radius and uniform, using the 9 named springs in §3.1.
   - Shader phases are integrated in JS. Time is never multiplied by a state value.
   - Gestures map 1:1 to the finger, with velocity handed off on release.
   - The sphere moves first. DOM follows 60–120 ms later.
   - Every transition can be interrupted and retargeted.
4. **Meaning before spectacle.**
   - Semantic colour lock: mint = Alpha Hunter/Ready, coral = Red Team/Pass, amber = CIO/Wait. Nothing else may use these three hues.
   - The companion tint is identity only: rim and halo, at most 0.35. It is 0 from the moment the question is sent until the return.
   - Amber floods the glass only at the verdict impact.
   - Stay inside the safe-area stage map.
   - Type floor is 11 px (10 px only for chart ticks).
   - One focal emitter per state.
   - No text inside the glass except the verdict word and the Record numeral, and both sit on a scrim.
5. **Value before identity.**
   - No wall before the first verdict.
   - Sign-in appears only after the first saved thesis: Apple first, Google second, equal size, and "Not now" loses nothing.
   - No Buy button, trade CTA or outcome language ("profit", "win", "returns").
   - The real 18 companions live inside the glass, rendered from `companions.json`.

---

## 2. Tokens

### 2.1 Colour

| Token | Hex / value | Role |
|---|---|---|
| `bg` | `#0B0A09` | Stage, launch screen, letterbox |
| `amb-idle` | `#15121C` | Ambient radial centre when idle, listening or on faces |
| `amb-wait` / `amb-ready` / `amb-pass` | `#19140D` / `#0F1714` / `#1A1011` | Ambient centre once a verdict owns the glass (lerped with `uConv`) |
| `ink` | `#F2EDE4` | Primary text (17:1 on bg) |
| `ink-bright` | `#FFF8EC` | Current caption word, verdict word, comet head |
| `ink2` | `#A39C91` | Secondary text (7.3:1 on bg, 6.1:1 on card). **All labels on cards use ink2.** |
| `ink3` | `#8A8378` | Tertiary text on bg only (5.3:1). Never on cards (4.4:1 fails). |
| `ink4` | `rgba(242,237,228,.28)` | Decoration only: tracks, ticks, grabber. Never text. |
| `hair` | `rgba(242,237,228,.08)` | Card borders, row hairlines at .06 |
| `line` | `rgba(242,237,228,.12)` | Chip borders, orbit ellipse |
| `alpha` | `#3FE0B5` | Alpha Hunter, bull, verdict **Ready** |
| `red` | `#FF5A5F` | Red Team, risk, verdict **Pass** |
| `cio` | `#F6B94E` | CIO, verdict **Wait**, and what the CIO owns: calm zone, thesis, discipline XP, conviction ring |
| `pearl` | `#E8DFD0` | Braid colour after the debate converges and before the verdict (neutral, never amber) |
| `listen` | `#5CE1FF` | Listening accent (pill glow, bottom iridescence) |
| iridescence | `#4D6BFF` `#9A5CFF` `#FF6EC7` `#5CE1FF` | Idle interior and halo. Saturation ×0.8 relative to v1. |
| `core-wait` / `core-ready` / `core-pass` | `#2A1C08` / `#082A20` / `#2A0C0E` | Scrim target behind the verdict word. `ink-bright` on these = 15.7 / 14.6 / 17.2 :1 |
| `card-top` → `card-bot` | `#221E1B` → `#171513` @96% | Card fill, with an inner top highlight `rgba(255,255,255,.05)` |
| `glass-fill` | `rgba(22,19,17,.86)` | Satellites in flight, sheets, and the pre-permission card (blur added after settle) |
| `pill` | `#000000` | Mic pill; border `rgba(242,237,228,.10)` and inner top `rgba(255,255,255,.07)` |

**Verdict words:** Ready (mint), Wait (amber), Pass (coral). "Buy" and "Sell" never appear as verdicts.

**Face tints (rim/halo ≤ .35, interior wash ≤ .12):**

| Face | Tint |
|---|---|
| Desk | Companion glass tint |
| Isla | `#7BC8F0` (sea-sky) |
| Squad | Companion glass tint |
| Record | `#D6DAE2` (silver) |
| Theses | Verdict colour of the top saved thesis (Wait → `#F6B94E`) |

**Companion glass tints.** These are identity hues moved away from the three semantic hues. They are mixed in OKLab in JS and applied to rim and halo only, at ≤ .35 in idle, listening and faces, and 0 from the send to the return.

| Palette | Source tint | Glass tint | Companions (ids from companions.json) |
|---|---|---|---|
| matrix | `#22c55e` | `#A8C79A` sage | bobby, byte, kora, zip, rook, noor |
| plasma | `#a855f7` | `#B99CF0` lavender | glitch, momo |
| ice | `#38bdf8` | `#A7BFE8` periwinkle ice | flux, iris |
| gold | `#facc15` | `#E6D6A8` champagne | axiom, sol, vega |
| ghost | `#94a3b8` | `#B8C2D3` pearl slate | halo, mira |
| lava | `#f97316` | `#D9A48E` copper clay (cap .28) | zuri, nalu, keo |

**Chosen companion in both demos: `mira` (Mira, ghost palette).** Her tint is the cleanest against the semantic hues, and her glowing ponytail reads well as a silhouette.

**Temperament by palette** (SHOULD). This scales ambient behaviour only, by at most ±20%. The impact, condensation and ring are identical for every companion.

| Palette | Temperament | Changes |
|---|---|---|
| matrix | precise | response ×.9, breath 4.4 s |
| plasma | elastic | gulp ζ .28, emit ζ .55 |
| ice | crisp | ζ .95, drift ×.7, breath 5.2 s |
| gold | heavy | mass ×1.25, breath 5.6 s |
| ghost | floaty | response ×1.2, drift ×1.4, breath 4.8 s |
| lava | viscous | +80 ms follow-through, flow ×.8 |

### 2.2 Type

Fonts come from Google Fonts: Instrument Serif (regular and italic), Geist 400/500/600 and Geist Mono 400/500. Font-smoothing is antialiased. All numbers use `font-variant-numeric: tabular-nums lining-nums`.

**Voice casting.** Bobby speaks in Instrument Serif. The user speaks in Geist. Data speaks in Geist tabular. Labels are Geist Mono.

| Role | Family / weight | Size / line-height | Tracking | Notes |
|---|---|---|---|---|
| Verdict word | Serif 400 | `round(0.62·r)` / 1.0 | −0.02em | `ink-bright` on scrim. Font-size is set per frame from the sphere radius and is never transform-scaled at rest. |
| Greeting / onboarding titles | Serif 400 | 40/42 | −0.015em | Idle slot y=512 |
| Face titles, picker name | Serif 400 | 36/40 | −0.01em | Slot y=512 (picker name y=490) |
| Card / sheet titles, prompt | Serif 400 | 28/31 (sheet 28/32) | −0.01em | |
| Captions (Bobby speaking) | Serif 400 | 26/31 | −0.005em | `text-wrap:balance`, at most 2 lines, 350 measure, ~30–34 characters per line. Italic only for Bobby's emphasis ("A *not yet*."). |
| Record numeral | Serif 400 | 56/56 | −0.02em | Inside the glass, on scrim .6 |
| Pre-permission card title | Serif 400 | 24/28 | −0.01em | |
| Wordmark "Bobby" | Serif 400 | 24/28 | −0.01em | Header, x=20, centred on y=76. The birth version is 44/48. |
| Live transcript (user) | Geist 400 | 24/30 | −0.012em | The unconfirmed tail word is ink2 |
| Satellite value | Geist 500 | 18/22 | −0.01em | tabular |
| Thesis values | Geist 500 | 17/22 | −0.005em | tabular, right-aligned |
| Card body | Geist 400 | 16/23 | 0 | |
| Greeting sub | Geist 400 | 16/23 | 0 | ink2 |
| Button label | Geist 600 | 16/20 | 0 | Save and Watch buttons |
| Agent stance | Geist 400 | 15/21 | 0 | balance, max-width 156 |
| Chips, sheet body, face status, docked question | Geist 500 chips / 400 others | 15/20–21 | 0 | Docked question is ink2, single line, max-width 240, ellipsis |
| Meta, XP chip, card meta | Geist 400/500 | 13/16 | 0 | |
| Disclaimer | Geist 400 | 12/16 | 0 | ink3 on bg, ink2 on card: "Illustrative read · not financial advice" |
| Labels (uppercase) | Geist Mono 500 | 11/14 | +0.06em | Keys, agent names, hint row, eyebrows |
| Chart axis ticks | Geist Mono 400 | 10/12 | +0.02em | The only text allowed below 11 px |

**Scale:** 10 · 11 · 12 · 13 · 15 · 16 · 17 · 18 · 24 · 26 · 28 · 36 · 40 · 56 (plus 0.62·r for the verdict).

**Number format:**
- en dash with no spaces: "168–172";
- targets "186 / 195";
- prices at 2 dp with "$" in prose and data values ("$178.40"), bare on chart axes;
- a true minus (U+2212);
- deltas carry a 7 px ▲/▼ glyph in ink2, so colour is never the only channel.

### 2.3 Layout grid and stage map (390×844)

**Grid**
- Outer margin 20. Six columns of 50 with 10 gutters (content width 350).
- Everything snaps to x=20, x=370 or centre 195. The one exception is the card carousel (card x=30).
- Spacing tokens: 4 · 8 · 12 · 16 · 24 · 32 · 48 · 64.
- A caption sits 32 px below the lowest visual element. Label-to-value gap is 4. Section gap is 24.

**Fixed bands (never violated)**

| Band | y | Contents |
|---|---|---|
| Status | 0–54 | Empty. The sphere halo may bleed in; text may not. The harness notch covers y 13–43. |
| Header | 54–98 | Centre y=76. Left: wordmark, or a 44×44 "×" during a read. Centre: the docked question during a read. Right: companion avatar, 32 px circle with a 2 px ivory XP arc (x 338–370). |
| Content | 98–700 | |
| Hint row | centred y=720 | Geist Mono 11 ink2, one line |
| Pill | 742–798 | 56 tall, bottom 46 |
| Home indicator | 810–844 | Empty. The pause tag is harness-only and may use 806–830 while paused. |

**Sphere per state.** Centre x is always 195. Mass m = r/122 (a smaller sphere moves faster).

| State | cy | r | Notes |
|---|---|---|---|
| Wake start | 340 | 110 | `uGlow` .35 |
| Idle / Desk face | 340 | 120 | Meridian dots on an arc at r+24 (y≈484). Greeting 512–554, sub 566–589. |
| Birth end (onboarding) | 340 | 120 | Grows from a 4 px point |
| Listening | 346 | 132 | The +6 is the lean toward the pill. Transcript block top at 528. |
| Thinking | 380 | 124 | Alpha label block x 20–176, top 188. Red block mirrored (right 20, top 188). CIO block centred, top 528. |
| Talk: satellites | 330 | 96 | Satellites at (195±127, 330±100). Caption top at 488. |
| Talk: chart | 210 | 64 | Satellites at (195±122, 210±70) at scale .92. Chart box 324–556. Caption top at 592. |
| Verdict | 210 | 72 | Ring r+14; satellites retracted; word 45 px |
| Presenting (cards) | 158 | 44 | Ring r+10. Word 27 px. "64%" below the ring at y=222. Card 244–604. |
| Onboarding picker | 330 | 124 | Roster belt on the top arc at r+34 |
| Onboarding risk | 318 | 104 | Ring r+14 is the agree ring |
| Faces | 340 | 120 | Title 512, status 558, action chip 606–646 |

**Satellite component and slots**
- 100×52, radius 16, padding 10/12.
- Content: key (Geist Mono 11 ink2) with a 5 px flat dot in the colour of the agent who cited it; value (Geist 18); qualifier in ink2.
- Slots are on a diagonal X only, never on the horizontal axis. Clearance to the glass is ≥ 16 px measured to the rounded corner; the outer edge is ≥ 18 px from the frame edge.
- Birth order is clockwise: UL → UR → LR → LL.
- Mint-cited satellites sit left and coral-cited satellites sit right. This mirrors the Alpha (left) and Red (right) labels.
- Demo content: UL "NVDA $178.40 ▲1.8%" (mint dot); UR "RSI 14 · 71 hot" (coral); LR "Earnings · in 6 days" (coral); LL "Volume · 1.4× avg" (mint).
- Orbit ellipse through the slots: rx 180, ry 141 at r=96. Stroke 0.5 px `line`, dash 1 6.
- Ghost satellite on Desk: 0.8 scale, opacity .7, UR slot (317, 200).
- Theses face satellites: (73, 200) and (317, 200).

**Chart geometry** (talk: chart, sphere 210/64)
- Box x 20–370. Plot y 340–540. Domain 148–184, so 5.556 px per $. X labels at y=556.
- NOW at x=296 (30 closes, 9.2 px/day); the future zone 296–370 is filled `rgba(242,237,228,.025)`.
- NOW $178.40 at y=371.1. Calm band 172/168 → y 406.7–428.9 (22 px), with the label "CALM ENTRY 168–172" in Geist Mono 11 amber, vertically centred, 8 px from the left.
- Gridlines at 175 (y 390.0) and 155 (y 501.1). Tick labels on the LEFT inside the plot at x=20, 4 px above the line.
- Earnings marker at x=351.5: ivory 30% dashed 1/4, coral 4 px cap dot, label "EARNINGS · 6D" end-anchored at x=370, y=332.
- Price label "178.40" in Geist 13 w500, end-anchored at x=286, y=362.
- Distance bracket at x=306 from 371.1 down to 406.7: 1 px amber with 4 px caps. Label "+6.40" in Geist 12/16 w500 at x=312, lit on the caption word "six".
- First point is (20, 524.4).
- Lead path: `M195,274 C195,330 20,356 20,524.4`. It fades to 0 over 400 ms once the line starts.

**Card carousel**
- Card 330×360 at x=30, y 244–604, radius 28, padding 24. Track step 340 (gap 10), 20 px peeks on both sides.
- Inactive cards: scale .94, opacity .6. Scale is allowed here because it applies to the whole card at rest, text included; it is never applied mid-flight to text alone.
- Onboarding thesis card: 330×420, y 236–656.

**Chips row**
- Eyebrow "You might want to ask" at y=620. Chips 640–680, 40 tall, radius 20, padding 0 16, gap 8, fill `rgba(242,237,228,.04)`, border 0.5 px `line`.
- One horizontal scrolling row starting at x=20, bleeding off the right edge with a 24 px fade mask.
- The first chip is ivory and the rest ink2.

**Meridian dots (page control)**
- Five dots on an arc concentric with the sphere at r+24, centred under it, shown only in idle and faces.
- Dots are 6×6 with a gap of 10. The active dot is a 20×6 pill in the face tint.
- The whole row is a 44 px hit area. These replace v1's header dots.

### 2.4 Radii, blur, glow budget

**Radii**

| Element | Radius |
|---|---|
| Pill | 28 |
| Chip | 20 |
| Satellite | 16 |
| Card | 28 |
| Sheet top | 32 |
| Buttons (52 tall / 50 tall) | 26 / 25 |
| XP chip | 13 |
| Segmented control (outer / inner) | 18 / 14 |
| Pre-permission card | 24 |
| iOS alert mock | 14 |
| Meridian dot | 3 |

**Blur**

| Element | Blur |
|---|---|
| Satellites | backdrop 14, only after settle (\|v\| < 0.02); solid `glass-fill` in flight |
| Sheet | backdrop 24 |
| Mic conic glow | 22 |
| Pill goo | feGaussianBlur 6 + alpha matrix 18/−7 |
| Verdict condensation | max 14 |
| Transcript birth | 6 |
| Unlit caption words | 2.5 |
| Face glyph off-axis | (1−cos rel)·6 |

**Glow budget.** The sphere halo is capped at alpha .35 and radius 1.8r. On top of that, exactly one focal emitter per state:

| State | Focal emitter |
|---|---|
| Idle | none (the pill glow breathes at .15) |
| Listening | mic conic glow ≤ .8 |
| Thinking | none outside the glass |
| Satellites | none |
| Chart | NOW pulse. The line glow is a 4 px blur at .22 on the last 20% of the path only. |
| Verdict | ring arc, drop-shadow 0 0 3px at 60% |
| Presenting | none |
| Faces | none |
| Birth | the seed point |

Agent dots, card dots and satellite dots are flat with no box-shadow. The verdict word has no text-shadow; the scrim does the work.

**Ambient light and grain**
- Background: `radial-gradient(90% 55% at 50% var(--sy), var(--amb) 0%, #0B0A09 70%)`, where `--sy` is the sphere cy each frame.
- Grain: opacity .035, overlay blend, 160 px feTurbulence tile, at z-index 1 (above the canvas, below all DOM).
- Ground pool: ellipse at cy+1.22r, rx .85r, ry .16r, current tint at 14%, blur 18. Opacity is .14·smoothstep(200, 330, cy)·(0.6+0.4·energy).

---

## 3. Motion system

### 3.1 Named springs

Mass is 1, scaled by m = r/122 for the sphere. Positional motion is integrated in JS with semi-implicit Euler at fixed 1/240 s substeps, and dt is clamped to 50 ms. **No CSS transition may animate `transform`.** CSS transitions are allowed for colour and opacity only.

| Name | k / c | ζ / response / overshoot | Used for |
|---|---|---|---|
| `snap` | 600 / 48 | .98 / .26 s / 0 | Presses (.94 pill, .96 others), toggles, the meridian pill, text rolls, card press |
| `soft` | 140 / 22 | .93 / .53 s / 0.04% | Sphere position and radius, containers, caption coupling, sheet body, card rest |
| `emit` | 190 / 18 | .65 / .46 s / 6.7% | Anything born: satellites, chips, NOW dot, XP chip, ghost satellite, belt beads, the Isla peek return |
| `pill` | 260 / 26 | .81 / .39 s / 1.4% | Pill width 96↔236 / 180 / 196 |
| `return` | 260 / 32 | .99 / .39 s / 0 | Anything going back into the sphere. It never overshoots past its origin. |
| `glide` | 170 / 23 | .88 / .48 s / 0.3% | Face rotation, the card track, the pull commit, picker rotation. Always seeded with the release velocity. |
| `gulp` | 320 / 14 | .39 / .35 s / 26% | Radius and silhouette impulses only: absorb +3–4%, the 5 px sag, the detach ripple, the choose bounce |
| `gaze` | 90 / 17 | .90 / .66 s / 0.2% | Sphere attention (lean toward pill or finger), the wake glance |
| `birth` | 90 / 13 | .69 / .66 s / 5.2% | Onboarding ignite, r 2→120 (peaks ≈126) |

**Uniform springs** are critically damped (k=(2π/T)², c=2√k) with these responses T:

| Uniform | T |
|---|---|
| energy | .30 s |
| swirlAmt | .90 s |
| lean | .66 s |
| glow | .40 s |
| iridescence | .60 s |
| tint | .80 s (the OKLab mix parameter is sprung) |
| compDepth | .42 s |
| scrim | .38 s |
| braid front, flood front (in) | .48 s |
| flood front (out) | .70 s |

Events are impulses added to a spring's velocity, never new targets:
- exposure: 60 ms rise, 520 ms decay on `exhale`;
- shock ring: event-driven 160–180 ms on `exhale`;
- gulp: +3% / +4% / +2% radius velocity kicks.

### 3.2 Curves (no physics)

| Name | Value | Used for |
|---|---|---|
| `exhale` | `cubic-bezier(.12,.8,.28,1)` | Leaving the sphere without physics: comet exit, bloom decay, shockwave, bead to avatar |
| `inhale` | `cubic-bezier(.55,0,.8,.4)` | Being pulled back in. Always paired with scale→.25 and fade over the last 35%, masked by rim distance. |
| `focus` | `cubic-bezier(.2,.65,.25,1)` | Blur-to-sharp text, verdict condensation, wordmark |
| `data` | `cubic-bezier(.3,0,.1,1)` | Ring fill, count-ups, band wipe, orbit draw. **Data never overshoots.** |
| `fade` | `cubic-bezier(.4,0,.2,1)` | Opacity-only crossfades (reduced motion, alerts) |
| `breath` | asymmetric 4.8 s | Inhale 1.9 s sine in-out → hold .25 s → exhale 2.35 s cubic in-out → rest .30 s |

### 3.3 Durations

| Token | ms | Examples |
|---|---|---|
| instant | 90 | press-down, dimple, spark, tick flash (60) |
| micro | 160 | text roll, bars collapse, shock (verdict) |
| short | 240 | glow on/off, word reveal (260), label slide, caption collapse |
| base | 380 | companion sink, satellite retract, scrim, card retract |
| long | 620 | flood recede (700), condensation (900), tint (800) |
| scene | 1100 | ring fill, convergence (1200), birth |

Exits take 70% of the entrance duration. Reduced motion caps everything at ≤ 300 ms (§3.7).

### 3.4 Stagger rules

| Item | Stagger |
|---|---|
| Words | 45–60 ms; a whole line is capped at 600 ms |
| Items (satellites, chips, cards) | 70 ms |
| Belt beads (18) | 35 ms |
| Meridian dots | 200 ms in onboarding (each is a reveal), 40 ms elsewhere |
| Exits | 40 ms in reverse order |
| Bars | 8 ms centre-out (in), edges-in (out) |
| Transcript gather | 22 ms edges-in |
| Docked question typing | 10 ms per character |
| Odometer | 22 ms per digit, 280 ms per roll; only changed digits roll |

### 3.5 Choreography rules

1. **The sphere leads.** DOM children follow 60–120 ms later, with delay = 60 + 60·min(1, dist/300) ms. This applies to satellites, ring, verdict, labels and caption.
2. **Overlap.** Exits start 80 ms before a beat boundary. Entrances start when the exits reach 60%. Beats never flip everything on one frame.
3. **Anticipation.** Any sphere move over 80 px starts with a 120 ms counter-move of 6 px and r −2%, then the spring.
4. **Travel.** Nothing fades in place. Every entrance travels at least 8 px along its origin→slot vector with a blur-to-sharp. Every exit travels toward its destination.
5. **The master breath clock B.** One clock of 4.8 s (or the temperament value) drives every ambient loop:

   | Loop | Period / phase |
   |---|---|
   | Sphere radius | ±0.9% on B |
   | Halo | lags B by 180 ms |
   | Pill glow | antiphase to B |
   | NOW pulse | at B/2 peaks: first 3 pulses every 2.4 s, then every 4.8 s |
   | Satellite drift | 2B (9.6 s), ±2.5°, ±2 px |
   | Orbit dash crawl | 4B |

   Pausing (tap, or `document.hidden`) slows the whole clock to 0.15×; it never freezes.
6. **Gestures are 1:1.**
   - Tracked values follow the finger with zero latency. Springs run only after release, seeded with the release velocity.
   - The demo ghost finger LEADS: it moves first, and the UI reads the ghost position in the same frame.
   - Paging (faces, picker, cards) moves at most ±1 detent per swipe. It commits at |dx| > 40 px or |v| > 300 px/s; otherwise it snaps back.
7. **Haptic map.** In the prototype each haptic is a visual tick: sphere scale 1→1.015→1 over 120 ms plus rim +8% for 90 ms.

   | Haptic | Moments |
   |---|---|
   | light | press, pull commit, seed drop |
   | soft | send, ring landed |
   | medium | convergence impact |
   | rigid .5 | verdict impact |
   | success | save, choose, agree complete |
   | selection | each face/picker detent, card snap |
   | continuous ramp .15→.55 | agree hold |

8. **Visuals lead audio by 30 ms**: word reveals, the verdict word, the amber caption word.

### 3.6 Continuity rule (origin → destination)

| Element | Born from | Path in | Returns to | Path out |
|---|---|---|---|---|
| Greeting, face title/status | Bottom rim | Drop 14 px, blur 6→0, `soft` | Bottom rim | Up 14 px, `inhale`, masked, 35 ms reverse word stagger |
| Transcript words | Pill (voice troughs) | Rise 18 px, blur 6→0, 300 ms | Gather into a 10 px bead → arc into the bottom rim | `inhale` 240 + 360 ms, dimple → gulp |
| Docked question | Types in at the header centre after the bead lands | 10 ms/char | Fades as the wordmark rolls back | 160 ms |
| Agent labels + tethers | Tether draws from the rim angle (−140°, −40°, +90°) to the label dot | 280 ms | Tether retracts to the rim; label drifts 10 px toward the sphere | `inhale` 320 ms, 60 ms apart A, R, C |
| Satellites | Rim at their own angle (masked until dist > r−4), meniscus bulge | Spiral: angle = aᵢ − 0.7(1−p), `emit` | Rim, reverse order, at the verdict | `inhale` 380 ms, gulp +1% each |
| Comet / chart | Sphere bottom (−90° emit) | Comet along the lead then the line | Line un-draws right→left and back up the lead into the bottom rim | `inhale` 420 ms at pull commit |
| Caption | Near the rim side of its slot | Words reveal | Collapses into a 2 px line that rises into the glass | 240 ms |
| Verdict word + ring | Filament collapse at the centre | Condensation | Evaporates (reverse condensation); ring unwinds | 280 / 350 ms |
| Cards | Clip-path circle at the bottom rim (radius .5r), expanding to the card rect, with y driven by the drag | `glide` | Retract into the sphere at its CURRENT position, before the sphere moves | `return`, 40 ms reverse |
| Thesis pill "NVDA · WAIT" | Lifts off the card top on save | — | Arcs into the sphere (swallow, gulp +4%); later re-emitted at idle as the ghost satellite | `inhale` 520 ms |
| Chips | Pill top edge (start scale .6 at the pill centre) | `emit`, 70 ms | Sink into the pill | `inhale` 240 ms, 40 ms reverse |
| Meridian dots | Bottom rim → arc slots | `emit` | Rim | 40 ms reverse |
| Sheet (sign-in) | Poured from the sphere base: a 96×8 glass pill widens to 390 (`emit`) and extends to 844 (`soft`) | 520 ms | Drains back: body retracts up, narrows to a pill, absorbed with a gulp +2% | 500 ms |
| Pre-permission card | Clip-path from a 24 px circle at the bottom rim | `emit` | Retracts into the rim | `return` 500 ms |
| Companion (inside) | Surfaces from depth (`uCompDepth` 1→0) | 420 ms | Sinks (depth 0→1, 6 px down) | 380 ms |
| Header avatar (onboarding) | The chosen bead flies from the belt | `exhale` 480 ms | — | — |

**Rim mask for any DOM element near the sphere:** `opacity *= smoothstep(r − 4, r + 12, distance(elementCentre, sphereCentre))`. Only two origins exist: the sphere and the pill.

### 3.7 Reduced motion (`prefers-reduced-motion` or `?rm=1`)

- Remove travel; don't slow it down. Things appear in place with a 200 ms crossfade, and nothing takes longer than 300 ms.
- The debate becomes three static colour bands at 120°, and convergence is a 600 ms crossfade to pearl, then to amber at the verdict.
- No comet: the chart fades in already drawn (240 ms). No NOW pulse.
- No gulps, sags, ripples, sparks or shockwaves.
- The verdict appears with opacity only (300 ms). The ring appears already filled.
- Breath amplitude ×0.3. The shader clock runs at 0.25×. Swirl is off.
- A face change is a 200 ms crossfade of tint and glyph.
- The birth becomes a 400 ms crossfade of the finished sphere. Snow is off.
- Delete v1's `SLOW` and the forced 1.3 s durations.

---

## 4. Sphere / shader spec

Raw WebGL1, one fullscreen triangle.
- Use `gl.scissor` to a square of side 3.8r around the sphere (the halo is capped at 1.8r).
- Precision: `#ifdef GL_FRAGMENT_PRECISION_HIGH` highp, else mediump.
- Canvas backing size: 390·DPR·fitScale × 844·DPR·fitScale. Cap DPR at 2; drop to 1.5 if the average frame time exceeds 20 ms over 30 frames.
- Pause rendering to 15 fps on `document.hidden`.
- Keep the CSS fallback orb (with the companion as a masked `<img>`) when WebGL fails.

### 4.1 Uniforms (all driven by JS springs or integrated phases)

| Group | Uniforms |
|---|---|
| Geometry | `uC`, `uR`, `uBreath` (−1..1 from B), `uLean` vec2, `uRipple` vec3 (angle, amp, phase), `uEmit[4]` vec3 (angle, extrusion, width), `uPull` vec2 |
| Life | `uEnergy`, `uVoice` (envelope: attack 35 ms, release 160 ms), `uGlow`, `uIrid`, `uBirth` |
| Phases | `uTwist`, `uTwistOsc`, `uFlow`, `uDrift`, `uRot`, `uIridPh` |
| Debate | `uSwirlAmt`, `uNodes[3]` vec3 (angle, radius, glow), `uSep`, `uBraid` (front radius 0..1.1), `uFil` vec2 (radius, alpha) |
| Verdict | `uFlood` (front radius), `uV` (verdict rgb, linear), `uScrim`, `uVCore`, `uShock` vec2 (radius, alpha), `uExposure` |
| Faces | `uTint` (linear rgb, OKLab-mixed in JS), `uTintAmt`, `uTintWash`, `uNeighL` / `uNeighR` vec4 (rgb, amount) |
| Companion | `uComp` sampler2D (256² matte texture, mipmapped), `uCompMode` (0 hidden, 1 silhouette, 2 identity), `uCompDepth`, `uCompAmt`, `uCompBg` rgb, `uCompXf` vec4 (offset x, offset y, side, alpha) |
| Light | `uLight` vec2 (parallax offset from pointer or tilt, clamped to ±0.06, low-passed with T=.3 s) |

**Phase integration** (JS, every substep; the ω values are themselves critically damped springs with T=.6 s):

```
twist += dt*0.5*swirlAmt
twistOsc += dt*0.8
flow  += dt*ωflow        // 0.18 idle → 0.95 duel → 0.04 hush/presenting
drift += dt*0.11*driftMul
rot   += dt*0.05 + faceDrag   // plus the face θ
iridPh += dt*0.012
```

Wrap periodic phases mod 2π; noise offsets may grow. The GLSL must contain **no product of a time value with a state uniform, and no `% 1000`**.

### 4.2 Material (every state)

**Silhouette**
- ρ_edge(ang) = 1 + 0.009·uBreath + global(≤1.2%) + local(≤3%; ≤14% for pull).
- Local terms:
  - bottom bulge: `uLean.y·max(0,−sin ang)^3`;
  - ripple: `uRipple.y·exp(−|Δang|·0.44)·sin(8Δang − uRipple.z)`, where 0.44 gives 50% decay per 90°;
  - emits and dimples: `Σ uEmit.y·exp(−(Δang/uEmit.z)²)`;
  - pull teardrop: `uPull.y·max(0,−sin ang)^4`.
- d = |p|/ρ_edge.
- **No 5/3-lobe wobble.** The glass is rigid at rest and only locally elastic at points of exchange.

**Interior**
- `dens = mix(0.18, 1.0, smoothstep(.22,.78,f2))`. There are no black bruises; v1's floor `.010` is gone.
- `col = 0.012 + ir·dens·(0.62+0.55·uEnergy)·uIrid + ir·0.12·(0.6+0.4z)`, with `ir` desaturated 20% toward its luminance.

**Thickness and refraction**
- Back-face rim: `col += rimC·0.18·exp(−((ρ−0.9)·14)²)`.
- Fake refraction: sample the 2-stop ambient gradient at `uv + n.xy·0.06` and add it at 0.08.

**Fresnel rim, dispersion, edge iridescence**
- `fr = pow(1−z, 2.4)`; `col += rimC·fr·0.75`.
- `col.r += fr·0.10·irid(a+.02).r`; `col.b += fr·0.10·irid(a−.02).b`.
- Outer iridescent edge: `pow(1−z,7)·0.7·(1−0.6·uFlood)`.

**Specular**
- The light is FIXED at L = (−0.36, 0.46) + uLight. It never moves with face rotation; turning a face moves the contents, not the light.
- Core: `exp(−d²·420)·0.9·(1+0.4·uVoice)`.
- Body: `exp(−d²·28)·0.25`.
- Counter-light at −0.85·L: `exp(−d²·900)·0.25`.

**Finish**
- Caustic: v1's bottom crescent at 0.5, plus the ground pool in CSS.
- Tonemap: `col = 1 − exp(−col·1.3·(1+uExposure))`, then `col *= 0.70 + 0.30z`.
- Dither `(hash(gl_FragCoord.xy + fract(phase)·61) − 0.5)/255` on both the interior and the halo, before premultiply.

**Halo:** `exp(−max(d−1,0)·4)·min(.35, .20 + .05·uBreath + .25·uVoice)·uGlow`, cut off at 1.8r. Its hue is `mix(irid(ang), uV, uFlood)`, tinted toward `uTint·uTintAmt`.

**Draw order:** interior → currents/nodes → braid/filament/flood → scrim → **companion** → rim/back-rim/dispersion → specular → shock ring → tonemap → dither. The companion is drawn before rim and specular so the highlight passes over it; that is what sells "inside".

### 4.3 The companion inside the glass

**Matte.** Computed once per companion in JS at load, into a 256² canvas. Do NOT use a luminance key: 8 of the 18 companions (byte, zip, glitch, rook, axiom, kora, vega, noor) have near-black bodies that are darker than their backdrop, and a luminance key deletes them.
1. Draw the dataUri scaled to 256².
2. Border mean = the mean of all 1020 border pixels. Measured backdrops range from rgb(27,32,33) to rgb(46,45,50).
3. BFS flood fill from the border. Accept a neighbour when its max-channel |Δ| from the current pixel is ≤ 5 AND its max-channel |Δ| from the border mean is ≤ 22.
4. Flooded pixels get α=0.
5. Erode 1 px (3×3 min), feather 1 px (blur ×2).
6. Multiply by a radial mask: `1 − smoothstep(0.70, 0.96, ρ_thumb)`.
7. Keep the border mean as `uCompBg`.

These settings were tested on all 18. Bodies survive. Small leaks remain (nalu's leg, mira's shin, some floor shadow) and are invisible once the fog pocket is applied.

**Identity mode** (Squad face, onboarding picker):
- Thumbnail side = 1.5r, seated 0.06r below the centre, lens `uv = .5 + pp·.46/(1+.35(1−z))`, chromatic split ±.006(1−z) at the rim.
- Fog pocket: `col = mix(col, uCompBg, 0.9·uCompAmt·(1 − smoothstep(.55,.85,ρ)))`.
- Then `col = mix(col, tex.rgb, tex.a·uCompAmt·(1−fr))`.
- An ivory floor-caustic ellipse under the feet at .12.

**Silhouette mode** (talking):
- Side 1.25r.
- `col += #FFF3E2 · tex.a · (0.25 + 0.75·smoothstep(.05,.6,lum)) · uCompAmt · (1−fr)`. Black bodies read as a soft ghost with bright rim-lit edges and glowing eyes or ponytail.
- `uCompAmt = .35 + .4·env`, where env is the voice envelope smoothed at 250 ms. It drives brightness, never the flicker of raw amplitude.
- Depth: `uCompDepth` 1→0 moves mip bias 3→0, refraction offset `n.xy·.03`→0 and scale .92→1.
- It bobs 2 px on B and trails the interior rotation by 30%.

**Faces:** the companion's offset, scale and alpha ride the surface with the same mapping as the glyphs (§4.5).

**Header avatar and belt beads:** circular crop at 118% zoom (removes the floor), 0.5 px ivory 20% ring.

### 4.4 States (targets and how they are reached)

| State | Uniform targets (all sprung per §3.1) |
|---|---|
| **Idle** | energy .35; breath ±0.9%; halo .20±.05; ωflow .18; swirl 0; irid 1.0; tint .35 rim + .12 wash; comp hidden; spec parallax only |
| **Listening** | r 120→132 (`soft`); lean bottom bulge .02 and cy +6 (`gaze`); energy .5+.4·voice; ripple from −90° (amp ≤ .014·voice, 8 cycles/rad, 50% decay/90°, integrated phase); halo .20+.25·voice (cap .35); bottom iridescence +35% (`listen` cyan weighted to the lower hemisphere); spec core ×(1+.4·voice) |
| **Send** | dimple at −90°: emit −.05r over 90 ms → gulp +3% → ripple ring (amp .02, decays 400 ms); tint 0 over 300 ms |
| **Thinking (duel)** | swirlAmt 0→1 (T .9); ωtwist .55; ωflow .18→.95 ramp across the duel; irid ×.35; energy .45→.6. **Currents:** each agent has a signature and a home: Alpha is laminar (2 octaves, drifting upward, width .045, biased to the upper-left, dir (−.7,.7) in GL space); Red is turbulent (4 octaves, flow ×2.2, width .028, biased upper-right); the CIO is one slow low-latitude band (n.y ≈ −.35, width .07, rotating .2 rad/s). Offsets are × uSep. **Nodes:** Alpha on an orbit of .55r with ω +1.6→+2.6 rad/s; Red on .55r counter-orbit; CIO on .72r at ω .6 (the observer). Heads `exp(−|pp−pos|²·900)`; trails `exp(−dr²·400)·exp(−dθ_behind·6)` over 0.6 rad. Each Alpha/Red crossing throws a spark: exposure +.12 for 90 ms plus a 2 px rim tick at the crossing angle. |
| **Converge** | node radii → 0 over 1.2 s on `inhale`, ω = ω0·(r0/r)^0.8 capped at 9 rad/s; `uSep = r/r0`, so the isolines coincide exactly when the nodes meet; energy .6→.9. Then **IMPACT 1**: shock 0→1.05r in 180 ms (alpha .35, pearl), exposure +.35, rim flash; braid front 0→1.1 over 480 ms from the centre (pearl `#E8DFD0`); hush 180 ms (ωflow .04, energy .45); filament appears at .8r (ω .5, alpha .7, amber, width .012). |
| **Talking** | swirl .1; energy .38+.45·env (80% of the voice goes to brightness, radius ≤ 1.2%); braid holds; filament circles; comp silhouette surfaces (depth 1→0, 420 ms) |
| **Exhale** | pre-inhale 140 ms (r −1.5%, bottom bulge .03); emit at −90° follows the comet out to r+14 then snaps back (gulp); exposure +.10 |
| **Verdict** | compDepth →1 (380 ms, 6 px down); filament radius .8→0 over 450 ms `inhale`; **IMPACT 2**: shock 160 ms (alpha .30, amber), exposure +.22, rim flash; flood front 0→1.1 over 480 ms (`uV` = amber); braid → 0 under the flood; scrim 0→1 (T .38): `col = mix(col, uVCore, .62·uScrim·(1−smoothstep(.28,.72,ρ)))` |
| **Presenting** | energy .18; ωflow .04; breath ×.5; flood 1, scrim 1; `uPull` = rubberband(drag)·.0009 (max .14); on release a gulp |
| **Face rotate** | `uRot` = θ from the drag, then `glide`; tint scrubbed with the drag fraction (OKLab); neighbour rim sectors: 60° span centred at 180° (previous face) and 0° (next face), `fr·0.45·tint` in faces, rising to .12 wash on the side being dragged toward; detent → gulp +2% + selection tick; contents per face (§4.5) |
| **Return** | flood front 1.1→0 over 700 ms (recedes rim→centre); scrim 0; tint returns over 800 ms OKLab; energy .35 |
| **Birth** (onboarding) | point → r 2→120 (`birth`); `uBirth` 0→1 (T .9) masks density centre-out: `dens *= smoothstep(uBirth·1.2−.05, uBirth·1.2−.35, ρ)`, with a bright front ring at ρ≈uBirth·1.1 (alpha .6·(1−uBirth)); halo 180 ms behind; rim `×smoothstep(.6,1,uBirth)` ("the glass hardens"); specular fades in 80 ms after the rim completes ("the eye opens") |
| **Offline** (SHOULD, not in demo) | saturation .15 graphite, halo off; pill shows a slashed icon + "Type instead" |

### 4.5 Face contents (orbit grammar)

**Layers**

| Layer | Holds |
|---|---|
| CORE (inside the glass) | State, identity, verdict |
| RING (r+10…r+18) | One measure |
| ORBIT (X slots) | Discrete items |
| EXHALE (below the sphere) | Continuous data and cards |

**Glyph mapping (rides the surface):** rel = θ_k − θ; x = sin(rel)·0.62R; scale = .78 + .22·cos(rel); opacity = smoothstep(.1,.6,cos rel); blur = (1−cos rel)·6 px. Glyphs are filled shapes with a 1 px ivory stroke at 85% and a soft inner glow. No hairline clip-art and no glyph text under 11 px effective.

| Face | Core | Ring / Orbit | Title · status · chip |
|---|---|---|---|
| Desk | Breathing interior; the NVDA ghost satellite after save | UR ghost satellite | Greeting "Good evening." · sub · none |
| Isla | Filled island glyph (low mound, sand `#E8D9BC` 70%, 3 tiny pieces, the newest glowing) above a calmer lower sea band | RING: 16 plot segments at r+10…r+18, 3 lit ivory, 1 newest amber-pulsing (Isla growth), others ink4 | "Isla" · "3 new pieces this week · NVDA read closes in 7 days" · "Visit Isla" |
| Squad | Mira in identity mode with the fog pocket | Belt: 18 thumbs (20 px, active 32 px) on the TOP arc at r+34, spanning −165°…−15° | "Squad" · "Mira · level 12 · 9-day streak" · "Change companion" |
| Record | "63%" serif 56 on scrim .6 | RING: 41 ticks at r+10…r+18 (hits ivory 1.5 px, misses ink4 1 px), drawing clockwise 8 ms/tick | "Track Record" · "41 calls committed on Base · illustrative" · "View on Base" |
| Theses | Amber rim .35 | ORBIT: "NVDA · Wait / $168–172" at (73,200) and "SOL · Wait / $138–142" at (317,200), born with `emit` on detent | "Saved theses" · "2 watching" · "Open theses" |

**Face navigation**
- θ = θ0 + dx/(0.9R), which is 135.7 px per face at R=120.
- Detents at k·2π/5. Returning to Desk is exactly one full revolution (2π).
- The meridian active pill width follows the drag fraction (20↔6).
- The label slides 12 px in the swipe direction (240 ms); the subline follows 40 ms later.

---

## 5. CORE LOOP v2 storyboard — `nucleo-v2.html` (43.0 s loop, returning user, companion Mira)

Beat titles are posted as `bobby-step` messages (`title: "B<n> · <Title>"`, `total: 13`).

**Demo data.** NVDA; 30 closes (v1 array); NOW $178.40; calm zone 168–172; stop 161.50; targets 186 / 195; dead if daily close under $158; earnings in 6 days; conviction 64%; verdict Wait.

**Captions** are timed from this word table (visuals lead by 30 ms):
- B4: NVIDIA's 13.00 · trend 13.42 · is 13.66 · strong, 13.80 · but 14.40 · it's 14.60 · stretched 14.80 · right 15.30 · into 15.52 · earnings. 15.78 (end 16.30)
- B5: Calm 16.80 · entry 17.08 · was 17.40 · 168 17.60 · to 18.25 · 172. 18.40 · It's 19.50 · six 19.72 · dollars 19.98 · above. 20.36 (end 20.90)
- B6: So 21.30 · my 21.48 · call 21.66 · is 21.92 · wait. 22.40 · Not 23.05 · a 23.25 · no. 23.40 · A 23.85 · *not* 24.00 · *yet.* 24.22 (end 24.60)

| Beat / time (s) | Sphere | Enters (from) | Exits (to) | Copy | Focal |
|---|---|---|---|---|---|
| **B0 Wake** 0.00–0.90 | (340, r110, glow .35) → r120, glow 1 on `gaze`; one inhale. There is never a blank frame. | 0.20 header wordmark + Mira avatar (fade 240). 0.30 greeting exhaled from the bottom rim (drop 14, 55 ms/word) and sub +120 ms. 0.55 meridian dots from the rim (40 ms). 0.70 pill rises 28 px (`soft`). 0.85 sphere glances 4 px toward the pill and back (`gaze`). 0.90 hint row. | — | "Good evening." / "What are you weighing tonight?" · hint "HOLD TO ASK · SWIPE THE SPHERE" | Sphere |
| **B1 Idle** 0.90–3.00 | One full breath. Pill glow .15 in antiphase. | Ghost appears at 2.70, 20 px below the pill, travelling in. | — | — | Sphere (this is the App Store hero frame at 2.0) |
| **B2 Hold to ask** 3.00–6.80 | 3.15 → (346, r132, `soft`); lean + bottom bulge (`gaze`); ripples from −90° on voice; energy .5+.4v | 3.00 touch-down: pill .94 (`snap`), light tick. 3.09 width 96→236 (`pill`); bars centre-out 8 ms; conic glow .15→.8 (240); goo blobs. 3.40–5.18 transcript words born above the pill at voice troughs: Should 3.40 · I 3.66 · buy 3.82 · NVIDIA 4.30 · right 4.92 · now? 5.18 (ink2 until final at 5.60) | 3.10 greeting inhaled up 14 px into the rim (reverse 35 ms, 300 ms); meridian dots into the rim. 5.90 finger up, and in the same frame: bars collapse edges-in (160), pill 236→96, glow off. 5.96 words gather into a bead (22 ms edges-in, 240). 6.20 bead arcs to (195,478) (360 ms `inhale`, 12 px arc, 20 px trail). 6.56 dimple → gulp +3% → ripple ring, soft tick | Hint rolls to "RELEASE TO SEND" at 3.10, then empty at 5.90. Header 6.60: wordmark out (160), question types in (10 ms/char): "Should I buy NVIDIA right now?", × fades in. Tint ducks to 0 over 300 ms | Pill, then the bead |
| **B3 Debate inside the glass** 6.80–12.60 | 6.80 → (380, r124). Swirl 0→1 (T .9). Duel; spin-up; 11.60 IMPACT 1 (pearl braid); 12.08–12.26 hush; 12.26 amber filament at .8r | 6.70 pill → thinking (3 dots mint/coral/amber orbit r 6 px, 1.2 s period; tap cancels). 7.05 Alpha node at −140° + tether (280) + label (name, then stance 45 ms/word). 7.60 Red (−40°). 8.20 CIO (+90°). Sparks at crossings ≈8.9 and ≈10.1. 10.40 CIO label rolls (160) | 10.60–10.92 tethers retract. Labels drift 10 px in and inhale at 10.70 / 10.76 / 10.82 (380 ms) | ALPHA HUNTER · BULL "Demand is still beating estimates" / RED TEAM · BEAR "Stretched, with earnings in 6 days" / CIO "Weighing both sides" → "Verdict forming" · hint "THREE AGENTS DEBATING" | The collision at the centre (11.60) |
| **B4 Satellites** 12.60–16.60 | 12.60 anticipation (−6 px, −2%). 12.72 → (330, r96) `soft`. Talking energy. Filament circles | 12.85 Mira surfaces (depth 1→0, 420). Satellites extrude at the rim clockwise with meniscus + interior fling +.35 rad: NVDA 12.85 · RSI 12.92 · Earnings 12.99 · Volume 13.06 (`emit`). Inside each: key, then value +60 ms, digit roll 280 ms after landing. 13.20 orbit draws from each satellite (dashoffset 500, `data`). 13.00 caption at y 488 | Hint row empty. Pill → speaking (stop square) | Caption B4 | Satellites, then the caption |
| **B5 Chart exhaled** 16.60–21.20 | 16.60 anticipation. 16.72 → (210, r64). 17.20 pre-inhale 140 ms. 17.34 emit at −90° | Satellites follow to the r64 slots (+60–120 ms, scale .92); caption springs to 592 (coupled). 17.34 comet exits at 900 px/s (`exhale`) → 300 px/s by the first point (17.76) → constant 300 px/s along the line → decelerates over the last 12% → 19.16 the head BECOMES the NOW dot (`emit`, 0→1). 19.24 calm band wipes L→R (clip, 420, `data`); 19.40 its label; 19.48 earnings line top→bottom (300) + coral cap; 19.44 area (600; amber 14%→0 only between the band-top crossing and NOW, ivory 4% elsewhere); 19.24 ticks and x labels; 19.64 NOW pulse (B/2); 19.72 bracket "+6.40" lights with "six" | 19.20–19.60 lead fades to 0 | Caption B5 | The NOW dot |
| **B6 Verdict: Wait** 21.20–25.40 | 21.60 → (210, r72). 21.80 filament collapses (450 `inhale`). 22.34 IMPACT 2, rigid tick; amber flood 480; scrim 380. 24.60 and 25.15 two sags (5 px, `gulp`) | 22.37 "Wait" condenses: tracking .30em→−.01em, blur 14→0, scale 1.25→1, opacity 0→1, 900 ms `focus`; caption word "wait" turns amber on the same frame. 22.62 ring (r+14, 1 px `cio`) 0→64% over 1100 ms `data`; 5 px head dot at the arc end; "64%" digits count in sync, with "CONVICTION" in Geist Mono 11 fixed 8 px below the word; 23.72 lands with a 60 ms tick flash + soft tick. 24.60 meta line "Illustrative read · not financial advice" under the caption | 21.30 satellites retract reverse (LL, LR, UR, UL; 40 ms, 380 `inhale`, gulp +1% each). 21.40 Mira sinks (380, 6 px). Orbit ellipse fades (240) | Caption B6 · hint "PULL DOWN FOR THE FULL READ ⌄" at 24.60 (first 3 verdicts only) | The word "Wait", then the ring |
| **B7 Pull: the cards pour** 25.40–28.60 | Teardrop under the drag (`uPull`). 26.10 release → gulp back to round and → (158, r44) `soft`; word → 27 px; "64%" moves below the ring (Geist 13/16 w600 amber) | 25.20 ghost moves to (195,600). 25.50 finger down; 25.50–26.10 drag to y 720, tracked 1:1 with rubberband `(1−1/(dy·.55/260+1))·260`; cards extrude from the bottom rim as a clip-circle → rect. 25.80 commit at 72 px (light tick). 26.10 release (v≈250 px/s) → `glide`, cards at rest 26.60 on the **Debate** card. 27.10 swipe left 120 px / 300 ms tracked 1:1 → 27.40 release → one card → **Thesis** settled 27.90 (selection tick) | 25.80 chart inhaled right→left and up the lead (420 `inhale`); caption collapses into a 2 px line into the glass (240); meta line fades; hint row empty | Debate card: THE DEBATE · "3 agents · 11 s"; Alpha "Data-center demand keeps beating estimates. The trend is intact." / Red "RSI 71 with earnings in 6 days. Buying here is a coin flip." / CIO "Both are right. Wait for 168–172, or a close above 182." · footer disclaimer | The card under the finger |
| **B8 Save thesis** 28.60–30.80 | 30.12 gulp +4% on the swallow | Thesis card layout: header THESIS · NVDA / "7-day horizon"; title "Wait for the pullback." 292–323; rows 36 px (ENTRY $168–172 · STOP $161.50 · TARGETS $186 / $195 · DEAD IF Daily close under $158) 335–479; XP chip 486–512; button 528–580. 28.90 press .96; 29.00 release: label roll "Save thesis" → "Saved · Bobby is watching" (button → amber 14% fill, amber text); amber conic border sweep once (500); success tick. 29.10 XP chip "+20 discipline XP for waiting" (`emit`, Geist 13/16 w500 amber on amber 12%, 26 tall) | 29.60 "NVDA · WAIT" pill (64×24 amber glass) lifts off the card top and arcs into the sphere (520 `inhale`) | — | Save button, then the swallow |
| **B9 You might want to ask** 30.80–33.20 | Presenting, still | 30.80 eyebrow (Geist Mono 11 ink3) at 620. 30.90 chips born from the pill top (70 ms, `emit`): **"What would make it a yes?"** (ivory) · "Compare with AMD" · "What if earnings miss?" (ink2) | — | — | Chips (the reader chooses; 1.5 s of rest is fine) |
| **B10 Return to the sphere** 33.20–35.00 | 34.00 anticipation → (340, r120) `soft`; 34.00–34.70 flood recedes rim→centre; scrim off; 34.10 tint returns (OKLab, 800) | 34.50 NVDA ghost satellite re-emitted from the rim to the UR slot (317,200), scale .8, opacity .7, `emit`: "NVDA · WATCHING / $168–172". 34.55 greeting exhaled; meridian dots from the rim; the Theses dot carries a 4 px amber badge | 33.20 chips sink into the pill (reverse 40, 240). 33.35 cards retract into the sphere at (195,158) BEFORE it moves (right peek, left peek, active; 40 ms; `return`). 33.40 question fades, wordmark rolls back, × out. 33.70 "Wait" evaporates (280) and the ring unwinds (350); "64%" rolls to 0 | "Good evening." / "NVDA is saved. I'm watching 168–172." | Sphere |
| **B11 Faces** 35.00–41.00 | Swipes (ghost on the sphere, right→left, 90 px / 300 ms, tracked 1:1): down 35.20, release 35.50 → Isla settles ≈35.95; 36.40/36.70 → Squad; 37.60/37.90 → Record; 38.80/39.10 → Theses; 40.00/40.30 → Desk at 40.75, exactly 2π | Per face (§4.5): contents ride the surface; tint scrubs; neighbour rim sectors; meridian pill follows the drag; title/status slide 12 px with the swipe; chip born (`emit`); detent gulp +2% + selection tick | Previous face contents ride off the far side | Hint "SWIPE THE SPHERE" 35.00 → empty at 36.40 | The face content in the glass |
| **B12 Home** 41.00–43.00 | One breath at idle; the ghost satellite drifts on 2B | Greeting settled | 42.60 dim to black 400 ms (sphere down to glow .35, r110) → restart at B0 | — | Sphere |

---

## 6. ONBOARDING storyboard — `nucleo-onboarding.html` (65.8 s scripted, first run)

**Order.** First light → hello line → choose companion inside the sphere → hold-to-ask teaching + mic pre-permission → risk notice as hold-to-agree (just in time, while the first question waits inside the glass) → first read (short) → save thesis → sign-in after value → faces peek (Isla grew a piece) → home.

**Rules for this file**
- No progress bars, step counters or Skip button. Every beat except the birth is user-paced in the product; the demo paces them with the ghost.
- Exactly one reward (XP) in the first minute.
- No Buy CTA.
- Record is never shown.

Postmessage titles: `"O<n> · <Title>"`, `total: 10`. The AHA frame is the verdict condensing at 43.77 s.

**Captions** are timed from this word table:
- O1 page A: I'm 3.10 · Bobby. 3.32 · Before 3.80 · you 4.08 · buy 4.22 · anything, 4.40 (end 4.70)
- O1 page B: three 4.85 · of 5.05 · me 5.15 · argue 5.40 · about 5.75 · it. 5.98 · Then 6.55 · you 6.75 · decide. 6.92 (end 7.20)
- O5 satellites: NVIDIA 36.60 · is 37.00 · strong, 37.15 · but 37.70 · it's 37.88 · stretched 38.05 · into 38.50 · earnings. 38.70 (end 39.10)
- O5 chart: Calm 39.40 · entry 39.66 · is 39.95 · 168 40.10 · to 40.72 · 172. 40.86 · It's 41.70 · six 41.95 · dollars 42.20 · above. 42.50 (end 42.90)
- O5 verdict: So 43.00 · my 43.15 · call 43.30 · is 43.50 · wait. 43.80 · Not 44.40 · a 44.58 · no. 44.72 · A 45.10 · *not* 45.24 · *yet.* 45.44 (end 45.80)

| Beat / time (s) | Sphere | Enters (from) | Exits (to) | Copy | Focal |
|---|---|---|---|---|---|
| **O0 First light** 0.00–2.80 | The first frame is the launch screen: `#0B0A09` + a 4 px `#FFF8EC` point at (195,340). 0.00–0.40 the point fades in with a 12 px bloom. 0.40 and 0.70 heartbeats (scale 1→1.6→1, 300 ms each; ticks .45, then .28). 1.00 ignite: r 2→120 on `birth` (peak ≈126 at ≈1.45), `uBirth` ink-pour centre-out with a bright front ring, halo 180 ms behind, energy .6→.35. 1.60–2.20 rim 0→.75 ("glass hardens"). 2.28 specular appears (80 ms, "eye opens") | 2.00 wordmark "Bobby" serif 44/48 at y 512, blur 8→0 (600 `focus`) | — | "Bobby" | The point, then the sphere |
| **O1 Hello** 2.80–7.60 | Idle (340, r120). 4.95 swirl 0→.8 (400). Trailer duel 5.40–6.40 (one spark ≈5.9). 6.55 nodes converge (700) → 7.05 soft impact (exposure +.15, shock .8r 160 ms) flooding **IVORY** at .5: the user is the verdict. 7.10–7.60 swirl and flood → 0 (800) | 2.80 wordmark flies to the header slot (FLIP + crossfade, 700 `soft`). 3.10 caption page A exhaled at y 512 (karaoke). 4.85 page B. 5.00 / 5.20 / 5.40 trailer labels, names only (Geist Mono 11 in the agent hue): ALPHA HUNTER at (20,188), RED TEAM at (right 20, 188), CIO centred at y 474, with tethers to −140°, −40°, +90° | 4.70 page A inhaled into the rim (240). 6.40 tethers retract, labels inhaled | "I'm Bobby. Before you buy anything," / "three of me argue about it. Then you decide." | The three currents (colour grammar taught before first use) |
| **O2 Choose your companion** 7.60–17.20 | 7.60 → (330, r124). Identity mode: `bobby` rises from depth (420) with the fog pocket. Swipes rotate the interior (detent 2π/5, same physics as faces); rim tint scrubs to the incoming glass tint; breath previews the temperament. 60 snow flakes (2D canvas clipped to the sphere circle, 1–2.5 px ivory .5, v += ω·r·.8, drag 2.2/s) | 7.70 prompt "Who lives in here?" (serif 28/31) exhaled upward to y 110. 7.80 the 18 beads spiral out of the rim clockwise onto the top arc at r+34 (35 ms). 8.00 name "Bobby" serif 36/40 at y 490 + "1 of 18" (Geist Mono 11 ink3) at 536; pill rises as a label pill "Choose Bobby" (180 wide, Geist 600 16); hint "SWIPE THE SPHERE · TAP TO CHOOSE". Swipes (90 px/300 ms): 9.00/9.30 → **byte** · 10.20/10.50 → **kora** · 11.40/11.70 → **zip** · 12.60/12.90 → **mira**. Each: the outgoing creature rides off toward the gesture, the incoming one arrives from the other side; the belt glides one bead; name and counter roll 12 px in the swipe direction; the pill label rolls "Choose Byte"…; selection tick. 13.30–14.60 dwell on Mira. 14.60 ghost presses the pill (.94); 14.70 release: sphere 1→1.04→1 (`gulp`), Mira hops −8 px (`emit`), flakes burst up, success tick | 14.90 other beads sink into the rim (reverse spiral, 20 ms); Mira's bead flies to the header avatar slot (354,76) (480 `exhale`), and the avatar gains its 2 px XP arc at 0. 15.20 Mira recedes identity → silhouette .85→.30 (700) → hidden; rim takes `#B8C2D3` at .35. 16.40 prompt, name and counter inhaled | 15.40 caption "Mira it is." (serif 26 at 512) | The creature inside the glass |
| **O3 Hold to ask + mic** 17.20–26.60 | 16.60 → idle (340, r120). 19.00 lean +6 toward the pill. 23.20 listening (346, r132) as in the core B2 | 17.20 title "Ask before you trade." (serif 40/42) exhaled at 512; sub "Hold the button and talk, or tap a question." at 566. 17.40 pill → mic glyph (180→96, `pill`) and idle breath (scale 1→1.035 on B). 17.60 three chips born from the pill: "Should I buy NVIDIA?" · "Is Bitcoin too high right now?" · "Why is PLTR moving today?". 18.80 ghost approaches; 19.00 **first ASK touch-down does not record**. 19.10 pre-permission card blooms from the bottom rim (clip-circle 24 px → 300×148 at x 45, y 488–636, `emit`): "I only listen while you hold." (serif 24/28) / "iOS will ask for the microphone once." (Geist 15/21 ink2) / ivory button **"Continue"** (44 tall, 252 wide). Ghost lifts 19.20. 20.40 ghost taps Continue (.96) → 20.50 card retracts into the rim (500 `return`). 20.90 iOS alert mock (scrim .4, 270 wide, radius 14, `rgba(44,44,46,.92)` blur 20): title '"Bobby" Would Like to Access the Microphone', body "Bobby listens only while you hold the button, to hear your question.", buttons Don't Allow \| Allow (`#0A84FF`). 22.00 ghost taps Allow → 22.10 alert out (200 `fade`). 22.40 caption "Got it. Hold and ask." 23.20 hold → listening (as core B2): words 23.50–25.00 "Should I buy NVIDIA right now?"; 25.40 release; bead 25.46–26.20 into the bottom rim; gulp. 26.25 docked question in the header; tint ducks | 19.00–19.30 title and sub inhaled; chips sink into the pill (19.00–19.25) | as listed | Pill, the card, then the bead |
| **O4 Risk notice: hold to agree** 26.60–31.60 | 26.70 → (318, r104). The question bead waits inside, orbiting at ρ .2, 0.8 rad/s. Ring at r+14 (ivory `#F2EDE4`, 1 px; the SAME ring geometry later used for conviction) | 26.90 caption "Before I answer, one thing." 28.00 / 28.18 / 28.36 three lines, serif 28/32, centred at y 454 / 486 / 518, pulse-swept: "Bobby helps you think." / "It's not financial advice." / "You decide." 28.30 "Read the full notice" (Geist 13/16 ink2, underlined, 44 tap target 550–594). 28.30 pill → "Hold to agree" (96→196, `pill`). 29.00 press: an ivory 12% fill sweeps inside the pill L→R AND the ring fills from 12 o'clock, both linear 1200 ms, easing out over the last 150; continuous tick ramp. **29.50 early release at ~42%: both unwind in 300 ms, no error copy.** 30.00 press again → 31.20 complete: success tick, ring flash (90), ring shrinks into the rim (400 `return`) with rim +.15 decaying over 1 s | 31.20 lines inhaled (reverse 40); link fades; pill label → thinking dots (160 crossfade, 196→96) | as listed | The ring filling |
| **O5 First read (short)** 31.60–46.60 | 31.60 the waiting bead drops to the centre and bursts into the three currents. **Think** 31.70 → (380, r124): Alpha 31.90 · Red 32.35 · CIO 32.80 (≥250 ms apart, driven by stream events); duel to 34.60 (4.5 s floor honoured); "Verdict forming" 34.60; converge 34.60–35.60; IMPACT 1 35.60 (pearl); hush; filament 36.10. **Satellites** 36.20 → (330, r96); Mira surfaces 36.45. **Chart** 39.20 → (210, r64); comet 39.80; line 40.22–41.62; marks 41.70–42.10. **Verdict** 43.20 filament collapse; 43.74 IMPACT 2; 43.77 "Wait" condenses (**AHA**); ring 44.02–45.12. 46.00 and 46.55 sags | Satellites (**3 max on a first read**): UL NVDA 36.45 · UR RSI 36.52 · LR Earnings 36.59; orbit draws. Chart as core B5 (bracket lights 41.95). 45.20–46.40 hint row, first run only: "CONVICTION = HOW SURE BOBBY IS, NOT ODDS OF PROFIT". 45.90 meta "Illustrative read · not financial advice". 46.40 hint "PULL DOWN FOR THE PLAN ⌄" | 42.95 satellites fed back into the rim; 43.05 Mira sinks | Captions O5 | Currents → satellites → NOW dot → "Wait" |
| **O6 Save the thesis** 46.60–52.60 | 47.40 → (158, r44). 50.92 gulp +4%. 51.50 → idle (340, r120); flood recedes (700); Mira tint returns (800) | 46.80 ghost at (195,600) drags to 720; 47.10 commit (chart inhaled, caption collapses); 47.40 release → cards glide, opening **on the Thesis card** (Debate edge peeking left, Isla right). First-run thesis card 330×420 (y 236–656): header / title "Wait for the pullback." / 4 rows at 32 px / segmented control **24h · 3d · 7d** (36 tall, 24h selected) at 467–503 / line "Closes tomorrow. It grows your island either way." (Geist 13/18 ink2) 511–529 / button **"Watch & ping me"** (52, 540–592) / text link "Just save" (44, 592–636). 48.60 ghost taps Watch (.96); 48.70 label rolls to "Watching · pings at $172", amber conic sweep (500), success tick; the XP chip "+20 discipline XP for waiting" replaces the horizon line (`emit`), **the only reward**. 49.10 iOS notification alert mock ('"Bobby" Would Like to Send You Notifications' / "Notifications may include alerts, sounds, and icon badges. These can be configured in Settings." / Don't Allow \| Allow); 49.90 Allow; 50.20 out. 52.10 NVDA ghost satellite re-emitted to the UR slot (317,200) at .8 | 50.40 the thesis condenses into the "NVDA · WAIT" pill and arcs into the sphere (520 `inhale`). 51.10 cards retract into the sphere at (195,158) (`return`); "Wait" evaporates; ring unwinds; question → wordmark | as listed | The Watch button, then the swallow |
| **O7 Sign in after value** 52.60–57.40 | Idle; ghost satellite visible above the sheet; sphere bottom at 460 clears the sheet top at 468 | 52.80 sheet **poured from the sphere base**: a 96×8 glass pill at (195,468) widens to 390 (`emit`) and extends to 844 (`soft`), 520 ms; fill `glass-fill`, blur 24, top radius 32, top hairline. 53.10 contents at 70 ms: grabber 36×5 ink4 at 478 · title "Keep NVDA watched." (serif 28/32) at 500 · body "Back up your theses and XP so they survive a new phone." (Geist 15/21 ink2) 540–582 · **Sign in with Apple** (white `#FFFFFF`, black text + logo, 50 tall, radius 25, full width 350) 610–660 · **Continue with Google** (`#131314` fill, 1 px `#8E918F` border, multicolour G, ivory text, same size) 672–722 · **"Not now"** (Geist 15 ink2, 44 tall) 734–778. Content ends at ≤ 798. 55.60 ghost taps "Not now" | 55.70 the sheet drains back into the sphere base (500; gulp +2%). 56.30 tag "SAVED ON THIS DEVICE" (Geist Mono 11 ink2) under the ghost satellite at y 238 for 2.0 s (text roll in and out) | No guilt copy anywhere | The sheet title, then "Not now" |
| **O8 Isla grew a piece** 57.40–62.20 | 57.60 auto-rotate +0.7 rad (a peek, not a full face; `glide`); rim tint 56% of the way to `#7BC8F0`. 59.80 spring back to Desk on `emit` (≈6.7% overshoot: "there's more over there") | 57.60 Isla glyph rides in 35% from the right edge. 58.10 seed (10 px ivory drop with a teal rim) drops onto the island with a 6 px bounce (`emit`), light tick; RING: segment 1 of 16 lights ivory at 12 o'clock. 58.20 caption "Your island got its first seed." (serif 26 at 512) + "It grows when this read closes tomorrow." (Geist 15/21 ink2 at 553). 60.30 meridian dots appear **for the first time**, only for faces that hold something: Desk · Isla · Squad · Theses (4 dots, Record absent), each born from the rim, 200 ms apart. 61.30 one ghost swipe hint: 40 px drag, the sphere follows 1:1 (0.37 rad), below threshold → snaps back | 59.80 caption inhaled | as listed | The seed |
| **O9 Home** 62.20–65.80 | Idle with the ghost satellite | 62.20 greeting exhaled: "Good evening." / "I'm watching NVDA for you." 62.60 eyebrow + chips born from the pill: "What would make it a yes?" · "Compare with AMD" · "What if earnings miss?". 63.00 hint row, first time ever: "HOLD TO ASK · SWIPE THE SPHERE" | 65.40 dim to black (400) → restart at O0 | as listed | Sphere |

**Returning users** never replay the birth. The core file's B0 wake (0.9 s) is the returning open. If the app was killed mid-onboarding, it resumes at the last unfinished beat.

---

## 7. Fine-details checklist (each is verifiable in code or on a frame)

1. GLSL has no `time × state` product and no `% 1000`. The phases (`uTwist`, `uFlow`, `uDrift`, `uRot`) are integrated in JS.
2. The specular core stays at (−0.36, 0.46) ±0.06 while faces rotate (compare 35.2 s and 35.95 s).
3. In-shader dither on the interior and the halo, plus 3.5% overlay grain at z-index 1. No banding in the idle halo at 200% zoom.
4. The ambient background centre tracks the sphere cy (`--sy`) every frame. The ground pool fades out as cy drops below 330.
5. No CSS `transition` on `transform` anywhere. Every positional motion uses one of the 9 named springs, and the sphere mass is r/122.
6. A 120 ms anticipation (−6 px, −2% r) precedes every sphere move over 80 px (12.60, 16.60, 34.00).
7. One breath clock drives the sphere, pill glow (antiphase), NOW pulse (B/2), satellite drift (2B) and orbit crawl (4B).
8. Text is never transform-scaled at rest. The verdict font-size is `round(.62r)` (45 px at r72, 27 px at r44). "64%" never shrinks below 11 px.
9. Odometer digit rolls (22 ms/digit, 280 ms) on satellite values and "64%". Only changed digits roll.
10. Every label swap is a 160 ms text roll (old: y −8 and fade; new: from +8 on `snap`, 40 ms later). Face titles slide 12 px in the swipe direction.
11. Every tappable presses to .96 (pill .94) on `snap` and releases on `emit`, with a matching visual haptic tick.
12. Captions use a 3-word pulse-sweep front. Unlit words sit at .16 opacity, 2.5 px blur, +2 px y. The current word is `#FFF8EC` and settles to ink. Timing comes from the word table, and visuals lead by 30 ms.
13. Transcript words arrive at irregular speech intervals (not a metronome). The tail word is ink2 until final.
14. The pill widens on `pill`. The 22 bars use `transform:scaleY` (never `height`), grow centre-out at 8 ms, and collapse edges-in on the same frame as the finger lift. Three goo blobs are visible inside the held pill.
15. The question is sent as a bead into the bottom rim (dimple → gulp +3% → ripple ring). It never flies 470 px across the glass.
16. The docked question types into the header at 10 ms/char after the wordmark fades. The × is a 44×44 target.
17. Agent tethers are 0.5 px at 35% of the agent hue, running from the label dot to the rim at −140°, −40° and +90°. Each current enters from its tether angle and retracts at convergence.
18. Duel crossings tighten from ≈1.9 s to ≈1.2 s. Each crossing throws a spark (exposure +.12 for 90 ms + a 2 px rim tick).
19. The nodes meet at the centre on exactly the frame `uSep` = 0. The shockwave reaches 1.05r in 180 ms and is followed by a 180 ms hush.
20. Amber never floods the glass before IMPACT 2. Before it, the glass is pearl `#E8DFD0` plus one amber filament at .8r.
21. Satellites are invisible while inside the rim, push a meniscus bulge, fling clockwise UL→UR→LR→LL at a 70 ms stagger, keep ≥16 px clearance to the glass and ≥18 px to the frame edge, and carry the citing agent's dot (left mint, right coral).
22. At the verdict the satellites retract into the sphere in reverse order, so the ring never shares space with pills.
23. The comet's arc-length velocity is continuous (no stall where the lead meets the line). The head becomes the NOW dot. The lead is gone 400 ms after the line starts. No label touches the earnings line (≥6 px gap).
24. Chart marks arrive in order after the line: band wipe, label, earnings line with the coral cap, area. The "+6.40" bracket lights on the word "six".
25. "Wait" condenses 30 ms before the spoken "wait", and the caption word turns amber on the same frame. The ring starts 250 ms later, fills 0→64% in 1100 ms with no overshoot, and has a head dot and a landing flash. The digits count in sync.
26. Verdict word contrast against the scrimmed core is ≥12:1 (target 15.7:1 on `#2A1C08`).
27. The pull works from anywhere in 98–700. The rubber-band uses c=.55 and d=260. Commit happens at 72 px or 500 px/s. The sphere teardrops and gulps back. The chart is inhaled right→left.
28. Cards are revealed by a clip-path from the bottom rim, with no scale on text in flight. The track follows 1:1 and moves one card per swipe. Peeks are 20 px; inactive neighbours sit at .94 and .6.
29. Saving runs: press → label roll → one amber conic border sweep (500 ms) → XP chip `emit` → the swallow (+4% gulp) → re-emitted as the ghost satellite on Desk.
30. Chips are born from the pill (70 ms), sit in one left-aligned horizontal row with a 24 px right fade mask, are 40 px tall, and sink back into the pill on exit.
31. On return, the cards retract BEFORE the sphere descends. "Wait" evaporates (280), the ring unwinds (350), the flood recedes rim→centre (700) and the tint returns in OKLab (800).
32. Faces: θ = dx/(0.9R), detents at 2π/5, and the return to Desk is exactly 2π. Glyphs ride the surface via sin/cos. Neighbour rim sectors show the adjacent tints. The meridian pill width follows the drag.
33. The tint mix is OKLab: halfway through a pink→teal transition, chroma is ≥ .04 (it never passes through grey).
34. The companion is the real `mira` texture, flood-fill matted (not luminance keyed), and drawn before rim and specular. Silhouette mode while talking; identity mode with the fog pocket on the Squad face and in the picker.
35. The header avatar is the chosen companion thumbnail (118% crop, 32 px, 2 px XP arc).
36. There is no text in 0–54 or 810–844. There is no text under 11 px except the 10 px chart ticks. ink3 is `#8A8378` and is never used on cards.
37. The glow budget holds: halo ≤ .35 and ≤ 1.8r, plus one focal emitter per state. Agent, card and satellite dots are flat.
38. Onboarding opens on a 4 px point at (195,340) that matches the launch screen. The birth overshoots to ≈126 and settles at 120. The rim hardens last, and the specular appears after it.
39. The picker shows 5 companions (bobby, byte, kora, zip, mira). The pill label rolls "Choose <Label>". The belt of 18 beads spirals out of the rim, and the snow reacts to swipe velocity.
40. The agree ring uses the same geometry and stroke as the conviction ring. The early release unwinds in 300 ms with no error copy.
41. The pre-permission card says "Continue" (never "Allow") and has no "Not now". The OS alert follows it.
42. The sign-in sheet is poured from the sphere base. Apple comes first and Google second, at equal size (350×50). "Not now" is a 44 px target. "Saved on this device" follows "Not now".
43. The Isla peek is 0.7 rad with a rubber-band return. Meridian dots appear only for faces with content (no Record dot in onboarding).
44. Reduced motion follows §3.7 exactly: no transition longer than 300 ms, no travel, no comet, no gulps.
45. A `bobby-step` message is posted on every beat, with titles `B<n> · …` / `O<n> · …`. ArrowRight and ArrowLeft seek between beats. Space or a tap (movement < 8 px) pauses at 0.15×, and the pause tag sits at y 806–830.
46. Determinism: a seeded PRNG is used throughout. `?t=<s>&freeze=1` renders the exact frame at t, and `window.nucleo.seek(t)` replays from 0 in fixed 1/120 s steps.

---

## 8. Acceptance criteria (reviewers will enforce)

### A. Build and harness

| # | Criterion |
|---|---|
| A1 | Sources are `nucleo-v2.html` and `nucleo-onboarding.html` in the scratchpad `nucleo-v2/` folder. Each contains the literal token `__COMPANIONS_JSON__` exactly once, in `var COMPANIONS = (function(){ try { return __COMPANIONS_JSON__; } catch(e){ return []; } })();`, and **no base64 anywhere**. `python3 inject.py nucleo-v2.html nucleo-onboarding.html` builds `dist/`. Review is done on the dist files, with `index.html` copied beside them. |
| A2 | Each file is single and self-contained: inline CSS/JS, raw WebGL1, no libraries. The only external request is Google Fonts. No console errors in Chrome or Safari. If `COMPANIONS` is empty, the prototype still runs (companion hidden, avatar shows a monogram). |
| A3 | Harness contract: `parent.postMessage({type:'bobby-step', index, total, title})` on every beat (13 core, 10 onboarding). Keydown on `window`: ArrowRight/ArrowLeft go to the next/previous beat, Space pauses. A tap (<8 px movement) toggles pause at 0.15×. `?t=` / `&freeze=1` / `?rm=1` and `window.nucleo.seek(t)` work. There is no visible Next button (the viewer provides it). |
| A4 | Performance: ≥55 fps in desktop Chrome at DPR 2 through the full loop, with no frame over 50 ms after warm-up. Scissored rendering. Adaptive DPR drop. Rendering throttles on `document.hidden`. |

### B. Layout and legibility (measured on the hero frames below)

| # | Criterion |
|---|---|
| B1 | Stage bands respected: nothing but the halo in 0–54, nothing in 810–844, pill at 742–798, hint row at 720. |
| B2 | Sphere (cy, r) within ±4 px of the §2.3 table at each settled state. The caption is always 32 ±4 px below the lowest visual element. |
| B3 | No overlap between any two text or satellite boxes, including the ring. Satellites clear the glass by ≥16 px and the frame edge by ≥18 px. |
| B4 | Type floor and contrast hold as in §7.36. Verdict word ≥12:1. All body text ≥4.5:1 against its actual surface. |
| B5 | Colour lock: mint, coral and amber appear only on Alpha, Red, CIO and verdict-owned elements. The companion tint is 0 between the send and the return. |

### C. Motion and material

| # | Criterion |
|---|---|
| C1 | Code inspection finds a single spring integrator with the 9 named springs, integrated phases, no `transform` CSS transitions, and no step where every element flips on one frame. |
| C2 | No phase pops: interior motion is continuous across think start and end in loops 1, 2 and 3 (compare loop 1 and loop 3; the swirl entry must look identical). |
| C3 | Every element in §3.6 visibly leaves toward, or arrives from, its declared origin or destination. Nothing fades in place. |
| C4 | The debate reads as three characters. In a still at 9.6 s, a viewer can point to the mint node/current on the left, coral on the right and amber below, each connected to its label. |
| C5 | Material: no near-black bruises in idle, a visible back-face rim and dispersion at the edge, a crisp two-lobe specular, and the companion sits under the highlight. |
| C6 | Reduced motion passes §3.7. |

### D. Content and compliance

| # | Criterion |
|---|---|
| D1 | No "Buy/Sell" verdicts, no trade CTA, no "profit/win/returns/guaranteed". Every read shows "Illustrative read · not financial advice". Conviction is explained as confidence in the read (onboarding). |
| D2 | Sign-in appears only after the first save. Apple first; Google second; equal size; "Not now" is lossless and has no guilt copy. The pre-permission card uses "Continue". There is no ATT prompt. |
| D3 | Only ids and labels from companions.json. No invented roles, personalities, lock states or voices. |

### E. Onboarding specifics

| # | Criterion |
|---|---|
| E1 | The birth plays once at the file start. The picker shows at least 5 companions inside the glass. The hold-to-ask teaching precedes the mic pre-permission. The risk agree is a hold on the pill that fills the sphere ring. The first read has at most 3 satellites. The thesis defaults to 24h with "Watch & ping me". There is one XP reward. Sign-in comes after. The Isla peek includes the seed. The home frame has chips and the first-ever hint. |
| E2 | The AHA ("Wait" condensed) lands at ≤ 44.0 s in the scripted run. |

### Hero frames (captured with `?t=…&freeze=1`)

- **Core:** 2.0 idle (App Store hero) · 4.6 listening · 9.6 duel · 12.4 pearl + filament · 14.8 satellites · 20.2 chart + bracket · 23.9 verdict · 27.95 thesis card · 29.3 saved + XP · 32.0 chips · 35.95 Isla · 37.15 Squad · 38.35 Record · 39.55 Theses · 41.5 home with ghost satellite.
- **Onboarding:** 1.4 birth · 2.6 born · 5.9 trailer · 9.8 Byte · 13.8 Mira · 19.8 mic card · 21.4 OS alert · 24.3 listening · 28.8 risk lines · 29.4 ring filling · 33.8 debate · 38.0 satellites · 42.0 chart · 44.3 verdict (AHA) · 49.0 watching + XP · 54.2 sign-in sheet · 58.8 seed · 64.0 home.

---

## Appendix A — Rulings on critic conflicts

| Conflict | Ruling | Why |
|---|---|---|
| Size ladder: v1 (244/264/256/168/128) vs the composition stage map | Stage map (§2.3). Size still carries state (idle 120 → presenting 44). | Fixes the 260 px void, the margin breaches and the ring/pill overlap; keeps v1's "size shows importance" idea. |
| Satellites stay through the verdict (v1) vs retract | They retract into the sphere just before IMPACT 2 ("the evidence feeds the verdict"). | Removes the ring/pill collision and gives the impact a cause. |
| Amber at the end of think (motion) vs earned at the verdict (craft/composition) | Think ends in a **pearl** braid with a single amber filament; amber floods only at IMPACT 2. | Keeps the double-impact drama and the tease without spoiling the reveal. |
| Verdict retime (650 ms tracking gather) vs "do not retime" v1 (1.2 s blur/scale) | Hybrid: blur 14→0 and scale 1.25→1 (v1 character) plus tracking gather, 900 ms. Ring +250 ms (as v1), 1100 ms. Timed to the spoken word. | Keeps the loved focus-pull while giving it a cause and a sync point. |
| Karaoke unlit words: v1 .14 / 3 px (keep) vs hidden (craft) | Keep the pre-echo at .16 / 2.5 px / +2 px with a 3-word front, timed to speech. | Anthony loved it, and 3 of 4 critics kept it; the refinement makes it read as intentional. |
| Rigid glass (craft) vs meniscus/ripples (motion) | "Liquid glass": rigid at rest, global deformation ≤1.2%, local deformation ≤3% only at exchange points. | Keeps the material promise and the birth/return physics. |
| Specular moving with tilt (craft) vs fixed (motion) | Fixed light plus ±0.06 parallax from pointer/tilt only; never from face rotation. | Real glass behaviour, with a hint of life. |
| Companion key: luminance (critics) | Border flood-fill matte + fog pocket (§4.3). | Tested: a luminance key deletes 8 black-bodied companions. |
| Faces: DOM arcs (composition) vs shader neighbour tint (motion) | Shader rim sectors. | Inside the glass, and cheaper. |
| Isla "real render" | Filled SVG island glyph + a 16-segment growth ring. | No island art is available to a self-contained prototype; no hairline clip-art. |
| Squad belt placement | Top arc at r+34. | Avoids the meridian dots at the bottom arc and uses the empty space above the sphere. |
| Sign-in as the next card (motion) vs a sheet | A sheet, poured from the sphere base; onboarding only (the daily loop assumes the user is signed in). | Clearer consent, HIG-legible, still born from the sphere. |
| Save: swallowed (motion) vs parked satellite (onboarding) | Both: swallowed with a gulp, then re-emitted at idle as a ghost satellite. | "Bobby took it in" plus "Bobby is watching". |
| Risk before ask (onboarding critic) vs task order (ask → risk) | Task order, as a just-in-time notice while the first question waits inside the glass. | The hold was just learned and is reused; the notice is shown at the moment it matters. |
| Locked companions / roles / voice lines | Not shown. | Not in the data; never invent identifiers. |
| Glow on cards and dots | All flat. | Glow budget. |
| Tap = complete line (product) vs tap = pause (harness) | In the prototype, tap = pause. The product behaviour is noted only. | Harness contract. |

## Appendix B — Build notes

- Architecture: one state machine with named, interruptible transitions (wake→idle, idle→listen, listen→think, think→talk, talk→verdict, verdict→present, present→idle, idle↔face, face→face), driven by a scripted event track (touch, word, stance, cioResult, verdict, save, swipe). This mirrors the production stream: the duel loops until the result event arrives, with a minimum of 1.5 s.
- The ghost finger is a 28 px ring (1 px ivory 60%, no fill) with a 6 px centre dot at 80%. When pressed it scales to .84 with a 12% fill. It sits exactly on its target and moves before the UI responds.
- SHOULD, live input: dragging on the sphere in idle or faces rotates faces for real, and dragging in presenting moves the card track. The demo resumes 4 s after the last input.
- Accessibility semantics: the sphere is `role=img` with a live `aria-label` per state ("Bobby is listening", "Three agents debating", "Verdict: Wait, 64% conviction"). The captions `aria-live=polite` region receives whole sentences. The pill is a `<button aria-label="Ask Bobby, hold to talk">`. Chips and card actions are real `<button>`s.
