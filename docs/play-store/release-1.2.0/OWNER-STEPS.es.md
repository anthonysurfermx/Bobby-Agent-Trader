# Play Console — pasos del propietario

Entrega técnica: draft PR #185; versión **1.2.0**, código **10**, paquete **xyz.bobbyprotocol.bobby**. Claude firma el AAB y, para una prueba de teléfono fuera de Play, el APK universal. Codex no accede a la clave de subida. No subir un AAB sin firmar. Los hashes y el comando exacto de descarga quedarán en `release-evidence.md` tras CI verde del commit final.

## 1. Cerrar las dependencias de publicación

- Aprueba con Claude la migración aditiva y el servidor de PR #186; verifica después el guardado/restauración real de perfil Android. Hasta entonces POST `/api/progress` devuelve 400; no está resuelto por esta app.
- Claude debe publicar el párrafo Android de privacidad y un camino explícito de solicitud de borrado fuera de la app. Comprueba en navegador incógnito `https://bobbyprotocol.xyz/privacy?platform=android` y `https://bobbyprotocol.xyz/support?platform=android#contact`: nombre de Bobby, qué se borra/conserva, cómo identificar la cuenta y formulario funcional. El soporte debe explicar Android/Google, no instrucciones de iPhone.
- Proporciona acceso de revisión a funciones de cuenta si Google lo solicita; no guardes credenciales en el repositorio. Prueba Google OAuth/deep link y borrado en un teléfono real con una cuenta prescindible.
- Obtén de Claude los archivos firmados **del mismo commit** y el hash del AAB firmado. Conserva el SHA del unsigned para trazabilidad. No regeneres ni rotes la clave existente. No actives Google billing ni FCM como parte de esta entrega.

## 2. Crear/completar la ficha

| Campo | Valor |
|---|---|
| Nombre de la aplicación | El título de `listing.<lang>.md`; inglés: **Bobby: Market Perspectives** (usa el archivo como autoridad) |
| App / juego | **App** |
| Gratis / pago | **Gratis** |
| Idioma predeterminado | **Inglés (Estados Unidos), en-US** |
| Traducciones | **Español es**, **Francés fr-FR**, **Portugués (Brasil) pt-BR**, **Italiano it-IT**, **Alemán de-DE**; pegar cada archivo correspondiente |
| Descripción breve / completa | Secciones exactas de `listing.<lang>.md`; límites comprobados en `metadata-lengths.json` |
| Política de privacidad | `https://bobbyprotocol.xyz/privacy?platform=android` — verificar publicación primero |
| URL para eliminar cuenta | `https://bobbyprotocol.xyz/support?platform=android#contact` — verificar instrucciones y envío primero |
| Anuncios | **No**; `ads.md` |
| Público objetivo | **18 años o más**; no dirigida a niños |
| Acceso a la app | **Todas o algunas funciones están restringidas**; pegar instrucciones de `app-access.md` y el acceso privado que solicite Google |
| Funciones financieras | **My app doesn’t provide any financial features**, sujeto a la clasificación que Google pida; evidencia en `financial-features.md` |
| Seguridad de datos | **Sí recopila datos**, HTTPS, OAuth, borrado disponible; completar cada tipo según `data-safety.md` y confirmar los datos del servidor señalados allí |
| Clasificación | Completar IARC según `content-rating.md`, declarando contenido de usuarios/IA; usar la calificación emitida, no inventar una |
| Categoría propuesta | **Educación**, por el aprendizaje de mercado; revisa que represente fielmente la ficha final |

Contacto de desarrollador/email, entidad y domicilio: usa los datos reales de la cuenta Console. Son datos del propietario, no inventados en este dossier. Completa también declaraciones nuevas que Console muestre; no ocultes una función para eludir revisión.

Capturas de teléfono: usar las capturas aprobadas de cada idioma descritas en `screenshots-review.md` (1080×1920). No usar la captura de consentimiento/borrado como promesa de un backend real probado. Icono: `app-icon-512.png`, mismos píxeles del icono Android, en PNG de 32 bits (512×512). Feature graphic: `feature-graphic-1024x500.png` (1024×500, PNG de 24 bits sin alpha), mismos píxeles RGB del arte de marca existente en inglés, revisado visualmente; no contiene una pantalla de otro producto ni menciona tiendas/cadenas retiradas. Usa ese recurso común o el arte localizado que el propietario ya haya aprobado; no estires el icono.

## 3. Prueba interna primero

La **prueba interna** sirve para que el grupo instale y dé feedback cuanto antes; no cuenta para el requisito de prueba cerrada.

1. Console → Prueba y lanzamiento → Pruebas → **Prueba interna**. Crear release **Bobby 1.2.0 (10)** y subir el AAB firmado. Activar/confirmar Play App Signing conservando la identidad existente; no elegir rotación de clave.
2. Pegar `release-notes.<lang>.txt` en cada idioma. Revisar permisos, warnings del bundle, dispositivos compatibles y pre-launch report. No ignorar un error de firma/código repetido.
3. Testers → crear lista **Bobby Android RC 12** con las doce direcciones Google reales del grupo. Añadirlas a interna, guardar, publicar esa release y copiar el enlace de participación de Console.
4. Compartirlo manualmente con el grupo y `TESTERS.es.md`. Deben aceptar con la cuenta incluida. La interna suele estar disponible rápido, pero no prometer una hora de instalación: Console/Play determina la disponibilidad.

## 4. Enviar la cerrada inmediatamente

La **prueba cerrada** sirve para cumplir la prueba sostenida y preparar la solicitud de producción; Google revisa su publicación y no hay un plazo garantizado.

1. Pruebas → **Prueba cerrada** → crear pista **Bobby closed 12**. Asignar la misma lista **Bobby Android RC 12** y los países del grupo real.
2. Crear release **Bobby 1.2.0 (10)** → **Añadir desde biblioteca** o promover el bundle de interna. Es el mismo AAB/código 10: no volver a subirlo como si fuera otro binario ni incrementar versión sin necesidad.
3. Completar ficha/declaraciones y enviar los cambios de prueba cerrada **a revisión** inmediatamente. Si publicación gestionada está activa, publica los cambios aprobados cuando estén listos. No prometer que el grupo empieza mañana si Google no los ha habilitado.
4. Cuando esté disponible, copiar su enlace. Quien esté en interna debe salir de ella y luego aceptar la cerrada con la cuenta de la lista; comprueba instalación/versión. Un participante interno no recibe automáticamente una release cerrada.
5. Para una cuenta **personal nueva sujeta a la regla**: conservar **al menos 12 testers inscritos de forma continua durante 14 días** en cerrada. El contador empieza con la participación efectiva en esa pista, no con la subida, la revisión ni las instalaciones internas. Verifica el estado en Console. Si uno sale, conserva un margen de testers y observa el contador real.
6. Recoger uso y feedback, solucionar fallos y registrar el proceso. Tras cumplir los requisitos, el propietario solicita acceso a producción y responde las preguntas de Google sobre la prueba. Cumplir el contador no garantiza aprobación.

## 5. Confirmaciones posteriores

Prueba desde Play en un teléfono real. Comprueba aviso de riesgo, seis idiomas asignados al grupo, lectura real, teclado/Atrás, dictado/voz, recordatorio, Google sign-in, borrar cuenta y soporte/reportes. No probar compras: están desactivadas. Añade el SHA-256 **del certificado de firma de la app de Play** a `assetlinks.json` mediante Claude; no usar el certificado temporal de CI ni confundirlo con el de subida. Solo entonces verificar la asociación automática de enlaces de invitación.

Fuentes oficiales: [configurar interna/cerrada](https://support.google.com/googleplay/android-developer/answer/9845334), [requisitos para cuentas personales nuevas](https://support.google.com/googleplay/android-developer/answer/14151465), [borrado de cuenta](https://support.google.com/googleplay/android-developer/answer/13327111). No se ha publicado nada en Play ni se ha fusionado el PR durante esta entrega.
