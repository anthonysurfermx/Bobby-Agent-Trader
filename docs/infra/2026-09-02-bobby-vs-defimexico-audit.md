# Bobby vs DeFi México — auditoría de infraestructura y plan de migración

Fecha: 2026-09-02. Estado: diagnóstico verificado con acceso de solo lectura
(Supabase MCP, Vercel CLI, código de los dos repos, API de Telegram). Nada se
ha movido todavía.

## 1. Lo que hay hoy (verificado)

### Cuentas y proyectos

| Capa | Bobby (destino correcto) | DeFi México (origen) |
|---|---|---|
| Vercel | `bobby-agent-trader` → bobbyprotocol.xyz (team anthonysurfermx) | `defi-mexico-hub` → defimexico.org (mismo team) |
| Supabase | `bobby-protocol` (ref `qbvdqkknnuweatptjohi`, org anthonysurfermx, us-east-1, creado 2026-08-23) | `egpixaunlnzauztbrnuz` (proyecto legado "DeFi-Mexico-2", cuenta anthochavez.ra@gmail.com) |
| Repo | Bobby-Agent-Trader (GitHub) | defi-mexico-hub (GitHub) |
| On-chain | Contratos en Base (7, ownership en el Safe 2/3). Direcciones y `BASE_RECORDER_KEY` en env de `bobby-agent-trader` | Env legado `BOBBY_CONTRACT_ADDRESS`, `BOBBY_ECONOMY_ADDRESS`, `BOBBY_ORACLE_ADDRESS`, `BOBBY_RECORDER_KEY` (era X Layer) todavía en `defi-mexico-hub` |
| iOS | `BobbyAPI.base = https://bobbyprotocol.xyz` ✅ | — |
| Telegram | `@Bobbyagentraderbot`. Token en env de los DOS proyectos Vercel | El webhook del bot apunta a `https://103.114.43.97.sslip.io/api/hook/…` (un VPS, ni Vercel ni Supabase) |

### El hallazgo principal

**Toda la data viva de Bobby está en la base de DeFi México.** El proyecto
`bobby-protocol` en Supabase existe pero está vacío: 4 tablas con 0 filas
(`agent_profiles`, `forum_threads`, `forum_posts`, `api_cache`).

En `egpixaunlnzauztbrnuz` conviven las tablas de DeFi México (startups,
events, communities, blog_posts, jobs, courses, fintech_funds, defi_advocates,
proposals, video_tutorials, nft_gallery_profiles, wallets, short_urls…) con
las de Bobby:

| Tabla Bobby en la base de DeFi México | Filas | Último dato |
|---|---|---|
| agent_cycles | 3,402 | 2026-09-02 (vivo, el cron diario escribe aquí) |
| agent_events | 7,256 | 2026-09-02 (vivo) |
| forum_threads / forum_posts | 3,399 / 10,980 | 2026-09-02 (vivo) |
| user_digests | 87 | 2026-09-02 (vivo) |
| api_cache | 112 | 2026-09-02 (vivo) |
| memory_objects | 221 | 2026-08-30 |
| mcp_payment_challenges / receipts | 432 / 0 | 2026-08-18 |
| agent_messages | 356 | 2026-04-22 |
| agent_profiles | 2 | 2026-03-27 |
| hardness_agents / sessions / proofs | 1 / 1 / 1 | 2026-04-12 |
| sandbox_runs | 15 | 2026-04-16 |
| telegram_groups / activation_sessions / subscriptions / connections | 2 / 10 / 1 / 0 | 2026-03-23 |
| dm_conversations | 2 | 2026-06-24 |
| agent_trades, agent_positions, agent_signals, agent_config, agent_memory, trade_intents, llm_calls, cycle_transitions, indicator_cache, agent_market_snapshots, agent_macro_events, agent_source_health, agent_position_rechecks | 0 | — |

Además: los registros de **early access** de la landing (`/api/bobby-early-access`)
se guardan en `newsletter_subscribers`, que es una tabla de DeFi México.

### Cómo llega el código a esa base

- El código de Bobby lee `SUPABASE_URL` / `SB_URL` / `VITE_SUPABASE_URL` de
  env, pero **46 archivos** de `api/` tienen `egpixaunlnzauztbrnuz.supabase.co`
  como fallback hardcodeado, y `.env.local` de los dos repos apunta a ese mismo
  proyecto. Cambiar el env en Vercel no basta: hay que quitar los fallbacks.
- El repo Bobby-Agent-Trader todavía carga **toda la web de DeFi México**
  (páginas y tablas de startups, events, blog, jobs, courses…): es un fork
  completo, no un repo de Bobby.
- El repo defi-mexico-hub todavía tiene 12 endpoints y 14 páginas de Bobby,
  pero en producción defimexico.org responde **404** a `/api/bobby-*`. Es
  código muerto en ese repo (último deploy 2026-07-27).

### Dependencias rotas (esto sí está fallando hoy)

Bobby en producción llama a defimexico.org, que ya no sirve esos endpoints:

| Archivo | Llama a | Estado |
|---|---|---|
| `api/telegram-deliver.ts` | `BASE_URL = https://defimexico.org` | 404 |
| `api/user-cycle.ts:220` | `defimexico.org/api/bobby-intel` | 404 (bobbyprotocol.xyz/api/bobby-intel responde 200) |
| `api/user-cycle.ts:581` y `api/bobby-cycle.ts:1817` | `defimexico.org/api/telegram-deliver` | 404 → la entrega por Telegram del ciclo no llega |
| `api/bobby-cycle.ts:699` | `defimexico.org/api/smart-money-leaderboard` | 404 (bobbyprotocol.xyz lo sirve, 200) |
| `src/config/reown.ts` | metadata y logo de WalletConnect en defimexico.org | cosmético |

### Seguridad (Supabase lo marca como crítico)

En `egpixaunlnzauztbrnuz` hay **15 tablas sin RLS**, varias de Bobby:
`agent_config`, `agent_events`, `agent_market_snapshots`, `agent_macro_events`,
`agent_source_health`, `agent_position_rechecks`, `hardness_agents`,
`hardness_agent_sessions`, `hardness_agent_proofs`, `memory_objects`,
`indicator_cache`, `telegram_groups`, `telegram_activation_sessions`,
`telegram_subscriptions`, `user_interests`. Cualquiera con la anon key puede
leer o modificar esas filas. Se arregla al migrar (RLS + acceso solo con
service role); no activar RLS sin políticas porque bloquearía a los endpoints.

## 2. Qué es de quién

**Bobby (migrar a `bobby-protocol` + `bobby-agent-trader`):** todas las tablas
`agent_*`, `forum_*`, `hardness_*`, `mcp_payment_*`, `telegram_*`,
`memory_objects`, `sandbox_runs`, `api_cache`, `llm_calls`,
`cycle_transitions`, `trade_intents`, `dm_conversations`, `user_digests`,
`indicator_cache`, `user_feedback`; los 84 endpoints de `api/` del repo Bobby;
las páginas `Bobby*`, `Agentic*`, `/app`, `/desk`, `/protocol`; los env
`BASE_*`, `OKX_*`, `OPENAI/ANTHROPIC`, `TELEGRAM_*`, `CRON_SECRET`; los crons
`bobby-cycle` y `settle-trades`; el bot de Telegram.

**DeFi México (se queda en `egpix…` + `defi-mexico-hub`):** `profiles`,
`user_roles`, `startups`, `events`, `communities`, `blog_posts`,
`newsletter_subscribers`, `notifications`, `comments`, `likes`, `follows`,
`courses`, `course_enrollments`, `fintech_funds`, `defi_advocates`,
`proposals`, `referents`, `video_tutorials`, `nft_gallery_profiles`, `wallets`,
`followed_wallets`, `defi_chart_cache`, `short_urls`, `content_machine_jobs`,
`api_keys/api_usage/api_daily_counts`, `user_interests`, `analytics_events`,
`system_config`, los buckets `blog-covers` y `content-machine-audio`, y los 50
usuarios de `auth.users` (son de DeFi México; Bobby aún no tiene login).

**Dudosas (decides tú):** `game_progress` (10 filas, abril), `scan_counter`,
`pro_waitlist` (5 filas, febrero), `activity_log`.

## 3. Plan de migración (en orden, sin downtime)

### Fase 0 — hoy, sin mover datos (yo lo hago en código)
1. Cambiar las 5 llamadas a defimexico.org por bobbyprotocol.xyz (o rutas
   internas). Arregla la entrega por Telegram del ciclo y el fallback de
   `bobby-intel`.
2. Sustituir los 46 fallbacks `egpixaunlnzauztbrnuz` por
   `process.env.SUPABASE_URL` obligatorio (falla ruidoso si falta), para que
   el cambio de base sea un cambio de env y no de código.
3. Endpoint `bobby-early-access` → tabla propia `bobby_early_access` (en el
   proyecto bobby-protocol) en lugar de `newsletter_subscribers`.

### Fase 1 — esquema en `bobby-protocol` (yo preparo, tú apruebas)
4. Dump solo-esquema de las ~35 tablas Bobby desde `egpix` y aplicarlo en
   `qbvdqkknnuweatptjohi` como migración versionada, ya con RLS y políticas
   de service role en las 15 tablas hoy abiertas. Índices y funciones
   incluidos.

### Fase 2 — datos (ventana de 15 minutos)
5. Pausar el cron `bobby-cycle` (Vercel) 15 minutos.
6. `pg_dump --data-only` de esas tablas (≈ 25k filas, segundos) y restore en
   `bobby-protocol`. Verificar conteos tabla por tabla.
7. Cambiar en Vercel `bobby-agent-trader`: `SUPABASE_URL`, `SB_URL`,
   `SUPABASE_SERVICE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `VITE_SUPABASE_URL`,
   `VITE_SUPABASE_ANON_KEY` → valores de `bobby-protocol`. Redeploy. Reanudar
   cron. Verificar `/api/bobby-protocol-stats`, foro, historial, Telegram.

### Fase 3 — limpiar DeFi México
8. Quitar de `defi-mexico-hub` (repo) los 12 endpoints y 14 páginas de Bobby y
   los env `BOBBY_*`, `OKX_*`, `TELEGRAM_*`, `ANTHROPIC/OPENAI` del proyecto
   Vercel `defi-mexico-hub` (si DeFi México ya no los usa).
9. Dejar las tablas Bobby en `egpix` en solo lectura 30 días (revocar escritura
   a service role) y después borrarlas.

### Fase 4 — limpiar el repo de Bobby
10. Sacar de Bobby-Agent-Trader las páginas y tablas de DeFi México (startups,
    events, blog, jobs, courses, admin). Hoy bobbyprotocol.xyz compila todo eso.
    Es la limpieza más grande; conviene después de la demo.

### Pendiente de identificar
- El webhook de `@Bobbyagentraderbot` apunta a un VPS (`103.114.43.97`, vía
  sslip.io). Puede ser el bot OpenClaw / aigts-bot o el canal de Telegram de
  Claude Code. Hay que decidir si se queda ahí o se mueve a
  bobbyprotocol.xyz/api/telegram-webhook (hoy ese endpoint no recibe nada).

## 4. Qué necesito de ti

- Contraseña de la base de `egpix…` (o que corras tú el `pg_dump`) y la de
  `bobby-protocol` para el restore. Te dejo los comandos exactos cuando
  apruebes la fase 1.
- Confirmar las tablas "dudosas" y si `newsletter_subscribers` de Bobby
  (early access) se migra o se reinicia.
- Decisión sobre el VPS del bot.

## 5. Riesgos

- El cron diario escribe en `agent_cycles`; migrar sin pausarlo pierde el
  ciclo de ese día. Por eso la ventana de 15 minutos.
- Los tokens/claves de OKX y Telegram existen en los dos proyectos Vercel:
  al limpiar DeFi México hay que verificar que DeFi México no los use para
  otra cosa (p. ej. su propio bot o el content machine).
- Después de la migración, el historial público (track record) debe dar los
  mismos números: 3,402 ciclos, 10,980 posts. Es la prueba de que no se
  perdió nada.
