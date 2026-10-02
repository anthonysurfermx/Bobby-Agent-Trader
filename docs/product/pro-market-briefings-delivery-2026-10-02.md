# Resúmenes de mercado Bobby Pro — entrega local build 53 (2 oct 2026)

Rama `feat/pro-briefings-b53` (worktree `.claude/worktrees/pro-briefings-b53`, base `main` b96e4ee). **Nada desplegado,
ninguna migración aplicada en remoto, ninguna capacidad Apple cambiada, ninguna notificación enviada, ningún gasto real.**
Contrato de implementación: [pro-market-briefings-implementation.md](pro-market-briefings-implementation.md). Activación:
[pro-market-briefings-runbook.md](pro-market-briefings-runbook.md).

## Decisiones de implementación (detalle en el contrato, §0)

- Sin LLM por usuario: una narrativa compartida por (cadencia, periodo, idioma); la "síntesis personal" es composición
  determinista (activos seguidos + memoria consentida). La memoria nunca llega a un proveedor de IA. Coste O(periodos × idiomas).
- Audio compartido por hash (texto, voz, idioma, estilo, modelo) en bucket privado `briefing-audio` de Supabase Storage,
  servido solo por la API autenticada.
- Dos funciones Vercel: `api/briefings.ts` (router; rewrites para las rutas del contrato) y `api/briefing-worker.ts` (cron `*/5`).
- Cadencias adoptadas por configuración: solo `morning` (08:00 NY) por defecto; cierre y semanal implementados con la
  propuesta pero `configured:false` hasta aprobación.

## Paquetes, cambios y checks (comandos del commit final)

| Paquete | Archivos principales | Evidencia |
|---|---|---|
| 1 Preferencias | `api/briefings.ts` (`op=settings`), `BriefingsCenter.swift`, `BriefingsSettingsView.swift` | API 225 checks; iOS `BriefingsCenterTests` (A→B, guardar tras respuesta, 409, permiso denegado conserva selección, Pro vencido desactiva) |
| 2 Persistencia | `migrations/20261002180000_pro_briefings.sql`, `scripts/briefings-pg-harness.mts` | `test:briefings-pg` 582 checks en PG17 local (RLS/grants, unicidad, SKIP LOCKED, fencing, CAS, aislamiento A/B, purga) |
| 3 Calendario y motor | `calendar.ts`, `evidence.ts`, `narrative.ts`, `compose.ts`, `api/_lib/market-snapshot.ts` (extraído de bobby-intel sin cambiar su salida) | calendario 142 (DST 2026/2027, festivos verificados, cierres anticipados, semana cruzando año, cron duplicado/perdido); contenido 149 |
| 4 Presupuesto | `budget.ts`, `providers.ts` (un intento HTTP por llamada), RPCs `bobby_brief_budget_*` | core 237; PG: topes y plazas no se exceden con 10+ reservas concurrentes; `unknown` bloquea reintento ciego |
| 5 Push | `apns.ts` (HTTP/2, JWT ES256), `push-crypto.ts`, `op=device`, `PushRegistrar.swift`, entitlement `aps-environment` | core (payload genérico, mapeo de estados APNs); PG rebind A→B, rotación, revocación tardía; iOS `PushRegistrarTests` |
| 6 iOS | `ios/Bobby/Sources/Briefings/*`, `AccountSheet`, `NucleoSession/RootView`, `NeuralVoice`, build 53 | ver sección iOS abajo |
| 7 Privacidad | triggers de memoria en la migración, `MemoryView.swift`, `PrivacyPage.tsx`, runbook | PG: pausa/borrado de memoria retira contenido personal pendiente; retención no purga |
| Orquestación | `worker.ts`, `api/briefing-worker.ts` | worker 143 (99 unit + 44 end-to-end contra PG real: replay de cron sin duplicados, expiración, rebind A→B, Pro vencido sin push, reconciliación) |

Regresiones existentes en verde: `tts-routing`, `user-memory` (112), `api-security` (51), `llm-ledger`, `voice-brief`;
`npm run check:api` y `npm run build` correctos. CI: `test:briefings` en el job de aplicación; PG/API/worker en el job
Postgres con bases propias.

## Coste

**No medido.** No hubo llamadas reales a proveedores. Modelo para medir en staging (runbook §h):
narrativas = cadencias × idiomas por periodo (≈ 2–6/día) con Sonnet 5.5; TTS = segmentos compartidos × voces × idiomas,
bajo demanda + pre-síntesis matutina. Las filas van a `bobby_llm_usage` (superficies `briefing` y `briefing-voice`) y
cuentan también contra el tope global del Desk (`bobby_llm_spend` suma todas las superficies).

## Pendientes (requieren autorización o decisión)

1. Decisiones de producto: días del matutino, cierre +15, semanal dom 18:00, ventana 07:30–08:30, retención (D11).
2. Apple: clave APNs `.p8`, Push en el App ID `xyz.bobbyprotocol.bobby`, respuestas de App Privacy (token push, id de
   instalación, datos de resúmenes). El primer archivo firmado de build 53 necesita la capacidad Push habilitada.
3. Entorno: `BOBBY_PUSH_TOKEN_KEY`, `BOBBY_APNS_*`, topes `BOBBY_BRIEFINGS_*_CAP_USD`, `CRON_SECRET`; plan Vercel Pro (cron `*/5`).
4. Migración: aplicar en staging tras `20261002120000_admin_truth_r2` (dashboard); verificar bucket privado y postchecks.
5. Staging: 100 entregas en cola + 20 aperturas simultáneas de cuentas distintas con proveedores reales; coste medido.
6. iPhone físico: recepción APNs real, toque en frío/caliente, cambio de cuenta, silencio, segundo plano.
7. Conocidos (de los agentes): limpieza de objetos huérfanos en Storage si falla el borrado; reinstalación que pierde la
   credencial del Keychain y conserva token → `conflict` sin ruta de recuperación; rotar `BOBBY_PUSH_TOKEN_KEY` exige
   re-registro; calendario cubre 2026–2027; validación numérica conservadora (puede caer a facts-only); pantallas iOS sin
   revisión visual (solo tests y compilación).
