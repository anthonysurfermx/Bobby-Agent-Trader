# Núcleo v2 — orb-first redesign (prototypes)

Chosen by Anthony on 2026-09-26 over the "Hilo" and "Lente" concepts (see ../orb-first-concepts/).

- `DIRECTION.md` — source of truth: tokens, 9 named springs, shader spec, storyboards, 46 fine details, acceptance.
- `GLASS.md` — the approved idle glass ("Deep core", variant C) and the pending DIRECTION edits it proposes.
- `nucleo-v2.html` — daily loop (43 s). `nucleo-onboarding.html` — first run (65.8 s); its source is split in `.src-onb/` (rebuild: `sh .src-onb/mk.sh`).
- `inject.py` — copies a source to `dist/` with the 18 companion thumbnails from `companions.json` (sources keep the `__COMPANIONS_JSON__` token).
- `index.html` — presentation page; `phone.html` — full-screen launcher used on the iPhone and inside the iOS preview build.
- Harness: `?t=<s>&freeze=1`, `?rm=1`, `?fps=1`, `?companion=<id>`; ArrowRight/ArrowLeft between beats; tap = 0.15× slow motion.

These are scripted prototypes with illustrative NVDA data. The live app (real debate over a native bridge) lives in `ios/Bobby/Nucleo/`.
