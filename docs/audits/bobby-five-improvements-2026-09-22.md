# Cinco mejoras propuestas para Bobby

Propuesta del 22 de septiembre de 2026, basada en la revisión de la aplicación nativa y su historial. Estas cinco propuestas son trabajo futuro; la preferencia de silencio persistente se implementa por separado en esta entrega.

| Prioridad | Mejora | Resultado para la persona | Alcance inicial y validación |
|---|---|---|---|
| 1 | **Voz solo cuando la pido** | Puede leer en silencio y escuchar una respuesta concreta sin activar todas las voces automáticas. | Añadir un modo «A petición» y un botón «Escuchar este análisis» junto al veredicto existente. La síntesis se solicita al pulsarlo; el saludo no interrumpe. Comprobar las tres preferencias: automática, a petición y silencio. |
| 2 | **Cambiar el estilo después del onboarding** | Puede probar otro compañero, idioma de voz o estilo sin reiniciar su experiencia. | Un panel «Mi compañero» que reúna la galería existente, Chill / Directo / Pro y sus muestras. Guardar la elección y respetar siempre el silencio. La voz del análisis siguiente debe corresponder a la combinación elegida. |
| 3 | **Antigüedad de datos fácil de entender** | Distingue una lectura reciente de datos viejos y sabe cuándo actualizar. | El backend ya entrega `asOf` y la vista muestra un `evidenceLabel`. Convertirlo en «Datos de hace X min», con fuente e intervalo legibles, estado de datos desactualizados y acción de actualizar. Probar reloj, zona horaria y respuestas tardías. |
| 4 | **Revisión semanal de decisiones** | Comprende qué aprendió, más allá de desbloquear una pieza o acumular XP. | Aprovechar los horizontes de Trader Land: reunir la tesis inicial, qué la invalidaba y qué se observó al cerrar el horizonte. Dar una reflexión breve y permitir corregir la interpretación; medir revisiones completadas, sin premiar operar más. |
| 5 | **Un control de calidad obligatorio para cada versión iOS** | Conserva funciones que ya le gustaban y recibe una actualización con evidencia visible de sus cambios. | Incorporar al proceso de entrega la matriz de avatares/idiomas, mute persistente, onboarding, capturas y archivo firmado. La CI actual corre principalmente Node, Postgres y contratos; estas pruebas nativas se han ejecutado localmente. Un cambio que apague una función debe quedar explícito en la revisión del producto. |

Empezaría por **1 y 5**: control inmediato de la experiencia y prevención de otra regresión como la de las voces. Después, 2 y 3; la revisión semanal requiere acordar qué información conservar y cómo presentarla.

Fuentes del estado actual: `NeuralVoice.swift`, `CompanionOnboarding.swift`, `ContentView.swift` (veredicto escrito y etiqueta de evidencia), `BobbyAPI.swift` (`asOf`), las vistas de Trader Land y `.github/workflows/ci.yml`.

Como referencia de diseño, las guías de Apple describen los controles de reproducción y las distintas formas en que una persona consume audio: [Playing audio](https://developer.apple.com/design/human-interface-guidelines/playing-audio). También recomiendan contemplar las formas de interacción accesibles y las preferencias de cada persona: [Accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility). Las cinco prioridades de esta propuesta son una valoración del producto, no una certificación de Apple.
