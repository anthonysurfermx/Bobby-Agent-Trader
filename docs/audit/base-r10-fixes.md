# Ronda r10 — Fixes mecánicos de los hallazgos r9

**Fecha:** 2026-08-11
**Branch:** `fix/base-r9-round1` (sobre `feat/base-migration`)
**Alcance:** cierre de H-01, H-02, M-01, M-06, L-01, L-02, L-03 del audit r9.
**Estado:** pendiente de auditoría independiente (Codex). NO desplegado — los
contratos son no-upgradeables; estos fixes requieren redeploy completo en
Sepolia y nueva verificación antes de cualquier paso a mainnet.

## Qué se corrigió

### H-01 — `resolveTrade(EXPIRED)` lavaba pérdidas
`src/BobbyTrackRecord.sol` — `resolveTrade` ahora rechaza `Result.EXPIRED`
(`"Use expireCommitment()"`). La única ruta de expiry es la permissionless
`expireCommitment()` después de `MAX_COMMITMENT_TTL`. Se eliminó el branch
muerto que saltaba la derivación de precio: la derivación (dirección inferida
de los niveles commiteados, PnL acotado a `PNL_TOLERANCE_BPS`) corre ahora en
TODA resolución, sin excepción. El bloque de derivación quedó en un scope `{}`
propio por stack-too-deep.

- Test: `test_H01_resolveTradeRejectsExpired` — el exploit del PoC r9 ahora
  revierte; el commitment sigue pendiente y solo expira por la ruta legítima.

### H-02 — Ownership Safe (D-4) inejecutable
`src/BobbyAgentEconomyV2.sol` y `src/BobbyAgentRegistry.sol` — `owner` dejó de
ser `immutable`; ambos implementan el mismo two-step transfer
(`transferOwnership`/`acceptOwnership` + eventos) que ya tenían los otros
cinco contratos.

`script/DeployBase.s.sol`:
- Nueva env var `OWNER_SAFE_ADDRESS` (config `expectedOwner`). En testnet es
  opcional (default: deployer, sin handoff — flujo canario intacto). En
  mainnet (8453) es OBLIGATORIA, debe ser ≠ deployer y tener código on-chain
  (Safe desplegado).
- Handoff scriptado: en el mismo broadcast, tras el deploy, se llama
  `transferOwnership(expectedOwner)` en los 7 contratos. El Safe debe aceptar
  (batcheable en su UI) — two-step en todo, un typo nunca puede tomar
  ownership.
- Aserciones post-deploy: owner == deployer (pre-accept) Y
  pendingOwner == expectedOwner en los 7 si hay handoff.
- El manifest ahora serializa `expectedOwner`.

`script/VerifyBaseDeployment.s.sol` — `_verifyOwnership` verifica contra
`expectedOwner` del manifest (fallback a deployer para manifests viejos). Un
contrato pasa si: owner == expected, o handoff en vuelo
(owner == deployer && pendingOwner == expected, logueado como PENDING).
**Falla exactamente en el estado que D-4 prohíbe** (EOA owner sin handoff) —
antes pasaba solo en ese estado.

- Tests: `test_H02_economyV2TwoStepOwnershipHandoff`,
  `test_H02_agentRegistryTwoStepOwnershipHandoff`,
  `test_H02_acceptOwnershipOnlyPendingOwner`.

### M-01 — IntentEscrow: keeper podía volverse owner
`src/BobbyIntentEscrow.sol`:
- `transferOwnership` rechaza `next == keeper`;
- `acceptOwnership` re-verifica `msg.sender != keeper` (el keeper puede rotar
  entre proposal y acceptance);
- `rotateRole("keeper", next)` rechaza `next == pendingOwner`.

Invariants ampliados (`test/BobbyIntentEscrowInvariantTest.t.sol`):
- `invariant_roleSeparationHolds` ahora afirma `owner != keeper` y
  `pendingOwner != keeper`;
- nuevo handler `fuzzOwnershipAndRotation` fuzzéa transfer/accept/rotación de
  keeper — la ruta que el suite anterior nunca ejercitó.

- Tests: `test_M01_transferOwnershipRejectsKeeper`,
  `test_M01_acceptOwnershipRejectsKeeperRotatedInBetween`.

### M-06 — Duplicado vulnerable de TrackRecord
- `foundry.toml`: `src = "src"` (antes `"."`).
- Eliminados los duplicados root `contracts/BobbyTrackRecord.sol` y
  `contracts/BobbyConvictionOracle.sol` (la copia root era pre-r4: sin
  derivación de precio y con `resolveTrade` pausable).
- `BobbyAgentEconomy` V1, `Counter` y el script legacy de X Layer
  `DeployAgentEconomy.s.sol` movidos a `contracts/legacy/` — fuera del árbol
  compilable (cierra también el ítem "Economy V1 fuera de src" del backlog).
- `forge inspect BobbyTrackRecord` ya resuelve sin ambigüedad; el artifact
  genérico apunta a `src/BobbyTrackRecord.sol`.

### L-01 — TTL sin límites en ConvictionOracle
`src/BobbyConvictionOracle.sol` — `MIN_SIGNAL_TTL = 5 minutes`,
`MAX_SIGNAL_TTL = 30 days`. `publishSignal` valida el TTL efectivo ANTES del
cast a `uint64`; `setDefaultTTL` aplica los mismos bounds.

- Tests: `test_L01_publishSignalRejectsOversizedTTL`,
  `test_L01_setDefaultTTLBounded`.

### L-02 — Casts silenciosos y quorum 1 por default en DeployBase
- Todos los env vars económicos se leen como `uint256` y se validan contra
  `type(uint96).max` / rango de `uint8` ANTES de castear — un valor
  sobredimensionado falla, nunca trunca a un valor "válido".
- En mainnet (8453): `RESOLVER_ADDRESSES` debe listar ≥ 3 resolvers y
  `RESOLVER_THRESHOLD` ≥ 2 (runbook 2-de-3). Olvidar cualquiera de los dos
  falla pre-broadcast.

### L-03 — `updateFees` permitía fees cero
`src/BobbyAgentEconomyV2.sol` — `updateFees` reutiliza el guard del
constructor (`"Zero fee"`).

- Test: `test_L03_updateFeesRejectsZero`.

## Evidencia

- `forge build --sizes`: OK, 41 archivos. Todos bajo EIP-170. HardnessRegistry
  sin cambios: 22,771 bytes (margen 1,805).
- `FOUNDRY_FUZZ_RUNS=1000 forge test`: **134/134 pass** (125 preexistentes +
  9 tests de regresión nuevos en `SecurityAuditPoC.t.sol`, que reemplazan los
  2 PoC r9 — ahora afirman que el exploit revierte).
- Invariants del escrow corren con el handler de ownership nuevo.

## Qué NO cubre esta ronda (sigue abierto)

1. **M-02 a M-05** (HardnessRegistry lifecycle + anti-Sybil/pause de
   bounties) — diferidos a la siguiente ronda; tocan el mismo lifecycle y
   conviene diseñarlos juntos.
2. **Decisión de producto pendiente (bloquea el veredicto de TrackRecord):**
   ¿`exitPrice` oracle-verified o "reported by recorder" con etiqueta honesta
   estilo D-1? El fix H-01 cierra el bypass, pero el precio sigue siendo
   auto-reportado por Bobby.
3. El backlog documentado del r9 (stats arbitrarias de AgentRegistry, ERC-721
   incompleto, stakes sin salida, slashing centralizado, D-2, challenge
   binding, push payments, metadata "on X Layer").
4. Crear el Safe 2-de-3 en Base y fijar `OWNER_SAFE_ADDRESS` (acción de
   Anthony, prerequisito del dry-run mainnet).
5. Redeploy Sepolia + `VerifyBaseDeployment` + canario 24–48h + re-auditoría
   (Slither, fuzz, invariants) sobre el árbol nuevo.

## Para el auditor (Codex)

- Diff completo en la rama `fix/base-r9-round1` vs `feat/base-migration`.
- Puntos que merecen adversarialidad:
  - ¿Queda ALGUNA ruta para crear un Trade con `Result.EXPIRED` que no pase
    por el TTL completo? (`expireCommitment` es la única intencionada.)
  - ¿El handoff two-step de DeployBase deja alguna ventana donde la EOA
    retenga poder sin que `VerifyBaseDeployment` lo delate?
  - ¿`fuzzOwnershipAndRotation` cubre la secuencia proposal → rotación →
    acceptance en ambos órdenes?
  - Bounds de L-01: ¿5 min / 30 días rompen algún flujo existente de
    `bobby-cycle`/`agent-run` que publique señales con TTL fuera de ese rango?
