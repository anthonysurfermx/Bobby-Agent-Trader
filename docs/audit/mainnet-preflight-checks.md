# Pre-flight mainnet — verificaciones on-chain (2026-08-19)

Chequeos hechos ANTES del broadcast para que no sorprendan al firmar. Todos
read-only, sin gas.

## ✅ Set canónico de Pyth (gate hardcodeado, chain 8453)
`PythOracleGate.canonicalPyths(8453)` exige exactamente:
- **index 0 (ACTIVO):** UPGRADED `0xbC16aee60f64864882BC6C4E428e148Fc0E272F5` — verificado on-chain: 177 bytes (proxy ERC1967) ✅
- **index 1 (FALLBACK pre-aprobado):** CURRENT `0x8250f4aF4B972684F7b336503E2D6dFeDeB1487a` — verificado: 680 bytes ✅
- Distintos entre sí, ambos con código → el gate `assertCanonicalPyths` pasa
  (exige ≥2 distintos en mainnet, V-03 recovery real).

Feeds pineados (BTC/ETH/SOL) idénticos a los del canary — mismo Hermes sirve
ambas redes.

## ✅ Safe 2-de-3 (Sepolia canary, patrón para mainnet)
`0x8BE60853F27b944e11486285d95c3e06596553b4` pasa 6/6 del gate (ver
`safe-canary-state.md`). Owners B/C/G aprobados para reusar en mainnet.

## Residual conocido (bajo riesgo)
El PoC probó el parse de un update firmado de Hermes contra la Pyth CURRENT.
Confirmar en el 1er commit VERIFIED del canary mainnet que parsea igual contra
la UPGRADED activa. Riesgo bajo: el mismo Hermes sirve ambas. Si fallara,
activar temporalmente la current (fallback ya aprobado) y reportar.

## Lo que NO se puede pre-verificar sin crear/deployar
- `OWNER_SAFE_CODEHASH` mainnet: se deriva tras crear el Safe 8453 (mismo
  método que el canary — 1 comando).
- `8453.json`: sale del dry-run/broadcast.
