# Decisión pendiente — Modelo de confianza del precio en BobbyTrackRecord

**Fecha:** 2026-08-12 · **Estado:** BORRADOR para decisión de Anthony + review de Codex
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

### C — Pyth en Base (benchmarks con timestamp exacto)
Pyth permite obtener un update **firmado para un `publishTime` pasado
específico** (Benchmarks) y verificarlo on-chain vía
`parsePriceFeedUpdates(updateData, ids, minPublishTime, maxPublishTime)`.
El resolve incluye el update firmado del instante del exit; el contrato exige
`publishTime` dentro de la ventana declarada y el mismo tolerance band.

- ✅ Semántica perfecta para "precio en el momento T del exit" — la ventana se
  ancla al timestamp, no al round disponible; cobertura mayor (XAU/USD existe
  en Pyth); BTC/ETH/SOL de sobra.
- ❌ Fee por update (mínima) + gas de verificación; el backend debe llamar a
  Hermes para obtener el update firmado; superficie de auditoría algo mayor
  (aunque la verificación de firmas vive en el contrato de Pyth, ya auditado).

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
| Precio en el instante T | n/a | ≈ (round más cercano) | ✅ exacto | TWAP ventana | según feed |
| Gas/fees extra | 0 | ~0 | fee update + gas | lectura pool | según nivel |
| Superficie de auditoría | 0 | pequeña | media | media-alta | media |
| Nueva ronda de audit | no | sí | sí | sí | sí |

## 5. Recomendación

**Opción E con Pyth como oráculo primario** (Chainlink como alternativa
aceptable si en la review pesa más la simplicidad de auditoría que la
exactitud temporal):

- Pyth Benchmarks es la única opción cuya semántica coincide con lo que el
  contrato quiere probar: *"este era el precio en el instante del exit"*, no
  *"este era un precio reciente cuando se minó el resolve"*.
- El tolerance band (sugerido: 100 bps, configurable por el Safe) absorbe el
  basis perp/índice de los majors y queda documentado como **límite residual
  de manipulación**: un recorder deshonesto ya no puede inventar precios,
  solo deslizarse dentro de ±tolerance — y eso queda escrito en el reporte,
  no oculto.
- El nivel ATTESTED preserva el universo abierto sin mentir: OKB o XAUT
  pueden seguir registrándose, con su etiqueta y su win rate aparte.

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

## 7. Preguntas abiertas para cerrar la decisión

1. ¿Aceptas restringir el nivel "verified" a BTC/ETH/SOL en v1? (Todo lo
   demás nace ATTESTED hasta tener feed.)
2. ¿Pyth (exactitud temporal) o Chainlink (simplicidad de auditoría)?
3. ¿Tolerance band inicial: 50, 100 o 150 bps? (Trade-off: menor banda =
   menos manipulación residual, más resolves legítimos rechazados por basis.)
4. ¿Se verifica también el `entryPrice` en el commit (recomendado) o solo el
   exit en v1?
