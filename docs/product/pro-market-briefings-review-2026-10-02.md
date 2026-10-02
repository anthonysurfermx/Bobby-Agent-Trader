# Revisión independiente de Bobby Pro — build 53

2 de octubre de 2026. Revisión de la entrega de Claude en `2f81cfbf`, antes de los ajustes locales solicitados después. **Veredicto: buena base de implementación; NO-GO para activar en producción.** Los hallazgos de esta revisión no se corrigen configurando Apple.

La fuente declara 1.5 (53), tiene cinco commits locales y estaba limpia al comenzar. Hay implementación real de API, Postgres, calendario, presupuesto, APNs y pantallas/voz nativas. Destacan la autorización por propietario y Pro en servidor, tablas API-only con RLS/grants restringidos, tokens cifrados, cambios de cuenta con revisión y caché privada de audio. No se verificó despliegue, migración remota, recepción APNs ni coste real.

## Dirección de producto vigente

Decisión directa de Anthony, comprobada en la conversación de voz del mismo día: **resumen semanal ligero los lunes a las 08:00 America/New_York, más alertas excepcionales por eventos macroeconómicos importantes confirmados**, por ejemplo un cambio de tasas de la Fed. Es la única cadencia periódica. No generar matutinos diarios ni cierres, tampoco ocultándolos detrás de pushes desactivados. La propuesta anterior de domingo 18:00 queda sustituida.

El ajuste semanal se implementa localmente, con dos partes en orden: activos consultados y evolución retrospectiva con memoria consentida; después contexto/agenda de la semana que comienza. El beneficio exige Pro de pago activo, sin tarifa por informe ni cambios de precio. Se integra también la cápsula de progreso real NucleoNotch desde la rama local existente. Las alertas macro tienen un plan y un clasificador puro desactivado; todavía no tienen colector, persistencia ni entrega real integrados. Ver [plan de eventos macro](pro-market-macro-events.md). No se aprobó una lista exhaustiva de eventos, umbrales, nuevas suscripciones ni textos nuevos de push.

## Hallazgos y estado de cierre

Las referencias corresponden al commit revisado; las líneas pueden desplazarse con los ajustes semanales.

| Prioridad | Hallazgo y consecuencia | Evidencia | Cierre necesario |
|---|---|---|---|
| P1 | Registro/rebind y recibo idempotente no son atómicos. Si PostgreSQL confirma la credencial nueva y se pierde la respuesta, el reintento puede quedar en conflicto o perder la prueba anterior, sin recuperación. | `api/briefings.ts:247`, `:293`; migración, función `bobby_brief_idem_begin` | Mutación y recibo sellado en una sola transacción; probar pérdida de respuesta y repetición con la misma credencial. |
| P1 | Autoplay pendiente no se cancela al cerrar el informe o pasar a segundo plano. La respuesta tardía de consentimiento puede empezar voz/solicitudes después del cierre. | `ios/Bobby/Sources/Briefings/BriefingNarrator.swift:183`, `:280`; `BriefingReportView.swift:199` | Cancelar/incrementar generación también para autoplay pendiente; verificar app activa y cierre durante la consulta de consentimiento. |
| P1 | Una fuente pública sin timeout puede agotar el worker y bloquear todos los informes. El deadline se comprueba después de esperar el snapshot. | `api/_lib/market-snapshot.ts:209`, `:289`; `briefings/evidence.ts:306`; `worker.ts:330` | Abort/timeout por fuente y límite total, con resultado parcial probado. |
| P2 | El primer registro fallido y el permiso concedido después en Settings no se recuperan al volver a la app: se exige un binding que aún no existe. | `PushRegistrar.swift:218–223` | Reintento acotado según opt-in/permisos sin binding; probar denegado→autorizado y error inicial sin callback artificial. |
| Cerrado local | `BOBBY_BRIEFINGS_MEMORY=off` no excluye los activos derivados de memoria del contexto compartido/prompt. No envía identidad/nombre, pero contradice el interruptor de privacidad. | Migración, `bobby_brief_needed_assets:846–860`; `worker.ts:251–264` | Worker usa un universo público fijo de 17 activos, independiente de cuentas/memoria; pruebas de contenido/worker verifican el aislamiento. La personalización privada sigue exigiendo consentimiento y flag. |
| P2 | Audio caduca a 14 días, informes duran 90 y los intentos 400. El workRef constante `audio:<cacheKey>` cuenta éxitos históricos dentro del máximo de dos intentos: tras caducar puede quedar imposible regenerar audio. | `config.ts:86`; `voice.ts:66`; migración `:1147`, `:1452` | WorkRef por generación/audioId conservando single-flight y topes; probar expiración→regeneración. |
| Cerrado local | Se admiten 17 activos pero la evidencia compartida recorta a 12 incluyendo defaults. Algunos activos válidos terminan como “sin datos” aunque la fuente tenga cotización. | `config.ts:104`, `:127`; `worker.ts:254`; `compose.ts:119` | Se amplió el universo factual compartido a los 17 activos admitidos y se mantuvo el límite de seis en la composición privada; pruebas locales pasan. |

## Presupuesto y afirmaciones de la entrega

- El LLM comparte una narrativa por periodo/idioma, pero **el coste total no es constante por número de usuarios**. Voz, combinaciones de activos/orden, almacenamiento y tráfico pueden crecer. No se midieron dólares.
- D8 supone cobrado un intento incierto tras 300 segundos y permite reintento; el workRef por modelo permite fallback mientras otro modelo sigue incierto. Esto acota exposición con el presupuesto dedicado, pero no acredita recuperación del proveedor ni evita cobros duplicados. Adoptar esa política explícitamente o conservar bloqueo hasta conciliación real.
- La nueva autorización de pago requiere evidencia de periodo de pago verificada y suscripción vigente: un estado `active` de RevenueCat por sí solo también puede representar un trial. La carga de evidencia por un adaptador de facturación sigue pendiente; sin prueba el beneficio debe denegarse. El derecho Pro global del resto de Bobby permanece intacto.
- El ledger registra las nuevas superficies, pero no existe reserva atómica conjunta con los topes globales del Desk. No presentar $15/día o $300/mes como techo global garantizado por ambas superficies.
- Aceptar una sesión Supabase verificada de X/email no es por sí solo un fallo si propietario y el derecho de pago vigente se validan. Definir aparte si las cuentas anónimas verificadas son admisibles; no romper X por imponer Apple/Google sin decisión de producto.

## Evidencia y límites

`check:api` se ejecutó sin errores durante la revisión inicial. El revisor repitió calendario (142) y contenido (149) con éxito antes del cambio semanal. La suite core quedó bloqueada al abrir un servidor HTTP/2 local por el sandbox; no se cuenta como pasada completa. Estos resultados se sustituyen por los checks finales del ajuste semanal documentados en [actualización de producto](pro-market-briefings-weekly-update-2026-10-02.md).

El log histórico de Claude `scratchpad/b53-audio-full.log` fue cotejado: contiene `Executed 348 tests, with 0 failures` y `TEST SUCCEEDED`. El total 348 tiene respaldo local; el desglose publicado 287+42+35+25 suma 389 y está mal. Ese log es anterior al ajuste semanal/Notch. Ninguna cifra de simulador prueba el flujo físico.

El supuesto `scripts/test-briefings-load-pg.mts` no existe en el commit revisado. No hay evidencia del escenario 100 entregas/20 aperturas de cuentas distintas. El override `at` de staging acepta JSON, no query; solo cambia el calendario del worker, no `now()` de PostgreSQL. La prueba de despacho/expiración debe alinear ambos relojes o ejecutarse en tiempo real.

## Apple y activación

Orden de trabajo: revisar configuración existente → capacidad Push del App ID → clave APNs existente o nueva con scope/entorno adecuados → perfiles y archivo firmado con `aps-environment=production` → respuestas de App Privacy coherentes con datos realmente guardados → staging con proveedores/coste → iPhone físico → decisión de activación.

La revisión inicial no cambió servicios remotos. Después, con autorización explícita de Anthony, se activó Push y se regeneró/descargó/instaló el perfil App Store de Bobby; no se crearon claves APNs, no hubo migraciones/deploys ni notificaciones. El archivo firmado posterior es 1.6 (53), pues 1.5 ya está lista para distribución. Apple Developer y App Store Connect están autenticados en el navegador de Codex. TestFlight muestra como último build 1.5 (52), cargado el 1 de octubre; todavía no aparece 53. La revisión local de perfiles encontró tres perfiles de Bobby sin aps-environment. Se confirmó Push Notifications desactivado, luego se activó con autorización y el nuevo perfil contiene aps-environment production. Archivo/export y firma fueron verificados; la subida y disponibilidad siguen un gate independiente. La privacidad se termina tras confirmar la captura real de consultas y la política de retención.
