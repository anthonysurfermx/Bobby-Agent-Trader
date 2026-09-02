# Runbook de producción — fase 0 (aprobado el orden por Codex, pendiente de GO de ejecución)

Estado al escribirlo: preview 21/21, freeze real, gate C, sin residuos. Las 8
variables nuevas ya existen en **Production** (sin redeploy). Producción
sigue con el código anterior.

## 0. Precondiciones (verificadas)
- Vercel: proyecto `bobby-agent-trader`, team `anthonysurfermxs-projects`,
  repo `anthonysurfermx/Bobby-Agent-Trader`, rama de producción `main`,
  dominios `bobbyprotocol.xyz` + `www`.
- Production env: `BOBBY_SUPABASE_URL`, `BOBBY_SUPABASE_SERVICE_ROLE_KEY`,
  `BOBBY_SUPABASE_ANON_KEY`, `VITE_BOBBY_SUPABASE_URL`,
  `VITE_BOBBY_SUPABASE_ANON_KEY` (= legacy hasta el corte),
  `BOBBY_SESSION_SECRET`, `BOBBY_OPS_SECRET` (nuevos, distintos a preview),
  `BOBBY_CONTROL_SOURCE=table`. Las demás ya existían.
- Legacy: `bobby_control` (flags en falso), `bobby_early_access`,
  `forum_publish_receipts` + `bobby_publish_debate`.

## 1. Deploy del commit exacto aprobado
- Commit a desplegar: el HEAD revisado de `feat/phase0-hardening`
  (registrar el sha en este runbook al ejecutar).
- Mecanismo: PR `feat/phase0-hardening → main` y merge (Vercel despliega
  `main` a producción). Alternativa sin PR: `vercel promote` del preview no
  aplica (las variables de Preview son de rama). **Nada de `--force`.**
- Duración esperada: ~3 min de build. Sin ventana de corte: el código nuevo
  y el viejo conviven con la misma base y las mismas políticas.

## 2. Smoke inmediato (sin secretos)
```bash
BOBBY_API=https://bobbyprotocol.xyz npx tsx scripts/infra/preview-smoke.mts
```
Esperado: health con `control.source=table`, `deployment.env=production`,
challenge SIWE, 401/403 como en preview. Después, con wallet real: conectar
→ firmar → inbox/intereses/debates privados → publicar un debate.
Cron: esperar al de las 12:00 UTC o correr uno manual con `BOBBY_OPS_SECRET`
(ya no en canary: efectos reales).

## 3. Rollback en esta etapa (antes de RLS)
Vercel → Deployments → *Promote to Production* del deployment anterior, o
`git revert` del merge. Sin tocar la base: las tablas nuevas son inertes
para el código viejo. Sesiones de wallet dejan de existir; nada más.

## 4. RLS (solo con 1–2 en verde)
```
apply_migration 20260902_bobby_rls_hardening
```
Efecto: 15 tablas pasan de RLS apagado a service-role only; anon pierde
INSERT/UPDATE/DELETE en todo; foro privado oculto. El código nuevo no lo
nota (todo escribe con service role vía `/api`).

## 5. Gate completo
```bash
SUPABASE_URL=… SUPABASE_ANON_KEY=… SUPABASE_SERVICE_KEY=… \
BOBBY_TRANSCRIPT_SECRET=<BOBBY_SESSION_SECRET de Production> \
BOBBY_API=https://bobbyprotocol.xyz BOBBY_ORIGIN=https://bobbyprotocol.xyz \
npx tsx scripts/infra/rls-adversarial.mts        # exit 0 = GATE PASSED (ABC)
```
Planta canarios reales unos segundos (el hilo público nace expirado) y los
borra al final.

## 6. Rollback después de RLS (compatible)
Volver al código viejo **exige** volver también las políticas, si no las
escrituras directas del navegador con anon key fallan:
```
apply_migration 20260902_rls_restore_previous_policies   # supabase/rollback/
```
Restaura exactamente las políticas capturadas el 2026-09-02 (reabre los
huecos conocidos; es un rollback, no un estado deseable). Luego *Promote*
del deployment anterior. Al volver al código nuevo, reaplicar el hardening.

## 7. Corte a Supabase de Bobby (`qbvdqkknnuweatptjohi`) — separado
Manifiesto T0 (conteos, máximos, checksums por tabla) → backup → freeze
(`write_freeze=true`, Disable Cron Jobs, VPS/bot parados) → esquema + dump/
restore → `BOBBY_SUPABASE_*` y `VITE_BOBBY_SUPABASE_*` → destino → rebuild →
verificación total (conteos, IDs, proofs, vínculos on-chain) → freeze off →
`legacy-reference-audit` a cero (paso 7 del plan: retirar el producto
DeFi México del repo). Cada paso con su propio GO.

## Addendum — qué corre producción realmente (verificado 2026-09-02 noche)
- Producción se despliega con **`vercel --prod` desde local** (source `cli`),
  no desde `main`. Último deploy: `feat/web-companion` @ `3ccd8b18`.
- `main` está en `bb28ec3`, **46 commits por detrás de producción** y no se
  usa. La rama de fase 0 contiene exactamente producción (`3ccd8b18`) + 3
  commits de docs + 20 commits de fase 0: **no revierte ninguna feature**.
- El Live Desk en `/agentic-world/bobby` (sin wallet, por diseño: "este
  desk no se conecta a tu wallet") ya está en producción; el chat con
  wallet y sesión firmada vive en `/agentic-world/bobby/voice-room`, y los
  flujos firmados también en el foro y la página del challenge. No es una
  regresión de la fase 0. Añadir una entrada de wallet al desk es una
  decisión de producto aparte.
- Mecanismo recomendado para el deploy del commit aprobado: `vercel --prod`
  desde el worktree `phase0` en ese sha (mismo mecanismo de siempre, usa el
  env de Production). Después, fast-forward de `main` a ese sha para acabar
  con la deriva (requiere aprobación explícita: push a `main`).

## Ejecución (2026-09-02, 21:02 UTC) — GO de Anthony
- Paso 1 hecho: `vercel --prod` desde el worktree `phase0` en **`572389f`**
  → `bobby-agent-trader-nf23ttnqv…` aliased a `https://bobbyprotocol.xyz`.
  Build local previo en verde.
- Paso 2 hecho: health `deployment.env=production`, `control.source=table`,
  `db.ref=egpixaunlnzauztbrnuz`; smoke **21/21** en producción; bundle con
  `CompanionDesk` y `BobbyAgentTraderPage`.
- Rollback en esta etapa: Vercel → Promote del deployment anterior
  (`bobby-agent-trader-r13m1j4ab…`, `feat/web-companion@3ccd8b18`).
- Paso 4 hecho (21:08 UTC): `20260902_bobby_rls_hardening` aplicada en
  legacy. Verificado por SQL: 0 tablas protegidas con RLS apagado, 0
  políticas concedidas a `public` en tablas de Bobby, 36 políticas nuevas.
  Las únicas políticas anon no-SELECT restantes son de tablas del producto
  DeFi México (fuera de alcance hasta el paso 7). Lecturas anónimas tras
  RLS: foro público 3 filas, foro privado 0, `agent_cycles` 3,
  `agent_messages`/`user_interests`/`agent_profiles`/`memory_objects` 0,
  `hardness_agent_proofs` 1. Smoke de producción de nuevo 21/21; `/`,
  `/agentic-world/bobby`, `/voice-room`, `/agentic-world/forum`, `/desk` → 200.
- Paso 5: primera corrida del gate completo contra producción: 145 OK y 2
  fallos **del script** (fixture de `agent_trades` contra el CHECK de la
  tabla; INSERT anónimo de `user_feedback` pidiendo la fila de vuelta sin
  política SELECT). Corregidos en `8e04de7`; segunda corrida en curso.
- Paso 5 (21:10–21:35 UTC): tres corridas del gate completo contra
  producción. Corrida 1: 145 OK, 2 fallos de fixture (corregidos, `8e04de7`),
  con las 6 comprobaciones de `forum-publish` en verde (publicar 200,
  `0.7` almacenado, guest 403, otra wallet 403, convicción 70 rechazada,
  mismo recibo 409, transcripción editada 403). Corridas 2 y 3: 142 OK y
  solo `forum-publish` en 429 — el rate limit de 6/h por IP (fijo, en memoria
  por instancia) que la corrida 1 agotó. Unión de evidencia: **148/148
  comprobaciones en verde**, ninguna falla de seguridad. Pendiente una
  corrida única con `GATE PASSED` cuando expire la ventana (~22:15 UTC),
  requisito de Codex para el corte (paso 6), no para producción.
- Residuos en legacy tras las tres corridas: 0 en todas las tablas
  (canarios, recibos, feedback, nonces, flags).

## Addendum (Codex post-deploy review, 2026-09-02 ~21:30 UTC)

Findings 1–5 and 7 of the Codex review are addressed in code — see
`docs/infra/2026-09-02-codex-feedback-fixes.md`. Two operational notes:

- **Gate + rate limit.** Section C spends exactly the 6/h per-IP budget of
  `/api/forum-publish`. A full `GATE PASSED` needs a fresh window or a fresh
  deployment; the script now says so explicitly when 429s are the only
  failures. Run it once right after the next deploy.
- **SHA on CLI deploys.** Use `scripts/deploy-prod.sh` instead of a bare
  `vercel --prod` from the worktree; it injects `BOBBY_BUILD_SHA` and verifies
  `/api/bobby-health` reports HEAD before exiting 0.
- **Round 2 (Codex NO-GO on `e6b38bb`)**: `deploy-prod.sh` now deploys `git
  archive HEAD` (no untracked files can leak) and requires `HEAD ==
  origin/main`; the gate pre-flights the **persisted** forum-publish window
  in `api_cache` and waits for its real expiry (a new deployment does NOT
  reset it); Heartbeat explorer fallback moved to Basescan. Details in
  `docs/infra/2026-09-02-codex-feedback-fixes.md` (round 2).
- **Round 5 (Codex)**: `BOBBY_TRANSCRIPT_SECRET` is now its own Secret and the
  only receipt key in production; the gate exercises forum-publish through
  `/api/openclaw-chat` like the browser and never signs anything. Running it
  needs no signing secret — only the Supabase URL/keys, `GATE_EXPECTED_SHA`
  and the rate-limit salt from the Keychain.
