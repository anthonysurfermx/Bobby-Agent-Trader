# TrackRecord v2 — Handoff de integración para el backend (Codex)

**Fecha:** 2026-08-14 · **Estado del contrato:** 202/202 tests, viaIR, 23,368 B
(margen 1,208). **Verificación adversarial final EN CURSO** — este ABI es
**candidato, no congelado**: no cablear escrituras firmadas hasta que confirme
"ABI FROZEN" (Codex ya dejó el endpoint bloqueado en Base, que es exactamente lo
correcto). ABI completo: `docs/audit/BobbyTrackRecordV2.abi.json`.

## 1. Cambios de interfaz vs v1 (lo que rompe el cableado viejo)

### Constructor (nuevo — afecta DeployBase.s.sol)
```
constructor(
  address _bobby,
  VerificationParams _params,          // tuple: (uint16 entryWindowSec, uint16 exitWindowSec,
                                       //         uint24 maxExitLagSec, uint24 challengeWindowSec,
                                       //         uint16 entryTolBps, uint16 exitTolBps, uint16 confMaxBps)
  address[] _pyths,                    // [0] = activo; [1..] = alternos preaprobados (V-03)
  string[] _symbols,                   // ["BTC","ETH","SOL"] canónicos
  bytes32[] _feedIds                   // Pyth feed ids 1:1 con _symbols
)
```
**Implica trabajo de contratos (mío, no de Codex):** `DeployBase.s.sol` debe
desplegar `BobbyTrackRecordV2` con estos 5 args en vez del `constructor(address
_bobby)` de v1. Valores de deploy mainnet: `maxExitLagSec = 600`,
`challengeWindowSec = 7 days`, tolerances 100 bps (a recortar tras basis real),
confMax 50 bps. Feed ids verificados en `oracle-comparison.md`.

### commitTrade / resolveTrade — firma cambiada (calldata NUEVA)
```
commitTrade(bytes32 debateHash, string symbol, uint8 agent, uint8 conviction,
            uint96 entryPrice, uint96 targetPrice, uint96 stopPrice,
            uint8 declaredMode, bytes[] entryUpdateData) payable
resolveTrade(bytes32 debateHash, int256 pnlBps, uint8 result, uint96 exitPrice,
             uint64 exitAt, bytes[] exitUpdateData) payable
```
- `declaredMode`: 0=ATTESTED, 1=VERIFIED. **Debe coincidir** con lo que el
  mapping on-chain deriva del símbolo o revierte `ModeMismatch` — el backend
  canonicaliza el símbolo (tabla `_lib`) y declara el modo esperado.
- **payable**: los símbolos VERIFIED requieren `msg.value >= getUpdateFee(update)`
  (fee de Pyth; excedente se devuelve). ATTESTED exige `msg.value == 0` y
  `updateData` vacío o revierte.
- `entryUpdateData`/`exitUpdateData`: **exactamente 1 update** de Hermes
  (`parsePriceFeedUpdatesUnique`). El backend pide el update al **borde inferior**
  de la ventana (hallazgo del PoC: el tick válido es determinista dado el min).
- `exitAt`: instante declarado del exit; acotado `[minResolveAt, now]` y
  `now - exitAt <= maxExitLagSec (600s)`. El settle debe resolver PRONTO.

### Lecturas — v1 `getWinRate()` ELIMINADO (D-1 en la ABI)
| v1 (ya no existe) | v2 |
|---|---|
| `getWinRate()` | `getVerifiedWinRate()` **y** `getAttestedWinRate()` — separados, nunca sumar |
| `getRecentTrades()` tuple a mano | `getTrade(uint256)` / `getCommitment(uint256)` devuelven el struct completo (10/7 campos) |
| `getAgentStats(agent)` | `getAgentStats(uint8 agent, uint8 mode)` |
| — | **`getVerifiedScorecard()`** → `(winRateBps, decided, resolved, expired, pending, resolutionBps)` en 1 call. **UI/score DEBE usar este** — el win rate no se muestra sin cobertura (V-02). Penalizar `resolutionBps` bajo en el score reputacional. |
| — | `getCoverage(uint8 mode)` → `(resolved, expired, pending)` |
| — | `isFinal(bytes32)` → resultado ya no challengeble (ventana de finality vencida) |

⚠️ **Selector hardcodeado a matar:** `xlayer-record.ts:105` tiene
`0x6f61e432` (getWinRate de v1) — decodificaría basura contra v2. Regenerar TODOS
los selectores desde este ABI, nunca a mano.

## 2. Eventos para el indexer (todos nuevos o extendidos)
`TradeCommitted` y `TradeResolved` ahora llevan `mode`, `feedId`,
`oraclePrice1e8`, `publishTime`. Nuevos: `TradeReclassified` (WIN→LOSS por
challenge — el indexer DEBE aplicar el delta), `StopBreachChallenged`,
`OracleDiscrepancy` (Chainlink sanity — cablear alerta Telegram; sin oyente el
check es decorativo), `PythApproved/Activated/Revoked`, `RefundRetained`,
`StuckFeesWithdrawn`. Firmas completas en el ABI.

## 3. Backend nuevo (resumen — no bloquea a Codex, es mi lista)
- `PYTH_HERMES_API_KEY` (Sensitive, **antes del 2026-08-18**): fetch del update
  firmado en commit y settle. La key es secreto de backend, jamás del contrato.
- `settle-trades` corre el **stop-breach check** antes de publicar un WIN, y
  challengea sus propios stop-outs pendientes.
- Canonicalización de símbolo + `declaredMode` en el preimage del `debateHash`.

## 4. Coordinación con el gate de mainnet de Codex
- El manifiesto de las 7 direcciones debe incluir **BobbyTrackRecordV2** en el
  slot de TrackRecord (reemplaza el v1). El reconciliador de recibos de Codex
  valida las 7 — la de TrackRecord será la de V2.
- El gate que exige "ABI final integrado antes de armar escrituras" en Base es
  correcto: **mantenlo bloqueado hasta que marque ABI FROZEN**. Prefiero, igual
  que tú, un error visible a calldata vieja firmada.

## 5. Lo que sigue NO-GO (depende de esto o de humanos)
1. Verificación adversarial final del código corregido (en curso) → congela ABI.
2. `DeployBase.s.sol`/`Verify` actualizados a V2 (mío, tras congelar).
3. Safe 2-de-3 real + pin codehash/singleton (runbook `safe-setup-runbook.md`).
4. Recorte de tolerances con basis perp-vs-Pyth real.
5. Canario final V2 en Sepolia con evidencia Pyth real → soak.
