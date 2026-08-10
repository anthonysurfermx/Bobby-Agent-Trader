# Plan de migración: Bobby Protocol → Base (Chain 8453)

**Fecha:** 2026-08-10 · **Ejecutores:** Claude (arquitecto/contratos), Codex (refactor mecánico), Kimi (auditoría/QA)
**Estado actual:** todo amarrado a OKX X Layer (chain 196, OKB nativo, OKLink, OKX DEX API).

## Decisiones tomadas (Anthony, 2026-08-10)
1. **Cutover total:** se elimina X Layer por completo (código, UI, copys). Históricos en Supabase quedan con chain=196 como registro.
2. **Tesorería:** misma wallet 0x09a8...cdcea en Base; Anthony la fondea con ~0.01 ETH (ver sección Gas).
3. **DEX:** **Uniswap nativo en Base** (Universal Router / v3-v4 pools). Se elimina la dependencia de OKX DEX API para ejecución; quotes vía Uniswap Quoter o el MCP existente (`api/_lib/mcp-uniswap-quote.ts` ya existe como base).
4. **Stablecoin canónica:** USDC nativo en Base `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` (6 decimales).

## Gas en Base
Base es L2 con fees típicos < $0.01 por tx. Presupuesto: deploy de 2 contratos ≈ $0.50–2 total; cada swap/registro on-chain ≈ $0.01–0.05. **Con 0.005 ETH alcanza para deploys + cientos de tx; 0.01 ETH da margen cómodo para meses.** Para Base Sepolia el ETH es gratis (faucet de Coinbase/Alchemy).

## Constantes nuevas
| | X Layer (actual) | Base (nuevo) |
|---|---|---|
| Chain ID | 196 | 8453 |
| Gas nativo | OKB | ETH |
| Stable | USDT 0x1E4a...D41d | USDC 0x8335...2913 |
| RPC | rpc.xlayer.tech | mainnet.base.org (o Alchemy/QuickNode) |
| Explorer | oklink.com/xlayer | basescan.org |

## Fases

### Fase 0 — Inventario y chain-config central (Claude, ~medio día)
- Crear `src/config/chains.ts` + `api/_lib/chains.ts`: un solo objeto `CHAINS = { base: {...}, xlayer: {...} }` con id, rpc, explorer, tokens, treasury. TODO el código consume de ahí — se elimina el hardcode de "196" regado en ~30 archivos (regla no-hardcode del repo).
- Inventario exacto de archivos afectados (grep ya hecho: api/agent-run, orchestrate, dex-*, xlayer-trade, xlayer-record, protocol-*, mcp-*, forum-resolve, etc.).

### Fase 1 — Contratos (Claude + Kimi, 1–2 días)
- Redeploy de `BobbyConvictionOracle` y `BobbyTrackRecord` en Base vía Foundry (`foundry.toml`: agregar perfil base + Basescan verify).
- **Regla obligatoria: 3 rondas de auditoría antes de cualquier deploy** (Claude ronda 1, Kimi ronda 2 adversarial, Codex ronda 3 de diffs vs. versión desplegada en X Layer).
- Primero deploy a **Base Sepolia** (84532), pruebas, luego mainnet.
- Guardar addresses nuevas en `chains.ts` y `contracts/README.md`.

### Fase 2 — Backend API (Codex, 2–3 días)
- `dex-quote/dex-swap/dex-approve`: reescribir sobre **Uniswap en Base** — quotes con QuoterV2 / `mcp-uniswap-quote.ts`, calldata de swap vía Universal Router; eliminar llamadas a OKX DEX API.
- `xlayer-trade.ts` / `xlayer-record.ts` → renombrar a `chain-trade.ts` / `chain-record.ts` con parámetro de chain; el droplet externo necesita endpoint `/api/base` o genérico (coordinar: el droplet NO está en este repo).
- `protocol-heartbeat`, `protocol-tx-history`, `bobby-protocol-stats`, `reputation`, `registry`, `agent-confirm`: leer de Basescan API / RPC de Base en vez de OKLink.
- Env vars nuevas en Vercel: `BASE_RPC_URL`, `BASESCAN_API_KEY`, `TREASURY_ADDRESS_BASE`.

### Fase 3 — Frontend (Codex, 1–2 días)
- `reown.ts`: Base ya está en networks → moverlo a primera posición (default).
- `XLayerSwapCard` → `ChainSwapCard` genérico (tokens/explorer desde `chains.ts`); actualizar `SwapConfirm`, `WalletConnect`, `ExecutionTimeline`, `DisclaimerBanner`, copys de AdamsChat (OKB → ETH/USDC).
- Links de explorer → basescan.

### Fase 4 — Datos y Supabase (Claude, medio día)
- Columnas `chain` en agent_trades/agent_cycles: default '8453' para registros nuevos; NO tocar históricos (quedan como 196).
- Migración idempotente vía MCP Supabase.

### Fase 5 — QA y cutover (Kimi lidera, 1 día)
- Kimi: auditoría de seguridad del diff completo + checklist (ningún hardcode 196 residual, ningún secret, explorer links, decimales USDC=6 vs USDT X Layer).
- Pruebas E2E en Base Sepolia: quote → swap simulado → registro on-chain → dashboard.
- `npm run build` + deploy preview en Vercel → smoke test → merge a main.

## Reparto resumido
- **Claude:** chain-config, contratos, migración Supabase, revisión final e integración.
- **Codex:** refactor mecánico backend + frontend (Fases 2–3), branch `feat/base-migration`.
- **Kimi:** rondas de auditoría de contratos, QA adversarial, docs/checklist de cutover.

## Riesgos
- **Droplet externo** (`DROPLET_URL/api/xlayer`) fuera del repo — sin él no hay ejecución real; coordinar primero.
- **Elegibilidad hackathon OKX:** decidido cutover total — se asume que la fase de hackathon ya concluyó.
- **Decimales:** USDC en Base = 6 decimales (el código actual asume 18 de OKB en varios puntos, ej. XLayerSwapCard línea 48).
- Trades on-chain reales siguen fuera del alcance del agente (regla simulation-only): deploys y fondeo los ejecuta Anthony.
