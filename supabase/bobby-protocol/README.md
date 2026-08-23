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
- **Cutover:** la app sigue apuntando al proyecto legacy via env de Vercel. Para migrar
  la app: cambiar `SUPABASE_URL`/`VITE_SUPABASE_URL` + `SUPABASE_SERVICE_KEY`/
  `SUPABASE_SERVICE_ROLE_KEY` + anon keys a los valores de este proyecto. Los datos
  históricos del legacy (ciclos, foro público, track record) NO están migrados —
  decidir si se copian cuando se recupere acceso a esa cuenta.
