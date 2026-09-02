# Trader Land — mejoras de sistema y gate de integración v0.3

Fecha: 2026-09-02  
Estado: propuesta para integrar al sistema v0.2. No autoriza código, migraciones ni deploy.  
Responsabilidad: Claude conserva la producción visual en Higgsfield; Codex define reglas, contrato técnico, interacción y QA web/iOS.

## Veredicto sobre el catálogo actual

La dirección visual está aprobada para prototipo. El Aura Core ya tiene una silueta propia, la esfera se lee dentro del aro y las familias comparten materiales. No conviene generar más catálogo hasta probar una muestra dentro de un grid real.

Los dos redos declarados siguen siendo correctos:

- `thesis_citadel_risk_shield`: debe ser escudo/baliza, no otra esfera orbital.
- `risk_reef_reef_tile`: debe comunicar contención y calma, no fuego.

Además hay tres riesgos de integración:

- Los fondos oscuros y las sombras horneadas pueden dejar halos al recortar.
- Caminos, muros y puertas no tienen todavía conectores ni orientaciones compatibles.
- A 96 px varios suelos y caminos pierden su diferencia funcional.

## 1. Un solo mundo, cinco distritos

Los cinco “mundos” deben ser distritos de una isla continua, no cinco escenas separadas. El Aura Core queda siempre en el centro y permite entender el estado completo del usuario sin navegar entre pantallas.

La isla comienza con un área utilizable 8×8. No debe contener las 25 piezas definitivas al mismo tiempo: sus footprints ocupan 45 celdas y el Aura Core otras 4, es decir, 49 de 64 antes de contar conexiones, espacio negativo o libertad creativa.

Expansión propuesta:

| Estado | Área | Condición | Resultado |
|---|---:|---|---|
| First Light | 8×8 | primer proceso cerrado | Core + tutorial + dos distritos insinuados |
| Orbit I | 10×10 | tres atribuciones activas | se revela un anillo de terreno |
| Orbit II | 12×12 | cinco atribuciones activas | isla completa y cinco distritos conectados |
| Season | distrito lateral | objetivo temporal | expansión reversible sin deformar la isla principal |

La expansión nunca depende de rentabilidad, cantidad de trades o dinero depositado.

## 2. Evitar que todos terminen con el mismo jardín

Las 25 piezas son **blueprints**, no 25 recompensas de un solo uso.

- Los landmarks 2×2 son únicos por mundo.
- Edificios 2×1 admiten hasta dos copias y dos orientaciones.
- Decor, caminos y suelo son repetibles con límites de densidad.
- El comportamiento decide qué blueprint progresa; el usuario decide dónde colocarlo.
- No hay rareza aleatoria. La diferencia entre jardines nace de composición, orientación, rutas y qué conducta fortalece cada persona.

Cada cierre elegible entrega una carga de construcción. Una carga puede:

1. colocar una copia permitida;
2. despertar una pieza seed existente;
3. reparar una conexión incompleta;
4. guardarse, sin castigo ni expiración.

## 3. Adyacencias con significado, no bonuses financieros

Las piezas reaccionan a sus vecinas únicamente de forma visual:

- camino + edificio: se enciende la entrada;
- dos caminos compatibles: aparece un flujo de energía;
- Evidence junto a Thesis: un cable de evidencia alimenta la puerta;
- Risk Reef frente a una entrada: aparece una barrera calmada;
- las cinco rutas conectadas al Aura Core: el anillo completa una órbita.

No dan XP adicional, probabilidades, dinero ni ventajas de trading. Las adyacencias hacen el jardín satisfactorio sin crear una estrategia óptima que todos copien.

## 4. Aura Core como tablero vivo

El Core debe contar las cinco atribuciones sin depender de números:

| Atribución | Canal visual del Core | Canal sonoro |
|---|---|---|
| Paciencia | pulso lento y estable | grave sostenido |
| Claridad | esfera más nítida | campana limpia |
| Riesgo | aro exterior firme | cierre mecánico suave |
| Contradicción | segunda órbita contraria | barrido estéreo inverso |
| Cierre | cinco raíces conectadas | acorde completo |

La velocidad de las órbitas no representa actividad ni trades; representa equilibrio. Mucha actividad sin cierre produce luz intermitente y raíces incompletas, nunca una animación más “poderosa”.

## 5. Gramática visual por distrito

Actualmente todas las familias dependen mucho del mismo verde/azul. Mantener Bobby, pero dar una firma secundaria accesible:

| Distrito | Firma | Movimiento |
|---|---|---|
| Crypto Bay | cyan + superficies líquidas | ondas horizontales lentas |
| Evidence Mines | menta pálida + cristal facetado | refracción y drones verticales |
| Thesis Citadel | cobalt + bloques rectos | puertas y pulsos contenidos |
| Risk Reef | azul-violeta + arcos dobles | movimientos opuestos y calmados |
| Axiom Archive | emerald + una placa dorada | retorno circular |

La forma y el movimiento deben distinguir el distrito incluso en escala de grises. Evitar que la antena de Risk Reef repita la misma silueta atómica del Aura Core.

## 6. Gate técnico antes de gastar más créditos

Integrar primero seis masters representativos en una escena local no persistente:

1. Aura Core stage 0 y 1.
2. Un suelo 1×1.
3. Un camino 1×1.
4. Un decor 1×1.
5. Un edificio 2×1.
6. Un landmark 2×2.

Probar en web e iOS:

- 96, 160, 256 y 512 px;
- OLED negro y los cinco terrenos;
- orden de profundidad delante/detrás del companion;
- tap target independiente del alpha visible;
- memoria y tiempo de carga;
- seed→bloom sin salto de geometría;
- ausencia de halo, borde oscuro o sombra recortada;
- colocación válida, inválida, rotación, undo y restore.

No procesar los otros 19 masters hasta que este gate pase.

## 7. Contrato técnico del sprite

Cada pieza necesita capas y datos, no solo un PNG final:

- `albedo.png`: objeto recortado, sin partículas ni sombra horneada;
- `shadow.png`: sombra separada, mismo origen;
- `glow.png`: máscara blanca del emisivo;
- `thumb.png`: lectura de inventario a 256 px;
- `contentBounds`: caja real del objeto;
- `anchor`: punto de contacto con el grid;
- `footprint`: celdas ocupadas;
- `connectors`: norte/este/sur/oeste para caminos, muros y puertas;
- `occlusionHeight`: orden frente/detrás;
- `orientations`: lista explícita de vistas disponibles.

Un flip horizontal no sustituye una orientación isométrica si cambia luces, texto visual, entrada o sombra. Para el vertical se permiten dos orientaciones; cuatro llegan después del gate.

Las partículas de bloom deben ejecutarse en runtime para poder apagarlas por accesibilidad, rendimiento y modo silencioso visual.

## 8. Loop UX mínimo que hay que prototipar

El vertical no se valida mostrando una galería. Debe probar este recorrido:

1. Bobby cierra un análisis.
2. El usuario elige `NO TRADE`, `PLAN` o `SKIP`.
3. Una semilla sale del Core.
4. Se muestra exactamente por qué se ganó.
5. El usuario abre Trader Land y coloca la pieza.
6. Días después, la tesis queda resoluble.
7. Al revisarla, la misma pieza florece sin cambiar de geometría.

Objetivos:

- menos de 35 segundos hasta colocar la primera pieza;
- una sola decisión por pantalla;
- ningún wallet prompt durante el primer mundo;
- undo visible durante 10 segundos;
- si falla la persistencia, la pieza vuelve al inventario y no desaparece;
- si no puede comprobarse elegibilidad, el desk sigue funcionando pero no concede rewards.

## 9. Sonido pensado para teléfonos

El “vrum” no puede depender de 48–60 Hz: muchos altavoces móviles casi no lo reproducen. Construir la sensación orbital con:

- fundamental audible entre 90–140 Hz;
- armónicos suaves entre 220–420 Hz;
- subgrave opcional para audífonos;
- movimiento estéreo muy lento, nunca mareante;
- haptic de encaje separado del audio.

Familia mínima:

- entrada al land: aire orbital ascendente;
- pieza seleccionada: ping material por distrito;
- posición válida: click magnético;
- posición inválida: aire apagado, sin buzzer castigador;
- colocar: golpe suave + raíz de energía;
- bloom: dos notas y apertura del filtro;
- cinco atribuciones conectadas: acorde completo de Bobby.

Respetar mute, silent mode, reduce motion y voice ducking. No usar loop permanente en v1.

## 10. Gate de producto del vertical

No avanzar al catálogo completo ni a temporadas hasta cumplir:

- 10 usuarios pueden completar plantar→volver→florecer sin explicación externa;
- ≥80% entiende por qué recibió la pieza;
- ≥70% distingue seed de bloom a 96 px;
- ≥70% identifica al menos cuatro distritos sin leer sus nombres;
- cero piezas perdidas tras cierre/reapertura;
- NO TRADE progresa exactamente igual que PLAN;
- ningún evento premia P&L, tamaño o frecuencia de trading;
- web e iOS reconstruyen el mismo land desde el mismo snapshot.

## Próxima división de trabajo

**Claude + Higgsfield**

- Rehacer los dos blooms rechazados.
- No derivar los 25 seeds todavía.
- Entregar los seis masters del gate con fondo removido y capas separables.
- Mantener job IDs y prompts reproducibles.

**Codex**

- Convertir este documento en catálogo JSON validable y state machine compartida.
- Diseñar conectores, anchors, footprint y reglas de colocación.
- Construir el prototipo local del grid con los seis masters.
- Medir legibilidad, memoria, occlusion y paridad web/iOS.
- Implementar después la gramática de sonido con síntesis/WAV, sin depender de Higgsfield.
