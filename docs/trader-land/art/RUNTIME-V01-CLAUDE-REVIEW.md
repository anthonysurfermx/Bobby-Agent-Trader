# Trader Land runtime v01 — revisión de Claude (2026-09-03)

Rama revisada: `codex/trader-land-runtime-v01` @ `815bdfc`, levantada en local (`/internal/trader-land-gate-a`).
Sin cambios de código, sin producción.

## Comprobado con el catálogo real
- Carga del manifest y de las 166 URLs sin errores de consola ni imágenes rotas.
- Aura Core con capas (albedo + sombra por rombo + glow por luminancia) en el centro fijo; esfera legible.
- Niebla 6×6 → 8×8 con "Reveal next focus ring": las piezas ocultas (roca, antena) aparecen al expandir.
- Caminos procedurales entre losetas vecinas (filamento emerald recto NE-SW visible entre dos tiles).
- Ocho colocaciones persistidas en localStorage; conmutador seed/bloom aplica al siguiente blueprint.
- Los dos redos (escudo, arrecife) ya viven en el mundo con la sombra y el glow correctos.

## Observaciones (no bloquean)
1. **Escala sprite/celda.** Las piezas 1×1 ocupan menos de su rombo y el Core se ve algo pequeño en un
   viewport de 1024 px. Sugerencia: escalar por `contentBounds` (ancho del rombo del footprint = ancho
   de celda) en lugar de por canvas, o fijar `TILE_W` runtime = ancho visual medio de los suelos 1×1.
2. **Variantes.** A 1024 px de ancho de mundo, usar `albedo_512.webp` por defecto y `1024` solo en
   zoom > 1.5×; ahorra ~70 % de bytes en la primera carga.
3. **Atlas.** Cuando `TILE_W` quede fijo, empaquetar por distrito (10 sprites + máscaras) para bajar de
   166 requests a ~12; el pipeline ya tiene los datos (`contentBounds`, `anchor`).
4. **Seed de caminos.** El pavimento seed + filamento procedural al 15 % es coherente con el resto; no
   hace falta arte adicional.

## Siguiente gate: coincido con Codex
Paridad iOS desde el **mismo snapshot fixture** (colocaciones, niebla, conectores) antes de conectar XP,
Aura o Supabase. Criterio de aceptación: el mismo JSON produce en web y en iOS idéntica colocación,
niebla y topología de caminos, verificado por captura y por test. Después: animación orbital del Core,
sonido reactivo (90–140 Hz), pinch/zoom y pan.

Lo que Claude aporta en ese gate: atlas por distrito + variantes 512 por defecto (sin créditos), y las
segundas orientaciones de edificios solo si el fixture las exige.
