# TrackRecord v2 — Spec de diseño implementable

**Fecha:** 2026-08-12 · **Versión:** v0.6 · **Estado:** DISEÑO CERRADO + **PoC EJECUTADO** — F-01..F-06 resueltos (§10b), las 6 decisiones de §8 confirmadas por Anthony, y el PoC con Pyth real completado 5/5 (`trackrecord-v2-poc.md`): gas medido, layout congelado por `forge inspect`, semántica Unique validada on-chain. **GATE VIGENTE: implementación en `feat/trackrecord-v2`** (con API key de Pyth antes del 2026-08-18)
**Insumos:** `exitprice-oracle-decision.md` (§5b), `oracle-comparison.md`,
`base-r9-security.md` (M-02..M-05), `contracts/src/BobbyTrackRecord.sol` (v1 r10.2).

> **Changelog interno (2026-08-12):** dos pasadas red-team independientes sobre v0.1:
> - **Seguridad** (9 hallazgos, 3 HIGH): cherry-pick del instante de exit (S-01),
>   flip de clasificación por doble tolerance (S-02), symbol-routing hacia
>   attested (S-03), laundering por expiry selectivo (S-04), underflow de
>   ventana (S-05), expo por suerte (S-06), allowlist Pyth débil (S-07),
>   reentrancy/refund (S-08), sanity decorativo (S-09) + 9 ambigüedades.
> - **Implementabilidad** (3 blockers): math de tolerancia no compilable
>   (B-01), migración de consumidores omitida — 4 endpoints + selector
>   hardcodeado `0x6f61e432` en `xlayer-record.ts:105` (B-02), downgrade
>   silencioso vía naming con el regex actual del backend (B-03). Gas real
>   medido: v1 = 212k commit / 270k resolve / runtime 12,113 B. Pyth en Base
>   es proxy ERC-1967 ⇒ pinear codehash NO protege de un upgrade (C-07).
>   HardnessRegistry a 1,805 B del EIP-170 — M-03/M-05 lo arriesgan.
> Todo incorporado abajo. v0.1/v0.2 quedan en git history.

> **Review independiente Codex (2026-08-12):** encontró 2 HIGH y 4 MEDIUM
> adicionales. v0.3 no debe pasar a implementación sin cerrar el orden causal
> del exit, la semántica de dirección, el evento de reclasificación, el límite
> del challenge y la confianza residual del proxy Pyth. Ver §10.
>
> **Cierre v0.5 (2026-08-12, Claude):** los 6 findings quedaron resueltos —
> F-01/F-02/F-03 integrados en los flujos, F-04 decidido (ventana finita 7 d),
> F-05 como trust assumption + revoke-as-pause compatible con r5, F-06 como
> gate de proceso (forge inspect + snapshot CI). Tabla de cierre en §10b.
> Solo quedan las 6 respuestas humanas de §8 para abrir implementación.

**Bloquea:** GO de mainnet Base. **No bloquea:** redeploy canario Sepolia r10.2.

## 0. Qué prueba v2 que v1 no puede

1. **Verdad de mercado en ambos extremos** — entry y exit exigen update firmado
   de Pyth (`parsePriceFeedUpdatesUnique`, exactamente 1 update) cuyo
   `publishTime` cae en ventana declarada.
2. **Clasificación no comprable** — WIN/LOSS/BE se deriva de precios de
   ORÁCULO (oráculo-entry vs oráculo-exit); las tolerances solo acotan la
   desviación de los números reportados y JAMÁS deciden el signo.
3. **Exit reciente** — `maxExitLag` impide resolver contra un instante
   favorable del pasado lejano.
4. **Stop ejecutable por terceros** — challenge permissionless: un update
   firmado que cruce el stop antes del exit fuerza LOSS al stop.

Claim público (honesto): *"resultados verificados contra precios firmados en
ventanas acotadas, clasificación derivada del oráculo, stops ejecutables por
cualquiera — para el universo verified; el resto, attested y contado aparte"*.
Límites residuales publicados en §6.1.

## 1. Decisiones asumidas (estado)

| # | Decisión | Estado |
|---|---|---|
| 1 | Híbrido: BTC/ETH/SOL `VERIFIED`, resto `ATTESTED`, stats separadas (D-1) | ✅ **CONFIRMADA por Anthony (2026-08-12)** — 100 bps inicial, sujeto a recorte post-PoC |
| 2 | Pyth primario | ✅ Confirmada — **Anthony provisiona API key antes del 2026-08-18** |
| 3 | Entry Y exit verificados | Fijado (§5b.1) |
| 4 | Tolerances 100 bps inicial (recortar a basis real ~20–30 bps con PoC); ventanas 60/120 s | ✅ Confirmada (recorte post-PoC) |
| 5 | Sanity Chainlink NO bloqueante | ✅ **CONFIRMADA — entra en v2.0** |
| 6 | XAUT/PAXG/OKB → `ATTESTED` | Recomendado |
| 7 | Empaquetado con M-02..M-05 · M-04 = **exención de pause para evidencia (CONFIRMADA)** | Fijado — con gate EIP-170 (§5) |
| 8 | Challenge de stop-breach permissionless + **ventana finita 7 d snapshoteada** | ✅ **CONFIRMADA por Anthony (2026-08-12)** |
| 9 | `maxExitLag` default 1 h | ✅ **CONFIRMADA** (cron 45 min compatible) |
| 10 | Estilo de errores: v2 = custom errors; caminos v1 conservan sus require strings VERBATIM (las suites de regresión los pinean literalmente) | Fijado (C-08) |

## 2. Tipos y storage — **layout CONGELADO (F-06 cumplido: `forge inspect`, PoC 2026-08-12)**

> **F-06 CERRADO:** el layout de abajo ya NO es objetivo — es el emitido por
> solc 0.8.24 sobre los probes del PoC (`test/TrackRecordV2PythPoC.t.sol`),
> tablas completas slot-a-slot en `trackrecord-v2-poc.md` §5. **CommitmentV2 =
> 7 slots (224 B)** — los 7 params snapshoteados caben en el slot 3 con anchos
> encogidos (uint16/uint24). **TradeV2 = 10 slots (320 B)** — `mode` en el
> byte libre exacto del slot 2 (offset 31); slot 4 nuevo con
> `exitAt+challengeDeadline+stopChallenged` (17/32, 15 B de holgura). El
> **snapshot ABI/layout en CI** (test que falla si `forge inspect` difiere) se
> crea con la implementación; los consumidores (§4.5) se alinean contra él.

```solidity
enum PriceMode { ATTESTED, VERIFIED }   // C-03: el valor cero es el claim DÉBIL

struct OracleEvidence {                  // 2 slots exactos, orden congelado
    bytes32 feedId;                      // slot A
    int64   price;  uint64 conf;  int32 expo;  uint64 publishTime; // slot B: 8+8+4+8=28/32
}
```

**Commitment v2 = 7 slots + string** (v1 era 4 + string; C-01 optimal):

| Slot | Contenido |
|---|---|
| 1 | `debateHash` (32) |
| 2 | `entryPrice` (12) + `targetPrice` (12) + `committedAt` (8) |
| 3 | `stopPrice` (12) + `recorder` (20) |
| 4 | `minResolveAt` (8) + `agent` (1) + `conviction` (1) + `resolved` (1) + **`mode` (1) + params snapshoteados: `entryWindowSec` + `exitWindowSec` + `maxExitLagSec` + `challengeWindowSec` (F-04) + `entryTolBps` + `exitTolBps` + `confMaxBps`** — con anchos encogidos (uint16/uint24) caben en 32; empaque final lo decide `forge inspect` (F-06) |
| 5–6 | `entryEvidence` (OracleEvidence inline, 2 slots; `feedId` NO se duplica — el exit lee `c.entryEvidence.feedId`, C-04/M-02) |
| 7+ | `symbol` (string) |

Los params de verificación van INLINE (un struct anidado en storage abre slot
nuevo); en memoria/ABI se exponen agrupados vía getters. **Params snapshoteados
al commit — ningún cambio de config reinterpreta pendientes (lección M-02).**

**Trade v2 ≈ 9–10 slots + string**: v1 slots 1–4 intactos; `mode` toma el byte
libre del slot 3 (31→32). **F-06 confirmado: `exitAt` (8) + `stopChallenged`
(1) + `challengeDeadline` (8) NO caben en los slots existentes** — van a un
slot nuevo propio (con 15 bytes de holgura para futuro) o a un repack que
decida `forge inspect`. + `entryEvidence` (2) + `exitEvidence` (2). Orden
final: solo tras PoC, copiado aquí, con snapshot en CI.

Storage global nuevo:

```solidity
mapping(bytes32 symbolHash => bytes32 feedId) public feedOf;      // universo verified
mapping(address => bool)   public approvedPyth;                    // §3.5 (C-07: allowlist ES el control)
mapping(address => uint64) public pythActivatableAt;               // timelock 2 días
address public activePyth;
mapping(bytes32 symbolHash => address aggregator) public sanityFeedOf;
uint16 public constant SANITY_BAND_BPS = 200;
uint32 public constant SANITY_MAX_STALENESS = 3600;
VerificationParams public params;                                  // floors/caps §3.5

// Stats POR MODO — los agregados v1 (wins/losses/totalPnlBps y
// agentWins/agentLosses/agentTrades) SE ELIMINAN (M-03): mantenerlos en
// paralelo double-cuenta y viola D-1. getters: getVerifiedWinRate() /
// getAttestedWinRate() / getCoverage(mode) / getAgentStats(agent, mode)
// (funciones separadas, no enum param en las de headline — más difícil de
// llamar mal desde ethers, B-02).
uint256 public winsVerified;  uint256 public lossesVerified;  int256 public totalPnlBpsVerified;
uint256 public winsAttested;  uint256 public lossesAttested;  int256 public totalPnlBpsAttested;
uint256 public expiredVerified; uint256 public expiredAttested;   // S-04: coverage de 1ª clase
mapping(Agent => mapping(PriceMode => uint256)) public agentWinsByMode;   // + losses/trades
```

## 3. Flujos

### 3.0 Normalizaciones compartidas (B-01 — el math exacto, parte del claim)

```solidity
// Precio Pyth → escala 1e8 de v1. TODO en uint256. Custom errors.
if (p.price <= 0) revert NonPositivePrice();
if (p.expo < -18 || p.expo > 0) revert UnexpectedExpo();     // defensivo, jamás asumir -8
int32 shift = p.expo + 8;
uint256 oracle1e8 = shift >= 0
    ? uint256(uint64(p.price)) * 10 ** uint32(shift)
    : uint256(uint64(p.price)) / 10 ** uint32(uint32(-shift));
if (oracle1e8 == 0) revert NonPositivePrice();
// Tolerance (basis band — solo magnitud del REPORTADO, nunca el signo):
uint256 diff = reported > oracle1e8 ? reported - oracle1e8 : oracle1e8 - reported;
if (diff * 10_000 / oracle1e8 > tolBps) revert PriceOutOfBand();
// Conf gate (expo-independiente, ambos raw) — en uint256 (overflow con uint64):
if (uint256(p.conf) * 10_000 / uint256(uint64(p.price)) > confMaxBps) revert ConfTooWide();
```

Overflow: `int64max × 10^8 ≈ 9.2e26 ≪ 2^256`. Sesgo de truncamiento < 1 bps.
`publishTime` de Pyth es `uint256` → downcast validado a `uint64` (C-02c).

**Símbolo:** ASCII `[A-Z0-9]{2,10}` o revert `InvalidSymbol()` (mata "btc",
"BTC "). El regex actual del backend admite `[A-Za-z0-9._:-]{1,32}` (B-03) ⇒
**cambio de contrato de datos: el backend canonicaliza ANTES de commitear**
(tabla canónica: "BTC","ETH","SOL","XAUT","PAXG","OKB" — `BTC-USDT-SWAP`→`BTC`).
Anti-downgrade explícito: `commitTrade` recibe **`PriceMode _declaredMode`** y
revierte si `derivedMode != _declaredMode` (`ModeMismatch()`) — una
misclasificación por naming es un revert ruidoso, jamás un silencio (B-03 fix a).
Synonym-routing deliberado ("BTCX") no es prevenible on-chain: defensa =
detección pública — el JSON del debate (preimage del debateHash) DEBE incluir
`symbol` canónico y `priceMode`; attested se publica POR SÍMBOLO (§4.5).

**Updates:** siempre `parsePriceFeedUpdatesUnique`, `updateData.length == 1`,
`ids = new bytes32[](1)` (C-02a). Ventana entry: clamp inferior a 0 si
`block.timestamp < entryWindowSec` (C-02b — Foundry arranca en t=1).

### 3.1 `commitTrade` v2 (payable, nonReentrant)

```solidity
function commitTrade(
    bytes32 _debateHash, string calldata _symbol, Agent _agent, uint8 _conviction,
    uint96 _entryPrice, uint96 _targetPrice, uint96 _stopPrice,
    PriceMode _declaredMode, bytes[] calldata _entryUpdateData
) external payable onlyBobby whenNotPaused nonReentrant
```

- Valida símbolo y `_declaredMode` (§3.0).
- **VERIFIED:** `_entryUpdateData` obligatorio (`EntryProofRequired()`);
  **`_stopPrice > 0` obligatorio** (`StopRequiredForVerified()` — sin stop no
  hay challenge, cierre de S-01); ventana
  `[ts - entryWindowSec (clamp 0), ts]` — nunca publishTime futuro. Nota
  operativa C-09: Hermes fresquísimo puede tener publishTime ≥ timestamp del
  sequencer ⇒ el backend usa un update con edad ≥ 3–5 s y trata el revert
  `PriceFeedNotFoundWithinRange` como caso de retry (§4.3). Se RECHAZA
  conscientemente el forward-skew (+3 s): la regla "nunca futuro" vale más
  que el retry ocasional.
- Checks §3.0 (conf, basis band vs `_entryPrice`).
- Fees: `fee = getUpdateFee(...)`; `msg.value >= fee`; CEI estricto — todo el
  estado + evento ANTES del refund, refund AL FINAL vía `call`; si falla:
  retener + `emit RefundRetained` (nunca revert).
- **ATTESTED:** camino v1 + estricto: `_entryUpdateData.length == 0 ∧
  msg.value == 0` o revert (A-02) — attested no carga evidencia decorativa.

### 3.2 `resolveTrade` v2 (payable, nonReentrant)

```solidity
function resolveTrade(
    bytes32 _debateHash, int256 _pnlBps, Result _result, uint96 _exitPrice,
    uint64 _exitAt, bytes[] calldata _exitUpdateData
) external payable onlyBobby nonReentrant
```

Conserva v1 (no EXPIRED/H-01, minResolveAt, TTL, dirección por niveles, signo
coherente, PNL_TOLERANCE_BPS) — esos caminos mantienen sus require strings
verbatim (C-08). Nuevo:

- **`_exitAt` acotado y reciente:** `minResolveAt <= _exitAt <= ts` ∧
  `_exitAt <= committedAt + TTL` ∧ `ts - _exitAt <= snap.maxExitLagSec` (S-01a).
- **Ventana exit con causalidad:** `lower = max(_exitAt - exitWindowSec,
  committedAt, entryEvidence.publishTime)` (S-05/C-05); **`upper = _exitAt`**.
  Un update publicado después de `_exitAt` no puede probar un exit anterior;
  validar explícitamente `exitEvidence.publishTime <= _exitAt`. `setParams`
  exige además `minCommitAge > exitWindowSec` (A-08).
- Exit parse contra **`c.entryEvidence.feedId`** — NUNCA `feedOf` en vivo
  (M-02); mismo §3.0 de checks.
- **Determinismo del update (hallazgo del PoC, validado on-chain):** con `min`
  fijado por el contrato, ventana + `Unique` (`prev < min <= publishTime`)
  hacen que el update válido sea ÚNICO: el primer tick publicado tras el borde
  inferior. El recorder no elige NADA dentro de la ventana — el residual
  "±window de cherry-pick" de §6.1 no existe para entry/exit. El precio
  probado es ≈ el del borde inferior ⇒ mantener ventanas chicas. Operativo:
  la request a Benchmarks se hace al borde INFERIOR de la ventana (§4).
- Fees exit = espejo del commit (M-01): `getUpdateFee` + `msg.value >= fee` +
  refund-last; ATTESTED exige `_exitUpdateData.length == 0 ∧ msg.value == 0`.
- **Clasificación (S-02, cambio central):**

```solidity
// F-02: dirección ANCLADA AL STOP (obligatorio en VERIFIED) — sin precedencia
// silenciosa de target. Se valida EN EL COMMIT (revert temprano, no al resolve):
//   isLong = c.stopPrice < c.entryPrice;          // stop define el lado
//   si c.targetPrice > 0: require(isLong ? target > entry : target < entry)
//   target == entry ∨ stop == entry ∨ target/stop del mismo lado ⇒ InvalidDirection()
bool isLong = c.stopPrice < c.entryPrice;
int256 verifiedPnlBps = isLong
    ? (int256(exitOracle1e8) - int256(entryOracle1e8)) * 10_000 / int256(entryOracle1e8)
    : (int256(entryOracle1e8) - int256(exitOracle1e8)) * 10_000 / int256(entryOracle1e8);
// signo(verifiedPnlBps) DECIDE el Result; _pnlBps reportado debe (a) estar a
// ≤ PNL_TOLERANCE_BPS de verifiedPnlBps y (b) no cruzar el signo.
```

  Target es opcional en VERIFIED (el stop, obligatorio por S-01, ancla la
  dirección); si existe, debe estar estrictamente del lado opuesto al stop o
  `InvalidDirection()`. El camino ATTESTED conserva la derivación v1 verbatim
  (sus require strings están pineados por las suites — C-08).

- Sanity Chainlink (C-06): `try aggregator.latestRoundData()` — catch ⇒ skip;
  skip si `updatedAt` stale > SANITY_MAX_STALENESS; comparación RELATIVA
  `diff*10_000/chainlinkPrice > SANITY_BAND_BPS` ⇒ `emit OracleDiscrepancy`;
  `decimals() == 8` se asserta UNA vez en `setSanityFeed`, no por resolve.
  Su valor es el monitoreo off-chain que lo escucha — sin alerta cableada es
  decorativo (S-09; el monitor va en §4.6).

### 3.3 `expireCommitment` — permissionless, sin oráculo

v1 + registra `mode` e incrementa `expiredVerified|expiredAttested`. El Trade
del expiry lleva **evidencia ZEROED** (M-06): copiar `entryEvidence` costaría
+44k gas al caller permissionless (griefing de coste) y es redundante — el
`Commitment` con su evidencia PERSISTE on-chain; el manifest reconstruye
cobertura desde ahí (5b.2 intacto). **Coverage es stat de 1ª clase (S-04):**
`getCoverage(mode)` = `{resolved, expired, pending}`; la UI DEBE publicar el
expiry ratio junto al win rate — el laundering por abandono queda visible.

### 3.4 `challengeStopBreach` — permissionless (cierra S-01b y M-07)

```solidity
function challengeStopBreach(bytes32 _debateHash, uint64 _anchorTs, bytes[] calldata _breachUpdateData)
    external payable nonReentrant
```

- Aplica a VERIFIED **pendientes** y **resueltos como WIN/BREAK_EVEN**.
- **`_anchorTs` (delta del PoC):** por la semántica Unique, el challenger debe
  declarar el `min` del parse — `_anchorTs ∈ (entryEvidence.publishTime,
  exitAt]` (pendiente: `(entry, ts]`); el update debe ser el primer tick
  ≥ `_anchorTs` (Unique lo exige) y su precio normalizado cruzar el stop
  (long: `≤ stopPrice`; short: `≥ stopPrice`). Libertad del challenger =
  elegir DÓNDE buscar; determinismo del tick = imposible fabricarlo.
- Efecto — pendiente: se RESUELVE como LOSS al stop (crea el Trade, pnl =
  oráculo-entry vs stop). Resuelto: re-clasifica a LOSS al stop
  (`stopChallenged = true`, wins--, losses++, totalPnl ajustado desde
  evidencia). Idempotente (no re-challenge). `emit StopBreachChallenged`.
- **Resuelve M-07 de paso:** un stop-out más rápido que `minCommitAge` (cuyo
  precio real ya no cabe en la ventana del resolve) se registra HONESTAMENTE
  vía challenge — el propio backend de Bobby challengea sus stop-outs
  pendientes (§4.2). El stop deja de ser decorativo para todos, incluido Bobby.
- Sin recompensa on-chain en v2.0 (AdversarialBounties puede pagarla después).

  **Finality (F-04 — CERRADO, ventana finita):** `challengeDeadline =
  resolvedAt + snap.challengeWindowSec` (nuevo campo en VerificationParams,
  default **7 días**, bounds [1, 30] días, snapshoteado al commit como todo);
  pendientes: challengeables hasta `committedAt + TTL`. Pasado el deadline el
  resultado es FINAL — un consumidor que cachea un resultado con
  `block.timestamp > challengeDeadline` no vuelve a verlo cambiar. El
  challenge eterno se RECHAZA: "provisional para siempre" degrada el claim
  del producto más de lo que la ventana infinita agrega en seguridad, dado
  que el backend corre el breach-check ANTES de resolver y la ventana de 7
  días da a cualquier tercero 168 h con evidencia pública firmada.
  `isFinal(debateHash)` view para consumidores.

### 3.5 Administración (owner = Safe en 8453)

- `setFeed`/`setSanityFeed`/`setParams` — efecto SOLO futuro; floors/caps
  duros validados como uint256 antes de cast (anti-L-02): ventanas entry
  [10, 600] s, exit [10, 1800] s, maxExitLag [600, 86400] s,
  **challengeWindow [1, 30] días (F-04)**, tolerances [10, 500] bps,
  confMax [10, 200] bps, `minCommitAge > exitWindowSec`.
- **Allowlist Pyth (C-07 — honestidad):** Pyth en Base es proxy ERC-1967:
  su codehash NO cambia en un upgrade de implementación ⇒ pinear codehash
  NO detecta el threat realista. El control REAL es: (1) allowlist sembrada
  en constructor con las direcciones canónicas (mainnet
  `0x8250f4aF4B972684F7b336503E2D6dFeDeB1487a` y `0xbC16aee60f64864882BC6C4E428e148Fc0E272F5`
  — **validar ABI post-upgrade 2026-08-18 antes de activar la segunda**, A-09;
  Sepolia `0xA2aa501b19aff244D90cc15a4Cf739D2725B5729`); (2) additions con
  **timelock `PYTH_ACTIVATION_DELAY = 2 days`** + eventos (`approvePyth`
  agenda, `activatePyth` exige delay) — un Safe comprometido necesita 2 txs
  y 48 h a la vista, no 1 tx; (3) `revokePyth(activePyth)` limpia
  `activePyth` (contrato inoperante para VERIFIED hasta activar otro — mejor
  parado que apuntando a un revocado). El exit usa `activePyth` vigente al
  resolve (los pendientes sobreviven la migración 08-18); riesgo documentado.
  (El patrón SafeOwnerGate NO aplica aquí: es librería de script con
  cheatcodes `vm.load`, no runtime — la analogía era un error de categoría.)

### 3.6 Constructor y deploy (M-05)

`constructor(address _bobby, VerificationParams memory _params, address _pyth,
bytes32[3] memory _feedIds)` — params validados contra floors/caps (los
defaults zeroed romperían el primer commit: ventana [ts,ts] y confMax 0
rechazan todo), `_pyth` sembrado approved+active, feeds BTC/ETH/SOL sembrados
(IDs de Pyth: BTC/USD `0xe62df6c8…415b43`, ETH/USD `0xff61491a…fd0ace`,
SOL/USD `0xef0d8b6f…80b56d` — **verificar contra el registro de Pyth al
implementar**, no confiar en esta transcripción). `DeployBase.s.sol` y
`VerifyBaseDeployment.s.sol` se extienden con estos checks (verify: params
dentro de bounds, feeds sembrados, activePyth correcto por chain).

### 3.7 Eventos (M-04 — parte de la garantía 5b.2)

`TradeCommitted(commitId, symbol, agent, conviction, entryPrice, debateHash,
mode, feedId, entryOraclePrice1e8, entryPublishTime)` ·
`TradeResolved(tradeId, symbol, agent, result, pnlBps, conviction, debateHash,
mode, exitAt, exitOraclePrice1e8, exitPublishTime)` · `TradeReclassified(tradeId,
debateHash, oldResult, newResult, oldPnlBps, newPnlBps, reason)` ·
`StopBreachChallenged(debateHash, challenger, breachPublishTime, breachPrice1e8, wasResolved)` ·
`FeedSet(symbolHash, feedId)` · `SanityFeedSet(symbolHash, aggregator)` ·
`PythApproved(pyth, activatableAt)` · `PythRevoked(pyth)` · `PythActivated(pyth)` ·
`ParamsUpdated(...)` · `OracleDiscrepancy(debateHash, oracle1e8, chainlink1e8)` ·
`RefundRetained(to, amount)` · `StuckFeesWithdrawn(to, amount)`.
(Firmas exactas se congelan en implementación; los indexed se eligen por
patrón de query del indexer.)

## 4. Backend — delta y migración de lectores (B-02)

1. Commit: Hermes con `PYTH_HERMES_API_KEY` (Sensitive; **registrar antes del
   2026-08-18**), update con edad 3–5 s (C-09), retry en revert de ventana.
2. Settle: Benchmarks al `exitAt` + **stop-breach check propio antes de
   resolver un WIN** + challenge de stop-outs pendientes (§3.4).
3. `maxExitLag` 1 h vs cron de settle 45 min: cabe con margen; un settle caído
   >1 h solo difiere el exit declarable (el trade no se pierde).
4. Debate JSON incluye `symbol` canónico + `priceMode` (preimage del
   debateHash) + **tabla de canonicalización** en `_lib` compartida.
5. **Migración de lectores (los 4 endpoints que hoy leen v1):**

| Consumidor | Hoy | v2 |
|---|---|---|
| `api/xlayer-record.ts:105` | **selector hardcodeado `0x6f61e432` (getWinRate)** | recalcular selectores de `getVerifiedWinRate()`/`getAttestedWinRate()`; PROHIBIDO hardcodear — generar de la ABI |
| `api/xlayer-record.ts:66-67` | tuple ABIs a mano de getRecent* | regenerar contra layout congelado §2 (campos NUEVOS y orden distinto) |
| `api/bobby-protocol-stats.ts` / `reputation.ts` / `protocol-heartbeat.ts` | `getWinRate()` único | dos rates + coverage; **UI muestra DOS win rates, jamás sumados** |
| `getAgentStats(agent)` (xlayer-record:64) | combinado | `getAgentStats(agent, mode)` — el combinado se ELIMINA (M-03) |

   Mitigante de timing: todos apuntan hoy al v1 de X Layer — nada truena al
   deployar v2 en Base; la migración corre cuando el registro oficial mude.
6. Monitor de `OracleDiscrepancy` (alerta Telegram) — sin oyente, el sanity
   es decorativo (S-09).

## 5. M-02..M-05 — con gate de tamaño (nuevo)

Fixes como v0.1 (TTL snapshot; challenge bond; pause sin censura de evidencia
— propuesta exención; tallies por (winner, ronda) sin reset + cambios de
propuesta acotados). **Gate nuevo:** HardnessRegistry mide **22,771 B
(margen EIP-170: 1,805 B)** y ya gastó la bala de custom errors; M-03+M-05
estiman +1.5–4 KB ⇒ **probable overflow**. Mitigaciones a decidir ANTES de
implementar (medir con `forge build --sizes` como gate de PR): mover la
mecánica de bonds al lado AdversarialBounties (12.4 KB de margen), extraer
tallies a librería external, o aceptar split de HardnessRegistry v2.

## 6. Seguridad (residual honesto — se publica, no se esconde)

1. Libertad restante del recorder: (a) timing real de cierre dentro de
   maxExitLag — tenencia genuina, visible en duración; (b) PnL reportado
   ±tolerance alrededor del verificado — magnitud, nunca signo; (c)
   synonym-routing a attested — detectable públicamente (debateHash + stats
   por símbolo), no prevenible on-chain; (d) expiry selectivo — visible en
   coverage ratio. Los cuatro van en la página de metodología.
2. Reuso de updateData: correcto semánticamente (el precio de ese instante).
3. CEI + nonReentrant en las 3 funciones payable; refund-last,
   retain-don't-revert, `withdrawStuckFees(to)` barre balance (que por
   construcción son solo refunds retenidos) + evento (M-08).
4. Rotación Pyth: allowlist+timelock+eventos. Esto no protege contra un
   upgrade de implementación del proxy activo (F-05): registrar la
   implementación (slot ERC-1967) en deploy, monitor off-chain de cambios, y
   ante upgrade sospechoso el "pause" de VERIFIED es **`revokePyth(activePyth)`**
   (los resolves verified revierten hasta activar un oráculo revisado) — NO
   se añade pause al resolve, preservando el principio r5 (settlement nunca
   pausable). Tensión residual documentada: un Safe malicioso podría revocar
   para empujar pendientes a EXPIRED — mitigado porque (a) el expiry spike es
   visible en coverage (S-04), (b) TTL 30 d ≫ timelock 2 d deja recuperación
   honesta de sobra, y (c) revoke emite evento monitoreado. La allowlist
   JAMÁS se describe como garantía de integridad del parser: es una trust
   assumption sobre la gobernanza de Pyth, publicada como tal.
5. Invariantes de fuzzing: (a) stats por modo jamás se cruzan; (b)
   entryEvidence inmutable; (c) ningún VERIFIED resuelto sin evidencia doble;
   (d) snap inmutable ante setParams; (e) activePyth ∈ allowlist (revoke
   limpia active); (f) ningún WIN verified sobrevive breach probable; (g)
   exit window lower ≥ entry publishTime; (h) Result == signo(verifiedPnlBps);
   (i) modo del Trade == modo del Commitment; (j) ATTESTED nunca porta
   evidencia ni value.

## 7. Gas y tamaño (medidos, no estimados — C-10)

v1 medido (solc 0.8.24, optimizer_runs=1): commit 211.8k · resolve 270.3k ·
expire 147.8k · runtime 12,113 B (margen 12,463 B).

**PoC 2026-08-12 (fork Sepolia, Pyth real — `trackrecord-v2-poc.md`):**
`parsePriceFeedUpdatesUnique` con 1 update = **162,465 gas medidos**;
updateData real = **1,311 bytes** (no ~700); fee Sepolia 10 wei (mainnet
4e12); conf real BTC ≈ **3.1 bps** (confMaxBps=50 tiene 16× de holgura).

| Op | v2 (layout §2 congelado) | Drivers |
|---|---|---|
| commit ATTESTED | ~212k | mode entra en slot existente |
| commit VERIFIED | **~420–470k** | +2 slots (44k) + parse **162k medido** + fee/refund ~19k + calldata 1.3 kB |
| resolve ATTESTED | ~270k | ídem |
| resolve VERIFIED | **~530–580k** | +5 slots + parse 162k + sanity ~10k + fee/refund |
| challenge | ~200–260k (parse 162k + reclasificación ~30–60k; total exacto con la implementación) | |
| ciclo VERIFIED | **~0.95–1.05M gas ≈ $0.01–0.12 en Base** + fee Pyth 2×4e12 wei ≈ $0.016 | |

Tamaño v2: +4–6.5 KB ⇒ ~16.5–18.5 KB — margen ≥6 KB, seguro. El riesgo de
tamaño de la ronda es HardnessRegistry (§5), no TrackRecord.

## 8. Preguntas abiertas para Anthony — ✅ **LAS 6 RESPONDIDAS (2026-08-12): todas SÍ.** El gate humano del diseño está cerrado; queda solo el PoC (§9) antes de implementar. Registro literal:

1. Confirmación del universo verified BTC/ETH/SOL + entry/exit + 100 bps inicial. *(sí/no)*
2. **API key de Pyth antes del 2026-08-18.**
3. M-04: exención de pause para evidencia (recomendado) vs extensión de deadlines.
4. ¿Sanity Chainlink en v2.0 (recomendado) o v2.1?
5. **Challenge de stop-breach (§3.4)** con **ventana de finality de 7 días**
   (F-04): más código/tests y resultados mutables SOLO dentro de la ventana,
   pero sin él el stop es decorativo y S-01 queda a medias.
   Recomendación: SÍ en v2.0, con los 7 días.
6. **`maxExitLag` 1 h** — ¿compatible con la operación? (cron 45 min ⇒ sí).

## 9. Plan de test y rollout

Todo v0.1 + delta v0.2 (challenge, underflow, expo fuzzing [−18,0], A-02
estricto, charset, timelock, sanity staleness/try-catch) + nuevo: regresión de
los require strings v1 VERBATIM (las suites los pinean), `forge inspect
storage-layout` congelado y copiado a §2, selectores de lectores regenerados
de ABI (nunca a mano), `forge build --sizes` como gate en HardnessRegistry.
Secuencia: PoC gas Sepolia (incluye challenge) → congelar params → implementar
`feat/trackrecord-v2` → 3 rondas de auditoría → deploy Sepolia v2 → canario
con evidencia real → candidato mainnet (junto con Safe 2-de-3 + handoffs).

## 10. Review Codex — findings y validaciones (2026-08-12)

### F-01 — HIGH — evidencia posterior al exit

**Sección:** §3.2. `upper = _exitAt + exitWindowSec` permitía que un update
posterior determinara un exit declarado antes. Corregido: `publishTime ∈
[lower, _exitAt]`; añadir test de revert con update posterior.

### F-02 — HIGH — dirección ambigua

**Sección:** §3.2. La expresión ternaria priorizaba `targetPrice` y aceptaba
target/stop contradictorios. Corregido con niveles estrictamente opuestos y
`InvalidDirection()`.

### F-03 — MEDIUM — reclasificación no indexable

**Sección:** §3.4/§3.7. `StopBreachChallenged` no permitía a un indexador
reconstruir `wins--/losses++` y el cambio de PnL. Corregido con
`TradeReclassified` incluyendo old/new result y PnL.

### F-04 — MEDIUM — challenge eterno sin finality

**Sección:** §3.4. Un WIN podía cambiar indefinidamente, incompatible con
consumidores que cacheen un resultado final. Recomendación: challenge window
finita; si se conserva eterno, tratar todos los resultados como provisionales.

### F-05 — MEDIUM — allowlist no fija la implementación de Pyth

**Sección:** §3.5/§6.4. Un proxy ERC-1967 puede cambiar de implementación sin
cambiar de dirección. Corregido como trust assumption explícita, con registro,
monitor y pausa de VERIFIED ante upgrade.

### F-06 — MEDIUM — layout todavía no congelable

**Sección:** §2. El espacio libre descrito no alcanza para `uint64 exitAt` y
`bool stopChallenged` junto al resto del slot. Debe separarse en un slot nuevo
o rediseñarse, y solo congelarse tras `forge inspect ... storage-layout` del
PoC, con snapshot ABI/layout en CI.

### Validaciones sound

- **S-02:** sound si el signo depende solo del oráculo y se prueban ambos
  sentidos, incluida la normalización de expo.
- **S-04:** sound como visibilidad de cobertura si la UI nunca mezcla modos.
- **S-05/C-05:** sound tras el upper bound corregido a `_exitAt`.
- **S-08:** sound en diseño, sujeto a pruebas CEI, refund retenido y
  `nonReentrant` en cada entry point payable.
- **D-1:** sound: no deben existir getters headline que sumen VERIFIED y
  ATTESTED.

## 10b. Cierre de findings (v0.5, 2026-08-12)

| Finding | Cierre | Dónde |
|---|---|---|
| F-01 HIGH | Ventana exit `[lower, _exitAt]` + check explícito `publishTime <= _exitAt` + test de revert | §3.2 |
| F-02 HIGH | Dirección anclada al stop (obligatorio en VERIFIED): `isLong = stop < entry`; target opcional pero estrictamente del lado opuesto o `InvalidDirection()` — validado AL COMMIT. Pseudocódigo §3.2 corregido (el ternario con precedencia quedó eliminado). ATTESTED conserva v1 verbatim | §3.1/§3.2 |
| F-03 MED | `TradeReclassified(old/new result, old/new PnL, reason)` en el challenge | §3.7 |
| F-04 MED | **DECIDIDO: ventana finita** — `challengeWindowSec` snapshoteado (default 7 d, bounds [1, 30] d); pendientes hasta TTL; después FINAL (`isFinal()` view). Challenge eterno rechazado con rationale | §3.4/§2/§3.5 |
| F-05 MED | Trust assumption explícita + registro de implementation slot ERC-1967 en deploy + monitor + `revokePyth` como pausa de VERIFIED (sin tocar el principio r5 de settlement no-pausable; tensión residual documentada) | §3.5/§6.4 |
| F-06 MED | Layout §2 degradado a OBJETIVO/indicativo; congelamiento SOLO tras PoC con `forge inspect` + snapshot ABI/layout en CI; confirmado que exitAt/stopChallenged/challengeDeadline requieren slot nuevo | §2 |

Pendiente de humano (§8): confirmación del universo/bps (1), API key Pyth (2),
M-04 (3), sanity v2.0 (4), challenge+ventana 7d (5), maxExitLag 1h (6).
Con esas respuestas, el spec pasa a implementación en `feat/trackrecord-v2`.
