# Trader Land — entrega del catálogo v01 (2026-09-02)

Rama `feat/trader-land-art`. Créditos de esta fase: 18 recortes + 2 redos (4) + 2 recortes de redos ≈ 24.
Total del proyecto de arte hasta hoy ≈ 158 de 304.

## Qué hay en `public/land/v1/gate-A/` (runtime, 4.5→~22 MB, todo optimizado)
25 lotes + Aura Core (stage 0/1) + `return_path_curve` como decor. Por pieza y orientación:
`bloom_albedo_1024.png` (alpha), `bloom_albedo_512.webp`, `bloom_glow_1024.png` (máscara L),
`shadow_1024.png` (máscara L desde el rombo del footprint), `bloom_thumb_256.png`, `seed_albedo_1024.png`
(derivado del bloom: emisivos ×0.15 vía glow, desaturación 45 %, sin partículas; misma geometría y alpha).
`asset-manifest.json` con coordenadas normalizadas 0–1, variantes (url, w, h), footprint, kind,
conectores, `occlusionHeight` y QA por estado (sombra horneada antes/después, halo, cobertura de glow).

## Condiciones de Codex, cumplidas
- **Caminos procedurales.** Los cuatro lotes "camino" de distrito (walkway, tunnel, ramp, sluice) se
  entregan como `path_pavement`: solo pavimento/albedo; el renderer dibuja el filamento por conectores.
  `axiom_archive_path_straight/ne_sw` queda como referencia visual del filamento. Cero créditos en
  orientaciones.
- **Seed adicional de silueta alta** validado antes de derivar todos: la antena de doble órbita conserva
  los aros finos y se lee a 96 px sobre negro, gris y color de distrito. Después se derivaron los 25.
- **Contrato de capas**: `shadow_*.png` y `*_glow_*.png` son PNG en modo L (luminancia, sin alpha); el
  runtime mapea luminancia→alpha (negro al ~55 % para la sombra; screen/aditivo para el glow), como
  documenta `GATE-A-CODEX-VALIDATION.md`.

## Redos
- `thesis_citadel_risk_shield`: placa de escudo vertical con borde Base-blue y lámpara en la base. Sin
  esfera ni aro. Aprobado.
- `risk_reef_reef_tile`: pozo de agua calma con borde de roca y costuras cyan fijas. Sin llamas. Aprobado.

## QA automático (pipeline-run.log)
Todos los estados en PASS: sombra de contacto residual 0 px tras la limpieza determinista; halo claro
≤ 233 px (borde de emisivos, se erosiona 1 px en runtime si el grid lo muestra). Hoja general:
`art/trader-land/gate-A/sheets/_catalog_overview.png` (fila bloom / fila seed por distrito, compuestas
albedo + sombra + glow sobre el color de cada distrito a 256 px).

## Pendiente (no bloquea)
- Atlas WebP por distrito + JSON de frames (cuando el renderer fije el tamaño de celda final).
- Segundas orientaciones de edificios (solo si el vertical las pide; con bloom como referencia).
- Overlays de colocación/niebla/partículas (runtime, no arte).
