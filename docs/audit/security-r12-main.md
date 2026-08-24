# Repository Security Audit — R12 Full-Main Follow-up

Date: 2026-08-12
Baseline: `main` at `0017ee058503f842272f97d736740ef6cdda4cb4`
Remediation branch: `codex/security-r12`
Scope: full tracked JavaScript/TypeScript source tree and GitHub security workflow.

## Why this follow-up exists

The pull-request differential scan for R11 was green after its three reported findings were fixed. A new CodeQL scan of the exact merged `main` tree then exposed 24 inherited alerts outside that PR's original diff: four critical server-side request-forgery alerts, fifteen high-severity source alerts, and five high-severity insecure-randomness alerts in generated `dist/` vendor code.

R12 treats the full-tree result as the release baseline. It does not weaken or dismiss source findings. The five `dist/` findings are excluded because `dist/` is untracked build output generated from third-party packages; CodeQL now uses no-build JavaScript analysis and explicitly ignores that directory.

## Corrections

- Removed request-host and forwarded-host derived self-fetches from `activity`, `agent-setup`, `bobby-protocol-stats`, and `user-cycle`. Internal reads now use fixed, deployment-controlled origins.
- Replaced the externally controlled OKX log template with a constant format string.
- Replaced URL substring checks with parsed HTTPS URLs and exact hostname allowlists for GitHub, X/Twitter, and Polymarket.
- Encoded the Polymarket slug before placing it into a DOM URL sink.
- Replaced incomplete regex sanitization with complete regular-expression escaping and DOM-based HTML text extraction.
- Replaced user-selected prompt-builder property access with an explicit switch over known contexts.
- Replaced polynomial free-form verdict, section, conviction, and vibe regexes with bounded string extraction and direct structured test-verdict handling.
- Hardened two analogous yield parsers proactively even though the first full-main scan had not reported them.
- Configured CodeQL to analyze source without producing or scanning untracked Vite bundles.

## Regression coverage

`scripts/test-api-security.mts` contains 47 fail-closed runtime and source-policy assertions. The R12 additions pin fixed origins, exact host allowlists, constant log formatting, explicit dispatch, bounded parsing, DOM URL encoding, HTML parsing, and the CodeQL source-only configuration.

The complete application regression total is 351 assertions:

- playbooks: 261
- API security: 47
- record authentication: 11
- risk gate: 32

## Local verification evidence

- Production Vite build and API TypeScript check: pass.
- ESLint with warnings excluded from the release gate: pass with zero errors.
- All 351 application assertions: pass.
- Gitleaks full history scan: 352 commits scanned, no leaks found.
- Production dependency audit at high severity: zero high or critical findings; 11 moderate transitive advisories remain behind a breaking Wagmi upgrade.
- Foundry build and EIP-170 size check: pass.
- Foundry suite: 152 tests pass, including the configured 1,000 fuzz runs and invariant handler coverage.

## Release gate

Do not merge R12 until all of the following pass on the exact PR commit:

1. application typecheck, lint, build, and all 351 assertions;
2. Gitleaks across repository history;
3. CodeQL with no open critical/high finding on the PR;
4. Foundry build, size check, and 1,000-run fuzz suite;
5. Vercel preview deployment.

After merge, repeat CodeQL against the exact `main` SHA, confirm unauthenticated privileged endpoints fail closed, and smoke-test production metadata and mobile routes. This web/API approval remains separate from the Base mainnet contract authorization described in the R11 audit.
