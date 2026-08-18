# TrackRecordV2 — Auditoría adversarial, Ronda 1 de 3

**Fecha:** 2026-08-17 · **Commit auditado:** 0016cd9 · **Veredicto de la ronda:** NO-GO → hallazgos corregidos en esta misma tanda (el commit del fix debe re-auditarse en la ronda 2).

## Hallazgos

| ID | Sev | Título | Estado |
|----|-----|--------|--------|
| A1-1 | **P1** | El patrón de fetch de Hermes no puede satisfacer `parsePriceFeedUpdatesUnique` con feeds de ~1 Hz — commit y resolve VERIFIED revertían contra el Pyth real | ✅ corregido |
| A1-2 | P2 | El expiry por TTL borra permanentemente un stop-breach probable; carrera de un bloque en la frontera exacta del TTL | ◑ carrera cerrada; residual aceptado y documentado |
| A1-3 | P3 | Los mocks/stubs modelaban una cadencia de feed imposible (prev = pt-65s / prev = 0), ocultando A1-1 | ✅ corregido |

## A1-1 — detalle y fix

**La regla real de `Unique`:** un update se acepta si y solo si `prevPublishTime < minPublishTime <= publishTime <= maxPublishTime` — es decir, debe ser el *primer tick en o después de `minPublishTime`*. BTC/ETH/SOL publican ~1 tick/segundo (`prev ≈ pt-1`).

- **Entry (roto):** el contrato exigía `minT = block.timestamp - entryWindowSec` — un valor que ningún fetch off-chain puede anclar al segundo (se computa al INCLUIR la tx). Con cadencia 1 Hz, `prev ≈ now-6` nunca es `< now-60` → todo tick fresco revertía. No existía configuración de parámetros que lo salvara.
- **Exit (roto):** `minT = exitAt - exitWindowSec`, pero el recorder trae el benchmark de Hermes EN `exitAt` (`prev ≈ exitAt-1`) → mismo revert.
- **Challenge (siempre estuvo bien):** `minT = _anchorTs` **declarado por el caller** — exactamente lo que devuelve el endpoint benchmark de Hermes. Ese es el patrón canónico.

**Fix aplicado:**
- **Exit** adopta el patrón canónico del challenge: `Unique` sobre `[exitAt, exitAt + exitWindowSec]` — la evidencia es el *primer tick en/después del instante declarado*, determinista, y coincide 1:1 con lo que el recorder ya trae (`buildHermesBenchmarkUrl(feedId, exitAt)`). Causalidad garantizada por `minResolveAt > committedAt ≥ entry.publishTime`. Backend sin cambios.
- **Entry** pasa al parse acotado **no-Unique** (`parsePriceFeedUpdates`): firma + `publishTime ∈ [now-entryWindow, now]` + gate de confianza + banda de tolerancia vs el entry reportado. No hay pérdida de determinismo práctica: bajo `Unique`, la elección del ancla dentro de la ventana siempre fue del recorder de todos modos; las mitigaciones reales de cherry-picking son la ventana corta, la banda de tolerancia y el challenge. Backend sin cambios (`buildHermesLatestUrl(feedId, 5)`).
- ABI **sin cambios**; storage layout **sin cambios** (33 slots idénticos; solo renumeración de AST ids en el snapshot).

**Regresión permanente:** `contracts/test/Audit1HermesCadenceRegression.t.sol` fija las formas de fetch REALES del recorder contra un mock que aplica las reglas exactas de Pyth con cadencia 1s. Si entry o exit regresan, estos tests fallan.

## A1-2 — detalle

- **Carrera de frontera (cerrada):** `expireCommitment` exigía `>= TTL` mientras el challenge pendiente permite `<= TTL` — en el bloque exacto del TTL un expiry podía front-runear un challenge en vuelo. Ahora expiry exige `> TTL` **estrictamente**: en la frontera el challenge gana. Test: `test_A1_2_atExactTTL_expiryRevertsChallengeStillOpen`.
- **Residual aceptado:** un breach genuino que nadie retó en 30 días queda EXPIRED (no LOSS) permanentemente. Se acepta porque: (1) la ventana de 30 días es generosa; (2) `getCoverage`/`getVerifiedScorecard` publican el conteo EXPIRED — un patrón de expiries altos es visible y castigable por el lector; (3) permitir challenge post-expiry reabriría la finality que V-02 cerró. Decisión a ratificar en ronda 2.

## A1-3 — detalle

Helpers de test usaban `prev = pt-65s`/`pt-290s` y el stub E2E `prev = 0` — gaps imposibles en feeds mayores, que es exactamente por qué 208 tests verdes no vieron A1-1. Ahora: helpers y stub usan `prev = pt-1` (cadencia real). El harness E2E además corre las formas de fetch reales del recorder de punta a punta.

## Verificación del fix

- Foundry: **213/213** (208 previos + 5 regresiones A1).
- E2E (anvil + mock con reglas reales + stub cadencia 1s): **28/28**.
- `npm run build` (typecheck API incluido): verde.
- Storage layout: idéntico (verificado slot a slot).

## Pendiente que esta ronda deja armado

- **Ronda 2 debe correr sobre el commit del fix** (este) — regla acordada: si el código cambia, la ronda se repite.
- **Test de fork contra el Pyth real de Base + payloads reales de Hermes** en el canario de Sepolia (Paso 4 del runbook): los mocks ya aplican la regla exacta, pero la clase de bug de A1-1 amerita confirmación contra el contrato vivo. El canario lo cubre con el ciclo VERIFIED real.
