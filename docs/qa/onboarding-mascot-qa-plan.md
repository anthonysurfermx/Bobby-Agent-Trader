# QA: Onboarding con mascota 3D (AgentWizard + BobbyMascot3D)

> Alcance: `src/components/kinetic/AgentWizard.tsx`, `src/components/kinetic/BobbyMascot3D.tsx`, `src/components/kinetic/mascot3d/MascotScene.ts`, `src/pages/DeployAgentPage.tsx`, `api/agent-setup.ts`, `api/bobby-voice-free.ts`.

---

## 1. Checklist de QA manual por paso del wizard

### Happy path

| Paso | UI / Acción | Resultado esperado |
|------|-------------|-------------------|
| 0 · Nombre | Escribir `LUMI`, tocar sugerido `BOBBY`, dejar vacío | Input en mayúsculas, máx 12 chars; CTA habilitado solo si ≥2 chars (`AgentWizard.tsx:365-367`) |
| 1 · Look | Seleccionar avatar #1, luego #2 | Mascota cambia sin remontar WebGL; `lookPulse` aumenta y reacciona (`AgentWizard.tsx:321-322`) |
| 2 · Vibe + voz | Elegir vibe "Directo", tocar voz "Cálida" | Se reproduce preview; icono cambia a stop; segunda tap pausa (`AgentWizard.tsx:261-299`) |
| 3 · Mercados | Seleccionar BTC, ETH, SOL, DOGE, XRP; intentar 6to | Límite duro a 5; contador `5/5`; CTA habilitado con ≥1 (`AgentWizard.tsx:325-328`) |
| 4 · Cadencia + delivery | Elegir 24h, togglear Telegram | Web siempre checked; email disabled; Telegram togglea (`AgentWizard.tsx:707-724`) |
| 5 · Launch | Checar consentimiento, tocar DESPERTAR | Aparecen 4 steps, luego "está despierto"; redirige a `/agentic-world/bobby` (`AgentWizard.tsx:333-363`) |

### Edge cases

| Caso | Paso(s) | Pasos para reproducir | Resultado esperado |
|------|---------|----------------------|-------------------|
| Sin wallet | 5 | Desconectar wallet, completar wizard | `address` es `NOT CONNECTED`; `DeployAgentPage.tsx:32` devuelve `savedRemote: true` (diseñado local-only); `localOnly` NO aparece |
| Firma rechazada | 5 | Conectar wallet, rechazar firma en wallet | Wizard muestra `t.localOnly` (ámbar); `DeployAgentPage.tsx:72-75` devuelve `savedRemote: false`; perfil queda en localStorage |
| Sin red (API) | 5 | Conectar wallet, desconectar red antes de deploy | Mismo que arriba: `savedRemote: false`, no crash, no spinner infinito |
| Sin red (precios) | 3 | Bloquear `/api/okx-tickers` | Lista de mercados renderiza; precios no aparecen; selección funciona (`AgentWizard.tsx:307-318`) |
| WebGL no disponible | 1-2 | Forzar `webglFailed=true` o deshabilitar WebGL | `BobbyMascot3D.tsx:81-82` renderiza `<BobbyMascot>` SVG; wizard continúa usable |
| Contexto WebGL perdido (iOS) | Cualquiera | Simular `webglcontextlost` | `MascotScene.ts:132-137` → `onContextLost` → fallback SVG; no blank canvas |
| `prefers-reduced-motion` | 1-5 | Activar "Reducir movimiento" en SO | `MascotScene.ts:124`, `388-398`: mascota estática sin bob/blink/cursor-follow/bounce; animaciones de paso en UI deben respetarse (Verificar `framer-motion` respeta reduced-motion) |
| Idioma ES/EN/PT | 0-5 | Cambiar `ES → EN → PT` en paso 0 | Todo el copy cambia: títulos, botones, disclaimer, previewLine (`AgentWizard.tsx:88-216`); voz preview respeta `lang` enviado a `/api/bobby-voice-free` |
| SKIP en paso 0 | 0 | Tocar SALTAR | Guarda default mascot (`MASCOT_AVATARS[0]` o `DEFAULT_MASCOT`) y navega (`AgentWizard.tsx:408-411`) |
| SKIP en paso 1-4 | 1-4 | Tocar SALTAR | Mantiene defaults y salta; no rompe validaciones |
| SKIP no disponible | 5 | Llegar a launch | Botón SKIP no se renderiza; disclaimer no se puede saltar (`AgentWizard.tsx:403`) |
| Preview de voz falla | 2 | Bloquear `/api/bobby-voice-free` | Aparece `previewFail`; voz queda seleccionada; CTA funciona (`AgentWizard.tsx:594-596`) |
| Preview de voz race condition | 2 | Tocar voz A, luego rápido voz B | Solo suena la última seleccionada; `previewSeqRef` invalida fetchs viejos (`AgentWizard.tsx:249-264`) |
| Input de nombre con caracteres especiales | 0 | Escribir `ñoño_123$%` | Solo conserva `A-ZÁÉÍÓÚÜÑ0-9_` (`AgentWizard.tsx:457`) |
| Navegación back | 1-4 | Tocar `<` | Vuelve al paso anterior; estado previo se conserva; preview se detiene (`AgentWizard.tsx:384`) |

---

## 2. Matriz de dispositivos mínima

| Dispositivo | SO / Navegador | Qué cubre específicamente |
|-------------|---------------|--------------------------|
| iPhone 14+ | iOS 17+, Safari | WebGL/context loss, `prefers-reduced-motion`, audio autoplay de TTS preview, viewport fijo, navegación gestual back |
| Android (Pixel/Samsung) | Android 13+, Chrome | WebGL ANGLE, tamaños de canvas, input de texto, reducir movimiento, botones pequeños |
| Desktop | macOS / Windows, Chrome + Safari | Flujo completo, DevTools para WebGL fallback, firma con wallet (MetaMask/Rabby), audio multi-tab |
| Desktop (opcional) | Firefox | GL diferente, verificar que `powerPreference: 'low-power'` no rompe init |

### Matriz de casos cruzados

| Caso | iPhone Safari | Android Chrome | Desktop Chrome | Desktop Safari |
|------|--------------|----------------|----------------|----------------|
| Happy path completo | ✓ | ✓ | ✓ | ✓ |
| WebGL fallback | ✓ (simular) | ✓ (simular) | ✓ (simular) | ✓ (simular) |
| Context lost | ✓ (forzar en devtools) | ✓ | ✓ | ✓ |
| Reduced motion | ✓ | ✓ | ✓ | ✓ |
| Firma rechazada | ✓ (wallet mobile) | ✓ | ✓ | ✓ |
| Sin wallet | ✓ | ✓ | ✓ | ✓ |
| Cambio de idioma | ✓ | ✓ | ✓ | ✓ |
| Preview de voz | ✓ | ✓ | ✓ | ✓ |
| Deploy sin red | ✓ | ✓ | ✓ | ✓ |

---

## 3. Tests automatizables priorizados

### Vitest (unit/integration)

| # | Test | Qué asserta exactamente | Archivo objetivo |
|---|------|------------------------|------------------|
| 1 | `canContinue()` paso 0 | `expect(canContinue()).toBe(false)` con nombre `""`; `toBe(true)` con `"BO"` | `AgentWizard.tsx:365-367` |
| 2 | `canContinue()` paso 1 sin avatares | Con `MASCOT_AVATARS.length === 0`, `toBe(true)` sin avatar | `AgentWizard.tsx:368` |
| 3 | `canContinue()` paso 1 con avatares | Con `MASCOT_AVATARS.length > 0`, `toBe(false)` sin avatar, `toBe(true)` con avatar | `AgentWizard.tsx:368` |
| 4 | `toggleMarket()` límite 5 | Seleccionar 5 mercados; sexto toggle no aumenta array; deseleccionar uno permite otro | `AgentWizard.tsx:325-328` |
| 5 | Normalización de nombre | `"ñoño-123$%"` → `"ÑOÑO_123"` (regex `[^A-ZÁÉÍÓÚÜÑ0-9_]`) | `AgentWizard.tsx:457` |
| 6 | Fallback de idioma | `navigator.language = 'fr'` + sin `localStorage` → `lang === 'en'` | `AgentWizard.tsx:231-232` |
| 7 | Sanitización server-side de mascot | Enviar `{body:"hacker",eyes:"round",accessory:"none"}` → `400 Invalid mascot` | `api/agent-setup.ts:121-126` |
| 8 | Rate limit TTS | 16 requests en <10min → segundo bloqueado (según `enforcePublicRateLimit`) | `api/bobby-voice-free.ts:21` |
| 9 | Validación de cadence_hours | `cadence_hours=8` → `400`; `cadence_hours=6` → `202` | `api/agent-setup.ts:98-101` |

### Playwright (E2E)

| # | Test | Qué asserta exactamente | Archivo objetivo |
|---|------|------------------------|------------------|
| 10 | Happy path E2E | Completar wizard hasta ver texto "YA ESTÁ DESPIERTO" / "IS AWAKE"; URL cambia a `/agentic-world/bobby` | `AgentWizard.tsx` + `DeployAgentPage.tsx` |
| 11 | WebGL fallback automático | Forzar `WebGLRenderer` a fallar; assert que se renderiza el SVG fallback (`<svg>` o clase de `BobbyMascot`) y el CTA continúa habilitado | `BobbyMascot3D.tsx:36-38`, `81-82` |
| 12 | Skip en paso 0 | Click en SKIP; assert `navigate('/agentic-world/bobby')` y `localStorage.agent_profile` existe con default mascot | `AgentWizard.tsx:408-411`, `DeployAgentPage.tsx:83-85` |
| 13 | Firma rechazada | Mock `signMessageAsync` para reject; assert texto `localOnly` visible y wizard no redirige inmediatamente | `DeployAgentPage.tsx:46-48`, `72-75`, `AgentWizard.tsx:803-805` |
| 14 | `prefers-reduced-motion` | Emular media query; assert que no hay requestAnimationFrame de animación o que la escena se renderiza estática (puede validarse por ausencia de transformaciones en canvas tras N ms) | `MascotScene.ts:124`, `388-398` |
| 15 | Preview de voz race condition | Tocar voz A, inmediatamente voz B; interceptar `/api/bobby-voice-free`; assert que solo se reproduce el blob de B (validar `audio.src` o que no hay error de reproducción) | `AgentWizard.tsx:261-299` |

### Notas de implementación

- Para Vitest: extraer `canContinue`, `toggleMarket`, y la regex de nombre a funciones puras testeables, o testearlos renderizando el componente con `@testing-library/react`.
- Para Playwright: usar `page.route` para interceptar `/api/okx-tickers`, `/api/bobby-voice-free`, `/api/agent-setup`.
- Para WebGL: inyectar en la página `HTMLCanvasElement.prototype.getContext = () => null` antes de montar.
- Para wallet: mockear `window.ethereum` o usar `msw`/`playwright` para interceptar `wagmi` hooks si es viable; de lo contrario, testear `DeployAgentPage` montando el componente con `signMessageAsync` mockeada vía Vitest + `@testing-library/react`.

---

## 4. Riesgos de regresión más probables

| # | Riesgo | Por qué pasa | Qué validar al cambiar código |
|---|--------|--------------|------------------------------|
| 1 | Fuga de memoria WebGL / context loss silencioso | `MascotScene.ts` crea texturas, geometrías y `RoomEnvironment`; avatares GLB cargan texturas. Un cambio en `setLook`, `buildProcedural` o `dispose` puede dejar recursos sin liberar. | Perfilar memoria GPU al cambiar de avatar 20 veces; verificar `disposeObject` recorre todos los meshes y texturas (`MascotScene.ts:39-52`). |
| 2 | Race condition en preview de voz | `previewSeqRef` y `AbortController` manejan concurrencia. Cualquier refactor del efecto de audio puede hacer que un preview antiguo sobreescriba al nuevo o deje `loadingVoice` atascado. | Test #15; verificar que `stopPreview()` se llama antes de cada `playPreview()` y que `seq` se compara tras cada `await` (`AgentWizard.tsx:249-298`). |
| 3 | El wizard permite continuar sin datos mínimos | `canContinue()` es crítico. Un cambio en validaciones puede permitir deploy sin nombre, sin avatar o sin mercados, lo que `api/agent-setup.ts` rechazará con 400, causando `savedRemote: false` innecesario. | Asegurar que `canContinue()` se mantiene sincronizado con validaciones del backend (`AgentWizard.tsx:365-372` vs `api/agent-setup.ts:84-119`). |
| 4 | Fallback SVG no se muestra o se rompe la interacción | Si `BobbyMascot3D` cambia su lógica de detección de WebGL o si `BobbyMascot` no recibe las mismas props (`look`, `state`, `analyser`), usuarios con WebGL bloqueado ven pantalla en blanco o mascota sin estado. | Probar en modo WebGL deshabilitado; verificar que `BobbyMascot` soporta `state='speaking'`/`'thinking'` y que `onPointerDown` no es crítico para continuar (`BobbyMascot3D.tsx:81-82`). |
| 5 | i18n incompleta o texto de consentimiento no traducido | El copy en `COPY` es extenso. Agregar un paso o campo sin traducción en `es/en/pt` rompe la experiencia; peor, cambiar el disclaimer legal puede invalidar el consentimiento. | Cada vez que se toca `COPY`, validar que las 3 claves existen y que `t.consent`/`t.consentCheck` se renderizan en el idioma activo (`AgentWizard.tsx:88-216`, `758-765`). |
