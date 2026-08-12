# Decisión pendiente — Modelo de confianza del precio en BobbyTrackRecord

**Fecha:** 2026-08-12 · **Estado:** revisado por Codex (correcciones incorporadas) — pendiente decisión final de Anthony
**Bloquea:** el veredicto GO de TrackRecord para Base mainnet (r9, hallazgo abierto
"exit price auto-reportado"). No bloquea el redeploy canario de Sepolia.

## 1. El problema exacto

Tras el fix H-01 (r10), `resolveTrade` deriva WIN/LOSS/BREAK_EVEN de los precios
y acota el PnL reportado a `PNL_TOLERANCE_BPS`. Pero la derivación opera sobre
un `_exitPrice` **que Bobby mismo reporta** — y el `entryPrice` del commit
también es auto-reportado. El contrato hoy prueba **coherencia matemática**, no
**verdad de mercado**: un recorder deshonesto puede elegir un exit ficticio y
registrar un WIN "derivable" de precios que nunca existieron.

Mientras esto no se decida, ninguna superficie pública puede afirmar "win rate
imposible de manipular". El claim honesto actual es: *"resultado derivado de
precios reportados por el recorder, acotado y con expiry permissionless"*.

## 2. Universo real de instrumentos (auditado en código, 2026-08-12)

| Grupo | Símbolos | Fuente de precio que usan los agentes |
|---|---|---|
| Núcleo (≈95% de commits) | BTC, ETH, SOL (perps USDT en OKX) | Mark/last de OKX perps |
| Ocasionales | XAUT, PAXG, OKB | Tickers OKX spot |
| Futuro Base-nativo | (ninguno hoy) | — |

`symbol` es string libre en el contrato: el diseño debe tolerar símbolos sin
oráculo sin bloquear el ciclo.

## 3. Opciones

### A — Attestation con etiqueta (statu quo formalizado, patrón D-1)
Mantener recorder-reported y etiquetar todo PnL/win-rate como **"attested by
recorder"**, nunca mezclado con métricas verificadas (igual que IntentEscrow).

- ✅ Costo cero de código; cero gas extra; universo ilimitado.
- ❌ Renuncia al claim central del producto para su contrato insignia.
  "Los agentes prometen, Bobby prueba" queda en "Bobby jura".
- Riesgo residual: total — la manipulación es indetectable on-chain.

### B — Chainlink feeds en Base
BTC/USD, ETH/USD y SOL/USD existen como feeds push en Base mainnet. El resolve
pasa un `roundId`; el contrato hace `getRoundData(roundId)`, exige que el
`updatedAt` del round caiga en la ventana del resolve y que
`|exitPrice − answer| ≤ ORACLE_TOLERANCE_BPS`.

- ✅ Lectura on-chain gratis (view); sin parsing de firmas; superficie de
  auditoría pequeña; proveedor con el track record más largo.
- ❌ El precio "en el momento del exit" hay que aproximarlo al round más
  cercano (heartbeat + deviation threshold → granularidad de minutos);
  la selección del roundId correcto necesita validación cuidadosa (un
  recorder podría elegir el round más favorable dentro de la ventana).
- Cobertura: BTC/ETH/SOL sí; OKB no; XAUT/PAXG improbable en Base.

### C — Pyth en Base (benchmarks: precio histórico verificable en ventana acotada)
Pyth Benchmarks permite obtener un update **firmado con `publishTime` histórico**
y verificarlo on-chain vía
`parsePriceFeedUpdates(updateData, ids, minPublishTime, maxPublishTime)`.

**Precisión semántica (corrección Codex, 2026-08-12):** esto NO prueba "el
precio en el instante exacto T del trade". Prueba que existió un precio firmado
cuyo `publishTime` cae **dentro de una ventana declarada** `[min, max]`. La
garantía correcta es *"precio histórico verificable dentro de una ventana
acotada"* — la ventana es un parámetro de diseño del contrato, y su anchura es
parte del límite residual de manipulación (junto con el tolerance band).
Ref: docs.pyth.network/price-feeds/core/use-historical-price-data

- ✅ La ventana se ancla al timestamp del trade (no al round que casualmente
  exista, como en Chainlink); cobertura mayor (XAU/USD existe en Pyth);
  BTC/ETH/SOL de sobra.
- ❌ Fee por update (mínima) + gas de verificación; el backend debe llamar a
  Hermes/Benchmarks para obtener el update firmado; superficie de auditoría
  algo mayor (aunque la verificación de firmas vive en el contrato de Pyth,
  ya auditado).
- ⚠️ **Dependencia operativa**: Pyth exige API key/autenticación para sus
  endpoints desde el **2026-08-18** (docs.pyth.network/price-feeds/core/
  fetch-price-updates). Antes de comprometerse: confirmar disponibilidad de
  Benchmarks/Hermes con key, límites de rate y coste — es un servicio externo
  en el camino crítico del resolve.

### D — Uniswap v3/v4 TWAP en Base
TWAP del pool correspondiente como precio de referencia.

- ❌ **No apto para el universo actual**: BTC/ETH/SOL que Bobby debate son
  perps de OKX; el BTC de Base es cbBTC con liquidez órdenes de magnitud menor
  que el índice global, SOL puenteado es residual, XAUT/OKB no existen.
- ❌ TWAP en L2 con bloques baratos es manipulable si el pool no es profundo;
  exactamente el tipo de hallazgo que Codex marcaría como High.
- ✅ Único caso de uso legítimo futuro: tokens **Base-nativos** con pool
  profundo, si Bobby algún día los cubre. No para v1.

### E — Híbrido dos niveles (recomendada)
Oráculo para lo que tiene feed + attestation etiquetada para lo que no:

1. Mapping on-chain `symbol → priceId/feed` administrado por el owner (el
   Safe en mainnet). BTC, ETH, SOL entran al nivel **"price-verified"**.
2. `resolveTrade` de un TrackRecord v2: si el símbolo tiene feed, el resolve
   DEBE incluir la prueba de oráculo (Pyth update o Chainlink roundId) para
   **entry y exit**, con `ORACLE_TOLERANCE_BPS` cubriendo el basis
   perp-vs-índice; si no tiene feed, el trade queda marcado
   `PriceMode.ATTESTED` on-chain y las stats se computan POR SEPARADO
   (dos win rates, nunca sumados — regla D-1).
3. Uniswap TWAP queda explícitamente fuera de v1; reconsiderable solo para
   tokens Base-nativos con pool profundo.

## 4. Matriz

| Criterio | A Attested | B Chainlink | C Pyth | D Uni TWAP | E Híbrido |
|---|---|---|---|---|---|
| Mata el hallazgo r9 | ❌ (lo formaliza) | ✅ núcleo | ✅ núcleo | ❌ | ✅ núcleo, honesto en el resto |
| Cobertura BTC/ETH/SOL | n/a | ✅ | ✅ | ❌ | ✅ |
| Cobertura XAUT/OKB | n/a | ❌ | parcial (XAU) | ❌ | etiquetado attested |
| Anclaje temporal | n/a | ≈ round más cercano | ventana acotada por timestamp | TWAP ventana | según feed |
| Gas/fees extra | 0 | ~0 | fee update + gas | lectura pool | según nivel |
| Superficie de auditoría | 0 | pequeña | media | media-alta | media |
| Nueva ronda de audit | no | sí | sí | sí | sí |

## 5. Recomendación

**Opción E con Pyth como candidato primario** (Chainlink como alternativa
aceptable si en la review pesa más la simplicidad de auditoría o si el coste/
disponibilidad de Benchmarks con autenticación no convence):

- Pyth Benchmarks es la opción cuya semántica más se acerca a lo que el
  contrato quiere probar: *"existió este precio firmado dentro de la ventana
  declarada alrededor del exit"*, en vez de *"este era un precio reciente
  cuando se minó el resolve"*. La ventana es explícita y auditable.
- **La elección final Pyth vs Chainlink queda condicionada** (posición
  compartida con Codex) a validar: coste real por resolve, disponibilidad de
  feeds en Base, complejidad de integración, y el requisito de API key de
  Pyth vigente desde 2026-08-18.
- El tolerance band (sugerido: 100 bps, configurable por el Safe) absorbe el
  basis perp/índice de los majors y queda documentado como **límite residual
  de manipulación**: un recorder deshonesto ya no puede inventar precios,
  solo deslizarse dentro de ±tolerance — y eso queda escrito en el reporte,
  no oculto.
- El nivel ATTESTED preserva el universo abierto sin mentir: OKB o XAUT
  pueden seguir registrándose, con su etiqueta y su win rate aparte.

## 5b. Requisitos de diseño para TrackRecord v2 (fijados en review, 2026-08-12)

No negociables si se aprueba cualquier variante con oráculo:

1. **`entryPrice` se verifica al crear el commitment**, no solo en el
   resolve. Verificar solo el exit deja media tesis sin probar.
2. **Persistencia completa de la evidencia**: por cada extremo verificado se
   guarda on-chain el precio de oráculo usado, su `publishTime`, el feed ID
   y el modo del trade (`VERIFIED`/`ATTESTED`). El manifest de reputación se
   reconstruye desde datos del contrato, no desde logs del backend.
3. **Inmutabilidad del entry**: una resolución NUNCA puede reinterpretar
   retrospectivamente el oráculo del entry (ni su precio, ni su ventana, ni
   su modo). Lo snapshoteado en el commit es final — mismo principio que el
   fix M-02 de TTL.
4. **Ventana temporal y tolerance band se definen POR SEPARADO para entry y
   exit** (el entry se ancla al momento del commit con mercado en vivo; el
   exit puede resolverse horas después del cierre real — sus riesgos de
   manipulación difieren).
5. **Validación operativa previa**: confirmar Benchmarks/Hermes con la
   autenticación obligatoria (API key, desde 2026-08-18), su rate limit y
   coste, ANTES de comprometer el diseño a Pyth. La API key es **secreto
   operativo del backend** (env var, patrón `BASESCAN_API_KEY`) — nunca del
   contrato ni del frontend.
6. **Rotación de oráculo acotada**: la dirección del contrato Pyth se rota
   solo dentro de una **allowlist aprobada por el Safe**, con validación de
   código/versión al aprobar y evento en cada cambio — nunca libremente
   configurable (un owner comprometido no puede apuntar a un oráculo
   arbitrario en una tx).
7. **Cross-checks secundarios NUNCA bloqueantes**: si se añade el
   sanity-check Chainlink para BTC/ETH, una discrepancia emite evento/flag,
   jamás revierte el resolve — atar la liveness a un segundo proveedor es
   una vía de DoS (ver `oracle-comparison.md` §5).

## 6. Implicaciones si se aprueba

1. **TrackRecord v2** (los contratos no son upgradeables): nueva ronda de
   diseño + los 3 rounds de auditoría de regla antes de deploy. Conviene
   empaquetarla con M-02–M-05 en la misma ronda.
2. El backend añade la llamada a Hermes (o la selección de roundId) en el
   flujo de resolve — un paso más en `xlayer-record`/`settle-trades`.
3. `entryPrice` se verifica igual que `exitPrice` (ambos extremos o el claim
   sigue cojo).
4. El canario Sepolia actual (r10.2) NO espera esta decisión: se redeploya
   ya y sirve para validar H-01/H-02; v2 sería el candidato de mainnet.
5. Mensaje público mientras tanto: "resultados derivados de precios
   reportados, acotados on-chain" — nunca "imposible de manipular".

## 7. Estado de la decisión

Recomendación provisional de Codex (2026-08-12), alineada con la sección 5:

> BTC/ETH/SOL verified + resto attested separado + **entry y exit
> verificados** + Pyth con **ventana explícita** y tolerancia inicial de
> **100 bps**.

Con eso quedan pre-acordados los puntos 1, 3 y 4 de las preguntas originales.
Lo que falta para cerrar:

1. **Confirmación de Anthony** de la recomendación provisional (universo
   verified BTC/ETH/SOL, 100 bps inicial, entry+exit).
2. **Pyth vs Chainlink — decisión condicionada a evidencia**: validar coste
   por resolve, disponibilidad de feeds en Base, complejidad real de
   integración y el requisito de API key de Pyth (obligatoria desde
   2026-08-18: rate limits y coste del tier disponible). Entregable: una
   página comparativa con números reales, antes del diseño de v2.
3. **Anchura de las ventanas** entry/exit (parámetro nuevo que la corrección
   de semántica hace explícito): a definir en el diseño de v2 con la
   evidencia del punto 2.
