# Repository Security Audit — R11

Date: 2026-08-12
Branch audited: `fix/base-r9-round1`
Scope: React/Vite frontend, Vercel API routes, CI/CD, dependencies, repository history, and Foundry contracts.

## Executive verdict

The repository is materially safer and is suitable for deploying the current web application after CI passes. Public HTTP callers can no longer reach wallet operations, recorder gas spending, settlement, cron/admin mutations, or live on-chain execution without an internal secret. The previously public credential-selection bypass in `okx-perps`, the live-trade path in `onchainos-signal`, the host-header SSRF in `sentinel-demo`, and the fail-open Telegram delivery authentication are closed.

This is **not** a final Base mainnet sign-off. Mainnet remains blocked by the unresolved HardnessRegistry lifecycle findings from R9, the `exitPrice` trust-model decision, creation and independent verification of the 2-of-3 Safe, ownership acceptance, and a fresh Sepolia canary after the final contract set is frozen.

## High-impact corrections

- Added fail-closed, constant-time internal authentication shared by privileged API routes.
- Removed arbitrary credential-mode selection from OKX perps and restricted account, trade, recorder, settlement, deployment, cron, and administrative actions.
- Restricted public X Layer and hardness endpoints to analysis/quote operations; raw swap calldata and recorder spending require internal authentication.
- Added strict action allowlists, request-size limits, input validation, and layered rate limits to public AI, MCP, DEX, Telegram, signal, forum, feedback, and registration surfaces.
- Bound agent registration and profile changes to wallet signatures. Existing agent ownership can no longer be overwritten by an unsigned request.
- Removed browser-side ownerless Supabase profile writes from Advisor Setup.
- Replaced the dynamic host-derived Sentinel target with a fixed Bobby origin, closing a server-side request forgery path.
- Sanitized embedded blog media to HTTPS YouTube/Vimeo origins with iframe sandboxing.
- Added HSTS, MIME-sniffing protection, frame restrictions, referrer policy, and permissions policy.
- Added pinned CI actions, CodeQL, Gitleaks, Dependabot, production dependency auditing, application regression tests, linting, and 1,000-run Foundry fuzzing.
- Ignored local agent settings, credentials, skills, operational journals, and downloaded artifacts so they cannot be committed accidentally.

## Verification evidence

- Production application build: pass.
- ESLint (`--quiet`): pass.
- Application security/regression suites: 326 assertions pass.
- Foundry build and EIP-170 size check: pass; `HardnessRegistry` retains 1,805 bytes of margin.
- Foundry suite: 152 tests pass with 1,000 fuzz runs.
- Gitleaks full repository history: no findings after narrowly allowlisting public chain addresses and the public Supabase anonymous key.
- Production dependency audit at high severity: 0 high or critical findings; 11 moderate transitive advisories remain.
- Responsive verification: landing page and Bobby routes checked at 390px, 768px, and 1440px; the Analytics overflow was corrected.
- Social preview asset: 1200×630. Browser favicon: valid 64×64 ICO.

## Residual risks and required follow-up

### Before Base mainnet

1. Close and re-audit R9 findings M-02 through M-05 around the HardnessRegistry/bounty lifecycle.
2. Decide and implement the `exitPrice` source of truth (oracle vs. attested price), including freshness, deviation, and outage behavior.
3. Create the intended 2-of-3 Safe, verify owners/threshold and the approved Safe implementation, then accept ownership on all seven contracts.
4. Redeploy the final contracts to Base Sepolia and repeat commit, negative-resolution, expiry, and price-bound canary tests.
5. Freeze deployment manifests and verify every implementation/source/address before broadcasting to mainnet.

### Application hardening backlog

- The persistent rate limiter is not atomic and may fail open if its backing store is unavailable. Use an atomic Redis/Upstash or database RPC limiter before large public traffic.
- Wallet signatures have a bounded timestamp but no persisted nonce ledger, so a valid request may be replayed during its acceptance window. Persist and consume nonces for sensitive signed mutations.
- Eleven moderate dependency advisories remain in wallet/OKX widget transitives. Their complete removal requires a coordinated Wagmi/AppKit major upgrade; do not use `npm audit fix --force` without regression testing.
- A restrictive Content Security Policy was not enabled because the current wallet, analytics, media, and API integrations need an explicit compatibility pass. Roll out CSP in report-only mode first.
- `agent-confirm` is now internal-only, but its reported outcome is still an attestation; connect it to a trusted receipt/oracle verifier before treating it as permissionless evidence.
- Keep `swap_data` disabled unless `DROPLET_URL` is HTTPS and the upstream response is independently validated.
- Rotate local operational tokens found in ignored workstation configuration. They were excluded from Git, but rotation removes workstation/history exposure risk.

## Deployment recommendation

Merge only after CI, CodeQL, Gitleaks, the Foundry suite, and the production build are green on the exact pull-request commit. After merge, verify the production security headers and confirm unauthenticated privileged API probes return `401` or a fail-closed configuration error. This recommendation covers the website/API deployment only; it does not authorize Base mainnet contract deployment.
