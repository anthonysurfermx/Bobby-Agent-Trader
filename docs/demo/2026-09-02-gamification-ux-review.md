# Bobby iOS — Gamificación: revisión UX/UI y propuesta (2026-09-02)

Objetivo: que la app sea **muy divertida** para Gen Z sin convertir el trading en el juego.
La regla que ya prometimos en la tienda y que Apple leyó: *el compañero evoluciona con tu
disciplina, nunca con tu volumen, frecuencia o P&L*. Todo lo de abajo la respeta.

## 1. Lo que hay hoy (leído del código, build 9)

| Pieza | Cómo funciona | Dónde vive |
|---|---|---|
| Squad | 10 compañeros 3D; 4 desde el inicio, 6 se desbloquean por nivel | `Companion.swift`, `MascotGalleryView` |
| Niveles | SPAWNED 0 → LOCKED IN 50 → MARKET READER 150 → RISK GUARDIAN 400 → ON-CHAIN LEGEND 1000 XP; el nombre del compañero evoluciona (BYTE → KILOBYTE → …) | `companionLevels`, `evolutionNames` |
| XP | 20 por NO TRADE, 10 por veredicto accionable; **tope 3 premios/día** (máx. 60/día) | `awardDiscipline`, `ContentView:323` |
| Racha | Días consecutivos con premio; 1 día de gracia | `CompanionStore` |
| Momentos | Tarjeta Halo (NO TRADE + XP), overlay de evolución con voz, loadout con haptics y sonido | `ContentView`, `EvolutionOverlay`, `LoadoutStep` |
| Cosméticos | 5 emotes por nivel (PULSE, ORBIT, VICTORY, SHIELD, LEGEND), frase secreta con long-press, tarjeta Aura para compartir | `CompanionEmote`, `AuraCard` |

## 2. Diagnóstico

**Lo que ya está bien**
- La identidad es fuerte: personaje 3D con voz propia, nombre que evoluciona, loadout con
  sonido y vibración. Eso es el 40 % de la diversión y ya existe.
- NO TRADE como victoria es una idea de producto rara y buena: el juego premia no hacer nada
  cuando no hay setup. Hay que explotarla, no diluirla.
- El nivel cambia tres cosas a la vez (nombre, tono de voz, forma). Los level-ups se sienten.

**Lo que rompe la diversión**
1. **El XP no mide nada.** Se da por *recibir* una respuesta. Tres taps y llegas al tope
   diario; nivel 2 en la primera sesión y luego una pared de 17 días para el nivel 5. No hay
   habilidad, no hay decisión, no hay sorpresa. Es un contador.
2. **La curva es plana y ciega.** 50/150/400/1000 con 60 XP/día máximo: nivel 3 al día 3,
   nivel 4 al día 7, nivel 5 al día 17, siempre con los mismos tres taps. El usuario no sabe
   qué desbloquea después ni cuánto falta (la barra de progreso está escondida en la galería).
3. **Las recompensas no se usan.** Los emotes se desbloquean… y solo se ven en la galería. El
   compañero no celebra, no reacciona, no "vive" en el desk salvo la boca al hablar.
4. **La racha es un número en un menú.** No hay ritual diario, no hay riesgo visible de
   perderla, no hay premio por mantenerla.
5. **Sin momento social.** La tarjeta Aura comparte "mi color"; lo que un Gen Z compartiría es
   *una llamada*: "Bobby dijo NO TRADE en NVDA y NVDA cayó 4 %". Eso ya existe on-chain y no
   se muestra.
6. **Sin feedback de habilidad.** La app nunca le dice al usuario si *su* lectura fue buena.
   Todo lo bueno lo hace Bobby; el humano solo mira.

## 3. Principio de diseño

> **El juego es leer bien el mercado, no operar.** La unidad es la *lectura*, la habilidad es
> la *calibración* (qué tan seguido tu lectura previa coincide con lo que pasó), y la
> disciplina se demuestra *volviendo* a comprobar, no pidiendo más.

Eso mantiene la promesa de la tienda: ni volumen, ni frecuencia, ni P&L. Y da tres bucles:

- **Bucle de 60 segundos (core):** pregunta → **pre-call** → veredicto → comparación → XP.
- **Bucle diario (meta):** Daily Desk de 3 misiones + racha + revisión de ayer.
- **Bucle social:** Call Card compartible con hash on-chain + rango de calibración opcional.

## 4. Propuesta concreta

### 4.1 Pre-call: el humano juega antes de que Bobby hable
Antes de correr el desk, un selector de un toque: **LONG · SHORT · NO TRADE** ("¿Tú qué
lees?"). Es opcional (el botón "solo analiza" sigue ahí). Luego el veredicto se muestra
*contra* tu lectura: "Coincidiste con el CIO" / "Red Team te hubiera detenido". XP:
- Pre-call hecho (cualquiera): +5 (máx. 3/día).
- **Calibración** al día siguiente: si la dirección del cierre de 24 h coincidió con tu
  pre-call, +15; si dijiste NO TRADE y el activo se movió menos que su ATR, +15 ("no había
  setup y tenías razón"). Se resuelve solo con datos públicos, sin tocar tu cuenta.
- Nunca XP por operar ni por cuántas veces preguntas.

Esto convierte cada análisis en una apuesta *educativa* con resolución honesta. Es el cambio
con más impacto y cabe en un sprint: dos botones, una tabla local de pre-calls, un job al abrir
la app que resuelve los de ayer con `get_market`.

### 4.2 Daily Desk: tres misiones, un ritual
Al abrir el desk, bajo el saludo hypeado, una tira con tres misiones rotativas, generadas por
reglas, no hardcodeadas (ejemplos): "Lee una acción y una cripto", "Abre el Red Team de una
lectura", "Resuelve tu pre-call de ayer", "Revisa el activo más caliente". Cada misión completa
= 1 de los 3 premios diarios (el tope actual se convierte en *el diseño*, no en un freno).
Completar las 3 = "Desk cerrado" con sonido, vibración y el compañero haciendo su emote.

### 4.3 La racha se ve y se protege
- Llama en el header del desk con el número; se apaga (gris) cuando el día está en riesgo.
- El día de gracia existente se muestra como **Escudo de racha** (1 disponible, se recarga
  cada 7 días). Lo que hoy es una regla invisible pasa a ser un objeto que el usuario cuida.
- Hitos de racha: 3, 7, 14, 30 días desbloquean un cosmético (un color de aura, un emote
  raro). Nada de dinero, nada de "señales premium".

### 4.4 El compañero reacciona
- **PULSE** mientras el desk corre; **SHIELD** cuando sale NO TRADE; **VICTORY** cuando tu
  pre-call coincidió; **ORBIT** en el saludo con movers; **LEGEND** en level-up. Ya existen
  como emotes: solo hay que dispararlos desde `ContentView` y animar la escena GLB.
- Reacciona al mercado del saludo: si el mover del día pasa de ±8 %, un salto y "¿viste eso?".
- Frases de nivel (`levelTone`) por vibe: chill/directo/pro tienen que sonar distinto en cada
  nivel, hoy es una sola línea por nivel.

### 4.5 Progreso visible con "siguiente desbloqueo"
Barra en el header del desk: `LOCKED IN · 62/150 · siguiente: ORBIT de KORA`. La galería deja de
ser el único lugar donde se entiende el sistema. Curva propuesta (con 3 premios/día de 5–20 XP y
calibración): nivel 2 al día 2, 3 en la semana 2, 4 en el mes, 5 en el trimestre. Tiene que
sentirse *ganado*, no regalado.

### 4.6 Call Card: lo que sí se comparte
Una tarjeta vertical (9:16) por veredicto: compañero, activo, señal, tu pre-call, resultado a
24 h cuando existe, y el hash on-chain corto con QR a Basescan. Es la versión Gen Z de "te lo
dije con pruebas". Reutiliza el renderer de `AuraCard`. Más adelante: **rango de calibración**
opcional (semanal, por % de aciertos en pre-calls, mínimo 10 resueltos, sin P&L).

### 4.7 Primeros 60 segundos
Después del loadout y el saludo hypeado, una misión guiada: "Pídeme el activo más caliente" (chip
grande, un toque) → pre-call → veredicto → primer XP con explicación de una línea de por qué.
Hoy el usuario cae en un desk vacío con "toca a tu compañero y nombra un activo".

### 4.8 Lenguaje de sonido y vibración
Ya hay un vocabulario en el loadout. Extenderlo y mantenerlo: tock = equipar/seleccionar,
success = veredicto, golpe seco = NO TRADE (escudo), fanfarria corta = level-up, tick suave =
misión completada. Todo respetando el switch de silencio y con un toggle en el menú.

## 5. Lo que NO hay que hacer
- XP por operar, por frecuencia, por volumen o por P&L. Rompe la promesa de la tienda y
  acerca la app a 3.1.5/3.2.1 de Apple.
- Recompensas variables ligadas al precio ("cofres" cuando acierta): se siente a casino.
- Leaderboards por dinero. Solo por calibración, opt-in, con mínimo de muestra.
- Presión de racha agresiva (notificaciones de culpa). Un recordatorio amable al día, máximo.

## 6. Sprint 1 (una semana) y estimaciones
| # | Entregable | Esfuerzo | Impacto |
|---|---|---|---|
| 1 | Pre-call (3 botones) + resolución a 24 h + XP de calibración | 2 días | Alto |
| 2 | Barra de nivel con "siguiente desbloqueo" en el header | 0.5 día | Alto |
| 3 | Emotes disparados por eventos (PULSE/SHIELD/VICTORY/LEGEND) | 1 día | Alto |
| 4 | Daily Desk con 3 misiones por reglas | 1.5 días | Medio-alto |
| 5 | Llama de racha + Escudo de racha visible | 0.5 día | Medio |
| 6 | Misión guiada de los primeros 60 s | 0.5 día | Medio |
| 7 | Call Card compartible con hash on-chain | 1.5 días | Alto (social) |

Con 1, 2 y 3 la app ya se siente como un juego de leer el mercado. Con 4 a 7 se vuelve hábito
y se comparte.

## 7. Herramientas por personaje (decidido 2026-09-02, implementado en build 9)

Cada compañero tiene **tres herramientas**: la primera cae después de la **primera lectura
completa**, la segunda a los **100 XP**, la tercera a los **200 XP** y es **dorada**. Mismo
principio: XP por leer y volver, nunca por volumen. Arte generado con Higgsfield
(`nano_banana_pro`, iconos isométricos, negro + verde #34D399, dorado #F5C542 para la tercera).

| Compañero | 1 · Común (1ª lectura) | 2 · Raro (100 XP) | 3 · Dorado (200 XP) |
|---|---|---|---|
| Bobby | Cronómetro de paciencia | Brújula de tendencia 4H | Núcleo Omega |
| Byte | Traductor de mercado | Gafas anti-humo | Códice dorado |
| Kora | Auriculares radar | Antena de chisme | Micrófono dorado |
| Zip | Cronómetro 15M | Baliza de alertas | Rayo dorado |
| Glitch · Momo · Flux · Rook · Halo · Axiom | definidos en `CompanionTools.swift`; arte pendiente (18 imágenes, ~36 créditos) |

En la app: cinturón de tres slots bajo el compañero (bloqueado / desbloqueado / dorado),
hoja de detalle al tocar, y overlay de "loot" con vibración y sonido cuando cae una.

## 8. Paridad web: el mismo personaje en bobbyprotocol.xyz

Hoy la web ya tiene los 10 GLB (`public/mascots/`), un registro (`src/lib/mascot.ts`) y un
wizard de elección en la landing de la app, pero **no tiene la experiencia**: sin voz por
personaje, sin XP ni niveles, sin nombres que evolucionan, sin loadout, sin saludo hypeado, sin
herramientas. Propuesta para llevar la misma experiencia, en este orden:

1. **Un solo modelo de progreso** compartido entre app y web: hoy el XP vive en `UserDefaults`
   del teléfono. Mover la fuente de verdad a Supabase (`agent_profiles` ya guarda `mascot`):
   `companion_id`, `discipline_xp`, `streak`, `tools_unlocked`, `pre_calls`. La app sigue
   funcionando sin cuenta (local) y sincroniza cuando el usuario conecta wallet o inicia sesión.
2. **Paquete compartido de datos de personajes**: nombres por nivel, frases, vibes, herramientas
   y voces en un JSON servido por `/api/companions` que consumen ambas plataformas (hoy están
   duplicados en Swift). El arte de herramientas se sirve desde `public/tools/`.
3. **Web: componente `CompanionStage`** (three.js ya está en el proyecto) con la misma escena:
   GLB + luz del tint + reacción a la voz (el endpoint de voz ya lo comparten).
4. **Web: onboarding de tres pasos** (elige, vibe, loadout) reutilizando el copy de iOS, y el
   desk con saludo hypeado (`movers` ya viene del servidor).
5. **Cinturón de herramientas y overlay de loot** en el desk web, mismos umbrales.

Estimación: 1 semana para 1–3 (backend + escena), 1 semana para 4–5. Riesgo principal: dos
fuentes de XP (local y servidor) divergiendo; resolver con "el servidor manda cuando existe
cuenta, local solo como caché".
