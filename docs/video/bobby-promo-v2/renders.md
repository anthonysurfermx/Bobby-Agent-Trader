# Render log — bobby-promo-v2 (v3 script)

Balance at start of the day: 3,024.05 credits (ultra). Every render preflighted with get_cost.

## Storyboard round 1 — 2026-09-03 · nano_banana_pro 2k 9:16 · 2 cr each · 12 cr

Prompts: `storyboard-prompts.md`. Files: `storyboard/f1..f6.png`, contact `storyboard/contact-r1.jpg`, zooms `storyboard/zooms-r1.jpg`.

| # | Job | Result |
|---|---|---|
| 1 | 3e427cb2 | PASS. She walks toward camera pulling the phone out, golden hour, jacarandas. |
| 2 | a6555611 | PASS. Head down, grey chat, "¿Qué pasó con NVIDIA?" exact, grey lorem answer unrolling. |
| 3 | 9378b1cd | FAIL. Headline exact and crowd posture right, but the model read "grey faces" as surgical face masks: the whole crowd is masked (pandemic look). Redo with explicit "no masks". |
| 4 | 579b1b01 | FAIL. Head up and green light on her face are right, but the phone shows its BACK to camera, so the real Bobby screen is not visible. Redo over the shoulder with the screen toward camera. |
| 5 | a6627171 | PARTIAL. Headline, frozen grey card, chips ENTRAR / ESPERAR / NO HAY TRADE + 18:32 timestamp all correct. Byte lost its hoodie and reads as a green astronaut with a helmet. Redo pinning the hoodie / shorts / sneakers. |
| 6 | bcc18368 | PASS. Lockup "Bobby" / pill "Únete a la lista de espera" / "bobbyprotocol.xyz/app" exact; she walks away, Byte translucent one step behind. |

Lesson: with nano_banana_pro, "faces lit grey" → masks; say "faces bare, no masks, lit from below by the screen". Element refs keep identity of humans and locations very well (char_cdmx is the same woman in all 6). A stylised mascot element drifts toward a generic figure unless its costume is spelled out again in the prompt.

## Storyboard round 2 — 2026-09-03 · frames 3, 4, 5 · 6 cr

| # | Job | Result |
|---|---|---|
| 3 | 5ff5ad14 | PASS. No masks, bare faces lit grey from below, she is the only head up, "ChatGPT te responde." exact. `storyboard/f3-r2.png` |
| 4 | 4014a780 | PASS. Over-the-shoulder, Bobby screen toward camera (dark UI, green robot, mic), she speaks head up, green light on her face. `storyboard/f4-r2.png` |
| 5 | 38824c1b | PASS. Byte keeps hoodie/shorts/sneakers as a translucent green spirit, hand raised, grey card dissolving, chips ENTRAR / ESPERAR (lit) / NO HAY TRADE + 18:35. Minor: she looks down at the phone instead of at Byte. `storyboard/f5-r2.png` |

Review sheet: `storyboard/review-r2.jpg`. Technique validated; the Spanish set is now superseded by the decisions below.

## Decisions 2026-09-03 (Anthony, after seeing rounds 1–2)
- Audience is English: all on-screen text and both voice lines in EN.
- Two formats: 9:16 Instagram, 16:9 Twitter/X + LinkedIn (restage after the 9:16 set is approved).
- Protagonist younger: same face as char_cdmx, ~21. Reference sheet job de5f779a (2 cr) → Element `char_cdmx_young` 60ad2f20-1705-4e5c-917d-680ddd8c47aa. `storyboard/char_cdmx_young-sheet.png`, comparison `storyboard/young-vs-original.jpg`.

## Storyboard round 3 — 2026-09-03 · EN, char_cdmx_young · 6 frames · 12 cr

| # | Job | Result |
|---|---|---|
| 1 | 69f27538 | PASS. Young protagonist walking toward camera, phone in hand. `storyboard/en/f1.png` |
| 2 | 4613d884 | PASS. Head down, grey chat, "What happened with NVIDIA?" + grey answer. `storyboard/en/f2.png` |
| 3 | 33e35942 | FAIL. Masks came back despite "NO face masks" (the "lit from below by the screen" phrasing seems to trigger them). Redo without the glow, with "mouth, nose and chin uncovered". |
| 4 | ab0c5258 | FAIL. Screen shows an invented Bobby UI (Android-style robot, "LEARN IN PUBLIC") instead of the referenced screenshot. Redo with "reference placed inside the phone pixel for pixel". |
| 5 | 0f12e35f | PASS. She turns to Byte with a small smile; Byte hoodie spirit, hand raised, grey card dissolving, chips ENTER / WAIT (lit) / NO TRADE; "Bobby checks the market first." exact. `storyboard/en/f5.png` |
| 6 | a10ff424 | PASS. "Bobby" / "Join the waitlist" / "bobbyprotocol.xyz/app" exact; she walks away, Byte behind. `storyboard/en/f6.png` |

Sheets: `storyboard/en/contact-en-r3.jpg`, `storyboard/en/zooms-en-r3.jpg`.

## Storyboard round 4 — 2026-09-03 · EN frames 3 and 4 · 4 cr

| # | Job | Result |
|---|---|---|
| 3 | 01ab6fc6 | PASS. No masks, all heads down, she is the only head up, "ChatGPT answers." exact. `storyboard/en/f3-r4.png`. Fix that worked: drop "lit from below by the screen", say "mouth, nose and chin uncovered, nobody wears a mask, scarf or bandana". |
| 4 | 63897869 | PARTIAL. The screen is now the real Bobby Live Desk (Byte, DESK ONLINE, cards, mic) with "What happened with NVIDIA?" in the input, but the phone is oversized and frontal. `storyboard/en/f4-r4.png` |

## Storyboard round 5 — 2026-09-03 · EN frame 4, natural phone scale · 2 cr

| # | Job | Result |
|---|---|---|
| 4 | beceb211 | PASS. Over-the-shoulder profile, head up speaking, phone at natural scale, real Bobby Live Desk on screen. `storyboard/en/f4-r5.png` |

Anthony's note on frame 3 (round 4): too many people looks fake; max 6, all on the sidewalk.

## Storyboard round 6 — 2026-09-04 · EN frame 3, max 6 people on the sidewalk · 2 cr

| # | Job | Result |
|---|---|---|
| 3 | 63139aa6 | PASS. Five pedestrians + her on the sidewalk at natural spacing, heads down, no masks, street to the right, "ChatGPT answers." exact. `storyboard/en/f3-r5.png` |

## APPROVED 9:16 EN SET — `storyboard/en/final/01..06.png` · contact `final/contact-final-9x16.jpg`

| Frame | Source job |
|---|---|
| 01 | 69f27538 |
| 02 | 4613d884 |
| 03 | 63139aa6 |
| 04 | beceb211 |
| 05 | 0f12e35f |
| 06 | a10ff424 |

Credits spent on this film: 12 + 6 + 2 + 12 + 4 + 2 + 2 = 40 (balance ≈ 2,984).

## Next (needs Anthony's go)
1. 16:9 restage of the six frames (Twitter/X, LinkedIn): ~12 cr.
2. Seedance 2.5 omni_reference 9:16 15 s with the six frames as image references, EN dialogue in the prompt: 720p ≈ 97.5 cr (preflighted), 480p cheaper (verify). Then 16:9 the same way.

## Anthony's frame-by-frame notes on the first approved set (2026-09-04)
1. Body slightly out of proportion (height). 2. Phone is flipped (screen faces camera while she reads it).
3. Good composition but she looks at the sky, not at the people. 4. She must look at the phone while speaking.
5. OK. 6. Byte must face the same direction she walks, so they read as together.

## Storyboard round 7 — 2026-09-04 · EN frames 1, 2, 3, 4, 6 · 10 cr

| # | Job | Result |
|---|---|---|
| 1 | 26db80fb | PASS. Natural proportions, full body, walking with the phone in hand. |
| 2 | f7a518ab | PASS. High-angle over the shoulder, screen faces her, "What happened with NVIDIA?" + grey answer. |
| 3 | 2b0a06ef | PASS. She looks sideways at the people, five others on the sidewalk, no masks, "ChatGPT answers." |
| 4 | 811c0256 | PASS. She looks at the phone while speaking, natural scale, real Bobby screen with the transcript. |
| 6 | b72e056a | PASS. Byte walks beside her, back to camera, same direction; lockup exact. |

**APPROVED 9:16 EN SET v2 (round 7 + frame 5 from round 3)** → `storyboard/en/final/01..06.png`, contact `final/contact-final-9x16.jpg`.
Source jobs: 01 26db80fb · 02 f7a518ab · 03 2b0a06ef · 04 811c0256 · 05 0f12e35f · 06 b72e056a.

Credits spent on this film so far: 40 + 10 = 50 (balance ≈ 2,974).

## Anthony's notes on set v2 (2026-09-04)
1. Body proportion still off and no people. 2. Good, but reads as a different street. 3. Almost: bring back the grey
people, she should look slightly to her left; paving colour must match across frames. 4. Perfect but looks like another
street. 5. Same street as 4, but reads as another place. 6. Her and Byte slightly bigger.
Root cause: location continuity. Fix: pass the approved frame 3 (job 2b0a06ef) as image reference in every frame
("exact same sidewalk, same paving stones, same median, same facades").

## Storyboard round 8 — 2026-09-04 · all 6 EN frames with the street reference · 12 cr

| # | Job | Result |
|---|---|---|
| 1 | ad28b396 | PASS. Natural proportions, four grey pedestrians behind her, same street. |
| 2 | e7d47d5e | PASS. Same paving stones and median behind the phone, screen faces her. |
| 3 | 347c2531 | PASS. Grey pedestrians back, she looks slightly to her left, amused; "ChatGPT answers." |
| 4 | 3d954446 | PASS. Same street behind her, looking at the Bobby screen while speaking. |
| 5 | cc200eba | PASS. Same composition relocated to the street; Byte hoodie, chips ENTER / WAIT / NO TRADE. |
| 6 | 84641206 | PASS. Her and Byte larger, same direction, same street from behind; lockup exact. |

**APPROVED 9:16 EN SET v3 (round 8, all six from one street reference)** → `storyboard/en/final/01..06.png`, contact `final/contact-final-9x16.jpg`.
Source jobs: 01 ad28b396 · 02 e7d47d5e · 03 347c2531 · 04 3d954446 · 05 cc200eba · 06 84641206.
Lesson: for a multi-frame storyboard, pick one approved frame as the LOCATION reference and pass it as image_references to every other frame with "exact same sidewalk, same paving stones, same median, same facades, same light". Elements alone do not hold the street.

Credits spent on this film so far: 50 + 12 = 62 (balance ≈ 2,962).

## Anthony's notes on set v3 (2026-09-04): only two frames
1. Move her slightly further back (reference: his crop of frame 1). 5. Headline must use the same typeface/size as "ChatGPT answers." in frame 3.

## Storyboard round 9 — 2026-09-04 · EN frames 1 and 5 · 4 cr

| # | Job | Result |
|---|---|---|
| 1 | e32cf8a9 | PASS. She is ~3 m further back, smaller in frame, same street and pedestrians. → final/01.png |
| 5 | e1eaf2d8 | PARTIAL. Typeface now matches frame 3 (bold white geometric sans) but the headline sits at the very top edge, outside the safe zone. |

## Storyboard round 10 — 2026-09-04 · EN frame 5, headline moved down · 2 cr

| # | Job | Result |
|---|---|---|
| 5 | 2fb27bff | PASS. Headline on two lines in the upper-middle, same bold white sans as frame 3; Byte, card and chips unchanged. → final/05.png |

**APPROVED 9:16 EN SET v4** → `storyboard/en/final/01..06.png`, contact `final/contact-final-9x16.jpg`.
Source jobs: 01 e32cf8a9 · 02 e7d47d5e · 03 347c2531 · 04 3d954446 · 05 2fb27bff · 06 84641206.

Credits spent on this film so far: 66 + 2 = 68 (balance ≈ 2,956).

## Storyboard round 11 — 2026-09-04 · EN frame 1 only, she ~20% smaller · 2 cr

| # | Job | Result |
|---|---|---|
| 1 | bcd1e573 | PASS. She is clearly smaller and further back, same street and pedestrians. → final/01.png |

**APPROVED 9:16 EN SET v5 (final)** → `storyboard/en/final/01..06.png`, contact `final/contact-final-9x16.jpg`.
Source jobs: 01 bcd1e573 · 02 e7d47d5e · 03 347c2531 · 04 3d954446 · 05 2fb27bff · 06 84641206.

Credits spent on this film so far: 68 + 2 = 70 (balance ≈ 2,954).

## Pre-video checklist (Higgsfield docs, 2026-09-04)
- Seedance 2.5 generates ambience, foley, music and speech in the same pass (`generate_audio` true by default; v1 mp4 has an AAC stereo track). Dialogue goes in the prompt as quoted lines per shot.
- Schema (CLI `model get`): modes t2v / omni_reference / video_edit / video_extension; ≤ 50 reference items total; 480p / 720p / 1080p; duration 4–30 s; `audio_references` accepted (use for Bobby's real app voice later).
- Higgsfield's own advice: prototype cheap, lock the prompt, then final. Costs preflighted 9:16 15 s with audio: 480p 37.5 · 720p 97.5 · 1080p 135 (no-audio same price).
- The preset recommendation ("IN THE DARK", 24bae836) must be declined with `declined_preset_id` for a literal render.

## Video round 1 — 2026-09-04 · seedance_2_5 omni_reference · 9:16 · 15 s · 480p · audio on · 37.5 cr

Prompt: `prompt-9x16-en.txt`. Refs (8): frames 01–06 (jobs bcd1e573, e7d47d5e, 347c2531, 3d954446, 2fb27bff, 84641206), protagonist sheet de5f779a, Bobby screenshot a9d0e9eb. Preset declined.

| # | Job | Result |
|---|---|---|
| V1 | 13c25bc7 | PASS as prototype. `renders/promo-v2-9x16-v1-480p.mp4` (480x854, h264 + AAC stereo, 15.04 s). Contact `renders/contact-v1-480p.jpg`, zooms `renders/zooms-v1-480p.jpg`. All six shots in order and on time; every locked string exact (ChatGPT answers. / Bobby checks / the market first. / Bobby / Join the waitlist / bobbyprotocol.xyz/app); same street throughout; Bobby screen on the phone in shot 4; Byte appears at 9 s, grey card dissolves, chips card present; lockup holds 12–15 s. Audio track present with clear level changes at the dings (3–6 s) and the voice lines (7–8 s, 9–11 s); speech content NOT machine-verified (no local STT), Anthony to listen. Nits: shot 1 she is closer to camera than frame 01; Byte turns to face camera for a beat at 12 s before walking beside her; chat bubble text at 2 s too small to verify at 480p. |

Credits spent on this film so far: 70 + 37.5 = 107.5.

## Anthony's feedback on video V1 (2026-09-04)
Opening shot good but needs audible CDMX ambience (birds etc.); crowd must walk in her direction, not stand; she must say the question out loud while typing ("What's happening with the market?"); show that everyone asks (second line after "ChatGPT answers." and/or an insert); drop NVIDIA, ask about "the market" (ban risk when naming a stock).

## Storyboard round 12 — 2026-09-04 · EN frames 2, 3, 4 (market wording, walking crowd) · 6 cr

| # | Job | Result |
|---|---|---|
| 2 | f267513d | PASS. Same over-the-shoulder frame, bubble now "What's happening with the market?" (small at this size). → final/02.png |
| 3 | e0a4fa4b | PASS. She and the five others all walking toward camera in the same flow, heads down, grey; she glances left; "ChatGPT answers." → final/03.png |
| 4 | a30440d7 | PASS. Same frame, Bobby screen, transcript "What's happening with the market?". → final/04.png |

**9:16 EN SET v6** → `storyboard/en/final/01..06.png`. Source jobs: 01 bcd1e573 · 02 f267513d · 03 e0a4fa4b · 04 a30440d7 · 05 2fb27bff · 06 84641206.
Pending decision before video V2: wording of the second line after "ChatGPT answers." and whether to add a 1-second insert of another pedestrian's phone (hands only, no face).

Credits spent on this film so far: 107.5 + 6 = 113.5 (balance ≈ 2,910).

## Video round 2 — 2026-09-04 · seedance_2_5 omni_reference · 9:16 · 15 s · 480p · audio on · 37.5 cr

Prompt v3.1: `prompt-9x16-en.txt` (CDMX ambience from frame 1; everyone walking in her direction; she half-whispers the question while typing; "ChatGPT answers." at 4.2 s, hands-and-phone insert at 5.4 s, "Like it does for everyone." at 6.4 s; overlapping murmurs; "the market" instead of NVIDIA; Byte never turns to camera in shot 6). Refs: frames 01–06 (bcd1e573, f267513d, e0a4fa4b, a30440d7, 2fb27bff, 84641206), sheet de5f779a, screenshot a9d0e9eb. Preset declined.

| # | Job | Result |
|---|---|---|
| V2 | 329243ac | PARTIAL. `renders/promo-v2-9x16-v2-480p.mp4`, contact `renders/contact-v2-480p.jpg` (2 fps), zooms `renders/zooms-v2-480p.jpg`. Good: crowd walks with her in every wide shot; "the market" wording; insert of hands + phone with the grey answer at ~4.5 s; Bobby screen; Byte + chips + "Bobby checks / the market first."; lockup exact. FAIL: the second line did not render: instead of "Like it does for everyone." the model stacked a second (partly garbled) "ChatGPT answers." under the first from ~5.5 s to 7.5 s. Also "ChatGPT answers." starts a beat early, over the end of the phone shot. Byte still turns to face camera for a beat at 13 s. Audio: track present; speech not machine-verified. |

Credits spent on this film so far: 113.5 + 37.5 = 151.

## Anthony's feedback on video V2 (2026-09-04): screen direction
Front / behind / front / behind reads as going and coming back. Fix in script v3.2: never cross the axis; POV for the phone shots; frontal for Bobby; rear view only after she passes the camera in shot 6.

## Storyboard round 13 — 2026-09-04 · EN frames 2 (POV) and 4 (frontal three-quarter) · 4 cr

| # | Job | Result |
|---|---|---|
| 2 | 79756a65 | PASS. POV: her hands, phone with "What's happening with the market?" fully legible, sidewalk ahead, sneaker toe. → final/02.png |
| 4 | 5f71c410 | FAIL. "Pixel for pixel" made the model paste the screenshot as a giant floating phone in front of her. Not usable. |

## Storyboard round 14 — 2026-09-04 · EN frame 4 as POV (Bobby screen, mic active) · 2 cr

| # | Job | Result |
|---|---|---|
| 4 | 4e8a52fd | PASS. POV, same framing as frame 02, real Bobby Live Desk with Byte, mic active, transcript "What's happening with the market?". → final/04.png |

**9:16 EN SET v7 (axis-safe)** → final/01..06. Source jobs: 01 bcd1e573 · 02 79756a65 · 03 e0a4fa4b · 04 4e8a52fd · 05 2fb27bff · 06 84641206.

Credits spent on this film so far: 155 + 2 = 157.

## Video round 3 — 2026-09-04 · seedance_2_5 omni_reference · 9:16 · 15 s · 480p · audio on · 37.5 cr

Prompt v3.2: `prompt-9x16-en.txt`. Axis rule (camera never crosses the line; POV for both phone shots; rear view only after she passes the camera in shot 6); second line REPLACES the first ("ChatGPT answers." → insert → "Like it does for everyone."), one headline at a time; "ChatGPT answers." only after the cut to the wide shot; Byte never faces camera. Refs: frames 01–06 (bcd1e573, 79756a65, e0a4fa4b, 4e8a52fd, 2fb27bff, 84641206), sheet de5f779a, screenshot a9d0e9eb. Preset declined.

| # | Job | Result |
|---|---|---|
| V3 | 43829ee2 | PARTIAL, big step forward. `renders/promo-v2-9x16-v3-480p.mp4`, contact `renders/contact-v3-480p.jpg`, zooms `renders/zooms-v3-480p.jpg`. AXIS FIXED: frontal walk → POV typing → wide (crowd walking with her) → POV Bobby screen → frontal Byte → she walks past camera → rear view with Byte beside her, Byte never faces camera. Lockup, "Bobby checks / the market first.", Byte, chips all good. FAIL again: "Like it does for everyone." did not render at all (the model will not swap a headline inside one shot; it just kept "ChatGPT answers."). Minor: "ChatGPT answers." still starts ~0.5 s early over the end of the POV shot. Audio present; speech not machine-verified. |

Credits spent on this film so far: 157 + 37.5 = 194.5.

## Anthony's feedback on video V3 (2026-09-04)
- "Like it does for everyone." must be SPOKEN by a second voice (female, clear General American, matter-of-fact) and shown; it is the problem statement.
- Her face in the wide shot looks AI.
- No keyboard on screen while she types → reads as AI.
- Show the prompts in chat; use Higgsfield's prompt structure (his PDF: Cinematic Car Commercial breakdown).
- NO credits without explicit authorization per run (V3 was launched without one — my mistake).
Prompt v4 in Higgsfield format: `prompt-9x16-en-v4.txt`. Format notes: `higgsfield-prompt-format.md`.

## Storyboard round 15 — 2026-09-04 · authorized by Anthony · frame 2 with keyboard, frame 3 closer on her face · 4 cr

| # | Job | Result |
|---|---|---|
| 2 | 22503d32 | PASS. POV with the on-screen keyboard open, thumbs on the keys, bubble "What's happening with the market?", grey answer. → final/02.png |
| 3 | 1a8d700a | FAIL (soft). Ignored "closer": same wide framing as before, face still small. |

## Storyboard round 16 — 2026-09-04 · authorized (photography) · frame 3 waist-up, plus a new frame 07 = the stranger's-hands insert · 4 cr

| # | Job | Result |
|---|---|---|
| 3 | 7d3d804f | PASS. Knees-up medium shot, her face large and natural, glancing left, three grey pedestrians walking behind, "ChatGPT answers." → final/03.png |
| 07 (insert) | 6353a400 | PASS. Stranger's POV: grey sweatshirt sleeves, desaturated world, phone with "What's happening with the market?" and the grey answer, worn sneakers. → final/07-insert.png |

**9:16 EN SET v8 (for video V4)**: 01 bcd1e573 · 02 22503d32 (keyboard) · 03 7d3d804f (waist-up) · 07-insert 6353a400 · 04 4e8a52fd · 05 2fb27bff · 06 84641206. Contact `final/contact-final-9x16.jpg` (order: 01, 02, 03, insert, 04, 05, 06).

Credits spent on this film so far: 198.5 + 4 = 202.5.

## Video round 4 — 2026-09-04 · AUTHORIZED by Anthony ("Autorizo para 480p") · seedance_2_5 omni_reference · 9:16 · 15 s · 480p · audio · 37.5 cr
Job fae5a529 → `renders/promo-v2-9x16-v4-480p.mp4`, contact `renders/contact-v4-480p.jpg`. Prompt: `prompt-9x16-en-v4.txt` (Higgsfield format; second voice says "Like it does for everyone." on the insert cut; keyboard; axis locked). Refs in order: bcd1e573, 22503d32, 7d3d804f, 4e8a52fd, 2fb27bff, 84641206, 6353a400 (insert), de5f779a (sheet), a9d0e9eb (screenshot).
Result V4: BEST SO FAR. "Like it does for everyone." finally renders, alone, on the stranger's-hands insert (5.5–7 s); keyboard visible in the typing POV; Bobby POV with mic; Byte + chips + "Bobby checks / the market first."; she passes the camera and the rear view with Byte beside her holds to the lockup; axis clean. ONE regression: "ChatGPT answers." also appears over cut 1 (0–1.5 s) before the typing POV, then correctly again on cut 3. Audio present; speech not machine-verified. Credits spent on this film so far: 202.5 + 37.5 = 240.

## Anthony after V4 (2026-09-04)
Locked: everything up to second 4. Remove the grey-sweater insert (reads as a wardrobe change). "Like it does for everyone." stays in the context of shot 3 (her walking) → closer cut of the same walk (frame 3b). Crowd = four distinct voices. Bobby POV must keep moving, not a still. He caught that frame 3b had "ChatGPT answers." baked in → regenerate with the right line.

## Storyboard round 17 — 2026-09-04 · authorized ("Dale") · frame 3b with "Like it does for everyone." · 2 cr
| # | Job | Result |
|---|---|---|
| 3b | fcc257c6 | PASS. Same closer shot, headline now "Like it does for everyone." exact. → final/03b-closer.png. V5 refs in order: bcd1e573, 22503d32, e0a4fa4b (3a), fcc257c6 (3b), 4e8a52fd, 2fb27bff, 84641206, de5f779a, a9d0e9eb. |
Credits spent on this film so far: 240 + 2 = 242.
Anthony spotted a duplicated pedestrian (same man, grey polo + backpack, twice) in V4's Byte cut → v5 prompt now forbids duplicated extras in the TECHNICAL BLOCK and in cut 6.

## Video round 5 — 2026-09-04 · AUTHORIZED ("Dale") · seedance_2_5 omni_reference · 9:16 · 15 s · 480p · audio · 37.5 cr
Job c596e224 → `renders/promo-v2-9x16-v5-480p.mp4`, contact `renders/contact-v5-480p.jpg`. Prompt: `prompt-9x16-en-v5.txt`. Refs: bcd1e573, 22503d32, e0a4fa4b, fcc257c6, 4e8a52fd, 2fb27bff, 84641206, de5f779a, a9d0e9eb.
Result V5: PARTIAL. Good: no text in cuts 1–2 (fixed); keyboard; "ChatGPT answers." only from the wide cut; Bobby POV; Byte + chips; pass-by + rear view + lockup. FAIL (third time): the second line did not render — cut 4 (closer, on her) still shows "ChatGPT answers." even with the line baked into its storyboard frame; also that closer cut crops her head at the top edge. Byte cut: the grey-polo man appears left and a similar man right; not clearly distinct. Conclusion: Seedance keeps the first headline whenever the following cut looks like the same scene; the only time the second line rendered (V4) it was on a visually different insert. Audio not machine-verified. Credits spent on this film so far: 242 + 37.5 = 279.5.

## Cut-4 clip — 2026-09-04 · AUTHORIZED ("Autorizo los 10 créditos") · seedance_2_5 omni_reference · 9:16 · 4 s · 480p · audio · 10 cr
Job 0cf64545 → `renders/cut4-clip-480p.mp4`. Separate render of the closer cut with "Like it does for everyone." baked in the still (fcc257c6) + second voice; to be spliced into V5 at 5.8–7.6 s with ffmpeg. Prompt: `prompt-cut4-clip.txt`.
Cut-4 clip result: PASS. "Like it does for everyone." on every frame, she walks with her whole head in frame, extras walking behind. Spliced locally with ffmpeg (V5 0–5.1 s + clip 0–2.5 s + V5 7.6–15.04 s, hard cuts, re-encoded x264 crf 18 + aac 160k) → `renders/promo-v2-9x16-v5-assembled-480p.mp4` (15.08 s). Credits spent on this film so far: 279.5 + 10 = 289.5 (balance ≈ 2,735).
Method note: when Seedance refuses to change a headline between similar cuts, render that cut as a separate clip with the text baked into its still and splice in edit (the Higgsfield tutorial assembles scenes the same way).

## Text-only fix on V4 (post, no credits) — 2026-09-04
Anthony: the spliced clip changed the pace; he only wants the second line added at the same moment, same sound, same effect. Built `renders/promo-v2-9x16-v4-textfix-480p.mp4`: video = V4 0–5.5 s + V3's wide shot 5.5–6.9 s (same framing, she keeps walking) with a PNG overlay "Like it does for everyone." (Arial Bold 24, white, soft shadow) placed under the baked "ChatGPT answers." from 5.75 s + V4 from 7.6 s (Bobby POV); audio = V4 0–6.9 s + V4 7.6 s onward (0.7 s of the insert's tail dropped). 14.33 s. Known seam: at 5.5 s the cut from V4's wide take to V3's wide take is a small jump (she is a bit further, the headline sits lower). ffmpeg has no drawtext here → text rendered with PIL as `renders/overlay-line2.png` and applied with `overlay`.

## FINAL 9:16 — 2026-09-04 · AUTHORIZED · bytedance_video_upscale pro, preset aigc, 24 fps, 1080p · 1 cr
Source: V5 (c596e224), untouched. Job 331fce23 → `renders/promo-v2-9x16-FINAL-1080p.mp4`.
## 16:9 — 2026-09-04 · AUTHORIZED · reframe 9:16 → 16:9 at 1080p (same take, AI-filled sides) · 139.5 cr
Job e7d53a05 → pending.

## FINALS — 2026-09-04 · AUTHORIZED ("de la vertical no toques nada… sobre el horizontal dale")
- 9:16 1080p: ByteDance video upscale (pro, preset aigc, 24 fps) of V5 job c596e224 → job bb3df4cb → `renders/promo-v2-9x16-final-1080p.mp4` (1080x1920, 15.04 s, same take, same audio). 1 cr.
- 16:9 1080p: Higgsfield reframe of V5 → job e7d53a05 → `renders/promo-v2-16x9-final-1080p.mp4`. 139.5 cr. Contact `renders/contact-final-16x9-1080p.jpg`.
Credits spent on this film: 289.5 + 1 + 139.5 = 430 (balance ≈ 2,594).

## Polish round (v3.4) — 2026-09-04 · AUTHORIZED ("Dale máximo 14") · 16:9 storyboard, 7 frames · 14 cr
Changes: normal-colour crowd, real keyboard, Bobby line "I checked. It's not the time to buy. Wait.", tagline "Your best friend in the market.", tighter shot sizes. Horizontal first.

| # | Job | Result |
|---|---|---|
| 1 medium walk | 0e9c84e5 | PASS. Waist-up, face large, three normal-colour extras behind. |
| 2 POV keyboard | a05a6e6c | PASS. Real legible iOS keyboard, bubble "What's happening with the market?". |
| 3 medium "ChatGPT answers." | 8a2c7665 | PASS. She glances left at four normal-colour pedestrians walking with her; headline near the top. |
| 4 close-up "Like it does for everyone." | 033f0cc3 | PASS. Chest-up, natural face, headline top right. |
| 5 POV Bobby | a36392bb | PASS. Real Live Desk, mic green, transcript. |
| 6 Byte medium | 8c7f86ad | PASS. Byte hoodie spirit, chips ENTER / WAIT / NO TRADE, "Bobby checks / the market first." (large, top). |
| 7 lockup + tagline | 3a065443 | PASS. "Bobby / Your best friend in the market. / Join the waitlist / bobbyprotocol.xyz/app" left; she + Byte from behind right. |

Files: `storyboard/en16/f1..f7.png`, contact `storyboard/en16/contact-16x9-r1.jpg`. Credits spent on this film so far: 462 + 14 = 476.

Anthony on 16:9 round 1: loves the colour grade of frames 1–4; frame 3 remove the grey-sweatshirt man; 4 and 5 perfect; frame 6 must match frame 1's grade and people must not be grey; frame 7 Byte turned into an astronaut and the street changed.

## 16:9 round 2 — 2026-09-04 · AUTHORIZED ("Dale") · frames 3, 6, 7 · 6 cr
| # | Job | Result |
|---|---|---|
| 3 | a6766c5d | PASS. Grey-sweatshirt man removed, four normal-colour pedestrians, headline intact. |
| 6 | a6dc390c | PARTIAL. Warm grade now matches frame 1, but the background people are still muted (model copied the grey extras from the previous frame 6). Redo from frame 1 as base. |
| 7 | 29d56c37 | PASS. Byte with hood and visor from behind, same street as frame 1, lockup "Bobby / Your best friend in the market. / Join the waitlist / bobbyprotocol.xyz/app". |

Credits spent on this film so far: 476 + 6 = 482.

## 16:9 round 3 — 2026-09-04 · authorized ("ya solo falta esta toma") · frame 6 rebuilt from frame 1 (same people, same grade) · 2 cr
| # | Job | Result |
|---|---|---|
| 6 | af92adef | PASS. Frame 1 with Byte: same three pedestrians in the same colours, same grade, chips card, two-line headline. |

**APPROVED 16:9 SET** → `storyboard/en16/final/01..07.png`, contact `final/contact-final-16x9.jpg`. Jobs: 01 0e9c84e5 · 02 a05a6e6c · 03 a6766c5d · 04 033f0cc3 · 05 a36392bb · 06 af92adef · 07 29d56c37. Credits spent on this film so far: 482 + 2 = 484.

## 16:9 round 4 — 2026-09-04 · authorized ("solo cambiar la escena 4 y LISTO") · frame 4 with the official extras (blue hoodie man + beige jacket woman) · 2 cr
| # | Job | Result |
|---|---|---|
| 4 | 729b6cf6 | PASS. Close-up with the official extras (blue hoodie man, beige jacket woman) behind her. → final/04.png

**16:9 SET FINAL**: 01 0e9c84e5 · 02 a05a6e6c · 03 a6766c5d · 04 729b6cf6 · 05 a36392bb · 06 af92adef · 07 29d56c37. Credits spent on this film so far: 484 + 2 = 486.

## Video 16:9 round 1 (V6) — 2026-09-04 · AUTHORIZED ("Dale papi") · seedance_2_5 omni_reference · 16:9 · 15 s · 480p · audio · 37.5 cr
Job e0eb8f56 → `renders/promo-v2-16x9-v6-480p.mp4`, contact `renders/contact-16x9-v6-480p.jpg`. Prompt: `prompt-16x9-en-v6.txt`. Refs: 0e9c84e5, a05a6e6c, a6766c5d, 729b6cf6, a36392bb, af92adef, 29d56c37, de5f779a, a9d0e9eb.
Result V6 16:9: PASS on review. No text in cuts 1–2; keyboard visible; "ChatGPT answers." on the medium shot with the official extras in colour; "Like it does for everyone." RENDERS on the close-up (same context, blue hoodie + beige jacket behind her); Bobby POV alive; Byte + chips + two-line headline with people in colour; pass-by → rear view with lockup "Bobby / Your best friend in the market. / Join the waitlist / bobbyprotocol.xyz/app". Nit: "ChatGPT answers." lands ~0.3 s early over the tail of the typing POV. Audio not machine-verified (Bobby's new line, four crowd voices, second voice). Credits spent on this film so far: 486 + 37.5 = 523.5.
Anthony on V6 16:9: "casi perfecto"; only fix: in cut 3 SHE speaks, but it must be the people around her who ask (each with their own voice/lips) while she listens. Prompt v6 cut 3 updated accordingly (v6.1).

## Video 16:9 round 2 (V6.1, crowd speaks / she is silent in cut 3) — 2026-09-04 · AUTHORIZED ("Dale, máximo 37.5") · 480p · audio · 37.5 cr
Job 75bd0d80 → `renders/promo-v2-16x9-v6-1-480p.mp4`, contact `renders/contact-16x9-v6-1-480p.jpg`. Credits spent on this film so far: 523.5 + 37.5 = 561.
Result V6.1 16:9: PASS on review. Same structure as V6; in cut 3 her mouth stays closed while she glances at the four pedestrians (their lip-sync not verifiable at 480p; audio to be checked by Anthony). Everything else identical: keyboard POV, close-up "Like it does for everyone." with the official extras, Bobby POV, Byte + chips + headline, pass-by, lockup with tagline. Nit persists: "ChatGPT answers." starts ~0.3 s early over the tail of the typing POV.

## Video 16:9 round 3 (V6.2: full whisper, two named extras in cut 6, 1.5 s breath before the rear view, 17 s) — 2026-09-04 · AUTHORIZED ("Dale hijo") · 480p · audio · 42.5 cr
Prompt: `prompt-16x9-en-v6-2.txt`.
Job ca29b92a (render took >9 min) → `renders/promo-v2-16x9-v6-2-480p.mp4`, contact `renders/contact-16x9-v6-2-480p.jpg`. Credits spent on this film so far: 561 + 42.5 = 603.5.
Result V6.2 16:9 (17 s): mostly PASS. Whisper now has room (grey answer unrolls only at ~3.5 s) and "ChatGPT answers." lands with the medium shot at 4.0 s, not before; close-up line renders; Bobby POV; Byte cut shows 2–3 distinct extras (no obvious clones); the 1.5 s empty-street breath exists (13.0–14.5 s) and the rear view + lockup follows (14.5–17 s). NEW NIT: the cut-6 headline "Bobby checks the market first." stays on screen through the pass-by and the empty street (12.2–14.5 s) instead of ending at the cut. Audio (full whisper, four voices) to be checked by Anthony.

Anthony on V6.2: remove the two men on the right in cut 3 (they vanish in the next cut, looks odd); in cut 6 the world freezes when Byte appears (people stop walking) → must keep moving; last scene is good.
## 16:9 storyboard round 5 — 2026-09-04 · frame 3 without the two men on the right · 2 cr · job 6b7710bf · PASS (only blue hoodie man + beige woman remain, right side empty) → final/03.png. Credits spent on this film so far: 603.5 + 2 = 605.5.
Prompt v6.3: `prompt-16x9-en-v6-3.txt` (two named extras only in cuts 3 and 6, world keeps moving in cut 6, headline ends at the cut, no text over the breath).

## Video 16:9 round 4 (V6.3) — 2026-09-04 · AUTHORIZED ("Aprobado, dale con todo") · 480p · 17 s · audio · 42.5 cr
Prompt: `prompt-16x9-en-v6-3.txt`. Refs: 0e9c84e5, a05a6e6c, 6b7710bf (new frame 3), 729b6cf6, a36392bb, af92adef, 29d56c37, de5f779a, a9d0e9eb.
Job 9b9b1f96 → `renders/promo-v2-16x9-v6-3-480p.mp4`, contact `renders/contact-16x9-v6-3-480p.jpg`. Credits spent on this film so far: 605.5 + 42.5 = 648.
Result V6.3 16:9 (17 s): PASS on review. Cut 3 and close-up with only the blue-hoodie man and the beige-jacket woman; Bobby POV; Byte cut with the world still moving (extras change position across 9.5–12 s), no obvious clones; headline gone at the 12.2 s cut; pass-by, empty-street breath (13.3–14.5), rear view + lockup with tagline to the freeze. Audio to be checked by Anthony.

## FINAL 16:9 — 2026-09-04 · AUTHORIZED ("dale con todo") · ByteDance video upscale pro 1080p (aigc, 24 fps) of job 9b9b1f96 · 1 cr
Anthony on V6.3: at 10 s she is in slow motion / posing → she must keep walking at normal pace and turn to look at Byte while listening; at 12 s the frontal pass-by (alone, no Byte, no people) wastes closing time → removed. Prompt v6.4: `prompt-16x9-en-v6-4.txt` (cut 6 real-time + she looks at Byte; cut 7 = 1.5 s empty street then rear view + lockup, no frontal pass-by).

## Video 16:9 round 5 (V6.4) — 2026-09-04 · AUTHORIZED ("Dale") · 480p · 17 s · audio · 42.5 cr
Job 8c37b091 (render >9 min) → `renders/promo-v2-16x9-v6-4-480p.mp4`, contact `renders/contact-16x9-v6-4-480p.jpg`. Credits spent on this film so far: 648 + 1 (upscale of V6.3, superseded) + 42.5 = 691.5.
Result V6.4 16:9 (17 s): PASS on review. Byte cut at real-time pace, she turns and keeps looking at Byte (9.5–11.5 s), extras keep walking; no frontal pass-by; empty-street breath at ~12.0 s (shorter than the 1.5 s asked, ~0.7 s); rear view with Byte beside her and the lockup from ~12.5 s to the end (long CTA hold). All texts correct. Audio to be checked by Anthony.
Anthony on V6.4: up to 8 s perfect; 9–12 s she does not look at Byte (must turn to HER LEFT, Byte is screen-right = her left; my prompt said "right shoulder"); the empty-street shot at 12 s reads as nonsense → removed. Prompt v6.5: `prompt-16x9-en-v6-5.txt`.
Anthony: 9–12 s she walks slower, breaks the flow. Cause found: cut 5 said "still walking slowly". v6.5 now: same pace as cuts 1 and 3 in cuts 5 and 6, plus a constant-speed rule in the TECHNICAL BLOCK.

## Video 16:9 round 6 (V6.5) — 2026-09-04 · AUTHORIZED ("Dale") · 480p · 17 s · audio · 42.5 cr
Job b4517e65 → `renders/promo-v2-16x9-v6-5-480p.mp4`, contact `renders/contact-16x9-v6-5-480p.jpg`. Credits spent on this film so far: 691.5 + 42.5 = 734.
Result V6.5 16:9 (17 s): PASS on review. 0–8 s unchanged; Byte cut at normal pace with her head turned to HER LEFT looking at Byte (10–11.5 s), extras walking; direct cut at 12.0 s to the rear view with Byte beside her, lockup fades in ~12.5 s and holds to the freeze. Nits: "ChatGPT answers." still fades in ~0.3 s early over the POV tail, and lingers one frame at the start of the close-up. Audio to be checked by Anthony.

## FINAL 16:9 (V6.5) — 2026-09-04 · AUTHORIZED ("dame la versión en 1080p HORIZONTAL") · ByteDance video upscale pro 1080p of job b4517e65 · 1 cr

## Vertical test (V6.5 restaged to 9:16) — 2026-09-04 · AUTHORIZED ("probemos en vertical en la más baja calidad") · 480p · 17 s · audio · 42.5 cr
Prompt: `prompt-9x16-en-v6-5.txt` (same as 16:9 v6.5; vertical restage, Reels safe zones, lockup centered above them).
Vertical test job ca4fce3c → `renders/promo-v2-9x16-v6-5-480p.mp4`, contact `renders/contact-9x16-v6-5-480p.jpg`. Credits spent on this film so far: 734 + 1 + 42.5 = 777.5.
Vertical test result (9:16 restage of V6.5, 480p): surprisingly close. Walk, keyboard POV, "ChatGPT answers." medium with the two extras, Bobby POV, Byte cut with her looking at Byte, rear view with the lockup CENTERED above them (the model centered it on its own). ONE FAIL: the close-up (6–7.5 s) shows "ChatGPT answers." instead of "Like it does for everyone." (the old headline-persistence problem is back in vertical). Fix for a vertical final: a 9:16 storyboard still for the close-up with the line baked in (2 cr) or the separate-clip splice.
Note: two CLI `generate create bytedance_video_upscale` calls hung in the background (killed); the 1080p upscale of V6.5 was submitted via MCP instead → job 006ab9f4.
FINAL 16:9 1080p → renders/promo-v2-16x9-FINAL-1080p.mp4 (upscale job 006ab9f4 of V6.5 b4517e65)

## FINAL 9:16 — 2026-09-04 · AUTHORIZED ("Vertical aprobado para llevar a 1080p") · ByteDance upscale 1080p of vertical test ca4fce3c · job 66bb6caa · 1 cr → `renders/promo-v2-9x16-FINAL-1080p.mp4`
Known issue carried into the vertical final: the close-up (6–7.5 s) shows "ChatGPT answers." instead of "Like it does for everyone." Anthony adds text in post or we redo that cut later.
Credits spent on this film so far: 777.5 + 1 + 1 = 779.5.
upscale common job 2499b89c → renders/promo-v2-16x9-FINAL-1080p-common.mp4 (0.1 cr); comparison renders/cmp-upscale-presets.jpg
+ local grain pass (ffmpeg noise 7 temporal + light unsharp) → renders/promo-v2-16x9-FINAL-1080p-common-grain.mp4; comparison renders/cmp-upscale-grain.jpg
Topaz 1080p upscale of V6.5 → job cedba71e → renders/promo-v2-16x9-FINAL-1080p-topaz.mp4; comparison renders/cmp-topaz-vs-bytedance.jpg; balance before/after: 2167.52 credits / 2167.52 credits

## 2026-09-07 — "plastic look" investigation
- Cause: 480p source. In wide/medium shots her face is ~60 px tall, so any 1080p upscaler invents ~90% of the skin and renders it waxy. The close-up (face fills the frame) and the phone POVs look real for the same reason. Not a prompt or lighting issue.
- Option 1 ByteDance preset common (0.34 cr) + local grain: marginal. Option 2 Topaz 1080p (5 cr, job cedba71e): visually identical to ByteDance, slightly softer → `renders/promo-v2-16x9-FINAL-1080p-topaz.mp4`, comparison `renders/cmp-topaz-vs-bytedance.jpg`.
- Conclusion: upscalers cannot create detail that the 480p take never had. Real fix = native render at 720p (97.5 cr, 2.25× pixels per face, then 0.34 cr upscale) or 1080p (135 cr); both are a new take.
- Actual costs from the transaction log: Seedance 17 s 480p = 42.5; ByteDance upscale = 0.34 (not 1); Topaz = 5. Balance 2026-09-07: 1,741.52 (other sessions spent ~420 on Trader Land assets 09-05/09-07).
- ffmpeg broke after a brew update (missing libx265); fixed with `brew reinstall x265` (ffmpeg 9.0.1).

## Video 16:9 round 7 (V6.5 native 720p) — 2026-09-07 · AUTHORIZED ("Dale") · seedance_2_5 · 16:9 · 17 s · 720p · audio · 97.5 cr
Same prompt `prompt-16x9-en-v6-5.txt`, same refs. Goal: real skin detail in medium/wide shots (2.25× pixels vs 480p), then 0.34 cr upscale to 1080p.
Job c8e04732 → renders/promo-v2-16x9-v6-5-720p.mp4 (1280x720, 17 s); contact renders/contact-16x9-720p.jpg; skin comparison renders/cmp-720-vs-480up.jpg
Result 720p native (job c8e04732): PASS. Structure identical to V6.5 (all 7 cuts, all texts, she looks at Byte, direct cut to the rear view + lockup). Skin comparison vs 480p→1080: clearly more natural at 720p (real skin texture, hair strands, chips legible). Web copy `renders/promo-v2-16x9-v6-5-720p-web.mp4`. Credits: 97.5. Next: ByteDance upscale 720→1080 (0.34 cr) on Anthony's go.
