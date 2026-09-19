# Auditoría: correcciones para Bobby 1.2 (33)

Fecha: 19 de septiembre de 2026. Candidato local; todavía no enviado a Apple.

Se revisaron los problemas de los builds 28–31. Esta corrección parte del backend publicado `99e84e2` y conserva las mejoras de geometría y horizontes del código nativo 32 (`a8752a7`), integrado de forma separada en `785d39b`. El trabajo está aislado en `codex/ios-audit-remediation`; el checkout original y sus cambios pendientes permanecen intactos.

## Cambios

| Hallazgo | Corrección |
|---|---|
| F01: una renovación pendiente restauraba la sesión después de salir | Generación de sesión y una sola renovación compartida; respuestas antiguas no pueden reautenticar ni aplicar progreso a otra cuenta. |
| F02: la pregunta no llegaba a tres agentes reales | Nuevo `/api/desk-debate`: Alpha recibe pregunta y evidencia, Red cuestiona su argumento y CIO sopesa ambos. El cliente exige los tres resultados; un fallo no genera NO TRADE ni XP. |
| F03: pérdida de XP en errores intermedios o entre dispositivos | Una transacción PostgreSQL guarda evento, contadores y pieza. El cierre de una semilla también es atómico y recuperable mediante reintento. |
| F04: islas grandes o núcleo movido en la web incompatibles con 31 | Se integra el cliente Growth v1 de 32 y se conservan sus pruebas de geometría, colisiones, horizontes y sincronización. |
| F05: borrado sin desconectar Apple | Intercambio de autorización reciente, validación criptográfica de identidad y revocación en servidor; observación de credenciales revocadas en iOS. Para cuentas sin token recuperable, se borra la cuenta y se muestra el paso de desconexión manual documentado por Apple. |
| F06: contenido público sin moderación | La versión distribuible no carga ni ofrece galería o publicación. Conserva la isla personal, nombre privado y opción de hacer privada una isla anteriormente publicada. Las escenas públicas de prueba sólo existen en Debug con argumentos de QA. |
| F07: importación inicial duplicaba XP pendiente | El cliente envía XP histórico separado de todos sus eventos pendientes; el servidor conserva compatibilidad con clientes anteriores. |
| F08: alternar fechas eludía el límite diario | El límite se calcula desde el historial de eventos premiados para cada día, bajo bloqueo de la cuenta. |
| F09: errores temporales cerraban sesiones | 429 y errores de servicio mantienen la sesión. Fallos del servicio de autenticación devuelven 503; una credencial inválida sigue devolviendo 401. |
| F10: compañero incorrecto al restaurar otra cuenta | Primera sincronización restaura el compañero del servidor; los cambios locales posteriores vuelven a sincronizarse. |
| F11: 4H de acciones devolvía velas diarias | 4H no se ofrece para acciones. El análisis declara que usa 1H; cambiar el gráfico no cambia silenciosamente el intervalo del análisis ni arrastra sus niveles a otro gráfico. |
| F12: gráfico vacío mostraba carga infinita | Estado de carga separado de error, mensaje y botón de reintento. |
| F13: acción e indicadores del derivado mezclados | El nuevo análisis usa una sola fuente/instrumento: acciones de Yahoo o spot de OKX. Muestra fuente, intervalo y fecha; rechaza datos insuficientes o antiguos. |

También se desactiva toda voz en esta versión (interfaz, TTS y clips), se retira la frase que prometía capital protegido, se agrega consentimiento explícito para enviar preguntas a OpenAI y se actualiza el manifiesto y aviso de privacidad. El borrado elimina la cola local de la cuenta eliminada.

La respuesta del CIO distingue **esperar** de **una idea que merece más investigación**. No se inventa un porcentaje de convicción o un plan de ejecución para rellenar la pantalla. La app sigue siendo educativa y no ejecuta operaciones.

## Verificación

- 94 pruebas unitarias de iOS, sin fallos.
- 15 pruebas de interfaz: 13 de isla/piezas/horizontes y 2 de consentimiento/ausencia de galería pública, sin fallos.
- 107 comprobaciones de API de Trader Land, 116 de tesis, 47 de seguridad API y 42 del filtro de riesgo, sin fallos.
- 29 comprobaciones nuevas de autenticación, revocación con firmas reales de prueba, contratos de análisis, límites y fallos de proveedor, sin fallos.
- 24 comprobaciones contra PostgreSQL real: concurrencia, reintentos, fallo inducido entre escrituras, límites diarios y cuota atómica del modelo, sin fallos.
- Análisis real de BTC y NVDA: datos públicos y tres llamadas reales al modelo; respuestas completas en aproximadamente 7 y 4 segundos. BTC utilizó OKX; NVDA, Yahoo. Evidencia guardada en `output/audit-remediation/live-*.json`.
- Archivo nativo Release firmado `output/audit-remediation/Bobby-1.2-33.xcarchive` creado correctamente (1.2, build 33). No exportado ni enviado a App Store Connect.
- `npm run build`, comprobación TypeScript de API, lint de los archivos de producción modificados y validación del manifiesto de privacidad pasan.
- Nuevas regresiones incorporadas a CI; la integración PostgreSQL tiene un servicio aislado propio.

Los tests de Apple usan claves sintéticas y firmas válidas generadas durante la prueba. No sustituyen una prueba de inicio y borrado con una cuenta Apple real. Los tests de interfaz de la isla usan datos locales de QA; las transacciones del servidor se verificaron por separado en PostgreSQL real.

## Orden de despliegue y pendientes

1. Aplicar `20260919183000_atomic_progress.sql` y `20260919190000_desk_quota.sql` al proyecto Bobby mediante el MCP de Supabase. No está disponible en esta sesión y no se modificó la base de datos de producción. Growth v1 es un prerrequisito ya presente en la base usada para las pruebas.
2. Configurar en el backend `APPLE_SIGN_IN_TEAM_ID`, `APPLE_SIGN_IN_KEY_ID`, `APPLE_SIGN_IN_PRIVATE_KEY` y `APPLE_SIGN_IN_CLIENT_ID=xyz.bobbyprotocol.bobby`. La clave debe estar habilitada para Sign in with Apple; una clave de App Store Connect no sirve. Pendiente identificar la clave correcta. Nunca agregarla al repositorio.
3. Desplegar el backend de esta rama, con `OPENAI_API_KEY`, `RATE_LIMIT_SALT` y las variables Bobby/Supabase existentes. El nuevo análisis rechaza solicitudes si la cuota persistente no está operativa; máximo 30 solicitudes por IP y 600 globales por ventana de 24 horas. Cada respuesta completa requiere tres llamadas al modelo. `BOBBY_DESK_MODEL` es opcional.
4. Probar en un iPhone real: Apple y X, salir/entrar, recuperar el compañero y XP, borrar la cuenta y comprobar la revocación; probar el binario contra el backend ya desplegado. Estas comprobaciones reales quedan pendientes.
5. Actualizar App Store Connect con capturas y descripción de esta versión sin voz ni galería pública; revisar la declaración de contenido de usuario enviado a OpenAI. Seleccionar el nuevo build sólo después de los pasos anteriores.

**No dar el lanzamiento por aprobado todavía:** hay correcciones compiladas y verificadas localmente, pero faltan migraciones, despliegue y pruebas con identidades reales. No se restauraron automáticamente inconsistencias históricas de XP que pudieran existir; eso requiere un diagnóstico de datos de producción antes de decidir una reparación.

## Referencias de Apple

- [App Review Guidelines: contenido generado por usuarios y privacidad](https://developer.apple.com/app-store/review/guidelines/).
- [TN3194: borrado de cuenta y revocación de Sign in with Apple](https://developer.apple.com/documentation/technotes/tn3194-handling-account-deletions-and-revoking-tokens-for-sign-in-with-apple).
