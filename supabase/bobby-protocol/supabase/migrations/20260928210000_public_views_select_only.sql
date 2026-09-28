-- ============================================================
-- Audit 2026-09-28 P0: the shaped public views were writable by the browser
-- roles.
--
-- Supabase's default privileges in this schema (postgres: anon=arwdDxtm,
-- authenticated=arwdDxtm) hand ALL on every new relation to both browser
-- roles. Migrations 0010 and 0011 revoked from the PUBLIC pseudo-role only,
-- which leaves those direct grants in place, so anon and authenticated kept
-- INSERT / UPDATE / DELETE / TRUNCATE on both views.
--
-- agent_cycles_public is a single-table view, therefore auto-updatable, and it
-- runs as its owner (postgres, no security_invoker): an anonymous PATCH or
-- DELETE through PostgREST was rewritten into a write on agent_cycles past its
-- RLS. agent_trades_public is a join and not updatable, but carried the same
-- grants.
--
-- The views stay definer views on purpose — the column list and the WHERE are
-- the policy over RLS-locked tables. What changes: the browser roles can only
-- read them. scripts/test-rls-lockdown-pg.mts reproduces the default
-- privileges and asserts the write path is closed.
-- ============================================================

revoke all on public.agent_cycles_public from anon, authenticated;
revoke all on public.agent_trades_public from anon, authenticated;
grant select on public.agent_cycles_public to anon, authenticated;
grant select on public.agent_trades_public to anon, authenticated;
