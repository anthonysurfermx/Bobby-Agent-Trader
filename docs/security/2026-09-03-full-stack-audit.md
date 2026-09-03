# Bobby — full-stack security audit, 2026-09-03

Tree audited: `e20d2b8`, which is **both** `feat/base-stocks-merged` and `origin/main`
(identical trees — the rail is already on the default branch).
iOS audited on `origin/ios/apple-login` @ `32648b6`, the newest iOS branch and the
only one that references a wallet.

Four parallel audits: on-chain protocol, API/server, web client + config, iOS.
Findings marked **[verified]** were re-checked by hand against the source after the
audit reported them. The rest are reported as received and still need confirmation.

---

## The one-line version

Nothing lets an attacker take funds out of the swap rail — that path is genuinely
well built. The real exposure is **identity and data**: a pairing code that is
readable by anyone, two tables that are world-readable, and an on-chain "track
record" that anyone can forge. The forged-track-record issue matters more than its
CVSS suggests, because the public track record *is* the product claim.

---

## P0 — fix before anything else

### P0-1 · Identity-link codes are readable by the public [verified]

`api/identity-link.ts:37` · `20260903000004_bobby_schema_exact.sql:2123`

The 6-character pairing code IS the bearer credential, and it is stored as the
lookup key of a table that anon can read for exactly as long as the code is valid:

```sql
CREATE POLICY api_cache_anon_read ON public.api_cache
  FOR SELECT TO authenticated, anon USING ((expires_at > now()));
```
```ts
cache_key: `identity-link:${code}`, payload: { identity: identity.id, via: identity.via }
```

The anon key is in the public JS bundle. So: list `api_cache` where `cache_key`
starts with `identity-link:`, read a live code and the victim identity it points at,
and POST it to `/api/identity-link` as `claim` before the victim's phone does. The
merge RPC deletes the victim's `bobby_identities` row and moves their wallet,
XP ledger, Trader-Land inventory and pre-calls onto the attacker's identity.
Their next sign-in upserts into the attacker's row. There is **no unlink path**.

Brute force is not the issue and does not need fixing: the code is CSPRNG over 32
symbols, 10-minute TTL, genuinely single-use, per-IP capped. The flaw is that the
credential is published, not that it is weak.

Fix: store `sha256(code)` as the key, or move link codes to a service-role-only
table (`bobby_swap_receipts` already does this correctly). Then audit everything
else written to `api_cache` — SIWE challenge fields go there too.

### P0-2 · `agent_trades` is world-readable, wallet address included [verified]

`20260903000004_bobby_schema_exact.sql:2103`

```sql
CREATE POLICY agent_trades_public_read ON public.agent_trades
  FOR SELECT TO authenticated, anon USING (true);
```

`/api/bobby-pnl` is correct — anonymous callers get aggregates only, and its scope
filter is built from DB values, so there is no IDOR. But the control is decorative,
because the table behind it answers to the anon key directly, and the rows carry
`owner_address` alongside `amount_usd`, `entry_price`, `exit_price`,
`realized_pnl_pct` and `tx_hash`. Every user's per-trade PnL is public and
attributable, with no authentication.

Fix: `revoke all on public.agent_trades from anon, authenticated;` and drop the
policy — the same treatment `bobby_swap_receipts` already gets. Serve the public
track record through the aggregate branch or a view that omits `owner_address`.

### P0-3 · Anyone can mint a perfect on-chain track record [verified]

`contracts/src/HardnessRegistry.sol:412-456` — live at `0x15800F40…93f5`

`resolvePrediction` takes the outcome, the PnL *and* the exit price from the caller
and checks only that the three agree in sign. `exitPrice` is stored and never
compared to `entryPrice`, `targetPrice` or `stopPrice`. And:

```solidity
if (msg.sender != prediction.agent && !resolvers[msg.sender]) revert NotAuthorized();
```

means an agent is an authorised resolver **of its own prediction**. `registerAgent`
is permissionless at 0.00025 ETH. So: register, commit a prediction, wait one hour,
resolve it `WIN` with `exitPrice = 1`, repeat. `getAgentStats` then reports
`winRateBps = 10000` for about a dollar plus gas.

Both sibling contracts already solved this — `BobbyTrackRecord.sol:257-278` derives
the result from committed prices, `BobbyTrackRecordV2.sol:669-692` derives it from
signed Pyth evidence. HardnessRegistry does neither. The r4 comment at `:424` fixed
the adjacent problem (strangers stamping LOSS on a competitor) and left this one.

Sharpest detail: `api/_lib/hardness-registry.ts` calls `commitPrediction` but never
`resolvePrediction`, so Bobby's own predictions all age into `EXPIRED`. **A forged
100% record would out-rank the protocol's own honest one.** This is the claim in
the App Store appeal and on the landing page, so it is a product-integrity issue,
not only a contract issue.

Fix: port V2's derivation, or at minimum v1's cheap gate (infer direction from the
committed stop/target, compute PnL from entry/exit, require the reported result to
match within tolerance). Separately, drop self-resolution or segregate self-resolved
records the way V2 segregates ATTESTED from VERIFIED.

---

## P1

### P1-1 · Swap card signs a stale quote after the amount is edited [verified]

`src/components/agent-radar/SwapExecutor.tsx:226`

The token selects, the slippage buttons and the eligibility checkbox all call
`reset()` on change. The amount input is the only control that does not:

```tsx
<input type="number" value={amount} onChange={e => setAmount(e.target.value)} ... />
```

The button label is rendered from the live `amount` while `executeSwap` sends the
stale `quote.tx.swap`. Quote 25 USDC, approve 25, then type `5`: the field shows 5,
the button reads "Swap 5 USDC → NVDAc", and the click broadcasts the 25 USDC
calldata, which the fresh allowance covers. `notExpired()` only checks the router
deadline, so the stale calldata stays signable for minutes.

Fix: call `reset()` from the amount `onChange`, or gate `executeSwap` on
`amount.trim() === quote.amountIn`.

### P1-2 · Confirmation cards show labels, not the calldata being signed

`src/components/adams/SwapConfirm.tsx:274,278-279` · `SwapExecutor.tsx:266,276-277`

Both cards ask the user to personally verify the transaction — *"I checked the
contract and the minimum received. Bobby never signs for me."* — but every value
shown is a sibling JSON field from the API response, never decoded from the opaque
hex that is actually sent. A compromised API response could show honest Uniswap
values while the bytes approve an attacker's spender, and the user would perform
exactly the verification the copy asks for and still be robbed. The server is
currently honest (`api/_lib/base-swap.ts:181` encodes the exact amount), so this is
a broken verification promise rather than live theft.

Fix: `decodeFunctionData` client-side and refuse to render or sign unless the
decoded spender equals the pinned `UNISWAP_BASE.swapRouter02`, the decoded amount
equals the displayed amount, and `swapTx.to` is the pinned router. The client
already has the ground truth in `src/config/chains.ts:106-112` and never uses it.

### P1-3 · `/api/judge-mode` is unauthenticated and touches private threads

`api/judge-mode.ts:41-66,165-186,262-266`

No auth guard — only a write-freeze check and a per-IP limit. Both thread readers
use the service key with no `scope=eq.public` filter, so `POST {}` with no
credentials returns the most recent thread of **any** scope, including another
user's private agent cycle, with an LLM summary of its contents. Each call also
PATCHes `debate_quality` onto that thread, which is published elsewhere as a trust
metric.

Same root cause, read-only, in `api/ghost-wallet.ts:21`, `api/checkpoint.ts:68`,
`api/mcp-http.ts:177,231`, `api/bobby-signals.ts:66-70`. Those select lists omit
`owner_wallet`, so rows are not directly attributable — hence P1, not P0.

Fix: authenticate `judge-mode`; add `scope=eq.public` to every `forum_threads` read
on a public endpoint, ideally through one shared helper.

### P1-4 · iOS pairing has no confirmation step and no way back

`ios/Bobby/Sources/AccountSheet.swift:51-67` · `20260903000007_identity_link.sql:29-53`

Independent of P0-1: even with the code kept secret, the flow is one-tap and
irreversible. The RPC's guards reject only *same-type* collisions, so an
Apple-identity claim against a wallet-identity passes both. An attacker who gets a
victim to type an attacker-issued code permanently grafts the attacker's wallet onto
the victim's row. The UI invites exactly this — *"Code from the desk"*. In the other
direction the victim's row is deleted outright.

Fix: make the code an approval request the *issuing* side confirms in-app, showing
who is linking. Add an unlink endpoint. Show a live TTL countdown and clear the
issued code when it expires.

### P1-5 · Enforced CSP has no `script-src` or `connect-src`

`vercel.json:49-56`

Enforced: `frame-ancestors 'self'; base-uri 'self'; object-src 'none'; form-action 'self'`.
Script and network control exist only in `Content-Security-Policy-Report-Only`,
which browsers never enforce — and that policy has `'unsafe-inline'`, a
`connect-src 'self' https: wss:`, and **no `report-uri`/`report-to`**, so the
staged-rollout measurement it was created for is not collecting anything.

This origin holds wallet session tokens in `localStorage` under
`bobby_session:<wallet>`, and those tokens authorize `/api/base-swap` to hand out
calldata. Combined with P1-2 (nothing cross-checks the calldata), any script
execution on the origin is a complete swap-hijack primitive.

Cleared: `979db33` did **not** weaken this. Its only `vercel.json` change is one
rewrite destination. The split policy came from `d372dab` and was deliberate.

Fix: promote to enforcing; replace `'unsafe-inline'` with hashes (index.html has two
inline JSON-LD blocks and one module script); narrow `connect-src` to Supabase, Base
RPC, WalletConnect and self. If the measurement phase stays, add a reporting endpoint.

### P1-6 · Bounty resolver can award the pot to itself

`contracts/src/BobbyAdversarialBounties.sol:131-134,218-253,265-288`

`resolveBounty` requires only that the winner be *a* challenger, and
`submitChallenge` is permissionless and excludes only the poster. The resolver can
therefore challenge and then award itself. On Base the resolver is a single hot EOA
(`0xba14…9854`), not the Safe — so this is not the accepted Safe-centralisation
tradeoff, and anyone who compromises the backend drains the bounty escrow.

Fix: reject `msg.sender == resolver || owner` in `submitChallenge`, and/or require
`_winner != resolver` in `resolveBounty`.

### P1-7 · HardnessRegistry stake is a one-way door [verified]

`contracts/src/HardnessRegistry.sol:297-311,715-724`

`registerAgent` books the **entire** `msg.value` as stake with no cap and no refund
of the excess, and there is no `unregisterAgent`, no `withdrawStake`, no unstake —
I enumerated every function. `pendingWithdrawals` is credited only by
`payForService`, bounty resolution, `withdrawBounty` and `slashAgent`. So a staked
deposit has exactly one exit: `slashAgent`, which is callable by `owner` **or**
`hardnessScorer` — and on Base `hardnessScorer == bobby`, the backend hot key —
with no cause, no bound, no timelock, sending the funds to the owner.

Fix: add `unregisterAgent()`; refund `msg.value - REGISTRATION_STAKE`; restrict
`slashAgent` to the Safe and bound it.

### P1-8 · iOS privacy manifest contradicts the app

`ios/Bobby/Sources/PrivacyInfo.xcprivacy:9-16`

`NSPrivacyCollectedDataTypes` is an empty array, while the app requests
`[.email]` from Apple, stores it, and the server persists it against a stable user
id; XP and companion state sync on every launch. The manifest's own comment says the
data *"never leaves the device"*. This is a concrete App Review rejection trigger,
not just a documentation defect — see the App Store note below.

---

## Verified clean — the things that are genuinely well built

**The swap money path.** No attacker-controlled value reaches anything signed.
Router, spender and quoter are module constants; the recipient is the
session-proven wallet and `guardWrite` rejects a `body.wallet` that differs from the
session; token addresses come only from the static allow-list; `amountOutMinimum` is
computed from the server's own QuoterV2 result with slippage clamped to [0.05, 3];
the deadline is server-side. Every guard is fail-closed — any entry in `txWithheld`
yields `tx = null`. Calldata is withheld unless the swap was recorded first, so no
calldata exists that `/api/swap-receipt` cannot later verify. One user building
calldata that another user signs is not possible.

**Receipt verification.** `verifySwapOnChain` re-reads the tx from Base and checks
sender, target, success and calldata hash against a row this server built for that
wallet; amounts come from `Transfer`/`Withdrawal` logs, never the client.
`confirm_swap_receipt` runs under an advisory lock, is idempotent on tx hash, and
the DB enforces single use three ways.

**SIWE / wallet sessions.** Nonces are consumed atomically by `DELETE … RETURNING`
and burned even on a bad signature; the message is rebuilt from stored fields, not
client input; the domain is an exact-host allow-list; session tokens are HMAC with
`timingSafeEqual` and the expiry is inside the MAC. The browser independently
re-validates the server-built SIWE text against `window.location.host` and refuses
to sign on mismatch, so a hostile API cannot repurpose the prompt.

**HMAC intents, transcript receipts, Telegram webhook, MCP payments.** All
constant-time compared, all fail-closed when their secret is unset, all single-use
at the DB. The webhook 403s forged updates. Payment challenge ids are taken from the
decoded transaction, not from a header.

**Injection and SSRF.** No `exec`/`eval` anywhere in `api/`. Every PostgREST URL
with interpolation was inspected; user values are UUID/wallet/hex-validated,
`encodeURIComponent`-wrapped or numeric-clamped. Two endpoints
(`api/harness-memory.ts:26-28`, `api/harness-events.ts:40`) interpolate raw, but the
appended filters can only AND-narrow and the tables have no foreign keys, so no
impact was constructible — hygiene, not a finding. Every outbound host is a constant
or env-derived.

**XSS.** Only two HTML sinks in all of `src/`. `BlogPostPage` runs DOMPurify then
re-parses and drops any iframe whose resolved host is not YouTube/Vimeo.
`NFTClaimModal`'s `srcdoc` is a static template sandboxed deliberately without
`allow-same-origin`, so the vendor script cannot reach `bobby_session:*`. No `eval`,
no `new Function`, no `document.write`.

**No secrets in the client bundle.** The only embedded JWTs are anon-role, in both
web and iOS. `vite.config.ts:10` defines `'process.env': {}`, so a server module
that leaked into the bundle would inline an empty object.

**Contracts.** `BobbyIntentEscrow` (EIP-712 binds chainid and address, arbiter
approval cannot be transplanted, replay blocked twice, signature malleability
handled), `BobbyTrackRecordV2` (outcome derived from signed Pyth, commit anchor
strictly future, stop forced onto the loss side of the oracle entry),
`BobbyAgentEconomyV2` (value conserved in both payable paths),
`BobbyConvictionOracle`, `BobbyAgentRegistry`, and the deploy gates — which are
unusually strong: `SafeOwnerGate` pins the Safe proxy codehash and slot-0 singleton
and rejects any enabled module or guard, `DeployBase` validates the full role matrix
before broadcast. **221 Foundry tests pass, 0 failures.**

**iOS.** Tokens in the Keychain with `…AfterFirstUnlockThisDeviceOnly`, never
UserDefaults. No ATS exception, no `http://`, no TLS override. Sign in with Apple
uses a correct nonce protocol and the **server** verifies the bearer against the
auth project — no client-supplied user id is trusted. No WebView anywhere. No URL
scheme registered, so no external actor can invoke an in-app action. Client XP
claims are server-capped at 300 and only honored on an empty ledger.

---

## Product state

| Suite | Result |
|---|---|
| `forge test` — 13 suites | **221 passed, 0 failed** |
| `test:api-security` | 47/47 |
| `test:swap-ledger-pg` | 3/3 (harness fixed in `7d4829d`) |
| base-swap, write-safety, commit-policy, record-auth, risk-gate, ticker-routing, playbooks, trackrecord-v2 | 8/8 |
| `smoke:base-swap`, `e2e:base-swap` | not run — need network / anvil fork |

Environment trap: a git worktree does not inherit untracked files, so `.env.local`
is missing there and `test:api-security` dies with `BobbyDbConfigError` before
running a single check. Dummy values are enough — it is a fail-closed import guard,
not a real dependency.

---

## App Store note

The current rejection is **4.3(a) Design: Spam**, for presumed duplication against
the same developer's surf app. It has nothing to do with a wallet, and
`docs/app-store/appeal-4.3a/reply-to-app-review.md` is still marked NOT SENT.

**The iOS app has no wallet.** Zero hits across all 23 Swift files for
WalletConnect, web3, secp256k1, `signTransaction`, `privateKey` or `mnemonic`. No
URL scheme is registered, so a wallet handoff is not even possible. The only
entitlement is Sign in with Apple; the only Keychain item is a Supabase session.
Entry/stop/target are display-only chart annotations. Nothing is sold — no StoreKit,
no external payment.

So the wallet is not the submission risk. The risks are: 4.3(a) still open; the
privacy manifest contradicting observable behaviour (P1-8); and the fact that the
app renders a concrete directional call with a numeric conviction and a specific
entry/stop/target price plan — always captioned `REFERENCE ONLY` and *"Bobby never
executes trades"*, behind a mandatory three-checkbox risk notice at the root of the
view hierarchy, but it is the surface a reviewer can read as actionable.

One string worth rewriting: `AccountSheet.swift:48` says *"El mismo XP aquí y en
bobbyprotocol.xyz con tu wallet"* — the only user-visible mention of a wallet, two
lines below *"Sin wallet, sin llaves, sin correo."*

---

## Limits of this audit

No RPC calls were made: nobody confirmed the bytecode at the seven Base addresses
matches this source, that the Safe accepted ownership on all seven, or the live
balances at risk. All RLS conclusions come from the migration files — if policies
were changed by hand in the dashboard, P0-1 and P0-2 must be re-checked against
`pg_policies` (the repo ships `bobby_rls_matrix()` for this). `x-vercel-ip-country`
spoofing was not tested against the live deployment. Whether `/api/identity-link` is
actually deployed at bobbyprotocol.xyz was not confirmed.
