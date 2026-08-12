# Comparativa Pyth vs Chainlink en Base — números reales

**Fecha:** 2026-08-12 · **Complementa:** `exitprice-oracle-decision.md` (sección 7.2)
**Método:** todas las direcciones y parámetros verificados **on-chain contra Base
mainnet** vía `cast` (RPC mainnet.base.org) el 2026-08-12; parámetros de
heartbeat/deviation del reference-data-directory oficial de Chainlink; términos
de API de docs.pyth.network. Nada citado de memoria.

## 1. Cobertura de feeds en Base mainnet (chain 8453)

| Símbolo Bobby | Chainlink Base | Pyth Base | Nota |
|---|---|---|---|
| BTC | ✅ `0x64c911996D3c6aC71f9b455B1E8E7266BcbD848F` — heartbeat 1200 s, deviation 0.1% | ✅ feed `0xe62d…5b43`, precio vivo verificado | ambos sólidos |
| ETH | ✅ `0x71041dddad3595F9CEd3DcCFBe3D1F4b0a16Bb70` — 1200 s, 0.15% | ✅ `0xff61…0ace`, vivo | ambos sólidos |
| SOL | ⚠️ `0x975043adBb80fc32276CbF9Bbcfd4A601a12462D` — **heartbeat 86400 s (24 h), deviation 0.5%** | ✅ `0xef0d…b56d`, vivo | **diferenciador — ver §3** |
| XAUT (proxy XAU) | ✅ XAU/USD `0x5213eBB69743b85644dbB6E25cdF994aFBb8cF31` — 86400 s, 0.5% | ✅ XAU/USD `0x765d…4bb2` (estado on-chain viejo ~32 d — irrelevante en flujo pull, ver §2) | basis XAUT-vs-XAU a documentar si se usa |
| PAXG | ❌ | ❌ (usaría XAU como proxy) | ATTESTED |
| OKB | ❌ | ❌ | ATTESTED |

Contratos Pyth en Base (ambos con código verificado):
- Actual: `0x8250f4aF4B972684F7b336503E2D6dFeDeB1487a`
- Post-upgrade (programa 2026-08-18): `0xbC16aee60f64864882BC6C4E428e148Fc0E272F5`
  → el diseño v2 necesita poder rotar la dirección de Pyth, pero **NO
  libremente configurable** (review Codex): el contrato lleva una
  **allowlist de direcciones aprobadas** administrada por el Safe, con
  validación al aprobar (código presente, idealmente check de
  versión/codehash del contrato Pyth) y **evento emitido en cada cambio** —
  mismo patrón de pinning que SafeOwnerGate. Un owner comprometido no debe
  poder apuntar el oráculo a un contrato arbitrario en una sola tx.

## 2. Coste por trade verificado (entry + exit)

| Concepto | Chainlink | Pyth |
|---|---|---|
| Fee de oráculo | 0 (feeds push, lectura view) | `singleUpdateFeeInWei` = **4e12 wei = 0.000004 ETH** por update (leído on-chain). 2 updates/trade ≈ **0.000008 ETH ≈ $0.015** @ ETH $1,889 |
| Gas on-chain extra | ~30–50k por lectura `getRoundData` (~×2) | ~100–200k por `parsePriceFeedUpdates` (~×2) — **estimación, medir en PoC** |
| Coste total aprox. en Base (@ ~0.01 gwei) | < $0.01 | < $0.03 |
| Infra off-chain | localizar `roundId` correcto por timestamp (walk de rounds vía RPC) | 1 llamada a Hermes/Benchmarks por extremo |

A los volúmenes de Bobby (pocos resolves/día) el coste es ruido en ambos casos.
El coste real no discrimina; la **cobertura y la granularidad sí**.

## 3. Granularidad temporal — el punto decisivo

- **Pyth (Benchmarks):** **actualización histórica verificable dentro de una
  ventana temporal explícita** — el contrato acota
  `[minPublishTime, maxPublishTime]` y el update firmado debe caer dentro.
  Pyth NO garantiza que exista una observación exactamente en el segundo del
  trade; garantiza que la que se presente cae en la ventana que nuestro
  diseño declare (p.ej. ±60 s del exit).
- **Chainlink:** solo existen los rounds que el deviation/heartbeat produjo.
  Para BTC/ETH (0.1–0.15%) hay rounds frecuentes en mercado normal. Para
  **SOL en Base la garantía es 0.5%/24 h**: en un mercado lateral el round
  más cercano al exit puede estar a **horas** — la "verificación" del exit de
  un trade de SOL sería contra un precio potencialmente lejano, y el recorder
  podría elegir el round más favorable dentro de esa laguna. Inaceptable para
  el claim del producto.

**Consecuencia:** con Chainlink, SOL no puede entrar honestamente al nivel
*verified* — quedaría BTC/ETH verified + SOL attested. Con Pyth, los tres
majors entran (y XAU de regalo para XAUT con basis documentado).

## 4. Riesgos operativos y de integración

| Riesgo | Chainlink | Pyth |
|---|---|---|
| Dependencia off-chain en el resolve | RPC para walk de rounds (sin auth) | Hermes/Benchmarks: **API key obligatoria desde 2026-08-18**; free tier hoy 10 req/10 s por IP (sobra para Bobby); coste de tiers con key **sin confirmar aún**. **La key es un secreto operativo del BACKEND** (env var Vercel, patrón `BASESCAN_API_KEY`): nunca entra al contrato, al frontend ni al repo — el contrato solo verifica el update firmado, no habla con Hermes |
| Superficie de auditoría del contrato v2 | menor (view + validación de timestamp del round) | media (llamada externa a Pyth + fee + validación de ventana; la verificación de firmas vive en el contrato de Pyth, auditado) |
| Selección adversarial dentro de la ventana | elegir round favorable dentro de la laguna de rounds (no acotable por diseño propio) | deslizamiento ≤ ventana declarada (acotable por diseño: ventana estrecha) |
| Cambio de dirección del proveedor | proxies estables | upgrade 2026-08-18 anunciado → dirección configurable por Safe |
| Frescura del estado on-chain | push automático | pull: irrelevante para benchmarks (nosotros empujamos el update firmado del instante que declaramos) |

## 5. Veredicto con números

**Pyth confirma su candidatura primaria, y ahora con evidencia:**

1. **SOL descalifica a Chainlink-solo** (heartbeat 24 h/0.5% en Base) para el
   universo verified BTC/ETH/SOL que fijó la recomendación provisional.
2. El coste de Pyth es despreciable a nuestro volumen (~$0.03/trade todo
   incluido, estimación a confirmar en PoC).
3. La manipulación residual con Pyth es **acotable por diseño** (ventana
   estrecha) mientras que con Chainlink depende de la cadencia de rounds que
   no controlamos.

**Opción de cinturón y tirantes** (a evaluar en diseño v2, coste ~nulo): para
BTC/ETH, además del update de Pyth, hacer un sanity-check contra el feed
Chainlink correspondiente (lectura view gratis) con banda amplia (p.ej. 200
bps). **Requisito de diseño (review Codex): NO BLOQUEANTE.** Si la
discrepancia excede la banda, el contrato emite evento/flag para revisión
off-chain — nunca revierte el resolve. Convertir el cross-check en requisito
duro acoplaría la liveness del resolve a un segundo proveedor: un feed
Chainlink pausado o desviado podría congelar resoluciones legítimas (DoS por
dependencia). La verdad la ancla Pyth; Chainlink solo observa.

## 6. Acciones antes de congelar el diseño v2

1. **Registrar la API key de Pyth ANTES del 2026-08-18** y confirmar rate
   limit/coste del tier con key (hoy la doc pública no lista precios). Dueño:
   Anthony. La key vive como env var del backend (gitignoreada/Vercel
   Sensitive) — es secreto operativo, no parte del diseño del contrato.
2. PoC mínimo en Base Sepolia (Pyth también vive ahí:
   `0xA2aa501b19aff244D90cc15a4Cf739D2725B5729`): medir gas real de
   `parsePriceFeedUpdates` con 1 update y validar el flujo
   Benchmarks → resolve. Dueño: Claude, tras el redeploy canario.
3. Decidir anchura de ventanas entry/exit con datos del PoC (arranque
   sugerido: entry ±60 s, exit ±120 s) y confirmar los 100 bps de tolerancia.
4. XAUT: decidir si entra como verified-con-basis-documentado (feed XAU) o
   ATTESTED en v1. Recomendación: ATTESTED en v1, revisar en v2.1.

## Fuentes

- Direcciones y parámetros verificados on-chain vía `cast` (2026-08-12).
- Chainlink reference-data-directory (feeds Base mainnet).
- docs.pyth.network: contract-addresses/evm, fetch-price-updates (auth
  2026-08-18), rate-limits (10 req/10 s), use-historical-price-data.
