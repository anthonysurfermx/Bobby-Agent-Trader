# Runbook — Deploy canario a Base Sepolia

Luz verde de Codex (testnet solamente — NO es aprobación de mainnet).
Contratos: commit auditado r4–r8, 125/125 tests. Quórum recomendado: **2-de-3**.

## Direcciones que Anthony debe definir (ninguna vive en el repo)

| Variable | Rol | Restricciones |
|---|---|---|
| `--sender` / wallet firmante | Owner de los 7 contratos | Con ETH de Sepolia (faucet Coinbase/Alchemy). **No puede ser el keeper** |
| `BOBBY_ADDRESS` | Recorder (TrackRecord/Oracle) | Normalmente la wallet del backend (recorder key) |
| `CIO_ADDRESS` | CIO del escrow + economy | Distinta de arbiter/keeper/resolver |
| `ARBITER_ADDRESS` | Árbitro del escrow | Distinta de las otras 3 del escrow |
| `KEEPER_ADDRESS` | Keeper del escrow | Distinta de las otras 3 **y del firmante** |
| `RESOLVER_ADDRESS` | Resolver único de Bounties + Escrow | Debe estar incluida en la lista de abajo |
| `RESOLVER_ADDRESSES` | Quórum de HardnessRegistry | `0xR1,0xR2,0xR3` — sin ceros ni duplicados; R1 = RESOLVER_ADDRESS |
| `RESOLVER_THRESHOLD` | Umbral del quórum | `2` (2-de-3) |
| `BASESCAN_API_KEY` | Verificación en BaseScan | Export en shell, **nunca** a git |

## Paso 1 — Dry-run real (sin broadcast)

```bash
cd contracts && export BASESCAN_API_KEY=... && BOBBY_ADDRESS=0x... CIO_ADDRESS=0x... ARBITER_ADDRESS=0x... KEEPER_ADDRESS=0x... RESOLVER_ADDRESS=0xR1 RESOLVER_ADDRESSES=0xR1,0xR2,0xR3 RESOLVER_THRESHOLD=2 forge script script/DeployBase.s.sol --rpc-url base_sepolia --sender 0xFIRMANTE
```

Éxito = `post-deploy assertions: ALL PASSED` + `manifest written: deployments/84532.json`.
Revisar el manifiesto (roles, fees, quórum). Ojo: su `deployBlock` es simulado.

## Paso 2 — Broadcast (Anthony firma)

Mismo comando + `--broadcast --verify --interactives 1`.

## Paso 3 — Verificación de lo minado (Claude)

```bash
cd contracts && forge script script/VerifyBaseDeployment.s.sol --rpc-url base_sepolia
```

Éxito = `LIVE VERIFICATION PASSED - checks: ~35`. Solo entonces:

## Paso 4 — Integración (Claude)

1. Cargar `BASE_SEPOLIA_*_ADDRESS` (7) + `TREASURY_ADDRESS_BASE_SEPOLIA` en Vercel
   desde `deployments/84532.json` — nunca a mano.
2. Confirmar los 7 contratos verificados en sepolia.basescan.org.
3. Smoke test del API (`/api/bobby-protocol-stats` contra Sepolia).
4. **Al final**: `PROTOCOL_CHAIN=base-sepolia`.

## No hacer

- No usar direcciones ficticias en el dry-run real.
- No encender `PROTOCOL_CHAIN` antes del Paso 3 en verde.
- No reutilizar estas addresses/params para mainnet sin nueva aprobación.
