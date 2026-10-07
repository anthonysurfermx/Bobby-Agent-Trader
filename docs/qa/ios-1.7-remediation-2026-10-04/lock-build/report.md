# Isolated exact-lock web build — 2026-10-04

PASS: `npm ci --no-audit --no-fund` and the complete `npm run build` both exited 0. This closes the earlier dependency-version caveat: Vite 6.4.3 from the committed lockfile was actually executed successfully.

## Source binding and isolation

The isolated workspace is `/private/tmp/bobby-ios17-lock-build-20261004`. Its 1,484 tracked source/config/public files were copied from commit `507616c99eb143e466084c85bbb177d11315bf68` and rechecked byte-for-byte against candidate HEAD `a135d6e107dee1a9c9f7057532cc2f6d9fc7b6b2` before installation. They were unchanged throughout the build. Changes after the source commit were native debug/test code and documentation, outside the web build.

Only this workspace received npm dependencies, cache and build output. The run used a sanitized environment (PATH/HOME/TMPDIR and explicit local npm options), empty user/global npm configs, and no .env or provider credentials. Shared candidate dependency package hashes remained unchanged. No deploy, push, database request, paid provider call or real transaction was performed.

## Commands and outcomes

| Command | Exit | Duration |
| --- | --- | --- |
| `npm ci --no-audit --no-fund` | 0 | 92.55 s |
| `npm run build` | 0 | 19.63 s |

Started `2026-10-04T11:38:56.293407+00:00`; ended `2026-10-04T11:40:48.892065+00:00`. The full build passed the production source guard, API TypeScript and ESM checks (220 API entries / 239 modules), admin TypeScript check, client telemetry generation, frontend Vite build (8,789 modules), and PWA service worker build (92 modules, five precache entries).

## Runtime and immutable lockfile

| Component | Executed version |
| --- | --- |
| Node | v25.9.0 |
| npm | 11.12.1 |
| Vite | 6.4.3 |
| React SWC plugin | 3.11.0 |
| SWC core / darwin-arm64 | 1.15.24 |
| TypeScript | 5.9.3 |
| Vite PWA plugin | 1.3.0 |

The SWC binary reported `aarch64-apple-darwin` and an actual `transformSync` succeeded. Installed package versions matched all 1,292 installed lockfile entries; zero mismatches. Optional binary packages for other operating systems/architectures were not installed, as expected.

The package-lock SHA-256 was identical before/after: `fb1eaeab7b7b09f8c21d6fc2bb5ce6d207c4a3eefac15ad12aedb91be0403896`. The package manifest SHA-256 was also identical: `0afc4e64912bc351b8715dc1f0473c91c85091a72d7a1262349e0bb076b62883`.

## Artifacts, warnings and boundary

The build produced 896 files / 218,502,918 logical bytes. Every artifact path, size and SHA-256 is preserved in `dist-manifest.json`; dependency version comparisons are preserved in `installed-package-versions.json`. npm reported deprecation notices for existing locked dependencies, and Vite reported large chunk notices. They did not fail installation or compilation; no dependency upgrades were made. This run is not an audit of vulnerabilities.

This is local macOS arm64 compilation with Node 25.9.0, not a reproduction of the CI Node 22 runtime, a deployment, a TestFlight archive, or physical-device acceptance.

## Space guard and cleanup

The runner required 4 GiB free before installation and would stop below 1 GiB. Minimum observed free space while running was 6.10 GiB; no guard was triggered.

After hashing and validating all receipts, only this run's `node_modules`, `.npm-cache` and `dist` were removed. The source snapshot and all logs/manifests were preserved. Free space immediately before cleanup: 4.02 GiB; immediately after: 5.73 GiB (concurrent native work may change this).

Evidence: `preflight.json`, `result.json`, `npm-ci.log`, `npm-build.log`, `dist-manifest.json`, and `installed-package-versions.json` in this directory.
