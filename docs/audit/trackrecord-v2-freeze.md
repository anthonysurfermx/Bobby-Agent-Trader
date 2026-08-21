# TrackRecordV2 — FREEZE del release

**Fecha:** 2026-08-18 · **Commit congelado:** `11532f4` (`feat/trackrecord-v2`)
**Base del veredicto:** Codex ronda 5 — "GO para congelar el contrato y GO condicionado para congelar el release completo tras verificar esos dos casos del recorder". Ambos casos verificados en el E2E (skew de reloj vía chain-clock wait; Hermes tardío vía retry acotado con contador).

## Artefacto canónico (build limpio: `forge clean && forge build`)

| Campo | Valor |
|---|---|
| Contrato | `contracts/src/BobbyTrackRecordV2.sol` |
| solc | 0.8.24+commit.e11b9ed9 |
| optimizer | on, runs=1, **via-IR: true** |
| runtime size | **24,094 bytes** (EIP-170: 24,576 — margen 482) |
| runtime sha256 | `e4e73a16faddc00976492fd9ba2b66d04d2b43ba2c418a6134b333a89180251b` |
| initcode sha256 | `5aa5117f1ef64a39dae4d56daf22aa5731d5502a998efbbd332b41e8a2a3aa42` |
| ABI sha256 (sorted-JSON) | `bb204d353a5545ab720c1df1f3184efca5082cd86a214bf76d6896a16a8332d6` |
| ABI congelado | `docs/audit/BobbyTrackRecordV2.abi.json` |
| Storage layout | `contracts/test/snapshots/BobbyTrackRecordV2.layout.json` (34 slots) |

Cualquier verificador reproduce estos hashes con: checkout `11532f4` → `cd contracts && forge clean && forge build --skip test --skip script` → hashear `out/BobbyTrackRecordV2.sol/BobbyTrackRecordV2.json`.

## Parámetros de constructor (deploy canónico, `DeployBase._v2Params` defaults)

| Param | Valor |
|---|---|
| entryWindowSec | 60 |
| exitWindowSec | 120 |
| maxExitLagSec | 600 |
| challengeWindowSec | 604800 (7 días) |
| entryTolBps / exitTolBps | 100 / 100 |
| confMaxBps | 50 |
| MIN_ENTRY_DELAY_SEC (constante) | 10 |
| Pyths (Base mainnet) | upgraded `0xbC16aee60f64864882BC6C4E428e148Fc0E272F5` (activa) + current `0x8250f4aF4B972684F7b336503E2D6dFeDeB1487a` (fallback) — gate `PythOracleGate` |
| Feeds VERIFIED | BTC / ETH / SOL (ids en `PythOracleGate.verifiedFeeds`) |

## Historial de auditoría que respalda este freeze

| Ronda | Hallazgo | Resultado |
|---|---|---|
| 1 | A1-1 P1 (Unique/cadencia — liveness) · A1-2 P2 · A1-3 P3 | corregidos |
| 2 | A2-1 P1 (tick-shopping en entry) | corregido |
| 3 | A3-1 P1 (backdating del ancla) | corregido — announce-commit |
| 4 | A4-1 P1 (same-block announce) · A1-2 **ratificado residual** | corregido — ancla futura derivada |
| 5 | **sin P1 de integridad** · A5-1 P2 operativo (recorder) | corregido — chain-clock wait + Hermes retry + receipt-await |

Suite en el commit congelado: **forge 216/216 · lib TS 43/43 · E2E 32/32 · build verde**.

## Regla de invalidación

Cualquier cambio a `contracts/src/`, `contracts/script/`, params de deploy o al ABI **invalida este freeze**: nuevo commit → nueva ronda de verificación → nuevo documento. Los cambios de frontend/docs no lo invalidan.

## Qué sigue (en orden)

1. Broadcast Sepolia (Anthony firma) sobre ESTE commit.
2. `VerifyBaseDeployment` + primer ciclo canario VERIFIED con Pyth/Hermes reales (announce→commit→resolve) — confirma la latencia real que el E2E no puede.
3. Soak 24–48 h.
4. Safe 2-de-3 (G4) + env de producción → `check:mainnet:predeploy` verde.
5. Dry-run mainnet → broadcast mainnet → handoffs → flip.
