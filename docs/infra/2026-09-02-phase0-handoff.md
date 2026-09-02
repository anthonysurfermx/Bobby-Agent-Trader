# Fase 0 — handoff para revisión y deploy

Rama: `feat/phase0-hardening` (worktree `.claude/worktrees/phase0`), basada
en `feat/web-companion` (lo que hoy está en producción). Fecha: 2026-09-02.
Nada se ha desplegado ni aplicado a ninguna base. Build y tipos en verde en
cada commit.

## Commits, en el orden que pidió Codex

| # | Commit | Gate |
|---|---|---|
| 1 | `refactor(db): one place that knows where Bobby's database is` | Helper único (`api/_lib/bobby-db.ts`, `src/lib/bobby-db-client.ts`). 0 referencias al proyecto legado en `api/`; quedan solo en `src/lib/supabase.ts`, el cliente compartido de DeFi México, a propósito. |
| 2 | `feat(ops): dynamic kill switches, pure dry-run and independent ops auth` | Kill switch dinámico y fail-closed (`bobby_control` o Edge Config), `dryrun`/canary = cero efectos externos, `BOBBY_OPS_SECRET` para ejecuciones manuales, latch on-chain honra el freeze, adiós llamadas a defimexico.org, `GET /api/bobby-health`. |
| 3 | `feat(api): browser writes move behind validated, rate-limited endpoints` | `write-guard` (freeze, método, origen, tamaño, zod, límite por IP y por wallet) y cuatro endpoints: `user-interests`, `agent-messages`, `forum-publish`, `telegram-connect`. El navegador ya no escribe con la anon key. |
| 4 | `feat(db): RLS hardening migration and the adversarial anon-key gate` | `supabase/migrations/20260902_bobby_rls_hardening.sql` y `scripts/infra/rls-adversarial.mts`. |
| 5 | `feat(early-access): Bobby's own list with consent and provenance` | `bobby_early_access` + endpoint con guardia; espejo a la newsletter conmutable por env. |

Corrección a la auditoría: los crons **sí** estaban protegidos por
`requireInternalAuth` (Bearer / `x-internal-secret`, comparación con
`timingSafeEqual` sobre SHA-256). Lo que faltaba era la autorización
independiente para ejecuciones manuales y un dry-run realmente puro; ambos
están en el commit 2.

## Variables nuevas en Vercel (`bobby-agent-trader`)

| Variable | Obligatoria | Para qué |
|---|---|---|
| `BOBBY_OPS_SECRET` | sí, si quieres ejecutar ciclos a mano | Autoriza `POST /api/bobby-cycle` y `POST /api/settle-trades`. Sin ella, las ejecuciones manuales responden 503 (fail-closed). Los crons (GET) siguen con `CRON_SECRET`. |
| `BOBBY_CONTROL_SOURCE` | recomendada: `table` | Activa el kill switch dinámico. Con `table` lee `public.bobby_control`; con `edge-config` lee el item `bobby_control` del Edge Config de `EDGE_CONFIG`. Sin definir, usa env estático y `/api/bobby-health` lo reporta como no dinámico. |
| `EDGE_CONFIG` | solo con `edge-config` | Connection string que da Vercel al crear el Edge Config. |
| `BOBBY_EARLY_ACCESS_MIRROR_NEWSLETTER` | no | `false` deja de escribir en `newsletter_subscribers` (decisión de producto pendiente). |
| `BOBBY_SUPABASE_URL`, `BOBBY_SUPABASE_SERVICE_ROLE_KEY`, `VITE_BOBBY_SUPABASE_URL`, `VITE_BOBBY_SUPABASE_ANON_KEY` | **no todavía** | Son las del corte (gate 10 del plan). Mientras no existan, el helper resuelve los nombres actuales y no cambia nada. |

`BOBBY_CYCLE_CANARY=1` en un deployment de preview fuerza canary sin tocar
la tabla de control.

## Orden de despliegue (todo contra la base legada, sin migrar datos)

1. Revisión del branch (Codex + tú). Merge a `feat/web-companion` o deploy
   directo desde el worktree `phase0` **después** de `cat .vercel/project.json`
   (debe decir `bobby-agent-trader`; el worktree nuevo hereda el link del
   repo principal, verificado).
2. Aplicar `supabase/migrations/20260902_bobby_control.sql` y
   `20260902_bobby_early_access.sql` en `egpixaunlnzauztbrnuz` (dos tablas
   nuevas, cero cambios en tablas existentes). Yo lo hago por MCP cuando
   digas.
3. Setear `BOBBY_CONTROL_SOURCE=table` y `BOBBY_OPS_SECRET`. Deploy.
4. Verificar `GET /api/bobby-health` → `control.source = "table"`,
   `dynamic = true`, `writeFreeze = false`, `db.ref = egpixaunlnzauztbrnuz`.
5. Regresión de lectura: `/app`, `/agentic-world/bobby`, foro, historial,
   `/api/bobby-protocol-stats` (864 / 794 / 54.5 % o lo que diga el T0).
6. Regresión de escritura: guardar intereses desde el chat, marcar un
   mensaje como leído, publicar un debate, botón de Telegram, early access
   con un correo de prueba. Todo debe pasar por `/api/*` (Network tab: cero
   llamadas a `rest/v1` con método POST/PATCH/DELETE desde el navegador).
7. Prueba del kill switch: `update public.bobby_control set write_freeze =
   true where id = 'global'` → en ≤10 s, `POST /api/user-interests` responde
   503 y `/api/bobby-health` lo muestra; volver a `false`.
8. Prueba del canary: `canary = true` → `POST /api/bobby-cycle` con
   `x-bobby-ops` y `x-internal-secret` produce un ciclo `kind = canary`,
   modo `dryrun`, y en logs aparecen `[effects] suppressed …`; cero
   mensajes en Telegram, cero tweets, cero commits on-chain. Volver a `false`.
9. **Solo entonces** aplicar `20260902_bobby_rls_hardening.sql` y correr:

```bash
SUPABASE_URL=https://egpixaunlnzauztbrnuz.supabase.co SUPABASE_ANON_KEY=<anon> BOBBY_API=https://bobbyprotocol.xyz npx tsx scripts/infra/rls-adversarial.mts
```

   Debe terminar en `GATE PASSED`. Si algo legítimo falla, el rollback de la
   migración es volver a crear las políticas anteriores (están listadas en
   la matriz "hoy" del safety check); las escrituras del navegador ya no
   dependen de ellas.

## Lo que queda fuera de la fase 0 (a propósito)

- **Prueba de propiedad de la wallet.** Los endpoints validan y limitan,
  pero aceptan cualquier wallet bien formada. Siguiente paso: firma
  `signMessage` con nonce por sesión (wagmi ya está en el chat).
- `src/lib/agent/runner.ts` es código de servidor viviendo en `src/`
  (Twilio, Telegram, `process.env`) y nadie lo importa. Candidato a borrar
  en la limpieza del repo.
- `forum-agent-register` y `protocol-heartbeat` referencian tablas que no
  existen (`forum_agents`, `agent_commerce_events`). Siguen igual de rotos
  que antes; se resuelven en el esquema del corte.
- `xlayer-record` y demás escritores on-chain solo ven el freeze dinámico
  cuando el mismo lambda ya lo consultó; el latch estático
  `PROTOCOL_CUTOVER_FREEZE` sigue siendo la red de seguridad on-chain hasta
  que ese endpoint lea `getBobbyControl()` al inicio.
- Las decisiones de producto abiertas (foro/Agentic World, VPS del bot,
  tablas ambiguas, newsletter) no bloquean esta fase.

---

## Séptimo commit — respuesta a la revisión de Codex (2026-09-02, tarde)

Codex encontró cinco bloqueos y dos ajustes en la fase 0. Todos quedan
cerrados en este commit; nada se ha desplegado ni aplicado a ninguna base.

### 1. Gate adversarial sin falsos positivos
`scripts/infra/rls-adversarial.mts` v2 ya no infiere "rechazado" de
"0 filas afectadas". Ahora tiene tres partes y **exige la service key**
(sin ella el veredicto es INCOMPLETE, exit 2):

- **A. Matriz de políticas** leída de `pg_policies` vía las funciones
  `bobby_rls_matrix()` y `bobby_rls_status()` (security definer, solo
  service_role; las crea la migración). Falla si alguna tabla protegida
  tiene RLS apagado, si alguna política está concedida a `public`, o si
  anon/authenticated aparece en algo que no sea SELECT (más INSERT en
  `user_feedback`), o aparece en las tablas privadas.
- **B. Filas canario** reales: la service role las planta con un marcador
  único en `agent_cycles`, `forum_threads` (pública y privada),
  `forum_posts`, `agent_trades`, `agent_messages`, `user_interests`,
  `user_digests`, `mcp_payment_challenges`. Con la anon key se intenta
  SELECT (las privadas deben estar ocultas), UPDATE y DELETE sobre esos ids
  exactos; después la service role comprueba que la fila sigue intacta.
  INSERT anónimo debe fallar con 401/403; un 400 cuenta como INCONCLUSO y
  falla el gate. Los canarios se borran al final, también si algo falla.
- **C. Camino legítimo** con una wallet desechable generada en el momento:
  firma → `/api/wallet-session` → `POST /api/user-interests` escribe una fila
  y `GET` la devuelve. La misma llamada sin sesión da 401 y con otra wallet
  en el cuerpo da 403. `DELETE /api/agent-messages` nombrando otra wallet
  da 403.

```bash
SUPABASE_URL=… SUPABASE_ANON_KEY=… SUPABASE_SERVICE_KEY=… \
BOBBY_API=https://<preview-o-prod> npx tsx scripts/infra/rls-adversarial.mts
```

### 2. Datos privados fuera del alcance de la anon key
La migración `20260902_bobby_rls_hardening.sql` ahora deja como **solo
service role** a `agent_messages`, `user_interests`, `user_digests`,
`sandbox_runs` y `agent_profiles`. `forum_threads` solo es legible
públicamente cuando `scope <> 'private'`, y `forum_posts` solo cuando su
hilo es público. Lo privado lo sirve el API al dueño probado:

| Antes (anon key directo)                         | Ahora                                   |
|--------------------------------------------------|-----------------------------------------|
| `agent_messages?wallet_address=eq.…`             | `GET /api/agent-messages` (sesión)      |
| `user_interests?wallet_address=eq.…`             | `GET /api/user-interests` (sesión)      |
| `forum_threads?scope=eq.private&…`               | `GET /api/my-threads` (sesión)          |
| `agent_profiles?wallet_address=eq.…`             | `GET /api/agent-setup` (sesión)         |

`AgentDashboard` (agent-radar) leía los últimos 20 `agent_messages` de
todas las wallets; con el RLS nuevo recibe `[]`. Es un panel legado; queda
documentado, no se toca.

### 3. Prueba de propiedad de la wallet (sesión firmada)
- `src/lib/wallet-session-message.ts`: el texto que firma el usuario
  (compartido navegador/API).
- `api/_lib/wallet-session.ts` + `POST /api/wallet-session`: verifica la
  firma (`recoverMessageAddress`, ventana de 10 min) y emite un token HMAC
  (`BOBBY_SESSION_SECRET`, 7 días, sin estado). `requireWalletSession()` lo
  exige; `guardWrite()` lo exige por defecto (`auth: 'wallet'`) y rechaza
  con 403 cualquier `wallet` del cuerpo distinta a la de la sesión. Solo
  `bobby-early-access` declara `auth: 'none'` (formulario de email).
- `telegram-connect` además verifica que `agentProfileId` pertenezca a la
  wallet de la sesión. `forum-publish` fija `owner_wallet` desde la sesión.
- Navegador: `src/lib/bobby-session.ts` guarda el token en localStorage por
  wallet, `useBobbySession()` pide la firma **una vez** al conectar (si el
  usuario la rechaza no se insiste hasta un gesto explícito: borrar chat,
  conectar Telegram). Las lecturas privadas sin sesión devuelven vacío; las
  escrituras silenciosas (intereses) se omiten.
- Límite conocido: solo EOAs. Smart wallets (EIP-1271) no pueden firmar
  así todavía; se registra como siguiente paso.
- Autoprueba offline: `npx tsx scripts/infra/wallet-session-selftest.mts`.

### 4. Kill switch global
`requireWritesOpen()` al inicio de `user-cycle`, `forum-resolve`,
`forum-morning`, `generate-activity`, `seed-macro-calendar`, `feedback`,
`agent-run`, `sandbox-run` (además de `bobby-cycle`, `settle-trades` y los
cuatro endpoints públicos). `telegram-deliver` respeta freeze y canary;
`user-cycle` no manda Telegram en canary; `telegram-webhook` en freeze
responde 200 y no procesa (para que Telegram no reintente).
Escritores on-chain: `requireProtocolWriteSafety()` y
`requireLegacyXLayerMode()` ahora son async y **leen el control antes** de
evaluar; `isProtocolCutoverFrozen()` (sync) falla cerrado cuando hay fuente
dinámica configurada y el lambda aún no la leyó. `harness-events` no escribe
en freeze.

### 5. Ningún escritor acepta la anon key como respaldo
`bobby-cycle`, `forum-resolve`, `forum-morning`, `generate-activity`,
`seed-macro-calendar`, `feedback` y `_lib/harness-events` usan
`bobbyServiceKeyOptional()` y responden **503 explícito** si falta la
service role (antes: escritura silenciosamente rechazada por RLS).
`bobbyReadKey()` queda solo en lectores.

### Ajustes
- Allowlist de origen con **hosts exactos**: `bobbyprotocol.xyz`,
  `www.bobbyprotocol.xyz`, el host del propio deployment (`VERCEL_URL`,
  `VERCEL_BRANCH_URL`), lo que diga `BOBBY_ALLOWED_ORIGINS` y `localhost`
  solo fuera de producción. Sigue siendo defensa secundaria.
- Lecturas de `bobby_control` con timeout de 2.5 s (fail-closed).

### Variables nuevas
| Variable                 | Dónde      | Nota                                                  |
|--------------------------|------------|-------------------------------------------------------|
| `BOBBY_SESSION_SECRET`   | Vercel     | ≥ 32 caracteres aleatorios. Rotarla cierra sesiones.  |
| `BOBBY_ALLOWED_ORIGINS`  | Vercel     | Opcional, hosts extra separados por coma (previews).  |

### Cambio visible para el usuario
Al conectar la wallet, Bobby pide **una firma gratuita** ("Sign in to prove
you own this wallet…"). Sin ella el chat sigue funcionando, pero no hay
inbox, intereses, debates privados ni publicación al foro.

### Cobertura de tipos
`tsconfig.api.json` solo cubría 14 archivos del API. Ahora incluye todo lo
nuevo y lo editado que compila limpio. Quedan fuera, con errores previos
ajenos a este trabajo (`res.json()` tipado como `unknown`): `bobby-cycle`,
`forum-morning`, `forum-resolve`, `generate-activity`, `okx-perps`,
`xlayer-record`, `auto-bounty`, `agent-run`. Pendiente de una limpieza aparte.

---

## Octavo commit — segunda revisión de Codex + revisión de Kimi K3 (2026-09-02, noche)

Codex (segunda pasada sobre `60c386d`) marcó cuatro bloqueos y un detalle;
Kimi K3 (revisión independiente, `docs/infra/2026-09-02-kimi-review-commit7.md`)
dio GO condicional para preview y tres regresiones de UI. Todo cerrado aquí.
Sigue sin haber deploy ni migración aplicada.

### 1. Freeze on-chain antes de la rama de cadena
`evaluateProtocolWriteSafety()` evalúa `isProtocolCutoverFrozen()` **antes**
de distinguir X Layer / Base. `xlayer-record` en producción con X Layer ya
no puede firmar con `write_freeze=true`.

### 2. Kill switch demostrablemente global
`scripts/infra/writer-inventory.mts` escanea `api/**` buscando escrituras a
Supabase (PostgREST, supabase-js, `bobbyRest`, rpc), envíos a Telegram/X y
firmantes on-chain, y exige que cada archivo consulte el control
(`requireWritesOpen`, `guardWrite`, `getBobbyControl`, `assertWritesOpen`,
guards on-chain). Exenciones explícitas y justificadas (rate limit, caché,
el propio control, nonces de sesión). Resultado: **35 escritores, 0 sin
cubrir**. Cubiertos en este commit: `agent-confirm`, `agent-setup` (POST),
`forum-generate`, `forum-agent-register`, `harness-migrate`,
`bobby-asset-cache`, `telegram-access` (todo lo que crea sesiones o activa
suscripciones; el `?status` de solo lectura sigue abierto), y las librerías
`hardness-control-plane`, `mcp-challenges` y `trackrecord-v2-recorder`
lanzan `assertWritesOpen()` (async: cargan el control ellas mismas).

```bash
npx tsx scripts/infra/writer-inventory.mts   # exit 1 si aparece un escritor sin switch
```

### 3. Sesión sin replay: challenge de un solo uso (EIP-4361)
- `GET /api/wallet-session?address=0x…` guarda un nonce (18 bytes aleatorios)
  con `domain`, `uri`, `chainId`, `issuedAt`, `expirationTime` (10 min) en
  `api_cache` y devuelve el texto SIWE a firmar. El dominio sale del `Origin`
  de la petición y debe estar en la allowlist exacta.
- `POST /api/wallet-session { address, nonce, signature }`: **consume el
  nonce atómicamente** (`DELETE … RETURNING` en una sola sentencia; el
  segundo que llega recibe 0 filas), reconstruye el mensaje desde los campos
  guardados, recupera el firmante y emite el token. El nonce se quema aunque
  la firma sea inválida.
- El navegador firma exactamente el texto que recibe; ya no construye
  mensajes. `src/lib/wallet-session-message.ts` conserva el constructor
  solo para el servidor, la autoprueba y el gate.
- Gate C prueba el **replay**: mismo nonce + misma firma por segunda vez →
  401; firma reutilizada contra un challenge de otra dirección → 401.
- Sigue siendo EOA-only (EIP-1271 pendiente).

### 4. El foro solo publica texto que Bobby generó
- `api/_lib/transcript-receipt.ts`: `openclaw-chat` acumula cada byte que
  emite en el debate multiagente y, antes de `[DONE]`, envía
  `{"bobby_receipt": "btr1.<ts>.<hmac>"}` (HMAC sobre la transcripción,
  24 h, clave `BOBBY_TRANSCRIPT_SECRET` o `BOBBY_SESSION_SECRET`).
- `forum-publish` ya **no acepta `posts`**: recibe `transcript` + `receipt`,
  verifica el HMAC, y parsea las secciones (Alpha / Red Team / CIO) **en el
  servidor**. Sin recibo válido → 403. El símbolo declarado debe aparecer
  en la transcripción. `conviction`, `entry/stop/target` siguen viniendo
  del parseo del cliente sobre el texto del CIO; se registra como
  `fields_source: 'client-parsed-from-cio-text'` en `trigger_data`.
- El chat captura el recibo del stream y publica bajo la wallet
  **conectada** (Kimi B4), con fallback al perfil local.

### 5. Gate `user_feedback` real
Inserta un payload válido (`type`, `message`, `page`, `context`) con la anon
key y exige 2xx; luego lo borra con la service role.

### Hallazgos de Kimi cerrados
- `BobbyTelegramPage` leía `telegram_groups` con anon (ahora service-only):
  `GET /api/telegram-access?status&group_id=` devuelve además `group_name`
  y `bot_status`; la página usa eso.
- `AgentRadarLanding` nunca pedía la sesión → ahora `useBobbySession({auto})`.
- Política del foro estricta: `scope = 'public'` (no "todo lo que no sea
  private"); un `scope` futuro no se filtra a anon.
- Bucle de tablas públicas de la migración con `if exists` (no aborta si
  falta una tabla en el proyecto destino).
- `telegram-deliver` autentica antes de consultar el freeze (no filtra
  estado a llamadas anónimas).
- Canario público del gate nace con `expires_at` en el pasado y
  `resolution: 'expired'` para no aparecer como activo durante la corrida.

### Variable nueva (opcional)
| Variable                   | Nota                                                            |
|----------------------------|-----------------------------------------------------------------|
| `BOBBY_TRANSCRIPT_SECRET`  | Opcional; si falta se usa `BOBBY_SESSION_SECRET`. ≥ 32 chars.   |

### Orden de deploy (coincide Codex + Kimi)
1. Revisión del commit 8.
2. Aplicar `bobby_control` y `bobby_early_access` (tablas nuevas, sin tocar
   existentes).
3. Preview de Vercel con `BOBBY_SESSION_SECRET`, `BOBBY_OPS_SECRET`,
   `BOBBY_CONTROL_SOURCE=table`, service role, y `BOBBY_ALLOWED_ORIGINS`
   con cualquier dominio custom (Kimi: si falta, cada escritura 403).
   **Contra la base legacy**, código nuevo primero.
4. Regresión: firma → sesión → inbox / intereses / debates privados /
   publicar al foro con recibo; kill switch (freeze y canary);
   `writer-inventory` en verde.
5. Solo entonces `20260902_bobby_rls_hardening.sql` y
   `rls-adversarial.mts` hasta `GATE PASSED` (exit 0). Aplicar la migración
   antes del código rompe chat, foro y lecturas privadas.

---

## Noveno commit — tercera revisión de Codex (2026-09-02, noche)

Tres bloqueos de integridad, todos cerrados. Sigue sin deploy y sin
migración aplicada.

### 1. Guardias MCP antes del primer `fetch`
`createChallenge`, `atomicConsumeChallenge` y `storeReceipt` llaman
`assertWritesOpen()` como **primera sentencia**. (La versión anterior las
había insertado dentro del manejo de error, después de la escritura.)

### 2. Recibo estructurado, ligado y de un solo uso
`btr2.<payload>.<hmac>` con `id` (uuid), `iat`, `wallet` de la sesión que
pidió el debate (o null si fue invitado), `th` = sha256 de la transcripción,
`f` = campos del trade **parseados en el servidor** desde la sección del
CIO (símbolo, dirección, convicción, entrada, stop, objetivo) y `p` =
publicable. El navegador ya no manda ningún metadato: `forum-publish` recibe
solo `transcript` + `receipt` + `language`, verifica MAC, hash y wallet, y
usa los campos del recibo. El chat manda la sesión al pedir el debate para
que el recibo quede ligado a la wallet.

### 3. Publicación atómica
Nueva migración `20260902_bobby_forum_publish_rpc.sql`: tabla
`forum_publish_receipts` (PK = id del recibo, service-role only) y función
`bobby_publish_debate(receipt_id, wallet, thread, posts)` que registra el
recibo, crea el hilo e inserta los posts en **una transacción**. Un segundo
uso del mismo recibo viola la PK y aborta todo → 409. No se altera ninguna
tabla existente.

### Pruebas por comportamiento (offline, sin red)
- `scripts/infra/freeze-behavior-selftest.mts`: con `BOBBY_WRITE_FREEZE=true`
  y `fetch` stub que registra cada llamada no-GET, cada librería lanza y
  cada handler responde 503 (el webhook de Telegram, 200 + `frozen`) **sin
  una sola escritura**. 25 casos en verde. Los contadores de rate limit en
  `api_cache` están exentos por diseño.
- `wallet-session-selftest.mts`: + campos parseados en servidor, recibo
  ligado a wallet, transcripción editada rechazada por hash, campos
  alterados rechazados por MAC, expiración.
- Gate C (`rls-adversarial.mts`, con `BOBBY_TRANSCRIPT_SECRET` del
  deployment): publica una vez → 200; **mismo recibo otra vez → 409**;
  transcripción editada → 403. Limpia hilo, posts y recibo.

### Inventario por orden, no por nombre
`writer-inventory.mts` localiza la función que contiene cada escritura y
exige una guardia **antes** de la escritura dentro de esa función (o, para
helpers declarados, que el handler guarde antes del primer uso). Detectó
`judge-mode` (ahora cubierto). 36 archivos escritores, 0 sin guardar.

### Orden de migraciones (ahora tres pequeñas + RLS)
`bobby_control`, `bobby_early_access`, `bobby_forum_publish_rpc` → deploy
contra legacy → regresión → `bobby_rls_hardening` → gate.

---

## Décimo commit — cuarta revisión de Codex (2026-09-02, noche)

Dos bloqueos nuevos, cerrados. Sin deploy, sin migración aplicada.

1. **Convicción en escala 0…1.** El parser del CIO convierte `7/10` en
   `0.7` (antes `70`). Judge Mode, checkpoint, calibración y los ciclos
   multiplican por 10 para mostrar; el valor almacenado es el del protocolo.
   Validación de rango en tres capas: al verificar el recibo (`0..1`), en
   `forum-publish` (400 fuera de rango) y en el RPC `bobby_publish_debate`
   (excepción SQL). El `70%` del título del hilo es solo presentación.
2. **Recibo siempre ligado a una wallet.** `issueTranscriptReceipt()`
   devuelve null sin wallet; `openclaw-chat` solo emite recibo cuando la
   petición trae sesión (si no, manda `bobby_publishable:false` con la
   razón). `forum-publish` rechaza explícitamente `wallet` null (403) y
   exige `payload.wallet === guarded.wallet`. El RPC valida el formato de
   la wallet.

Pruebas añadidas:
- Gate C: `7/10` termina almacenado como `0.7`; hilo con `owner_wallet` de
  la sesión y `scope` público; recibo de invitado (wallet null, fabricado
  con el secreto) → 403; recibo de otra wallet → 403; recibo con convicción
  `70` → rechazado.
- `wallet-session-selftest`: sin wallet no hay recibo; convicción `0.7`.
- `freeze-behavior-selftest`: + `xlayer-record`, `generate-activity`,
  `auto-bounty`, `judge-mode`, `bobby-asset-cache`, `agent-run`,
  `bobby-cycle` (los escritores on-chain responden 503 sin firmar).

---

## GO de Codex para preview controlado (quinta revisión, `4faf203`) — plan de ejecución

Estado verificado en solo lectura antes de tocar nada:

| Qué                         | Valor                                                                 |
|-----------------------------|-----------------------------------------------------------------------|
| Vercel producción           | proyecto `bobby-agent-trader` → https://bobbyprotocol.xyz             |
| Supabase legacy (hoy)       | `egpixaunlnzauztbrnuz` (cuenta DeFi México). 36 tablas de Bobby.      |
| Supabase destino            | `bobby-protocol` `qbvdqkknnuweatptjohi` (cuenta anthonysurfermx), us-east-1. Solo `agent_profiles`, `forum_threads`, `forum_posts`, `api_cache`, todas vacías. |
| Rama                        | `feat/phase0-hardening` @ `4faf203`, **no pusheada** (sin preview aún) |
| MCP de Supabase             | `execute_sql` corre en transacción de solo lectura: no puede escribir ni validar DDL. Las migraciones solo entran por `apply_migration`. |

### Volumen a migrar (legacy → destino, para el manifiesto T0)
`agent_cycles` 3 402 · `forum_threads` 3 399 · `forum_posts` 10 980 ·
`agent_events` 7 256 · `agent_messages` 356 · `mcp_payment_challenges` 432 ·
`memory_objects` 221 · `api_cache` 117 · `user_digests` 87 · `sandbox_runs` 15 ·
`telegram_activation_sessions` 10 · `user_interests` 8 · resto ≤ 2 filas o vacías.

### ⚠️ RLS apagado hoy en 15 tablas de Bobby (legacy)
`user_interests`, `agent_config`, `telegram_groups`,
`telegram_activation_sessions`, `telegram_subscriptions`, `indicator_cache`,
`agent_market_snapshots`, `agent_macro_events`, `agent_source_health`,
`agent_position_rechecks`, `hardness_agents`, `hardness_agent_sessions`,
`hardness_agent_proofs`, `agent_events`, `memory_objects`. Con la anon key
se puede leer o modificar cualquier fila. `20260902_bobby_rls_hardening.sql`
las cubre todas (habilita RLS y deja solo service role, o lectura pública
donde corresponde). No se aplica antes del paso 4 porque el código que
lee esas tablas desde el navegador debe estar desplegado primero.

### Hueco en Vercel: el entorno Preview casi no tiene variables
`vercel env ls` muestra `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`,
`CRON_SECRET`, `BOBBY_CYCLE_SECRET`, etc. solo en Production y Development.
En Preview solo existe `BOBBY_RECORDER_KEY`. Un preview sin esas variables
arranca sin base. Antes del push hay que crear en **Preview**:
`BOBBY_SUPABASE_URL`, `BOBBY_SUPABASE_SERVICE_ROLE_KEY`,
`BOBBY_SUPABASE_ANON_KEY`, `VITE_BOBBY_SUPABASE_URL`,
`VITE_BOBBY_SUPABASE_ANON_KEY` (legacy por ahora), `INTERNAL_API_SECRET`,
`BOBBY_OPS_SECRET`, `BOBBY_SESSION_SECRET`, `BOBBY_CONTROL_SOURCE=table`,
`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, y los tokens de Telegram si se
prueba el bot. `BOBBY_ALLOWED_ORIGINS` no hace falta para el propio host
del preview (se añade solo con `VERCEL_URL`).

### Pasos 1–3 (requieren OK explícito de Anthony; cada uno es reversible)
1. `apply_migration` de las tres aditivas en **legacy**: `bobby_control`,
   `bobby_early_access`, `bobby_forum_publish_rpc`. Crean 3 tablas y 2
   funciones; no tocan ninguna tabla existente. Reversión: `drop table` /
   `drop function`.
2. Variables de Preview (arriba) y `git push origin feat/phase0-hardening`
   → Vercel crea el preview automáticamente. Nada llega a producción.
3. Contra el preview:
   ```bash
   BOBBY_API=https://<preview>.vercel.app npx tsx scripts/infra/preview-smoke.mts
   ```
   más la regresión manual: conectar wallet → firma → inbox, intereses,
   debates privados, publicar un debate al foro (recibo), freeze on/off en
   `bobby_control` (escrituras 503, webhook 200), canary (sin Telegram).
4. Solo con 3 en verde: `bobby_rls_hardening` y el gate vivo.

---

## Ejecución del preview (2026-09-02, noche) — autorizada por Anthony

**Paso 1 — hecho.** `bobby_control`, `bobby_early_access` y
`bobby_forum_publish_rpc` aplicadas en legacy con `apply_migration`.
Verificado: 3 tablas con RLS y solo service role, fila `global`
(`write_freeze=false`, `canary=false`), funciones `bobby_publish_debate` y
`bobby_control_touch` presentes. Producción (código viejo) no lee estas
tablas: cero impacto.

**Paso 2 — hecho.** Rama pusheada a `origin/feat/phase0-hardening`. 16
variables creadas en Preview **acotadas a la rama** (`vercel env add NAME
preview feat/phase0-hardening --yes --force`): las de base (legacy por
ahora, en `BOBBY_SUPABASE_*` y `VITE_BOBBY_SUPABASE_*`), LLM, cron/cycle,
`BOBBY_SESSION_SECRET`, `BOBBY_OPS_SECRET`, `BOBBY_CONTROL_SOURCE=table`.
Notas operativas:
- Vercel marca las variables de Preview como *sensitive*: `vercel env pull`
  devuelve `""`. Los secretos generados se rotaron una vez por eso; la
  única copia legible vive en el scratchpad de la sesión.
- Los previews tienen Deployment Protection (302 → SSO). Ya existía un
  secreto de *Protection Bypass for Automation* en el proyecto; los
  scripts lo mandan en `x-vercel-protection-bypass` vía
  `VERCEL_AUTOMATION_BYPASS_SECRET`. Sin él, el smoke se niega a medir.
- `vercel redeploy` necesita `--scope anthonysurfermxs-projects`.
- El bundle del preview lleva la URL de Supabase inyectada en el chunk
  `bobby-db-client` (VITE_* en tiempo de build confirmado).

**Paso 3 — smoke: PASSED (21/21)** contra
`bobby-agent-trader-3ovclbxkc…vercel.app` (sha `143d5a4`): health con
`db.ref=egpixaunlnzauztbrnuz`, `control.source=table`, challenge SIWE,
nonce quemado, 401 sin sesión en las cuatro lecturas privadas, 403 por
origen ajeno en las cuatro escrituras, manual `bobby-cycle` 401 sin ops.
Pendiente en este mismo paso: freeze on/off por comportamiento y sección C
del gate (firma → sesión → intereses → publicación con recibo → replay 409)
contra el preview redesplegado.

**Paso 3 — regresión API: en verde** contra
`bobby-agent-trader-5kab7xqyp…vercel.app` (secretos rotados, sha `143d5a4`):
- **Freeze por comportamiento**: `bobby_control.write_freeze=true` (PATCH
  con service role) → `user-interests`, `forum-publish`, `agent-messages`,
  `feedback`, `agent-setup` responden **503** y el health muestra
  `writeFreeze: true` con la nota; `bobby-cycle` sin ops responde 401
  (autentica antes de revelar el estado). Flag de vuelta a `false` →
  401 normales y health limpio. Producción no se enteró: el código viejo no
  lee `bobby_control`.
- **Gate sección C** (wallet desechable, 21/21): challenge SIWE, token,
  replay de nonce 401, firma contra otro challenge 401, intereses 401/403/
  200 + lectura, publicación con recibo 200 → `conviction_score` guardado
  `0.7`, `owner_wallet` = sesión, `scope` público; recibo guest 403, recibo
  de otra wallet 403, convicción `70` rechazada, **mismo recibo 409**,
  transcripción editada 403, `my-threads` 200, borrar inbox ajeno 403.
- Limpieza verificada en legacy: 0 filas de prueba en `user_interests`,
  `forum_threads`, `forum_posts`, `forum_publish_receipts`,
  `telegram_connections`, nonces en `api_cache`; flags en falso.

**Lo que NO se probó en preview (decisión de Anthony):**
- Web con wallet real (conectar → firmar → chat → publicar): requiere una
  extensión de wallet; hacerlo a mano en el preview (URL con bypass).
- Un ciclo (`bobby-cycle`) en canary: escribiría filas en `agent_cycles`
  de la base legacy compartida con producción. Se propone correrlo solo
  después de deploy a producción, o contra la base destino.
- Bot de Telegram: el webhook apunta a producción; no se redirige a preview.
- On-chain: el preview está configurado para Base Sepolia; no se firmó nada.

### Lo que viene, en orden, y por qué el siguiente paso es producción
La migración de RLS **rompe el código viejo** (el frontend de producción
escribe hoy directo a Supabase con la anon key). Por eso el orden de Codex es:
1. Deploy de esta rama a **producción** (merge a `main` → Vercel) con las
   variables nuevas también en Production (`BOBBY_SESSION_SECRET`,
   `BOBBY_OPS_SECRET`, `BOBBY_CONTROL_SOURCE=table`, `BOBBY_SUPABASE_*` y
   `VITE_BOBBY_SUPABASE_*` = legacy por ahora).
2. Verificar en producción: smoke, firma real, un ciclo real.
3. `20260902_bobby_rls_hardening.sql` en legacy y gate completo (ABC).
4. Corte a `bobby-protocol` (`qbvdqkknnuweatptjohi`): manifiesto T0,
   backup, freeze, dump/restore, `BOBBY_SUPABASE_*` → destino, rebuild,
   verificación de conteos/IDs/proofs, `legacy-reference-audit` en cero.
