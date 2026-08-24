• A continuación los hallazgos adversariales, numerados por severidad. Sin resúmenes ni elogios.

  ---

  **P0 — Launch blocker / riesgo crítico**

  1. **Coste/abuso descontrolado en TTS público**
     - `api/bobby-voice-free.ts:20`
     - El rate limit de `20/10min/IP` con OpenAI TTS por defecto y sin autenticación permite ~$0.60/IP/10 min si se saturan textos de 2000 chars. A escala masiva esto es un agujero de costos.
     - *Fix:* forzar `TTS_PROVIDER=edge` en este endpoint público, autenticar con wallet/sesión, o bajar el límite a `5/10min/IP` + validar `voice`/`lang`/`vibe` contra whitelist antes de llamar a OpenAI.

  2. **Dos contextos WebGL simultáneos en AdamsChat**
     - `src/components/adams/AdamsChat.tsx:3250-3251`
     - Se montan dos `<BobbyMascot3D>` (sm:hidden y hidden sm:block). Aunque solo uno sea visible, ambos renderizan, creando dos `WebGLRenderer`/contextos. En móviles bajos puede agotar contextos WebGL o VRAM.
     - *Fix:* renderizar una sola instancia condicional al breakpoint (`useMediaQuery`) o compartir un único canvas/renderer entre viewports.

  3. **`cio` es voz por defecto en cliente pero rechazada en servidor**
     - `api/agent-setup.ts:19`, `src/hooks/useBobbyVoice.ts:96`
     - `useBobbyVoice` envía `voice='cio'` por defecto, pero `VALID_VOICES` de `agent-setup` solo acepta `['male','female','coral','ballad','sage','ash']`. El deploy fallará con 400 después de que el wizard permitió esa voz.
     - *Fix:* agregar `'cio'`, `'alpha'` y `'red'` a `VALID_VOICES` o normalizarlos a `ash`/`sage`/`verse` en `agent-setup` antes de validar.

  4. **Orden de campos en payload firmado rompe la firma al incluir `mascot`**
     - `api/agent-setup.ts:66-76`
     - `authPayload` reconstruye el objeto con `mascot` siempre al final. Si el cliente firmó con `mascot` en otro orden, `JSON.stringify` difiere y `verifyAgentRequest` rechaza la firma.
     - *Fix:* ordenar alfabéticamente las keys del payload antes de stringificar para la firma, tanto en cliente (`DeployAgentPage.tsx`) como en servidor.

  ---

  **P1 — Alto / bug significativo**

  5. **No respeta `prefers-reduced-motion`**
     - `src/components/kinetic/mascot3d/MascotScene.ts:342-419`
     - `update()` ejecuta bob, bounce, parpadeo y seguimiento de cursor sin consultar `prefers-reduced-motion`.
     - *Fix:* leer `window.matchMedia('(prefers-reduced-motion: reduce)')` en `init()`; si está activo, saltar transformaciones dinámicas y dejar el personaje en pose estática.

  6. **Leak de texturas y environment map al cambiar de avatar**
     - `src/components/kinetic/mascot3d/MascotScene.ts:173-186`, `421-436`
     - `clearCharacter()` y `dispose()` liberan geometrías y materiales de `Mesh`, pero no texturas de GLB ni el environment texture generado por PMREM. Cambiar avatar varias veces acumula VRAM.
     - *Fix:* rastrear texturas cargadas (incluyendo `scene.environment`) y llamar `texture.dispose()` en `clearCharacter()` y `dispose()`.

  7. **Voice preview falla silenciosamente**
     - `src/components/kinetic/AgentWizard.tsx:225-226`
     - Si `/api/bobby-voice-free` falla (sin API keys en local, rate limit, error de red), `catch` solo pone `setPreviewing(null)`. El usuario no sabe por qué no escucha nada.
     - *Fix:* agregar estado `previewError` y mostrar icono/tooltip de error en el botón de voz, con fallback a reproducir un sample precargado o mensaje "no disponible sin conexión".

  8. **SKIP deja al usuario sin companion (orb legacy)**
     - `src/components/kinetic/AgentWizard.tsx:325`
     - `onSkip` no guarda mascot, contradiciendo la decisión de producto "chosen companion is Bobby's only face".
     - *Fix:* antes de `onSkip()`, llamar `saveMascot(randomMascot() o DEFAULT_MASCOT)` o mostrar confirmación "¿continuar sin compañero?".

  9. **Galería descarga ~2.5–3 MB de thumbs sin priorización ni skeleton**
     - `src/components/kinetic/AgentWizard.tsx:394-410`
     - 10 thumbs de 250–300 KB cada uno se cargan de golpe. En 3G lento el wizard parece roto varios segundos.
     - *Fix:* usar `IntersectionObserver` para lazy-load real, mostrar skeleton mientras carga, servir thumbs WebP con `srcset`, y precargar solo el thumb seleccionado.

  10. **`fetchAudio` no es abortable: audio sigue descargándose tras `stop()`**
      - `src/hooks/useBobbyVoice.ts:84-105`, `294-313`
      - `stop()` no aborta fetches en curso; el audio llega, se cachea y puede reproducirse después de que el usuario canceló.
      - *Fix:* guardar `AbortController` por llamada en `fetchAudio` y abortar todos los controllers activos dentro de `stop()`.

  11. **Input de nombre rechaza caracteres latinos**
      - `src/components/kinetic/AgentWizard.tsx:366`
      - `replace(/[^A-Z0-9_]/g, '')` elimina Ñ, acentos, etc. Para es-MX esto es un bug de localización.
      - *Fix:* usar `\p{L}\p{N}` con flag `u` o `[^A-ZÁÉÍÓÚÜÑ0-9_]`; sanitizar espacios/speciales pero permitir nombres locales.

  ---

  **P2 — Medio / inconsistencia o deuda**

  12. **`avatar` se valida como slug genérico, no contra IDs reales**
      - `src/lib/mascot.ts:125`, `api/agent-setup.ts:38`
      - `sanitizeMascot` y `isValidMascot` aceptan cualquier slug `^[a-z0-9-]{1,32}$`, no verifican contra `MASCOT_AVATARS`. Se puede persistir un avatar inexistente.
      - *Fix:* exportar `VALID_MASCOT_AVATARS = MASCOT_AVATARS.map(a => a.id)` desde `mascot.ts` y validar `avatar` contra ese set en cliente y servidor.

  13. **`VALID_MARKETS` en servidor difiere de los mercados del wizard**
      - `api/agent-setup.ts:44`, `src/components/kinetic/AgentWizard.tsx:38-56`
      - El servidor acepta `MSFT` y `XAG`, pero el wizard no los muestra. También `MARKET_CATEGORIES` no exporta la fuente de verdad.
      - *Fix:* compartir un único array `VALID_MARKETS` importado tanto por el wizard como por `agent-setup`.

  14. **PMREM/Environment se regenera por cada instancia**
      - `src/components/kinetic/mascot3d/MascotScene.ts:94-98`
      - Cada `BobbyMascot3D` crea su propio `RoomEnvironment` + `PMREMGenerator`. En el wizard + chat + VoiceRoom se generan múltiples.
      - *Fix:* compartir una textura de environment estática (singleton) entre instancias; crearla lazy solo cuando se cargue un GLB.

  15. **Clave de caché de voz no invalida cambios de voz/provider**
      - `src/hooks/useBobbyVoice.ts:86`
      - `cacheKey = hashText(text + voice + lang + vibe)` no incluye formato ni provider. Si se cambia de OpenAI a Edge o de `mp3` a `opus`, se puede devolver audio cacheado incorrecto.
      - *Fix:* incluir `voice`, `lang`, `vibe`, `format` y `provider` en la clave.

  16. **`mousemove` escucha `window` para cada instancia montada**
      - `src/components/kinetic/BobbyMascot3D.tsx:45-56`
      - Con varias instancias, cada una procesa todos los eventos de mouse.
      - *Fix:* usar listener local sobre `hostRef` con throttle, o un único listener compartido.

  17. **Geometría procedural y antialias son pesados para móvil**
      - `src/components/kinetic/mascot3d/MascotScene.ts:81`, `199`
      - `antialias: true` y `SphereGeometry(1, 48, 48)` consumen GPU en móviles de gama baja.
      - *Fix:* detectar capacidad (`navigator.hardwareConcurrency`, `matchMedia('(pointer: coarse)')`) y reducir segmentos/deshabilitar antialias en low-end.

  ---

  **P3 — Bajo / pulido y deuda menor**

  18. **Draco decoder no se precarga**
      - `src/components/kinetic/mascot3d/MascotScene.ts:22-30`
      - El primer GLB paga latencia extra por descargar `/draco/draco_decoder.wasm`.
      - *Fix:* agregar `<link rel="preload" href="/draco/draco_decoder.wasm" as="fetch" crossorigin>` o hacer warm del loader en idle.

  19. **`Cache-Control` en respuesta POST no tiene efecto**
      - `api/bobby-voice-free.ts:39`
      - El endpoint es POST; la caché HTTP no almacena respuestas POST. La cabecera es engañosa.
      - *Fix:* quitar `Cache-Control` o migrar a GET con `text` hasheado en la URL para caché real.

  20. **Migration guard esconde errores de schema**
      - `api/agent-setup.ts:142-150`
      - Si el error contiene "mascot" se reintenta sin la columna, ocultando que la migración no se aplicó.
      - *Fix:* aplicar la migración de forma explícita antes del deploy; eliminar el retry silencioso y exponer el error.

  21. **Perfiles legacy `male`/`female` no se mapean en el wizard**
      - `src/components/kinetic/AgentWizard.tsx:60-65`, `api/agent-setup.ts:19`
      - Si un perfil existente tiene `voice='male'`, el wizard no lo reconoce como seleccionado.
      - *Fix:* al cargar perfil, mapear `male→ash` y `female→coral`; persistir siempre el id nuevo.

  22. **Consentimiento no es auditable**
      - `src/components/kinetic/AgentWizard.tsx:664-669`
      - El checkbox de consentimiento no guarda timestamp ni versión. Para un producto financiero masivo, no es trazable.
      - *Fix:* almacenar `consented_at` y `consent_version` en `agent_profiles` durante `handleDeploy`.

