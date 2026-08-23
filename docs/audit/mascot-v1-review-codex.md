1. **P1 — Public TTS endpoint permits distributed cost abuse.**  
   [api/bobby-voice-free.ts:20](/Users/mrrobot/Documents/GitHub/Bobby-Agent-Trader/api/bobby-voice-free.ts:20) allows 20 requests per IP per 10 minutes, each up to 2,000 characters ([line 27](/Users/mrrobot/Documents/GitHub/Bobby-Agent-Trader/api/bobby-voice-free.ts:27)), while OpenAI is the default provider when configured ([tts.ts:170](/Users/mrrobot/Documents/GitHub/Bobby-Agent-Trader/api/_lib/tts.ts:170)). A botnet can turn this into unbounded paid synthesis.  
   Fix: require a signed/session-bound short-lived TTS token or Turnstile for anonymous previews; enforce global and per-identity character budgets, lower anonymous preview limits, and only cache fixed preview phrases server-side.

2. **P1 — AdamsChat mounts two active WebGL mascot scenes at every breakpoint.**  
   [src/components/adams/AdamsChat.tsx:3250](/Users/mrrobot/Documents/GitHub/Bobby-Agent-Trader/src/components/adams/AdamsChat.tsx:3250) and [3251](/Users/mrrobot/Documents/GitHub/Bobby-Agent-Trader/src/components/adams/AdamsChat.tsx:3251) both render `BobbyMascot3D`; CSS merely hides one. Each creates a renderer, PMREM environment, mouse listener, and perpetual rAF loop ([MascotScene.ts:79](/Users/mrrobot/Documents/GitHub/Bobby-Agent-Trader/src/components/kinetic/mascot3d/MascotScene.ts:79), [125](/Users/mrrobot/Documents/GitHub/Bobby-Agent-Trader/src/components/kinetic/mascot3d/MascotScene.ts:125)).  
   Fix: render exactly one mascot and size it responsively with CSS/container queries.

3. **P1 — Chosen companion is device-local, so it reverts to the legacy orb on another device or after storage clearing.**  
   [src/lib/mascot.ts:135](/Users/mrrobot/Documents/GitHub/Bobby-Agent-Trader/src/lib/mascot.ts:135) reads only `bobby_mascot`, while [DeployAgentPage.tsx:55](/Users/mrrobot/Documents/GitHub/Bobby-Agent-Trader/src/pages/DeployAgentPage.tsx:55) stores the server profile but neither AdamsChat nor VoiceRoom hydrate from `agent_profile.mascot`. Both render the orb when local storage is absent ([AdamsChat.tsx:3250](/Users/mrrobot/Documents/GitHub/Bobby-Agent-Trader/src/components/adams/AdamsChat.tsx:3250)).  
   Fix: make the persisted profile mascot the source of truth; hydrate and validate it into local storage on profile load, with local storage only as an offline cache.

4. **P2 — Server accepts avatar slugs that are not registered companions.**  
   [api/agent-setup.ts:37](/Users/mrrobot/Documents/GitHub/Bobby-Agent-Trader/api/agent-setup.ts:37) validates only slug shape, but the client resolves models through the fixed registry ([src/lib/mascot.ts:38](/Users/mrrobot/Documents/GitHub/Bobby-Agent-Trader/src/lib/mascot.ts:38), [51](/Users/mrrobot/Documents/GitHub/Bobby-Agent-Trader/src/lib/mascot.ts:51)). A signed but invalid avatar persists and silently falls back to the procedural mascot. It also does not enforce the stated `companion_id === mascot.avatar` invariant.  
   Fix: validate against the exact registered avatar ID allowlist, persist a canonical `companion_id`, and reject requests where it differs from `mascot.avatar`.

5. **P2 — Rapid voice-preview taps can play the wrong voice, and failure is invisible.**  
   [AgentWizard.tsx:202](/Users/mrrobot/Documents/GitHub/Bobby-Agent-Trader/src/components/kinetic/AgentWizard.tsx:202) starts independent fetches without aborting or versioning them. A slow earlier request can finish after a later selection and replace `audio.src` at [220](/Users/mrrobot/Documents/GitHub/Bobby-Agent-Trader/src/components/kinetic/AgentWizard.tsx:220). Errors are swallowed at [225](/Users/mrrobot/Documents/GitHub/Bobby-Agent-Trader/src/components/kinetic/AgentWizard.tsx:225). In Vite local development, no `/api/bobby-voice-free` proxy is configured ([vite.config.ts](/Users/mrrobot/Documents/GitHub/Bobby-Agent-Trader/vite.config.ts:43)), so this commonly fails silently.  
   Fix: keep an `AbortController` and monotonically increasing preview request ID; ignore stale completions; display a retryable “voice preview unavailable” state; add a local API proxy or explicit dev fallback.

6. **P2 — GLB and environment GPU resources leak on avatar swaps/stale loads.**  
   [MascotScene.ts:151](/Users/mrrobot/Documents/GitHub/Bobby-Agent-Trader/src/components/kinetic/mascot3d/MascotScene.ts:151) drops stale GLTF results via `lookVersion` without disposing their geometries, materials, and textures. `dispose()` also never disposes `scene.environment` created at [96](/Users/mrrobot/Documents/GitHub/Bobby-Agent-Trader/src/components/kinetic/mascot3d/MascotScene.ts:96).  
   Fix: centralize recursive disposal for geometry, materials, and texture fields; dispose stale loaded scenes before returning; retain and dispose the PMREM environment texture during teardown.

7. **P2 — “Stop” can resurrect cancelled speech after an in-flight fetch resolves.**  
   [useBobbyVoice.ts:263](/Users/mrrobot/Documents/GitHub/Bobby-Agent-Trader/src/hooks/useBobbyVoice.ts:263) removes an item before awaiting its audio. `stop()` clears the queue but resets the shared stop flag on the next tick ([294–312](/Users/mrrobot/Documents/GitHub/Bobby-Agent-Trader/src/hooks/useBobbyVoice.ts:294)); an old processor can then continue to [280] and play the prior response.  
   Fix: use a monotonically increasing queue generation/cancellation token, check it after every await, and abort outstanding fetches when stopping.

8. **P2 — Motion accessibility is not respected.**  
   [MascotScene.ts:125](/Users/mrrobot/Documents/GitHub/Bobby-Agent-Trader/src/components/kinetic/mascot3d/MascotScene.ts:125) runs animation continuously, and [AgentWizard.tsx:339](/Users/mrrobot/Documents/GitHub/Bobby-Agent-Trader/src/components/kinetic/AgentWizard.tsx:339) adds transition-heavy motion without checking `prefers-reduced-motion`.  
   Fix: detect `prefers-reduced-motion`; render a static frame, disable cursor follow/bounce/blink rAF, and set Framer Motion transitions to none.

9. **P3 — Avatar gallery downloads roughly 2.8 MB of thumbnails before any companion is selected.**  
   [AgentWizard.tsx:394](/Users/mrrobot/Documents/GitHub/Bobby-Agent-Trader/src/components/kinetic/AgentWizard.tsx:394) places all ten 250–320 KB PNGs in the initial visible grid; `loading="lazy"` at [404](/Users/mrrobot/Documents/GitHub/Bobby-Agent-Trader/src/components/kinetic/AgentWizard.tsx:404) does not defer images already in the viewport.  
   Fix: ship small WebP/AVIF thumbnails, use responsive `srcset`, preload only the selected model, and paginate or virtualize the gallery on mobile.
