# Production Supabase schema audit — Bobby iOS 1.7

The read-only schema prerequisites for coupons, memory and briefings are **verified** in Bobby's actual production project, `bobby-protocol` / `qbvdqkknnuweatptjohi`. The public `/api/bobby-health` response at `2026-10-04T09:47:28Z` confirms that exact ref; Supabase MCP reports the same project as healthy. The legacy `egpixaunlnzauztbrnuz` from old repository instructions was not queried.

Candidate source: clean HEAD `507616c99eb143e466084c85bbb177d11315bf68`. The health response serves production SHA `e128cca095562049705cbb65cf07cdb9af501b64`, so this audit does **not** establish that candidate application code is deployed. It establishes that the inspected database contracts match the candidate's relevant migration definitions.

| Gate | Result | Evidence |
|---|---|---|
| Actual production project binding | Verified | `bobby-health.json`, `project-evidence.json`; source resolver `api/_lib/bobby-db.ts:37` and public ref `:81` |
| Relevant migration history | 14/14 feature histories present | `migration-comparison.json`; remote applied versions differ from local filenames, so feature names are mapped and the live objects are independently checked |
| Expected tables and columns | 18/18 tables, 232/232 column names present | `catalog-evidence.json`, `structural-comparison.json` |
| RLS and public-role access | RLS enabled on all 18; anon/authenticated have no table or column grants; no RLS policies, consistent with service-only access | `catalog-evidence.json`, `column-privilege-evidence.json` |
| RPC presence and parameter contracts | 59/59 signatures match source | `signature-comparison.json` |
| RPC exposure | All 59 deny anon/authenticated execution, permit service_role, and pin `search_path=public, pg_temp` | `catalog-evidence.json`; the coupon function is intentionally SECURITY DEFINER, with its public-role EXECUTE privileges revoked |
| Function definitions | 58 match after whitespace normalization; the remaining function matches after removal of two SQL comments | `memory-record-body.diff`, `memory-record-drift.json`; no functional drift found |
| Indexes and critical constraints | 61 indexes valid; coupon/account uniqueness, bonus and memory keys, operation-key idempotency and five briefing language constraints verified | `index-evidence.json`, `structural-comparison.json`; 126 constraints inspected |
| Refund/privacy hooks | Seven non-internal triggers enabled | `catalog-evidence.json`; includes bonus refund and briefing memory/prefs hooks |

`bobby_memory_record` differs only by omission of the comments describing retention and asset cap. The executable retention and cap statements are unchanged. The production history now includes `admin_grant_idempotency_build54`; the older memory note saying that migration was not applied is stale.

## Feature acceptance matrix

| Feature | Verified production prerequisites | Remaining behavior gate |
|---|---|---|
| Coupons and gifted usage | Coupon/redemption/bonus schema, unique `(code, identity_id)`, code/balance constraints, service-only redeem function with Apple/Google account eligibility and row lock, read/level meters and refund hooks match source | Real controlled redemption, cap/expiry/replay/concurrency behavior and resulting account balance were not executed or read |
| Memory | Two memory tables, composite identity/symbol key, last-price column, service-only record/summary/forget signatures and retention/cap logic match source; delete/prefs hooks are enabled | Signed-in inspect/change/forget, native explicit opt-in and the production personalization kill switch were not exercised or inferred from schema |
| Briefings | Paid-evidence schema and paid-source eligibility guard, revision/idempotency and atomic device-binding functions, scheduling/worker/outbox/audio objects match source; language constraints allow en/es/fr/pt/pt-BR/it/de | Verified paid production account, scheduled generation, device registration, push/audio delivery and physical six-language reception remain functional gates |
| Admin gifted-credit retries | Operation ledger primary key, `bobby_admin_grant_once` and disabled legacy additive wrapper match source | No grant/retry RPC was invoked; this audit establishes structure and definition, not a new production grant |

The candidate API routes derive identities and use the service-role transport (`api/_lib/coupons.ts:28`, `api/_lib/user-memory.ts:100`, `api/_lib/briefings/db.ts:25`). Direct public access remains denied. Function definitions and grants cannot substitute for an authenticated application flow or a commercial/payment lifecycle result.

## Skill and current documentation

Applied the [Supabase skill](/Users/mrrobot/.codex/plugins/cache/openai-curated-remote/supabase/1.0.0/skills/supabase/SKILL.md), fetched the official [changelog Markdown](https://supabase.com/changelog.md), and reviewed the [PostgreSQL 15.19 / 17.11 breaking-change notice](https://supabase.com/changelog/postgres-15-19-17-11-breaking-changes) and [API access documentation](https://supabase.com/docs/guides/api/securing-your-api). This audit used the project's current PostgreSQL 17.6 catalogs. No affected ltree/btree_gist float index opclasses were found in `public`, and no public function declares legacy-cipher PGP encryption. The briefing push helper uses Node AES-256-GCM (`api/_lib/briefings/push-crypto.ts:34`); this was not a database upgrade or a scan of stored ciphertext.

Only catalog/public metadata SELECTs were executed. No personal table rows, account identifiers, coupon records, report contents, tokens or credentials were read. No feature RPC, migration, redeem, auth operation, configuration change, push, payment or production write was performed. Small summaries and source hashes are in `summary.json` and `expected-source.json`; raw catalog metadata is in the evidence JSON files.
