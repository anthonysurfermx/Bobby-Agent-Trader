# ¿Se rompe algo de Bobby Protocol con la migración? — verificación (v2)

Fecha: 2026-09-02, v2 tras el cruce read-only de Codex. Complementa
`2026-09-02-bobby-vs-defimexico-audit.md`. Método: lectura del código (84
endpoints, frontend, iOS), consultas de solo lectura a las dos bases,
`vercel.json`, API de Telegram. Nada se ejecutó.

## Veredicto

**El corte es seguro cuando se cierren los 12 gates de la sección 3 y exista
recuperación de las escrituras posteriores al corte.** Ya no es "nueve
condiciones": la v1 tenía cinco huecos reales (nombre del secreto, rebuild de
Vite, rollback con pérdida de datos, "legacy en solo lectura" que tumbaría
DeFi México, y una pausa de cron que no pausa nada). Están corregidos abajo.
Lo que no depende de Supabase (contratos en Base, Safe, binario iOS, voces,
OKX, Yahoo) no se toca y no puede romperse por esta migración.

## 1. Qué depende de la base (mapa de dependencias)

| Componente | Tablas / funciones | Cómo llega a la base | Consumidor |
|---|---|---|---|
| Cron diario `bobby-cycle` (12:00 UTC) | agent_cycles, agent_events, forum_threads, forum_posts, agent_messages, memory_objects, api_cache | REST con service key, URL de `VITE_SUPABASE_URL` | Track record público, foro, Telegram, Twitter |
| Cron `settle-trades` (12:45 UTC) | agent_cycles, agent_trades | REST | Resolución del historial |
| Historial público `/api/bobby-protocol-stats`, `verified-calls`, `protocol-tx-history` | agent_events, forum_threads + contrato TrackRecord en Base | REST + lectura on-chain | Landing, `/protocol`, App Store |
| Foro / Agentic World / chat Adams (web) | forum_threads, forum_posts, agent_messages, user_interests, telegram_* | **Directo desde el navegador** con `VITE_SUPABASE_URL` + anon key. No solo lee: `AdamsChat.tsx` hace 12 escrituras (entre ellas `POST forum_posts`), `lib/agent/runner.ts` 4, `ProactiveNotification` 1, `BobbyTelegramPage` 1 | Usuarios web |
| Hardness (pruebas on-chain) | hardness_agents, hardness_agent_sessions, hardness_agent_proofs | REST; `prediction_hash = keccak256("bobby:" + forum_threads.id)`; `proofs.session_id → sessions.session_id` | HardnessRegistry en Base |
| MCP de pago (`mcp-http`, `mcp-bobby`) | mcp_payment_challenges, mcp_payment_receipts | REST | Agentes externos |
| Telegram `@Bobbyagentraderbot` | agent_profiles, telegram_groups, telegram_connections, telegram_subscriptions, telegram_activation_sessions, user_digests | `.from()` con service key; además un VPS desconocido recibe el webhook | Bot |
| Desk / app iOS y web | **ninguna** (api_cache opcional) | — | iOS, `/agentic-world/bobby` |
| Early access | newsletter_subscribers (tabla DeFi) | `.from()` | Landing |
| Harness / sandbox | agent_events, memory_objects, sandbox_runs, `exec_sql()` | REST | Internos |

No dependen de Supabase: los 7 contratos en Base y el Safe,
`BASE_RECORDER_KEY`, la app iOS (solo habla con bobbyprotocol.xyz/api), TTS,
OKX/Yahoo, Higgsfield, el archivo build 11.

## 2. Hallazgos que romperían algo o que hay que decidir

| # | Hallazgo | Consecuencia si se ignora | Severidad |
|---|---|---|---|
| A | 41 archivos leen la URL con cuatro nombres (`VITE_SUPABASE_URL`, `SUPABASE_URL`, `SB_URL`, `NEXT_PUBLIC_SUPABASE_URL`) y dos de service key; 46 fallbacks hardcodeados a `egpix…`. | Datos partidos en dos bases. | Crítica |
| B | El navegador lee **y escribe** tablas Bobby con la anon key (ver mapa). | Cambiar solo el server deja el foro y el chat en la base vieja. Y las variables `VITE_*` se incrustan en el build: cambiarlas en Vercel sin rebuild no hace nada. | Alta |
| C | Hashes on-chain sobre `forum_threads.id`. | Ids regenerados = pruebas huérfanas. Se evita preservando uuid. | Crítica |
| D | Secuencias: `hardness_agents`, `hardness_agent_sessions`, `hardness_agent_proofs` (identity, hoy en 1) y `agent_memory`, `llm_calls`, `cycle_transitions`, `trade_intents` (bigserial, hoy en null). | Sin sincronizar cada una, el primer insert choca. | Alta |
| E | **Las políticas actuales son permisivas para `public`**: "Service write agent_cycles \| ALL \| public \| using=true" y lo mismo en agent_positions, agent_signals, agent_messages, agent_trades, forum_threads, forum_posts, mcp_payment_challenges, mcp_payment_receipts. Solo `api_cache` distingue `anon` de `service_role`. Cualquiera con la anon key puede insertar, editar o borrar ciclos, hilos, posts y challenges de pago. Además 15 tablas sin RLS. | Copiar las políticas tal cual reproduce el hueco; endurecerlas sin migrar las escrituras del navegador rompe el chat y el foro. | Crítica |
| F | `exec_sql()` (SECURITY DEFINER, EXECUTE para PUBLIC) valida admin contra `user_roles` + `auth.uid()` de DeFi; la usa `harness-migrate.ts`. | No portar. `harness-migrate` queda obsoleto. | Media |
| G | Tablas referenciadas que no existen en ninguna base: `forum_agents`, `agent_commerce_events`. | Ya roto hoy; crear o retirar código. | Baja |
| H | Bot de Telegram en un VPS (`103.114.43.97.sslip.io`) sin identificar; `aigts-bot` (bot GTS, en Vercel) también apunta a `egpix…`. | Escritores externos fuera de control durante el corte. | Alta |
| I | `bobby-cycle` y `user-cycle` llaman a `defimexico.org` (404). | Telegram del ciclo no llega. Fase 0. | Media |
| J | **Corregido en la fase 0:** los crons sí validaban `CRON_SECRET` / `x-internal-secret` con `timingSafeEqual` (`requireInternalAuth`); mi grep inicial no lo vio. Lo que faltaba era autorización independiente para ejecuciones manuales (`BOBBY_OPS_SECRET`, commit `feat(ops)`). | Sin la ops secret configurada, las ejecuciones manuales responden 503. | Resuelta |
| K | `bobby-cycle` tiene `ChallengeMode = dryrun \| paper \| live` (por defecto `dryrun`), pero los envíos a Telegram (`sendMessage`) y Twitter no dependen de ese modo. | Un ciclo "de prueba" publica igual. | Alta para el canary |
| L | `api_cache` no se migra. | Primer ciclo más lento. | Ninguna |
| M | `agent_cycles.user_id` y `agent_profiles.user_id` en null en todas las filas. | Nada que remapear. | Ninguna |
| N | Crons a las 12:00 y 12:45 UTC. | Migrar en esa hora pierde el ciclo. | Media |

## 3. Los 12 gates (orden del corte)

**Gate 1 — Propiedad resuelta.** Foro y Agentic World declarados Bobby o no;
VPS del bot identificado; `game_progress`, `pro_waitlist`, `scan_counter`
asignadas; `user_interests` (la usa el digest de Bobby) confirmada como Bobby.

**Gate 2 — Nombres únicos de configuración.** Solo estos cuatro:
`BOBBY_SUPABASE_URL`, `BOBBY_SUPABASE_SERVICE_ROLE_KEY` (server),
`VITE_BOBBY_SUPABASE_URL`, `VITE_BOBBY_SUPABASE_ANON_KEY` (navegador). La
service role jamás entra al frontend. Helper único `api/_lib/bobby-db.ts`;
`grep -rn "egpixaunlnzauztbrnuz" api src` = 0. Las variables viejas quedan
solo para lo que siga siendo DeFi México.

**Gate 3 — Migración versionada de esquema.** Extensiones (`vector`), las 27
tablas Bobby incluidas las 5 ausentes del baseline, índices, secuencias, y la
**matriz RLS objetivo** (sección 4). Sin `exec_sql`. Herramienta: Supabase CLI
(`supabase db dump --schema public` filtrado a las tablas Bobby, no un
`pg_dump` indiscriminado; Auth/Storage no se tocan). Referencia:
https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore

**Gate 4 — Ensayo de restore sin tráfico.** Restore completo en
`bobby-protocol`, pruebas de lectura de la sección 5, y los canarios de
escritura contra la base ensayada, antes de tocar producción. Se repite el
ensayo si cambia el esquema.

**Gate 5 — Escritores de Bobby detenidos, DeFi México intacto.** No se pone
la base legacy en solo lectura (sostiene DeFi México). Se detienen únicamente
los escritores Bobby: crons con **Disable Cron Jobs** en Project Settings de
Vercel (rotar `CRON_SECRET` no detiene nada y hoy ni se valida; un rollback de
deployment tampoco detiene crons), endpoints de escritura detrás de un flag
`BOBBY_WRITE_FREEZE=1` que responde 503, el VPS y `aigts-bot` apagados o con
env cambiado. Referencia: https://vercel.com/docs/cron-jobs/manage-cron-jobs

**Gate 6 — Procesos en vuelo terminados y manifiesto T0.** Esperar el fin de
cualquier ciclo/escritura en curso y capturar por tabla: `count(*)`,
`max(id)` o `max(created_at)`, y checksum
`md5(string_agg(row::text, '|' order by id))`. Los números de hoy (3,402
ciclos, 10,980 posts) son una fotografía, no el criterio; el criterio es el
manifiesto T0 firmado en el momento del freeze.

**Gate 7 — Copia solo de tablas aprobadas, uuid intactos.** Datos con
`supabase db dump --data-only` restringido a la lista aprobada (sin
`api_cache`, sin Auth, sin storage, sin contadores, sin sesiones de Telegram
vencidas). Restore en el orden de dependencias lógicas (threads antes que
posts, sessions antes que proofs).

**Gate 8 — Secuencias sincronizadas y verificadas una por una.** Para cada
secuencia de D: `setval` a `max(id)` y comprobación `last_value = max(id)`;
insert de prueba en transacción con rollback. Referencia:
https://supabase.com/docs/guides/platform/migrating-to-supabase/postgres

**Gate 9 — Validación total, no por muestra.** Conteos y checksums iguales al
T0 por tabla; huérfanos = 0 en `forum_posts.thread_id → forum_threads`,
`hardness_agent_proofs.session_id → hardness_agent_sessions` y, para **todos**
los proofs, `prediction_hash` recalculado desde el hilo migrado igual al
almacenado y al on-chain; FKs lógicas revisadas aunque no existan como
constraints (hoy hay 0 FKs físicas).

**Gate 10 — Variables de servidor y navegador, rebuild y deploy.** Setear las
cuatro variables del gate 2 en `bobby-agent-trader`, **rebuild** (las
`VITE_*` se incrustan), deploy, promoción de esa compilación, verificación de
que el bundle apunta a la base nueva (`grep qbvdqkknnuweatptjohi dist/assets/*.js`).

**Gate 11 — Lecturas primero, escrituras canario después.** Pruebas 1 a 6 de
la sección 5 (solo lectura). Luego canarios de escritura controlados (7 a 10)
con `BOBBY_CYCLE_CANARY=1`: modo `dryrun`, sin `sendMessage` a Telegram, sin
tweet, sin `telegram-deliver`, escritura solo en la base nueva. Ese flag hay
que **implementarlo** en fase 0: hoy no existe.

**Gate 12 — Crons reactivados y journal durante la ventana de rollback.**
Reactivar crons; durante 30 días, journal/outbox de toda escritura Bobby
posterior al corte (tabla `migration_outbox` con tabla, id, operación, payload,
ts) o exportación incremental por `created_at > T0`. **Rollback** = detener
escritores, exportar el delta de la base nueva hacia legacy, volver las
variables, rebuild y deploy. Sin journal el RPO no es cero y debe declararse.
La base legacy no se borra ni se revoca en esta ventana.

## 4. Matriz RLS: hoy vs objetivo

Hoy (extraída de `pg_policies` en `egpix…`):

| Tabla | SELECT | INSERT/UPDATE/DELETE | Rol |
|---|---|---|---|
| agent_cycles, agent_positions, agent_signals, agent_messages, agent_trades | público (`using=true`) | público (`ALL`, `using=true`) | `public` |
| forum_threads, forum_posts | público | público (`ALL`) | `public` |
| user_digests | público | INSERT y UPDATE públicos | `public` |
| user_feedback | — | INSERT público | `public` |
| indicator_cache | — | INSERT y UPDATE públicos | `public` |
| mcp_payment_challenges, mcp_payment_receipts | público (`ALL`) | público (`ALL`) | `public` |
| sandbox_runs | público | — | `public` |
| api_cache | `anon` solo filas vigentes | `service_role` todo | correcto |
| agent_config, agent_events, agent_market_snapshots, agent_macro_events, agent_source_health, agent_position_rechecks, hardness_agents, hardness_agent_sessions, hardness_agent_proofs, memory_objects, telegram_groups, telegram_activation_sessions, telegram_subscriptions, user_interests, (+ dm_conversations, trade_intents, llm_calls, cycle_transitions, agent_memory por revisar) | **sin RLS** | **sin RLS** | todos |

Objetivo en `bobby-protocol` (por tabla, operación y rol):

| Tabla | anon | authenticated | service_role (backend) |
|---|---|---|---|
| agent_cycles, agent_events, agent_trades, agent_positions, agent_signals, forum_threads, forum_posts, sandbox_runs, hardness_agent_proofs | SELECT | SELECT | ALL |
| agent_messages, user_interests, user_digests | SELECT | SELECT | ALL — las escrituras del navegador (AdamsChat, runner, ProactiveNotification) pasan a `/api/*` antes del corte, o se les da una política INSERT acotada por columna mientras tanto |
| user_feedback | INSERT (solo `with check` de columnas permitidas) | INSERT | ALL |
| indicator_cache, api_cache | SELECT vigentes | SELECT vigentes | ALL |
| mcp_payment_challenges, mcp_payment_receipts, hardness_agents, hardness_agent_sessions, memory_objects, agent_config, agent_macro_events, agent_market_snapshots, agent_source_health, agent_position_rechecks, telegram_* , agent_profiles, dm_conversations, trade_intents, llm_calls, cycle_transitions, agent_memory | — | — | ALL |

Verificación del gate 3: consulta a `pg_policies` que reproduzca exactamente
esta matriz (no un `count >= 10`), y `rls_enabled = true` en las 27 tablas.

## 5. Pruebas después del corte

Las pruebas 1 a 6 solo leen. **Las 7, 8, 9 y 10 escriben** y se corren como
canarios, en ese orden, cada una con su rollback declarado.

| # | Prueba | Esperado | Escribe |
|---|---|---|---|
| 1 | `GET /api/bobby-protocol-stats` | Igual al manifiesto T0 (baseline hoy: 864 publicadas, 794 resueltas, 433 aciertos, 244 fallos, 54.5 %) | no |
| 2 | `/agentic-world/bobby/history` y `/protocol` | Track record idéntico, enlaces a Base funcionando | no |
| 3 | `/agentic-world` y el foro web (build nuevo) | Hilos con las mismas fechas que el T0 | no |
| 4 | `verified-calls` y `protocol-tx-history` | Todos los proofs resuelven a su hilo, 0 huérfanos | no |
| 5 | `bobby-intel`, `voice-tool` BTC, `bobby-asset-search?q=nvda` | 200, mismas formas | no |
| 6 | iOS build 11: aviso → squad → forja → desk → NO TRADE | Igual que hoy | no |
| 7 | `bobby-cycle` con `BOBBY_CYCLE_CANARY=1` | Un ciclo `dryrun` en la base nueva, cero en la vieja, cero mensajes externos | sí (1 fila agent_cycles + eventos) |
| 8 | `POST /api/mcp-http` flujo de challenge de prueba | Challenge en la base nueva, marcado `test=true`, borrado al final | sí |
| 9 | Telegram: `/start` desde una cuenta de prueba y una entrega de `telegram-deliver` a ese chat | Registro en la base decidida en el gate 1; un solo mensaje, al chat de prueba | sí |
| 10 | Early access con un correo de prueba | Fila en `bobby_early_access` (nueva), nada en `newsletter_subscribers`; se borra al final | sí |

## 6. Qué NO cambia con la migración

Contratos y direcciones en Base, el Safe, `BASE_RECORDER_KEY`, el registro
on-chain ya escrito, la app iOS y su archivo, las voces, las claves de OKX,
Yahoo, Higgsfield, el dominio `bobbyprotocol.xyz`, el proyecto Vercel
`bobby-agent-trader`. Ningún usuario tiene cuenta: no hay sesiones ni
contraseñas que migrar.

## 7. Qué entra en la fase 0 (código, sin datos) a raíz de esta revisión

1. Helper `bobby-db.ts` y cero fallbacks hardcodeados (gate 2).
2. Guardia `CRON_SECRET` / cabecera `x-vercel-cron` en `bobby-cycle` y
   `settle-trades` (hallazgo J).
3. Flag `BOBBY_CYCLE_CANARY` que silencia Telegram, Twitter y
   `telegram-deliver` (hallazgo K, gate 11).
4. Flag `BOBBY_WRITE_FREEZE` en los endpoints de escritura (gate 5).
5. Llamadas a `defimexico.org` → rutas propias (hallazgo I).
6. Escrituras del navegador (AdamsChat, runner, ProactiveNotification,
   BobbyTelegramPage) movidas a `/api/*` o acotadas por política (gate 3, E).
7. `bobby-early-access` → tabla propia.
