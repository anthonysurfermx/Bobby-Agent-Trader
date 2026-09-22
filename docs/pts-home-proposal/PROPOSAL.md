# PTS · Home de señales — propuesta visual v2

Autor: Fable · 21 sep 2026 · Responde a `docs/PTS-home-ux-ui-brief.md`.
Destinatario de la crítica: DeepSeek V4 Flash.

Esta carpeta es una propuesta de diseño para revisión interna. No es un producto
publicado de PTS, no modifica la app (`ios/PTS`) ni Bobby, y no añade datos,
rendimientos ni señales que no estén en el brief.

La v2 incorpora la revisión de un panel interno: tres propuestas independientes
(evidencia primero, lectura en cinco segundos, SwiftUI nativo) y tres jueces con
lentes distintos (cumplimiento del brief y lenguaje, comprensión y accesibilidad,
riesgo de interpretación financiera). Donde los tres jueces coincidieron contra
mi v1, cambié la propuesta; esos cambios están marcados con **[panel]**.

## Archivos

| Archivo | Qué es |
|---|---|
| `home-mockup.html` | Maqueta interactiva (abrir en un navegador). Se pueden tocar los filtros, la tarjeta y «Señales». |
| `screens/01-home-opciones.png` | Home con el filtro Opciones y la tarjeta COIN. |
| `screens/02-home-categoria-vacia.png` | Estado vacío (Stocks; Spot y Scalping son iguales). |
| `screens/03-detalle-regreso.png` | Cabecera del detalle con «← Señales» y la fuente de YouTube. |
| `screens/00-tablero.png` | Tablero completo con anatomía, estados y decisiones. |

Una pantalla suelta a 393×852 se obtiene con `home-mockup.html?only=home`,
`only=empty` u `only=detail`.

## La propuesta en siete líneas

1. Tres capas antes de la tarjeta: marca, título y filtros. La tarjeta empieza en y ≈ 236 y todo cabe en 393 × 852 con holgura. **[panel]**
2. Cuatro filtros que caben sin scroll, con el nombre siempre en blanco y el conteo con unidad: `Opciones · 1 señal`, `Stocks · 0 señales`… El «0 señales» avisa antes de tocar.
3. La fecha va rotulada **«PUBLICADA»** y el autor **«AUTOR»**. En una tarjeta de opciones, una fecha suelta se lee como vencimiento del contrato, que es justo el dato que no se puede completar. **[panel]**
4. La calificación va **antes** del veredicto: «Reportado por el autor · **sin verificar**», con «sin verificar» en blanco y peso alto. El veredicto va en blanco, peso regular, sin comillas, sin filete de cita, sin píldora. **[panel]**
5. Lo que falta pesa igual que lo que existe: dos filas de 15 pt en blanco, marcador lleno para «Fuente original disponible» y marcador hueco punteado para «Contrato sin documentar». Marcadores blancos, no dorados. **[panel]**
6. Con una sola señal nada invita a deslizar: tarjeta a todo el ancho y la verdad escrita en reposo, «1 de 1 · Sin señales anteriores al 18 sep 2026». El carrusel con asomo aparece cuando exista una segunda señal real. **[panel]**
7. El detalle entra por navegación push con un control propio «← Señales», en la misma franja donde el Home dice «PTS Señales».

## Layout del Home (393 × 852 pt)

| Región | Medidas | Contenido |
|---|---|---|
| Franja superior | 44 pt, márgenes de 24 | «PTS» 20 pt black con tracking 3 + «Señales» 14 pt gris. Sin iconos: se elimina el de filtro, que hoy no tiene función. |
| Título | 33 pt medium, tracking −1 | «Todas las señales». Sin subtítulo: el total se lee en los filtros. |
| Filtros | 4 columnas iguales de 80 × 52 pt, separación 8, radio 12 | Nombre 14 pt blanco + conteo 12 pt gris con unidad. Activo: relleno dorado al 14 %, borde dorado al 45 %, texto dorado suave. Con señales e inactivo: superficie blanca al 4 %. Sin señales: sin relleno, nombre igualmente en blanco. |
| Tarjeta (una señal) | 345 pt de ancho, ≈ 410 pt de alto, radio 22 | A todo el ancho, sin scroll horizontal ni rebote. |
| Leyenda de posición | 13 pt | «**1 de 1** · Sin señales anteriores al 18 sep 2026». Calculada de los datos. |
| Aviso | 13 pt gris claro (9.2:1), en línea, no fijo | «Contenido educativo: no es una recomendación ni una orden de compra o venta. PTS no completa datos que la fuente no documenta.» |

Último elemento en y ≈ 745; quedan unos 70 pt hasta el área segura inferior.

### Con dos o más señales

- Aparece el rótulo «CRONOLOGÍA · MÁS RECIENTE PRIMERO» (12 pt mono).
- La tarjeta pasa a 305 pt, separación de 12, y asoman 52 pt de la siguiente tarjeta **real**.
- Carrusel alineado a vista, margen de contenido de 24. La leyenda pasa a «1 de N» y se actualiza al deslizar; en la última: «N de N · Sin señales anteriores al …».
- Tocar el filtro ya activo devuelve el carrusel a la primera tarjeta.
- No hay tarjeta de cierre, silueta, contorno punteado ni nodo hueco: en una línea de tiempo, lo hueco se lee como «pendiente».

## Anatomía de la tarjeta

Orden de lectura, igual al del brief:

| # | Elemento | Tratamiento |
|---|---|---|
| 1 | Tipo | «OPCIONES», 13 pt mono dorado, pegado al símbolo. Sin icono: `chart.line.uptrend.xyaxis` dibuja una subida (promesa de resultado) y `bolt` sugiere urgencia. |
| 2 | Activo | «COIN» 44 pt medium + «Coinbase» 16 pt gris, misma línea base. |
| 3 | Fecha | Rótulo «PUBLICADA» 12 pt mono + «18 sep 2026» 16 pt blanco. Siempre absoluta; nunca «hace 3 días». |
| 4 | Autor | Rótulo «AUTOR» 12 pt mono + «Daniel Marín» 16 pt blanco. Sin avatar ni sello. |
| 5 | Veredicto reportado | «Reportado por el autor · **sin verificar**» 13 pt; debajo, «Segundo objetivo reportado» 20 pt regular blanco. Hasta dos líneas; la tarjeta crece antes que truncar, y «sin» nunca se separa de «verificar». |
| 6 | Estado de datos | «ESTADO DE DATOS · **PARCIAL**» 12 pt mono con anillo a medias, y dos filas de 15 pt en blanco con marcadores de 12 pt (lleno / hueco punteado). |
| 7 | Acción primaria | «Abrir señal», 48 pt, botón tonal: dorado al 14 % con borde al 45 % y texto dorado suave. Toda la tarjeta es un único botón. |

La tarjeta no muestra precio, porcentaje, niveles, P&L, tipo de opción, strike,
vencimiento, prima, cantidad ni miniatura de gráfico.

## Estado vacío

Panel de superficie con borde sólido (sin contorno punteado, sin icono, sin
ilustración), con el nombre del tipo en gris, el título del brief y una segunda
línea **en presente**:

> **Sin señales registradas**
> Aquí solo se muestran reportes con fuente y fecha. No hay ninguno registrado en Stocks.

Se aparta del literal del brief («Esta categoría aparecerá cuando exista un
reporte con fuente y fecha»), que está en futuro y roza su propia regla contra
prometer señales. **Requiere visto bueno.** No hay enlace hacia Opciones: el
conteo de los filtros ya dice dónde hay contenido y un botón ahí convertiría un
vacío honesto en un embudo.

## Home frente a Detalle

- Misma franja, distinto contenido: «PTS Señales» en el Home y «← Señales» en el Detalle. Control propio, dorado, con área táctil de 44 × 44 pt como mínimo.
- Navegación push horizontal, no hoja modal. Sin transición zoom: es ornamental para un registro histórico y su cierre por arrastre vertical contradice el regreso horizontal.
- No se depende del botón atrás del sistema: con el SDK de iOS 26 puede quedar reducido a un chevron sin texto, lo que incumpliría «control textual evidente». Hay que restaurar el gesto de borde y añadir `accessibilityAction(.escape)`.
- El detalle repite la calificación y el veredicto del Home, en blanco. Pendiente en el código actual (`ios/PTS/Sources/PTSApp.swift`): quitar `checkmark.seal` junto a «REPORTE DEL AUTOR · SIN VERIFICAR» (≈ línea 283) y pasar a blanco la línea dorada «Reporte de Daniel · segundo objetivo» (≈ línea 304). Si no, se pasa de «sin verificar» en el Home a una cabecera que parece verificada.
- En la maqueta el gráfico es un marcador de posición sin velas, para no dibujar precios inventados; los seis niveles son los publicados, sin función asignada.

## Movimiento

Cambio de filtro: fundido de 200 ms. Con «Reducir movimiento», sin animación.
Ningún punto pulsa en el Home: un punto que late parece una alerta en vivo y el
registro es histórico. La esfera del copiloto no aparece en el Home, porque allí
no hay una señal que delimite su alcance.

## Accesibilidad

- Piso tipográfico de 12 pt; calificadores críticos a 13 pt o más. Contraste sobre `#06080A`: blanco 20:1, gris `#A9B0BA` 9.2:1, dorado `#DBB366` 10.2:1. El gris `#7E8793` (5.5:1) no se usa para texto.
- Objetivos táctiles de 44 pt o más en filtros, tarjeta, «← Señales» y momentos del video.
- La tarjeta es un único elemento para VoiceOver, con rasgo de botón y en el orden del brief: «Opciones. COIN, Coinbase. Publicada el 18 de septiembre de 2026. Autor: Daniel Marín. Reportado por el autor, sin verificar: segundo objetivo reportado. Estado de datos parcial: fuente original disponible; contrato sin documentar. Abrir señal.»
- Filtros: «Opciones, 1 señal, seleccionado» / «Stocks, sin señales». Al cambiar de tipo se anuncia: «Stocks. Sin señales registradas.»
- Con tamaños de texto de accesibilidad los filtros pasan a una rejilla de 2 × 2 (nunca a una fila desplazable, que dejaría un tipo fuera de cuadro) y la tarjeta crece en alto.
- Rótulos en mayúsculas mediante `textCase`, para que VoiceOver no los deletree. Idioma de la app en español (`developmentLanguage: es`, locale `es_MX`) para que la fecha salga «18 sep 2026» y se lea en español.

## Tokens

| Token | Valor |
|---|---|
| Fondo | `#06080A` (Theme.bg) |
| Acento / acento suave | `#DBB366` / `#FAE0A6` (Theme.accent / accentSoft) |
| Texto primario / secundario | `#FFFFFF` / `#A9B0BA` |
| Superficie | blanco 4 % |
| Borde / borde fuerte | blanco 8 % / 18 % |
| Dorado tonal | acento al 14 % de relleno, 45 % de borde |
| Radios | tarjeta 22, filtros 12, botón 14 |
| Familias | SF Pro (texto) y SF Mono (rótulos). Sin serif. |

El dorado queda para identidad y para lo que se puede tocar (filtro activo,
tipo, acción, regreso). Nunca califica el veredicto ni la evidencia. Verde y
rojo no aparecen en el Home.

## Inventario de copy

| Dónde | Texto |
|---|---|
| Franja (Home / Detalle) | PTS Señales / ← Señales |
| Título | Todas las señales |
| Filtros | Opciones · Stocks · Spot · Scalping, cada uno con «N señal(es)» |
| Tarjeta | OPCIONES · COIN · Coinbase · PUBLICADA 18 sep 2026 · AUTOR Daniel Marín |
| Veredicto | Reportado por el autor · sin verificar / Segundo objetivo reportado |
| Estado de datos | ESTADO DE DATOS · PARCIAL / Fuente original disponible / Contrato sin documentar |
| Acción | Abrir señal |
| Leyenda | 1 de 1 · Sin señales anteriores al 18 sep 2026 |
| Con N ≥ 2 | CRONOLOGÍA · MÁS RECIENTE PRIMERO |
| Vacío | Sin señales registradas / Aquí solo se muestran reportes con fuente y fecha. No hay ninguno registrado en Stocks. |
| Aviso | Contenido educativo: no es una recomendación ni una orden de compra o venta. PTS no completa datos que la fuente no documenta. |
| Detalle | Publicada el 18 sep 2026 · Daniel Marín · YouTube · FUENTE · VIDEO DE YOUTUBE · 05:27 · 15:29 · Niveles publicados · función sin confirmar · Sobre COIN y esta señal |

## Cambios frente al Home 0.4 actual

| Hoy (`PTSApp.swift`, `SignalHome`) | Propuesta |
|---|---|
| Icono de filtro en la cabecera, sin función | Se elimina |
| Chips con icono y sin conteo, desplazables | Cuatro filtros fijos, sin iconos, con «N señales» |
| Subtítulo + rótulo «CRONOLOGÍA · OPCIONES» + «1 disponible» | Tres capas antes de la tarjeta; rótulo de cronología solo con N ≥ 2 |
| Fecha suelta antes que el tipo; tipo a 8 pt gris | Tipo primero a 13 pt; fecha rotulada «PUBLICADA» |
| Veredicto en dorado, sin calificación dentro de la tarjeta | Calificación antes del veredicto; veredicto en blanco regular |
| «Fuente original disponible · contrato sin documentar» en una línea gris de 10 pt | «ESTADO DE DATOS · PARCIAL» y dos filas de igual peso |
| Tarjeta de 282 pt en un carrusel que no se mueve | Tarjeta a 345 pt; carrusel solo cuando hay dos señales reales |
| Texto propio en el estado vacío («por ahora», «queda lista para recibir») | Presente, sin promesa |
| Nota al pie sin aviso educativo | Aviso con «no es una recomendación ni una orden de compra o venta» |
| Detalle como `.sheet` con «← Señales» | Push con «← Señales» en la misma franja |
| Textos de 8–10 pt | Mínimo 12 pt |

## Notas para la implementación en SwiftUI (iOS 17+)

- `NavigationStack` con `.navigationDestination(item: $selectedSignal)`, barra del sistema oculta en ambas pantallas y control propio «← Señales» (`Label("Señales", systemImage: "arrow.left")`, `.frame(minWidth: 44, minHeight: 44)`, `.contentShape(Rectangle())`). Ocultar la barra desactiva el gesto de borde: hay que reactivarlo desde UIKit y verificarlo en dispositivo.
- Con N = 1: la tarjeta va directamente en el `VStack`, sin `ScrollView` horizontal. Con N ≥ 2: `ScrollView(.horizontal)` + `LazyHStack(spacing: 12).scrollTargetLayout()`, `.scrollTargetBehavior(.viewAligned)`, `.contentMargins(.horizontal, 24, for: .scrollContent)`, `.scrollBounceBehavior(.basedOnSize)`, ancho con `.containerRelativeFrame(.horizontal) { w, _ in w - 88 }`, y `.scrollPosition(id:)` para la leyenda «k de N».
- Conteos, leyenda y fechas salen del arreglo (`curated.filter { $0.category == item }.count`); nada escrito a mano.
- Modelo: añadir a `SignalListItem` la fecha como `Date`, `dataState` (`completo`, `parcial`, `faltante`) y dos listas, `disponible` y `faltante`. Eliminar `SignalCategory.icon`.
- Estilos de texto del sistema (`.caption` para los 12 pt, `@ScaledMetric` para el símbolo) y una variante para `dynamicTypeSize.isAccessibilitySize` (filtros 2 × 2, tarjeta vertical). Pasada de QA de AX1 a AX3.
- `AccessibilityNotification.Announcement` al cambiar de tipo; `.accessibilityElement(children: .ignore)` + etiqueta compuesta + `.isButton` en la tarjeta.

## Contradicciones del brief y preguntas para la crítica

1. **Estado vacío.** El literal del brief está en futuro («aparecerá») y el propio brief prohíbe lenguaje que prometa señales. La maqueta usa presente. ¿Se acepta?
2. **«Todas las señales»** titula una vista que siempre está filtrada por tipo. Funciona como nombre de la bandeja. Alternativa: «Señales».
3. **«Parte de la siguiente visible»** es imposible con una sola señal sin inventar contenido o sugerir que hay más. La propuesta lo difiere hasta que exista una segunda señal. ¿Se entiende que el Home es un explorador horizontal aunque hoy no se deslice?
4. **«objetivo»** sugiere meta cumplida. El literal no se toca, pero nunca debe reformularse como «superado», «alcanzado», «cumplido» ni «ganancia», ni en el Home ni en el Detalle.
5. **«Abrir señal»** puede evocar «abrir posición». Alternativa a evaluar: «Ver señal».
6. **«PARCIAL»** es una clasificación sobre el caso COIN que el brief no asigna de forma explícita. Si no se confirma, se conservan las dos filas sin la palabra.
7. **«Pregúntale lo que quieras»** contradice el alcance limitado a COIN, la señal y Daniel. En el Detalle se añade «Sobre COIN y esta señal».
8. **Tipo «Opciones» con contrato sin documentar.** La tarjeta afirma el tipo de instrumento y, a la vez, que el contrato falta. Ambas cosas son ciertas según el brief; conviene vigilar que no se lea como contradicción.
9. **Capturas antiguas** de `ios/PTS/previews/` («Segundo objetivo superado» en turquesa, etiquetas STOP/ENTRADA/TP, «Más de $1,000») no deben usarse como referencia ni como material de venta.

## Lo que esta propuesta no hace

No añade señales, precios, rendimientos ni datos de contrato. No asigna función a
ningún nivel. No usa verde ni rojo en el Home. No usa «ganancia»,
«oportunidades» ni «próximamente». No muestra antigüedad relativa, palomitas,
sellos ni insignias. No coloca la esfera del copiloto en el Home.
