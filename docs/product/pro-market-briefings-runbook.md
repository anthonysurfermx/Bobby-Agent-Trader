# Resúmenes de mercado Bobby Pro — runbook de activación (build 53)

Para Anthony. Contrato técnico: [implementation spec](pro-market-briefings-implementation.md) (decisiones D1–D11,
§1 variables, §3 RPCs). Diseño: [build-53](pro-market-briefings-build-53.md). API: [contratos](pro-market-briefings-api-contracts.md).

Este documento **no autoriza nada por sí solo**: cada paso marcado con 🔐 (Apple, Vercel prod, migración remota, envío
real) necesita tu aprobación explícita en el momento. El orden importa: no saltes al siguiente bloque sin cerrar el anterior.

Archivos clave:
- Config y defaults: `api/_lib/briefings/config.ts` (`RETENTION`, `LIMITS`, `PUSH_COPY`, `COMPANION_VOICES`).
- Calendario NYSE y ventanas: `api/_lib/briefings/calendar.ts` (`NYSE_CALENDAR_VERSION = nyse-2026-2027-v1`).
- Router HTTP: `api/briefings.ts` · Worker cron: `api/briefing-worker.ts` + `api/_lib/briefings/worker.ts`.
- Migración: `supabase/bobby-protocol/supabase/migrations/20261002180000_pro_briefings.sql`.
- Privacidad: `src/pages/PrivacyPage.tsx` (sección "Market briefings and notifications (Bobby Pro)").
- iOS: `ios/Bobby/Sources/Briefings/`, `project.yml` (build 53, `aps-environment`).

---

## (a) Decisiones pendientes — cada una vive en una variable o constante

Hoy solo está **confirmado** el resumen de las 08:00 hora de Nueva York. Todo lo demás es propuesta:

| # | Decisión | Propuesta actual | Dónde se codifica |
|---|---|---|---|
| P1 | Mañana en días sin sesión (fines de semana, feriados) | Todos los días; acciones marcadas "cerrado", cripto 24/7 | `BOBBY_BRIEFINGS_MORNING_DAYS` = `all` (alt. `sessions`) |
| P2 | Resumen de cierre | Cierre oficial +15 min, respeta cierres anticipados | Se activa agregando `close` a `BOBBY_BRIEFINGS_CADENCES` (el +15 está en `calendar.ts`) |
| P3 | Semanal | Domingo 18:00 NY, intervalo `[domingo anterior 18:00, este domingo 18:00)` | Se activa agregando `weekly` a `BOBBY_BRIEFINGS_CADENCES` |
| P4 | Ventana de preparación | Prepara 07:30, listo 07:59, push 08:00, expira 08:30 | `calendar.ts` (`POLICY_VERSION = proposed-v1`) |
| P5 | Retención (D11) | Reportes 90 d, audio 14 d, outbox 30 d, intentos 400 d, dispositivos revocados 30 d, idempotencia 24 h, evidencia compartida 120 d | `RETENTION` en `config.ts` (parámetros de `bobby_brief_purge`) |
| P6 | Switches iniciales | Todos apagados hasta que la persona los active | Default de `bobby_brief_settings_get` (sin fila = todo off) |
| P7 | Memoria en resúmenes | Apagado hasta revisar App Privacy | `BOBBY_BRIEFINGS_MEMORY` = off |
| P8 | Calendario NYSE 2026–2027 | Fechas en `calendar.ts` | **Verificar contra nyse.com** antes de activar `close` |

Si cambias P5, actualiza también la sección de privacidad (dice "valores vigentes al lanzamiento") y `EFFECTIVE_DATE`.
`BOBBY_BRIEFINGS_CADENCES` por defecto es solo `morning`: cierre y semanal aparecen en Perfil como "horario pendiente".

## (b) Apple 🔐

1. **APNs Auth Key (.p8)**: developer.apple.com → Certificates, Identifiers & Profiles → Keys → "+" → marca
   *Apple Push Notifications service (APNs)*. Descarga el `.p8` (solo se puede bajar una vez) y anota el **Key ID** y
   el **Team ID**. Guárdalo en Keychain/gestor de contraseñas, nunca en el repo.
2. **App ID `xyz.bobbyprotocol.bobby`**: Identifiers → el App ID → activa la capability **Push Notifications** → Save.
3. **Perfiles / archivos**: regenera los provisioning profiles después del paso 2. Verifica en el archive de build 53
   que el entitlement `aps-environment` existe y vale **`production`** (TestFlight y App Store usan production; el
   servidor solo acepta los entornos de `BOBBY_APNS_ENVIRONMENTS`, default `production`). No uses
   `codesign -d --entitlements -` dentro de archives (ver memoria de ASC); revisa el `.app` exportado o el perfil.
4. **App Privacy en App Store Connect** — revisar, no asumir. Cosas que hay que comparar con lo que hace el código:
   - ¿El token de push y el identificador de instalación cuentan como algún tipo de "identificador" vinculado a la
     cuenta? (se guardan cifrados/hasheados pero ligados a la identidad).
   - ¿Los activos seguidos, las elecciones de resúmenes y los reportes cuentan como "interacción con el producto" u
     otro tipo de contenido? ¿Están vinculados a la identidad? (sí, por cuenta).
   - Si se activa `BOBBY_BRIEFINGS_MEMORY`, cómo se declara el uso de la memoria para personalizar.
   - Mantén en paso `docs/app-store/build-35/APP-PRIVACY-ANSWERS.md` (o su sucesor) y la página de privacidad.
   Lee las definiciones actuales de Apple en la pantalla de App Privacy antes de elegir categorías.

## (c) Variables de Vercel (spec §1) 🔐

Primero en **Preview/staging**, después en Production. Nunca en Git.

| Variable | Valor | Nota |
|---|---|---|
| `BOBBY_BRIEFINGS_ENABLED` | **sin definir / off** | Se prende solo cuando pase staging (e) y el iPhone (f) |
| `BOBBY_BRIEFINGS_CADENCES` | `morning` | Agregar `close`, `weekly` solo cuando se aprueben P2/P3 |
| `BOBBY_BRIEFINGS_MORNING_DAYS` | `all` o `sessions` | P1 |
| `BOBBY_BRIEFINGS_DAILY_CAP_USD`, `BOBBY_BRIEFINGS_MONTHLY_CAP_USD` | tú decides | **Obligatorias**: sin ellas = `budget_unavailable`, no hay gasto pagado (solo texto "facts-only") |
| `BOBBY_BRIEFINGS_LLM` | default `anthropic:claude-sonnet-5-5,openai:gpt-4o-mini` | Orden de proveedores |
| `BOBBY_BRIEFINGS_LLM_MAX_TOKENS` | default 3000 | Techo por intento |
| `BOBBY_BRIEFINGS_TTS_RESERVE_USD_PER_CHAR` / `_ESTIMATE_USD_PER_CHAR` | default 0.00004 / 0.000017 | Recalibrar con staging (h) |
| `BOBBY_BRIEFINGS_LLM_SLOTS`, `BOBBY_BRIEFINGS_TTS_SLOTS` | default 2 / 2 | Concurrencia global |
| `BOBBY_BRIEFINGS_SETTLE_SECONDS` | default 300 | Reconciliación de intentos "unknown" (D8) |
| `BOBBY_BRIEFINGS_MEMORY` | off | P7 |
| `BOBBY_PUSH_TOKEN_KEY` | `openssl rand -base64 32` | Genera uno **distinto** por entorno. Sin él: registro de dispositivo = 503 |
| `BOBBY_APNS_KEY_ID`, `BOBBY_APNS_TEAM_ID` | del paso (b1) | 10 caracteres cada uno |
| `BOBBY_APNS_PRIVATE_KEY` | contenido PEM del `.p8` (`\n` escapados se aceptan) | Sin él: el despacho se pausa, las filas esperan hasta expirar |
| `BOBBY_APNS_TOPIC` | default `xyz.bobbyprotocol.bobby` | Solo config del servidor |
| `BOBBY_APNS_ENVIRONMENTS` | `production` | Agregar `sandbox` solo en staging si pruebas builds de desarrollo |
| `CRON_SECRET` | no vacío | Sin él el worker responde 503 |
| `BOBBY_OPS_SECRET` | no vacío, distinto de `CRON_SECRET` | Disparo manual del worker (e) |

Generar la llave sin imprimirla en logs compartidos:
`openssl rand -base64 32 | vercel env add BOBBY_PUSH_TOKEN_KEY preview` (y aparte para `production`).

**Plan de Vercel**: el worker corre `*/5 * * * *`. Hobby solo permite crons diarios; Pro permite precisión de minutos.
Los crons actuales (`*/10`, `*/15` en `vercel.json`) sugieren que ya estás en Pro — confírmalo en el dashboard antes.
El build agrega 2 funciones (`api/briefings.ts`, `api/briefing-worker.ts`); revisa el conteo de funciones del plan.

Ojo con el gasto global: `bobby_llm_spend()` suma **todas** las superficies, así que lo que el worker registre en
`bobby_llm_usage` (`briefing`, `briefing-voice`) también cuenta para `BOBBY_LLM_DAILY_CAP_USD` / `MONTHLY` del desk.

## (d) Migración 🔐

1. Orden: `20261002180000_pro_briefings.sql` va **después** de `20261002120000` (la migración del dashboard, en otra
   rama). Verifica con `list_migrations` que la 120000 ya está aplicada en el proyecto destino.
2. **Staging primero.** Nunca prod sin haber pasado (e).
3. Bucket: la migración crea `briefing-audio` solo si existe el schema `storage`. Verifica después:
   `select id, public from storage.buckets where id = 'briefing-audio';` → debe existir y `public = false`.
   No debe haber políticas sobre `storage.objects` para ese bucket (solo service role).
4. Postchecks (SQL de solo lectura):
   - RLS activado en las 9 tablas `bobby_brief_*` / `bobby_push_devices`:
     `select relname, relrowsecurity from pg_class where relname like 'bobby_brief%' or relname = 'bobby_push_devices';`
   - Sin grants a `anon`/`authenticated`/`public` (recuerda el gotcha del ACL por defecto de Supabase):
     `select table_name, grantee, privilege_type from information_schema.role_table_grants where (table_name like 'bobby_brief%' or table_name = 'bobby_push_devices') and grantee in ('anon','authenticated','PUBLIC');` → 0 filas.
   - Funciones `bobby_brief_*` / `bobby_push_device_*`: `has_function_privilege('anon', oid, 'execute')` = false y
     lo mismo para `authenticated`.
   - FKs `identity_id … on delete cascade` presentes (borrar cuenta no necesita código nuevo).
   - Correr `get_advisors` (security) y revisar que no aparezcan las tablas nuevas.

## (e) Protocolo de staging

Con `BOBBY_BRIEFINGS_ENABLED=on` **solo en el entorno de staging** (Preview, `VERCEL_ENV !== 'production'`):

1. **Disparo controlado** (el cron real apunta a producción): `POST /api/briefing-worker?at=<ISO>` con header
   `x-bobby-ops: <BOBBY_OPS_SECRET>`. El override `at=` solo funciona fuera de producción. Úsalo para simular 07:30
   (preparación), 08:00 (despacho), 08:31 (expiración) y un cambio de horario (DST, marzo/noviembre).
2. **Carga**: 100 entregas en cola y 20 aperturas simultáneas de reportes desde 20 cuentas distintas
   (`scripts/test-briefings-load-pg.mts` lo cubre en PG local; en staging repetir con cuentas de prueba reales).
3. **Qué medir** (no inventar números; anotar lo observado):
   - Tiempo de preparación: desde el claim de 07:30 hasta `ready` de todos los reportes (¿antes de 07:59?).
   - Costo LLM y TTS por periodo: `bobby_brief_provider_attempts` (reservado vs. liquidado, `settled_assumed`) y
     `bobby_llm_usage where surface in ('briefing','briefing-voice')`. `bobby_brief_budget_status()` para el total.
   - Tasa de reuso de audio: segmentos pedidos vs. síntesis realmente hechas (`bobby_brief_audio` por `cache_key`).
   - Reintentos: `attempts` en shared/briefs/outbox; intentos en estado `unknown` y cómo se reconciliaron.
   - Errores HTTP del router por código (`[briefings]` en logs de Vercel).
4. **Umbrales de aceptación — preguntas abiertas para ti**: ¿qué % de reportes listos antes de 07:59 es aceptable?
   ¿Costo máximo por periodo? ¿Cuántos `unknown` por semana toleramos? ¿Latencia máxima de apertura con 20 simultáneas?

## (f) Protocolo en iPhone físico

Un HTTP 200 de APNs **no prueba** que llegó la notificación, y el simulador no prueba recepción real. Con build 53 de
TestFlight (entorno production) en un iPhone real:

1. Recepción real: activar "Apertura del mercado", aceptar permiso, disparar en staging, confirmar que el aviso llega
   con el texto genérico (sin nombre, símbolos ni cifras) en pantalla bloqueada.
2. Tap con la app cerrada (cold) y en segundo plano (warm): abre el reporte correcto y empieza la narración solo si
   hay consentimiento de audio.
3. Cambio de cuenta A→B en el mismo iPhone: un aviso de A no debe mostrar el reporte de A estando en B; A deja de
   recibir en ese iPhone.
4. Silencio (mute), app a segundo plano a mitad de narración, micrófono activo: la narración se detiene limpia.
5. Permiso denegado en iOS: Perfil muestra "Notificaciones bloqueadas en iOS" con enlace a Configuración, sin
   afirmar que está activo.
6. Recuperación: reinstalar la app, rotación de token, volver a dar permiso → sigue llegando sin duplicados.

## (g) Kill switches y rollback

- **Apagar todo el gasto y los envíos**: `BOBBY_BRIEFINGS_ENABLED` → off (efecto en la siguiente invocación; los
  reportes ya guardados siguen legibles).
- **Quitar una cadencia**: sacarla de `BOBBY_BRIEFINGS_CADENCES`.
- **Memoria**: `BOBBY_BRIEFINGS_MEMORY` → off; los nuevos reportes dejan de usar memoria.
- **Topes de gasto**: bajar o borrar `BOBBY_BRIEFINGS_DAILY_CAP_USD`/`MONTHLY` (sin topes = cero gasto pagado).
- **Pausar solo los envíos**: quitar `BOBBY_APNS_PRIVATE_KEY` (las filas esperan y expiran a las 08:30).
- **Llave APNs filtrada**: revocar la key en developer.apple.com, crear otra, actualizar `BOBBY_APNS_KEY_ID` y
  `BOBBY_APNS_PRIVATE_KEY`. Los tokens guardados siguen sirviendo.
- **`BOBBY_PUSH_TOKEN_KEY` filtrada**: rotarla tiene una consecuencia fuerte — con la llave nueva el servidor ya no
  puede descifrar los tokens guardados ni verificar huellas, recibos ni cursores: **todos los iPhones tienen que
  volver a registrarse** (verificar en iOS que `PushRegistrar` lo hace al abrir con sesión y permiso; si el rebind
  falla porque el recibo/credencial viejo ya no verifica, el registro nuevo puede chocar con la fila activa anterior).
  Hasta entonces nadie recibe avisos. Pregunta abierta: no existe todavía un procedimiento/RPC para revocar en bloque
  los registros con la llave vieja — definirlo antes de necesitarlo.
- **Rollback de código**: redeploy del commit anterior. La migración es aditiva; no hace falta revertirla. Si se
  quisiera quitar, se hace como una migración nueva aprobada, nunca a mano en prod.

## (h) Modelo de costo — llenar con mediciones de staging

Ningún número aquí está medido. Fórmula por periodo (una cadencia, un día):

```
costo_periodo ≈ (narrativas × idiomas × costo_por_narrativa)
              + (segmentos_TTS_únicos × voces_en_uso × idiomas × costo_por_segmento)
```

- `narrativas` = 1 por periodo y cadencia (D1: no hay llamada LLM por cuenta) — más reintentos y fallback.
- `idiomas` = idiomas con al menos un reporte pendiente (hoy `es`, `en`).
- `segmentos_TTS_únicos` ≤ 4 por reporte de ≤ 2,400 caracteres; solo se sintetizan bloques compartidos (D2).
- `voces_en_uso` = voces distintas entre suscriptores con consentimiento de audio (18 compañeros → menos voces).
- `costo_por_segmento` ≈ caracteres × `BOBBY_BRIEFINGS_TTS_ESTIMATE_USD_PER_CHAR` (OpenAI no devuelve uso).

| Medición | Valor medido en staging | Fecha |
|---|---|---|
| Costo por narrativa (tokens in/out, modelo) | _pendiente_ | |
| Caracteres promedio por segmento | _pendiente_ | |
| Voces distintas en uso | _pendiente_ | |
| Tasa de reuso de audio | _pendiente_ | |
| Reintentos / `unknown` por periodo | _pendiente_ | |
| Costo total por periodo (morning) | _pendiente_ | |

Con esos valores se fijan `BOBBY_BRIEFINGS_DAILY_CAP_USD` y `MONTHLY` con margen, y se recalibra
`BOBBY_BRIEFINGS_TTS_RESERVE_USD_PER_CHAR`. No anunciar costos hasta tener esta tabla llena.
