# TrackRecordV2 — Auditoría adversarial, Ronda 3 (Codex)

**Fecha:** 2026-08-18 · **Commit auditado:** b727a3c · **Veredicto:** NO-GO → corregido en esta tanda. **El commit del fix requiere re-auditoría (ronda 4) antes de freeze/canario.**

## Hallazgo

| ID | Sev | Título | Estado |
|----|-----|--------|--------|
| A3-1 | **P1** | El residual de A2-1 es backdating acotado, no una mitigación aceptable: con el mercado ya observado, el recorder podía elegir retrospectivamente qué instante anclar (hasta `entryWindowSec` atrás, 600 s con params de owner) y registrar el primer tick posterior. `Unique` hace determinista la evidencia dada el ancla, pero no hace honesta la elección temporal | ✅ corregido |

## Fix aplicado — announce-commit en dos pasos (receta de Codex + un tornillo extra)

1. **`announceCommit(bytes32 debateHash)`** (nuevo, `onlyBobby`): fija `announcedAt[hash] = block.timestamp` **antes de que la evidencia de ese instante exista** — eso es lo que elimina la retrospectividad. Emite `CommitAnnounced`. Re-anunciar solo mueve el ancla hacia adelante (timestamp monotónico) — inofensivo. Revierte `AlreadyCommitted` si el hash ya comiteó.
2. **`commitTrade` VERIFIED exige `entryAt == announcedAt`** — *igualdad*, no `>=` como sugería la receta: con `>=`, el intervalo `[announcedAt, commit]` seguiría siendo retrospectivamente seleccionable tras observar el mercado. Con igualdad, el ancla es exactamente el instante anunciado y no hay elección alguna. Errores nuevos: `AnnounceRequired`, `EntryAnchorMismatch`.
3. **La recencia existente hace el resto:** `EntryTooStale` obliga a que el commit aterrice dentro de `entryWindowSec` del anuncio — un anuncio no puede añejarse hasta convertirse en acción de precio observada.
4. **Evidencia:** primer tick en/tras `announcedAt` vía `Unique` (sin cambios respecto a A2-1). La announcement se `delete` al consumirse (refund de gas + higiene).
5. **Recorder en dos txs:** `announceCommit` → espera el receipt → lee el `block.timestamp` del bloque del anuncio (== `announcedAt`) → benchmark de Hermes en ese instante → `commitTrade` con `entryAt = announcedAt`, nonce encadenado desde el anuncio. ATTESTED no anuncia (sin evidencia oracle; `entryAt = 0`).

**Por qué esto cierra el backdating de verdad:** el ancla se elige en un momento en que su evidencia *aún no existe* (el anuncio precede al tick que lo probará). Cualquier intento de anclar a un pasado observado falla `EntryAnchorMismatch`; cualquier intento de presentar un tick anterior al anuncio falla la ventana `Unique`; y aged-announce falla `EntryTooStale`.

**Costo aceptado:** +1 tx por commit VERIFIED (~50k gas del announce en Base ≈ centavos) y ~2-4 s de latencia entre anuncio y commit. El precio de la no-retrospectividad.

## Cambios de superficie

- **ABI:** +`announceCommit`, +`announcedAt(bytes32)` getter, evento `CommitAnnounced`. ABI congelado regenerado.
- **Storage:** +1 slot (mapping `announcedAt` **apendizado** — layout previo intacto; snapshot regenerado: 34 slots). Nada deployado usa el layout anterior.
- `EntryInFuture` queda como defensa muerta (con igualdad al announce, el ancla nunca puede ser futura) — se conserva por robustez ante refactors.

## Regresiones nuevas

- `test_A3_1_announceGates` — sin anuncio → `AnnounceRequired`; ancla ≠ anuncio (el intento de backdating) → `EntryAnchorMismatch`; anuncio añejado 61 s → `EntryTooStale`.
- `test_A2_1_entryTickShoppingRejected` (reforzado) — anuncio → 40 s de mercado observado → tick shopped posterior al primero → revert `Unique`.
- `test_A1_1_entryTickBeforeAnchorRejected` — tick firmado anterior al anuncio → revert.
- `test_r2_challengeFloorIsEntryEvidence` (reformulado) — announce en T0, commit en T0+30: el gap `[tick de entrada, committedAt]` es retable.

## Verificación

- Foundry: **215/215** · Lib TS: **43/43** · E2E: **28/28** — el harness ejercita el flujo announce→commit real de dos txs por el handler (anvil + reglas reales de Pyth + cadencia 1 s).
- `npm run build` verde. ABI y layout regenerados de un build limpio (`forge clean`).

## Para la ronda 4

1. Verificar que la igualdad `entryAt == announcedAt` no tenga bypass (re-announce en el mismo bloque del commit, interacción con `paused`, ordering announce/commit en el mismo bloque).
2. Griefing: ¿puede un tercero forzar `AlreadyCommitted`/anular anuncios? (`announceCommit` es `onlyBobby` — revisar que el gate esté en todos los caminos).
3. El costo del announce como vector de DoS económico propio (spam de anuncios nunca consumidos — son sobrescribibles y `delete` al consumir; el residual es gas de Bobby, no del protocolo).
4. Ratificar el residual A1-2 (post-expiry unrecordable breach) que sigue documentado como aceptado.
