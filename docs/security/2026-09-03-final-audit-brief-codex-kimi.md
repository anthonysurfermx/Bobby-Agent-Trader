# Final independent audit — brief for Codex and Kimi K3

Run this via CLI, each model independently, without reading the other's output first.
The value is in where you disagree with each other and with the report below.

## Objective

Adversarially re-audit the Bobby stack before the Base tokenized-stock swap rail is
switched on for real wallets. A prior audit (Claude, four parallel passes, 2026-09-03)
produced the report at `docs/security/2026-09-03-full-stack-audit.md`. **Your job is
not to repeat it. Your job is to try to break it**: confirm or refute each finding
with a reproduction, find what it missed, and rank what actually blocks the switch.

## Where the work lives

- Repo: `github.com/anthonysurfermx/Bobby-Agent-Trader`
- Tree under audit: **`e20d2b8`** — this is `origin/main` AND `feat/base-stocks-merged`
  (identical trees). The rail is already on the default branch.
- Report + this brief: branch `security/audit-2026-09-03`
- iOS: branch `origin/ios/apple-login` @ `32648b6` — read it with
  `git show origin/ios/apple-login:ios/Bobby/Sources/<file>`, do not check it out over
  the web tree.
- Contracts live on Base mainnet (8453). Addresses in `contracts/deployments/8453.json`.
  Owner is a 2/3 Safe. `bobby == hardnessScorer` is a backend hot key; the bounty
  `resolver` is a different single hot EOA.

## What is already established — do not re-derive

Verified by hand, with file:line in the report:
- The swap money path (`api/base-swap.ts`, `api/_lib/base-swap.ts`, `api/swap-receipt.ts`)
  has no attacker-controlled input reaching anything signed. Router/spender/recipient/
  minOut/deadline are all server-side constants or session-derived.
- SIWE, HMAC wallet sessions, HMAC intents, transcript receipts, the Telegram webhook
  and MCP payment verification are constant-time, fail-closed and single-use.
- 221 Foundry tests pass. `test:api-security` 47/47. `test:swap-ledger-pg` 3/3.
- The iOS app holds no wallet, no keys, signs nothing, sells nothing, registers no URL
  scheme. Tokens are in the Keychain. No WebView. No ATS exception.

If you believe any of the above is wrong, that is a headline finding — but bring a
reproduction, not an argument.

## The findings you must independently confirm or refute

Each one: reproduce it (a `curl`, a `cast call`, a Foundry test, a UI sequence), or
explain precisely why it does not reproduce. "Plausible" is not an answer.

**P0-1** `api/identity-link.ts:37` + `20260903000004_bobby_schema_exact.sql:2123` —
pairing code stored as `api_cache.cache_key`, table anon-readable while valid.
Reproduce with the anon key from the JS bundle against PostgREST. Then check every
other writer to `api_cache` for the same pattern (`api/_lib/wallet-session.ts:150-156`
is one).

**P0-2** `agent_trades_public_read` is `USING (true)` — per-trade PnL + `owner_address`
public. Reproduce with one PostgREST GET. Then run `bobby_rls_matrix()` against the live
project and diff it against the migration files: **the report only read migrations;
if the dashboard was edited by hand, the live state is unknown.**

**P0-3** `HardnessRegistry.resolvePrediction` — self-resolution with unconstrained
`exitPrice`/`pnlBps`. Write a Foundry test that registers, commits, warps 1h, resolves
WIN with `exitPrice = 1`, and asserts `winRateBps == 10000`. Also confirm the claim
that `api/_lib/hardness-registry.ts` never calls `resolvePrediction`, so Bobby's own
predictions expire while a forged record would not.

**P1-1** `SwapExecutor.tsx:226` — amount edit does not invalidate the quote. Reproduce
in the UI: quote 25, approve, type 5, read the button label, inspect the calldata
that `sendTransactionAsync` receives.

**P1-3** `/api/judge-mode` unauthenticated + reads private threads. `POST {}` with no
credentials against a staging deploy, or trace it statically if there is none.

**P1-6** `BobbyAdversarialBounties` — resolver challenges and awards itself. Foundry
test: post bounty as A, `submitChallenge` from resolver, `resolveBounty(id, resolver)`,
`withdraw()`, assert A's `withdrawBounty` reverts.

**P1-7** HardnessRegistry stake has no exit. Enumerate every function that credits
`pendingWithdrawals` or reduces `profile.stake` and confirm none is agent-callable.

For P1-2, P1-4, P1-5, P1-8: confirm the description matches the code; no reproduction
needed beyond that.

## What the prior audit could not do — do it

1. **Bytecode.** `cast code` each of the seven Base addresses and compare against a
   local `forge build` of `e20d2b8`. Confirm the Safe accepted ownership on all seven
   (`owner()` / `pendingOwner()`).
2. **Live balances.** How much ETH sits in `BobbyAdversarialBounties` and
   `HardnessRegistry` right now? That sizes P1-6 and P1-7.
3. **`x-vercel-ip-country` spoofing.** From a non-MX IP:
   `curl -H 'x-vercel-ip-country: MX' https://bobbyprotocol.xyz/api/base-swap …`
   Does Vercel overwrite the header or pass it through? This is the geo gate for
   tokenized stocks.
4. **Is `/api/identity-link` deployed?** If it is not reachable at bobbyprotocol.xyz,
   P0-1 is a pre-deploy fix, not a live breach. Say which.
5. **`smoke:base-swap` and `e2e:base-swap`** were not run (network / anvil). Run them.

## Where to hunt for what was missed

- Every `forum_threads` read on a public endpoint without `scope=eq.public`. The
  report found five; find the sixth.
- Every table with an anon SELECT policy in `20260903000004_bobby_schema_exact.sql`.
  For each: what columns leak, and is any of them an identifier?
- `api/harness-memory.ts:26-28` and `api/harness-events.ts:40` interpolate raw query
  params into PostgREST URLs. The report could not construct an impact. Try harder —
  resource embedding, `or=`, `select=` tricks.
- The identity merge RPC (`20260903000007_identity_link.sql`): are there merge orders
  that leave orphaned rows, or a way to merge a third identity into a pair?
- Anything in `api/` that reads `req.body.wallet`, `owner_address`, `user_id`, or
  `identity_id` and does not compare it to the session.

## Output format

One markdown file each: `docs/security/2026-09-03-final-audit-<codex|kimi>.md`.

```
## Verdict: GO / CONDITIONAL GO / NO-GO for BASE_STOCK_SWAPS_ENABLED=true
One paragraph. What blocks, what does not, what you would switch on today.

## Findings from the prior report
| ID | Status: CONFIRMED / REFUTED / PARTIAL | Reproduction or reason | Severity you assign |

## New findings
Same shape as the prior report: file:line, description quoting code, concrete
exploit, fix, confidence 1-10. Report only >= 7.

## What you checked and found clean
Specific. "The auth layer is fine" is worthless; "guardWrite rejects a body.wallet
that differs from the session at write-guard.ts:99-103, verified" is useful.

## What you could not verify
```

## Rules

- **Read-only against production.** No writes to the live Supabase project, no
  transactions on Base mainnet, no `vercel deploy`. Reproductions go against a local
  Postgres, an anvil fork, or a staging deploy.
- Do not push to `main`. Commit your report to `security/audit-2026-09-03` or your
  own branch.
- Never paste a real service-role key, session secret, or private key into a report.
  The anon key is public and fine to reference.
- If you fix something while reproducing it, keep the fix in a separate commit from
  the report and say so. Fixes are welcome; silent fixes are not.
- Do not soften a finding because the code comment says the case was considered.
  The r4 comment on `resolvePrediction` says exactly that, and it is P0-3.
- Language: report in English. Code and commits in English.

## Decision this feeds

Anthony flips `BASE_STOCK_SWAPS_ENABLED=true` in production, or does not, based on the
two verdicts plus the prior report. The three P0s are currently marked as blocking.
If you disagree with that ranking, say so and say why.
