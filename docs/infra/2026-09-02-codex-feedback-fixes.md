# Codex post-production review — fixes (2026-09-02)

Source: Codex verdict on the phase-0 production deploy (`572389f`, deployment
`dpl_ERJcZw41PaDq84AbZRXmyJ5WFia4`). Its confirmed items are not repeated
here; this file tracks the seven open findings and what closed each one.

| # | Finding | Status | Where |
|---|---------|--------|-------|
| 1 | Lazy routes flash `Cargando · DeFi México Hub` | **fixed** | `src/App.tsx` PageLoader → `Loading · Bobby Protocol` |
| 2 | `/api/registry` says chain 8453 + name "X Layer" + Base RPC | **fixed** | `api/registry.ts` — chain block from `DEFAULT_CHAIN`, `provenance` map, live `mcpFee`, contracts carry `chainId` |
| 3 | Three on-chain stories with no declared provenance | **fixed** | `provenance.live / canary / archive / ledger` in the registry; Live Desk badge no longer claims on-chain verification |
| 4 | Landing shows `DEBATES 0` next to `DECISIONS 864` | **fixed** | `src/pages/BobbyProtocolLanding.tsx` — both counters from the resolution ledger, caption states each row's source |
| 5 | Health returns `sha: null` on CLI deploys | **fixed (code) — needs one deploy** | `api/bobby-health.ts` + `scripts/deploy-prod.sh` |
| 6 | Active DB is still legacy `egpixaunlnzauztbrnuz` | expected in phase 0 | no change; cut-over is the separate GO |
| 7 | No single run ending in `GATE PASSED` | **explained + instrumented — needs one run** | `scripts/infra/rls-adversarial.mts` |

## 1 · Loader

The Suspense fallback in `App.tsx` was the last *visible* DeFi México string
on Bobby routes. It now reads `Loading / Bobby Protocol`. The other DeFi
México references in `src/` belong to the DeFi México product pages that are
scheduled for removal in step 7 of the runbook, not to Bobby routes.

## 2 · Registry chain metadata

`api/registry.ts` imported the deprecated `XLAYER_CHAIN_ID` /
`XLAYER_RPC_FALLBACK_URL` aliases (which already resolve to Base) but kept
the literal `name: 'X Layer'`. Now:

- `chain` = `{ id, name, nativeSymbol, rpc, explorer }` from `DEFAULT_CHAIN`.
  `rpc` is the new static `publicRpcUrl` (never the env override, which may
  carry a provider key). `/api/bobby-protocol-stats` uses the same field.
- `contracts.*.chainId` is explicit.
- Premium tool cost was hardcoded `0.001 OKB` (X Layer era). It now reads
  `AgentEconomy.mcpCallFee` at request time and exposes it as `mcpFee`
  (local probe against Base: `0.000025 ETH`).
- `version` bumped to `3.1.0` so integrators can detect the new shape.

## 3 · Provenance of the on-chain surfaces

The three chains are intentional, but were only discoverable by reading
code. The registry now publishes:

```
provenance.live     8453  Base          protocol contracts — /api/bobby-protocol-stats
provenance.canary   84532 Base Sepolia  TrackRecord v2 + Pyth — /api/verified-calls
provenance.archive  196   X Layer       read-only hackathon-era record (+ addresses)
provenance.ledger         —             resolution ledger, all eras — debateActivity
```

The Live Desk badge (`SkinInTheGameBadge`) reads `/api/bobby-pnl`, which is
the OKX track record, so `VERIFIED ON-CHAIN (X Layer)` was a false claim
regardless of chain. It now says `OKX TRACK RECORD`. `BobbyHeartbeatPage`
fallbacks moved from X Layer / OKB to `DEFAULT_CHAIN`.

## 4 · Landing counters

`Debates` came from the new Base `AgentEconomy.totalDebates` (0 so far);
`Decisions` from the Supabase resolution ledger (864). Both hero and
"How it works" grids now take debates, decisions and win rate from the
ledger, and a one-line caption under each grid states: ledger for those
three, AgentEconomy on Base for MCP calls / interactions, including how many
debates have settled on Base so far. Nothing was removed — the Base-only
figures still appear in the "On-chain record" proof point.

## 5 · Deployment SHA

Root cause: production is deployed with `vercel --prod` from the `phase0`
git worktree. A worktree's `.git` is a *file*, so the CLI ships no git
metadata and `VERCEL_GIT_COMMIT_SHA` is never set.

- `api/bobby-health.ts` now reports `deployment.{sha, fullSha, ref,
  shaSource, deploymentId}` from `VERCEL_GIT_COMMIT_SHA` (git-integrated
  deploys) or `BOBBY_BUILD_SHA` / `BOBBY_BUILD_REF` (CLI deploys).
- `scripts/deploy-prod.sh` refuses a dirty tree, builds, deploys with
  `-e BOBBY_BUILD_SHA=<HEAD> -e BOBBY_BUILD_REF=<branch>` scoped to that
  deployment, then polls the health endpoint until `fullSha` equals HEAD.

The next production deploy is the first one that will report a SHA. A
git-integrated deploy from `main` would report it without the script.

## 6 · Legacy database

Unchanged and expected: the phase-0 goal was hardening *on* the legacy
project. The cut-over to `bobby-protocol` remains a separate GO.

## 7 · Single `GATE PASSED` run

Why runs 2 and 3 failed: `/api/forum-publish` is rate-limited to **6 per IP
per hour** (fixed window, in memory per instance) and section C of the gate
spends **exactly six** calls on it. Run 1 consumed the budget; runs 2 and 3
hit 429 on those six checks and nothing else. 148/148 distinct checks passed
across runs, but no single run could.

The gate now counts 429s separately and, when they are the only failures,
prints `RATE-LIMITED … rerun ONCE after HH:MM UTC or right after a fresh
deployment` instead of an ambiguous failure. The limit itself was **not**
changed — loosening a production write limit to satisfy a test would be the
wrong trade.

Recipe for the formal run: deploy this commit (fresh instances ⇒ counters at
zero), then run the gate **once** with the production env. Exit 0 + the
literal `GATE PASSED` line is the artefact Codex asked for.

## Remaining, in Codex's order (human GO required for each)

1. Fast-forward `main` to this branch (`origin/main` and local `main` are
   both ancestors — no merge needed).
2. Deploy: either push `main` (git-integrated, SHA automatic) or
   `scripts/deploy-prod.sh` from the worktree (SHA injected). Confirm
   `/api/bobby-health → deployment.sha` matches HEAD.
3. Run the RLS gate once against production → `GATE PASSED`.
4. Ask for the separate GO for the Supabase `bobby-protocol` cut-over.
   Do **not** touch the final data migration before that.

---

## Round 2 — Codex NO-GO on `e6b38bb` (three blockers), closed

| # | Blocker | Fix |
|---|---------|-----|
| P1 | `deploy-prod.sh` ignored untracked files and did not require `HEAD == origin/main`, so the reported SHA did not certify the deployed tree | The script now refuses any tracked **or untracked** change, fetches and requires `HEAD == origin/main` (explicit `DEPLOY_ALLOW_NON_MAIN=1` override, printed loudly), exports **`git archive HEAD`** to a temp dir, runs `npm ci && npm run build` there and deploys that directory with `--cwd`. Nothing outside the commit can reach Vercel, and the health check still has to report `fullSha === HEAD` before exit 0 |
| P1 | A new deployment does not reset the forum-publish limit: it is persisted in `api_cache` (`rl:forum-publish:<sha256(salt:ip)[:24]>`, fixed hour from the first hit) | The gate no longer claims that. Before the six-call sequence it **pre-flights the persisted row** for its own IP (public IP via ipify + `RATE_LIMIT_SALT`, default `bobby-rl-v1`) and, when the window is live, **waits for the real expiry** (default on; `GATE_WAIT_FOR_RATE_LIMIT=0` to refuse, `GATE_MAX_WAIT_SEC` cap 3900). If the row cannot be resolved, the first 429 is not counted: the run honours **`Retry-After`** (computed from `api_cache`), waits, and retries the sequence exactly once. The RATE-LIMITED summary now states that a deploy does not reset the window |
| P2 | Heartbeat `explorerUrl` still fell back to `https://www.oklink.com/xlayer` | Falls back to `DEFAULT_CHAIN.explorerUrl` (Basescan) like name, id and symbol |

Verification: `bash -n scripts/deploy-prod.sh`, `npx tsx scripts/infra/rls-adversarial.mts` (parses, exits 2 without env as designed), `npm run build` (API type-check + Vite) green.

Order after this commit, as Codex recommends: fast-forward + push `main` → prefer the Git-integrated deployment (SHA automatic) → confirm `deployment.fullSha === HEAD` → let the gate wait for the real window → one run to `GATE PASSED` → separate GO for the Supabase `bobby-protocol` cut-over.

---

## Round 3 — Codex NO-GO on moving `main` (public salt), closed

**Finding (P1).** `RATE_LIMIT_SALT` did not exist in Production, so the API
and the gate both used the public default `bobby-rl-v1`: the persisted IP
hashes in `api_cache` were enumerable from any list of addresses.

**Done.**
- A random 32-byte salt now exists in Vercel for **Production**, and a
  different one for **Preview (branch `feat/phase0-hardening`)**. Created by
  piping `openssl rand` into `vercel env add`; the values were never printed
  and are not in this repo. They are non-sensitive on purpose so the operator
  can `vercel env pull` them for the gate. (The CLI's non-interactive "all
  Preview branches" path is broken in 54.10.3, hence the branch scope.)
- `api/_lib/rate-limit.ts`: in production a missing or short salt now
  **throws** (`RateLimitConfigError`) — no public fallback. Local/preview keep
  a development default (`bobby-rl-dev`).
- `/api/bobby-health` reports `ops.rateLimitSaltConfigured` (boolean, never
  the value).
- The gate **requires** `RATE_LIMIT_SALT` (exit 2 otherwise), uses it for the
  persisted-window pre-flight, and adds two checks against the target: the
  deployment runs with a real salt, and it reports its commit SHA.
- The untracked `docs/trader-land/CODEX-SYSTEM-IMPROVEMENTS-v0.3.md` was moved
  (not deleted) to branch `docs/trader-land-codex-v0.3` so the deploy script's
  clean-tree rule holds.

**Effect on the next deploy.** `ec3b511`'s production reports `sha: null`
because it is not deployed yet — expected. The first deployment of this commit
will start with fresh limiter keys (new salt ⇒ new hashes), which also means
the gate's first run after it does not inherit the old window.
