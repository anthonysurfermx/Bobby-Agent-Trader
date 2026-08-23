# Review Brief — Bobby Mascot v1 (companion selection + 3D + warm voice)

Audience: Codex CLI + Kimi K3 CLI reviewers.
Goal: adversarial review of the shipped v1 before it goes to production.
Product bar: serious launch, mass-scale mobile users. NOT a hackathon demo.

## What shipped (2026-08-23)

1. **Character-creator onboarding** — `src/components/kinetic/AgentWizard.tsx`
   - Steps: spawn+name → avatar gallery (10 premade 3D companions, selection
     required) → vibe (direct/analytical/wise) + voice with live TTS preview →
     markets → cadence/delivery → agent card + human-language consent + deploy.
   - Copy in es-MX + EN dicts; legal moved from step 0 to final consent.
2. **3D companion system**
   - `src/lib/mascot.ts` — MascotLook {body, eyes, accessory, avatar?} +
     MASCOT_AVATARS registry (10 ids: bobby, byte, kora, zip, glitch, momo,
     flux, rook, axiom, halo) + localStorage persistence.
   - `src/components/kinetic/mascot3d/MascotScene.ts` — plain three.js scene:
     procedural blob (fallback/placeholder) + GLB avatar loading (Draco),
     cursor-follow, squash-and-stretch tap bounce, blink loop, voice-driven
     mouth (AnalyserNode, external 0..1 level, or procedural sine),
     RoomEnvironment PMREM + ACES tone mapping.
   - `src/components/kinetic/BobbyMascot3D.tsx` — React wrapper, WebGL-fail
     fallback to SVG `BobbyMascot.tsx`.
   - Assets: `public/mascots/*.glb` (10, Draco+WebP, 340–914KB each) +
     512px PNG thumbs; Draco decoder at `public/draco/`.
3. **Mascot replaces the orb everywhere** (user decision: chosen companion is
   Bobby's only face)
   - `src/components/adams/AdamsChat.tsx` (~line 3250): VoiceOrb → BobbyMascot3D
     when `loadMascot()` returns a look.
   - `src/components/adams/VoiceRoom.tsx` (~line 172): LiveOrb → BobbyMascot3D,
     state mapped from realtime VoiceState, `level` drives mouth.
4. **Warm voice ("bestie", never robotic)**
   - `api/_lib/tts.ts` — default provider now OpenAI gpt-4o-mini-tts when
     OPENAI_API_KEY exists (Edge Neural = $0 fallback; TTS_PROVIDER=edge flips).
     Voice personas coral/ballad/sage/ash; legacy male→ash, female→coral;
     vibe modulates `instructions` (es/en/pt). `format`: opus (Telegram
     voice-note) vs mp3 (web — Safari iOS can't play opus).
   - `api/bobby-voice-free.ts` — passes format:'mp3' + vibe.
   - `src/hooks/useBobbyVoice.ts` — REMOVED window.speechSynthesis entirely;
     vibe read from localStorage agent_profile and sent per request.
5. **Backend**
   - `api/agent-setup.ts` — VALID_VOICES extended with personas; optional
     `mascot` validated server-side (sanitizeMascot mirrors client ids,
     avatar slug ^[a-z0-9-]{1,32}$); upsert includes mascot with a retry
     fallback if the DB column doesn't exist yet (migration pending:
     `ALTER TABLE agent_profiles ADD COLUMN IF NOT EXISTS mascot jsonb;`).
   - `api/user-cycle.ts` — SupportedVoice union extended.
   - Signature auth: client (DeployAgentPage.tsx) includes mascot in the
     signed payload; server rebuilds authPayload with mascot when present.
6. `vite.config.ts` — port now `Number(process.env.PORT) || 8080`.

## Review dimensions (rank findings by severity, cite file:line)

1. **Correctness** — three.js lifecycle: dispose/leaks on look change, GLB
   swap race (lookVersion guard), two simultaneous WebGL contexts in
   AdamsChat (mobile+desktop divs), blink/mouth rAF cleanup, AnimatePresence
   step transitions.
2. **Security/abuse** — /api/bobby-voice-free: rate limit 20/10min per IP vs
   OpenAI TTS cost (~$0.015/min) — is that enough for a public endpoint?
   agent-setup signature replay w/ mascot field ordering (JSON key order in
   challenge), mascot sanitization completeness.
3. **Performance (mobile-first)** — GLB sizes OK? PMREM cost per instance,
   pixelRatio cap, wizard voice preview caching, IndexedDB audio cache TTL,
   Draco decoder fetch timing.
4. **UX** — wizard flow gaps: what happens on SKIP (no mascot → orb legacy),
   voice preview failure states (no /api locally), gallery on slow networks
   (thumbs 250-300KB each × 10), accessibility (prefers-reduced-motion not
   respected in MascotScene), ES/EN copy quality.
5. **Consistency** — companion ids vs upcoming avatar-evolution architecture
   (companion_id must equal mascot.avatar), voice persona ids vs
   agent_profiles.voice legacy values in existing rows.

Output: numbered findings, each with severity (P0-P3), file:line, and a
concrete fix. No praise, no summaries of what the code does.
