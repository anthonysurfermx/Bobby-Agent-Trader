# Trader Land — brief de assets para Claude + Higgsfield v0.2

Estado: especificación visual. Claude genera y selecciona assets; este documento no autoriza cambios de código ni deploy.

## 1. Regla de producción

No generar el catálogo completo de inmediato. Orden obligatorio:

1. Una **style sheet**.
2. Una **golden scene** completa.
3. Validación de cámara, escala, luz, siluetas y compatibilidad web/iOS.
4. Pack First Light.
5. Variantes y biomas solo después de probar el vertical.

Objetivo inicial: 18–24 generaciones, no ~100 créditos sin validación.

## 2. Dirección visual

- Isométrico 2:1, cámara ortográfica, yaw 45°, pitch visual ~30°.
- Low-poly premium, bordes suaves, materiales mates con energía translúcida.
- Noche casi negra `#05070A`; aura verde `#34D399`; Base blue `#0052FF`; oro solo para hitos `#F5C542`.
- Luz principal superior izquierda; rim light verde/azul; sombra consistente abajo-derecha.
- Silueta legible a 96 px y detalle limpio a 512 px.
- Sin texto generado, números, gráficas con labels, logos de exchanges, dinero, fichas, cofres, ruletas ni casino.
- Evitar estética genérica “AI fantasy”. Geometría funcional: cada objeto debe contar una conducta de Bobby.

## 3. Golden scene

Composición: isla flotante 8×8, Árbol de Aura central, Byte y Bit a escala, cuatro cuadrantes insinuados por terreno, cuatro piezas First Light, fog en el borde y vacío espacial oscuro.

Prompt base:

> Premium isometric 2:1 game world, orthographic camera, a small floating 8x8 island at night, central cyber-organic Aura Tree with a luminous levitating green sphere inside an orbital ring, subtle energy roots connecting four restrained biomes, chunky low-poly geometry, matte dark materials, emerald and Base-blue rim light, warm gold used only for one earned milestone, readable mobile-game silhouettes, coherent soft shadow cast down-right, calm disciplined financial-intelligence world, no casino, no coins, no treasure chest, no text, no logos, no UI, transparent or pure neutral background where requested.

Entregables:

- `golden_scene_2048.png` — composición completa.
- `style_sheet_2048.png` — materiales, escala, luces, sombra y 12 siluetas.
- `scale_reference_2048.png` — tile, árbol, building 2×2, decor 1×1, Byte y pet.

Gate: no seguir si los objetos parecen provenir de juegos distintos o si Byte no cabe naturalmente en una celda 1×1.

## 4. Pack de terreno

| ID | Asset | Footprint | Estados |
|---|---|---:|---|
| terrain_base | suelo oscuro con filamentos de aura | 1×1 | normal |
| terrain_water | agua negra/azul con reflejo verde | 1×1 | 3 frames opcionales |
| terrain_stone | roca volcánica tecnológica | 1×1 | normal |
| terrain_path | sendero modular de paciencia | 1×1 | recto + curva |
| transition_land_water | borde tierra/agua | 1×1 | 4 orientaciones |
| transition_land_void | borde flotante hacia vacío | 1×1 | 4 orientaciones |

Todos deben encajar sin línea visible, compartir punto de fuga y dejar margen de 8–12% dentro del canvas.

## 5. Árbol de Aura

El héroe no es un árbol natural convencional. Es una estructura viva con:

- esfera flotante visible dentro de un aro;
- cinco raíces/ramas de energía, una por atribución;
- base física anclada a 2×2 tiles;
- órbitas y partículas separables para animación barata;
- cuatro estados de crecimiento, pero el vertical solo necesita 0 y 1.

Assets:

- `aura_tree_stage_0.png`
- `aura_tree_stage_1.png`
- `aura_tree_orbit_front.png`
- `aura_tree_orbit_back.png`
- `aura_tree_glow_mask.png`
- `aura_tree_shadow.png`

La esfera debe flotar claramente y nunca quedar ocultada por el aro desde la cámara isométrica.

## 6. Colección First Light

Cada pieza necesita dos estados: `seed` (apagada/incompleta) y `bloom` (viva/completa).

| ID | Footprint | Diferencia seed → bloom |
|---|---:|---|
| signal_sprout | 1×1 | núcleo opaco → brote de energía |
| patience_path | 1×1 | camino tenue → filamentos estables |
| red_team_antenna | 1×1 | plato cerrado → dos órbitas contrapuestas |
| risk_beacon | 1×1 | baliza baja → haz vertical azul |
| no_trade_gate | 2×1 | compuerta cerrada → escudo luminoso protector |
| evidence_crystal | 1×1 | cristal bruto → facetas alineadas |
| closure_bloom | 1×1 | capullo mecánico → flor orbital verde |
| axiom_sapling | 2×2 | raíces dormidas → mini árbol con sello dorado sobrio |

Para cada pieza:

- PNG master 1024×1024 con transparencia.
- Estado seed y bloom con idéntico framing.
- Sombra separada si la silueta supera 1×1.
- Máscara de glow en escala de grises.
- Un thumbnail 256×256.

## 7. Estados de interacción

No requieren una generación completa por objeto; producir overlays reutilizables:

- `placement_valid.png` — aura verde fina en rombo 2:1.
- `placement_invalid.png` — borde coral/rojo con trama, no flash.
- `placement_selected.png` — esquinas azules y pulso central.
- `construction_dust.png` — partículas mecánicas, 6 frames.
- `bloom_particles.png` — atlas de 8 frames.
- `fog_soft.png`, `fog_dense.png`, `fog_reveal_edge.png`.

## 8. Regiones futuras — concept only

Una imagen conceptual por región, sin sprites de producción todavía:

- Crypto Bay: muelles de datos, agua oscura, velas holográficas abstractas.
- Evidence Mines: cristales de evidencia, drones linterna, túneles sobrios; nada parecido a una mina de oro.
- Thesis Citadel: tres puertas físicas para trigger, riesgo e invalidación.
- Risk Reef: faro, arrecife protector, compuertas y boyas de no-trade.
- Axiom Archive: archivo circular, anillos Base y memoria pública.

## 9. Sonido que Claude debe producir o seleccionar

Masters WAV, 48 kHz, 24-bit, sin clipping. No voz en estos assets.

| ID | Duración | Descripción |
|---|---:|---|
| land_enter_vrum | 0.7 s | subgrave ascendente, masa orbital, cola aérea |
| aura_core_loop | 12–20 s | hum 48–60 Hz, armónicos lentos, loop perfecto |
| orbit_whoosh_a/b/c | 1–2 s | whoosh filtrado, tres alturas y paneos |
| seed_reveal | 0.9 s | tres notas suaves, curiosidad sin jackpot |
| placement_tick | 0.08 s | encaje madera/metal limpio |
| placement_invalid | 0.12 s | thunk apagado, sin alarma |
| placement_confirm | 0.45 s | mecanismo + pulso de energía |
| bloom_complete | 1.4 s | acorde abierto + brillo orbital |
| fog_reveal | 1.8 s | barrido ancho y respiración de aire |
| region_crypto_bay | 20–30 s | agua, datos, viento nocturno |

Loudness objetivo: ambiente -24 a -20 LUFS; one-shots -18 a -14 LUFS antes del mix final. Sin risers de casino, monedas, campanas de premio o aplausos.

## 10. Nombres y estructura de archivos

```text
public/land/v1/
  style/
  terrain/
  tree/
  first-light/
  overlays/
  concepts/
  audio/
```

Formato de nombre: `category_slug_state_v01.png` y `sfx_slug_v01.wav`.

Claude entrega además `asset-manifest.json` con:

- `id`, `version`, `kind`, `footprint`, `anchor`, `rotationMode`;
- `seedUrl`, `bloomUrl`, `shadowUrl`, `glowMaskUrl`;
- `nativeWidth`, `nativeHeight`, `contentBounds`;
- `soundCue` y `creditsUsed`;
- prompt, modelo, referencia y fecha para reproducibilidad.

## 11. QA visual obligatorio

- Comparar cada sprite sobre los cuatro terrenos.
- Verificar a 96, 160, 256 y 512 px.
- Rotaciones no cambian escala ni origen.
- Seed/bloom no “saltan” de posición.
- Companion no atraviesa edificios ni queda detrás de overlays incorrectos.
- La esfera del Árbol de Aura se ve dentro del aro en web e iOS.
- Sin halos recortados, fondos residuales o sombras con otro ángulo.
- Prueba daltonismo y fondo OLED negro.
- Golden scene aprobada antes de gastar créditos en variantes.

## 12. Qué NO debe hacer Claude

- No modificar código, schema, Vercel ni Supabase al generar assets.
- No renombrar IDs después de producirlos.
- No crear personajes o gear nuevos fuera del catálogo aprobado.
- No subir assets a producción.
- No generar 38 sprites antes de validar golden scene y First Light.
- No usar marcas de DeFi México ni rutas/proyectos legacy.

