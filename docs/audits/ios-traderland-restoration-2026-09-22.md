# Trader Land iOS: desaparición del archipiélago y recuperación

Revisión del 22 de septiembre de 2026. Horas históricas en Lisboa (UTC+1).

**Candidato posterior:** la petición de conservar Quiet Reef se implementa en [Satoshi Nakamoto como isla permanente](ios-satoshi-showcase-35.md). El archivo combinado más reciente está en `output/satoshi-island-35/Bobby-1.2-35.xcarchive`; el resto de este documento registra la revisión anterior.

## Hallazgo

El código del archipiélago, las visitas, el nombre y los enlaces seguía presente. Un interruptor introducido por **Codex** ocultaba la exploración y el compartir en la versión distribuida. El nombre solo quedaba en los ajustes privados de una isla de cuenta. No fue una pérdida de esos archivos al cambiar de versión.

La captura del usuario muestra **ISLA DE PRÁCTICA** y la invitación a iniciar sesión. Esa vista usa el guardado local del dispositivo; no representa la isla ligada a una cuenta. La captura no permite determinar si una sesión expiró, si se usaba otro proveedor de acceso o si se borraron datos. No se ha accedido a la cuenta del iPhone ni se ha certificado la recuperación de su progreso personal.

## Cronología y responsabilidad

| Fecha y hora | Hecho comprobado |
|---|---|
| 19 sep., 18:32:08 | `785d39b` integra el código nativo Growth v1 que ya contiene zoom al archipiélago, visitas y compartir. |
| **19 sep., 18:51:13.228** | Una llamada real de herramienta de **Codex** añade `publicWorldsEnabled`, con `false` en Release y acceso solo mediante fixtures en Debug. También agrega el límite de zoom al 70 %, oculta el botón del archipiélago, bloquea la descarga de vecinos y reemplaza compartir por ajustes privados. |
| **19 sep., 19:04:58** | El cambio se guarda en `03a780357c332c64f21874de2f2de827cdce8219`, el mismo commit que después incluyó el apagado de las voces. |
| 19 sep., 21:57:05 | `a96037f`, con coautoría de Claude, agrega pruebas que dan por esperado que Release no tenga mar, mantenga el mínimo de 70 % y guarde nombres haciendo privada la isla. Esas pruebas verificaron el comportamiento desactivado; no fueron la introducción del bloqueo. |
| 19 sep., 23:18:21 | `ff1b67b` integra PR #98 desde `claude/build34`, versión 1.2 (34). La captura por sí sola no identifica el número exacto instalado en el iPhone. |

La evidencia directa de atribución es la sesión local de Codex `01a0b92b-e84e-7de1-9b87-60ce4f05ee15`, archivo `rollout-2026-09-19T11-17-37-01a0b92b-e84e-7de1-9b87-60ce4f05ee15.jsonl`, línea 1079: invocación a las `2026-09-19T17:51:13.228Z` que escribe el interruptor. La firma humana de Git o el nombre de la rama no bastarían por sí solos para atribuirlo a un agente.

El motivo anotado en el comentario de ese cambio era posponer el contenido público hasta contar con reporte, bloqueo y moderación. La implementación desactivó una parte central del producto. Esta auditoría identifica esa decisión técnica; no acredita que Apple hubiera pedido quitar Trader Land ni que se hubiese enviado accidentalmente un build anterior.

## Datos y visibilidad

El endpoint público `https://bobbyprotocol.xyz/api/trader-land-public` respondió HTTP 200, `ok: true`, **0 islas públicas** y 25 elementos del catálogo el 22 de septiembre a las 10:03:17 UTC. El resultado se conserva en `output/traderland-restore-35/public-api-check.json`. Una lista pública vacía no implica que no existan islas privadas.

El cambio de septiembre agregó `rename_private`: al guardar un nombre desde los ajustes sustitutos se cambiaba la visibilidad a privada, incluso si la isla antes era pública. No se sabe si el usuario llegó a usar esa acción. El diff modifica nombre y visibilidad; no elimina colocaciones ni inventario. No se ha ejecutado ninguna publicación, despublicación, migración o escritura sobre cuentas reales en esta recuperación.

La clave de guardado local `bobby.trader-land.runtime-v03`, el servicio de sesión del llavero y los identificadores de cuenta no se modifican en esta corrección.

## Recuperación implementada

- El zoom vuelve a poder bajar del 60 % para entrar al archipiélago, hasta el mínimo original del 22 %, tanto en desarrollo como en Release. Se conserva el límite de edición mientras se coloca una pieza.
- El botón del archipiélago, la carga de vecinos y las visitas vuelven al recorrido normal. Las visitas son de solo lectura y permiten regresar a la propia isla.
- Una persona sin sesión puede explorar. Publicar requiere su isla de cuenta; la isla de práctica permanece en el dispositivo.
- La cuenta puede guardar un nombre en privado, publicar explícitamente, compartir el enlace de iOS, actualizar el nombre conservando su visibilidad pública y hacerla privada otra vez.
- La hoja explica que publicar incluye el nombre, las piezas y los distritos en el archipiélago. Incluye cierre accesible y desplazamiento para que los controles sigan disponibles con textos largos.
- Se conserva el avance actual de voces, mute y onboarding en el mismo candidato 1.2 (35).

Las islas de las capturas automatizadas son fixtures identificadas como datos de prueba. No se añaden vecinos ficticios al catálogo de producción. La corrección recupera las funciones; no incorpora un sistema nuevo de moderación ni representa una aprobación de App Review.

## Evidencia de validación

- **42 pruebas nativas distintas con resultado aprobado**: 34 unitarias de geometría, crecimiento y decodificación, y 8 recorridos de interfaz. La corrida principal tuvo 41 aprobadas y un test terminado con SIGTERM durante el arranque. Esa prueba de compartir en español se repitió sin cambios de código y pasó; se conservan ambos resultados, no se oculta el intento interrumpido.
- Se comprobaron exploración desde la ruta normal sin interruptores de fixture, zoom hacia otras islas, visitas y regreso, conservación de piezas, progreso local tras reiniciar, movimiento del núcleo y extensión de semillas. Los recorridos de explorar y guardar nombre/publicar/despublicar pasan en inglés y español.
- **120 comprobaciones de API y 63 de enlaces compartidos aprobadas**, con transporte simulado, sin escrituras en producción.
- Archivo Release **1.2 (35)** y firma estricta verificados. Conserva los 108 MP3 de avatar con los mismos hashes auditados. El control de frontera de voz y `git diff --check` pasan.
- SHA-256 del ejecutable: `3f04b7703b05417dec7c632ca23ef081a3b65470c5ef96e2f3c4d97f33ca5a89`.

Candidato combinado actual: `output/traderland-restore-35/Bobby-1.2-35.xcarchive`. La carpeta también contiene `archive-verification.json`, logs, `tests-main.xcresult`, `tests-spanish-share.xcresult`, resúmenes y capturas en `screenshots/`. Las vistas de archipiélago y compartir se inspeccionaron visualmente.

Este archivo usa la identidad de desarrollo existente. No se instaló en el iPhone ni se subió a TestFlight/App Store. La fecha exacta de la instalación que produjo la captura original no se ha verificado.
