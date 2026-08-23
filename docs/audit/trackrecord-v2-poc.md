# TrackRecord v2 — Resultados del PoC (Pyth real, Base Sepolia)

**Fecha:** 2026-08-12 · **Método:** fork test contra el Pyth REAL de Base
Sepolia (`0xA2aa501b19aff244D90cc15a4Cf739D2725B5729`) con un update FIRMADO
real de Hermes Benchmarks — **sin broadcast, cero escrituras on-chain**.
**Test:** `contracts/test/TrackRecordV2PythPoC.t.sol` (5/5 PASS).
Correr: `RUN_PYTH_POC=true forge test --match-contract TrackRecordV2PythPoC -vv`
(sin la env var, la suite normal no toca la red).

## 1. Datos del update usado (reproducibilidad)

| Campo | Valor |
|---|---|
| Feed | BTC/USD `0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43` (confirmado vivo en Hermes, igual ETH `0xff61…0ace` y SOL `0xef0d…b56d`) |
| Endpoint | `hermes.pyth.network/v2/updates/price/1786591762` (flujo Benchmarks — el mismo que usará el backend) |
| publishTime / prev | 1786591762 / 1786591761 |
| price / expo / conf | 6350230500000 / −8 / 1985500000 (= $63,502.305 ± $19.855) |
| Tamaño updateData | **1,311 bytes** (la estimación previa de ~700 B quedó corta — corregido en gas) |

## 2. Mediciones

| Métrica | Valor | Nota |
|---|---|---|
| `parsePriceFeedUpdatesUnique` (1 update) | **162,465 gas** | Dentro de la banda estimada 100–200k. Es EL costo nuevo dominante por extremo |
| `getUpdateFee` | **10 wei** (Sepolia) | Mainnet: 4e12 wei (leído on-chain en oracle-comparison §2) — ambos ruido |
| Ciclo VERIFIED estimado actualizado | v1 482k + 2×162k parse + slots nuevos + fees ≈ **~0.95–1.05M gas** | Confirma la banda del spec §7 |
| Conf real BTC | **≈ 3.1 bps** | El default `confMaxBps = 50` tiene ~16× de holgura — el gate no estorbará en majors líquidos |

## 3. Semántica validada on-chain (los 3 tests de fork)

1. **Parse + retorno:** id/price/expo/conf/publishTime del update devuelto
   coinciden exactamente con lo publicado por Hermes.
2. **Ventana (regresión F-01):** update fuera de `[min, max]` ⇒ revert. El
   candado del exit (`publishTime <= _exitAt`) es exigible por el propio Pyth.
3. **Semántica UNIQUE:** con `min == prevPublishTime` revierte — Pyth exige
   `prev < min <= publishTime`.

## 4. Hallazgo de diseño (fortalecimiento — incorporado al spec §3.2/§3.4)

**Con `min` fijado por el contrato, el update válido es ÚNICO y determinista:**
la combinación ventana + `Unique` obliga a que la prueba sea el PRIMER tick
publicado después del borde inferior de la ventana. El recorder no elige nada
dentro de la ventana — el "cherry-pick de ±window" que el análisis de
seguridad daba por residual (S-01/§6.1) en realidad NO existe para entry/exit:
el precio probado es el del tick determinista, punto.

Consecuencias:
- **Entry/exit:** el precio verificado es ≈ el del borde inferior de la
  ventana (primer tick después). Ventanas chicas ⇒ ancla pegada al instante
  declarado. Refuerza mantener exit window en 120 s o menos.
- **Challenge (delta de spec):** el challenger SÍ necesita elegir dónde buscar
  el cruce ⇒ `challengeStopBreach` recibe un **`uint64 _anchorTs`** explícito
  (el `min` del parse), acotado a `(entryEvidence.publishTime, exitAt]`; el
  update debe ser el primero ≥ `_anchorTs` y cruzar el stop. Libertad del
  challenger = buscar el tick; determinismo del tick = sin fabricación.
- **Backend:** la request a Benchmarks se hace al **borde inferior de la
  ventana** (no al instante declarado) — documentado en §4.1/§4.2 del spec.

## 5. Layout congelado (F-06 — `forge inspect`, solc 0.8.24)

**CommitmentV2 = 7 slots** (224 B) — los 7 params snapshoteados caben en el
slot 3 con anchos encogidos (uint16/uint24), 28/32 usados:

```
slot 0: debateHash
slot 1: entryPrice(12) targetPrice(12) committedAt(8)
slot 2: stopPrice(12) recorder(20)
slot 3: minResolveAt(8) agent(1) conviction(1) resolved(1) mode(1)
        entryWindowSec(2) exitWindowSec(2) maxExitLagSec(3) challengeWindowSec(3)
        entryTolBps(2) exitTolBps(2) confMaxBps(2)   [28/32]
slot 4-5: entryEvidence { feedId | price(8) conf(8) expo(4) publishTime(8) }
slot 6: symbol (string)
```

**TradeV2 = 10 slots** (320 B) — `mode` toma el byte libre EXACTO del slot 2
(offset 31, como predijo C-01); el slot nuevo de F-06 queda holgado:

```
slot 0: debateHash
slot 1: entryPrice(12) exitPrice(12) committedAt(8)
slot 2: resolvedAt(8) recorder(20) agent(1) conviction(1) result(1) mode(1)  [32/32]
slot 3: pnlBps (int256)
slot 4: exitAt(8) challengeDeadline(8) stopChallenged(1)   [17/32 — 15 B libres]
slot 5-6: entryEvidence · slot 7-8: exitEvidence · slot 9: symbol
```

Delta de gas de storage vs v1: commit +2 slots, resolve +5 slots — coincide
con la banda del spec §7.

**Confirmado en la implementación (2026-08-12):** `forge inspect
BobbyTrackRecordV2 storageLayout` sobre el contrato real emite EXACTAMENTE este
layout — Commitment 224 B / 7 slots, Trade 320 B / 10 slots, `mode` en slot 2
offset 31 (el byte libre de v1, como predijo C-01). Snapshot congelado en
`contracts/test/snapshots/BobbyTrackRecordV2.layout.json` + tripwire de field
count en `test/LayoutSnapshot.t.sol`. Tamaño del contrato: **16,167 bytes
(8,409 B de margen EIP-170)** — sin presión de tamaño.

## 6. Qué queda para la implementación (no es PoC)

- Gas del `challengeStopBreach` completo (parse 162k + reclasificación
  ~30–60k de storage — se mide con el contrato real).
- Snapshot CI de ABI/layout.
- Recorte de tolerances con datos de basis reales (correr el PoC de basis
  perp-OKX vs Pyth unos días antes de congelar 100→~30 bps).
- API key de Hermes (Anthony, antes del **2026-08-18**) — este PoC corrió
  sobre el endpoint público que muere ese día.
