# Decisión — arquitectura del acompañante (Claude + Codex, 2026-10-09)

Síntesis de Claude (head of product de este frente) sobre la propuesta de Codex en
`output/bobby-companion-architecture-2026-10-09/architecture.md`. Es el estado acordado hasta nuevo aviso.
Nada de esto está construido ni desplegado. Cada despliegue, migración, texto de privacidad o build necesita el sí de Anthony.

## Lo que queda decidido

| Tema | Propuesta de Claude | Codex | Decisión | Por qué |
|---|---|---|---|---|
| Nota de Sonnet antes del desk, hacia el CIO | Paso 1, en cada lectura | No: el CIO decide y redacta en la misma llamada, así que una nota "solo para redactar" puede mover el veredicto. Probar en sombra | **Gana Codex. La nota no entra al CIO.** | Una instrucción en el prompt no es una garantía, y costaría entre 6 y 11 veces una lectura gratuita sin beneficio medido |
| Adaptar la respuesta del desk a la persona | Dentro del CIO | Solo después de congelar la lectura completa, en una etapa aparte | **Gana Codex. Queda para después**, cuando se apruebe separar decidir de redactar | Es la única forma de garantizar que la persona no cambia el juicio financiero |
| Pregunta sin activo | Endpoint nuevo | `POST /api/companion-turn`; la persona confirma antes de abrir el desk y gastar una lectura; cupo aparte | **De acuerdo.** | `symbol` opcional rompería los teléfonos instalados |
| "Mi plan" | Evolucionar la tesis | Un plan activo, intención y no ejecución; "Ya empecé" es una declaración corregible | **De acuerdo.** | Nada prueba que la persona invirtió |
| Guarda de gasto | No la revisé | Falla abierta: cachea 60 s y deja pasar si no puede leer el gasto | **Confirmado por Claude** en `api/_lib/llm-usage.ts`. El acompañante falla cerrado y lleva tope propio | Una conversación es un bucle que puede no terminar |
| Reparto y orden | Claude servidor, Codex nativo | Igual; contratos y fixtures primero; no fusionar toda la pila | **De acuerdo.** | |

## Dos decisiones que agrega Claude

1. **El lugar de Sonnet es el acompañante, no el desk.** Anthony pidió Sonnet para entender a la persona. En el turno sin activo no hay veredicto que contaminar: ahí "entender a la persona" es todo el trabajo. La comparación de veinte preguntas se hace ahí, Haiku contra Sonnet, midiendo claridad, errores, costo y latencia a ciegas. Sonnet se queda solo si gana con claridad.
2. **La web primero.** La web se despliega sin build. La prueba más chica ("Nunca he invertido, ¿por dónde empiezo?" contestada alrededor del orbe, sin ticker ni veredicto) puede vivir esta semana en la web detrás de un interruptor, mientras la rama nativa espera su build.

## El piloto v0, lo más chico

- Servidor: `POST /api/companion-turn` detrás de `BOBBY_COMPANION_ENABLED` (apagado por defecto), con el contrato de los ejemplos de Codex.
- **Sin `context` en v0:** solo pregunta, idioma y `speech`. Así no viaja ningún dato personal nuevo y no cambia nada de privacidad. El contexto llega en v1, con la revisión de privacidad hecha.
- Filtros: sin cifras de mercado, rendimientos ni productos recomendados; respuesta de reserva si el modelo los escribe.
- Cupo de orientación propio, aparte de las lecturas. Falla cerrado si no se puede leer el presupuesto.
- Consumo registrado en la superficie `desk`, con rol `companion`, para que la guarda existente lo vea sin migración.
- Fixtures compartidos en `shared/harness/companion-contract-v1/`.

## Abierto

- **Para Codex, de la adenda del brief (preguntas 8 y 9), que su respuesta no cubre:** Anthony pone el apetito de riesgo como lo primero que Bobby debe entender, luego la prisa por ver resultados, luego el tipo de activos. ¿Dónde vive eso (propuesta: en "mi plan", en palabras de la persona) y cómo se muestra la peor caída histórica de un activo, que necesita historia diaria y semanal y evidencia fechada?
- **Para Codex:** el cupo de dos turnos de orientación al día deja a un recién llegado sin respuesta a la tercera pregunta de su primera sesión. Claude propone más margen para invitados; depende del costo medido.
- **Para Anthony:** autorizar a Codex a publicar sus tres candidatos como borradores; aprobar el piloto v0 en la web; una llave de proveedor en esta máquina para la comparación de modelos (la pone él, no se comparte en el chat); cuántos turnos gratuitos al día.
