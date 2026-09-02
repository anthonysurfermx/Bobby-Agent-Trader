# Trader Land — Gate A: seis masters para validar en grid (2026-09-02)

Rama: `feat/trader-land-art` (nunca se despliega sola). Carpeta: `public/land/v1/gate-A/`.
Créditos: 7 remociones de fondo + 1 generación (segunda orientación) ≈ 9. Sin generar nada más.
Pipeline reproducible: `scripts/infra/trader-land-gate-a.py` (Python + Pillow + numpy).

## Entregables por pieza (`gate-A/<id>/`)
`<state>_albedo_1024.png` (recorte con alpha) · `<state>_albedo_512.webp` · `<state>_glow_1024.png`
(máscara del emisivo) · `shadow_1024.png` (sombra sintética por footprint, mismo anchor, luz arriba-izquierda)
· `<state>_thumb_256.png`. Manifest: `gate-A/asset-manifest.json` con `contentBounds_2048`,
`anchor_2048`, `footprint`, `occlusionHeight_px`, `orientations`, `connectors`, métricas de QA y fuente.

| Pieza | Footprint | Sombra horneada (antes → después) | Halo claro | Glow % |
|---|---:|---:|---:|---:|
| aura_core_stage0 | 2×2 | 1 947 → 0 | 0 | 0.23 |
| aura_core_stage1 | 2×2 | 0 → 0 | 0 | 6.83 |
| evidence_mines_crystal_vein_rock (bloom) | 1×1 | 5 526 → 0 | 133 | 4.31 |
| axiom_archive_return_path (bloom) | 1×1 | 0 → 0 | 0 | 3.46 |
| risk_reef_dual_orbit_antenna (bloom) | 1×1 | 6 366 → 0 | 0 | 2.22 |
| evidence_mines_evidence_workshop (bloom) | 2×1 | 0 → 0 | 197 | 3.27 |
| thesis_citadel_three_gate_citadel (bloom) | 2×2 | 0 → 0 | 233 | 2.85 |

## Las tres correcciones de Anthony/Codex
1. **Seed de muestra derivado del bloom** (sin créditos): `evidence_mines_crystal_vein_rock/seed_albedo_1024_derived.png`.
   Misma geometría y alpha; emisivos atenuados vía la máscara de glow, desaturación parcial, partículas
   eliminadas. Hoja: `sheet_evidence_mines_crystal_vein_rock_seed_derived.png`. Legible a 96 px y
   distinguible del bloom. Quedan vetas azules tenues (el umbral de glow no las cubre): ajustar a 10 % si
   Codex lo pide.
2. **Segunda orientación isométrica real del camino** (1 generación con el bloom como referencia):
   `raw/axiom_archive_return_path_bloom_orientation2_raw.png` + `sheet_path_orientations.png`. Conserva
   bloques, luz y sombra; solo cambia la dirección del filamento → la re-orientación por referencia es
   viable. Hallazgo: el bloom original es un **par de curvas** y la orientación 2 salió **recta**; antes
   de los 19 hay que fijar por catálogo qué es "camino recto" y qué "curva" (conectores N/E/S/O).
   Sigue con fondo (no estaba en el presupuesto de remoción): 1 crédito más si se aprueba.
3. **Glow por luminancia + tono/saturación + regiones conectadas**: tono 120–250° (emerald→cyan→Base
   blue), saturación > 0.30, luminancia > 0.42, regiones ≥ 12 px a 512, sin brillos blancos ni placas
   doradas. Inspección sobre negro, gris 50 % y color de distrito a 512 y 96 px: `sheet_<id>_<state>.png`.

## Hipótesis de sombra: confirmada y resuelta
`remove_background` **sí** conservó restos de la sombra de contacto en tres piezas (`diag_ghost.png`:
rojo = píxeles oscuros semitransparentes fuera de `contentBounds`, naranja = antialiasing normal).
Limpieza determinista y reproducible en el pipeline: fuera de los bounds, alpha a 0 para píxeles
oscuros semitransparentes; dentro no se toca nada. Re-chequeo: 0 en las siete. El halo claro
(133–233 px) es borde de emisivos y se elimina con erosión de 1 px si el grid lo muestra.

## Para Codex
Probar en el grid web/iOS: 96/160/256/512, OLED y cinco terrenos, occlusión frente al companion, tap
target por `contentBounds`, seed→bloom sin salto, memoria/carga, colocación/rotación/undo/restore.
Con GO: procesar los otros 19 + 2 redos (~23 créditos) con el mismo pipeline.
