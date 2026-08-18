# TrackRecordV2 — Auditoría adversarial, Ronda 4 (Codex)

**Fecha:** 2026-08-18 · **Commit auditado:** 079d2f8 · **Veredicto:** NO-GO → corregido en esta tanda. **La ronda 5 debe correr sobre el commit de este fix.**

## Hallazgos

| ID | Sev | Título | Estado |
|----|-----|--------|--------|
| A4-1 | **P1** | Same-block announce+commit: el contrato solo exigía `entryAt == announcedAt == block.timestamp`. Un Bobby malicioso con el update Pyth del segundo actual podía empaquetar anuncio y commit en el mismo bloque — "el anuncio precede a la evidencia" no estaba forzado por el contrato | ✅ corregido |
| A1-2 | P2 | Post-expiry unrecordable breach | ✅ **ratificado por Codex como residual aceptable**: la frontera exacta favorece al challenge y la cobertura/expiries es pública |

## Fix A4-1 — ancla futura determinista (receta de Codex)

1. **`MIN_ENTRY_DELAY_SEC = 10`** (constante pública): el ancla se DERIVA del anuncio como `entryAt = announcedAt + MIN_ENTRY_DELAY_SEC` — estrictamente en el futuro del bloque del anuncio. Nota: `block.number` posterior no habría bastado (un tick con el timestamp del bloque anunciado podía conocerse antes); el offset temporal sí, porque **el tick del instante ancla no existe todavía cuando el ancla queda fija**.
2. **`commitTrade` exige igualdad exacta con el ancla derivada** (`EntryAnchorMismatch` si no) **y `block.timestamp >= entryAt`** (`EntryInFuture` hasta que llegue el instante) — el intento same-block revierte estructuralmente.
3. `EntryTooStale` sin cambios: el commit debe aterrizar en `[entryAt, entryAt + entryWindowSec]`.
4. **Recorder**: announce → lee el timestamp del bloque del anuncio → `entryAt = ts + 10` → **espera** hasta que el instante pase (+1 s de holgura para que el primer tick exista en Hermes) → benchmark exacto en `entryAt` → commit. Constante espejada en TS (`MIN_ENTRY_DELAY_SEC`), con **guard de paridad en el E2E** que lee la constante del contrato y la compara — no pueden divergir en silencio.

**ABI:** firma de `commitTrade` intacta (se conserva `_entryAt`, como pidió Codex); solo se añade el getter de la constante. **Storage:** sin cambios (constante — 34 slots idénticos).

**Costo aceptado:** +10-11 s de latencia por commit VERIFIED (el delay + la espera del tick). Para un sistema cuyo ciclo de decisión es de minutos, irrelevante; para la garantía, esencial.

## La cadena de custodia temporal completa (rondas 1→4)

| Ataque | Muro |
|---|---|
| Tick fresco imposible con `Unique` (liveness) | A1-1: anclas declaradas, benchmark canónico |
| Tick-shopping dentro de la ventana | A2-1: `Unique` sobre ancla declarada |
| Anchor-shopping retrospectivo | A3-1: announce previo fija el ancla |
| Same-block: anunciar un tick ya conocido | A4-1: ancla derivada al futuro — el tick no existe al anunciar |

El ancla ahora se fija en un instante cuyo precio **nadie puede conocer**, y la evidencia es el primer tick que el mundo produce después de ese instante. No queda grado de libertad temporal para el recorder.

## Regresiones nuevas

- `test_A4_1_sameBlockAnnounceCommitReverts` — el ataque exacto de la ronda: announce+commit en un bloque con un tick "futuro" hipotético → `EntryInFuture`.
- `test_A1_1_entryTickBeforeAnchorRejected` — evidencia previa al ancla → revert `Unique` (reformulado al ancla derivada).
- `test_A3_1_announceGates` — mismatch contra el ancla derivada / anuncio añejado (reformulado).
- E2E: guard de paridad contrato↔backend de `MIN_ENTRY_DELAY_SEC`; el flujo real de dos txs con espera de 10 s corre por el handler.

## Verificación

- Foundry: **216/216** · E2E: **29/29** (24 V2 + 5 v1) · `npm run build` verde.
- ABI regenerado; layout 34 slots idéntico (build limpio).

## Para la ronda 5

1. ¿Puede el owner degradar la garantía vía params? (`entryWindowSec` grande no reabre backdating — el ancla sigue derivada — pero revisar interacciones).
2. Re-announce tras conocer el tick del ancla previa: el re-announce mueve el ancla a un futuro nuevo — verificar que no haya secuencia announce₁ → observar → announce₂ → commit contra ancla₁ (la igualdad usa el `announcedAt` VIGENTE — confirmar).
3. Liveness del recorder: si el commit no aterriza en la ventana (congestión), el retry es announce nuevo — verificar que no quede estado atascado.
4. Los residuales ya ratificados (A1-2) quedan cerrados.
