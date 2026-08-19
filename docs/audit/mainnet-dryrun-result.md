# Dry-run del deploy mainnet — resultado (2026-08-19)

Corrido: `forge script DeployBase.s.sol --rpc-url base --sender 0x8219…7302`
(SIN --broadcast) contra el estado real de Base mainnet (8453).

## ✅ Resultado: post-deploy assertions ALL PASSED
Con las envs del `mainnet-env-template.md`, el deploy simulado:
- Pasó el **Safe gate** contra el Safe mainnet real (`0x8BE6…53b4`, codehash pineado).
- Pasó el **Pyth gate** (set canónico 8453: UPGRADED + CURRENT).
- Escribió un manifest simulado `8453.json` (DESCARTADO — direcciones ficticias
  del dry-run; el real sale del broadcast).

## 🔑 HALLAZGO — mainnet exige roles económicos DISTINTOS
El primer intento revirtió: **"Mainnet economic roles must be pairwise distinct"**.
En mainnet (8453) el deploy EXIGE que sean 4 direcciones distintas entre sí:

| Rol | Qué recibe |
|---|---|
| `ALPHA_ADDRESS` | fees del agente Alpha Hunter |
| `RED_ADDRESS` | fees del agente Red Team |
| `CIO_ADDRESS` | fees del agente CIO |
| `RESOLVER_ADDRESS` | fees de resolución |

En Sepolia colapsaban al deployer (`0x8219…`); mainnet lo prohíbe
("tres agentes pagando a una wallet no es una economía de tres agentes").

**ACCIÓN DE ANTHONY:** decidir/provisionar 4 wallets distintas para esos roles
antes del broadcast. Pueden ser wallets que ya controles (p.ej. B/C/G + una
cuarta), pero DEBEN ser distintas entre sí. `BOBBY_ADDRESS` (recorder) y
`ARBITER/KEEPER/HARDNESS_SCORER` no entran en ese check de 4, pero conviene que
también sean coherentes.

## Estado del gate readiness tras el dry-run
- Safe mainnet: ✅ existe, pineado, gate pasa
- Pyth mainnet: ✅ canónico, gate pasa
- Deploy assertions: ✅ todas pasan con roles distintos
- FALTA para broadcast: (a) las 4 wallets distintas de roles económicos;
  (b) `BASE_RECORDER_KEY` en el shell del deploy; (c) `BASESCAN_API_KEY` para
  --verify; (d) la firma de Anthony en el broadcast.
