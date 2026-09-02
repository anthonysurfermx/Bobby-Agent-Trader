# ¿Se rompe algo de Bobby Protocol con la migración? — verificación

Fecha: 2026-09-02. Complementa `2026-09-02-bobby-vs-defimexico-audit.md`.
Método: lectura del código (84 endpoints, frontend, iOS), consultas de solo
lectura a las dos bases, `vercel.json`, API de Telegram. Nada se ejecutó.

## Veredicto

**No se rompe nada si se cumplen las 9 condiciones de la sección 3.** Cada
una corresponde a algo que sí se rompería si se omite. Lo que no depende de
Supabase (contratos en Base, Safe, binario iOS, voces, OKX, Yahoo) no se toca
y no puede romperse por esta migración.

## 1. Qué depende de la base (mapa de dependencias)

| Componente | Tablas / funciones | Cómo llega a la base | Consumidor |
|---|---|---|---|
| Cron diario `bobby-cycle` (12:00 UTC) | agent_cycles, agent_events, forum_threads, forum_posts, agent_messages, memory_objects, api_cache | REST con service key, URL de `VITE_SUPABASE_URL` | Track record público, foro, Telegram |
| Cron `settle-trades` (12:45 UTC) | agent_cycles, agent_trades | REST | Resolución del historial |
| Historial público `/api/bobby-protocol-stats`, `verified-calls`, `protocol-tx-history` | agent_events, forum_threads + contrato TrackRecord en Base | REST + lectura on-chain | Landing (`/app`), `/protocol`, App Store |
| Foro / Agentic World (web) | forum_threads, forum_posts, agent_messages, user_interests | **Directo desde el navegador** con `VITE_SUPABASE_URL` + anon key (`AgentForumPage`, `AdamsChat`, `ProactiveNotification`, `src/lib/supabase.ts`) | Usuarios web |
| Hardness (registro on-chain de pruebas) | hardness_agents, hardness_agent_sessions, hardness_agent_proofs | REST; el hash on-chain es `keccak256("bobby:" + forum_threads.id)` | HardnessRegistry en Base |
| MCP de pago (`mcp-http`, `mcp-bobby`) | mcp_payment_challenges, mcp_payment_receipts | REST | Agentes externos que pagan por análisis |
| Telegram `@Bobbyagentraderbot` (`telegram-webhook`, `telegram-deliver`, `telegram-access`) | agent_profiles, telegram_groups, telegram_connections, telegram_subscriptions, telegram_activation_sessions, user_digests | `.from()` con service key | Bot |
| Desk / app iOS y web (`bobby-voice-free`, `voice-tool`, `bobby-asset-search`, `okx-*`, `stock-*`) | **ninguna** (api_cache opcional vía `_lib/api-cache.ts`) | — | iOS, `/agentic-world/bobby` |
| Early access (`bobby-early-access`) | newsletter_subscribers (tabla DeFi) | `.from()` | Landing |
| Harness / sandbox (`harness-*`, `sandbox-*`, `checkpoint`) | agent_events, memory_objects, sandbox_runs, `exec_sql()` | REST | Herramientas internas |
| Feedback, digests, señales, ghost wallet, macro | user_feedback, user_digests, user_interests, agent_macro_events, indicator_cache | REST | Internos |

Cosas que **no** dependen de Supabase: los 7 contratos en Base y el Safe,
`BASE_RECORDER_KEY`, la app iOS (solo habla con bobbyprotocol.xyz/api), TTS,
OKX/Yahoo, Higgsfield, el archivo build 11.

## 2. Hallazgos que SÍ romperían algo si se ignoran

| # | Hallazgo | Qué se rompería | Severidad |
|---|---|---|---|
| A | 41 archivos leen la URL con **cuatro nombres distintos** (`VITE_SUPABASE_URL`, `SUPABASE_URL`, `SB_URL`, `NEXT_PUBLIC_SUPABASE_URL`) y dos nombres de service key (`SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_SERVICE_KEY`), más 46 fallbacks hardcodeados a `egpix…`. | Cualquier endpoint cuyo nombre de variable no se cambie seguiría escribiendo en la base vieja: datos partidos en dos. | Crítica |
| B | El navegador lee tablas Bobby directo (foro, Agentic World, chat Adams, notificaciones) con `VITE_SUPABASE_*`. | Si solo se cambia el server, el foro web mostraría la base vieja (congelada) mientras el cron escribe en la nueva. | Alta |
| C | Los hashes on-chain del HardnessRegistry se calculan sobre `forum_threads.id` (uuid). | Si el restore regenerara ids, ninguna prueba on-chain volvería a casar con su hilo. | Crítica (se evita preservando ids: `pg_dump` los conserva) |
| D | `hardness_agents`, `hardness_agent_sessions`, `hardness_agent_proofs` usan `bigint` identity; `agent_memory`, `llm_calls`, `cycle_transitions`, `trade_intents` usan secuencias (hoy vacías). | Sin `setval` tras el restore, el primer insert en hardness chocaría con un id existente. | Alta |
| E | Políticas RLS a recrear: lectura pública + escritura de service role en agent_cycles, agent_positions, agent_signals, agent_messages, agent_trades, forum_threads, forum_posts, user_digests, sandbox_runs, api_cache, mcp_*; inserción anónima en user_feedback e indicator_cache. Y 15 tablas hoy sin RLS. | Sin las políticas de lectura pública, el track record y el foro (que leen con anon key) quedarían vacíos; sin las de escritura, el cron fallaría. | Crítica |
| F | `exec_sql()` (SECURITY DEFINER, EXECUTE para PUBLIC) valida admin contra `user_roles` + `auth.uid()`, tablas de DeFi. `harness-migrate.ts` la usa. | En la base nueva no existe `user_roles`: `harness-migrate` dejaría de funcionar. No hay que portarla; se reemplaza por migraciones versionadas. | Media (herramienta interna) |
| G | El código referencia dos tablas que **no existen** en ninguna base: `forum_agents` (`forum-agent-register.ts`) y `agent_commerce_events` (`protocol-heartbeat.ts`, `_lib/agent-commerce-log.ts`). | Ya están rotas hoy; la migración es el momento de crearlas o de retirar ese código. | Baja |
| H | El bot de Telegram vive en un VPS (webhook a `103.114.43.97.sslip.io`) y el repo `aigts-bot` (bot GTS) también apunta a `egpix…`. | Si el VPS lee/escribe telegram_* en la base vieja después del corte, las suscripciones divergen. Hay que identificar el servicio y cambiarle el env el mismo día, o dejar telegram_* en legacy hasta que se mueva. | Alta |
| I | `bobby-cycle` y `user-cycle` llaman a `defimexico.org/api/telegram-deliver`, `bobby-intel` y `smart-money-leaderboard` (404 hoy). | Independiente de la migración, pero la entrega por Telegram del ciclo ya no llega. Se arregla en la fase 0. | Media |
| J | `api_cache` no se migra. | `_lib/api-cache.ts` devuelve `null` en frío y los endpoints refetchean: sin rotura, solo el primer ciclo más lento. | Ninguna |
| K | `agent_cycles.user_id` y `agent_profiles.user_id` están en null en las 3,404 filas. | No hay acoplamiento con `auth.users` de DeFi: nada que remapear. | Ninguna |
| L | El cron corre 12:00 y 12:45 UTC. | Migrar dentro de esa ventana perdería el ciclo del día. | Media |

## 3. Condiciones para que no se rompa nada

1. **Un solo punto de configuración.** Helper `api/_lib/bobby-db.ts` que resuelva URL y service key desde `BOBBY_SUPABASE_URL` / `BOBBY_SUPABASE_SERVICE_KEY`, con fallback a los nombres actuales, y reemplazar los 46 fallbacks hardcodeados. Verificación: `grep -rn "egpixaunlnzauztbrnuz" api src` debe devolver 0.
2. **Navegador cubierto.** `VITE_BOBBY_SUPABASE_URL` / `VITE_BOBBY_SUPABASE_ANON_KEY` en los 4 archivos que leen directo, y `src/lib/supabase.ts` con un cliente Bobby separado. Alternativa mejor a mediano plazo: que el foro lea por `/api`.
3. **IDs intactos.** Restore con `pg_dump --data-only` (conserva uuids). Verificación: los 10 últimos `forum_threads.id` en ambas bases son idénticos y `keccak256("bobby:"+id)` de una prueba on-chain existente resuelve al mismo hilo.
4. **Secuencias sincronizadas.** Tras el restore: `select setval(pg_get_serial_sequence('hardness_agents','id'), (select max(id) from hardness_agents))` y lo mismo para sessions/proofs. Verificación: un insert de prueba en transacción con rollback.
5. **Esquema completo antes de los datos.** Extensión `vector`, las 27 tablas Bobby (incluidas las 5 que faltan en el baseline), índices, políticas RLS de la lista E, y RLS habilitado con políticas explícitas en las 15 tablas hoy abiertas. Verificación: `list_tables` con `rls_enabled=true` en todas, y `select count(*) from pg_policies where tablename like 'agent_%'` ≥ 10.
6. **No portar `exec_sql`**; `harness-migrate` se marca obsoleto.
7. **Ventana fuera de 11:30–13:15 UTC**, con los dos crons pausados (`vercel.json` sin `crons` en un deploy temporal, o `CRON_SECRET` rotado) y reanudados después.
8. **Telegram decidido antes del corte:** VPS identificado y con env nuevo el mismo día, o telegram_* + agent_profiles + user_digests se quedan en legacy hasta mover el bot (el código de Bobby los lee con el mismo helper, así que basta con un `BOBBY_TELEGRAM_SUPABASE_URL` temporal).
9. **Base vieja en solo lectura para Bobby durante 30 días, no borrada.** Rollback = volver a apuntar el env.

## 4. Pruebas de humo después del corte (todas leen, ninguna escribe salvo la 7)

| # | Prueba | Esperado |
|---|---|---|
| 1 | `GET /api/bobby-protocol-stats` | Mismos números que antes del corte. Baseline 2026-09-02: 864 publicadas, 794 resueltas, 433 aciertos, 244 fallos, 54.5 %. A nivel tabla: 3,402 agent_cycles, 7,256 agent_events, 3,399 hilos, 10,980 posts |
| 2 | `/agentic-world/bobby/history` y `/protocol` | Track record idéntico, enlaces a Base funcionando |
| 3 | `/agentic-world` y el foro web | Hilos con las mismas fechas (2026-09-02 el último) |
| 4 | `GET /api/verified-calls` y `protocol-tx-history` | Cada prueba on-chain resuelve a un hilo (0 huérfanos) |
| 5 | `GET /api/bobby-intel`, `voice-tool` con BTC, `bobby-asset-search?q=nvda` | 200 y mismas formas de respuesta (no dependen de la base) |
| 6 | iOS build 11: aviso → squad → forja → desk → NO TRADE | Igual que hoy (no toca la base) |
| 7 | Ejecutar `bobby-cycle` manualmente con `CRON_SECRET` | Inserta un ciclo nuevo en la base nueva y cero en la vieja |
| 8 | `POST /api/mcp-http` flujo de challenge | Crea challenge en la base nueva |
| 9 | Telegram: `/start` al bot y una entrega de `telegram-deliver` | Responde y registra en la base decidida en la condición 8 |
| 10 | Landing early access | Escribe en `bobby_early_access` (nueva) y no en `newsletter_subscribers` |

## 5. Qué NO cambia con la migración

Contratos y direcciones en Base, el Safe, `BASE_RECORDER_KEY`, el registro
on-chain ya escrito, la app iOS y su archivo, las voces, las claves de OKX,
Yahoo, Higgsfield, el dominio `bobbyprotocol.xyz`, el proyecto Vercel
`bobby-agent-trader`. Ningún usuario tiene cuenta, así que no hay sesiones ni
contraseñas que migrar.
