# Base mainnet readiness r1 — Codex + Kimi K3

**Date:** 2026-08-14
**Target:** Base mainnet launch, Monday 2026-08-17
**Scope:** release engineering, backend signing paths, environment isolation,
manifest provenance, Safe operations and cutover controls. TrackRecordV2 contract
logic was intentionally left to its separate audit worktree.

## Verdict

**NO-GO today, with the release-engineering blockers converted into fail-closed
gates.** Monday remains achievable only if the final TrackRecordV2 artifact is
merged and rehearsed immediately, and every external prerequisite below closes.

## Closed in this round

- Unknown `PROTOCOL_CHAIN` values now fail instead of silently selecting X Layer.
- Base-family writes require an explicit enable flag, exact chain-id confirmation,
  chain-specific recorder key, valid contract addresses and deployment block.
- Base mainnet writers run only under `VERCEL_ENV=production`; Base Sepolia is
  forbidden in production.
- Legacy X Layer signing is production-only unless an explicit local emergency
  override is set; preview deployments no longer inherit write authority merely
  because a recorder key is present.
- Every backend signer asserts the chain id returned by its RPC before signing.
- Trading, protocol automation and track-record mutations use separate secrets.
- `bobby-cycle` and Bobby's server-held live OKX account can be frozen during
  deploy/cutover; user-supplied OKX accounts remain independent.
- The remote `deploy-hardness` HTTP deployer is permanently retired with HTTP 410.
- Legacy activity/bounty generators refuse to run outside X Layer.
- The legacy TrackRecord API deliberately refuses Base until the audited V2 ABI
  and proof-flow adapter replace it.
- Hardness registration reads the deployed stake from the contract. ETH service
  prices are explicit per network rather than inherited from an OKB literal.
- Base treasury and recorder addresses are explicit in both backend and frontend;
  no X Layer treasury fallback remains.
- Resolver quorum cannot reuse treasury, recorder or deployer roles.
- Wallet connection defaults to Base while keeping X Layer available for archive
  and legacy swap surfaces.
- `.env.production`, `.env.preview` and other pulled environment files are ignored.
- Mainnet manifests can be finalized only from successful live receipts. CREATE,
  scorer and ownership-transfer transactions are semantically reconciled against
  the reviewed manifest, including the live transaction calldata, rather than
  merely archived.
- Safe ownership-acceptance and emergency pause/unpause batches are emitted in
  Safe Transaction Builder JSON directly from the finalized manifest.
- The cutover gate independently queries live Base state for the exact 2-of-3
  Safe policy, pinned proxy/singleton, no modules/guard, runtime code, accepted
  ownership, cleared pending owners and the Hardness scorer. The manual Foundry
  verifier remains a second implementation of the same critical checks.

## Verification evidence

- Kimi K3 final adversarial pass: no surviving P0/P1 in the reviewed release
  engineering scope; its material P2 findings were either closed in code or
  converted into explicit gates/runbook constraints.
- `npm run build`: pass.
- Node suites: 261 playbook assertions, 32 risk-gate assertions, API security,
  capability-auth and protocol-write safety all pass.
- `forge build --sizes`: pass; all current contracts below EIP-170.
- `forge test --fuzz-runs 1000`: **152/152 pass**. IntentEscrow invariants each ran
  128,000 handler calls; fuzz properties ran 1,000 cases.
- Base Sepolia manifest reconciliation: **8/8 live receipts verified** against
  chain 84532 without modifying the manifest.
- Positive synthetic predeploy configuration: **42/42 gates pass**.
- Real local configuration: correctly returns NO-GO because launch identities,
  Safe pins, roles and economic values are not present.

## Hard blockers still open

1. Merge the final audited TrackRecordV2 contract, ABI, deployment script and API
   adapter; remove the explicit Base adapter guard only in that tested change.
2. Create and independently inspect the real Base 2-of-3 Safe; pin its proxy
   codehash, singleton and exact three-owner set.
3. Select independent deployer, recorder, treasury, operational roles and at
   least three resolvers with threshold at least two.
4. Deploy the exact final artifact to Base Sepolia and complete the 24-hour canary.
5. Create `contracts/deployments/8453.json` from live mainnet receipts; accept all
   seven ownership handoffs and pass `VerifyBaseDeployment` against live state.
6. Verify every source and runtime bytecode on Basescan.
7. Populate production-only Base addresses/secrets in Vercel. Never place the Base
   recorder key in Preview or Development.

## Residual, non-blocking-for-broadcast work

- Several product/archive pages still contain intentionally legacy X Layer copy or
  direct reads. They must be labeled as archive or migrated before claiming the
  entire site is Base-native.
- Some server reads retain production Supabase URL/anon fallbacks; isolate preview
  data before using previews for untrusted testing.
- Production dependency audit reports 11 moderate advisories through the
  wagmi/MetaMask/OKX dependency tree. The available automatic fix is breaking and
  should be handled after launch in a dedicated upgrade branch.
