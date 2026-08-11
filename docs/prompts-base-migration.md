# Prompts de delegación — Migración a Base

Contexto compartido: leer `docs/plan-migracion-base.md`. Decisiones: cutover TOTAL
(X Layer se elimina), Uniswap nativo en Base, USDC 6 decimales, misma treasury.
Config central ya creada: `src/config/chains.ts` y `api/_lib/chains.ts`.
Branch de trabajo: `feat/base-migration`. Regla: `npm run build` verde antes de cada commit.

---

## Prompt para Codex (Fases 2–3: refactor backend + frontend)

> Repo: Bobby-Agent-Trader, branch `feat/base-migration`. Lee `docs/plan-migracion-base.md`.
> Tarea: eliminar TODO rastro de X Layer (chain 196, OKB, rpc.xlayer.tech, oklink) y
> migrar a Base usando exclusivamente `src/config/chains.ts` (frontend) y
> `api/_lib/chains.ts` (backend). Nada de hardcodes de chain/token/explorer.
>
> Backend:
> 1. `api/dex-quote.ts`, `api/dex-swap.ts`, `api/dex-approve.ts`: reescribir sobre
>    Uniswap en Base — quotes con QuoterV2 (`UNISWAP_BASE.quoterV2`, viem readContract),
>    swaps con Universal Router. Partir de `api/_lib/mcp-uniswap-quote.ts` si sirve.
> 2. Renombrar `api/xlayer-trade.ts` → `api/chain-trade.ts` y `api/xlayer-record.ts` →
>    `api/chain-record.ts`; parametrizar chain; el droplet externo aún expone `/api/xlayer`,
>    dejar la URL en env `DROPLET_TRADE_PATH` con TODO comentado.
> 3. Grep `196|xlayer|oklink|OKB` en `api/` — migrar cada hit a `getChain()`/constantes.
>    OJO decimales: OKB era 18, USDC es 6 — revisar toda conversión de amounts.
> 4. Actualizar imports en App.tsx/rutas si cambian nombres de endpoints.
>
> Frontend:
> 5. `src/config/reown.ts`: quitar el objeto xlayer, dejar `[base, mainnet, polygon, arbitrum, optimism]`.
> 6. `XLayerSwapCard.tsx` → `ChainSwapCard.tsx` genérico (tokens/explorer de chains.ts,
>    ETH/USDC, chainId 8453). Actualizar `SwapConfirm`, `WalletConnect`, `ExecutionTimeline`,
>    `DisclaimerBanner` y copys de `AdamsChat` (OKB → ETH/USDC, X Layer → Base).
> 7. Links de explorer vía `txUrl()`/`addressUrl()` de chains.ts.
> No commitear secretos; env nuevas: BASE_RPC_URL, BASESCAN_API_KEY, TREASURY_ADDRESS_BASE.

### Adición: re-branding Base (Codex, después del refactor funcional)
> Rebrand visual inspirado en okx.ai (minimal, mucho aire, tipografía grande) con la
> paleta de base.org: azul Base #0052FF como acento único. Los tokens YA están migrados
> en `src/index.css` (`--primary`, `--base-blue`, gradientes y sombras) y tailwind expone
> `base-blue`. Tu tarea es el sweep mecánico: reemplazar clases hardcodeadas
> `green-400/emerald-*/text-green-*` por `primary`/`base-blue` en todos los componentes
> (KineticShell, hero, tickers, charts de Recharts con verde hardcodeado #00FF88 → #0052FF).
> Mantener ámbar=warning y rojo=error. No tocar semántica de PnL positivo/negativo
> (ganancia puede seguir verde en números — decisión: ganancia verde, UI/marca azul).

### Adición: conectar el ejecutor Fly.io (Codex)
> El droplet de Digital Ocean ya no existe. El nuevo servicio vive en `services/executor/`
> (Express + viem, Base 8453, Bearer auth, allowlist). `api/chain-trade.ts` debe apuntar a
> `${EXECUTOR_URL}/api/base` con `Authorization: Bearer ${EXECUTOR_TOKEN}` (env de Vercel).
> Anthony lo deploya con `fly deploy` (ver services/executor/README.md).

---

## Prompt para Kimi (Fase 1 ronda 2 + Fase 5: auditoría y QA)

> Repo: Bobby-Agent-Trader, branch `feat/base-migration`. Lee `docs/plan-migracion-base.md`.
> Rol: auditor adversarial. NO escribas features; solo reportes y tests.
>
> 1. Auditoría de contratos (ronda 2 de 3): revisar `contracts/BobbyConvictionOracle.sol`
>    y `contracts/BobbyTrackRecord.sol` antes del deploy a Base — reentrancy, access
>    control, supuestos de chain/token (18 vs 6 decimales), eventos. Reporte en
>    `docs/audit-base-r2.md` con severidades.
> 2. QA del diff completo de la migración: grep residual de `196|xlayer|oklink|OKB`,
>    conversiones de decimales (USDC=6), URLs de explorer, secretos filtrados,
>    slippage/deadline en los swaps de Uniswap.
> 3. Checklist de cutover en `docs/cutover-checklist.md`: env vars en Vercel, fondeo
>    de treasury (0.01 ETH), deploy Sepolia → mainnet, smoke test E2E
>    (quote → swap → registro → dashboard).

---

## Reservado para Claude
Chain-config (hecho), deploy scripts Foundry para Base, migración Supabase
(columna `chain`, default '8453'), rondas de auditoría 1 y 3, integración final y PR.
