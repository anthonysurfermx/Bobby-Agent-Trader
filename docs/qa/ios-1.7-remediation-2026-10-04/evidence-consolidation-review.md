# Evidence consolidation review — 2026-10-04

Reviewed `2026-10-04T12:12:50.086341+00:00`. The new principal PASS claims are supported by retained receipts and independent read-only checks. No tests were repeated, product files edited, temporaries deleted, files copied to the repository, or commits created in this review.

## Verified counts and source binding

| Evidence | Confirmed result | Count boundary |
| --- | --- | --- |
| Current official native xcresult exports | Passed 536/536, zero failed/skipped/expected failures | The actual test tree contains 534 Unit test bundle cases and 2 UI contract cases. Parent nodes also say Passed but are not additional tests. Debug iOS Simulator; not Release/signing/device acceptance. |
| Exact-lock web build | npm ci and complete npm run build exit 0 | 1,292 installed package paths match the lock; Vite 6.4.3, SWC 1.15.24 and TS 5.9.3 actually ran. Build made 896 hashed files. These are artifact/package counts, not QA cases. |
| PostgreSQL integration | 21/21 distinct suites; zero failures/skips | Prior 14 plus new 7: all 17 dedicated `test-*-pg.mts` scripts, growth/cells SQL and PG-backed briefings API/worker. Setup commands do not count. |
| Explicit PostgreSQL Node check counters | 2,575 reported checks = 2,443 + 132 | Includes known repeated API/worker unit portions (187 and 103). Registry/RLS/swap/cells provide no aggregate runtime counter; do not label them zero checks or infer a unique-check grand total. SQL growth also has no counter. |
| Local Anvil | 2/2 suites, 61 assertion calls, zero failed calls | Hardness 10, Bounties 51. Fourteen ok sections are summaries. Ten TCP connection calls are transport events, not assertions or RPC request counts. |

Current executed source HEAD is `a135d6e107dee1a9c9f7057532cc2f6d9fc7b6b2`; code changes end at ecc4ff49 and product fixes at 507616c9. Web snapshot base 507616c9 is byte-identical for its 1,484 tracked source/config/public files to a135d6e1. The old PG receipt is from 393776c3 but its 72 recorded script/migration/workflow hashes still match the current candidate. The new PG receipt's 72 hashes also match. Native repaired source hashes and Anvil original script/backend ABI hashes match the current candidate.

This review independently checked native summary/test exports against their recorded SHA-256, native text log hash, all 36 old/new PG command log hashes, both lock-build log hashes, and Anvil log/audit hashes. Native case counts were recalculated by bundle; network audits show only each owned localhost port and server exits 0. These file checks are evidence verification, not new test runs.

## Editorial corrections and retained limits

1. README's principal native/PG/Anvil/exact-lock totals are accurate. Its opening can state tested HEAD a135d6e1 explicitly while retaining the ecc4ff49/507616c9 code lineage.
2. At review time README's remaining UI row still said 3/14 classes and 6/57 methods. Five complete official summaries now show ProReview 2, Store35 2, Equipment 2, Locker 6 and SquadGallery 4: 5/14 classes, 16/57 methods, leaving 9 classes / 41 methods. `native/ui-serial-run-report.md` records the later guard stop before ReleaseReadiness. Refresh README from the latest immutable receipts at consolidation time; do not infer success from a partially running class.
3. The 536-case native test tree includes one `[Internal]` runtime warning about a user-interactive thread waiting on a lower QoS thread. Zero tests failed, but “zero warnings” would be inaccurate. No product source location or physical performance defect is established by this warning.
4. Keep the exact-lock macOS arm64 / Node 25.9.0 boundary; CI uses Node 22. API/admin/PWA build success does not close the separately reported excluded web Stripe TypeScript issue. Locked dependency deprecation/chunk notices remain preserved; no dependency upgrade or vulnerability audit occurred.
5. Keep all local PostgreSQL/Anvil evidence separate from production migrations, paid-provider delivery, commercial payments, real users, real wallet transactions and physical acceptance. Anvil deployed and mined only on synthetic chain 31337. Existing compiled artifacts were reused with source Keccak/ABI/compiler settings checked; this is not a fresh Forge compilation.
6. Preserve Anvil's first-run wrapper receipt: its TIME_WAIT port-check bookkeeping error was corrected without repeating the approved Hardness run. The test and server exit evidence was successful from the original run.
7. `pg/report.md` and `pg/results.json` in canonical docs are historical receipts. Their “remaining suites” wording describes the old run; link the new remaining report and do not alter the historical hashes. PG source/runs and all own servers are closed with synthetic data removal receipts.
8. Source/browser support-layout runs overlap and must not be summed. Geist, live installed WebKit, signed archive/upload, TestFlight installation, physical flows and full remaining UI acceptance retain their existing separate gates. No universal functionality or release GO follows from the verified local subsets.

## Curated small files to copy

Destination: `/Users/mrrobot/.codex/worktrees/bobby-android-parity-ios17/Bobby-Agent-Trader/docs/qa/ios-1.7-remediation-2026-10-04`. The machine-readable `evidence-consolidation-copy-plan.json` contains each exact source/destination, byte size and SHA-256. It proposes copying only small text/JSON receipts; no mutation is performed by this review.

| Group | Files | Combined size |
| --- | ---: | ---: |
| native-current | 3 | 316.2 KiB |
| lock-build | 8 | 610.6 KiB |
| pg-remaining | 24 | 47.1 KiB |
| anvil | 9 | 30.6 KiB |

Core total: 44 files / 1,028,667 bytes (0.98 MiB). The native summary + complete 536-case JSON + execution receipt are sufficient small official exports; keep the original .xcresult externally intact. Exact-lock includes the updated preflight, result, dependency/artifact manifests, logs and report; only preflight currently exists in canonical docs. New PG includes all its small setup/regression/shutdown logs and receipts. Anvil includes counts/provenance, network audits, original wrapper error and guard/runner so the restrictions and instrumentation are reviewable. Existing historical `pg/report.md` and `pg/results.json` need no duplicate copy.

Optional supplement: the native full text log and the five completed serial UI receipt triplets plus UI source binding/report/aggregate/status (20 files / 454,662 bytes). These exports are small; prefer them over copying screenshots or result-bundle internals. If UI completes later, add fresh per-class official receipts and an updated aggregate with exact method identities, retaining any guard-stop history.

Exclude .xcresult directories, DerivedData, SourcePackages, archives/IPA, node_modules, npm cache, dist, PostgreSQL data, Anvil TSX caches, linked api/dependency directories, and compiled-artifact copies from Git docs. The artifact hashes/provenance are already in the retained JSON.

After copying, change narrative Markdown links that point to /private/tmp into repository-relative links for reviewers; keep historical execution paths inside receipts intact. Regenerate the canonical evidence manifest after any Markdown edit, and do not reuse hashes from unmodified temporary files for edited copies. Include this review/copy plan if useful (they are separate from the listed core size). README UI status is time-sensitive while parent QA proceeds.
