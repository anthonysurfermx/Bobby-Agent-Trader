# Snapshot de GO — matriz del canary Sepolia COMPLETA (2026-08-21 14:54 UTC)

Contrato: BobbyTrackRecordV2 `0x4bfEF46d920fd67C68046901f591Fad0a2F7cadC`
(Base Sepolia 84532, release congelado 11532f4, idéntico al de mainnet).
Todo reproducible: `cast call <tr> "getVerifiedScorecard()" --rpc-url base_sepolia`.

## Los 4 checks de GO (criterio de Anthony) — VERDES

### 1. VERIFIED LOSS real
`canary-v2-005-challenge`: result=**LOSS**, pnlBps=−8, stopChallenged=true.
El LOSS NO lo declaró el recorder — lo forzó un challenge sobre un breach real.

### 2. Challenge WIN→LOSS reclassification
- commit: `0x0cce98696d9cca62735f074edcc5519683afe720fad102b91dfe86c492dd685b`
- breach capturado: tick 77309.17 <= stop 77418.26 @ pt 1787320453
- **challenge: `0xcef342d5e935934a1275f9d671e9d0987e929d60f5a009053c3d0b4d3ac94847`**
  → reclasificó WIN→LOSS on-chain, permissionless, con evidencia Pyth firmada.

### 3. Separación VERIFIED / ATTESTED (D-1)
- VERIFIED: decided 4, resolved 4, winRate 75% (3W/1L: BTC/ETH/SOL WIN + 005 LOSS)
- ATTESTED: resolved 1 (OKB), separado — los ledgers NUNCA se sumaron.
- Negativo: challengeStopBreach con ancla sin cruce revierte NoBreach() ✓

### 4. Dry-run mainnet + Safe gate verde
3 dry-runs contra Base mainnet real = ALL PASSED (Safe gate + Pyth gate +
post-deploy assertions). Ver `mainnet-dryrun-result.md`.

## Tx de resolución (todas on-chain, verificables)
| Ciclo | Símbolo | Modo | Resultado | tx |
|---|---|---|---|---|
| 002 | ETH | VERIFIED | WIN +1445bps | 0x6c37ea6240599676d5a9b002c0a996385563176055447bddb6c7129b1ba2fbea |
| 003 | SOL | VERIFIED | WIN +1132bps | 0x853e360ae333ca4b7639068dfa4d3d8002c30fea368e8781ff3dbe399b46acaf |
| 004 | OKB | ATTESTED | WIN +2bps | 0xf7a08e85fdc67760469d91c237194c64d8ba76a585a8de51f8c3e6e6c0b94e29 |
| 005 | BTC | VERIFIED | WIN→**LOSS** (challenge) | resolve+challenge 0xcef342d5… |
| 001 | BTC | VERIFIED | WIN (sesión previa) | — |

## Veredicto
Matriz del canary COMPLETA y reproducible. Los 4 checks de GO verdes.
Prerrequisito de mainnet (NO-GO #3 de Kimi) satisfecho. Falta solo el
red-team de Codex (brief 2026-08-21) antes del broadcast.
