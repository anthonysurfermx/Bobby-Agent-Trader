# Bobby proactivo: plan de la siguiente capa agéntica

Estado: **aprobado por Anthony el 2026-11-12**. Construido: el servidor de la capacidad 1 (vigías), apagado tras `BOBBY_AGENT_WATCHES`; ver "Watches" en `README.md`. Pendiente: el lado del iPhone y las capacidades 2 a 4.

Cambio respecto a lo propuesto abajo: en esta primera versión un vigía no se crea con una herramienta del modelo sino eligiendo entre valores fijos, y la respuesta al cumplirse la escribe el código. Así cuesta US$0 de modelo y no cambia las instrucciones del motor, que están medidas con conjuntos ciegos. Crear un vigía hablando queda para una segunda pasada.
Leído sobre `origin/main` en `6c0e5167` (2026-11-12). Precios y parámetros de Anthropic tomados de la referencia de la API con fecha 2026-11-03. Los costes por uso son estimaciones salvo donde dice "medido".

## A. Dónde está Bobby hoy

**Bobby solo habla cuando le hablan.** Lo único que inicia por su cuenta es esto:

| Qué inicia | Cómo funciona de verdad | Por qué no se siente proactivo |
|---|---|---|
| Resumen semanal (Pro) | Cron cada 5 min (`api/briefing-worker.ts`), un solo ritmo adoptado: lunes 08:00. Una narrativa compartida por idioma sobre un universo fijo de 17 activos; la parte "personal" es una selección determinista de secciones (`briefings/compose.ts`: "Nothing here writes new prose"). Push por APNs con texto genérico. | Llega el lunes pase lo que pase. No nace de nada que le haya cambiado a la persona. |
| Seguimientos (1.8) | Los planifica el teléfono (`HarnessPlanner.swift`) como notificaciones locales: al día siguiente, a los 3 o 7 días, el lunes. | Son momentos en el calendario. El propio código lo dice: "Nothing here says the market did anything". |
| Recordatorios de tesis (1.8) | Notificación local en la fecha que eligió la persona (`ReminderCenter.swift`). La tesis vive solo en el teléfono (`ThesisBook.swift`). | "Bobby watches nothing in the meantime": si pasa justo lo que la persona escribió que le haría cambiar de opinión, Bobby no se entera. |
| Noticias de producto | Campañas manuales de administrador con texto fijo (`api/push-news.ts`). | No son sobre el mercado ni sobre la persona. |

**El motor de agente existe, pero nadie lo ve.**

- En producción como piloto privado desde 2026-10-13. Un encargo comparó Nvidia y Bitcoin en 11,6 s; dos encargos costaron US$0,047 (medido, Sonnet 5.5).
- **Ningún cliente lo llama.** El iPhone usa 19 rutas de `/api/` y `/api/agent-task` no es una de ellas.
- **No hay trabajo que sobreviva a una petición.** El README lo dice: "a task advances only when its owner asks again". El cron de `agent-task` solo borra encargos viejos.
- Dos herramientas (`resolve_assets`, `read_assets`), 14 instrumentos, ventanas de 30 o 60 días. Sin noticias, sin calendario, sin fundamentales.
- El dueño de un encargo es la instalación (hash con sal); los avisos push están ligados a una cuenta con sesión. Hoy no hay puente entre los dos.

**Cómo se llama hoy a los modelos.**

- Todo por HTTP directo (`api/_lib/llm.ts`, `agent/provider.ts`, `briefings/providers.ts`); los SDK están instalados y esta ruta no los usa. Es deliberado: un solo intento por llamada, con dinero reservado antes.
- Anthropic: Haiku 5.5 para cuentas gratis y el compañero, Opus 5.5 para Pro (desde el PR #163), Sonnet 5.5 para el motor. Se usa `output_config.effort`, salida JSON con esquema y caché de 5 minutos solo sobre las instrucciones.
- OpenAI: Chat Completions (`gpt-6-luna`) como alternativa o primario según `BOBBY_LLM_PRIMARY`, Realtime para la voz, TTS y transcripción.
- **No se usa en ningún sitio:** búsqueda web, citas, lotes, herramientas `strict`, caché sobre la conversación, ni la API Responses de OpenAI.

## B. Capacidades proactivas, por impacto para la persona

### 1. Vigías: "avísame cuando…"

Un encargo con condición que termina solo. La persona dice "avísame si Nvidia cae más de 5 % esta semana"; Bobby vigila y, cuando pasa, lee, escribe la respuesta y avisa.

- **En el iPhone.** Tras una lectura, o por voz, una tarjeta de una línea sobre el cristal: `NVDA · cae 5 % · hasta el viernes` y un botón **Vigilar**. La esfera no cambia. Un punto junto al avatar indica vigías activos. Cuando se cumple: notificación con el nombre del activo y nada más (misma regla que los seguimientos); al abrirla, la respuesta ya está en el cristal. Si vence sin cumplirse, una línea lo dice al volver, sin push.
- **En el servidor.** Herramienta nueva `watch_assets` con la misma tarjeta de aprobación que `read_assets`. Tabla de vigías. Una etapa nueva en el cron que comprueba las condiciones **en código**, con el lector estricto que ya existe y una sola lectura de precios por activo para todos los vigilantes. Al cumplirse, ejecuta la lectura aprobada y encola el push por el APNs que ya usan los briefings. Puente dueño del encargo ↔ cuenta: un vigía exige sesión iniciada y permiso de notificaciones.
- **Coste.** Crear: una llamada para preparar la tarjeta, ≈ US$0,01. Vigilar: US$0 de modelo. Al cumplirse: ≈ US$0,01–0,02. **Total ≈ US$0,02–0,04 por vigía**, y solo se paga la segunda parte si se cumple.

Es también la base de las otras tres: trae el primer cliente del motor en el iPhone, el trabajador que avanza encargos sin su dueño y el push por encargo.

### 2. Tu tesis, vigilada

De lo que la persona escribió en "qué me haría cambiar de opinión", Bobby propone hasta tres vigías. Ella los aprueba uno a uno. Cuando uno se cumple, Bobby revisa la tesis con evidencia.

- **En el iPhone.** Al guardar una tesis, una línea: "¿Quieres que vigile esto?" con las condiciones propuestas como fichas. El aviso abre la revisión de tesis que ya existe (`ThesisReviewSheet`).
- **En el servidor.** Una llamada que convierte el texto en condiciones comprobables, con esquema estricto; lo que no se puede comprobar con datos se dice y no se vigila. Al cumplirse, el revisor de tesis que ya corre en `desk-debate`.
- **Coste.** Propuesta ≈ US$0,01 por tesis. Revisión al cumplirse ≈ US$0,01–0,03.
- **Decisión tuya.** Hoy la tesis no sale del teléfono. Para revisarla sola, su texto tiene que guardarse en el servidor mientras el vigía viva. Alternativa sin guardar nada: el servidor solo avisa y el teléfono manda la tesis al abrir.

### 3. Lo que cambió para ti

Un resumen que solo existe cuando algo cambió en los activos que la persona sigue, pregunta o tiene en una tesis. Si no cambió nada, silencio.

- **En el iPhone.** La misma bandeja y el mismo lector de resúmenes de hoy. Tres frases y la voz del compañero. Como mucho uno al día.
- **En el servidor.** Cada noche, código decide por persona si algo cruzó su umbral (un movimiento mayor que el habitual del activo, un nivel de un vigía cercano, un cambio de tipos confirmado: `macro-events.ts` ya lo planifica y está apagado). Solo para quien tenga algo, una llamada a Haiku 5.5 escribe las frases; los números los pone el código, como en el motor.
- **Coste.** ≈ 2.500 tokens de entrada y 400 de salida en Haiku 5.5: US$0,00045; por lotes, la mitad. **Menos de US$0,01 al mes por persona.** El audio, si se narra, ≈ US$0,01 por resumen (estimación de `briefings/config.ts`).

### 4. Investígalo: encargos largos con fuentes

"¿Por qué cayó Nvidia hoy?" Bobby busca en fuentes permitidas, lee, responde con citas y avisa cuando termina. Es el encargo que de verdad tarda, y por eso el que justifica "termina solo".

- **En el iPhone.** La tarjeta de aprobación dice "busca en la web · 1 lectura". La persona puede cerrar la app. La respuesta llega con sus fuentes enlazadas.
- **En el servidor.** Herramienta de búsqueda web de Anthropic con lista de dominios permitidos y tope de búsquedas. El segundo lector revisa el texto como hoy. Bobby explica qué se publicó; no dice qué hacer.
- **Coste.** Cinco búsquedas (US$0,05) más unos 30.000 tokens de resultados en Sonnet 5.5 (US$0,06) más la respuesta: **≈ US$0,10–0,15 por encargo**. Es la capacidad cara: candidata a ser de Pro.

## C. Cambios en el uso de las APIs que las habilitan

| Cambio | Para qué | Nota |
|---|---|---|
| `strict: true` en las herramientas del motor | La condición de un vigía tiene que ser válida siempre (1, 2) | Sonnet 5.5 rechaza forzar una herramienta (`tool_choice` `any`/`tool` da 400): se usa `auto` más `strict`. `llm.ts` ya lo esquiva para los modelos 5.5. |
| Caché también sobre la conversación | Las llamadas 2ª y 3ª de un encargo y las de un mismo tick del cron pagan la décima parte del prefijo (1, 2, 4) | Hoy solo se marcan las instrucciones. Lectura de caché en Sonnet 5.5: US$0,10 por millón. Mínimo cacheable: 512 tokens. |
| Lotes (Message Batches) | Los resúmenes nocturnos a mitad de precio (3) | La mayoría termina en menos de una hora, máximo 24: se lanzan con margen y se conserva el resumen "solo hechos" de hoy como respaldo. |
| Búsqueda web del servidor (`web_search_20260209`) | Investígalo (4) | US$10 por 1.000 búsquedas. La reserva de dinero del motor tiene que incluir el tope de búsquedas. Las citas no se pueden combinar con salida JSON con esquema. |
| Esfuerzo por tarea | Preparar una tarjeta en `low`, revisar una tesis en `medium` | En Sonnet 5.5 y Opus 5.5 el pensamiento no se puede apagar; el esfuerzo es el único control. |
| Herramientas nuevas en la sesión Realtime de OpenAI | Crear un vigía hablando | La sesión de voz ya tiene herramientas (`voice-tools.ts`); se añade una que abre la tarjeta. |

**Lo que no propongo adoptar, y por qué.**

- **Memoria escrita por el modelo** (herramienta de memoria, almacenes de memoria). La memoria de Bobby es una lista que la persona ve, corrige y borra, y "nothing here is ever inferred". Notas libres del modelo rompen eso.
- **Agentes gestionados por Anthropic con despliegues programados.** Lo que hace fiable al motor (dinero reservado antes de cada llamada, aprobación ligada a lo que se ejecuta, números escritos por código) vive en su propio bucle. El cron de Vercel basta para vigilar.
- **API Responses de OpenAI, su búsqueda web y su modo en segundo plano.** No los he verificado contra su documentación para los modelos `gpt-6`. Antes de construir nada sobre ellos hay que leerla.

## D. Qué necesito de ti antes de construir

1. **Visto bueno al orden**, o que lo cambies. Propongo empezar por los vigías.
2. **Privacidad.** Un vigía guarda la pregunta y su condición hasta que se cumple o vence (propongo 30 días como máximo). El borrador actual habla de 24 horas. Hay que ampliar `PRIVACY-DRAFT.md` y necesita tu sí; mientras tanto se construye detrás del piloto.
3. **Límites.** Propongo 3 vigías activos gratis y 10 en Pro.
4. **Tesis** (capacidad 2): ¿se guarda el texto en el servidor mientras se vigila, o solo avisa?

Primera entrega tras tu sí: vigías de punta a punta en una rama con PR en borrador, detrás de `BOBBY_AGENT_ENGINE=pilot`. La migración, el despliegue y cualquier evaluación con crédito de Anthropic esperan tu confirmación aparte.
