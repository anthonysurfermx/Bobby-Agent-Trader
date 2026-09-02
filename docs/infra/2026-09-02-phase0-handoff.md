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
Kimi K3 (revisión independiente, `.ai/reviews/kimi-phase0-commit7-review.md`)
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
