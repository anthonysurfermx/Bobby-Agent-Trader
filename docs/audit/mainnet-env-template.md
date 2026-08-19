# Plantilla de env — Base mainnet (8453) cutover

Estado 2026-08-19. Llené todo lo PÚBLICO/derivable (fees reusados del canary,
los 3 owners B/C/G que Anthony aprobó reusar, flags de chain, quórum resolver).
Lo que queda son `<FILL>`: sale de crear el Safe mainnet, generar la recorder
key nueva, y el deploy. Los secretos van en Vercel (Production), NUNCA a git.

```bash
# --- Chain / cutover flags -------------------------------------------------
PROTOCOL_CHAIN=base
PROTOCOL_WRITE_CHAIN_ID=8453
PROTOCOL_WRITES_ENABLED=true
PROTOCOL_CUTOVER_FREEZE=true          # se mantiene true hasta que pase el canario mainnet
VERCEL_ENV=production
BASE_RPC_URL=<FILL: RPC de Base mainnet con buen rate limit>

# --- Safe 2-de-3 (owners REUSADOS del canary, aprobado por Anthony) --------
OWNER_SAFE_OWNERS=0x566C9c59D0FF98387BD098e66B7389A43a4D27D7,0x1ed20CfB49EECdA8969F3bb2B6FB07343d945843,0x7b0c9e033fF7bC86c311C6F43F6Ac7D05d4db514
OWNER_SAFE_ADDRESS=<FILL: dirección del Safe mainnet tras crearlo>
OWNER_SAFE_SINGLETON=0x29fcB43b46531BcA003ddC8FCB67FFE91900C762   # SafeL2 1.4.1 canónico (igual en 8453)
OWNER_SAFE_CODEHASH=<FILL: derivar del proxy mainnet — mismo método que canary si es 1.4.1>

# --- Roles económicos ------------------------------------------------------
DEPLOYER_ADDRESS=<FILL: EOA que firma el broadcast (Wallet A). NO debe ser owner del Safe>
BASE_RECORDER_ADDRESS=<FILL: dirección de la recorder key NUEVA de mainnet>
BOBBY_ADDRESS=<FILL: = BASE_RECORDER_ADDRESS (el que comitea)>
BASE_RECORDER_KEY=<FILL EN VERCEL: recorder key NUEVA, ≠ deployer (hallazgo Kimi)>
ALPHA_ADDRESS=0x566C9c59D0FF98387BD098e66B7389A43a4D27D7      # reusa owner B (o define aparte)
RED_ADDRESS=0x1ed20CfB49EECdA8969F3bb2B6FB07343d945843        # reusa owner C
CIO_ADDRESS=0x566C9c59D0FF98387BD098e66B7389A43a4D27D7
ARBITER_ADDRESS=0x1ed20CfB49EECdA8969F3bb2B6FB07343d945843
KEEPER_ADDRESS=<FILL: keeper mainnet, ≠ deployer y ≠ recorder>
RESOLVER_ADDRESS=0xba1475d05a48C2eE602dd4cDcDA84e724f9b9854
HARDNESS_SCORER_ADDRESS=<FILL: scorer mainnet>

# --- Quórum HardnessRegistry (reusado del canary) --------------------------
RESOLVER_ADDRESSES=0xba1475d05a48C2eE602dd4cDcDA84e724f9b9854,0xf6C939182f0AA4e67D9cc953d12e58b71FAA6F26,0x7b0c9e033fF7bC86c311C6F43F6Ac7D05d4db514
RESOLVER_THRESHOLD=2

# --- Fee params (REUSADOS del canary 84532.json, auditados) ----------------
FEE_MCP_CALL_WEI=25000000000000
FEE_DEBATE_PER_AGENT_WEI=2500000000000
MIN_BOUNTY_WEI=25000000000000
ABSOLUTE_MIN_BOUNTY_WEI=2500000000000
REGISTRATION_STAKE_WEI=250000000000000
BASE_HARDNESS_SERVICE_PRICE_WEI=<FILL: precio del servicio hardness en wei>
ESCROW_MAX_SIZE_USD=10000                    # 10,000 USD (18dp: 1e22)
TREASURY_ADDRESS_BASE=<FILL: treasury mainnet (puede ser el Safe)>

# --- Secretos (SOLO en Vercel Production) ----------------------------------
PYTH_HERMES_API_KEY=<ya en Vercel Production>
XLAYER_RECORD_SECRET=<FILL EN VERCEL>
TRADING_API_SECRET=<FILL EN VERCEL>
PROTOCOL_AUTOMATION_SECRET=<FILL EN VERCEL>
```

## Orden de operaciones para cerrar el readiness

1. **Crear el Safe mainnet** (owners B/C/G, threshold 2, Base mainnet) →
   llena `OWNER_SAFE_ADDRESS`. Derivar codehash on-chain → `OWNER_SAFE_CODEHASH`.
2. **Generar la recorder key nueva** de mainnet → `BASE_RECORDER_*` (≠ deployer).
3. **Dry-run del deploy** (`DeployBase.s.sol` sin `--broadcast`) → produce
   `contracts/deployments/8453.json` simulado; restaurar tras revisar.
4. **Broadcast** (Anthony firma) → 8453.json real con las 7 direcciones minadas.
5. **Handoff**: transferOwnership de los 7 al Safe + accept 2-de-3 (batch builder).
6. **Canario mainnet** + soak, con `PROTOCOL_CUTOVER_FREEZE=true` hasta que pase.
7. Re-correr `check-mainnet-readiness.mts` hasta PASS.

## Lo que YO ya dejé listo
- Owners y quórum resueltos (arriba). Fees decididos. Flags decididos.
- Pinning del método probado en el canary (`safe-canary-state.md`).
- Batch de handoff y runbook (`safe-canary-handoff-runbook.md`) — mismo patrón para mainnet.
