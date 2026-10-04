# Cierre de versión Bobby — 4 de octubre de 2026

Esta entrega local queda congelada en **Android 1.1.4 (9)** e **iOS 1.7 (63)**. El cierre conserva los mismos binarios y código que pasaron las pruebas finales. La aceptación completa en dispositivos físicos sigue pendiente.

Traderland Android incluye el mapa isométrico con arte aprobado, profundidad, sombras, cámara, archipiélago y selección/movimiento de piezas. El canje en ambas plataformas aplica el saldo concedido, presenta una celebración con accesibilidad y explica cómo usar las lecturas desde el Núcleo. Restaurar compras no forma parte del flujo de canje. Los flujos de cuenta real y cupón real no se probaron en este cierre.

| Comprobación | Resultado | Límite |
| --- | --- | --- |
| Android JVM | 279/279 pasan | Pruebas locales |
| Núcleo Node | 103/103 pasan | Pruebas locales |
| Android UI e integración | 62/62 pasan | Emulador API 35, fixtures públicos/offline |
| iOS cupones, acceso y UI | 67/67 pasan | Simulador iPhone 17 Pro, iOS 26.1 |
| Android lint | 0 errores, 62 avisos | Informe conservado |
| Evidencia y fuentes | 84 archivos, 424 entradas Android y 116 iOS verificados | Mismos hashes de las pruebas finales |
| APK/AAB Android | Firma y bytes verificados | Sin procesamiento nuevo de Google Play |
| Seeker | APK firmado 1.1.4 (9) confirmado por USB a las 07:52 UTC | Teléfono bloqueado; sin aceptación de UI |
| Brief a Claude | Recibido por CLI a las 01:04 UTC | Acuse de texto; Claude no inspeccionó código ni ejecutó pruebas |

Código final: `2f191491eaa5282a149c103d2889082be3f1c10e`. Árbol auditado antes de este cierre: `6bdf35737b71979d44e950527059a9564ab8545a`, rama `codex/android-traderland-parity`.

APK: `c2a0bf1ea917ed3927538a14d8089e432f6d3de44d17ce422b17bfaa1d42b534`.
AAB: `d96f15e5249b31571ed1b48f7b699ee867a3159688267b5f06856e74a5a8d6df`.

El brief detallado y sus pruebas están en `../code9/BRIEF-CLAUDE.md` y `../code9/INDEX.json`. Ambos quedan intactos. Este cierre tiene su propia validación y recibo de comunicación; no modifica los hashes de la cápsula anterior.

## Pendiente para aceptación física

1. Instalar el build 63 en un iPhone autorizado y comprobar primero un cupón de prueba: confirmación, celebración, saldo y una lectura consumida.
2. Repetir en el Seeker desbloqueado con cuenta y cupón de prueba autorizados. Comprobar Traderland, gestos, selección, visita y persistencia tras reiniciar.
3. Validar TalkBack/VoiceOver, reducción de movimiento y los flujos reales de compras, restauración, voz, enlaces externos y notificaciones. El build Android local no prueba FCM ni la aceptación remota de telemetría.

No se desplegó backend, no se subió esta versión a Play/TestFlight y no se publicó la rama. La revisión automática rechazó anteriormente el push público por falta de autorización explícita para divulgar código y documentos inéditos. Se conserva el cierre local sin intentar esa publicación.

## Comunicación de este cierre

El brief detallado permanece entregado y con acuse de Claude por CLI. La llamada adicional para comunicar este nuevo documento fue rechazada antes de ejecutarse por la aprobación automática: consideró que el cierre añadía contenido interno y hashes sin autorización explícita para ese payload adicional. No se reintentó ni se usó otra vía. El cierre se conserva localmente; su envío queda sujeto a la autorización solicitada al dueño. Este bloqueo no modifica la entrega anterior del brief ni los binarios.
