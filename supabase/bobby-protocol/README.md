# bobby-protocol — Supabase project (nuevo, 2026-08-23)

- **Ref:** `qbvdqkknnuweatptjohi` · org **anthonysurfermx** · us-east-1 · micro
- **Dashboard:** https://supabase.com/dashboard/project/qbvdqkknnuweatptjohi
- **Por qué existe:** el proyecto legacy (`egpixaunlnzauztbrnuz`, DeFi México) vive en
  una cuenta a la que hoy no tenemos acceso de administración; este proyecto nos da
  control total de migraciones para la app de Bobby.
- **Credenciales:** `.claude/supabase-bobby-protocol.env` (gitignoreado) — DB password,
  URL, anon y service_role. NUNCA commitear.
- **Migraciones:** viven en `supabase/bobby-protocol/supabase/migrations/`
  (separadas de `supabase/migrations/`, que es la historia del proyecto legacy).
  Nuevas migraciones = nuevo archivo ahí con prefijo timestamp. Aplicar con:

  ```bash
  supabase migration up \
    --workdir supabase/bobby-protocol \
    --db-url "postgresql://postgres.qbvdqkknnuweatptjohi:<DB_PASSWORD>@aws-0-us-east-1.pooler.supabase.com:5432/postgres"
  ```

- **Baseline aplicado (20260823000001):** `agent_profiles` (incluye `mascot` jsonb),
  `forum_threads`, `forum_posts`, `api_cache`. RLS activado en todo: service_role
  escribe; anon solo lee foro público y caché vigente.
- **Cutover (fase 1, pendiente de GO):** la app sigue apuntando al proyecto legacy.
  El corte NO cambia las variables legacy (`SUPABASE_URL`, `SUPABASE_SERVICE_KEY`…):
  el backend resuelve la base de Bobby en `api/_lib/bobby-db.ts`, que prefiere
  `BOBBY_SUPABASE_URL`, `BOBBY_SUPABASE_ANON_KEY` y `BOBBY_SUPABASE_SERVICE_ROLE_KEY`
  (y `VITE_BOBBY_SUPABASE_*` en el cliente). Cortar = poblar SOLO esas variables con
  este proyecto y redesplegar; volver = vaciarlas. Los datos históricos (26,321 filas
  en 38 tablas, ver `scripts/migration/tables.ts`) se copian antes con
  `scripts/migration/` (T0 manifest → export → import → sequences → verify), con
  `migration_outbox` activo para un rollback sin pérdida. Runbook:
  `docs/infra/2026-09-03-cutover-prep.md`.
