# Estado del Safe canary — hallado vía Safe API (conexión de Codex)

**Fecha del hallazgo:** 2026-08-19 · **Fuente:** Safe Transaction Service
(`api.safe.global/tx-service/basesep`), key provisionada por Codex en
`.env.safe.local`. Sesión de creación: Codex 2026-08-18 17:25.

## El Safe canary EXISTE y pasa el gate

**Dirección:** `0x8BE60853F27b944e11486285d95c3e06596553b4` (Base Sepolia, 84532)

| Campo | Valor | Gate |
|---|---|---|
| threshold | 2 | ✅ ≥2 |
| owners | 3 | ✅ ≥3 |
| modules | `[]` | ✅ cero módulos |
| guard | `0x000…000` | ✅ vacío |
| masterCopy (singleton) | `0x29fcB43b46531BcA003ddC8FCB67FFE91900C762` | ✅ SafeL2 1.4.1+L2 canónico (safe-deployments) |
| safe ≠ deployer | 0x8BE6 ≠ 0x8219 | ✅ |
| version | 1.4.1+L2 | ✅ |

### Los 3 owners (definidos por Codex)
- **Owner B (CIO):** `0x566C9c59D0FF98387BD098e66B7389A43a4D27D7`
- **Owner C (Arbiter):** `0x1ed20CfB49EECdA8969F3bb2B6FB07343d945843`
- **Owner G (Independent Signer):** `0x7b0c9e033fF7bC86c311C6F43F6Ac7D05d4db514`

Ninguno es la deployer EOA (`0x8219…7302`) ni el keeper (`0x01b2…3D2e`) —
separación exigida por D-4 cumplida.

## Qué falta (para cerrar el bloqueante #1 en SEPOLIA)
1. **Pinning:** derivar `OWNER_SAFE_CODEHASH` (codehash on-chain del proxy
   0x8BE6…) y confirmar `OWNER_SAFE_SINGLETON` == masterCopy; setear las 3
   env `OWNER_SAFE_*` que exige `SafeOwnerGate` en el deploy.
2. **Handoff:** transferir ownership de los 7 contratos canary al Safe y que
   el Safe ACEPTE (`acceptOwnership` × 7 vía el batch builder
   `build-safe-launch-batch.mts --action=accept --chain-id=84532`, 2 firmas).

## MAINNET (8453) — pendiente aparte
Este Safe es de ENSAYO en Sepolia. Para mainnet: Codex/Anthony deben decidir
si reusan los mismos 3 owners o generan llaves nuevas (idealmente ≥2 hardware
distintas de las de ensayo), crear el Safe en Base mainnet, y repetir
pinning + handoff. La recorder key de mainnet debe ser ≠ deployer.

## Valores de pinning DERIVADOS (2026-08-19, on-chain)

Listos para las env `OWNER_SAFE_*` del gate en el deploy canary (chain 84532):

```bash
OWNER_SAFE_ADDRESS=0x8BE60853F27b944e11486285d95c3e06596553b4
OWNER_SAFE_CODEHASH=0xd7d408ebcd99b2b70be43e20253d6d92a8ea8fab29bd3be7f55b10032331fb4c
OWNER_SAFE_SINGLETON=0x29fcB43b46531BcA003ddC8FCB67FFE91900C762
```

Verificado: `safe.codehash == keccak256(runtime)`, `slot0 == singleton`, y el
singleton coincide con SafeL2 1.4.1+L2 del registro oficial safe-deployments.
Son valores PÚBLICOS (dirección + codehash), no secretos.
