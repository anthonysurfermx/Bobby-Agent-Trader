# TrackRecordV2 — Auditoría adversarial, Ronda 2 de 3 (Codex)

**Fecha:** 2026-08-17 · **Commit auditado:** 56f657f · **Veredicto:** NO-GO → corregido en esta tanda. **La ronda 3 debe correr sobre el commit de este fix.**

## Hallazgo

| ID | Sev | Título | Estado |
|----|-----|--------|--------|
| A2-1 | **P1** | El fix de A1-1 reintrodujo cherry-picking en el entry VERIFIED: parse no-Unique sobre `[now-entryWindow, now]` dejaba al recorder elegir retrospectivamente cualquier tick firmado de hasta `entryWindowSec` (600 s máx) de antigüedad | ✅ corregido |

**Por qué era P1:** el único actor autorizado (`bobby`) podía escoger el tick más favorable de la ventana para fijar la entrada oracle; la clasificación posterior usa esa entrada, así que el record dejaba de ser plenamente price-verified. Además, el intervalo `[publishTime elegido, committedAt]` quedaba fuera del challenge de stop.

## Fix aplicado (la receta exacta de Codex)

1. **`entryAt` añadido a `commitTrade`** (`uint64`, tras `_declaredMode`) — cambio de ABI, regenerado el ABI congelado.
2. **Recencia forzada:** `entryAt ≤ block.timestamp` (`EntryInFuture`) y `block.timestamp - entryAt ≤ entryWindowSec` (`EntryTooStale`) — el ancla pina la entrada al momento del commitment.
3. **El recorder pide a Hermes el primer tick en/tras `entryAt`** (`buildHermesBenchmarkUrl(feedId, entryAt)`, con `entryAt = now-5s`). `buildHermesLatestUrl` **eliminado** — el benchmark-at-anchor es la única forma de fetch, en las tres superficies.
4. **`parsePriceFeedUpdatesUnique` en `[entryAt, entryAt + entryWindowSec]`** — la evidencia es determinista dado el ancla: el primer tick en/después. `parsePriceFeedUpdates` (no-Unique) **eliminado del interface y de `_verifyAndPay`** — código muerto fuera.
5. **`entryAt` publicado** en `TradeCommitted` (campo nuevo al final) junto a la evidencia; también viaja en calldata. Storage layout **sin cambios** (va en `CommitArgs` memory + evento, no en storage).

**Cierre del segundo filo del hallazgo:** el piso del challenge baja de `committedAt` a `entryEvidence.publishTime` — el intervalo `[tick de entrada, committedAt]` ya es retable. Es correcto porque el gate de commit fuerza el stop al lado de pérdida de la entrada ORACLE, así que cualquier tick que cruce el stop tras el tick de entrada es pérdida genuina.

## Las tres superficies quedan simétricas (patrón benchmark canónico)

| Superficie | Ancla declarada | Ventana Unique |
|---|---|---|
| Entry | `entryAt` (nuevo) | `[entryAt, entryAt+entryWindowSec]` |
| Exit | `exitAt` | `[exitAt, exitAt+exitWindowSec]` |
| Challenge | `anchorTs` | `[anchorTs, maxT]` |

## Nota sobre el límite residual (para ronda 3)

El ancla la declara el recorder, así que puede elegir *cuándo* anclar dentro de la ventana de recencia (≤ `entryWindowSec` hacia atrás). Eso no es tick-shopping — dado el ancla, la evidencia es única — pero sí es anchor-shopping acotado a la recencia. Mitigaciones: ventana corta (60 s por default, deployable a 15 s), banda de tolerancia vs el entry reportado, y el challenge que ahora arranca en el tick de entrada. Es el mismo poder que el recorder tendría eligiendo el momento de commitear — irreducible sin quitar al recorder la iniciativa del commit. Ronda 3 debe ratificar o refutar este razonamiento.

## Nuevas regresiones

- `test_A2_1_entryTickShoppingRejected` — un tick posterior al primero-tras-el-ancla revierte (Unique).
- `test_A2_1_entryAnchorRecencyBounds` — `EntryInFuture` / `EntryTooStale`.
- `test_r2_challengeFloorIsEntryEvidence` — rechaza anclas pre-entrada; un breach en `[entry tick, committedAt]` aterriza como LOSS.

## Verificación

- Foundry: **215/215** (viaIR; stack-too-deep del arg extra resuelto con `_commitDispatch` empaquetando a struct + hoisting de anclas en tests).
- Lib TS: **43/43** · E2E: **28/28** (stub sirve benchmark-at-anchor) · `npm run build` verde.
- ABI congelado regenerado (`commitTrade` con `_entryAt`; evento con `entryAt`). Storage layout idéntico.
