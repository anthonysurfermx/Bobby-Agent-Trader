# Auditoría de seguridad r9 — Smart contracts y despliegue Base

**Fecha:** 2026-08-11
**Branch:** `feat/base-migration`
**Alcance:** todos los contratos propios en `contracts/src/`, scripts de despliegue/verificación Base, configuración Foundry, duplicados compilables y deployment canario Base Sepolia.
**Veredicto:** **NO-GO para Base mainnet**. El canario puede permanecer activo para pruebas, pero no debe presentarse como un track record cuyo win rate sea imposible de manipular.

## Limitación de Trusted Access for Cyber

Se intentó usar el modelo exacto de Trusted Access for Cyber (TAC),
`gpt-5.5-cyber-preview`, tanto por Codex CLI como por Responses API. La cuenta de
ChatGPT reportó que el modelo no está soportado y la API devolvió
`model_not_found`. Por tanto, **esta auditoría no es una ejecución ni una
certificación TAC**. TAC es un marco de acceso gobernado de OpenAI y requiere que
la organización/usuario esté aprobado.

La revisión sí se ejecutó con una defensa en profundidad local:

- revisión manual completa y comparación contra las rondas r1–r8;
- Kimi K3 vía CLI como revisor independiente, read-only;
- Slither sobre el árbol compilable: 134 detectores revisados manualmente;
- Foundry: 125/125 tests existentes con 1,000 fuzz runs;
- 2/2 PoC nuevos que reproducen los hallazgos H-01 y M-01;
- `forge build --sizes`: todos los contratos bajo EIP-170; HardnessRegistry mide
  22,771 bytes y conserva 1,805 bytes de margen;
- verificación read-only del canario: 36/36 checks live pasaron;
- simulación `eth_call` del exploit H-01 sobre el commitment pendiente del
  canario, sin broadcast ni cambio de estado.

## Resumen ejecutivo

Hallazgos nuevos validados: **2 High, 6 Medium y 3 Low**. Además siguen abiertos
varios hallazgos ya documentados; los más importantes son la falta de una fuente
de precio verificable, la auto-resolución de HardnessRegistry, stakes sin salida,
slashing centralizado y una implementación que anuncia ERC-721 sin implementarlo.

Los cinco bloqueantes de mainnet son:

1. El resultado sigue siendo manipulable: `EXPIRED` evita por completo la
   derivación de precio, y el `exitPrice` sigue siendo auto-reportado.
2. El plan D-4 de owner Safe no es ejecutable con el flujo actual; EconomyV2 y
   AgentRegistry no permiten transferir ownership después del deploy.
3. Hay dos `BobbyTrackRecord` compilables con el mismo nombre; el artifact genérico
   actualmente apunta a la copia vieja y vulnerable.
4. HardnessRegistry no está listo para custodiar stake/valor de terceros.
5. Los bounties permiten llenar gratis los slots de challenges y un pause puede
   censurar evidencia mientras el reloj de reclaim sigue corriendo.

## Hallazgos nuevos

### H-01 — High — `resolveTrade(EXPIRED)` lava pérdidas inmediatamente

**Ubicación:** `contracts/src/BobbyTrackRecord.sol:217-308`.

`resolveTrade` sólo rechaza `PENDING`. Para `EXPIRED` exige PnL cero y luego evita
deliberadamente toda la derivación de precio mediante:

```solidity
if (_result != Result.EXPIRED) {
    // price/PnL derivation
}
```

Después de `minResolveAt`, Bobby/owner puede registrar cualquier trade perdedor
como `EXPIRED` con PnL cero, sin esperar los 30 días que sí exige
`expireCommitment`. `getWinRate()` usa únicamente `wins + losses`, por lo que el
registro desaparece del denominador.

**PoC local:** `test_PoC_trackRecordAllowsPrematureExpiredResolution` pasa.
**PoC live read-only:** el canario tiene un commitment pendiente con hash
`0xfd4472c462b2be9348edf61b9e85f695c4e687db293e3c172acae0d5c1f1ce6c`.
Un `eth_call`, enviado como la dirección Bobby y usando `Result.EXPIRED`, terminó
con éxito (`0x`) antes del TTL. No hubo broadcast; `pendingCount` permaneció en 1.

**Impacto:** derrota el control r4 que pretendía hacer el outcome derivable y
permite publicar 100% win rate resolviendo ganadores como WIN y perdedores como
EXPIRED.

**Fix mínimo:** rechazar `Result.EXPIRED` en `resolveTrade`; la única ruta de
expiry debe ser `expireCommitment` después del TTL. Añadir un test negativo.

### H-02 — High — El flujo actual no puede cumplir el owner Safe de D-4

**Ubicación:**

- `BobbyAgentEconomyV2.sol:37`;
- `BobbyAgentRegistry.sol:36`;
- `DeployBase.s.sol:150-182,222-230`;
- `VerifyBaseDeployment.s.sol:108-116`.

EconomyV2 y AgentRegistry usan `immutable owner` y no tienen
`transferOwnership`. El flujo documentado despliega desde el broadcaster y
verifica que los siete owners sean ese deployer. En una red pública, simplemente
usar `--sender <SAFE>` no permite a Forge firmar como un contrato Safe. Los otros
cinco contratos pueden entregarse al Safe después, pero el handoff no está
scripted; para los dos inmutables es imposible después del deploy.

Además, `VerifyBaseDeployment` falla tras un handoff legítimo y pasa precisamente
en el estado EOA-owned que D-4 prohíbe.

**Impacto:** una EOA conservaría permanentemente fees, pause, withdrawal, mint y
stats en dos contratos; los otros cinco dependen de una operación manual no
verificada.

**Fix mínimo:** añadir owner configurable + Ownable2Step a EconomyV2 y
AgentRegistry; desplegar con owner Safe mediante un flujo compatible con Safe o
hacer handoff atómico; verificar contra `EXPECTED_OWNER`, no contra `deployer`.

### M-01 — Medium — `IntentEscrow` puede convertir al keeper en owner

**Ubicación:** `BobbyIntentEscrow.sol:188-195,218-250`.

Constructor y `rotateRole("keeper", ...)` exigen `owner != keeper`, pero
`transferOwnership` y `acceptOwnership` no validan esa separación. El owner puede
proponer al keeper actual y éste aceptar.

**PoC:** `test_PoC_ownershipTransferCanMakeKeeperOwner` pasa y deja
`owner() == keeper()`.

**Impacto:** colapsa un invariante explícito de separación entre administración y
ejecución. Los invariants existentes no lo detectaron porque el handler no fuzzéa
ownership transfer y `invariant_roleSeparationHolds` ni siquiera compara owner con
keeper.

**Fix mínimo:** rechazar `next == keeper` en proposal y acceptance; impedir que
una rotación del keeper choque con `pendingOwner`; ampliar el invariant handler.

### M-02 — Medium — TTL retroactivo en predictions de HardnessRegistry

**Ubicación:** `HardnessRegistry.sol:378-475,735-738`.

`minResolveAt` se snapshottea por prediction, pero el TTL no. Resolve y expire
leen el `predictionTTL` global actual. El owner puede bajarlo a una hora y volver
EXPIRED, retroactivamente, toda prediction pendiente con más de una hora.

**Impacto:** el administrador de un registro público puede censurar outcomes de
agentes terceros; EXPIRED tampoco entra al denominador de win rate.

**Fix mínimo:** guardar `expiresAt` por prediction al commit; los cambios de TTL
sólo deben afectar futuras predictions.

### M-03 — Medium — Los slots de challenges son Sybil-fillable sin costo

**Ubicación:**

- `BobbyAdversarialBounties.submitChallenge:218-253`;
- `HardnessRegistry.submitChallenge:548-569`.

Cada address puede enviar una evidencia, pero no existe bond y el número de
challenges está capado. Un atacante usa 50 direcciones y evidencia basura para
llenar el cap, bloqueando al challenger honesto. El costo es sólo gas.

**Fix mínimo:** challenge bond reembolsable/slasheable, o eliminar el hard cap y
mover la evidencia a eventos/commitments paginados. Snapshottear el cap por
bounty.

### M-04 — Medium — Pause puede censurar challenges mientras avanza el reclaim

**Ubicación:** los dos `submitChallenge` usan `whenNotPaused`; sus funciones de
withdraw no están pausadas y el expiry no descuenta tiempo pausado.

El fix anterior permitió resolver durante pause, pero no cubrió la entrada de
evidencia. Un owner coludido con el poster puede pausar durante el claim window,
impedir challenges y luego permitir que el poster recupere el reward.

**Fix mínimo:** no pausar evidence submission para bounties ya abiertos, o
extender deadlines por la duración pausada. Separar pause de depósitos nuevos y
pause de evidencia/settlement existente.

### M-05 — Medium — Un resolver puede resetear rondas y bloquear el quorum

**Ubicación:** `HardnessRegistry.approveBountyResolution:577-613`.

Proponer un winner diferente incrementa la ronda y pone `approvalCount = 0`. Un
resolver comprometido puede alternar winners e intercalarse entre aprobaciones
honestas hasta el expiry; luego el poster recupera el bounty. Requiere ordenar
transacciones repetidamente, por eso se clasifica Medium y no High.

**Fix mínimo:** tallies independientes por winner y ronda que no borren votos
honestos, o limitar cambios de propuesta por resolver y penalizar flapping.

### M-06 — Medium — El artifact genérico de TrackRecord es la versión vieja

**Ubicación:**

- `contracts/BobbyTrackRecord.sol`;
- `contracts/src/BobbyTrackRecord.sol`;
- `contracts/foundry.toml:2` (`src = "."`).

La copia root carece de la derivación r4 y todavía pausa `resolveTrade`. Foundry
compila ambas con el mismo nombre. `forge inspect BobbyTrackRecord` falla con
“Multiple contracts found”, y el artifact
`out/BobbyTrackRecord.sol/BobbyTrackRecord.json` declara como compilation target
la copia root vieja. `DeployBase` importa explícitamente `src/`, por lo que el
deploy scripted fue el nuevo; verificación o despliegue manual por nombre sigue
siendo ambiguo.

**Fix mínimo:** `src = "src"`; eliminar duplicados root y el flat stale; exigir
paths fully-qualified en create/verify.

### L-01 — Low — TTL sin límites y cast truncable en ConvictionOracle

`publishSignal` convierte `block.timestamp + ttl` a `uint64` sin acotar TTL. Un
TTL enorme puede truncar expiry a un valor pasado o hacer la señal prácticamente
permanente. Sólo Bobby puede provocarlo.

**Fix:** rango de TTL y cast después de validar `<= type(uint64).max`.

### L-02 — Low — Casts silenciosos y quorum 1 por default en DeployBase

Fee/stake env vars se convierten a `uint96` y el threshold a `uint8` antes de
validarlos. Valores sobredimensionados pueden truncarse a un valor válido. En
mainnet, olvidar `RESOLVER_THRESHOLD` produce 1-of-N aunque el runbook exige
2-of-3.

**Fix:** validar como `uint256` antes del cast; en chain 8453 exigir lista
explícita y threshold >= 2.

### L-03 — Low — `updateFees` permite convertir fees a cero

EconomyV2 valida fees no-cero en constructor, pero no en `updateFees`. Un owner
puede habilitar llamadas MCP gratuitas y consumo gratuito de challenge IDs.

**Fix:** reutilizar el mismo guard del constructor.

## Hallazgos documentados que siguen abiertos

| Riesgo | Estado actual |
|---|---|
| Exit price auto-reportado | TrackRecord sólo demuestra coherencia matemática con un `exitPrice` elegido por Bobby; no demuestra el precio de mercado. HardnessRegistry ni siquiera hace esa derivación y permite auto-resolución del agente. |
| Stats de AgentRegistry | `updateStats` sigue aceptando reputación arbitraria sin leer TrackRecord. |
| Hardness score auto-declarado | `publishSignal` guarda el score del caller, sin bound 0–100 ni certificación. |
| Stakes sin salida | No existe unregister/unstake; actualizar metadata exige añadir más stake. |
| Slashing centralizado | Owner/scorer puede slash hasta todo el stake, sin pause, timelock o disputa, y paga al owner. |
| Resolver revocado conserva votos | D-2 sigue sin fix; sólo hay mitigación operativa. |
| Challenger puede quedar sin pago | Si no llega quorum antes del expiry, el poster recupera el bounty aunque haya challenges. |
| Challenge IDs front-runnable | EconomyV2 y HardnessRegistry no atan challenge a payer, service/tool, chain y contrato mediante firma. |
| Grace period puede ser cero | En ambos bounty engines se añadió techo pero no piso. |
| ERC-721 falso | AgentRegistry anuncia ERC-721/ERC-165 pero no implementa transfer/approve; además permite mint a cero e inyección JSON en `tokenURI`. |
| Push payments inmutables | Un Alpha/Red contract que rechace ETH bloquea `payDebateFee` permanentemente. |
| Metadata de chain incorrecta | `tokenURI` todavía dice “on X Layer” para NFTs desplegados en Base. |
| Economy V1 | Sigue compilable aunque DeployBase correctamente no lo despliega. Debe quedar fuera de `src`. |

## Cobertura por contrato

| Contrato | Resultado |
|---|---|
| BobbyTrackRecord | **NO-GO:** H-01 + precio auto-reportado + duplicado vulnerable. |
| BobbyConvictionOracle | Condicional: control de TTL/cooldown y metadata antes de mainnet. |
| BobbyAgentEconomy V1 | **Retirado:** no desplegar; sacar del source production. |
| BobbyAgentEconomyV2 | **NO-GO:** owner inmutable, challenge binding y push recipients. |
| BobbyAgentRegistry | **NO-GO:** owner inmutable, stats arbitrarias y ERC-721 incompleto. |
| BobbyAdversarialBounties | **NO-GO público:** Sybil cap, pause censorship y grace floor. Contabilidad/pull payment correctos. |
| BobbyIntentEscrow | Mejor componente del conjunto; firmas/domain/replay sólidos. Corregir M-01 antes de mainnet. Su PnL sigue siendo attestation según D-1. |
| HardnessRegistry | **NO-GO para terceros:** TTL retroactivo, outcome auto-atestado, stake/slash, rounds y bounty liveness. |
| Counter | Template trivial sin fondos/roles; no desplegar ni incluir en production source. |

## Validaciones que no resultaron en hallazgo

- Los value paths revisados usan CEI/pull-payment donde corresponde; no se
  confirmó reentrancy explotable.
- Resolve y withdraw de bounties comparten `_effectiveExpiry` y usan guards
  complementarios; no hay double payout en el boundary.
- Reverts en `updateResolver` revierten también las escrituras previas.
- La ruta ERC-1271 de IntentEscrow usa `STATICCALL`; las pruebas de reentry,
  malleability, cross-chain y cross-contract pasan.
- El boundary exacto de TrackRecord TTL puede elegir resolve o expire, pero sólo
  una ruta gana por `resolved`; no duplica accounting.
- Los tres “Medium” de Slither fueron falsos positivos: dos comparaciones seguras
  y el local `prev` asignado en toda rama válida de `rotateRole`.

## Orden de remediación

1. Cerrar H-01 y definir honestamente si el precio será oracle-verified o
   “reported by recorder”.
2. Rediseñar owner/deploy para Safe y hacer verificable el estado post-handoff.
3. Limpiar source/artifacts duplicados antes de ejecutar cualquier comando de
   mainnet.
4. Corregir M-01 y ampliar invariants de ownership/role rotation.
5. Corregir TTL snapshot, quorum/votes y lifecycle de stake en HardnessRegistry.
6. Añadir economics anti-Sybil y pause-safe deadlines a ambos bounty engines.
7. Cerrar el backlog documentado y repetir: Slither, 1,000 fuzz runs, invariants,
   dry-run Safe, deploy Sepolia nuevo y verificación bytecode/state.
