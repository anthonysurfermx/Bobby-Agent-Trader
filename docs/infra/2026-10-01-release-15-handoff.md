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

- **Cupones** para regalar uso. Ver "Cupones" abajo.
- Límites configurables sin migración: una tabla `bobby_config` para cambiarlos en segundos.
- Voces fuera de OpenAI: que OpenAI quede solo para razonamiento. Requiere build 53, porque `NeuralVoice.swift:107` solo acepta audio con `X-TTS-Provider == "openai"`.
- Portugués dentro de la app (854 strings `L.t`). La ficha PT dice que la interfaz es EN/ES.
- Variables para revocar Sign in with Apple.
- Loop de referidos al borrar la cuenta.
- Apagar el proveedor de email de Supabase.
- Dynamic Type.

## Cupones (diseño propuesto, sin construir)

- **Tablas**:
  - `bobby_coupons`: `code`, `grants` (`reads` | `pro_days`), `amount`, `max_redemptions`, `expires_at`, `note`.
  - `bobby_coupon_redemptions`: una por cuenta por cupón.
- **Canje**:
  - RPC atómica `bobby_redeem_coupon(identity, code)` y acción `redeem-coupon` en `/api/bobby-access`.
  - Los Pro days reusan `bobby_pro_grants` con `source='coupon'`.
  - Las lecturas extra requieren que `bobby_consume_read` sume un saldo de bonus.
- **Dónde se canjea**:
  - Web: `bobbyprotocol.xyz/redeem` con sesión iniciada. Como va ligado a la cuenta, aplica también en iOS.
  - iOS: un campo en Profile en la 1.6.
- **Apple (guideline 3.1.1)**: un campo propio que desbloquee funciones *de pago* dentro de la app iOS es riesgo de rechazo.
  - Para regalar Bobby Pro en iOS lo seguro son los **Offer Codes** de App Store Connect, que RevenueCat ya reconoce.
  - Regalar lecturas gratis canjeadas en la web es lo más defendible.

## Al retomar

1. Revisar el estado del envío en App Store Connect: app 6804460489 → App Review.
2. Si aprueban: Release, luego activar `BOBBY_PAYWALL`, y probar una compra real de $4.99.
3. Si rechazan: leer el mensaje, arreglar y reenviar con un build nuevo. Subir `CURRENT_PROJECT_VERSION` en `ios/Bobby/project.yml`.
