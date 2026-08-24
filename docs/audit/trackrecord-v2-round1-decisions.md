# TrackRecord v2 — Ronda adversarial 1/3: hallazgos y decisiones abiertas

**Fecha:** 2026-08-13 · **Sobre:** `BobbyTrackRecordV2.sol` (implementación, worktree
`feat/trackrecord-v2`) · **Revisor:** pasada adversarial interna (1ª de las 3 rondas
obligatorias). Kimi y Codex vienen después.

La ronda encontró **2 HIGH, 1 MEDIUM, 3 LOW + gaps de test**. Los LOW y los gaps
**ya están corregidos y con test** (V-04..V-07 abajo). Los 2 HIGH y el MEDIUM son
**decisiones de diseño con tradeoff real** — NO los resolví unilateralmente porque
tocan el balance entre inmanipulabilidad y operación honesta, y eso es tuyo.

---

## YA CORREGIDO (fixes limpios, sin tradeoff, con test de regresión)

| ID | Qué era | Fix | Test |
|---|---|---|---|
| **V-04** LOW | `expireCommitment` no era `nonReentrant`; en el borde exacto del TTL, un Pyth comprometido podía reentrar y doble-contar | `nonReentrant` añadido (el lock es por-contrato) | `test_V04_expireIsNonReentrant` |
| **V-05** LOW | Se almacenaba el PnL **reportado** en `totalPnlBpsVerified` → la banda ±100 bps era una palanca de sesgo sistemático (~1%/trade) | Se almacena el PnL **derivado del oráculo**; el reportado solo se checa (signo+tolerancia), nunca se guarda | `test_V05_storedPnlIsOracleDerived_notReported` |
| **V-06** LOW | Stop ultra-ajustado truncaba `stopLossBps` a 0 → LOSS con PnL cero | Piso de magnitud en −1 bp; una LOSS nunca es cero | `test_V06_tightStopBreachFloorsAtOneBp` |
| **V-07** LOW | `_verifyAndPay` no verificaba `feeds[0].id == feedId` | Assert añadido (defensa ante Pyth comprometido) | cubierto por MockPyth + assert |
| Gaps | Sin test de LOSS verificada normal, BREAK_EVEN→LOSS, refund retenido, challenge-durante-revoke | 6 tests nuevos | `test_resolve_verified_loss_ledgerAccounting`, `test_breakEvenReclassifiedToLoss`, `test_refundRetainedOnFailedRefund_andWithdraw`, `test_V03_...` |

Validaciones **sound** del revisor (sin cambio necesario): D-1, unicidad de
`_findTrade`, mutación de stats en challenge (WIN→LOSS y BE→LOSS consistentes),
race challenge-vs-resolve serializada por `c.resolved`, idempotencia del
challenge, routing de símbolos, inmutabilidad del snapshot M-02, CEI en refunds,
`_toE8`/conf gate. Y confirmó que el flag del autor sobre el signo de
`_stopLossBps` **NO aplica** con niveles comprometidos (la invariante de
dirección lo garantiza ≤ 0).

---

## DECISIÓN ABIERTA #1 — V-01 HIGH: el `_exitAt` desliza la ventana de exit

**El hallazgo (confirmado):** creíamos que `maxExitLag` cerraba el cherry-pick del
exit (S-01). No lo cierra: lo **acota**. El recorder elige `_exitAt` dentro de
`[minResolveAt, now]` sujeto a `now − _exitAt ≤ maxExitLag`, y la ventana de
verificación es `[_exitAt − exitWindowSec, _exitAt]`. Como Pyth Unique devuelve
el primer tick tras el borde inferior, **el recorder puede posicionar la ventana
sobre cualquier tick real dentro de las últimas `maxExitLag` segundos** eligiendo
cuándo llama a `resolveTrade`.

**El ataque:** long con stop ANCHO (para que no haya breach). El precio hace un
pico transitorio a favor (T*) y luego decae a pérdida real, pero nunca cruza el
stop. El recorder resuelve dentro de `maxExitLag` de T*, presenta el update
firmado de T* (real), y registra WIN. Sin recurso de challenge (no hubo breach).

**Por qué no lo parché:** el fix no es de código, es de **parámetro + semántica**,
y ambos tienen tradeoff:

- **`maxExitLag` es la palanca.** Con default 86400 (24h) el barrido es de 24h;
  con 3600 (1h) es de 1h. **Bajarlo reduce el ataque linealmente** pero limita
  cuán atrasado puede declararse un exit honesto si el cron de settle se cae.
  Como el settle normal pone `_exitAt ≈ now`, un `maxExitLag` chico (p.ej.
  **300–600 s**) casi no estorba la operación honesta y recorta el barrido a
  minutos. **Mi recomendación fuerte: bajar el default a 600 s** (o incluso 300)
  y documentar que un settle caído > maxExitLag difiere el exit declarable.
- **El residual es parcialmente inherente.** Ningún diseño on-chain puede probar
  que el exit *registrado* fue el exit *real* de la posición de Bobby — solo que
  el precio existió. La honestidad del §6.1 debe decir esto MÁS fuerte de lo que
  dice: "el recorder elige el instante de cierre dentro de maxExitLag entre
  precios reales; no puede inventar precios, pero puede elegir un tick favorable
  reciente". Con maxExitLag chico eso es ~"el precio de los últimos minutos".

**Lo que decides:**
1. Valor de `maxExitLag` default (recomiendo 600 s). Es constructor param — cero
   código nuevo.
2. ¿Aceptas el residual documentado, o quieres además el fix estructural (clasificar
   por el extremo adverso de la vida del trade, no por un tick elegido)? Eso es
   +mucho código/gas y una ronda extra — mi lectura: **no vale la pena si
   maxExitLag es chico**; el residual de "minutos de barrido entre precios reales"
   es aceptable para el claim honesto.

---

## DECISIÓN ABIERTA #2 — V-02 HIGH: pérdidas sub-stop se lavan por no-resolución

**El hallazgo (confirmado):** `resolveTrade` es `onlyBobby` — nada obliga a
registrar una pérdida. Si un trade verificado se mueve en contra pero **no cruza
el stop**, el recorder simplemente no lo resuelve; a los 30 días cae a EXPIRED
(PnL cero, fuera del denominador del win rate). El challenge no aplica (no hubo
breach). El win rate verificado sube por omisión.

**El tradeoff:** el fix natural es **"expiry de un VERIFIED pendiente = LOSS, no
neutral"** (espejo del candado H-01/r5 que ya prohíbe lavar pérdidas como EXPIRED
en v1). Pero castiga al trade honesto que genuinamente no se pudo resolver (Pyth
caído de verdad, o el trade sigue abierto legítimamente a los 30 días).

**Opciones:**
- **(A)** Expiry de VERIFIED → LOSS al stop (o a un extremo). Mata el lavado;
  penaliza honestos.
- **(B)** Mantener EXPIRED neutral pero hacer el `expiredVerified` **imposible de
  ignorar** en la UI: el win rate SIEMPRE se muestra con su coverage ratio al
  lado, y un expiry ratio alto es una señal roja pública. (Ya está el dato; es
  disciplina de UI + mensaje.) El lavado queda visible, no bloqueado.
- **(C)** Híbrido: ventana de gracia para resolver, luego auto-LOSS salvo que
  el recorder pruebe con oráculo que el precio a los 30d seguía a favor (caro).

**Mi recomendación: (B) para v2.0** — es honesto ("mostramos cobertura, no
escondemos") y no penaliza operación real; el lavado por abandono es visible y
costoso reputacionalmente. **(A) es tentador pero rompe casos honestos** y
merece su propia discusión. Necesito tu llamada porque cambia la semántica del
producto (¿un trade no resuelto es "pérdida" o "sin datos"?).

---

## DECISIÓN ABIERTA #3 — V-03 MEDIUM: `revokePyth` también silencia el challenge

**El hallazgo (confirmado):** `challengeStopBreach` pasa por `_verifyAndPay`, que
revierte `NoPythActive` si `activePyth == 0`. Así, `revokePyth` (nuestro freno de
emergencia ante Pyth comprometido) **también apaga la válvula de seguridad
permissionless**. Un Safe comprometido podría `revokePyth`, esperar el TTL, y
dejar expirar todo lo pendiente (se enlaza con V-02).

**El tradeoff:** el challenge necesita UN oráculo para verificar el breach. Si
revocamos porque Pyth está comprometido, usarlo para challenges también es
riesgoso. Opciones:
- **(A)** Aceptar y documentar: revoke es "pausa de VERIFIED total" (resolve Y
  challenge), es un poder del owner (Safe 2-de-3), visible por evento, y su abuso
  se detecta por el spike de coverage. Ya está pineado por `test_V03_...`.
- **(B)** Permitir challenge contra el **último oráculo bueno** aunque esté
  revocado el activo (mantener un `lastGoodPyth`), para que la válvula sobreviva.
  Más estado, y discutible si el oráculo revocado era el malo.

**Mi recomendación: (A)** — el revoke es un poder de emergencia del Safe, no una
operación rutinaria; acoplar el challenge a un oráculo revocado reintroduce el
riesgo que el revoke quería cerrar. Pero si V-02 se resuelve como (A) (expiry →
LOSS), entonces V-03 deja de importar (no hay lavado que la pausa habilite).
**V-02 y V-03 se deciden juntas.**

---

## Estado y siguiente

- Código: compila (solc 0.8.24, sin viaIR), **15,989 B** (8.6 KB de margen
  EIP-170), layout congelado sin drift, **suite verde con los fixes + 6 tests
  nuevos**.
- **Bloqueo para rondas 2/3:** las 3 decisiones de arriba. Correr Kimi/Codex
  sobre un contrato con 2 HIGH de diseño abiertos quemaría esas rondas — se
  hacen DESPUÉS de que decidas (idealmente #1 y #2, que cambian código/params).
- Nada commiteado aún.

**Lo mínimo que necesito de ti:** (1) valor de `maxExitLag` (recomiendo 600 s),
(2) V-02 opción A/B/C (recomiendo B), (3) V-03 A/B (recomiendo A, atado a V-02).
Con eso aplico los cambios de #1/#2/#3, y recién ahí lanzo Kimi (2/3) y Codex (3/3).

---

## CIERRE — decisiones de Anthony aplicadas + fixes Kimi/Codex (2026-08-14)

**EIP-170 corregido:** Claude había malleído `forge build --sizes` (15,989 B era
margen de *initcode*). Runtime real sin viaIR = 30,155 B (NO desplegable).
**viaIR habilitado** (`foundry.toml`, documentado): runtime **23,368 B**, margen
**1,208 B** bajo el límite de 24,576. Nota: viaIR recompila TODO el set — la
ronda v2 audita bajo viaIR (es el artefacto de deploy).

**Decisiones aplicadas:**
- **V-01:** `maxExitLagSec` acotado a **[300, 3600] s** (cap de 24h→1h) y deploy
  usa 600 s. El barrido de cherry-pick queda en minutos, no horas.
- **V-02:** `EXPIRED` NUNCA se auto-convierte a LOSS. Nuevo `getVerifiedScorecard()`
  empaqueta win rate + resolved/expired/pending + `resolutionBps` en UNA llamada
  — el consumidor no puede mostrar el rate sin la cobertura. La penalización de
  cobertura baja vive en el score reputacional del backend (dato ya expuesto).
- **V-03:** `challengeWindowSec > PYTH_ACTIVATION_DELAY` (obligatorio en bounds) +
  **Pyth alternativo preaprobado**: el constructor siembra N oráculos vetados,
  activables al instante SIN timelock; un `revokePyth(active)` se recupera en 1 tx
  activando el alterno. El valve del challenge nunca queda muerto.

**Fixes Kimi/Codex (los 7):** (1) challenge rechaza ticks < `committedAt`;
(2) índice O(1) `tradeIndex` (fuera el scan lineal); (3) reclasificar WIN→LOSS
ahora escribe evidencia/precio del breach, no el WIN stale; (4) diff de layout
REAL en `script/check-layout.sh` + snapshot en `test/snapshots/` (fuera el test
falso de field-count); (5) `minCommitAge` acotado `< MAX_COMMITMENT_TTL` antes
del cast a uint64; (6) `_sanityCheck` verdaderamente fail-open vía self-call
externa en try/catch (cubre llamada Y aritmética — un aggregator malicioso ya no
puede DoS-ear el resolve por overflow); (7) **suite de invariants/fuzzing V2**
(`BobbyTrackRecordV2Invariant.t.sol`): 4 invariants × 128k llamadas — stats por
modo no se cruzan, coverage reconcilia con commitments/trades, pending
reconcilia, balance solo retiene refunds.

**LOW previos (V-04..V-07)** ya estaban aplicados. **Suite: 202/202.**

**Estado:** listo para la re-verificación adversarial FINAL del código corregido
(los 3 rounds aplican al código que se despliega). Sigue sin commit, sigue
NO-apto-mainnet (falta: re-audit del código con estos fixes, Safe 2-de-3 real,
y el resto de la cola de mainnet).
