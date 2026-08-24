# Runbook — Creación, auditoría y pinning del Safe 2-de-3 (D-4)

**Fecha:** 2026-08-12 · **Estado:** DISEÑO OPERATIVO — ejecutar antes de la ronda mainnet
**Produce:** las 3 variables que `SafeOwnerGate` exige en chain 8453
(`OWNER_SAFE_ADDRESS`, `OWNER_SAFE_CODEHASH`, `OWNER_SAFE_SINGLETON`) con el
Safe real creado, auditado y pineado. Complementa `sepolia-runbook.md` (que ya
documenta el gate); este runbook cubre lo que pasa ANTES: crear y auditar el Safe.

## 0. Qué exige el gate (recordatorio — `script/SafeOwnerGate.sol`)

1. `safe != deployer` EOA.
2. `codehash(safe)` == `OWNER_SAFE_CODEHASH` pineado (byte-idéntico al proxy auditado).
3. Storage slot 0 == `OWNER_SAFE_SINGLETON` pineado, con código, cotejado
   contra el registro oficial safe-global/safe-deployments.
4. `getThreshold() >= 2` y `getOwners().length >= 3`.
5. **Cero módulos** habilitados (sin `execTransactionFromModule` que brinque el quórum).
6. **Guard slot vacío** (semántica de ejecución vanilla).

## 1. Decisiones previas de Anthony (ninguna vive en el repo)

| Decisión | Restricciones |
|---|---|
| **Signer 1, 2, 3** | 3 llaves INDEPENDIENTES (idealmente ≥2 hardware wallets). Ninguna puede ser: la deployer EOA (Wallet A `0x8219…7302`), el keeper (`0x01b2…3D2e`), ni la recorder key del backend. Separación física/dispositivo real: 2 llaves en el mismo password manager = 1 llave |
| **Threshold** | `2` (2-de-3, política D-4) |
| Custodia | Dónde vive cada seed (papel/metal, ubicaciones distintas). Simulacro de pérdida: con 2 llaves vivas se opera y se puede rotar la tercera (`swapOwner` con 2 firmas) |

## 2. Referencias canónicas (verificadas contra safe-global/safe-deployments, 2026-08-12)

Safe **v1.4.1 L2** — misma dirección canónica en Base mainnet (8453) y Base
Sepolia (84532):

| Contrato | Dirección canónica | codeHash del registro |
|---|---|---|
| `SafeL2` (singleton) | `0x29fcB43b46531BcA003ddC8FCB67FFE91900C762` | `0xb1f926978a0f44a2c0ec8fe822418ae969bd8c3f18d61e5103100339894f81ff` |
| `SafeProxyFactory` | `0x4e1DCf7AD4e460CfD30791CCC4F9c8a4f820ec67` | `0x50c3cdc4074750a7a974204a716c999edd37482f907608d960b2b025ee0b3317` |

> ⚠️ La UI oficial puede desplegar una versión más nueva (1.5.x). No es un
> problema: el procedimiento pinea LO QUE RESULTÓ, exigiendo que su singleton
> exista en safe-deployments para esa versión exacta. Lo prohibido es un
> singleton que NO aparezca en el registro oficial.

## 3. Creación (recomendado: UI oficial)

1. En `app.safe.global` → Create Safe → red **Base** (para el ensayo: Base
   Sepolia). Cargar los 3 owners, threshold **2**. Sin módulos, sin guard,
   sin apps — vanilla.
2. Anotar la dirección del Safe minado: será `OWNER_SAFE_ADDRESS`.
3. **Tx de humo**: enviar ~$5 de ETH al Safe y sacarlos con 2 firmas (las 3
   llaves participan en al menos una firma cada una a lo largo del proceso —
   prueba de que las 3 funcionan de verdad).

Alternativa controlada por CLI (si la UI despliega una versión no deseada):
`createProxyWithNonce` directo contra la factory v1.4.1 con initializer
`setup(owners, 2, 0, 0x, fallbackHandler, 0, 0, 0)` — solo si hace falta;
la UI es el camino simple y battle-tested.

## 4. Auditoría del Safe creado (checklist — TODO debe pasar)

Con `SAFE=0x...` recién creado (RPC de la chain que toque):

```bash
# 4.1 codehash del proxy → OWNER_SAFE_CODEHASH
cast codehash $SAFE --rpc-url base

# 4.2 singleton (slot 0) → OWNER_SAFE_SINGLETON
cast storage $SAFE 0 --rpc-url base
# → los últimos 20 bytes deben ser una dirección que EXISTE en
#   https://github.com/safe-global/safe-deployments/tree/main/src/assets
#   para la versión desplegada (v1.4.1 L2 = 0x29fcB4…C762). Si no aparece: ABORTAR.

# 4.3 política D-4
cast call $SAFE "getThreshold()(uint256)" --rpc-url base        # == 2
cast call $SAFE "getOwners()(address[])" --rpc-url base         # exactamente los 3 signers elegidos

# 4.4 sin módulos
cast call $SAFE "getModulesPaginated(address,uint256)(address[],address)" 0x0000000000000000000000000000000000000001 10 --rpc-url base
# → array vacío

# 4.5 guard slot vacío (GuardManager.GUARD_STORAGE_SLOT)
cast storage $SAFE 0x4a204f620c8c5ccdca3fd54d003badd85ba500436a431f0cbda4f558c93c34c8 --rpc-url base
# → 0x000...000

# 4.6 fallback handler (slot keccak("fallback_manager.handler.address"))
cast storage $SAFE 0x6c9a6c4a39284e37ed1cf53d337577d14212a4870fb976a4366c693b939918d5 --rpc-url base
# → debe ser la CompatibilityFallbackHandler CANÓNICA de la versión (cotejar en
#   safe-deployments) o cero. Cualquier otra dirección: ABORTAR.
```

> Nota para la ronda: el gate on-chain NO valida el fallback handler (4.6) —
> se cubre aquí como check manual. Candidato a añadirse a `SafeOwnerGate` en
> la ronda v2 de scripts (decisión para Codex/Kimi en review).

Verificación cruzada de 4.1: el codehash del proxy debe coincidir con el de
cualquier otro Safe de la misma versión en la misma chain (muestrear 1–2 Safes
conocidos) — un proxy v1.4.1 es byte-idéntico entre despliegues.

## 5. Pinning → variables de entorno del deploy

```bash
export OWNER_SAFE_ADDRESS=0x...   # §3.2
export OWNER_SAFE_CODEHASH=0x...  # §4.1
export OWNER_SAFE_SINGLETON=0x... # §4.2 (dirección, no el slot crudo)
```

Estos valores son **hechos públicos on-chain** (no secretos): se documentan en
el manifest del deploy (`DeployBase` los escribe) y en este runbook una vez
ejecutado. Lo que NUNCA se documenta: seeds/llaves de los signers.

## 6. Ensayo completo en Sepolia (obligatorio antes de mainnet)

`OWNER_SAFE_*` es opcional en 84532 — usarlo igualmente para ensayar el flujo
ENTERO una vez:

1. Crear un Safe espejo en Base Sepolia (mismos 3 signers o de prueba, threshold 2).
2. Auditar (§4) y pinear (§5) el espejo.
3. Redeploy canario CON `OWNER_SAFE_*` seteado → el broadcast propone el
   handoff (two-step) en los 7 contratos.
4. **Aceptar los 7 `acceptOwnership()` desde el Safe** — Transaction Builder
   de la UI en batch, 2 firmas.
5. `VerifyBaseDeployment` en verde con ownership ACEPTADO y `pendingOwner == 0`.

Éxito del ensayo = el equipo ya ejecutó una vez, en testnet, exactamente lo
que hará en mainnet (incluida la coordinación de 2 firmas para el batch).

## 7. Mainnet (cuando la ronda v2 esté auditada — fuera de este runbook)

Mismo flujo con el Safe real de 8453: deploy con `OWNER_SAFE_*` obligatorio →
aceptación batch de los 7 → verify. Recordatorio del runbook de Sepolia: en
8453 el verify SOLO pasa con ownership aceptado.

## No hacer

- No usar como signer la deployer EOA, el keeper ni la recorder key.
- No habilitar módulos, guard ni fallback handler no-canónico — el gate (y
  este checklist) lo rechazan.
- No crear el Safe "al momento" el día del deploy mainnet: crearlo, auditarlo
  y DEJARLO REPOSAR operando el ensayo de Sepolia primero.
- No commitear jamás material de llaves; los pins públicos sí se documentan.
