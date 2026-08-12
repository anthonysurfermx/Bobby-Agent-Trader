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

## Addendum r10.1 — respuesta a la review de Codex (2026-08-12)

Codex auditó `6c64738`: aprobó H-01, la lógica de M-01, M-06 y los tres Low,
pero reportó 5 hallazgos sobre el tooling de H-02 y la cobertura de M-01.
Los cinco quedan cerrados en este commit:

1. **[P1] El verificador aprobaba handoff pendiente como estado final.**
   `_checkOwner` ahora es chain-aware: en 8453 SOLO pasa
   `owner == expectedOwner && pendingOwner == address(0)` — aceptado, no
   propuesto. La rama tolerante (handoff PENDING) queda explícitamente
   limitada a testnet.
2. **[P1] `OWNER_SAFE_ADDRESS` no se validaba como Safe 2-de-3.**
   `ISafeMinimal` (getThreshold/getOwners) en ambos scripts: DeployBase exige
   en 8453 `getThreshold() >= 2` y `getOwners().length >= 3` pre-broadcast, y
   VerifyBaseDeployment re-prueba lo mismo contra estado live (más
   `expectedOwner != deployer`). Un contrato arbitrario o smart wallet 1-de-1
   revierte con error explícito.
3. **[P2] `fuzzOwnershipAndRotation` nunca se ejecutaba** (faltaba en el
   allowlist de `targetSelector` — cobertura declarada vacua). Añadido como
   sexto selector. Prueba empírica: un invariant temporal
   `assertEq(handler.ownershipFuzzCalls(), 0)` FALLÓ con counterexample
   `fuzzOwnershipAndRotation(8166, 185)` — el fuzzer lo invoca de verdad. El
   contador `ownershipFuzzCalls` queda permanente en el handler para que la
   cobertura sea verificable y no asumida.
4. **[P2] Manifests viejos podían bendecir ownership EOA.** El fallback
   `expectedOwner → deployer` ahora es testnet-only; en 8453 un manifest sin
   el campo hace fallar la verificación con instrucción de redeploy.
5. **[P3]** `expectedOwner != keeper` se valida pre-broadcast (antes revertía
   recién en el séptimo transferOwnership, dejando deploy parcial), y el
   import roto de `legacy/DeployAgentEconomy.s.sol` apunta a `./`.

Re-evidencia: build limpio, 134/134 con 1,000 fuzz runs, invariants del
escrow ahora ejercitando ownership transfer/acceptance/rotación de keeper.

## Addendum r10.2 — respuesta a la review de r10.1 (2026-08-12)

Codex aprobó 4 de los 5 fixes de r10.1 y dejó dos hallazgos: el gate del Safe
era imitable (getters no prueban autenticidad ni política efectiva) y las
garantías de deployment no tenían tests. Ambos cerrados:

### [P1] Gate del Safe → `script/SafeOwnerGate.sol` (compartido por deploy y verify)

Se adopta la **alternativa que la review marcó como aceptable**: el Safe se
crea PRIMERO, se audita externamente, y su identidad on-chain exacta queda
**pineada** — no se intenta "detectar" un Safe por sus getters. El gate
prueba contra estado live:

1. `codehash(safe) == OWNER_SAFE_CODEHASH` pineado — byte-idéntico al
   artefacto auditado; un impostor con los mismos getters no puede igualarlo;
2. storage slot 0 == `OWNER_SAFE_SINGLETON` pineado, y el singleton tiene
   código — el paso de runbook es cotejar ese singleton contra el registro
   oficial `safe-global/safe-deployments` para chain 8453;
3. `getThreshold() >= 2` y `getOwners().length >= 3` (política D-4);
4. `getModulesPaginated(SENTINEL, 10)` vacío — sin ruta
   `execTransactionFromModule` que evada el quorum;
5. guard storage slot (keccak de `guard_manager.guard.address`, computado en
   el código, no transcrito) == 0 — semántica de ejecución vanilla.

**Reformulación honesta (pedida por la review):** esto NO es una prueba
trust-free de "Safe auténtico". Prueba que el owner es byte-idéntico a un
deployment específico auditado externamente, con política efectiva ≥ 2-de-3
y sin rutas de ejecución adicionales (módulos/guard). La autenticidad del
singleton descansa en el paso de runbook contra safe-deployments.

Los pins entran por env (`OWNER_SAFE_CODEHASH`, `OWNER_SAFE_SINGLETON`,
obligatorios en 8453), se escriben al manifest
(`expectedOwnerCodehash`/`expectedOwnerSingleton`), y
`VerifyBaseDeployment` los exige en el manifest mainnet y re-ejecuta el gate
completo contra estado live.

### [P2] Tests de las garantías de deployment → `test/DeploymentGates.t.sol`

18 tests nuevos (152/152 total):

- **SafeOwnerGate** (10): happy path; impostor con getters correctos pero
  bytecode distinto → rechazado por codehash; singleton equivocado en slot 0;
  singleton sin código; threshold 1; solo 2 owners; módulo habilitado; guard
  seteado; pins ausentes; owner == deployer.
- **`_checkOwner`** (5): en 8453 el handoff pendiente FALLA, aceptado con
  pendingOwner sucio FALLA, aceptado y limpio PASA; en 84532 pending PASA y
  owner ajeno FALLA.
- **`_resolveExpectedOwner`** (3): manifest con campo lo lee; manifest legacy
  en 8453 FALLA; en testnet cae a deployer.

`_resolveExpectedOwner` se extrajo como función interna testeable; los tests
de `_checkOwner` usan un harness que subclasea el script. La validación del
gate corre vía un caller externo para que `expectRevert` capture cada rama.

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
