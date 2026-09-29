# Niveles del desk: evaluación pareada sobre evidencia congelada (2026-09-29)

**Qué se midió.** 8 preguntas reales (BTC, ETH, SOL, DOGE, NVDA, TSLA, AAPL y MSFT; 5 en español y 3 en inglés). La evidencia se cargó **una sola vez** por caso y quedó congelada en `docs/ai/data/2026-09-29-levels-paired-eval.json`. Los cuatro brazos corrieron sobre esa misma evidencia:

- **BASELINE**: lo que corría prod antes de hoy: gpt-4o-mini ×3 con los prompts viejos, evidencia 1H y el mismo guard de salida.
- **RÁPIDO**: el pipeline enviado (`runDeskDebate`), con evidencia 1H.
- **PROFUNDO** y **MÁXIMO**: el mismo pipeline, con evidencia v2.

Dos jueces ciegos puntuaron las cuatro respuestas de cada caso, anonimizadas (A–D) y en orden barajado: claude-sonnet-5-5 (effort medium) y gpt-6-sol (reasoning medium). El código corrió en el commit `1dfbc0f`. Script: `scripts/eval/desk-levels-paired.mts`.

## Resultado por brazo (n = 8 por brazo; escala 1–10)

| Brazo | Overall Sonnet | Overall Sol | **Promedio** | Δ pareado vs BASE | Responde | Evidencia | Huecos | Claridad | Utilidad | p50 / p95 | $/pregunta | Guard | wait/review |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| BASELINE | 4.00 | 5.75 | **4.88** | — | 5.25 | 6.69 | 4.00 | 6.69 | 3.88 | 4.0 / 4.7 s | $0.00034 | 0 | 8/0 |
| RÁPIDO | 5.75 | 8.50 | **7.13** | +2.25 (gana 8/8) | 7.19 | 8.50 | 8.38 | 8.13 | 6.25 | 12.7 / 14.4 s | $0.00071 | 0 | 8/0 |
| PROFUNDO | 7.75 | 9.00 | **8.38** | +3.50 (gana 8/8) | 8.44 | 8.56 | 8.31 | 7.88 | 8.13 | 14.9 / 17.4 s | $0.0104 | 0 | 7/1 |
| MÁXIMO | 9.13 | 7.88 | **8.50** | +3.63 (gana 8/8) | 9.06 | 7.69 | 8.88 | **6.44** | 9.06 | 21.8 / 23.6 s | $0.0389 | 0 | 8/0 |

Cada criterio es el promedio de los dos jueces. No hubo rechazos del guard ni errores (0/32). La latencia solo cubre el debate: no incluye la carga de evidencia, que en v2 añade marcos temporales. Gasto total: $0.40 en brazos + $0.26 en jueces = **$0.67**. Wall time: 78 s.

## Lectura

- **Los tres niveles le ganan al baseline en los 8 casos, según ambos jueces.** El salto más grande está en "Huecos": pasa de 4.0 a más de 8.3. La nota de suficiencia (L0) funciona: Rápido dice qué marcos faltan en los 5 casos con horizonte de semana o mes. El baseline nunca lo hace.
- **Rápido es la mejor relación calidad/costo:** +2.25 puntos por unos $0.0004 más por pregunta. Su punto débil es "Utilidad" (6.25): da poco que vigilar y casi nunca da una invalidación.
- **Máximo no justifica su precio frente a Profundo.** Queda +0.12 en overall, cuesta 3.7× más y tarda 7 s más.
  - **Pierde en "Evidencia"** (7.69 vs 8.56). Revisé dos errores a mano:
    - AAPL: dice que el precio está "~1.3% bajo la resistencia 345.3", cuando la distancia real es 2.0% desde 338.4.
    - TSLA: dice que 357.5 está "sobre la EMA50 diaria de 362.1", cuando está debajo.
  - **Pierde en "Claridad"** (6.44). Ahí **ni siquiera le gana al baseline** (6.69): es denso para un novato.
- **Los jueces no coinciden en qué nivel es mejor.** Sonnet ordena Máximo > Profundo > Rápido. Sol ordena Profundo > Rápido > Máximo. Hay un posible sesgo de familia: Sonnet juzga texto de Sonnet (en Máximo son todos los roles; en Profundo, el CIO), y Sol juzga texto de luna. Sonnet no detectó ninguno de los dos errores aritméticos de Máximo; Sol detectó ambos.
- **El veredicto casi no se mueve:** 31 de 32 respuestas son `wait`. La única excepción es Profundo en NVDA (`review/long`). Las diferencias están en la explicación, no en la decisión. Esta prueba no dice nada sobre la calidad de un `review`.

## Ejemplo (BTC, "¿Conviene entrar a BTC esta semana o esperar?")

- **BASELINE (CIO):** "…El RSI de 57.8 sugiere que no está sobrecomprado ni sobrevendido… podría ser prudente esperar a que el precio se acerque a la resistencia o soporte antes de tomar una decisión." No menciona el horizonte semanal ni dice qué falta.
- **RÁPIDO (síntesis):** "Para esta semana, esperar: los datos disponibles no confirman una tendencia." · Riesgo: "Faltan datos de 4H y diario para evaluar el horizonte semanal." · Vigilar: "Observar si BTC supera 84.374,2 y confirma en marcos mayores."

## Límites de esta prueba

- **La muestra es chica:** 8 casos, una sola corrida y temperatura del proveedor. Sin intervalos de confianza, una diferencia menor a ~1 punto entre niveles no es concluyente.
- **Los jueces son LLMs y el ciego es solo de etiqueta, no de formato.** El rebuttal y los escenarios delatan a Máximo, y la síntesis delata a los niveles frente al baseline. Además, las respuestas más largas pueden recibir mejor nota.
- **Hay artefactos de los jueces:**
  - Sonnet castigó a Rápido por decir que "falta el diario". Rápido de verdad solo tenía 1H, y el prompt del juez lo advertía; su nota de Rápido probablemente está subestimada.
  - Sol castigó las menciones al "registro de Bobby" como no sustentadas, porque el prompt del juez no explicaba qué es `evidence.record`. Esto afecta un poco a Profundo y a Máximo.
- **Condiciones de ejecución:**
  - Los 4 brazos corrieron en paralelo, 4 casos a la vez, así que la latencia puede estar algo inflada por contención.
  - En v2, las acciones no tienen marco 1W, por lo que la evidencia sigue siendo insuficiente para preguntas a un mes.
  - Los jueces no vieron `watchLevel` ni `followUp`, que llegaron en `1dfbc0f`.

## Ronda 2 — posiciones precalculadas (misma evidencia congelada)

Tras la ronda 1, el servidor calcula dónde está el precio frente a EMA20, EMA50, soporte y resistencia (lado y distancia en %) y los modelos solo lo citan (`pricePosition` en `api/_lib/desk-debate.ts`). Mismos 8 casos, misma evidencia, jueces nuevos:

| Brazo | Sonnet | Sol | **Prom.** | Δ vs base | grounding | claridad | utilidad | p50 / p95 | $/pregunta |
|---|---|---|---|---|---|---|---|---|---|
| BASELINE | 4.00 | 5.88 | **4.94** | — | 6.75 | 7.06 | 4.06 | 4.2 / 7.5 s | $0.00034 |
| RÁPIDO | 6.25 | 8.50 | **7.38** | +2.44 (8/0) | 8.50 | 7.63 | 6.56 | 15.3 / 17.0 s | $0.00092 |
| PROFUNDO | 7.50 | 8.75 | **8.13** | +3.19 (8/0) | 8.38 | 7.75 | 7.81 | 17.2 / 23.5 s | $0.0117 |
| MÁXIMO | 9.00 | 7.88 | **8.44** | +3.50 (8/0) | 7.94 | 6.63 | 9.13 | 21.0 / 27.0 s | $0.0432 |

Lectura: la mejora de grounding de Máximo es pequeña (7.69 → 7.94) y dentro del ruido de 8 casos; la claridad sigue siendo su punto débil (la síntesis primero lo compensa en la interfaz). El costo sube ~10–30 % por los tokens de las posiciones. Datos: `docs/ai/data/2026-09-29-levels-paired-eval-r2.json`.
