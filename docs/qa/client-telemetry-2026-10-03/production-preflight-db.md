# Production database preflight — read-only

Checked Bobby Supabase `qbvdqkknnuweatptjohi` at **2026-10-03 00:22:57 UTC**, with privilege/policy confirmation at 00:24:16 UTC, against immutable staged commit `93871936ce1902e327a192c625c22d34ee523d33`.

**No blocking drift was found for applying the two reviewed migrations in order.** This is schema/permission preflight evidence; no migration, production mutation, deployment, test rerun or load test was performed.

- Registry contains 49 applied migrations. All five imported production predecessors retain their exact version/name and statement hashes. Both reviewed new migrations remain unapplied.
- All seven previously captured target function definitions and 27 comparable target constraints are unchanged. Sixteen existing replacement functions preserve their input signatures and return types, including the 15-column people_facts wrapper and SETOF identity/device helpers.
- All 172 existing column types compared with the retained staged local catalog match. Existing named environment/period/event constraints match the reconciliation assumptions. Zero existing subscription environment/period values or event types would violate the new checks.
- All 22 targeted existing functions allow service_role execution and deny anon/authenticated execution. All 23 existing targeted tables have RLS enabled and service_role SELECT access. The legacy bobby_llm_spend helper remains service-only SECURITY DEFINER; the reviewed migration leaves it unchanged.
- Identity table grants to client roles are protected by its service-only RLS policy. api_cache has the required service select/insert/update privileges and service-only RLS policy; service_role carries BYPASSRLS, while client roles do not.
- New client tables, new live/telemetry RPCs and all ten telemetry index names are absent, so there is no partial-install or name collision. Phase 1 must establish bobby_admin_live before phase 2 retains it as the server snapshot and adds client facts.

Operational requirement: 31 historical production versions use MCP-generated timestamps different from local filenames. These historical mappings are not new drift, but a blanket CLI db push/history replay would be inappropriate. Apply only `20261002231124_admin_truth_live_snapshot.sql`, then `20261002235202_first_party_client_telemetry.sql`, within the approved scope.

Anonymous machine-readable evidence: [production-preflight-db.json](production-preflight-db.json). It contains registry/function definition hashes, targeted column/constraint signatures, privilege/policy booleans and aggregate invalid-value counts; no customer data, credentials or raw function bodies.

## Local acceptance-query syntax check

At **2026-10-03 00:29:48 UTC**, PostgreSQL successfully parsed and planned all six new acceptance snippets **A, B0, B, C, D and E** against the existing local `dashboard_telemetry_final` database. All referenced columns and function signatures resolved. Each query used a separate `BEGIN READ ONLY` transaction, a 2-second statement timeout and a 250-millisecond lock timeout, with deterministic fake identifiers/build values and a five-minute case interval.

This used `EXPLAIN (FORMAT JSON)` without `ANALYZE`; it validates syntax and schema compatibility, not returned facts or runtime performance. No fixtures, database reset, new cluster, prior suite/performance rerun or production query was performed. The compact results are recorded under `localAcceptanceQueryExplain` in the machine-readable evidence.
