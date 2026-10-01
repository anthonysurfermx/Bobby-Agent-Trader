# Bobby 1.5 — punto de partida (2026-10-01)

Dónde quedamos al cerrar el push de la 1.5. Léelo primero al retomar.

## En revisión de Apple

- Un solo envío, enviado el 2026-10-01 14:25 UTC, en **Waiting for Review**. Contiene:
  - iOS 1.5 (build 52);
  - suscripción **Bobby Pro Monthly** (`xyz.bobbyprotocol.bobby.pro.monthly`, $4.99, Apple ID 6817775464);
  - su grupo **Bobby Pro** (22428158).
- **Liberación manual**: cuando Apple apruebe, alguien tiene que darle "Release" en App Store Connect.
- El envío viejo rechazado (build 38, guideline 5.0.0, China) se canceló. China continental sigue excluida de Availability.
- Las notas para el revisor explican cómo llegar a Profile → Bobby Pro / Restore Purchases y el respaldo Anthropic → OpenAI.
- **Gotcha**: la primera suscripción solo se puede enviar en el mismo borrador que la versión **y** su grupo. Hay que darle "Add for Review" a cada uno y luego "Submit for Review" al borrador.

## En producción (bobbyprotocol.xyz)

- Producción = deploy por Git de `main`. Último código: 44beebe (PRs #113–#116).
- `scripts/prod-source-guard.mjs` corre dentro de `npm run build` y rechaza builds de producción que no vengan de `main`. Así no se repite lo de la landing del 2026-10-01.
  - Override solo en emergencias: `--build-env BOBBY_ALLOW_OFF_MAIN_PROD=1`.
- **Pagos**:
  - `GET /api/bobby-access` → `payments.apple = true`.
  - El webhook de RevenueCat "Bobby prod" → `/api/revenuecat-webhook`: responde 401 sin auth y 200 al evento de prueba.
  - Las variables `REVENUECAT_SECRET_KEY` (V1 `sk_`) y `REVENUECAT_WEBHOOK_AUTH` están en Vercel prod.
  - Paid Apps Agreement, banco y formularios fiscales: Active.
- **LLM**:
  - Sonnet 5.5 contesta primero en todos los niveles. Si se queda sin crédito o da 429, el rol pasa a OpenAI, y al revés.
  - `BOBBY_LLM_PRIMARY=openai` invierte el orden.
- **Alertas**: si un proveedor se queda sin crédito llega un correo (Resend → `WAITLIST_NOTIFY_EMAIL`), máximo uno por proveedor cada 6 h. Los reportes de Trader Land también llegan por correo.
- **Voces**: las voces de los personajes usan OpenAI TTS. OpenAI se recargó con $15.

## Límites de uso: dónde viven y cómo cambiarlos

Todos son del servidor: **cambiarlos no requiere actualizar la app**.

| Quién | Límite hoy | Dónde vive | Cómo se cambia |
|---|---|---|---|
| Invitado (sin cuenta) | 3 lecturas Rápido por dispositivo (30 días) y 100 por red /24 por semana | `bobby_consume_read` (Postgres) | Migración SQL, ~1 min |
| Con cuenta (gratis) | 10 lecturas Rápido por 7 días, **solo si `BOBBY_PAYWALL=on`** | `bobby_consume_read` | Migración SQL |
| Profundo / Máximo | invitado 1/0 cada 30 días · gratis 3 y 1 por semana · Pro 60 y 10 cada 30 días | `LEVEL_LIMITS` en `api/_lib/desk-levels.ts` | Cambio de código + deploy |
| Bobby Pro | Rápido sin tope (uso justo) | `bobby_is_pro()` = suscripción activa o `bobby_pro_grants` vigente | — |

**⚠️ `BOBBY_PAYWALL` no está activado en producción**: hoy el tope de 10 por semana no aplica y las cuentas gratis tienen Rápido ilimitado. Profundo y Máximo sí se cobran.

- Activarlo **solo después de liberar la 1.5**. La 1.4 que está en la tienda no tiene compra dentro de la app: sus usuarios se toparían con el tope sin forma de pagar.
- Comando:
  ```bash
  printf on | vercel env add BOBBY_PAYWALL production
  ```
  Después, redeploy de `main`.

## Pendiente (1.6)

- Campo de cupón dentro de la app (1.6), mostrando el saldo de regalo en Profile.
- Límites configurables sin migración: una tabla `bobby_config` para cambiarlos en segundos.
- Voces fuera de OpenAI: que OpenAI quede solo para razonamiento. Requiere build 53, porque `NeuralVoice.swift:107` solo acepta audio con `X-TTS-Provider == "openai"`.
- Portugués dentro de la app (854 strings `L.t`). La ficha PT dice que la interfaz es EN/ES.
- Variables para revocar Sign in with Apple.
- Loop de referidos al borrar la cuenta.
- Apagar el proveedor de email de Supabase.
- Dynamic Type.

## Cupones (LIVE, PR #118)

- **Qué regalan**: lecturas extra, y opcionalmente Profundo y Máximo.
  - Se gastan solo cuando se acaba lo normal: el tope semanal gratis, que aplica cuando `BOBBY_PAYWALL=on`, o la ventana de Profundo/Máximo.
  - Nunca cuentan contra ese tope.
  - Si un análisis falla, el regalo se devuelve.
- **Dónde se canjean**: `bobbyprotocol.xyz/redeem?code=CODIGO`, con cuenta de Apple o Google, una vez por cuenta.
  - Como el regalo vive en la cuenta, también aplica en el iPhone: la app 1.5 lo gasta a través del servidor, sin cambio en la app.
- **Crear un cupón** (lo hago yo desde aquí con SQL en Supabase `qbvdqkknnuweatptjohi`):
  ```sql
  insert into bobby_coupons(code, reads, profundo, maximo, max_redemptions, expires_at, note)
  values ('AMIGOS-7K2Q', 20, 3, 1, 50, '2026-12-31', 'amigos del lanzamiento');
  ```
  - Usar códigos con parte aleatoria, no solo palabras: así es más difícil adivinarlos.
  - Para desactivarlo: `update bobby_coupons set active = false where code = '…'`.
  - Para ver canjes: `select * from bobby_coupon_redemptions where code = '…'`.
- **Límites anti-fuerza-bruta**: 10 intentos por hora por cuenta y 30 por red. Si el contador no está disponible, el canje se bloquea en vez de abrirse.
- **Riesgo aceptado**: quien borra su cuenta y crea otra puede volver a canjear el mismo cupón. Es el mismo caso que el loop de referidos pendiente para la 1.6, y el tope del cupón (`max_redemptions`) lo limita.
- **Apple (guideline 3.1.1)**: no hay campo de cupón dentro de la app iOS, y los cupones no regalan Bobby Pro. Para regalar Pro en iOS: Offer Codes de App Store Connect.
- **Pantallas**: `remaining` conserva su significado (límite − usado). El regalo viaja aparte en `bonus`.
  - La web lo muestra como "0/10 +20".
  - La app 1.5 muestra el conteo normal y aun así puede gastar el regalo.

## Al retomar

1. Revisar el estado del envío en App Store Connect: app 6804460489 → App Review.
2. Si aprueban: Release, luego activar `BOBBY_PAYWALL`, y probar una compra real de $4.99.
3. Si rechazan: leer el mensaje, arreglar y reenviar con un build nuevo. Subir `CURRENT_PROJECT_VERSION` en `ios/Bobby/project.yml`.
