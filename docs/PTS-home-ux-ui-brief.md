# PTS · brief UX/UI para Home de señales

## Para

Fable FI · DeepSeek V4 Flash

## Objetivo

Diseñar el Home de PTS como una bandeja clara de señales. El usuario debe poder entender en menos de cinco segundos qué señales existen, de qué tipo son, cuándo fueron publicadas y cuál fue el veredicto reportado por la fuente. Al tocar una tarjeta entra al detalle de esa señal.

La experiencia debe enseñar y ordenar información; no debe inventar datos de contratos, convertir niveles en órdenes ni presentar una interpretación de PTS como si fuera la del autor.

## Arquitectura de navegación

1. **Home · Señales**
   - Título: “Todas las señales”.
   - Filtros de primer nivel: **Opciones · Stocks · Spot · Scalping**.
   - Cada filtro muestra una cronología horizontal ordenada de más reciente a más antigua.
   - La tarjeta activa abre el detalle de la señal.

2. **Detalle de señal**
   - Mantiene el caso COIN de Daniel como la primera señal documentada.
   - Regreso inequívoco al Home con “← Señales”.
   - Fuente de YouTube visible, con los momentos 05:27 y 15:29.
   - Gráfico y niveles neutrales, sin asignar entrada, stop, soporte, resistencia u objetivo si la fuente no lo confirma.
   - Copiloto limitado a COIN, la señal y la publicación de Daniel.

## Home: contenido de cada tarjeta

Cada tarjeta debe responder, en este orden visual:

- Tipo: Opciones, Stocks, Spot o Scalping.
- Activo: símbolo y nombre.
- Fecha de publicación.
- Autor o fuente.
- Veredicto reportado, con etiqueta “reportado por el autor” o “sin verificar” cuando corresponda.
- Estado de datos: completo, parcial o faltante.
- Acción primaria: “Abrir señal”.

Para el caso actual:

- **Opciones · COIN · Coinbase**
- Daniel Marín · 18 sep
- “Segundo objetivo reportado”
- “Fuente original disponible · contrato sin documentar”

## Estados vacíos

Stocks, Spot y Scalping no deben mostrar tarjetas ficticias. Si no existe una señal registrada, mostrar:

> Sin señales registradas  
> Esta categoría aparecerá cuando exista un reporte con fuente y fecha.

No usar “oportunidades”, “próximamente” ni lenguaje que prometa señales futuras.

## Dirección visual

- Dark terminal editorial: fondo casi negro, superficies discretas y bordes de bajo contraste.
- Dorado como acento PTS; no convertir toda la interfaz en amarilla.
- Verde y rojo únicamente para diferenciar datos visuales del gráfico, nunca como promesa de resultado.
- Tipografía jerárquica: símbolo grande, metadatos compactos, veredicto legible.
- Scroll horizontal con tarjetas anchas, una tarjeta dominante y parte de la siguiente visible para comunicar continuidad.
- Animación breve al cambiar de categoría; evitar galaxias, exceso de partículas y ornamentos que compitan con la fuente.

## Reglas de lenguaje

- Separar siempre: lo que dijo Daniel, lo que muestra el precio de la acción y lo que falta del contrato.
- Nunca completar tipo de opción, strike, vencimiento, prima, cantidad, multiplicador, comisiones, entrada, stop o P&L.
- No decir “ganancia” como hecho auditado cuando solo existe un comentario o reporte no verificable.
- No presentar una señal educativa como orden de compra o venta.
- La fuente original tiene prioridad sobre cualquier resumen generado por IA.

## Copiloto PTS

- La interacción principal es la esfera dorada con “Pregúntale lo que quieras”.
- El acceso reutiliza el login existente de Bobby; no crear una cuenta ni un flujo Apple/Google paralelo.
- El alcance está limitado a COIN, la señal y Daniel.
- Respuestas breves, en español, máximo dos minutos.
- Si la pregunta sale del alcance, responder claramente que esta sesión está limitada a COIN y la señal.

## Criterios de aceptación

- El usuario identifica los cuatro tipos de señal sin explicación externa.
- Puede distinguir Home de Señales y Detalle de señal.
- Puede volver desde COIN con un control textual evidente.
- Puede encontrar el video de YouTube y sus dos momentos.
- Una categoría sin datos no parece rota ni inventa contenido.
- No hay texto que atribuya a Daniel una función de nivel que no esté confirmada.
- Fable FI entrega una propuesta visual del Home y DeepSeek V4 Flash devuelve una crítica de claridad, jerarquía, copy y riesgos de interpretación.

## Encargo para Fable FI

> Rediseña el Home de PTS como un explorador horizontal de señales. Incluye filtros de Opciones, Stocks, Spot y Scalping, una cronología por fecha y estados vacíos honestos. La primera tarjeta real es COIN, Coinbase, reportada por Daniel Marín; el contrato está incompleto. Mantén estética dark editorial con acento dorado, jerarquía fuerte y regreso obvio al detalle. No agregues datos, rendimientos ni señales que no estén en el brief.

## Encargo para DeepSeek V4 Flash

> Audita esta propuesta de Home de PTS como revisor de UX, UI y precisión de producto. Evalúa comprensión en cinco segundos, jerarquía entre tipo/activo/fecha/veredicto, claridad del regreso al Home, estados vacíos, separación entre fuente y explicación de IA, y riesgos de que el usuario interprete la interfaz como recomendación financiera. Propón cambios concretos de copy y layout sin inventar señales ni datos del contrato de opciones.
