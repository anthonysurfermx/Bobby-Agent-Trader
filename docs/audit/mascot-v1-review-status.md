# Mascot v1 — Review findings status (2026-08-23)

Sources: `mascot-v1-review-codex.md` (9 findings) + `mascot-v1-review-kimi.md`
(22 findings). Overlapping findings merged. Verified against repo before acting.

## Fixed in this pass

| Finding | Source | Fix |
| --- | --- | --- |
| TTS público con presupuesto de abuso alto | Codex 1 / Kimi 1 (P0-P1) | Rate limit 20→15/10min, cap 2000→800 chars, whitelist estricta de voice/lang/vibe (`api/bobby-voice-free.ts`) |
| Dos contextos WebGL simultáneos en AdamsChat | Codex 2 / Kimi 2 | Una sola instancia elegida por `matchMedia('(min-width: 640px)')`; el orb legacy conserva sus dos divs CSS (canvas 2D barato) |
| Mascota solo en localStorage — revierte a orb | Codex 3 | `loadMascot()` cae a `agent_profile.mascot` y re-persiste. Hidratación desde servidor: backlog (requiere fetch de perfil) |
| Avatar slug sin allowlist | Codex 4 / Kimi 12 | Allowlist exacta en cliente (`VALID_MASCOT_AVATARS`) y servidor (`agent-setup.ts`) |
| Race en voice preview + fallo silencioso | Codex 5 / Kimi 7 | Token monotónico `previewSeqRef` ignora respuestas obsoletas; mensaje visible "voz no disponible" |
| Leak de texturas GLB / environment / carga obsoleta | Codex 6 / Kimi 6 | `disposeObject()` recursivo (geometría+materiales+texturas), dispose de GLTF obsoleto y de `scene.environment` en teardown |
| `stop()` resucita audio en vuelo | Codex 7 / Kimi 10 | Generación monotónica en la cola + `AbortController` set que aborta fetches activos |
| `prefers-reduced-motion` ignorado | Codex 8 / Kimi 5 | Pose estática en `MascotScene.update()` cuando está activo |
| ~2.8MB de thumbs PNG | Codex 9 / Kimi 9 | WebP 256px (3-6KB c/u, ~45KB total, 60× menos) |
| SKIP deja al usuario con el orb legacy | Kimi 8 | Skip asigna el companion default (Bobby) si no hay mascota |
| Input de nombre rechaza Ñ/acentos | Kimi 11 | Regex permite `ÁÉÍÓÚÜÑ` |
| Draco decoder sin preload | Kimi 18 | `<link rel="preload">` en index.html |

## Rechazados (falsos positivos, verificados)

- **Kimi 3 (P0) "voice='cio' rechazada por agent-setup"** — `cio` solo viaja a
  `/api/bobby-voice-free` (que no valida contra VALID_VOICES de agent-setup);
  el wizard únicamente envía personas válidas a agent-setup. Sin bug. Igual se
  agregó whitelist en bobby-voice-free.
- **Kimi 4 (P0) "orden de keys rompe la firma"** — cliente y servidor
  construyen el payload con el mismo orden de inserción (mascot al final en
  ambos); `JSON.stringify` coincide. Frágil pero correcto — candidato a
  canonicalización ordenada en un cambio coordinado de todas las acciones.

## Aceptados pero diferidos (backlog)

- Token/Turnstile para TTS anónimo + presupuesto global de caracteres (Codex 1
  fix completo) — v1 mitigado con caps.
- Hidratación de mascota desde el servidor para multi-dispositivo (Codex 3).
- `consented_at` + `consent_version` en agent_profiles (Kimi 22) — requiere
  migración; hacer junto con la columna `mascot`.
- Voces legacy male/female pre-seleccionadas al reeditar perfil (Kimi 21).
- Perf móvil de gama baja: antialias/segmentos adaptativos (Kimi 17),
  environment PMREM compartido (imposible entre contextos GL separados — se
  mitiga con instancia única).
- `VALID_MARKETS` compartido cliente/servidor (Kimi 13 — hoy el servidor es
  superset inofensivo).
- Proxy `/api` en vite dev para previews locales (Codex 5 parcial).

Build ✓ (vite + tsc api). Verificado en navegador con server fresco: galería
WebP, GLB Draco carga, consola limpia (el error de hooks visto durante la
sesión era artefacto del dep-optimizer de Vite tras agregar imports de three
en caliente; no reproduce con server limpio ni afecta el build de producción).

---

## Ronda 3 (17 hallazgos adicionales, 2026-08-23 tarde)

### Corregidos

| # | Hallazgo | Fix |
| --- | --- | --- |
| 1 | GLBs rígidos al hablar (sin boca procedural) | "Puppet talk": nod rítmico + pulso de escala impulsados por el nivel de voz cuando no hay boca (MascotScene) |
| 2 | Voz elegida era cosmética | `src/lib/agent-voice.ts` (getConfiguredVoice) — chat mapea 'cio'→persona elegida; Realtime acepta `voice` whitelisted y el desk la envía; legacy male/female mapeados |
| 3 | TTS abuso a costo real | Presupuesto global 3000 req/día (checkPersistentLimit 'global') con degradación a Edge (override `provider:'edge'` estricto, sin fallback pagado) |
| 4 | key={lookPulse} remontaba WebGL por click | Key estable + prop `reactKey` → scene.bounce() sin remount |
| 5 | Fallback silencioso de columna mascot | Respuesta incluye `mascot_persisted:false` + log MIGRATION PENDING; el cliente conserva mascot local al guardar el perfil del server |
| 6 | "Despierto" antes de firmar/persistir | Deploy = máquina de estados: onComplete es Promise real, el último paso gira hasta resolver, `res.ok` verificado, aviso "guardado solo en este dispositivo" si la firma/el server falla, navegación via onDone |
| 7 | SKIP saltaba el consentimiento | SKIP oculto en el paso 5 |
| 8 | Promise de playback colgada tras stop() | `playbackSettleRef` — stop() liquida la promesa activa |
| 9 | Context lost sin fallback | `webglcontextlost` → dispose + fallback SVG via onContextLost |
| 11 | Caché de voz: colisiones/crecimiento | SHA-256 (subtle, fallback http), borrado de vencidos en lectura, LRU cap 200 entradas |
| 12 | Cache-Control public en audio personalizado | `private, no-store` |
| 13 | PT a medias | Diccionario pt-BR completo (autoría Kimi K3) integrado; PT reactivado |
| 14 | A11y básica | `aria-pressed` en galería/vibes/voces, `aria-label` en input de nombre |
| 15 | Texturas 2048 en GPU + DPR 2 | Re-optimización `--texture-size 1024` (GLBs ahora 206-435KB), DPR cap 1.5, reduced-motion renderiza a ~2fps |
| 16 | Server descartaba avatar inválido en silencio | mascot inválido → 400 |
| 17 | Preview no cancelaba síntesis pagada | AbortController en playPreview/stopPreview |
| 10 | Replay de firma 10 min | Parcial: skew futuro limitado a 60s (agent-auth). Nonce único → backlog (requiere tabla) |

### Migración `mascot` — intentada, bloqueada desde esta máquina (2026-08-23)

Verificado: la columna NO existe aún (PostgREST 42703). Rutas probadas y
bloqueadas: MCP Supabase (connector en read-only — apply_migration y
execute_sql devuelven "permission denied"), RPC `exec_sql` con service key
(guard "Only admins", rechaza service_role), CLI Supabase (logueado en una
cuenta/org que no contiene egpixaunlnzauztbrnuz), conexión directa a Postgres
(no hay password/DB URL en esta máquina). SQL formalizado en
`supabase/migrations/20260823_agent_profiles_mascot.sql`. Desbloqueo: quitar
read-only al connector Supabase en claude.ai → aplicar via MCP; o pegar el
SQL en el SQL Editor del dashboard.

### Backlog que queda de esta ronda

- Nonce/idempotency key server-issued para setup-agent (tabla + constraint).
- Módulo compartido de IDs mascot cliente/servidor + `companion_id` canónico.
- Focus management completo + radiogroup semántico en el wizard.
- Pausar rAF cuando el canvas está fuera de viewport (IntersectionObserver).
- KTX2/Basis para texturas (WebP 1024 es el compromiso actual).
- Rigs/morph targets reales para lipsync de los GLB (fase de assets).
