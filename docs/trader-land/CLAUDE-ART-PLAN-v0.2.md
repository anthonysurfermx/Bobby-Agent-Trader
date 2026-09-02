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
