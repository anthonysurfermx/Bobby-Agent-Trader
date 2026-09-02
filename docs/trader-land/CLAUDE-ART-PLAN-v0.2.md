# Trader Land — plan de arte y mejoras al sistema v0.2 (Claude, 2026-09-02)

Estado: propuesta + producción de validación en curso. No toca código, Supabase, Vercel ni producción.

## 1. Cómo encaja "5 mundos × 5 lotes = 25 assets" con v0.2

La petición de Anthony (Focus Tree: cinco mundos, cinco tipos de lote por mundo) y el
sistema v0.2 no compiten: v0.2 ya define **cinco espacios** —cuatro regiones más
el centro— y cada uno responde a una atribución de conducta. Los "5 lotes" se
convierten en **cinco tipos de pieza por mundo**, con footprint y función fijos,
de modo que el catálogo completo son 25 piezas de mundo, más el Árbol de Aura y
la colección First Light que ya están especificados.

| Mundo | Atribución | Lote 1 · suelo 1×1 | Lote 2 · camino 1×1 | Lote 3 · decor 1×1 | Lote 4 · edificio 2×1 | Lote 5 · hito 2×2 |
|---|---|---|---|---|---|---|
| Crypto Bay | Paciencia | muelle de datos | pasarela sobre agua | boya de contexto | torre de velas holográficas | faro de espera |
| Evidence Mines | Claridad | roca con vetas de cristal | túnel abierto | dron linterna | taller de evidencia | cristal madre facetado |
| Thesis Citadel | Riesgo | losa de muralla | rampa fortificada | escudo/baliza | puerta doble (trigger + invalidación) | ciudadela de tres puertas |
| Risk Reef | Contradicción | arrecife protector | compuerta azul | antena de doble órbita | observatorio del Red Team | puente doble |
| Axiom Archive | Cierre | anillo de archivo | sendero de retorno | flor de aura | archivo encendido | anillo Base con sello dorado |

Regla de lectura: el lote 1 es "gratis" al desbloquear la región; los lotes 2–5
se ganan solo cerrando procesos (florecer), nunca por volumen. Cada mundo tiene
exactamente **un** lugar donde aparece el oro (`#F5C542`): su hito 2×2.

## 2. Mejoras propuestas al sistema (no cambian la tesis, la afinan)

1. **Fusión de mapas.** v0.2 tiene dos catálogos paralelos: First Light (8 piezas
   de "ruta de descubrimiento") y los 25 lotes de mundo. Propuesta: First Light
   es el **tutorial** (una pieza por atribución + 3 de cierre) y usa piezas del
   mismo catálogo de 25, no un set aparte. Menos assets, una sola gramática.
2. **El lote define el ritmo, no la rareza.** Sin loot: suelo → camino → decor →
   edificio → hito es la progresión visible por región. El usuario siempre ve la
   silueta del siguiente lote (como en v0.2), y la región "se completa" con el
   hito. Esto da un objetivo de 5 pasos por mundo, 25 en total, legible en un
   solo vistazo.
3. **Seed/bloom por lote, no por pieza.** Cada lote tiene un estado apagado y
   uno vivo (mismo framing). Es lo que hace que "volver a revisar" se vea: el
   mundo pasa de gris-mate a energía sin cambiar de forma.
4. **Fog por mundo = paciencia real.** Cada región se revela solo cuando su
   atribución tiene al menos un proceso cerrado. Un usuario impaciente ve
   niebla; no un candado ni una tienda.
5. **Byte a escala 1×1 es el patrón de medida** de todo el catálogo. Cualquier
   asset que no respete "Byte cabe en una celda" se descarta en QA (gate del
   brief).
6. **Nombres:** mantener `Evidence Mines` y `Thesis Citadel`; para el árbol,
   propongo `Aura Core` (evita "árbol" literal, que el arte tiende a volver
   bosque genérico).

## 3. Producción con Higgsfield (créditos y gates)

Modelo: Nano Banana Pro a 2K (2 créditos por imagen; acepta referencia de imagen
para mantener a Byte y el estilo). Saldo al empezar: 304.8.

| Fase | Generaciones | Créditos | Gate |
|---|---:|---:|---|
| A. Validación: golden scene ×2, style sheet, escala | 4 | 8 | Anthony aprueba cámara, luz, escala y siluetas |
| B. Árbol de Aura: stage 0/1, órbita front/back, glow, sombra | 6–8 | 12–16 | esfera visible dentro del aro |
| C. Catálogo 25 lotes, estado seed + bloom | 50 (+~10 rehechos) | 100–120 | QA sobre los 4 terrenos y 96/512 px |
| D. Overlays y conceptos de región | 6–8 | 12–16 | — |
| **Total** | ~70 | **~150** | queda margen para iterar |

Todo se genera con fondo neutro para recorte; `remove_background` de Higgsfield
para los sprites; masters 1024, thumbnails 256; `asset-manifest.json` con
prompt, modelo, job id, fecha y créditos.

## 4. Lo que NO se hace aquí

Código, schema, Vercel, Supabase, marcas o rutas de DeFi México, personajes o
gear nuevos fuera del catálogo, ni subir assets a producción.

## 5. Resultado del lote de validación (2026-09-02, 8 créditos)

- **Golden scene A — dirección aprobada.** Esfera flotando dentro del aro y
  visible, cinco regiones legibles (velas holográficas, cristales y drones,
  fortaleza de puertas, faro y arrecife, anillo de archivo), Byte a escala
  1×1, un solo dorado, niebla en el borde. Correcciones: la isla lee ~10×10
  (debe ser 8×8), las raíces se extienden por media isla (pasan a ser una capa
  decal de suelo; el tronco ocupa 2×2) y las torres-vela son demasiado
  literales.
- **Golden scene B — descartada como escena, útil como base del árbol.** El
  grid 8×8 exacto y el árbol contenido en un anillo 2×2 son correctos; la
  muralla es medieval, el faro naturalista y la pieza dorada parece una
  moneda (prohibido).
- **Style sheet — materiales y luz aprobados.** El sello dorado salió como
  moneda y el "data dock" como laptop: se corrigen en los prompts.
- **Escala — aprobada** (Byte cabe en un rombo 1×1, edificio 2×2 correcto).
  **El árbol falló**: el modelo lo volvió un árbol frondoso; la mascota se
  volvió un perro. Confirma el cambio de nombre a **Aura Core** y una pasada
  dedicada sin follaje antes del catálogo.

Manifiesto con job ids y prompts: `docs/trader-land/art/validation-manifest-2026-09-02.json`.
Los PNG de validación viven fuera del repo hasta aprobar el catálogo.

## 6. Pasada del Aura Core (2026-09-02, 12 créditos)

Aprobados: **stage 0** (dormido) y **stage 1** (despierto: la esfera flota
dentro del aro y no se oculta, cinco tendones, base 2×2 con filamentos) y el
**decal de raíces** (plano, cinco ramas sobre el grid). Parcial: la hoja de
órbitas (la esfera sirve; las mitades del aro se derivan por máscara desde el
stage 1). A rehacer más adelante: **stage 2** (raíces fuera del 2×2 y sello
dorado como moneda); el vertical solo necesita 0 y 1.

Catálogo de prompts de los 25 lotes, dos estados cada uno:
`docs/trader-land/art/lot-catalog-v01.json` (50 generaciones, ~100 créditos).

## 7. Catálogo de 25 lotes (2026-09-02, 100 créditos)

50 generaciones, 0 fallos. Resultado por mundo en las hojas de contacto
(fila superior seed, inferior bloom). Veredicto:

- **Bloom: 23 de 25 aprobados** como masters. Cámara, materiales y siluetas
  consistentes entre los cinco mundos; el oro aparece solo como placa en el
  hito de Axiom Archive (no moneda).
- **A rehacer (2 blooms, 4 créditos):** `thesis_citadel_risk_shield` (salió
  como esfera en pedestal, parece un mini Aura Core) y
  `risk_reef_reef_tile` (energía tipo llama; debe ser calma).
- **Hallazgo de proceso:** seed y bloom se generaron por separado y no
  comparten geometría. Regla de producción: el **bloom es el master** y el
  seed se **deriva** (desaturar, bajar emisivos, quitar partículas) o se
  genera imagen-a-imagen desde el bloom. Los 25 seeds generados sirven solo
  como referencia de "apagado"; uno (`axiom_archive_base_ring_seal`) salió
  con fondo blanco y se descarta.
- Siguiente: rehacer los 2 blooms, `remove_background` sobre los 25 masters,
  derivar seeds, masters 1024 + thumbnails 256, y empaquetar en una rama de
  arte aparte (no en la rama desplegada a producción).

Resultados con job ids: `docs/trader-land/art/lot-catalog-v01-results.json`.
Créditos usados hoy: 8 + 12 + 100 = 120; saldo ≈ 185.
