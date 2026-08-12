# Runbook — Redeploy canario a Base Sepolia (r10.2)

Luz verde de Codex sobre `193973a` (testnet solamente — NO es aprobación de
mainnet). Contratos: commit auditado r9 → fixes r10/r10.1/r10.2, **152/152
tests** (1,000 fuzz runs). Quórum recomendado: **2-de-3**.

Este es un REDEPLOY COMPLETO: los contratos no son upgradeables y r10 cambió
bytecode (TrackRecord, EconomyV2, AgentRegistry, ConvictionOracle,
IntentEscrow). El deployment anterior de Sepolia (bloque 45364116) queda
obsoleto; sus direcciones NO se reutilizan.

## Direcciones que Anthony debe definir (ninguna vive en el repo)

| Variable | Rol | Restricciones |
|---|---|---|
| `--sender` / wallet firmante | Owner inicial de los 7 contratos | Con ETH de Sepolia (faucet Coinbase/Alchemy). **No puede ser el keeper** |
| `BOBBY_ADDRESS` | Recorder (TrackRecord/Oracle) | Normalmente la wallet del backend (recorder key) |
| `CIO_ADDRESS` | CIO del escrow + economy | Distinta de arbiter/keeper/resolver |
| `ARBITER_ADDRESS` | Árbitro del escrow | Distinta de las otras 3 del escrow |
| `KEEPER_ADDRESS` | Keeper del escrow | Distinta de las otras 3, **del firmante** y de `OWNER_SAFE_ADDRESS` |
| `RESOLVER_ADDRESS` | Resolver único de Bounties + Escrow | Debe estar incluida en la lista de abajo |
| `RESOLVER_ADDRESSES` | Quórum de HardnessRegistry | `0xR1,0xR2,0xR3` — sin ceros ni duplicados; R1 = RESOLVER_ADDRESS |
| `RESOLVER_THRESHOLD` | Umbral del quórum | `2` (2-de-3) |
| `BASESCAN_API_KEY` | Verificación en BaseScan | Export en shell, **nunca** a git |

### Variables de ownership (r10 H-02) — opcionales en Sepolia, OBLIGATORIAS en mainnet

| Variable | Rol | Sepolia | Mainnet (8453) |
|---|---|---|---|
| `OWNER_SAFE_ADDRESS` | Dueño final de los 7 contratos | Opcional (default: firmante, sin handoff) | Obligatoria; ≠ deployer; ≠ keeper |
| `OWNER_SAFE_CODEHASH` | Pin del bytecode del proxy Safe auditado | No aplica | Obligatoria — `cast codehash <safe>` |
| `OWNER_SAFE_SINGLETON` | Pin del singleton (slot 0) | No aplica | Obligatoria — `cast storage <safe> 0`, cotejado contra [safe-global/safe-deployments](https://github.com/safe-global/safe-deployments) |

En mainnet, `SafeOwnerGate` exige además: threshold ≥ 2 sobre ≥ 3 owners, cero
módulos habilitados y guard slot vacío. El handoff se PROPONE en el mismo
broadcast (two-step); el Safe debe aceptar los 7 `acceptOwnership()` (batch en
su UI) y `VerifyBaseDeployment` en 8453 solo pasa con ownership ACEPTADO y
`pendingOwner == 0`.

## Paso 1 — Dry-run real (sin broadcast)

### RPC: usar el endpoint sin rate-limit

El RPC público oficial `sepolia.base.org` (alias `base_sepolia`) limita a
3 req/s y **cuelga el dry-run** durante su ráfaga de view calls. Orden de
preferencia (definidos en `foundry.toml`):

1. **`base_sepolia_publicnode`** ← default del dry-run/verify
   (`https://base-sepolia-rpc.publicnode.com`).
2. `base_sepolia_drpc` — fallback si publicnode falla
   (`https://base-sepolia.drpc.org`).
3. `base_sepolia` — oficial, alternativa secundaria; sirve pero puede
   throttlear en la ráfaga.

```bash
cd contracts && export BASESCAN_API_KEY=... && BOBBY_ADDRESS=0x... CIO_ADDRESS=0x... ARBITER_ADDRESS=0x... KEEPER_ADDRESS=0x... RESOLVER_ADDRESS=0xR1 RESOLVER_ADDRESSES=0xR1,0xR2,0xR3 RESOLVER_THRESHOLD=2 forge script script/DeployBase.s.sol --rpc-url base_sepolia_publicnode --sender 0xFIRMANTE
```

Si `base_sepolia_publicnode` falla, repetir con `--rpc-url base_sepolia_drpc`
(o `base_sepolia` como último recurso).

Éxito = `post-deploy assertions: ALL PASSED` + `manifest written: deployments/84532.json`.
Revisar el manifiesto (roles, fees, quórum, `expectedOwner`). Ojo: su
`deployBlock` es simulado.

> **El dry-run SOBRESCRIBE `deployments/84532.json`** con direcciones
> simuladas. Mientras el broadcast real (Paso 2) no ocurra, restaurar el
> manifest del deployment vigente antes de commitear cualquier cosa:
> `git checkout HEAD -- deployments/84532.json`. Limpiar también
> `broadcast/DeployBase.s.sol/84532/dry-run` y `cache/DeployBase.s.sol`.

## Paso 2 — Broadcast (Anthony firma — SOLO Anthony)

Mismo comando + `--broadcast --verify --interactives 1`, contra el mismo RPC
sin rate-limit. Requiere la keystore/firma del deployer (Wallet A) — el
agente NO ejecuta este paso.

Comando listo (rellenar las 4 direcciones de roles del escrow; el resto son
las del deployment canario vigente):

```bash
cd contracts && export BASESCAN_API_KEY=<tu_key> && \
BOBBY_ADDRESS=0x821990Bda0BAa05F96506fd73ef439D0C2f17302 \
CIO_ADDRESS=0x566C9c59D0FF98387BD098e66B7389A43a4D27D7 \
ARBITER_ADDRESS=0x1ed20CfB49EECdA8969F3bb2B6FB07343d945843 \
KEEPER_ADDRESS=0x01b2a464b6Dc0Dc57Fd912d877a7C05502cf3D2e \
RESOLVER_ADDRESS=0xba1475d05a48C2eE602dd4cDcDA84e724f9b9854 \
RESOLVER_ADDRESSES=0xba1475d05a48C2eE602dd4cDcDA84e724f9b9854,0xf6C939182f0AA4e67D9cc953d12e58b71FAA6F26,0x7b0c9e033fF7bC86c311C6F43F6Ac7D05d4db514 \
RESOLVER_THRESHOLD=2 \
forge script script/DeployBase.s.sol \
  --rpc-url base_sepolia_publicnode \
  --account wallet-a2 --sender 0x821990Bda0BAa05F96506fd73ef439D0C2f17302 \
  --broadcast --verify --interactives 1
```

Notas:
- `--account wallet-a2` es la keystore foundry del deployer (ajustar si el
  nombre difiere). Foundry pedirá la contraseña de forma interactiva.
- Estas direcciones REUTILIZAN los roles del canario anterior; son roles,
  no addresses de contrato — las de contrato serán nuevas (redeploy).
- Tras el broadcast, el manifest `deployments/84532.json` queda con las
  direcciones REALES minadas — ese sí se commitea (reemplaza al viejo).
- El dry-run del agente (contra `base_sepolia_publicnode`) ya dio
  `post-deploy assertions: ALL PASSED`; el broadcast repite el mismo camino
  añadiendo las transacciones firmadas.

## Paso 3 — Verificación de lo minado (Claude)

```bash
cd contracts && forge script script/VerifyBaseDeployment.s.sol --rpc-url base_sepolia_publicnode
```

Éxito = `LIVE VERIFICATION PASSED` (~36+ checks, ahora incluye
owner/pendingOwner contra `expectedOwner` del manifest). Mismo orden de RPC
que el Paso 1 (`base_sepolia_publicnode` → `base_sepolia_drpc` →
`base_sepolia`). Solo entonces:

## Paso 4 — Integración (Claude)

1. Cargar `BASE_SEPOLIA_*_ADDRESS` (7) + `TREASURY_ADDRESS_BASE_SEPOLIA` en
   Vercel desde `deployments/84532.json` — nunca a mano. Son direcciones
   NUEVAS: reemplazar las del deployment anterior en todos los targets
   (prod/dev/preview) donde estén cargadas.
2. Confirmar los 7 contratos verificados en sepolia.basescan.org.
3. Smoke test del API (`/api/bobby-protocol-stats` contra Sepolia).
4. Ciclo canario completo (commit → oracle → fee → resolve WIN/LOSS) y
   dejar el canario corriendo 24–48 h.
5. **Al final**: `PROTOCOL_CHAIN=base-sepolia`.

## No hacer

- No usar direcciones ficticias en el dry-run real.
- No encender `PROTOCOL_CHAIN` antes del Paso 3 en verde.
- No reutilizar estas addresses/params para mainnet sin nueva aprobación.
- No presentar el canario como track record inmanipulable: la decisión
  exitPrice (oracle-verified vs attested) sigue abierta y bloquea ese claim.

## Bloqueantes de mainnet (fuera de este runbook)

M-02–M-05 (HardnessRegistry/bounties), decisión de modelo de confianza de
`exitPrice`, creación + auditoría externa + pinning del Safe 2-de-3 real, y
handoffs ACEPTADOS (no solo propuestos) en los 7 contratos.
