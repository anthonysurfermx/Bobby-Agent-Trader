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
