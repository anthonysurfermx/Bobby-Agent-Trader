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
