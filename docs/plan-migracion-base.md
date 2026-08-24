# Plan de migración: Bobby Protocol → Base (Chain 8453) — v2

**Fecha:** 2026-08-10 (v2 tras auditoría de alcance de Codex) · **Ejecutores:** Claude (arquitecto/contratos), Codex (refactor), Kimi (auditoría/QA)
**Decisiones de Anthony:** cutover total de X Layer · **Uniswap v4** nativo en Base (decisión 2026-08-12: todo el rail DEX sobre v4 — PoolManager + Universal Router + V4Quoter; pools **hookless pineados** (`hooks = address(0)`) en v1; hook de attestations = visión fase 2) · USDC (6 dec) · misma treasury, fondear ~0.01 ETH.
**Estimación revisada: 2–3 semanas** (la v1 decía 5–7 días; subestimaba contratos, pagos y droplet).

## Estado por bloque (auditoría v2)
| Bloque | Esfuerzo | Nota |
|---|---|---|
| Frontend / config | Parcial — bajo | chains.ts ya existe; falta adoptarlo y borrar rutas paralelas |
| Backend lectura (stats, heartbeat, tx-history) | Medio | RPC/explorer swap vía chains.ts |
| DEX swap (quote/approve/swap) | Alto | Reescritura real: hoy TODO pasa por OKX DEX Aggregator, incluso `mcp-uniswap-quote.ts` (es un wrapper con nombre engañoso) |
| Pagos MCP/x402 (`xlayer-payments.ts`) | Alto | Denominados en OKB wei (`PREMIUM_MCP_FEE_WEI = 0.001 OKB`); pasar a USDC ERC-20 cambia ABI, decimales (18→6), validación de chainId, contrato receptor |
| Contratos + historial | Muy alto | 7 contratos: TrackRecord, ConvictionOracle, AgentEconomy(V2), AdversarialBounties, AgentRegistry, IntentEscrow, HardnessRegistry. Redeploy = estado cero (reputación, bounties, historial NO migran) |
| Droplet externo | **Bloqueo operativo** | `xlayer-trade.ts` → IP pública `/api/xlayer` con `{action, params}`; sin acceso/soporte Base no hay ejecución real |

## Fase −1 (NUEVA, bloqueante): droplet + decisión de historial
1. **Droplet:** confirmar acceso SSH/repo del servicio; definir endpoint `/api/base` (o genérico con `chain` param). Aprovechar para endurecer: auth por token, allowlist de `action`, rate limit. Sin esto NO se avanza a Fase 2.
2. **Historial X Layer:** se PRESERVA como archivo — páginas de proof, JSON de evidencia, submission pages y filas Supabase chain=196 quedan intactas y marcadas "legacy (X Layer)". El cutover elimina rutas de ejecución, no evidencia.
3. Fondear treasury en Base Sepolia (faucet) y decidir fecha de fondeo mainnet.

## Fase 0 — Unificar configuración (Claude, 1 día)
- `src/config/chains.ts` y `api/_lib/chains.ts` ya existen. Falta: **absorber `api/_lib/protocol-constants.ts`** (hoy tercera fuente de verdad con RPC 196, 6 direcciones de contratos y economía OKB hardcodeadas). Las direcciones de contratos se mueven a `chains.ts` bajo `contracts: {...}` por chain; `protocol-constants.ts` queda como re-export deprecado hasta que Codex migre los consumidores.
- Entregable: **matriz endpoint → contrato → chain → token → proveedor externo** (abajo, completar con grep exhaustivo) como checklist de avance.

## Matriz de dependencias (inicial — checklist viva)
| Endpoint/módulo | Contrato(s) | Token | Proveedor externo | Esfuerzo |
|---|---|---|---|---|
| dex-quote / dex-swap / dex-approve | — | OKB/USDT → ETH/USDC | OKX DEX Aggregator → **Uniswap v4 (V4Quoter + Universal Router, pools hookless)** | Alto |
| xlayer-trade → chain-trade | — | OKB → ETH | **Droplet** `/api/xlayer` | Bloqueante |
| xlayer-record → chain-record | TrackRecord, ConvictionOracle | OKB gas | RPC X Layer → Base | Alto |
| mcp-bobby / mcp-http / premium-signal | — (pagos x402) | OKB wei → USDC (6 dec) | xlayer-payments.ts | Alto |
| agent-confirm / orchestrate / agent-run | ConvictionOracle, IntentEscrow | — | RPC | Medio |
| auto-bounty / reputation / registry | AdversarialBounties, AgentRegistry, AgentEconomyV2 | OKB → USDC/ETH | RPC | Alto |
| deploy-hardness / hardness-registry | HardnessRegistry | — | RPC + Supabase (chain_id 196 en intents/hardness) | Medio |
| protocol-heartbeat / -stats / tx-history | varios (lectura) | — | OKLink → Basescan API | Medio |
| forum-resolve / generate-activity / sandbox-* / telegram-* / smart-money | — (copys/links) | — | — | Bajo |
| Frontend (reown, XLayerSwapCard, SwapConfirm, WalletConnect, AdamsChat…) | — | OKB → ETH/USDC | — | Medio |
| Docs públicas / proof / submission | — | — | — | Preservar como legacy |

## Fase 1 — Contratos (Claude + Kimi, 3–5 días)
- Alcance real: **7 contratos** + scripts Deploy* en `contracts/broadcast/`. Revisar cada uno por supuestos de OKB/18 decimales (AgentEconomy, Bounties, IntentEscrow manejan valor — máxima atención).
- Redeploy = estado cero: se acepta (decisión cutover). El estado histórico queda legible en X Layer y archivado en Supabase; documentar snapshot final (reputaciones, bounties abiertos) antes del apagado.
- 3 rondas de auditoría obligatorias (Claude → Kimi adversarial → Codex diff) **antes** de cada deploy. Sepolia primero, mainnet después.

## Fase 2 — Backend (Codex, 4–6 días)
- DEX: reescritura sobre **Uniswap v4** — V4Quoter para quotes, Universal Router para swaps (viem), PoolKey explícito con `hooks = address(0)` pineado (rechazar cualquier pool con hook en v1). ETH nativo directo (v4 no exige WETH wrap — alinea con fees nativos D-3). `mcp-uniswap-quote.ts` se reescribe de verdad, no se reutiliza.
- Pagos: `xlayer-payments.ts` → `base-payments.ts` (USDC ERC-20: transferencia, validación de `chainId 8453`, 6 decimales, nuevos montos de fee — definir tabla de precios USD).
- Registro: `xlayer-record.ts` → `chain-record.ts` (RPC Base, direcciones nuevas de contratos, mensajes).
- Resto de la matriz vía chains.ts; grep residual `196|xlayer|oklink|OKB` como gate de PR.

## Fase 3 — Frontend (Codex, 2 días)
Como v1: reown sin xlayer (Base default), ChainSwapCard genérico, copys, explorers. Páginas de evidencia X Layer se mueven a sección "Legacy".

## Fase 4 — Supabase (Claude, 1 día)
- Columna/default `chain` → '8453' en tablas de trades, cycles, **intents y hardness** (migraciones 20260412/20260424 referencian 196). Históricos intactos.

## Fase 5 — QA y cutover (Kimi, 2–3 días)
- Auditoría adversarial del diff completo + checklist (decimales, slippage/deadline Uniswap, secretos, links).
- E2E en Sepolia: quote → swap → registro → pago x402 → dashboard.
- Gate final: matriz 100% palomeada + build verde + smoke en preview de Vercel.

## Riesgos (v2)
1. **Migración parcial peligrosa:** UI en Base con pagos/commits aún en X Layer → la matriz es el control; no se mergea con filas a medias.
2. **Decimales 18→6** en toda conversión de montos (swap card, pagos, fees, contratos).
3. **Pérdida de estado on-chain** en redeploy: aceptada, con snapshot documentado.
4. **Pruebas engañosas:** verificar que los quotes vienen del V4Quoter real contra el PoolManager canónico (assert de direcciones en tests), no de un wrapper. Assert adicional: toda PoolKey usada tiene `hooks = address(0)`.
5. **Droplet:** bloqueo hasta confirmar acceso; su refactor incluye endurecimiento de seguridad (auth, allowlist de actions).
6. **Config triplicada:** protocol-constants.ts debe morir; una sola fuente por lado (src/api).
7. Trades reales y deploys los ejecuta Anthony (regla simulation-only del agente).
