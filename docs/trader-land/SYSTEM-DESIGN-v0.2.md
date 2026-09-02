# Trader Land — sistema de producto v0.2

Fecha: 2026-09-02  
Estado: diseño listo para prototipo; no autoriza implementación, migraciones ni deploy.  
Objetivo: convertir la disciplina del desk de Bobby en un mundo vivo, coleccionable y social, sin premiar trading, volumen ni P&L.

## 1. Tesis del producto

Focus Tree convierte una sesión de atención en una pieza de jardín. Trader Land usa la misma intuición —una acción valiosa deja una huella visible— pero cambia la conducta premiada:

> Cada proceso de decisión bien cerrado planta una pieza. Cada proceso que el usuario vuelve a revisar hace que esa pieza florezca.

Trader Land no es un simulador de riqueza ni una capa de casino. Es el diario espacial del comportamiento del usuario: qué tan bien espera, explica, limita riesgo, contradice sus ideas y vuelve a comprobarlas.

La referencia comprobable de Focus Tree es su loop `sesión → item → jardín`, sus jardines compartidos y la motivación social. No copiamos su identidad visual, sus monedas ni su marketplace. Construimos una gramática propia de Bobby: aura orbital, companions, evidencia, riesgo y memoria on-chain.

## 2. Promesa al usuario

**Promesa emocional:** “Tu disciplina se convierte en un lugar que solo tú pudiste construir.”

**Promesa funcional:** “Si mejoras tu proceso —aunque decidas NO TRADE o tu tesis termine invalidada— tu mundo progresa.”

**Promesa de seguridad:**

- Bobby no ejecuta, custodia ni conecta una cuenta para operar.
- No existe recompensa por cantidad de trades, tamaño, frecuencia o rentabilidad.
- Una tesis LONG, SHORT y un NO TRADE tienen el mismo potencial de progreso.
- Los objetos de v1 son gratuitos, cosméticos y no transferibles.
- El usuario nunca firma una transacción para recibir una recompensa de juego.

## 3. La fantasía del mundo

Trader Land es una isla isométrica suspendida en oscuridad. En el centro flota el **Árbol de Aura**: un organismo tecnológico con una esfera luminosa en su núcleo, raíces de energía y ramas orbitales. Sus raíces alimentan cuatro regiones. El árbol no mide dinero; visualiza la calidad y continuidad del proceso.

### Las cinco atribuciones del usuario

Son indicadores de conducta, no monedas. Se calculan sobre una ventana móvil de 28 días y se muestran como ramas del árbol, nunca como un ranking de “mejor trader”.

| Atribución | Conducta observable | Manifestación visual |
|---|---|---|
| Paciencia | No persigue precio; acepta NO TRADE; espera su condición | Raíces largas, agua calma, faros estables |
| Claridad | Explica la tesis y su invalidación con estructura | Caminos limpios, señales legibles, cristales alineados |
| Riesgo | Define invalidación/stop antes de decidir | Murallas, escudos, compuertas y balizas |
| Contradicción | Lee el Red Team y reconoce el argumento contrario | Puentes dobles, antenas, observatorios |
| Cierre | Regresa cuando la tesis vence, acierta o se invalida | Flores de aura, archivo encendido, edificios terminados |

La **Aura Total** es solo la armonía visual de estas cinco ramas. No sube por acertar. Un usuario con 50 sesiones sin cerrar debe mostrar menos aura que uno con 10 ciclos completos.

### Regiones

| Región | Significado | Se enciende con | Héroe visual |
|---|---|---|---|
| Crypto Bay | Observar contexto sin perseguir ruido | análisis entregado + decisión explícita | muelles de datos y torres de velas holográficas |
| Evidence Mines | Buscar pruebas, no “oro” financiero | fuentes consultadas + argumento contrario leído | mina de cristales de evidencia y drones linterna |
| Thesis Citadel | Escribir un plan que pueda invalidarse | tesis completa antes del movimiento | fortaleza modular con tres puertas: trigger, riesgo, invalidación |
| Risk Reef | Saber cuándo no pasar | NO TRADE o invalidación respetada | faro, arrecife protector y compuertas azules |
| Axiom Archive (centro) | Volver, resolver y recordar | cierre automático/humano conciliado | árbol-esfera, archivo y anillo on-chain |

Los nombres `Gold Mines` y `Wall Street Citadel` del teaser se sustituyen antes de lanzar. “Evidence Mines” y “Thesis Citadel” representan conducta y reducen la lectura de riqueza/casino.

## 4. Loop principal: Plantar y florecer

### Fase A — Desk Session

1. El servidor crea una sesión con nonce, usuario/instalación, activo, build y hora.
2. Bobby entrega el debate de tres agentes y registra `analysis_delivered_at`.
3. El usuario elige una salida:
   - **NO TRADE:** motivo + condición o fecha para volver a mirar.
   - **PLAN:** dirección, trigger, invalidación y riesgo definidos.
   - **SKIP:** no genera recompensa; no se castiga.
4. El servidor valida elegibilidad y entrega una **Semilla de Aura**.
5. Reveal de 4–6 segundos: la semilla sale del Árbol de Aura y muestra la pieza que podrá crecer.
6. El usuario la coloca en su grid 8×8, rota y confirma.

### Fase B — Cierre del ciclo

1. Un resolver usa precios públicos para marcar `hit`, `invalidated` o `expired`.
2. Al volver, el usuario compara la resolución con su idea original; no puede reescribirla.
3. La pieza colocada **florece**: gana luz, animación o un nivel visual.
4. El servidor entrega el segundo tramo de XP/Aura y registra el evento en ledger.

Esto elimina el incentivo a fabricar sesiones rápidas: plantar es agradable, pero el mundo más vivo exige cerrar procesos.

### NO TRADE simétrico

Un NO TRADE planta exactamente la misma clase de semilla que un PLAN. Su cierre ocurre cuando vence la ventana de revisión y el usuario confirma qué cambió o que la ausencia de setup continuó. Nunca se pide “hacer un trade para terminar”.

## 5. Elegibilidad y scoring

El score interno existe para auditoría y balance; al usuario se le muestran estados comprensibles: `INCOMPLETO`, `PLANTADO`, `LISTO PARA REVISAR`, `FLORECIDO`.

### Señales fuertes

- Sesión creada por el servidor antes del análisis.
- Debate entregado y asociado a su hash/receipt.
- Decisión persistida una sola vez.
- Tesis estructurada con campos válidos o NO TRADE con condición de revisión.
- Resolución automática por precio/tiempo.
- Cierre conciliado una sola vez.

### Señales débiles

- Scroll, tiempo en pantalla, foreground y taps.
- Solo ayudan a detectar abuso; nunca bastan para un premio.

### Reglas antifarming

- Una recompensa por `session_id` e `idempotency_key`.
- Cooldown por usuario + activo + horizonte.
- Máximo de tres semillas elegibles al día y diez a la semana.
- Una tesis no puede cerrarse antes de su ventana mínima.
- Duplicados semánticos no acumulan progreso.
- Los cambios de reloj/dispositivo no alteran tiempos del servidor.
- El kill switch de rewards es dinámico y fail-closed.
- Si la sesión no es verificable, el desk funciona pero el mundo no premia.

### Distribución inicial

| Momento | XP | Aura | Resultado de mundo |
|---|---:|---:|---|
| Plantar proceso elegible | 5 | 2 | semilla + pieza base |
| Cerrar proceso elegible | 15 | 6 | pieza florecida |
| NO TRADE respetado | mismos valores | mismos valores | sin bonus adicional |
| Tesis invalidada y cerrada | mismos valores | mismos valores | sin penalización |
| Acierto | mismos valores | mismos valores | el P&L no entra al cálculo |

El balance se configura por versión en servidor. Ningún número vive como autoridad en web o iOS.

## 6. Economía y colección

### Recursos

- **Discipline XP:** nivel permanente; no se gasta.
- **Aura:** recurso blando para elegir cosméticos conocidos; no se compra en v1.
- **Semillas:** estado temporal de una pieza hasta cerrar el ciclo.
- **Piezas:** tiles, caminos, edificios y decoraciones no transferibles.
- **Proof Marks:** sellos visuales de hit/invalidated/expired/no-trade; todos valen igual.

### Recompensa sin casino

El prototipo no usa cofre, ruleta, jackpot ni rareza aleatoria. Cada usuario recorre una **Ruta de Descubrimiento** de ocho piezas en orden determinista. La siguiente silueta es visible; su detalle se revela al completar el proceso. Después de validar el loop pueden añadirse colecciones rotativas, siempre gratuitas y con secuencia/odds transparentes.

### Primera colección: “First Light”

| ID | Pieza | Conducta que representa | Emoción |
|---|---|---|---|
| FL-01 | Signal Sprout | terminar el primer proceso | “Esto ya es mío” |
| FL-02 | Patience Path | aceptar esperar | calma |
| FL-03 | Red Team Antenna | leer la contradicción | curiosidad |
| FL-04 | Risk Beacon | escribir invalidación | seguridad |
| FL-05 | No-Trade Gate | aceptar no operar | orgullo, no FOMO |
| FL-06 | Evidence Crystal | apoyar la tesis con evidencia | claridad |
| FL-07 | Closure Bloom | volver y cerrar | satisfacción |
| FL-08 | Axiom Sapling | completar la ruta | pertenencia |

Duplicados futuros se convierten en una variante visual o material de mejora; nunca desaparecen ni obligan a pagar.

## 7. Progresión temporal

### En una sesión (3–8 minutos)

Debate → decisión → semilla → colocar.

### En un día

Hasta tres procesos elegibles. El land puede mostrar piezas pendientes de florecer y una sola recomendación neutral: “Hay una tesis lista para revisar”.

### En una semana

El Árbol de Aura resume las cinco atribuciones. El usuario recibe una reflexión, no un score competitivo: “Esta semana crecieron Riesgo y Cierre; Paciencia necesita más espacio.”

### En ocho semanas

Una temporada cambia clima, luz y colección. El mundo permanente no se reinicia. La temporada añade un pequeño distrito/álbum, no borra el progreso.

### Niveles

El prototipo reutiliza exactamente los niveles existentes:

1. SPAWNED — 0 XP
2. LOCKED IN — 50 XP
3. MARKET READER — 150 XP
4. RISK GUARDIAN — 400 XP
5. ON-CHAIN LEGEND — 1000 XP

No se diseñan niveles 6–10 hasta medir la velocidad real de progresión.

## 8. Acceso: cómo y por qué entra el usuario

### Puertas de entrada

1. **Slot dorado del cinturón:** acceso persistente desde el desk.
2. **Reward reveal:** después de una sesión elegible, CTA principal `PLANTAR EN TRADER LAND`.
3. **Árbol de Aura:** tocar la esfera de Aura abre directamente el mundo.
4. **Menú:** `TRADER LAND` con estado (`1 semilla`, `2 listas para florecer`).
5. **Deep link:** una visita social abre una versión read-only; nunca obliga a conectar wallet.

### Primer acceso

1. Cámara atraviesa niebla y encuentra una isla 8×8 vacía.
2. El companion aterriza junto a la esfera central.
3. La primera semilla ya ganada flota alrededor del núcleo.
4. Tutorial de una sola acción: arrastrar → rotar → confirmar.
5. Copy: “No construyes por operar. Construyes por decidir mejor.”

Tiempo objetivo: menos de 35 segundos hasta colocar la primera pieza.

### Identidad y sesión

- Invitado: puede explorar un mundo demo y ganar progreso local provisional.
- Instalación anónima: Supabase anonymous auth crea el mundo persistente del dispositivo.
- Wallet SIWE: opcional para sincronizar identidad, leer inbox/debates privados y atribuir proofs; firma de mensaje, sin transacción.
- Apple/email: upgrade posterior de la cuenta anónima.
- El servidor manda después de la primera sincronización. La migración local se registra una sola vez con `device_install_id`, snapshot, versión y techo de XP.

Nunca usamos `max(localXP, serverXP)` sin evidencia. El merge de dos identidades requiere flujo explícito y auditable.

## 9. UX y UI

### Pantalla principal

- Mundo ocupa 75–85% del viewport.
- Barra superior: nivel, XP, Aura y pendientes; sin precio ni P&L.
- Esquina inferior: inventario y modo edición.
- Companion vive en el mundo, reacciona a taps y señala pendientes.
- Árbol de Aura funciona como brújula: tocar una rama explica la atribución con lenguaje humano.

### Navegación de cámara

- Un dedo: pan.
- Pinch: zoom limitado.
- Tap: inspeccionar pieza.
- Long press: mover solo en modo edición.
- Doble tap en Árbol de Aura: volver al centro.
- Botón visible de `DESHACER` durante cinco segundos después de colocar.

### Colocación

1. Tap de inventario crea ghost semitransparente.
2. Celdas válidas emiten aura verde; inválidas, borde rojo sobrio.
3. Controles grandes: cancelar, rotar 90°, confirmar.
4. Confirmar produce ensamblaje físico, no explosión de casino.
5. La operación usa `expected_land_version`; conflicto ofrece recargar, nunca pisa cambios.

### Reward reveal

- Duración máxima: seis segundos; se puede saltar después de 1.2 s.
- Primero explica **por qué** se ganó: “Cerraste el ciclo de BTC”.
- Después muestra la pieza y dónde podría vivir.
- Una sola CTA: `PLANTAR`.
- Sin confeti, slots, cofres, odds pulsantes ni colores ligados a LONG/SHORT.

### Estados vacíos y errores

- Sin recompensa: “El análisis quedó guardado. Completa una decisión para plantar.”
- Offline: mundo navegable desde snapshot; edición en cola con idempotency key.
- Conflicto: “Tu mundo cambió en otro dispositivo. Ya lo sincronizamos.”
- Rewards congelados: “El desk sigue disponible; Trader Land está en mantenimiento.”
- Sin wallet: el land no se bloquea; solo las funciones privadas/sync muestran conexión opcional.

### Accesibilidad

- Reduce Motion sustituye órbitas por pulsos lentos.
- Paleta no depende solo de verde/rojo; cada estado tiene forma e icono.
- VoiceOver/ARIA anuncia pieza, estado, coordenada y acciones.
- Haptics y audio se pueden apagar por separado.
- Textos mínimos de 15 pt en iOS y targets de 44×44.

## 10. Arquitectura sonora

El sonido debe sentirse **orbital, tecnológico y calmado**: “vrum”, masa flotante y energía contenida. Nunca una máquina tragamonedas.

### Capas persistentes

| Capa | Diseño | Regla |
|---|---|---|
| Aura Core | seno 48–60 Hz + armónico 110 Hz con LFO lento | solo dentro de Trader Land; -24 a -20 LUFS |
| Órbitas | whoosh filtrado que cruza estéreo cada 8–14 s | frecuencia baja; Reduce Motion reduce paneo |
| Bioma | agua, viento, cristal, faro o archivo | máximo dos capas simultáneas |
| Vida | pasos del companion, drones, hojas de energía | eventos discretos y no repetitivos |

### Motivos de interacción

- Entrar al land: subgrave `vrum` ascendente de 700 ms + halo aéreo.
- Semilla obtenida: tres notas ascendentes suaves; comparte ADN con `sfxLoot`, sin fanfarria.
- Pieza válida: tick de madera/metal a 720 Hz.
- Pieza inválida: thunk filtrado corto, sin castigo agresivo.
- Confirmar: encaje mecánico + pulso de aura.
- Florecer: acorde abierto de 1.4 s + partículas; comparte ADN con `sfxAuraMax`.
- Fog reveal: barrido ancho + aire, no explosión.
- Árbol equilibrado: cinco armónicos entran uno por atribución.

### Voz, música y haptics

- La voz del companion siempre hace ducking de ambiente entre 8 y 12 dB.
- No hay música continua en v1; el ambiente deja respirar al desk.
- iOS usa Core Haptics: encaje ligero, florecimiento progresivo, región revelada profunda.
- Web usa WebAudio y vibración cuando exista.
- Assets WAV: 48 kHz, 24-bit master, versión optimizada AAC/CAF en iOS; loops con cruces sin clic.

## 11. Sistema técnico y autoridad

### Máquina de estados de sesión

`created → analysis_delivered → decision_locked → planted → resolvable → resolved → reviewed → bloomed`

Estados terminales: `skipped`, `expired_unreviewed`, `invalid`. Cada transición es monotónica, autenticada e idempotente.

### Componentes

- `world-state.schema.json`: contrato compartido web/iOS.
- Catálogo JSON versionado: piezas, footprint, anchors, variantes, audio cue.
- Reward service en Bobby Vercel: valida sesión y llama una RPC.
- Supabase `bobby-protocol`: sesiones, ledger, inventario, land, celdas y snapshots.
- Web: PixiJS para tiles; Three.js solo para companion 3D.
- iOS: SpriteKit para tiles; SceneKit solo para companion 3D.
- Resolver cron: precios públicos y expiración; sin broker/exchange privado.
- Snapshot local: carga rápida y navegación offline; servidor sigue siendo autoridad.

### Consistencia mínima

- Ledger append-only para XP, Aura, adquisiciones y blooms.
- Balance conciliable desde ledger.
- `unique(user_id, session_id, event_kind)`.
- Lock de perfil/ledger dentro de la RPC.
- `land_cells` reserva cada celda del footprint en una transacción.
- `lands.version` para optimistic concurrency.
- Drop/discovery ledger guarda catálogo y versión de reglas.
- RLS: lectura propia; mutaciones solo por APIs/RPC autenticadas.

### Frontera de infraestructura

Todo Trader Land debe existir únicamente en:

- Repo: `anthonysurfermx/Bobby-Agent-Trader`.
- Vercel: proyecto `bobby-agent-trader`.
- Supabase: proyecto `bobby-protocol`.
- Base: contratos/roots nuevos de Bobby Protocol, sin alterar registros históricos.

Gate de release: cero URLs, project refs, anon keys, rutas o tablas dependientes de DeFi México. La migración de Bobby debe terminar antes de activar rewards persistentes.

### On-chain

P1 no escribe cada pieza on-chain. P4 publica un Merkle root semanal de eventos de disciplina y permite comprobar inclusión. Los compromisos/trades/debates existentes se conservan con sus IDs y contratos; Trader Land solo referencia esa memoria, nunca la reescribe.

## 12. Vertical de validación (10 días)

### Incluye

- Web-first, un mundo 8×8.
- Árbol de Aura central y un companion.
- Colección First Light de ocho piezas.
- Plantar, rotar, confirmar, persistir y deshacer.
- Una ruta NO TRADE y una ruta PLAN.
- Resolver + bloom.
- Ledger, idempotencia, caps, cooldown y kill switch.
- Telemetría de producto y copy legal visible.
- Fixtures/snapshots compartidos para portar a iOS.

### No incluye

- Friends, squads, visitas, reacciones o UGC.
- Temporadas, quests, leaderboards o tienda.
- Grid mayor, cuatro regiones jugables o fog dinámico.
- Drops aleatorios, rarezas, IAP, NFTs o transferencias.
- Share card server-side.

### Criterio de GO a iOS

Durante una prueba de 10 días con usuarios existentes:

- ≥45% de sesiones elegibles terminan en decisión explícita.
- ≥35% de semillas elegibles florecen dentro de su ventana.
- NO TRADE mantiene al menos la misma tasa de cierre que PLAN ±10 pp.
- ≥25% de usuarios vuelve a Trader Land en tres días distintos.
- <5% de sesiones premiadas son duplicadas/abuso detectado.
- La tasa de sesiones por usuario no sube de forma anormal sin subir cierres.

Si falla, se corrige el loop antes de portar el renderer a iOS.

## 13. Roadmap después del vertical

1. **P1.5 — iOS parity:** SpriteKit, SceneKit companion, Core Haptics y sync.
2. **P2 — mundo completo:** cuatro regiones, fog y atribuciones visibles.
3. **P3 — social seguro:** visitas read-only, squads, moderación, block/report y privacidad.
4. **P4 — seasons:** distritos temporales y colecciones conocidas; sin pay-to-win.
5. **P5 — Proof of Discipline:** Merkle root semanal en Base y verificador público.

## 14. Decisiones cerradas y pendientes

### Cerradas en v0.2

- El land premia el proceso, no resultados financieros.
- Plantar y florecer sustituyen el loot inmediato como centro del loop.
- v1 es determinista, gratuito y no transferible.
- Wallet opcional; no bloquea el primer mundo.
- Web valida primero; iOS entra después del gate de producto.
- El arte usa una golden scene antes de producir el lote.
- Todo vive bajo infraestructura Bobby Protocol.

### Pendientes de Anthony

- Edad mínima y mercados geográficos de lanzamiento.
- Si la meta de los primeros 30 días es retención de usuarios actuales o adquisición Gen-Z.
- Si Aura seguirá siendo solo ganada o podrá comprar cosméticos conocidos en una fase futura.
- Nombre final de `Evidence Mines`, `Thesis Citadel` y `Árbol de Aura`.

## 15. Fuentes de referencia

- Focus Tree, sitio oficial: https://www.focustree.app/
- Focus Tree, App Store: https://apps.apple.com/us/app/focus-tree-timer-flashcards/id1631305261
- Focus Tree, términos y descripción de jardines/items: https://focustree.app/terms
- Revisión interna de v0.1: `docs/trader-land/reviews/codex-2026-09-02.md`

