# Bobby Protocol — Core Message v5
**Fecha:** 2026-08-22 · **Registro:** institucional · **Reemplaza:** v4 (coloquial) y v4.1 (formal sin anclaje)

---

## 0. Las tres fallas que hay que evitar a la vez

| Versión | Falla | Ejemplo |
|---|---|---|
| Landing actual | **Abstracción** — categorías, no cosas | "Accountability infrastructure for autonomous finance" |
| v4 | **Informalidad** — un protocolo convertido en ocurrencia | "El abogado del diablo de tus inversiones" |
| v4.1 | **Sin anclaje** — formal y claro, pero empieza en el protocolo, no en el lector | "Ninguna decisión se aprueba sin ser refutada" |

v4.1 era correcto y no producía rechazo, pero exigía que al lector ya le importara el
problema. **El mensaje debe abrir donde el lector ya está parado**, y hoy el lector ya
está haciendo algo muy concreto: le pregunta a una inteligencia artificial por sus activos.

Ese es el anclaje. Todo lo demás se cuelga de ahí.

---

## 1. El momento (la tesis del mensaje)

> **Preguntar dejó de ser una ventaja. La ventaja pasó a la comprobación.**

Hace dos años, tener una opinión analítica sobre un activo en treinta segundos era un
privilegio. Hoy cualquiera la obtiene gratis, en su teléfono, en el idioma que quiera.
El acceso al análisis dejó de ser escaso.

**Lo que sigue siendo escaso es saber si esa respuesta era buena.** Esa es la segunda era,
y es donde Bobby vive: no compite con quien responde, se coloca encima.

**Categoría del producto (una línea):**
> Bobby Protocol — la capa de comprobación de la inteligencia financiera.

---

## 2. Titular y bajada

> # Preguntarle a una IA por tu activo ya no es una ventaja.

Nombra la conducta exacta del lector y se la retira. Ahí se abre el hueco que llena el resto.

**Bajada:**
> Lo hace todo el mundo, con los mismos modelos y con la misma seguridad en la voz.
> La ventaja está en lo que ocurre después: someter esa respuesta a refutación y dejarla
> registrada antes de conocerse el resultado.

**Lema del protocolo (se mantiene):**
> Refutado antes de ejecutar. Publicado antes del resultado.

**Variantes de la tesis para redes y prensa:**
- "La primera era fue preguntar. La segunda es comprobar."
- "Ya no falta quién te dé una respuesta. Falta quién la someta a prueba."
- "Una respuesta que nadie registra no es criterio: es conversación."

---

## 3. Artículo 01 — Las dos eras

Presentarlo como cuadro comparativo, no como manifiesto. El cuadro da autoridad; el
manifiesto la quita.

| | **Preguntar** | **Comprobar** |
|---|---|---|
| Quién responde | Un modelo | Un procedimiento |
| Cuándo queda registrado | Nunca | Antes del resultado |
| Si se equivoca | No pasa nada | Queda en el registro |
| Lo que se obtiene | Una opinión | Un veredicto con precio de invalidación |
| Se puede auditar | No | Sí |

**Línea obligatoria justo debajo del cuadro** (evita que el mensaje se lea como anti-IA
y desactiva la objeción más previsible):
> Bobby usa los mismos modelos. La diferencia no está en el modelo: está en el
> procedimiento que lo rodea.

---

## 4. Artículo 02 — La falla

> ## Ningún modelo lleva la cuenta de cuántas veces acertó.

Cuatro hechos verificables, en frases cortas:

> - Responde siempre. Rara vez concluye que no hay operación.
> - Responde con la misma seguridad cuando acierta y cuando se equivoca.
> - No recuerda lo que dijo la semana pasada, y nadie lo anota.
> - Está optimizado para sonar útil, no para tener razón.

**Cierre del artículo (el aforismo que sostiene todo el mensaje):**
> Si el criterio se declara después del resultado, no es criterio.
> Es el mismo principio por el que la hipótesis de un ensayo clínico se registra antes
> del experimento.

---

## 5. Artículo 03 — Las dos reglas

> **I.** Ninguna idea se aprueba sin que un sistema independiente trabaje en contra de ella.
> **II.** Ningún veredicto se publica después de conocerse su resultado.

La forma de regla es lo que sostiene la formalidad: un protocolo es un conjunto de reglas,
y el mensaje debe tener la forma de lo que vende.

---

## 6. Artículo 04 — El procedimiento

| # | Etapa | Texto |
|---|-------|-------|
| 01 | **Sustentación** | La idea se presenta con su fundamento: qué se espera, por qué y en qué plazo. |
| 02 | **Refutación** | Un segundo sistema trabaja en contra: el dato que la rompe, el precedente donde ya falló, el escenario que no se consideró. |
| 03 | **Control de riesgo** | Reglas fijas pueden vetar la operación aunque el análisis sea favorable. El veto no se apela. |
| 04 | **Veredicto** | Qué hacer, a qué precio la idea queda invalidada y bajo qué condición se cancela. |

Numerar es correcto aquí: es una secuencia real y el orden es la garantía.

---

## 7. Artículo 05 — El registro (datos reales, 2026-08-22)

Fuente: `/api/bobby-protocol-stats` → `debateActivity`.

| Estado | Decisiones |
|---|---|
| Con resultado conocido | **794** |
| — Acertadas | 433 |
| — Falladas | 244 |
| — Sin variación relevante | 117 |
| Pendientes de resolución | 70 |
| **Total publicado antes del resultado** | **864** |
| Tasa de acierto sobre resueltas | **54.5%** |

**Nota metodológica** — publicar siempre junto a la cifra:
> La tasa se calcula sobre las 794 decisiones con resultado conocido e incluye las neutras
> en el denominador. Las pendientes no se retiran del conteo. Los fallos se publican con el
> mismo tratamiento que los aciertos.

⚠️ **Condición para publicar estas cifras.** El historial reside en la base de datos y en los
contratos de **X Layer** (última actividad on-chain: 2026-04-14). Los contratos de **Base**
están desplegados y en **cero** (`totalCommitments: 0`). Si el texto afirma "registro público
verificable", el enlace debe llevar al lugar donde el registro efectivamente está:
1. "864 decisiones registradas — histórico en X Layer, en migración a Base", con enlace a X Layer, o
2. publicar las cifras sin el término "on-chain" hasta que Base tenga volumen propio.

Exhibir 864 decisiones enlazando a un contrato vacío es exactamente la práctica que el
protocolo declara combatir.

---

## 8. Artículo 06 — Alcance y límites

> - No custodia fondos ni accede a cuentas de terceros.
> - No ejecuta órdenes. La ejecución corresponde a quien opera.
> - No constituye asesoría de inversión ni promete rendimiento alguno.
> - Un veredicto favorable no es una recomendación de compra: es la constancia de que una
>   idea sobrevivió a su refutación.

Publicar los límites como sección propia es la señal de seriedad más eficaz que existe.
Todo el mercado hace lo contrario.

---

## 9. Copy listo para la landing

### Hero
```
Eyebrow:  Bobby Protocol · La capa de comprobación de la inteligencia financiera
H1:       Preguntarle a una IA por tu activo
          ya no es una ventaja.
Sub:      Lo hace todo el mundo, con los mismos modelos y la misma seguridad en
          la voz. La ventaja está en lo que ocurre después: someter esa respuesta
          a refutación y dejarla registrada antes de conocerse el resultado.
CTA-1:    Consultar un veredicto
CTA-2:    Ver el procedimiento
Pie:      Refutado antes de ejecutar. Publicado antes del resultado.
```

### 01 — Las dos eras
```
Eyebrow:  01 / Las dos eras
H2:       La primera era fue preguntar.
          La segunda es comprobar.
Cuadro:   Preguntar / Comprobar (5 filas, ver Artículo 01)
Nota:     Bobby usa los mismos modelos. La diferencia no está en el modelo:
          está en el procedimiento que lo rodea.
```

### 02 — La falla
```
Eyebrow:  02 / La falla
H2:       Ningún modelo lleva la cuenta
          de cuántas veces acertó.
Lista:    Responde siempre. · Responde con la misma seguridad cuando acierta y
          cuando se equivoca. · No recuerda lo que dijo la semana pasada. ·
          Está optimizado para sonar útil, no para tener razón.
Cierre:   Si el criterio se declara después del resultado, no es criterio.
```

### 03 — Las dos reglas · 04 — El procedimiento · 05 — El registro · 06 — Límites
Ver artículos 03 a 06.

### English
```
Category: The verification layer for financial intelligence.
H1:       Asking an AI about your asset
          is no longer an edge.
Sub:      Everyone does it, with the same models and the same confident tone.
          The edge is what happens next: putting that answer through refutation
          and recording the verdict before the outcome exists.
Eras:     The first era was asking. The second is verifying.
Flaw:     No model keeps score of how often it was right.
Line:     A judgment declared after the outcome is not a judgment.
Lockup:   Refuted before execution. Published before the outcome.
```

---

## 10. Versión hablada (35 segundos)

> "Hace dos años, tener un análisis de un activo en treinta segundos era un privilegio.
> Hoy cualquiera se lo pregunta a una IA y lo obtiene gratis. Preguntar dejó de ser una ventaja.
>
> El problema es que ese modelo responde siempre, responde con la misma seguridad cuando
> acierta y cuando se equivoca, y nadie lleva la cuenta de cuántas veces tuvo razón.
>
> Bobby Protocol es la capa que va encima. Cada idea pasa por un procedimiento fijo: se
> sustenta, un segundo sistema trabaja en contra para intentar romperla, una regla de riesgo
> puede vetarla, y se emite un veredicto con el precio exacto en el que la idea queda
> invalidada. Ese veredicto se publica antes de que exista un resultado.
>
> Usamos los mismos modelos que todos. La diferencia es el procedimiento — y que llevamos
> 864 decisiones registradas así, con sus fallos incluidos.
>
> El protocolo no custodia fondos ni ejecuta órdenes. Certifica el criterio, no el dinero."

---

## 11. Reglas editoriales v5

1. **Abrir en la conducta del lector**, no en el producto. Primero lo que ya hace, después
   por qué no alcanza, después el protocolo.
2. **Enunciar reglas, no atributos.** "Ninguna decisión se aprueba sin ser refutada" en
   lugar de "verificación rigurosa".
3. **Nunca posicionarse como anti-IA.** Bobby corre sobre los mismos modelos; el argumento
   es de procedimiento, no de tecnología. Omitir esta línea invita la objeción más obvia.
4. **Prohibidas arriba del pliegue:** *agente, on-chain, thesis, accountability, adversarial,
   harness, MCP, x402, debate*. Permitidas: *protocolo, comprobación, verificación, veredicto,
   refutación, registro*.
5. **Prohibidas siempre:** metáforas de personaje (abogado del diablo, guardián, copiloto),
   signos de exclamación, emojis en texto de producto, y la palabra "revolución".
6. **La afirmación de era va en cuadro comparativo, no en manifiesto.** El cuadro da
   autoridad; el manifiesto la quita.
7. **Toda cifra va acompañada de su método** y enlaza al lugar donde el dato reside.
8. **Los fallos aparecen junto a los aciertos**, con el mismo tamaño tipográfico.
9. **Publicar los límites**, siempre, como sección propia.
10. **Voz:** impersonal y afirmativa. Ni "tú" ni "usted" en el cuerpo; el titular es la única
    excepción, porque ahí el señalamiento directo es el mecanismo.

---

## 12. Adenda v5.1 — la línea de consumidor (2026-09-03)

Cerrada con Anthony tras ocho iteraciones para el video promocional (`docs/video/bobby-promo-v2/`).
Es la traducción de la tesis v5 ("la ventaja pasó a la comprobación") a lo que le importa a
alguien que ya le pregunta a ChatGPT por sus activos. **Es la línea que se usa en cualquier pieza
de consumidor** (video, anuncios, bio de redes, App Store) cuando hay que decir qué hace Bobby en
una frase:

> **ES:** ChatGPT te responde. Bobby comprueba el mercado antes de responder.
> **EN:** ChatGPT answers. Bobby checks the market first.

Por qué ganó:
- Nombra el mercado. Sin eso, Bobby se lee como un chatbot generalista (falla detectada en la landing del protocolo: una lectora no supo qué hacía Bobby Protocol).
- Dice el orden: Bobby también responde, pero después de comprobar.
- Cero vocabulario de protocolo: no dice veredicto, debate, refutación, registro, on-chain ni agentes.
- Fluye como habla la gente, no como tres slogans engrapados (feedback explícito de Anthony).

Descartadas en el camino: "veredicto desafiado + registro antes del resultado" (técnico);
"ChatGPT nunca te va a decir que no" (ChatGPT sí pone avisos genéricos de riesgo; atacable);
"Bobby pone a prueba el mercado" (Bobby prueba la respuesta, no el mercado).

Relación con v5: no la reemplaza. v5 sigue siendo la doctrina institucional del protocolo. Esta
línea es la puerta de entrada; el "cómo" (procedimiento, registro, límites) vive detrás de ella.
Cuando se nombre a ChatGPT en una pieza pública, que sea en el gancho, no en el cierre: la marca
de Bobby no cuelga de la de otro.
