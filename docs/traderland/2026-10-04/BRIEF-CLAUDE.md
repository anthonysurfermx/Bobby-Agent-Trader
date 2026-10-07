# Bobby Android 1.1.3 (8): Traderland dimensional y práctica local

Brief para Claude enviado por CLI por instrucción explícita del dueño. Rama local `codex/android-traderland-parity`; parte del commit de canje `1e52190c2a1f9d900625845298a9cf0e0e5adb35`, sobre la paridad Android de PR #141. Referencia visual y funcional: iOS 1.7 (61), commit `bfdc16dfe9ce947f11bbcbd4f447ffc62d0f1e92` / PR #140. Las ramas paralelas del usuario se conservaron. Esta rama no se publicó; `vercel.json` desactiva sus despliegues.

## Resultado

El usuario describió un mapa convertido en puntos y una pérdida de profundidad respecto a iOS. El mapa canónico de iOS utiliza Canvas isométrico y sprites; su visor GLB del compañero pertenece a otro componente. Android mantiene Compose Canvas y ahora reproduce la geometría canónica, el volumen de la plataforma, sombras de contacto y de piezas levantadas, oclusión por profundidad, niebla de práctica, huellas rotadas y filamentos de caminos. El Núcleo de Aura del mapa usa las seis capas aprobadas de iOS, con esfera flotante, anillos, luz y siete motas; se detiene con movimiento reducido y cuando la pantalla deja de estar activa. El arte de Aura es verde; la orbe violeta del icono y el Núcleo principal de Bobby se conserva.

Los 28 albedos dejaron de ser miniaturas de 256 píxeles: son los PNG canónicos de 1024, decodificados a 512 para controlar memoria. Se añadieron 26 glows de piezas y se componen con luminancia como alfa y mezcla Screen. Todas las imágenes se copiaron byte por byte del commit canónico, sin generar ni editar arte. `sprite-sources.json` y `core-layers.json` documentan origen y SHA.

La cámara mantiene el punto bajo los dedos al hacer pinza, conserva el desplazamiento al arrastrar una pieza desde cualquier casilla de su huella y vuelve al zoom inicial correcto en islas de 8/10/12/16. Mi isla y Vecinos comparten el mismo Canvas; vista general, anterior/siguiente, visita por código, regreso y eliminación de un vecino conservan una escena continua con posiciones hexagonales y encuadre canónicos. No se inventan vecinos reales: los ejemplos de QA son offline y el ejemplo permanente Satoshi está marcado como solo lectura.

Los invitados tienen una isla de práctica editable de 8×8 con las siete piezas iniciales canónicas y 26 planos repetibles. Pueden colocar, mover, girar, guardar piezas, revelar, restablecer con confirmación y deshacer hasta diez cambios en memoria. Solo se guarda el diseño y nivel de foco en preferencias locales de invitado; no concede XP, Aura ni inventario de cuenta. El guardado debe ser duradero y mantener propietario nulo, época y consentimiento; si falla, el draft permanece y no se anuncia éxito. La cuenta autenticada siempre utiliza su mundo real y jamás importa el diseño de práctica como inventario ganado. Un estado local malformado se sanea; un fixture empaquetado inválido falla cerrado.

## Evidencia y límites

| Comprobación | Resultado | Alcance |
|---|---|---|
| Kotlin/JVM | 269 PASS, cero fallos/errores/omisiones | Reglas, geometría, cámara, práctica, persistencia y regresión de cuenta/canje/billing |
| Node | 103 PASS | Contratos y textos nativos; seis idiomas |
| Compose nativo | 42 PASS, cero fallos/errores/omisiones | Emulador aislado API 35 / 4 KB, sin cuenta real, cupones reales, compras ni análisis |
| iOS geometría | 658 casos PASS | Contrato puro canónico; no simulador visual ni dispositivo |
| Lint, debug, test y firmados | PASS; lint 0 errores / 61 advertencias | No se bajaron reglas de lint |
| APK/AAB | Firmas, identidad, certificado existente, bundletool, zipalign de 16 KB y ocho ELF de 16 KB PASS | Validación local; no runtime 16KB ni procesamiento de Google Play |
| Recursos empaquetados | 226 assets en APK y AAB iguales al manifest | Incluye las imágenes aprobadas y el fixture local |
| Seeker | APK firmado 1.1.3 (8) instalado; bytes y versión verificados. Teléfono bloqueado, lanzamiento omitido | No implica aceptación visual o funcional de la cuenta |

Manifest Android: `28ceca2d8b9ceb8c9844e2d761b34e8155e1efe47ac882390f5f491ab0760ac7`, 421 archivos. APK final: `982fd93538b8726550dff767f1bf99a23f387cd0a86c964f742a94b4bcc4237f`, 58.588.278 bytes. AAB final: `1d8771eff3465a54a7fc284625bf4235eeeff9c9f7b6e138f48e7311717b9a20`, 61.796.297 bytes. Los binarios firmados permanecen fuera de Git.

Recibos vinculados: [build](android-build.json), [manifest](android-source.json), [JVM y Node](android-unit-contracts.xml), [instrumentación](android-instrumentation.json), [paquetes](android-release-validation.json), [instalación](seeker-install.json), [geometría iOS](ios-geometry-contract.json) y [capturas](visual-captures.json). Las capturas muestran Canvas de producción con layouts offline, no la cuenta del usuario.

Se conserva el intento inicial de 38 pruebas con dos fallos. La causa identificada fue el orden incorrecto de los argumentos de `TouchInjectionScope.pinch`: se corrigieron usando `start0`, `end0`, `start1`, `end1` explícitos y se mantuvieron las assertions. La segunda ejecución de 42 pruebas, ya con la pinza correcta, volvió a fallar en esos dos casos y confirmó un problema real. Se unificó el reconocedor de toque, arrastre y pinza; cada evento utiliza el zoom/pan actuales para evitar que un lote de eventos o levantar los dedos restaure la cámara antigua. Un gesto multitáctil ya no puede convertirse en arrastre de pieza. La ejecución final vuelve a probar las mismas assertions de expansión y anclaje. También se conservaron los intentos fallidos de integración por una ruta de fixture privada y por dos lecturas de StateFlow dentro de composición; ambos se corrigieron antes de la ejecución final.

## Qué debe revisar y mejorar Claude

1. **Aceptación física del Seeker.** Abrir Traderland en la cuenta del dueño: comparar composición con iOS, pinza fuera del centro, pan, Home, modo de edición al volver desde la vista general, islas crecidas, arrastrar una pieza de 2×1 desde su segunda casilla, girar y cancelar. No confirmar escrituras de inventario/cuenta sin autorización. Evaluar memoria, fluidez, modo de movimiento reducido y TalkBack en el teléfono.
2. **Fidelidad fina del archipiélago.** Faltan los títulos encima de cada isla y los seis lotes vacíos punteados del Canvas iOS. El borde de la isla visitada aún comparte el estilo cyan general; iOS usa un acento más fuerte. El halo ambiental y las sombras usan aproximaciones de Compose; no se declara igualdad de píxel. Comparar primero `TraderLandArchipelago.swift`, `TraderLandGateHarness.swift` y `TraderLandGeometry.swift` con los archivos Android de abajo.
3. **Persistencia real de la práctica.** Invitado → colocar → cerrar/reabrir → recuperar diseño; iniciar sesión debe mostrar la isla de cuenta, y salir vuelve a la práctica local sin importar recursos entre ambas. Las pruebas JVM verifican fences/guardado fallido, y Compose usa un callback en memoria; falta el ciclo físico completo con preferencias.
4. **Canje homologado, iPhone primero y luego Seeker.** El bloque anterior ya implementó saldo directo, popup del beneficio real y celebración violeta de 1,2 segundos en ambos clientes, sin restaurar compras ni iniciar una lectura automáticamente. Está en [brief del canje](../../coupons/2026-10-03/BRIEF-CLAUDE.md), commit `1e52190c`, iOS local 1.7 (62), Android anterior 1.1.2 (7) y heredado por este código 8. Sus pruebas fueron 57 pruebas iOS, 217 JVM, 103 Node y 28 de interfaz; esa evidencia offline no prueba un cupón real de esta versión. Usar cuenta/cupón de QA autorizado, comprobar saldo Perfil/Niveles, código ya canjeado, reinicio y consumo al elegir una lectura. Restaurar se reserva a compras de la tienda.
5. **Flujos externos pendientes.** No extender estos PASS a voz/dictado en seis idiomas en hardware, login/proveedores, compra/restauración/cancelación real, lectura diaria autenticada, alertas push, publicación de isla, moderación remota o aceptación en Google Play. Esos checks necesitan contexto y autorización propios.

## Archivos concretos

| Área | Ruta relativa al repositorio |
|---|---|
| Cámara, anclajes, huellas | `android/app/src/main/java/xyz/bobbyprotocol/android/ui/TraderLandProjection.kt` |
| Escena, volumen, sombras, Núcleo y filamentos | `android/app/src/main/java/xyz/bobbyprotocol/android/ui/TraderLandScene.kt` |
| Disposición y navegación del archipiélago | `android/app/src/main/java/xyz/bobbyprotocol/android/ui/TraderLandArchipelago.kt` |
| Integración de cuenta/invitado, gestos, mapa único | `android/app/src/main/java/xyz/bobbyprotocol/android/ui/TraderLandSheet.kt` |
| Reglas y almacenamiento aislado de invitado | `ui/LandPractice.kt`, `ui/LandPracticePersistence.kt` bajo el mismo directorio |
| Controles locales y seis idiomas | `ui/LandPracticePanel.kt` bajo el mismo directorio |
| Arte, catálogo y fixture | `android/app/src/main/assets/traderland/` |
| Pruebas de mapa y práctica | `android/app/src/androidTest/java/xyz/bobbyprotocol/android/TraderLandMapInstrumentedTest.kt`, `LandPracticePanelInstrumentedTest.kt` |

## Reglas para continuar

Trabajar en rama propia, conservar este candidato y los cambios paralelos. No subir código 8 a Play, archivar/subir iOS 62, publicar GitHub, fusionar, desplegar, consumir cupones/lecturas ni modificar backend, cuentas, permisos o secretos desde este brief. El envío a Claude por CLI es un handoff de texto autorizado; por sí solo no demuestra que Claude haya abierto archivos o ejecutado pruebas. La publicación del commit anterior fue rechazada por la aprobación automática porque faltaba autorización explícita para divulgar código/documentación inéditos en el repositorio público; no se intentó eludir ese bloqueo.
