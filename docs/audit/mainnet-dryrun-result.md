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

---

## Dry-run FINAL (2026-08-21, tag mainnet-launch-candidate) — evidencia actualizada
Config final: deployer `0xC3F8` (nonce 37) SEPARADO del recorder dedicado
`0xDf47…F4EC`, escrow `1e22`, writes=false, freeze en guard común.

```
post-deploy assertions: ALL PASSED
gas estimado: 21,485,058
ETH estimado: 0.000236335638
deployer balance: 0.001838343987414312 ETH   (8x el costo del deploy)
deployer nonce: 37
```

Re-validado por Codex desde checkout limpio del tag: contratos byte-idénticos
a 11532f4, runtime TrackRecord 24,094 B, artefacto codehash
`0xac1b415cc015dd11303badef17ae7962d5c84e4056795c0638be3c014f6f6319`.
Suites: protocol-write-safety, API security 26/26, record-auth — pasan.

## P0 operativo pendiente (Codex re-review 2): gas del handoff
Safe y owners B/C/G con 0 ETH en Base → nadie puede ejecutar los 7
`acceptOwnership`. Fondear (desde wallet ≠ deployer para no cambiar nonce 37):
Owner B ~0.001, Owner C ~0.001 (redundancia), Recorder 0xDf47 ~0.001.
El batch Safe real se genera DESPUÉS del broadcast desde el manifest finalizado
(runbook paso 68), no antes.

## Dry-run a nonce 38 (2026-08-21, post re-fondeo) — direcciones predichas
El deployer 0xC3F8 pasó a nonce 38 (fondeó a Owner B desde sí mismo por error,
luego re-fondeado desde wallet externa). Nuevo dry-run = ALL PASSED. Direcciones
predichas a nonce 38 (se materializan en el broadcast; el manifest real sale de ahí):
```
trackRecord        0x822DB0DbbCAB398e610fcBA86DA9BB92d2493321
convictionOracle   0x27f51D711171c830dd796D4B03914a8C6c46D75e
agentEconomyV2     0x009de59e0e7f4109fF9E89E744A4412082AD2aaF
adversarialBounties 0x73fD6c77ff0403Ea071e8721c76f88cE34ac9968
hardnessRegistry   0x15800F40b8988765AD3F46030B73bC8109A793f5
agentRegistry      0xB3137D7afE26fbdBcAA95573C7A20be896efde93
intentEscrow       0x5D9d534419421B7Edfe9Bb509E4c48512256BC97
```
gas estimado 21,485,058 · gas price 0.0102 gwei · deployer nonce 38, balance 0.0015 ETH (6x el costo).
NOTA: cualquier tx nueva desde 0xC3F8 antes del broadcast vuelve a shiftear estas direcciones.
