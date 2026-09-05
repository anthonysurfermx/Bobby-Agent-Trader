# Base stock swaps via Bobby Protocol — launch readiness (2026-09-05)

State of every gate between `security/remediation-r2` and swaps being live on Base, with
what is already proven, what is prepared, and the exact action left for each residual
item. Nothing in this document was deployed, migrated, flipped, signed or uploaded by the
agent; every production action is Anthony's, in the order below.

## 1. Gates — status

| Gate | Status | Evidence |
|---|---|---|
| Expanded audit 2026-09-04 (BP-01..BP-14) | **closed, 14/14** | `docs/security/2026-09-03-remediation-r2.md` rounds 12 / 12b / 12c |
| Production contract source unchanged since round 8 | **yes** | `HardnessRegistry` runtime `0x3449ac07…b043e0d5`, 23,471 B; all seven under EIP-170 (`check-sizes.sh`) |
| Full test matrix | **green** | Foundry 283/283, remediation 45/45, rpc-redaction 12/12, api-security 47/47, both anvil ABI suites, three Postgres suites, build/lint/typecheck |
| Deploy configuration (public values) | **complete** | `deploy/base-mainnet.env.example` — every public value filled from the manifest, the live Safe and the runbooks, incl. the seven `V2_*` and treasury/bond |
| `check:mainnet:predeploy` | **NO-GO 4 → only the Vercel secrets** | with the env file and no secrets: `XLAYER_RECORD_SECRET`, `TRADING_API_SECRET`, `PROTOCOL_AUTOMATION_SECRET`, `PYTH_HERMES_API_KEY` missing; nothing else. Success prints `GO: configuration gates passed` |
| `check:mainnet:postdeploy` ↔ `finalize:base-manifest` | **coherent since the third round** | readiness now expects the 12 CALL receipts finalize writes (scorer, treasury ×2, both bonds, 7 handoffs); an execution test in `test:protocol-write-safety` proves the finalize-shaped manifest passes and a manifest with the treasury receipts removed fails |
| DeployBase simulation on a Base mainnet fork | **passed** | `forge script … --sender 0xC3F8…35d1` (no `--broadcast`): SafeOwnerGate validated the live Safe, seven contracts, treasury + bonds configured before the handoff, **post-deploy assertions ALL PASSED**, manifest carries `v2Params`, `treasury`, `fees.challengeBondWei`; ~25.0M gas ≈ 0.00027 ETH at 0.011 gwei |
| Deployer gas | **sufficient today** | `0xC3F8…35d1` holds 0.00139 ETH ≈ 5× the simulated cost; top up if Base gas rises |
| Supabase migrations | **0010 applied; 0011/0012/0013 pending, preconditions verified** | read-only preflight on `qbvdqkknnuweatptjohi`; `0012` fixed to `row_version` after the preflight found the text `version` column |
| Safe `activatePyth(0xbC16…2F5)` on TrackRecordV2 | **pending (timelock elapsed 2026-08-21)** | live `activePyth` is still `0x8250…487a`; calldata in the runbook §2c |
| Live V2 params | **already the reviewed values** | `params()` = 60/120/600/604800/100/100/50 |
| Independent third round (Codex + Kimi K3) | **pending → decides GO 3/3** | brief: `docs/security/2026-09-05-third-round-brief.md` |
| Legal country allow-list, OKX key revocation | **pending, non-technical** | runbook §5, §6 |
| iOS build (Trader Land commit, distribution archive, upload) | **pending** | `project_ios_release_status`; Anthony uploads |

## 2. Order of operations (Anthony)

1. **Third round.** Run the brief. Record GO 3/3 in the report only if the runtime hash is
   unchanged and nothing reopens. Stop here on any NO-GO.
2. **Migrations** on `qbvdqkknnuweatptjohi`, in order, via the Supabase MCP `apply_migration`
   (or the SQL editor), each followed by its check:
   - `20260903000011_cycle_provenance.sql` → `select count(*) from agent_cycles_public;` returns only
     scheduled cycles (historical rows stay private until an operator tags them).
   - `20260903000012_hardness_agent_cas.sql` → `select column_name from information_schema.columns
     where table_name='hardness_agents' and column_name in ('version','row_version');` returns both.
   - `20260903000013_mcp_challenge_binding.sql` → `select conname from pg_constraint where conname =
     'mcp_payment_challenges_status_check';` exists.
   Then `DATABASE_URL=<scratch> npm run test:rls-lockdown-pg` locally is unchanged; production
   verification is the three queries above.
3. **Decision: full redeploy or keep the current TrackRecordV2.** `DeployBase` has no partial
   mode: step 4 deploys all seven contracts (a NEW TrackRecordV2 whose constructor already
   activates `0xbC16…2F5`), and the manifest / verifier / readiness chain only describes complete
   deployments. The `activatePyth` Safe transaction (runbook §2c, batch
   `contracts/deployments/safe-batches/8453-activate-pyth.json`, to
   `0x822DB0DbbCAB398e610fcBA86DA9BB92d2493321`, data `0xb4d6badf…e272f5`) therefore applies
   **only if you keep the current TrackRecordV2** (its verified history) and skip the full
   redeploy — in which case a partial deploy script would be needed first, because the readiness
   chain cannot certify a mixed deployment. Default plan: full redeploy, step 3 skipped.
   Check after signing (if kept): `cast call 0x822D…2321 'activePyth()(address)' --rpc-url
   https://mainnet.base.org` returns `0xbC16aee60f64864882BC6C4E428e148Fc0E272F5`.
4. **Redeploy** (3-round rule satisfied only after step 1). The broadcast needs a signer flag
   (`--ledger`, `--account <name>` or `--interactive`) and `BASESCAN_API_KEY` for `--verify`:
   ```
   set -a; source deploy/base-mainnet.env.example; set +a   # then export the five secrets from your shell
   npm run check:mainnet:predeploy                           # must print "GO: configuration gates passed"
   cd contracts && forge script script/DeployBase.s.sol --rpc-url $BASE_RPC_URL --sender $DEPLOYER_ADDRESS --ledger --broadcast --verify -vvvv && cd ..
   npm run finalize:base-manifest -- --write                 # live receipts into contracts/deployments/8453.json (19: 7 CREATE + 12 CALL)
   (cd contracts && forge script script/VerifyBaseDeployment.s.sol --rpc-url $BASE_RPC_URL)   # incl. v2Params vs live
   npm run build:safe-launch-batch -- --action=accept > contracts/deployments/safe-batches/8453-accept-ownership.json
   npm run check:mainnet:postdeploy                          # must print GO (readiness now expects the treasury/bond receipts)
   ```
   Import the accept batch in the Safe and sign 2 of 3; re-run `VerifyBaseDeployment` (owners == Safe).
   Update the seven `BASE_*_ADDRESS` and `BASE_PROTOCOL_DEPLOYMENT_BLOCK` in Vercel from the
   new manifest; `npm run gen:hardness-abi` is a no-op (source unchanged) but run it anyway.
5. **Environment** (runbook §3/§4): `PROTOCOL_CHAIN=base` is already the default; set
   `PROTOCOL_WRITES_ENABLED=true` only after the canary, then `BASE_STOCK_SWAPS_ENABLED=true`
   as the deliberate flip. `check:mainnet:cutover` must print `GO: configuration gates passed` first.
6. **Legal + hygiene**: country allow-list sign-off (§5), revoke the OKX key (§6).
7. **iOS**: reviewed commit of the Trader Land files on `ios/apple-login`, clean archive with
   distribution signing, export with `destination=export`, upload.

## 3. What the agent left ready

- `deploy/base-mainnet.env.example` (no secrets) — sources cleanly (`set -a; source …`).
- Manifest, verifier and readiness all understand `v2Params`; the simulation proves the path.
- Migrations 0011–0013 tested on Postgres 17 against the production column shapes.
- Safe calldata for `activatePyth` verified with `cast calldata`, and the importable batch
  `contracts/deployments/safe-batches/8453-activate-pyth.json` (pinned to the gate's address).
- The third-round brief with every command and attack per finding.
- Rollback: runbook §Rollback (flags back to `false`, `PROTOCOL_CUTOVER_FREEZE=true`,
  migrations are additive — views can be dropped without data loss).
