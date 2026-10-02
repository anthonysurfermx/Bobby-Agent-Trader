# Brief para Claude: resúmenes de mercado de Bobby Pro

Preparado el 2 de octubre de 2026. **Estado: infraestructura diseñada y contrastada con el código; aún no implementada ni desplegada.** Build objetivo: **53**. La fuente inspeccionada todavía declara **1.5 (52)**.

## Brief corto para compartir

El siguiente build de Bobby incluirá resúmenes de mercado en Pro. El usuario confirmó el matutino a las **08:00 de Nueva York** y tres opciones independientes en **Profile: inicio de mercado, cierre de mercado y notificación semanal**. Cuando un informe esté listo, llegará “Bobby tiene tu resumen de mercado listo”. Al tocarlo, la app abrirá el informe y Bobby lo narrará con su compañero/voz, respetando silencio y consentimiento. El texto también estará disponible.

La implementación reutiliza el snapshot global de `bobby-intel`, las preferencias/memoria consentida y el reproductor nativo. Añade preferencias por cuenta, inbox privado, programación con calendario y horario de verano, generación con presupuesto, outbox APNs, registro seguro de dispositivos y ruta nativa de apertura/narración. La memoria actual del Desk solo admite web; iOS necesita sus controles de consulta, corrección, pausa y borrado antes de incorporarla.

El diseño y los contratos adjuntos fijan qué se reutiliza, qué falta, cómo evitar duplicados y cómo probarlo. Solo **08:00 Nueva York y las tres categorías** están confirmados; cierre +15 minutos y semanal domingo 18:00 son propuestas. La activación en producción queda detrás de validación, configuración Apple y autorización de despliegue/migración.

## Documentos de referencia

- [Diseño completo de producto e infraestructura](pro-market-briefings-build-53.md).
- [Contratos propuestos de APIs](pro-market-briefings-api-contracts.md).
- [Coordinación de QA de producción](../qa/ios-prerelease-2026-10-02/COORDINATION.md): Claude mantiene la ejecución de la ronda de capacidad; el seguimiento de Codex está pausado.

## Punto de partida y límites

Fuente auditada: checkout aislado `/Users/mrrobot/.codex/worktrees/bobby-ios-build-53/Bobby-Agent-Trader`, base `0cc3a84`. Es un punto de partida limpio de release; hay que cotejarlo con la integración final del dashboard antes de implementar/mezclar código compartido. No contiene cambios de build 53 todavía. Los documentos están en el repositorio principal; no se han hecho commits ni pushes.

No se han verificado credenciales APNs fuera del repositorio, capacidades del App ID, firma con push, plan de Vercel, recepción en iPhone ni coste real del nuevo briefing. No falta necesariamente una credencial por no aparecer en el source.

## Paquetes de implementación

| Paquete | Entrega concreta | Cierre verificable |
| --- | --- | --- |
| 1. Preferencias e identidad | API GET/PATCH por cuenta; estados `opening`, `close`, `weekly`; revisión para escrituras concurrentes; selección y permiso iOS separados | Ocho combinaciones de interruptores; guardar solo tras respuesta; A→B descarta estado/respuestas de A; Pro vencido permite desactivar |
| 2. Base de datos y trabajo pendiente | Preferencias, informes, dispositivos, outbox y reservas/intentos duraderos; RLS, permisos restringidos, índices, unicidad y leases con fencing | Ningún acceso directo anónimo; dueño verificado por API; replays no crean segundo periodo; workers vencidos no publican |
| 3. Calendario y motor | Loader de mercado de solo lectura compartido; periodos canónicos; snapshot/narrativa compartidos; síntesis personal corta y validada | 08:00 Nueva York bajo DST; festivos/cierres anticipados; datos obsoletos identificados; historial semanal real; informe persistido antes del aviso |
| 4. Presupuesto y recuperación | Reserva monetaria atómica por intento HTTP, liquidación de coste real, resultado incierto y conciliación; plazas globales limitadas | No gasto sin reserva; un timeout ambiguo no dispara otro cobro a ciegas; llamadas internas de retry contabilizadas; no créditos del Desk |
| 5. Push | Cliente APNs con configuración privada, registro/rotación/rebind de token, outbox finito, errores y vencimiento | Token antiguo se revoca; petición tardía de A no roba/desvincula B; payload genérico; se distingue aceptación APNs de recepción física |
| 6. iOS | Entrada de Profile, hoja de preferencias, inbox/hoja nativa de informe, intención de toque diferida, cola de voz y controles | Cold/warm tap; cuenta correcta; sin repetición al foreground; silencio, micrófono ocupado, pausa/cancelación y segundo plano; build 53 compila |
| 7. Memoria y privacidad | Preferencias explícitas y activos con permiso, pantalla de memoria iOS y hooks de revocación/borrado | Apagar/borrar memoria invalida contenido personal pendiente; nombre local no se sube automáticamente; borrado purga datos/audio y entregas |

## Integración exacta con el código

Backend:

- `api/bobby-intel.ts`: extraer/reutilizar el loader global cacheado. **No invocar `bobby-cycle`, `user-cycle` ni rutas de trading** para crear informes.
- `api/_lib/user-memory.ts`, `api/memory.ts`: preferencias explícitas y activos; conservar el kill switch y límites de retención. La plataforma iOS está excluida actualmente.
- `api/_lib/user-identity.ts`: exigir sesión verificada Supabase con `authUserId`; el resolver también admite wallets y no basta usarlo sin restringir el tipo de identidad.
- `api/_lib/access.ts`, SQL `bobby_is_pro`: entitlement vigente sin consumir lecturas. `readAccess` usa fallback anónimo ante fallos y no sirve como autorización del worker.
- `api/_lib/llm.ts`, `api/_lib/llm-usage.ts`: instrumentar **cada intento HTTP**. `completeJson` contiene retries internos. El budget/ledger actual es best effort, cacheado y no cubre esta voz.
- `api/bobby-voice-free.ts`: límite actual de 800 caracteres, 60 llamadas/IP/10 minutos y 3.000 globales/día. El briefing necesita voz autenticada/cacheada; esos topes no son un presupuesto monetario.
- `api/account.ts` y memoria: conectar purga/invalidation con las tablas/audio nuevos. Una retirada no puede deshacer un push que Apple ya aceptó; su contenido genérico y la autorización al abrirlo limitan la exposición.
- `vercel.json`: futuro trigger de trabajo pendiente con secreto, sin modificar los ciclos existentes. En staging, trigger controlado; no asumir cron automático de preview.

iOS:

- `ios/Bobby/Sources/AccountSheet.swift`: fila “Resúmenes de mercado” antes de la voz; nueva ruta/hoja con los tres interruptores.
- `ios/Bobby/Sources/BobbyAccess.swift`: reutilizar `BobbyAccessAPI` y patrón `BobbyAccessCenter` de dueño/generación. Las elecciones de cuenta no pertenecen a `AgentProfile` global.
- `ios/Bobby/Sources/BobbyApp.swift`: adaptador de delegado de app y notificaciones; coordinación de registro/token/toque.
- `ios/Bobby/Sources/Nucleo/NucleoRootView.swift`, `NucleoSession.swift`: hoja nativa e intención pendiente; si usa el bridge, hook de `pageStarted`. `emit` pierde eventos antes de que la página esté lista.
- `NucleoVoice.swift`, `NeuralVoice.swift`: cola de segmentos ≤800 caracteres, avanzar solo tras `finished` del segmento correcto; pausa/continuación requiere trabajo nuevo. Mantener eventos del bridge y controles de voz existentes. Añadir reproducción de audio autorizado del briefing: `speak` actual llama al endpoint público y no resuelve autorización/cache de este flujo.
- `AccountSession.swift`: `AppleGivenName` tiene promesa local. Saludo hablado genérico por defecto; nombre visual local. Nombre por TTS remoto solo con consentimiento explícito y copy actualizado.
- `ios/Bobby/project.yml`, `Bobby.entitlements`: target build 53, versión comercial 1.5; configurar push y regenerar XcodeGen. Entorno APNs derivado de firma, no de `DEBUG`. Regenerar Núcleo solo si cambia su fuente HTML/JS.

## Reglas que definen la infraestructura

- **Auth y datos pueden estar en proyectos Supabase distintos.** RLS directa por `auth.uid()` requiere verificar issuer/mapeo. Primera versión: tablas API-only con RLS y grants directos revocados; cada operación de service-role exige filtro de dueño derivado del bearer, nunca enviado por el cliente.
- **Periodo único:** matutino por fecha local NY, cierre por fecha de sesión, semanal por inicio/fin explícitos. La versión de calendario es evidencia y no cambia la identidad del periodo.
- **Selección ≠ entrega habilitada:** combina opt-in de cuenta, Pro, consentimiento, permiso iOS y dispositivo activo. Negar permiso conserva la selección y muestra el paso a Configuración.
- **Apagar avisos** cancela trabajo futuro y pushes pendientes; no elimina por sí solo informes anteriores. La recuperación de contenido sigue requiriendo cuenta propietaria y Pro según el contrato propuesto.
- **Dispositivo:** Keychain con prueba de posesión/credential de instalación; rebind atómico con revisión del servidor, cancelación de outbox antiguo y rotación. UUID de instalación solo no prueba posesión.
- **Voz:** el servidor lee el texto del informe autenticado; no acepta un payload público de texto/URL/modelo para eludir gasto. Cache de audio compartido tras autorización; audio personal privado.
- **Compañero:** la selección existe hoy en estado nativo. Sincronizar su persona permitida en preferencias por cuenta y congelarla en el informe para preparar audio; no asumir que el servidor ya la conoce. Cambiarla afecta informes futuros.
- **Concurrencia propuesta:** 2 plazas LLM y 2 TTS globales, leases/fencing en DB, batch pequeño y deadline. Reservas sin configuración o conciliación dudosa suspenden nuevo gasto. Esta cifra se ajusta con mediciones.
- **08:00:** preparación anticipada, prioridad a contexto y audio compartidos; no generar 100 debates completos a las ocho. La recepción exacta depende de APNs/iOS/red y no es garantizable.

## Configuración propuesta, sin secretos en Git

Nombres sugeridos para la nueva superficie: `BOBBY_BRIEFINGS_ENABLED` (apagado inicialmente), límites monetarios dedicados diarios/mensuales, máximos de tokens/caracteres, calendario/versionado y worker concurrency. Reutilizar resolución `BOBBY_SUPABASE_*` y `BOBBY_AUTH_*` existente.

APNs: key ID, team ID, private key `.p8`, topic `xyz.bobbyprotocol.bobby`, entornos permitidos y clave de cifrado de tokens. Configuración privada del servidor, nunca en app/cliente/logs. Scheduler con `CRON_SECRET` no vacío y verificación estricta. **No se han configurado credenciales ni cambiado permisos remotos.**

## Valores propuestos que faltan por aprobar como producto

| Decisión | Propuesta para la primera versión |
| --- | --- |
| Días del matutino | Todos los días; fines de semana/festivos explican bolsa cerrada y contexto cripto vigente |
| Cierre | Solo sesiones reales, cierre oficial +15 minutos; incorpora cierres anticipados |
| Semanal | Domingo 18:00 Nueva York, ventana de siete días hasta ese instante y última semana bursátil completada |
| Preparación y vigencia | Preparar desde 07:30, deadline 07:59, push matutino vence 08:30; ajustar con benchmark |
| Inicialización | Tres opciones apagadas hasta elección explícita |
| Retención | Texto/evidencia/audio/tokens e intentos requieren valores y purga conjunta antes de crear la migración |

Solo el matutino a las ocho y las tres opciones de Profile son horarios/controles confirmados. No habilitar una cadencia sin política de horario/calendario resuelta.

## Validación y entrega esperada

Patrones existentes: `AccountIsolationTests`, `NucleoRemediationTests`, `NucleoBridgeTests`, `AvatarVoiceTests`, scripts de memory/Desk/ledger y pruebas Postgres locales. Tests de calendario con ambos cambios DST, festivo, cierre anticipado, semana cruzando año y cron duplicado/perdido. Casos de Pro vencido, cuenta A→B, permisos denegados, token inválido, retiro de consentimiento, datos stale, provider timeout y lease viejo.

Validar en staging 100 informes/entregas en cola y 20 aperturas simultáneas de **cuentas distintas**, medir cache/coste/retries y demostrar ausencia de acceso cruzado. Después, iPhone físico: notificación real, cold/warm tap, nombre/voz, mute, segundo plano y recuperación. HTTP 200 o simulador no demuestran recepción APNs ni flujo físico.

Cada paquete queda con fuente, checks del commit final, evidencia y pendientes. La entrega a producción requiere migración compatible con el dashboard, build local, configuración Apple/hosting y autorización de activación. No hubo implementación, compilación, compra, tráfico de carga ni modificación de producción durante la preparación de este brief.
