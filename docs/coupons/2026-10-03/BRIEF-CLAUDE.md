# Bobby: canje directo y celebración homologada

Brief para Claude. Rama `codex/coupon-redemption-ux`, base `c27af3cd87f433849683aa35e04112dc6438ff1c` en `codex/bobby-android-parity-ios17` (PR #141). iOS parte de `bfdc16dfe9ce947f11bbcbd4f447ffc62d0f1e92` / PR #140, 1.7 (61). Candidatos locales: **iOS 1.7 (62)** y **Android 1.1.2 (7)**. El cambio de canje se implementó primero en iOS y luego en Android.

## Pedido del usuario y resultado

El usuario comprobó personalmente que el canje anterior funcionaba en Android; todavía no lo había probado en iOS. El problema era la confirmación poco clara y la sensación de que hacía falta restaurar compras. Tras `redeem-coupon` confirmado, ambos clientes aplican el snapshot del servidor a sus cuotas compartidas y muestran un pop-up con el beneficio real. Si `granted.reads=10`, anuncian «Tienes 10 lecturas Rápido más». Nunca se deducen las diez lecturas del nombre del código ni se suman a una cuota de caché.

La celebración propuesta por Claude CLI está integrada: Núcleo violeta, anillo que se abre, 16 partículas deterministas, check central, una transición de 1,2 segundos y reposo. Movimiento reducido conserva una imagen estática; sin audio ni bucles. Confirmación y beneficio accesibles, vibración una sola vez por regalo nuevo. «Hacer una lectura» cierra las hojas y devuelve al Núcleo; el texto explica seleccionar el nivel y escribir la pregunta. No inicia un análisis automáticamente.

El pop-up separa `granted` (lo concedido ahora) de `bonus` (regalos disponibles). La cuota ordinaria del plan se muestra por separado. Un saldo incompleto queda pendiente, nunca se convierte en cero. `already_redeemed` muestra un código ya canjeado, saldo confirmado si existe y «Comprobar mi saldo»; no anuncia otro regalo ni repite la celebración. Comprobar saldo usa exclusivamente GET con snapshot fresco y completo. Restaurar compras sigue siendo una acción explícita para suscripciones de la tienda, con una explicación separada; el canje no llama a StoreKit/RevenueCat restore ni sync.

Los textos de EN/ES/FR/PT/IT/DE vienen de una tabla compartida y se verifican contra ambos clientes. No se tocó el backend ni se alteró una suscripción o un cupón real.

## Archivos para revisar

| Área | iOS | Android |
|---|---|---|
| Operación, validación, cuenta y concurrencia | `ios/Bobby/Sources/CouponRedemption.swift` | `android/app/src/main/java/xyz/bobbyprotocol/android/data/CouponRedemption.kt` |
| Cuota común y respuestas antiguas | `BobbyAccess.swift`, `Nucleo/NucleoLevels.swift` | `data/BobbyQuotaState.kt`, `data/BobbyRepository.kt` |
| Formulario y confirmación | `CouponRedemptionSheet.swift`, `AccountSheet.swift` | `ui/CouponRedemptionContent.kt`, `ui/BobbySheet.kt`, `ui/AccountProfile.kt` |
| Celebración | `CouponCelebration.swift` | `ui/CouponCelebration.kt` |
| Textos canónicos | `shared/coupon-copy.json`, `CouponCopy.swift` | `ui/CouponCopy.kt`, `android/nucleo/tests/coupon-copy.test.mjs` |
| Pruebas nuevas | `Tests/CouponRedemptionTests.swift`, `UITests/CouponRedemptionUITests.swift` | `src/test/.../CouponRedemptionTest.kt`, `BobbyQuotaStateTest.kt`, `src/androidTest/.../CouponRedemptionInstrumentedTest.kt` |

Las rutas iOS abreviadas en esta tabla son relativas a `ios/Bobby/Sources`; las Android a `android/app/src/main/java/xyz/bobbyprotocol/android`, salvo las pruebas (`android/app`).

## Evidencia comprobada

| Comprobación | Resultado | Límite práctico |
|---|---|---|
| XCTest/XCUITest iOS build 62 | **57 PASS**, 0 fallos, 0 omisiones: 38 cupón + 17 acceso + 2 pop-up | Simulador iPhone 17 Pro / iOS 26.1; transportes y recibos offline |
| JVM Android code 7 | **217 PASS**, 0 fallos/errores/omisiones; 44 nuevos | Contratos/estado/concurrencia; no compra real |
| Node Android | **103 PASS**, 0 fallos/errores/omisiones | Incluye igualdad exacta de textos en seis idiomas |
| Interfaz Android | **28 PASS**, 0 fallos/errores/omisiones; 4 nuevos de cupones | Emulador AOSP API35/4KB aislado; pop-ups reales con recibos offline y comparación de píxeles en movimiento reducido |
| Android lint/debug/test/release | PASS, lint 0 errores / 60 advertencias | Una advertencia nueva de estilo `ModifierParameter`; no se rebajaron reglas |
| Web | `npm run build` PASS | No despliegue |
| APK y AAB firmados | Identidad/code7, firmas, mismo certificado existente, zipalign16KB, bundletool y 8 ELF16KB PASS; 190 assets en cada paquete iguales al source manifest | Validación local, no procesamiento de Google Play |
| Seeker | **APK firmado 1.1.2(7) instalado y bytes/version verificados**, preservando datos | El último control sólo de lectura confirmó el APK final tras recuperarse de disco lleno; no quedó enfocada/resumida. No prueba visual ni canje real de esta versión |
| Revisión independiente | Fences y saldo fresco revisados; el único hallazgo final de saldo iOS se corrigió y volvió a probar | Revisión de código, no aceptación física |

Manifest Android: `c1a619bda0a1b176365e063a21513250b71138a30b48b02b2694d7247815a166`, 375 archivos. Manifest iOS: `2f77ecabc1d8e67d704d003297c07e6ad06110ca7b54abc0ab04ae815875d3e2`, 115 archivos; todos los inputs preceden al inicio de la última ejecución. APK: `850f659da41cff3eb2f8b8da05b742c91ab3c372216dfec55a55f9e87232e7e0`. AAB: `42d35d9d7a2307e3dfd0b6b116661f1115a20ea1760aa8217cef929923a77028`. Los firmados están en los paths locales declarados en [android-build.json](android-build.json), fuera de Git.

Recibos: [iOS](ios-tests.json), [Android build](android-build.json), [pruebas JVM/Node](android-unit-contracts.xml), [instrumentación](android-instrumentation.json), [paquetes](android-release-validation.json), [instalación Seeker](seeker-install.json). Captura y vídeo del pop-up iOS son **fixture offline**, no canje real: [captura](ios-confirmed-gift.png), [vídeo](ios-coupon-celebration.mp4), [binding](ios-visual-capture.json). [Solicitud y respuesta de animación de Claude CLI](claude-animation-receipt.json) no significa que Claude haya inspeccionado o probado los archivos.

## Protecciones relevantes y próximos checks

Doble toque y GET concurrente excluidos; cierre/cancelación invalidan resultados; el propietario y la generación se capturan antes de encolar la operación. Se rechazan cambios A→B y A→B→A, respuestas antiguas y payloads malformados. Android usa un cliente sin replay automático de POST ante una conexión perdida. El servidor existente conserva la autoridad sobre idempotencia; no se afirma haber validado su comportamiento remoto. Un Pro Quick ilimitado no borra los regalos cuando una respuesta de lectura omite `bonus`.

Claude debe revisar la experiencia real en **iPhone primero y luego Seeker**, usando una cuenta de QA y un cupón autorizado: formulario → canje nuevo → saldo Perfil/Niveles → CTA → lectura elegida → consumo correcto. Verificar VoiceOver/TalkBack, tamaños de texto grandes, saldo después de volver a abrir la app y un código ya canjeado. Un cupón real y cualquier lectura deben autorizarlos el dueño; no inventar recibos ni consumir regalos para dar por cerrado este check. El usuario confirmó el Android anterior; no extender ese resultado a iOS ni al código 7.

Traderland sigue siendo un frente separado: el código 6 sustituyó los puntos/coordenadas por una isla con proyección isométrica y sprites, pero la profundidad visual, las animaciones, el archipiélago y la aceptación visual en el Seeker siguen pendientes. La relectura de la fuente confirma que el mapa canónico de iOS también usa Canvas isométrico y sprites, no una escena 3D; el visor GLB del compañero es un componente distinto. Este canje no modifica ese mapa. Comparar sombras, borde, núcleo vivo, composición y navegación entre islas con el Canvas iOS, sin introducir una librería 3D basada en una suposición.

No archivar/subir iOS62, subir code7 a Google Play, publicar, fusionar o desplegar desde este brief. `vercel.json` desactiva despliegues de esta rama. No secretos nuevos, no cambios de permisos, y conservar las ramas paralelas del usuario.

Actualización del 4 de octubre: el candidato Android 1.1.3 (8) y la revisión dimensional de Traderland se documentan en [su nuevo brief](../../traderland/2026-10-04/BRIEF-CLAUDE.md). La evidencia de canje de esta página conserva su alcance original: iOS 62 y Android 7, con recibos offline.
