# GLASS — idle material art direction (Núcleo v2 + onboarding)

**Winner: C · "Deep core".** A deep, luminous body of light (pink core → violet → royal blue → cyan at the lower shell) sits *inside* a clear glass shell with a thin, bright Fresnel line. Two slow iridescent currents drift through it. The approved soul stays: the same iridescent palette, inner currents, rim light, the fixed two-lobe specular, and the breathing geometry. What goes is the full-ball marbling (teal/maroon/violet blotches painted on the surface) and the milky wash.

It is a shader-only change: 4 hunks in `nucleo-v2.html` and 3 in `.src-onb/p2.js`. There are no new uniforms, no JS changes and no new noise evaluations. The cost is the same as today (within measurement noise).

Measured inside the glass (0.9 r disc, idle 2.0 s):

| | OKLab chroma | "mud" share (L .30–.75, C < .06) | median L |
|---|---|---|---|
| Current | 0.048 | **83 %** | 0.52 |
| C | 0.103 | **2 %** | 0.51 |

Same brightness, twice the chroma, and the grey mid-tones are gone.

---

## 1. Why the current idle reads as a "marbled planet"

In `nucleo-v2.html` (and the same lines in `.src-onb/p2.js`):

1. **The pattern sits on the surface.** The noise is sampled at `n = vec3(q*(1+.45(1−z)), .9z)`. That is the surface normal, stretched toward the limb, so the fbm wraps the ball like continents on a globe.
2. **Hue follows the fbm across the whole wheel.** `irid(f2*1.4 + …)` crosses blue → violet → pink → cyan in every blotch, and brightness comes from the same `f2`. So the dim areas are dark versions of pink (maroon) and cyan (murky teal).
3. **The ball is filled to the rim.** A density floor of `.18`, plus `ir*0.12` everywhere, plus a `.12` wash toward the pale companion tint (`#B8C2D3` for Mira) lifts everything into pastel.
4. **The rim is a wide, milky limb.** `rimC*pow(1−z,2.4)*.75` is a broad atmosphere-like band, and the back-face rim at `.9` is wide (×14).
5. **Limb darkening.** `col *= .70 + .30z` darkens toward the edge, which is the classic planet cue. It also dims the rim light by 30 %.

## 2. Reference read (AmazingUI "Sphere" still)

A thin, bright double rim (outer line plus inner thickness line) and a clear zone just inside it. A soft, deep, *saturated* body of light: a warm pink core left of centre, violet around it, royal blue to the right, and a bright cyan crescent at the bottom. One or two long curved refraction lines. There are no grey mid-tones: every pixel is either saturated colour or clean white highlight.

## 3. Candidates (lab: `glass-lab.html`)

All three share the "glass" hunks: a thin Fresnel line, a thinner back-face rim, the Fresnel line exempt from limb darkening, and the tint wash kept off the clear shell. Each differs only in the interior block.

| id | Name | Interior change |
|---|---|---|
| v0 | Current | as shipped |
| A | Clear shell | Same marbled field, faded to clear glass toward the rim (`body` mask plus ambient behind the shell). This tests depth alone. |
| B | Clean nebula | Keeps the full-ball fbm, but hue follows light (dim = deep blue, bright = pink), with a contrast curve, a warm centre of mass and saturation ×1.45. |
| C | Deep core | A smooth luminous core under the light, the fbm reduced to soft wisps (±22 %), two slow currents (curved refraction arcs), saturation ×1.45, and a clear shell. |

### Rubric (1–5; measured where possible)

| Criterion | v0 | A | B | C |
|---|---|---|---|---|
| Clarity of glass (clear shell, thin bright rim, depth) | 1 | 3 | 4 | **5** |
| Luminosity (a lit body, not a lit fog) | 3 | 2 | 2 | **5** |
| Colour cleanliness (chroma / mud, idle) | 1 (.048 / 83 %) | 1 (.045 / 84 %) | 4 (.095 / 2 %) | **5 (.103 / 2 %)** |
| Continuity with v1's soul (iridescent inner currents, rim, spec, breath) | 5 | 5 | 4 | 4 |
| Legibility later (duel mud share; companion) | 2 (81 %) | 2 (76 %) | 4 (43 %) | **5 (28 %)** |
| **Total** | 12 | 13 | 18 | **24** |

- **A** proves depth alone is not enough: it is still a planet, just behind glass.
- **B** fixes the colour but reads as a "purple storm nebula": the texture still fills the ball, and the body is dim (median L .41).
- **C** is the only one that matches the reference's anatomy (shell, then body, then core, then currents). It also gives the debate the cleanest indigo stage.
- **Soul dial:** in C, `0.45*(smoothstep(.2,.8,f2)−.5)` controls how much of v1's drifting nebula shows through. At 0.30 it looks like silk; at 0.60 it looks like smoke, and still has only 2 % mud. I shipped 0.45.

## 4. The diff (winner C)

Apply all hunks of a file together: `body` and `frT` are declared in one hunk and used in the next. The line numbers below are the first line of each "Before" block in the current sources. `node .glass/build.mjs` checks that every "Before" block still matches the sources verbatim, and it compile-checks both shaders in the lab.

### 4.1 `nucleo-v2.html`

**Hunk 1: interior (line 620).** `f1` and `f2` on lines 618–619 are unchanged. `dens` is unchanged too, because the braid and flood still read it.

Before:
```js
'  vec3 ir = irid(f2*1.4 + 0.08*sin(ang) + uIridPh);',
'  float dens = mix(0.18, 1.0, smoothstep(0.22, 0.78, f2));',
'  vec3 col = vec3(0.012) + ir*dens*(0.62 + 0.55*uEnergy)*uIrid + ir*0.12*(0.6 + 0.4*z);',
```
After:
```js
'  float dens = mix(0.18, 1.0, smoothstep(0.22, 0.78, f2));',
'  float calm = smoothstep(0.4, 1.0, uIrid);',
'  float body = 1.0 - smoothstep(0.50, 0.98, rr);',
'  vec3 cq = vec3(pp, z) - vec3(-0.30, 0.18, 0.80) - 0.20*vec3(f1 - 0.5, f2 - 0.5, 0.0);',
'  float core = exp(-dot(cq, cq)*2.0);',
'  vec3 sn = vec3(q, z); sn.xz = rot(uRot)*sn.xz;',
'  float w1 = dot(sn, normalize(vec3(0.95, 0.18 + 0.25*sin(uDrift*0.37), 0.30))) + 0.08*(f1 - 0.5);',
'  float w2 = dot(sn, normalize(vec3(0.45, -0.55, 0.70))) - 0.52 + 0.10*(f1 - 0.5);',
'  float cur = (exp(-sq(w1/0.011)) + 0.20*exp(-sq(w1/0.06)) + 0.55*exp(-sq(w2/0.022)) + 0.25*exp(-sq(w2/0.08)))*(0.30 + 0.90*smoothstep(0.38, 0.62, f1))*body*calm;',
'  float fold = smoothstep(0.0, 0.20, w1)*exp(-max(w1, 0.0)*5.0);',
'  vec3 ir = irid((0.50*core - 0.24*smoothstep(0.0, 0.9, -sn.y)*(1.0 - core))*calm + 0.13*(f2 - 0.5) + 0.04*sin(6.2831853*uIridPh));',
'  ir = max(mix(vec3(dot(ir, vec3(0.299,0.587,0.114))), ir, 1.45), 0.0);',
'  vec3 col = ir*(0.60 + 1.05*core + 0.35*fold + 0.45*(smoothstep(0.2, 0.8, f2) - 0.5))*(0.62 + 0.55*uEnergy)*uIrid*mix(0.05, 1.0, body)',
'           + irid(0.62 + 0.4*core)*cur*0.55 + uAmb*(1.0 - body) + vec3(0.012);',
```
The listening line that follows (`col += vec3(0.36,0.88,1.0)*uListenIr*…`) is unchanged.

**Hunk 2: tint wash (line 624).** The wash stays inside the body, so the clear shell is never milked.

Before:
```js
'  col = mix(col, uTint*(0.10 + 0.55*dens), uTintWash);',
```
After:
```js
'  col = mix(col, uTint*(0.10 + 0.55*dens), uTintWash*body);',
```

**Hunk 3: Fresnel and back-face rim (line 716).** The line becomes thin and bright, and the back-face rim becomes a thin thickness line. `fr` (exponent 2.4) is kept for dispersion, neighbour sectors and the companion `(1−fr)` fade.

Before:
```js
'  col += rimC*fr*0.75*(1.0 + uRimBoost);',
'  col += rimC*0.18*exp(-sq((rr - 0.9)*14.0));',
```
After:
```js
'  float frT = pow(1.0 - z, 8.0);',
'  col += rimC*(frT*1.8 + fr*0.06)*(1.0 + uRimBoost);',
'  col += rimC*0.14*exp(-sq((rr - 0.93)*40.0));',
```

**Hunk 4: finish (line 737).** The Fresnel line is reflected light, so interior absorption (limb darkening) must not dim it.

Before:
```js
'  col *= 0.70 + 0.30*z;',
```
After:
```js
'  col *= mix(0.70 + 0.30*z, 1.0, frT);',
```
Rebuild with `python3 inject.py nucleo-v2.html`.

### 4.2 `.src-onb/p2.js` (onboarding copy of the shader, packed uniforms)

The mapping from v2 names to onboarding names: energy is `uL.x`, irid is `uL.w`, drift is `uPh.w`, iridPh is `uPh2.y`, rot (+ face θ) is `uPh2.x`, ambient is `uAm.rgb`, tint is `uTi.rgb`, wash is `uCb.w`, rim hardness is `rh = uB.y…`, and `gs(x) = exp(−x²)` is used in place of `exp(-sq())`.

**Hunk 1: interior (line 96).** The birth mask `bm` is kept. `body` is held at 1 until the glass hardens (`uB.y`), so the light fills the ball during the birth and the shell *clears as the rim appears*. That is "the glass hardens" (§4.4 birth).

Before:
```js
'  vec3 ir = irid(f2*1.4 + 0.08*sin(ang)*smoothstep(0.0, 0.35, rr) + uPh2.y);',
'  ir = mix(ir, uTi.rgb, uCb.w);',
'  float bf = uB.x*1.4;',
'  float bm = 1.0 - smoothstep(bf - 0.35, bf - 0.05, rr);',
'  float dens = mix(0.18, 1.0, smoothstep(0.22, 0.78, f2))*bm;',
'  vec3 col = vec3(0.012) + ir*dens*(0.62 + 0.55*uL.x)*uL.w + ir*0.12*(0.6 + 0.4*z)*bm*mix(0.5, 1.0, uL.w);',
```
After:
```js
'  float bf = uB.x*1.4;',
'  float bm = 1.0 - smoothstep(bf - 0.35, bf - 0.05, rr);',
'  float dens = mix(0.18, 1.0, smoothstep(0.22, 0.78, f2))*bm;',
'  float calm = smoothstep(0.4, 1.0, uL.w);',
'  float body = mix(1.0, 1.0 - smoothstep(0.50, 0.98, rr), clamp(uB.y, 0.0, 1.0));',
'  vec3 cq = vec3(pp, z) - vec3(-0.30, 0.18, 0.80) - 0.20*vec3(f1 - 0.5, f2 - 0.5, 0.0);',
'  float core = exp(-dot(cq, cq)*2.0);',
'  vec3 sn = vec3(q, z); sn.xz = rot(uPh2.x)*sn.xz;',
'  float w1 = dot(sn, normalize(vec3(0.95, 0.18 + 0.25*sin(uPh.w*0.37), 0.30))) + 0.08*(f1 - 0.5);',
'  float w2 = dot(sn, normalize(vec3(0.45, -0.55, 0.70))) - 0.52 + 0.10*(f1 - 0.5);',
'  float cur = (gs(w1/0.011) + 0.20*gs(w1/0.06) + 0.55*gs(w2/0.022) + 0.25*gs(w2/0.08))*(0.30 + 0.90*smoothstep(0.38, 0.62, f1))*body*calm*bm;',
'  float fold = smoothstep(0.0, 0.20, w1)*exp(-max(w1, 0.0)*5.0);',
'  vec3 ir = irid((0.50*core - 0.24*smoothstep(0.0, 0.9, -sn.y)*(1.0 - core))*calm + 0.13*(f2 - 0.5) + 0.04*sin(6.2831853*uPh2.y));',
'  ir = max(mix(vec3(dot(ir, vec3(0.299,0.587,0.114))), ir, 1.45), 0.0);',
'  ir = mix(ir, uTi.rgb, uCb.w*body);',
'  vec3 col = ir*(0.60 + 1.05*core + 0.35*fold + 0.45*(smoothstep(0.2, 0.8, f2) - 0.5))*(0.62 + 0.55*uL.x)*uL.w*mix(0.05, 1.0, body)*bm',
'           + irid(0.62 + 0.4*core)*cur*0.55 + uAm.rgb*(1.0 - body*bm) + vec3(0.012);',
```

**Hunk 2: rim (line 165).**

Before:
```js
'  col += rimC*fr*0.75*rh;',
'  col += rimC*0.18*gs((rr - 0.9)*14.0)*rh;',
```
After:
```js
'  float frT = pow(1.0 - z, 8.0);',
'  col += rimC*(frT*1.8 + fr*0.06)*rh;',
'  col += rimC*0.14*gs((rr - 0.93)*40.0)*rh;',
```

**Hunk 3: finish (line 182).**

Before:
```js
'  col *= 0.70 + 0.30*z;',
```
After:
```js
'  col *= mix(0.70 + 0.30*z, 1.0, frT*clamp(rh, 0.0, 1.0));',
```
Rebuild with `sh .src-onb/mk.sh`.

### 4.3 Uniforms and JS

Nothing changes: no new uniforms, no new springs, and no change to idle targets (energy .35, irid 1, glow, tint .35 / wash .12).

C derives one new internal gate from an existing state: `calm = smoothstep(.4, 1, uIrid)`. It is 1 in idle, listening and faces, and 0 once thinking drops irid to .35. It turns off the pink core hue, the cyan lower shell and the idle currents during the debate, pearl, talking and verdict.

The GLSL still has no `time × state` product. `sin(uDrift*.37)` and `sin(2π·uIridPh)` are phases times constants, and both are continuous: v2 wraps iridPh mod 1, and the onboarding never wraps it.

### 4.4 Tunables (safe ranges)

| Constant | Value | Range | Effect |
|---|---|---|---|
| `body` smoothstep start | .50 | .45–.55 | Width of the clear shell |
| core centre / falloff | (−.30, .18, .80) / 2.0 | falloff 1.6–2.6 | Core sits under the fixed light; higher = smaller core |
| saturation re-boost | 1.45 | 1.3–1.6 | Above 1.6 the core goes neon magenta |
| wisps (soul dial) | .45 | .30 silk – .60 smoke | How much v1 nebula shows |
| currents gain / widths | .55 / .011, .022 | .4–.7 | The two refraction currents |
| Fresnel line | pow 8, ×1.8 | pow 6–10 | Thickness of the bright rim |
| back-face rim | .14 @ .93, ×40 | .12–.18 | Glass thickness line (C5 "visible back-face rim") |

## 5. Other states (checked in the lab and in patched preview builds of both prototypes)

Preview builds (sources untouched): `.glass/preview/nucleo-v2.html` and `.glass/preview/nucleo-onboarding.html`, served at `http://localhost:4612/.glass/preview/…?t=…&freeze=1`.

| State / hero frame | Result |
|---|---|
| Idle 2.0 (App Store hero), 41.5 home, onboarding 2.6 / 64.0 | Clear shell, thin rim, luminous core under the specular, cyan lower shell, two currents. Stable over time (checked at +15 / +40 / +80 s). The core is pinned to screen space, so it never rotates to the back. |
| Listening 4.6 / onb 24.3 | `listen` cyan still blooms from the bottom; the ripple is untouched. |
| Duel 9.6 / onb 5.9 trailer, 33.8 | Mint, coral and amber sit on a clean deep-indigo stage (mud 28 % vs 81 %). Nothing pink competes with the coral; the idle currents are off. C4 is still readable in a still. |
| Pearl + filament 12.4 | The pearl braid and the amber filament at .8r are clearer on indigo. There is no amber before IMPACT 2. |
| Talking (silhouette) 16.8 / 20.2 | Mira's silhouette has more contrast (indigo behind her instead of teal). |
| Verdict 23.9 | Amber flood and scrim are unchanged. Verdict word contrast over its whole box: **12.6:1 mean, 7.0:1 p95** (v0: 10.6 / 4.7). |
| Isla 35.95 / Squad 37.15 / Theses 39.55 | Rim tint .35 and neighbour sectors are unchanged. The Squad fog pocket isolates Mira; her identity reads better against the violet ring. |
| Record 38.35 | "63%" is **8.6:1 mean, 6.0:1 p95** (v0: 10.4 / 6.5). It is still well above 4.5:1. The pink core under the .6 scrim is the small cost. |
| Onboarding birth 1.4 → 2.6 | The light fills centre-out (birth mask unchanged). The shell clears only while the rim hardens (1.6–2.2 s), then the specular appears. |
| Picker 9.8 Byte / 13.8 Mira | Black-bodied Byte and Mira both read well inside the fog pocket, and the snow is visible. |
| Reduced motion `?rm=1` | Idle is static and clean. The duel's static sector bands (mint / coral / amber) read on indigo. |
| C5 "no near-black bruises" | The darkest 1 % inside 0.8r has OKLab L .30–.34, the same as v0 (.31–.33). |

## 6. Performance

The change adds no noise evaluations: still 2 fbm (8 value-noise) in idle, and the debate path is unchanged. It adds about 35 ALU ops per interior pixel: 1 extra `irid()`, 6 `exp`, 2 `normalize`, 1 `rot`, and a few smoothsteps.

Lab bench (2400², sphere r = 630 px backing, 200 draws synchronised with readPixels, desktop Chrome): v0 0.106–0.121 ms, C 0.110–0.124 ms per draw. That is about +3 %, which is within run-to-run noise.

iOS: WebGL1-safe. No loops were added, there are no dynamic branches, and all exponents are bounded. Under the mediump fallback, `sin(uDrift*.37)` loses precision after hours, the same as the existing `uDrift` noise offsets.

## 7. Proposed DIRECTION.md edits (not applied)

- **§2.1 iridescence row:** "Idle interior and halo. Saturation ×0.8 relative to v1." becomes "Halo and rim edge ×0.8 relative to v1. The idle interior re-saturates ×1.45 over `irid()` (≈ ×1.16 vs v1): it is now a deep body framed by clear glass, not a full-ball fill. The core hue is gated off in thinking (`calm`)."
- **§4.2 Interior:** replace the two bullets with: "Body `= 1 − smoothstep(.50,.98,ρ)` (the shell is clear glass showing `uAmb`). Luminous core `exp(−|(pp,z) − (−.30,.18,.80) − .2(f1−.5, f2−.5, 0)|²·2)` under the fixed light. Hue `irid((.5·core − .24·lower·(1−core))·calm + .13(f2−.5) + .04 sin 2π·iridPh)`. Brightness `.60 + 1.05core + .35fold + .45(smoothstep(.2,.8,f2)−.5)`. Two currents (refraction arcs) × calm. `dens` is unchanged, because the braid and flood read it."
- **§4.2 Thickness:** back-face rim becomes `rimC·0.14·exp(−((ρ−0.93)·40)²)`.
- **§4.2 Fresnel:** `frT = (1−z)^8; col += rimC·(1.8 frT + 0.06 fr)`. `fr = (1−z)^2.4` still drives dispersion, neighbour sectors and the companion fade.
- **§4.2 Finish:** limb darkening becomes `col *= mix(0.70 + 0.30z, 1, frT)`.
- **§4.4 Birth:** add "the shell clears as the rim hardens (`body` held at 1 until `uB.y`)".

## 8. Before → after, and open questions

- **Before:** a pastel marbled planet. Teal / maroon / violet continents fill the ball to its limb, with a milky atmosphere band and a dimmed rim.
- **After:** a glass ball. A thin bright rim with a thin thickness line, clear dark glass just inside it, and a soft, deep, saturated body of light. Two slow iridescent currents drift through it and the specular sits over it. In the debate it becomes a calm indigo stage that lets the three agents own the colour.

Open questions:

- **Faces tint the interior less than before.** The old milky wash made Isla and Theses read tinted, but that was the same mechanism that caused the pastel. Identity is still carried by the rim tint .35, the neighbour sectors, the ≤ .12 wash inside the body, and the glyphs. If Anthony wants more face colour inside, the cleanest lever is a core-hue mix `ir = mix(ir, uTint, uTintWash·2·core)` (not applied).
- **Onboarding verdict contrast is pre-existing and not introduced here.** The onboarding flood is paler than v2's. The "Wait" box measures 6.6:1 mean in the current build and 7.3:1 with C, both under the 12:1 criterion that v2 meets. That is worth a separate look at the onboarding flood (`uV.rgb*(0.16 + dens*0.72) + col*0.22`).
- **Token deviation.** The ×1.45 interior saturation contradicts the §2.1 "×0.8" note. It is deliberate: that note is the source of the pastel look. It needs a yes from Anthony when he tries it on the iPhone.

## 9. Files

- `glass-lab.html`: the standalone lab. It shows v0, A, B and C side by side, captures real uniform states live from `dist/nucleo-v2.html`, uses the real Mira matte, shows live chroma and mud metrics per cell, compile-checks the onboarding patches, and has a bench button.
  - `?v=v0,A,B,C&s=idle` shows the four variants on idle.
  - `s=all` (or any of `idle,listen,duel,pearl,talk,verdict,isla,squad,record,theses`) picks states, and `idle+40` adds drift time.
  - `r=` sets the radius, `anim=1` turns breathing on, and `dpr=2` forces the backing scale.
- `.glass/variants.mjs`: the patches as exact before/after strings (single source for the lab, the previews and this diff).
- `.glass/build.mjs`: rebuilds the lab, verifies every patch against both sources, and with `--preview=C` writes the patched preview builds and with `--diff=C` writes the source snippets.
- `.glass/preview/`: patched, injected copies of both prototypes, for review on a phone.
