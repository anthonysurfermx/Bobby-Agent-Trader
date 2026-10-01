# Bobby 1.5 — revisión final independiente para App Review (2026-09-30)

**Revisor:** Claude (Sonnet 5.5), sesión independiente. **Fecha de observación:** 2026-09-30, ~15:25–16:25 (+01:00).
**Modo:** solo lectura. No se envió, subió, desplegó, publicó ni instaló nada; no se tocaron precios, acuerdos ni credenciales; no se hizo ninguna pregunta real de IA.

---

## 1. Veredicto

# NO LISTA PARA ENVIAR

**Alcance del veredicto:** preparación para App Review de Bobby 1.5 tal como está hoy. La aprobación la decide Apple; nada de esto es una promesa de aprobación. La monetización se juzga aparte (sección 8) y **no** condiciona este veredicto salvo donde se indica.

**Razón central (una frase):** la ficha remota de Apple no está preparada (versión 1.5 sigue *Rejected* con el build 38 adjunto y ningún set de capturas aprobado subido), el candidato cambió tres veces en una hora y ninguno existe como commit, y hay cuatro puertas críticas sin cerrar que solo Anthony puede resolver (Guideline 1.2 sin proceso humano, revocación de Apple no operativa en producción, verificación en dispositivo físico, y la regresión de voz).

### Bloqueadores (deben resolverse o aceptarse por escrito antes de enviar)

| # | Bloqueador | Evidencia clave | Quién |
|---|---|---|---|
| B1 | La versión 1.5 sigue **Rejected** con el **build 38** adjunto; el set aprobado de capturas no está en ningún idioma; palabras clave y subtítulo de en-US no son los preparados | Lectura remota de hoy (sección 3) | Anthony |
| B2 | **Candidato sin resolver y no reproducible.** Builds 47, 48 y 49 están procesados en Apple; 49 es el correctivo de voz. Ningún commit los contiene (HEAD dice build 45); el árbol sigue sucio | Secciones 4 y 5 | Anthony / Codex |
| B3 | **Regresión de voz** (se oye la voz del sistema en lugar del compañero). 47/48 conservan el fallback; el parche de backend (persona-only, 12 s) existe **solo en local**, sin desplegar. Sin verificación en dispositivo | Sección 5 | Anthony (aprobar deploy) |
| B4 | **Guideline 1.2 (UGC, Trader Land):** los mecanismos técnicos existen, pero nadie consume la cola de reportes, no hay moderador ni suplente nombrado, ni SLA, y el aviso por correo del formulario de soporte no puede dispararse (`BREVO_API_KEY` ausente). Nunca se ejercitó en producción | Sección 6 | Anthony |
| B5 | **Revocación de Sign in with Apple no operativa en producción:** las 4 variables `APPLE_SIGN_IN_*` no existen en ningún entorno; el borrado siempre cae en la vía manual. Nunca se probó una revocación real | Sección 6 | Anthony |
| B6 | **Gates de dispositivo físico: 0 ejecutados** (sección 7) | — | Anthony |

### Riesgos mayores (no bloquean por sí solos, pero requieren decisión explícita)

- Textos "**Bobby Pro is coming soon**", "Bobby Pro opens very soon" y "**N days of Bobby Pro**" alcanzables en Release (Invite friends) con pagos apagados; las notas de revisión ya no lo mencionan (2.1(a)/2.3.1(a)). Verificado por mí en el binario 49 y en `NucleoLevels.swift:441,497`.
- **"Hold to agree"** (único gesto de consentimiento de IA) no puede completarse con una sola activación de VoiceOver/Switch Control; el nombre accesible es "Ask Bobby, hold to talk".
- **Capturas 03/05/07**: UI de build 40 capturada con el arnés de desarrollo; la 05 muestra la etiqueta "OKX" (la regla del repo prohíbe nombrar OKX en superficies públicas); ES/PT muestran UI en inglés; solo 3 de 7 láminas muestran la app (riesgo 2.3.3 **medio**, evaluación mía, no predicción).
- **Acceso del revisor:** 3 lecturas gratis por dispositivo/30 días y luego Sign in with Apple; además un tope de 15 lecturas por red /24 cada 7 días **ya agotado** para una /24 hasta 2026-10-04 (no atribuible). Las notas no dan números ni dicen "no hace falta cuenta demo". La UI dice "10 lecturas/semana" pero el servidor no lo aplica.
- **Deriva de `main`:** `52d28b3` está en producción por deploy CLI pero **no está en `origin/main`** (verificado por mí: `origin/main` = `ca80d57`). El siguiente merge a `main` puede revertir las correcciones de privacidad, soporte y cuotas.
- Soporte muerto: el formulario dice que notifica a un proveedor; `BREVO_API_KEY` no existe en producción, así que nadie recibe avisos de soporte, privacidad o seguridad de comunidad.

---

## 2. Qué se hizo (método y límites)

- **Remoto Apple (yo, solo lectura):** App Store Connect en tu Chrome vía Claude in Chrome (el navegador integrado no tiene sesión y no puedo iniciar sesión por ti). Solo abrí vistas, selectores de idioma, "Manage" de disponibilidad y "View Details". **No** pulsé Save, Delete, Delete All, Expire Build, Add for Review ni Update Review. Una segunda pestaña en el mismo grupo la abrió otro proceso, no yo. La extensión *Tab Suspender* suspende pestañas inactivas (probable causa de la "UI colgada / vista en blanco" que viste antes).
- **Local/backend/política:** workflow de 11 auditores en paralelo (capturas, archive, tests, privacidad cliente, privacidad backend, borrado/revocación, UGC, backend de producción, monetización, metadata, guidelines), **249 gates**, con 2 escépticos independientes por gate bloqueante/mayor (~124 agentes, 0 errores) y un crítico de completitud. Detalle completo: [`claude-final-app-review-2026-09-30-gates.md`](claude-final-app-review-2026-09-30-gates.md).
- **Verificaciones propias posteriores** (para no depender solo de los auditores): deriva de `main`, delta archive 49 vs 47, nombres de variables de entorno (solo nombres), cadena de firma, texto "Pro coming soon", capturas 03/05 vs captura real del build 47, y estado de builds en TestFlight.
- **No probado (fuera de alcance por reglas):** dispositivo físico, Sign in with Apple real, revocación real, pagos/Sandbox, tráfico de red en vivo, cualquier llamada de IA/TTS, escrituras en producción, Xcode UI.

### Efectos secundarios de esta auditoría (declarados)

1. Un auditor ejecutó `codesign -d` dentro del bundle del archive 47 y creó un archivo `-` (14 bytes, `["QZRTV6CMTT"]`) a las 16:02. Eso rompía `codesign --verify --deep --strict` del archive en disco. **Lo eliminé (solo ese archivo) y reverifiqué: la firma vuelve a validar.** El archive 47 ya estaba subido; no afecta a lo que Apple recibió.
2. Consultas de solo lectura al **catálogo** de la base de producción (esquema/FKs/RLS/estadísticas, sin leer filas de usuarios) y GET a páginas públicas y a `/api/bobby-access`. Sin escrituras, sin POST, sin IA.
3. Archivos de trabajo en el scratchpad de la sesión (`/private/tmp/claude-501/...`); nada dentro de los repos salvo este informe y su apéndice.

---

## 3. Evidencia remota de Apple (observada por mí, hoy)

| Requisito | Observado | Estado | Acción correctiva |
|---|---|---|---|
| Versión y estado | iOS 1.5 = **Rejected** ("5.0.0 Legal: Preamble"); envío del 23-sep 4:59 PM; 1.4 Ready for Distribution | Verificado | — |
| Rechazo leído de nuevo (Resolution Center) | Mensaje de Apple del 30-sep 3:22 AM, dispositivo iPhone 17 Pro Max + iPad Air 11" (M3), **build reseñado 1.5 (38)**. Guideline 5 – Legal: regulación china sobre síntesis profunda/IA generativa; la metadata "incluye referencias a ChatGPT y/o OpenAI: OpenAI"; pide desactivar esa funcionalidad en China y quitar referencias de nombre, subtítulo, promo, descripción y capturas. Opciones: cambiar Review Notes y reenviar, **o** no distribuir en China continental deseleccionando el storefront. "Las apps con ChatGPT/OpenAI pueden seguir usándose fuera de China." | Verificado | — |
| Disponibilidad guardada | **175 filas: 174 Available, 1 Not Available = China mainland.** Hong Kong, Macao y Taiwán: Available | Verificado; coincide con las notas ("174/1") | Que Apple acepte el remedio **no está demostrado**; no existe permiso ni licencia MIIT y no se afirma ninguno |
| Build seleccionado en la versión | **Build 38** (Delete disponible, no lo toqué) | **FAIL** | Anthony: quitar 38 y seleccionar el build final una vez decidido (sección 4) |
| Procesamiento / cumplimiento de exportación | **47:** Binary State *Validated*, subido 3:02 PM, *Uses Non-Exempt Encryption: No*, iOS mín. 17.0, solo iPhone, entitlements con Sign in with Apple, "Ready to Submit", grupo Founder. **48, 49:** "Ready to Submit" (49 visto a las 16:22). 46 también procesado (no seleccionar) | Verificado (47 con detalle; 48/49 solo estado) | — |
| Capturas — **inglés (EE. UU.)** | **6.9":** 5 capturas (editorial oscuras "Make sense of the market…" — no es el set aprobado). **6.5":** 7 capturas antiguas verdes ("Your market. Your Bobby.", etc.), y **ese set explícito alimenta 6.3", 6.1", 5.5" y 4.7"**. El orden remoto del set antiguo ya estaba alterado (05 antes de 04), ejemplo de que Apple reordena subidas simultáneas | **FAIL** — 0/7 del set aprobado | Borrar/reemplazar los sets explícitos obsoletos (6.9" y 6.5") y subir de forma que el orden remoto se verifique después del procesamiento |
| Capturas — **es-MX, pt-PT** | Ambos "Using English (U.S.) 6.9" / 6.5"" = **heredan el set inglés**; sin capturas propias. La variante rechazada con teléfonos **ya no está** (el "Delete All" terminó) | **FAIL** (sin set aprobado); restauración del estado previo: verificada | Subir los 7 ES y 7 PT aprobados a sus locales |
| Texto guardado en-US | Promo, descripción, novedades, URL de soporte: hash idéntico al local. **Palabras clave: guardadas las antiguas** (`bitcoin,ethereum,market,analysis,learn,investing,risk,charts,education,debate,finance,thesis,ai,btc`, 99 car.) ≠ preparadas (`assets,market,evidence,…`, 78). **Subtítulo: "Understand stocks & crypto"** ≠ preparado "Three views of the market" | Parcial | Decidir cuál es la fuente de verdad y guardarla |
| Texto guardado es-MX / pt-PT | Promo, descripción, novedades, palabras clave y soporte: **hash idéntico** a lo preparado. Subtítulo pt-PT (y es-MX no confirmado por separado): sigue en inglés | Parcial | Igual que arriba |
| Notas de revisión | 3 153 caracteres, **hash idéntico** a `release-47/metadata/review-notes.txt`. *Sign-in required* desactivado; contacto rellenado (valores no leídos) | Guardado = local; **el contenido tiene problemas** (sección 9) | Corregir texto (propuestas en sección 9) |
| Lanzamiento | **Manual** seleccionado; liberación por fases: inmediata; rating: mantener | Verificado | — |
| App Privacy | Publicada; **8 tipos** (Customer Support, Other Financial Info, User ID, Product Interaction, Other User Content, Gameplay Content, Device ID, Email Address), todos *App Functionality*, vinculados al usuario, sin sección de tracking. URL de política: `https://bobbyprotocol.xyz/privacy` (variantes `?lang=` por idioma no verificadas) | Verificado | Ver sección 6 sobre tipos no declarados |
| Clasificación por edad | **4+** (172 países; Brasil L; Corea Todos; Vietnam 00+). **Respuestas del cuestionario no leídas** (solo hay "Edit"; no lo abrí) | NOT_TESTED, **mayor** | Anthony revisa que UGC/chat de IA estén respondidos con honestidad; cuestionario nuevo obligatorio según auditor de guidelines |
| Accesibilidad (etiqueta) | "Get Started": **no iniciada** | Info | Decidir si publicar etiqueta (no se puede declarar Larger Text) |
| Suscripción | Grupo "Bobby Pro" con "Bobby Pro Monthly": **Prepare for Submission**, disponible en 174/175, localizaciones EN/PT-**BR**/ES-MX. **No adjuntar a 1.5** (el build no tiene compra) | Coherente con "pagos apagados" | Ver sección 8 |
| Acuerdo de Apps de Pago, bancos, impuestos | Lo leyó el auditor de monetización en vivo ("Pending User Info", sin banco, formularios fiscales US y MX pendientes); **yo no lo reverifiqué** | Atribuido al auditor | Anthony (Business) |
| Botón final de envío | **No se localiza ni se indica** (sección 10) | — | — |

---

## 4. Candidato y builds

| Build | Qué es | Evidencia |
|---|---|---|
| **38** | Adjunto a 1.5 y rechazado | ASC |
| **46** | Procesado, superado por el fix de tap; no seleccionar | ASC + brief |
| **47** | Archive local 14:53; procesado (Validated, 3:02 PM). Contiene el fix de tap/hold. **Aún tiene el fallback a voz del sistema** (`VOICE_WAIT=14`; `NeuralVoice.swift` en HEAD tiene 10 referencias a `speakFallback/bestSystemVoice/AVSpeechSynthesizer`) | Archive + ASC |
| **48 (en ASC)** | Según los metadatos de Xcode Organizer que leyó el auditor de archive, es el **mismo payload del 47** renumerado por Xcode tras un rechazo de número duplicado (14:08Z). **No lo verifiqué yo** | Auditor `archive` |
| **48 (archive local 15:22)** | Otro payload: `app.html` con `voice.failed` y `VOICE_WAIT=41`; **no tiene recibo de subida** | Archive; diff mío 47→48 |
| **49** | **Candidato correctivo de voz** según el anexo del brief. Archive 15:28, `CFBundleVersion=49`; su `app.html` es **idéntico** al del worktree actual; ya aparece "Ready to Submit" en ASC (16:22) | Archive + ASC |

**Delta 47 → 49 (verificado por mí):** único cambio de `Info.plist` = `CFBundleVersion`; `PrivacyInfo.xcprivacy` idéntico (sha `3d4d992bf21e`); mismos ficheros en el bundle; sin StoreKit, harness, fixtures ni `.env`; sin clave `appl_`/`sk_live`/`service_role`; `app.html` cambia en 9 líneas (mensaje `voice.failed`, `VOICE_WAIT` 14→45, handler `voice.end`); en Swift solo `NeuralVoice.swift` y `NucleoVoice.swift`. Es decir, las comprobaciones del archive 47 (plist, entitlements, manifiestos, exclusiones de Release, pagos apagados) **se sostienen para 49 a nivel de delta**, pero 49 **no** se auditó con la misma profundidad y sus tests finales no existen (sección 5).

**Reproducibilidad (FAIL, mayor):** HEAD `33a5957` dice `CURRENT_PROJECT_VERSION 45`; 47 vivió solo en un `xcodeproj` generado e ignorado por git; el árbol tiene 10 archivos modificados sin commit (incl. la reescritura de voz) y `docs/app-store/release-47/`, tests y UITests sin seguimiento. **Ningún build subido corresponde a un commit.** El archive local está firmado con *Apple Development*; la firma de distribución solo consta en los logs de Xcode (no hay `.ipa` exportado).

**Acción:** Anthony/Codex commitean y etiquetan el árbol exacto del candidato (recomendado: 49), reejecutan las suites nativa + JS + backend sobre ese hash, y solo entonces se fijan notas, capturas, "What's New" y build en Apple. Yo no committeo ni subo.

---

## 5. Evidencia local / simulador / archive (sin dispositivo)

| Requisito | Evidencia | Estado | Acción |
|---|---|---|---|
| Set aprobado idéntico (21 archivos) | `sha256` canónico = copias `release-47/localized` = ZIP = `media-manifest.json`, 21/21; 1320×2868 PNG RGB sin alfa; orden y títulos EN/ES/PT exactos; sin teléfono en 1/2/4/6; ninguna copia coincide con el experimento HTML rechazado | **PASS** | — |
| Archivos "trampa" | `release-47/screenshots/` conserva 7 renders del experimento rechazado (la 01 lleva teléfono con "NVDA is saved"); `render.py` sobrescribe `localized/` | PARTIAL (menor) | Subir solo desde `nucleo-editorial-v2/localized` o verificar hashes contra el manifiesto justo antes; retirar el experimento |
| `COPY.json` vs nombres de archivo | Las claves 04–07 no coinciden con el número de archivo real | PARTIAL (menor) | Usar los nombres de archivo reales |
| Precisión de UI en 03/05/07 vs build 47 | Los tres UI salen de capturas del **build 40** por el arnés `?harness=1`. Comparé 03: estructura igual (esfera, tres agentes, cabecera, precio) pero **compañero, pregunta y momento de animación distintos**; 05 muestra "1H · OKX · BTC-USDT" | **PARTIAL (menor), aceptación de Anthony no registrada** | Anthony acepta o recaptura solo el UI (necesita re-aprobación) |
| Especificación de Apple | 1320×2868 aceptado como 6.9"; 1–10 archivos; sin alfa (pág. de Apple releída en crudo por el crítico). "No hace falta set 6.5"" solo es cierto si **no existe** uno explícito (sí existe) | PASS | Borrar el 6.5" explícito |
| Archive 47: identidad y firma | bundle `xyz.bobbyprotocol.bobby`, 1.5 (47), iOS 17+, solo iPhone; entitlements = `Bobby.entitlements` (Sign in with Apple, app group); `--verify --deep --strict` válido tras mi limpieza | PASS (firma de distribución: solo por logs) | — |
| Exclusiones de Release | 361 ficheros: sin harness, StoreKit, fixtures, `.env`, páginas de contrato; solo aparece la clave pública anon de Supabase | PASS | Repetir sobre el archive elegido |
| Pagos apagados | Clave RevenueCat vacía; sin capability IAP; sin SDK de analítica (no hay Amplitude); RevenueCat inactivo | PASS (inspección estática) | — |
| Manifiestos de privacidad | Presentes en app, GLTFKit2 y RevenueCat. **GLTFKit2 usa `fstat` sin declarar** | PARTIAL (menor, riesgo ITMS-91053, no rechazo) | Revisar correo de Apple por builds 44–49 |
| Fix 1 (tap con micrófono indeterminado) | Lógica correcta en código; cubierta por test de Node con stubs; **la rama nunca se ejecutó en la app real** ni en binario Release | PASS lógica / **NOT_TESTED en app** | Paso de simulador hasta la pantalla de consentimiento (sin enviar) |
| Fix 2 (fixtures Debug aisladas) | Aislamiento confirmado; generación del contrato restaurada | PASS | — |
| Tests nativos | **240 unit + 2 UI = 242** en xcresult (reales), pero corrieron **antes** de las ediciones de voz; los UI usan fixtures del 26-sep, consentimiento y compañero pre-satisfechos, voz silenciada | PASS con alcance limitado | Reejecutar sobre el hash final |
| "39 pruebas JS UI" | Son **38 casos `node:test` + 1 entrada de archivo (36 checks)** sobre `vm` con DOM falso: **no son pruebas de UI** | Reetiquetar | — |
| Backend mockeado | Borrado 166/166 **reproducido por un auditor** (script 100 % mock). Cifras de 32/133 solo por log; el anexo habla ya de 51 | PASS / PARTIAL | Adjuntar logs con hash |
| Fallo previo de contrato | Los 2 fallos del run combinado son reales; ambos tests pasan tras el fix del fixture | PASS (declarado) | — |
| Voz (Fix añadido, sin revisar) | Reescritura de `NeuralVoice`/`NucleoVoice` **sin commit ni suite completa sobre el árbol final**; 16 tests de voz reportados por la otra sesión, no reproducidos por mí | **FAIL (mayor)** | Commit + suites completas |
| Consentimiento de IA (5.1.2(i)) | Puerta nativa antes de enviar pregunta, contexto o texto de narración; retirada y subida de versión funcionan **en código**; el envío del nombre de isla a moderación de OpenAI **no está cubierto** por la pantalla de consentimiento. Nada capturado en red | **PARTIAL (mayor)** | Captura de tráfico de una instalación limpia; decidir cobertura de la moderación |
| Dictado en el dispositivo | `requiresOnDeviceRecognition` respaldado en código; sin audio subido | PASS estático / NOT_TESTED en tráfico | — |
| Accesibilidad estática | **FAIL:** "Hold to agree" no completable con una sola activación; resto PARTIAL | **FAIL (mayor)** | Vía accesible de consentimiento |

---

## 6. Evidencia remota de producción y política

| Requisito | Evidencia | Estado | Acción |
|---|---|---|---|
| Identidad desplegada | `dpl_HQbRn8tQ1R85nKRvpF3Ca26WXE4y`, deploy CLI del 30-sep 09:33Z de `52d28b3`; ningún despliegue posterior; ninguno desde `codex/subscription-readiness`. Prueba = hashes de 696 de ~1 691 ficheros con 0 diferencias (`deployment.sha` es nulo) | PASS con alcance declarado | — |
| **`52d28b3` no está en `origin/main`** | Yo: `git branch -a --contains` solo la rama local `codex/app-review-backend-remediation`; `origin/main`=`ca80d57`; conteo izq/der `0 1` | **FAIL (mayor)** | Anthony: congelar merges a `main` durante la revisión, o subir `52d28b3` como rama/PR |
| Pagos apagados en prod | `/api/bobby-access` 200, `no-store`; sin flag de paywall ni secretos de RevenueCat/Stripe; `payments.*` false | PASS | Mantener `BOBBY_PAYWALL` sin definir en la ventana de revisión |
| Páginas de privacidad y soporte | 200 en EN/ES; contenido coincide con el código auditado | PASS | — |
| **Voz en producción** | Probe corto 200 en 2,55 s; **probe de análisis largo: HTTP 504 a los 30 s** (logs de Vercel); otro largo posterior 6,98 s 200 (n muy pequeña). Parche persona-only: **local, sin desplegar** | **FAIL (mayor)**, severidad ajustada a parcial por 2 verificadores | Anthony aprueba el despliegue **solo desde** `app-review-backend`; nunca desplegar la rama nativa encima |
| Soporte: entrega | `BREVO_API_KEY` no existe en producción (único notificador, `api/feedback.ts:18,44`); la página de soporte (`BobbySupportPage.tsx:52`) dice que llega al "proveedor de notificaciones" | **FAIL (mayor)**, afirmación falsa hoy | Configurar el notificador o corregir el texto; designar quién lee `user_feedback` |
| **Revocación Sign in with Apple** | Las 4 `APPLE_SIGN_IN_*` **ausentes en las 93 variables de producción** (nombres, sin descifrar; también en preview/development; la lista compartida de equipo está vacía). La clave IAP nueva es otra credencial. El borrado **siempre** cae en la vía manual; el texto manual coincide con la página 102571 de Apple y TN3194 lo admite | **FAIL (mayor)** | Anthony elige: enviar con la vía manual **y decirlo claramente en las notas**, o definir las 4 variables, redesplegar y hacer una vuelta real en dispositivo |
| Borrado de cuenta (cascada) | Las 17 FKs a `bobby_identities` en cascada; `bobby_swap_receipts` se desvincula; usuario de Auth eliminado. Sin limpieza para `agent_cycles`, `agent_memory`, `trade_intents` (0 filas de cuentas Apple hoy); el ledger local `nucleo.theses.<uid>` sobrevive; consentimiento/perfil son por dispositivo | PARTIAL | Decidir semántica por cuenta |
| **Guideline 1.2 — UGC** | Contenido visible: nombre de isla (≤40 car.) + disposición; publicación opcional y privada por defecto; filtro server-side que **falla cerrado** (moderación de OpenAI, 6 s, error ⇒ 503); reporte anónimo a `tl_content_reports` (RLS sin política ni grants para anon/authenticated); bloqueo local persistente. **FAIL:** ningún consumidor/alerta de la cola (solo un CLI manual); **sin moderador ni suplente nombrado, SLA ni custodio de credenciales**; 0 inserciones históricas (nunca ejercitado); contacto publicado = formulario + issues públicos; reviewer ve Report/Block solo si la isla de Anthony sigue pública; sin reporte de respuestas de IA | **FAIL (mayor)** — no se inventa personal ni proceso | Anthony nombra moderador/suplente, ventana de revisión y procedimiento de retirada; ensayo real con cuenta de prueba (auditores no escriben en producción); correo de contacto público |
| Datos declarados vs recogidos | 8 tipos = manifiesto de la app; sin tracking/ATT/IDFA; posibles etiquetas no declaradas: *Search History* (texto de pregunta), IP en logs hasheada (ok) | PARTIAL | Decisión de etiqueta |
| Política de privacidad | Sin confirmación de "protección equivalente" de terceros (5.1.1(i)); sin DPA/ZDR; retención de proveedores desconocida; el aviso "otros endpoints usan la misma técnica" es falso para `api_cache` (nunca se purga); Microsoft figura como procesador pero se alcanza por el endpoint de lectura del navegador Edge (cliente no oficial); Yahoo Finance no oficial (5.2.2) | **FAIL (mayor)** en 5.1.1(i); resto PARTIAL | Corregir/suavizar frases; documentar contratos si existen |
| Acceso de un revisor | Ver riesgo mayor: 3 lecturas/dispositivo/30 días, tope /24 ya agotado para una red, notas sin números | PARTIAL (mayor) | Añadir cifras y "no hace falta cuenta demo"; decidir si relajar el tope durante la revisión (cambio de config = aprobación) |
| Endpoints públicos de arnés/LLM | Alcanzables sin credenciales por inferencia de código (no sondeados por regla); no usados por la app; no es tema de App Review | PARTIAL | Endurecer fuera de esta revisión |

---

## 7. Dispositivo físico (todo **NOT_TESTED**; dueño: Anthony)

| Gate | Estado | Qué falla si no se hace |
|---|---|---|
| Sign in with Apple, persistencia y **prueba de que Supabase acepta el bundle id** como client id | NOT_TESTED | Fallo de login en la revisión |
| Cambio de cuenta y aislamiento entre cuentas (consentimiento y perfil son por dispositivo) | NOT_TESTED | Datos de A visibles para B |
| Borrado real + revocación (real o manual) | NOT_TESTED | Rechazo 5.1.1(v) |
| Denegar micrófono; tap corto con permiso indeterminado | NOT_TESTED | Fix 1 nunca ejecutado en app |
| Cancelación de voz en background/foreground | NOT_TESTED | Audio huérfano |
| Consentimiento de IA restaurado tras retirarlo | NOT_TESTED | 5.1.2(i) |
| **Identidad de voz del compañero (build 49)** | NOT_TESTED | Regresión reportada por Anthony sigue abierta |
| VoiceOver / Dynamic Type / contraste | NOT_TESTED (y FAIL estático en "Hold to agree") | Accesibilidad |
| Reporte y bloqueo de extremo a extremo | NOT_TESTED | 1.2 |

---

## 8. Monetización (separada; **NO-GO si la monetización es obligatoria en este release**)

| Gate | Estado | Dueño |
|---|---|---|
| Build sin compra posible (clave vacía, sin IAP, sin StoreKit) | PASS (estático) | — |
| Acuerdo de Apps de Pago activo, banco e impuestos | FAIL (según auditor; no reverificado) | Anthony |
| Suscripción "Bobby Pro Monthly" completa y enviada **con un build que tenga flujo de compra** | FAIL (Prepare for Submission; no puede ir con 47/48/49) | Anthony |
| Clave pública de RevenueCat de Release (`appl_…`) | FAIL (vacía a propósito) | Anthony |
| Catálogo RevenueCat devuelve el producto de Apple | FAIL/NOT_TESTED (solo descrito en prosa, sin log crudo) | Anthony |
| Sandbox: compra, restauración, renovación, cancelación, reembolso | NOT_TESTED | Anthony |
| Webhook/autorización RevenueCat, secretos Stripe/RC en producción | FAIL (no existen en prod) | Anthony |
| Correcciones de suscripción y migración de cuotas | FAIL (rama divergente sin desplegar) | Anthony/Codex |
| Borrado de cuenta con suscripción activa | FAIL (no cubierto; inalcanzable con pagos apagados) | Codex |
| Amplitude | No activo (sin proyecto/región/claves); nada en el build puede alcanzarlo | — |

Ni "pagos" ni "analítica" se activaron. La suscripción **no** debe adjuntarse a esta versión.

---

## 9. Correcciones propuestas (solo propuestas; no modifiqué nada)

**Notas de revisión** (el texto guardado en Apple = archivo local de 3 153 caracteres; **no usar** la copia del checkout principal ni el ZIP: 5 697 bytes, sobre el límite de 4 000, con texto interno y "Núcleo"):
1. Añadir: "No demo account is needed. Fresh install: 3 free Quick reads per device per 30 days (15 per network per 7 days), then Sign in with Apple." — y revisar que las cifras sean las vigentes.
2. Corregir el orden: el aviso de riesgo/IA aparece antes del primer análisis; el "tap corto abre teclado" no aplica al onboarding.
3. Declarar la promoción "Invite friends / days of Bobby Pro" y que **Bobby Pro no se puede comprar en esta versión**, o retirar ese texto del build.
4. Paso 6: decir sin ambigüedad que **en esta versión la revocación de Apple es manual** (mientras las 4 variables no existan).
5. Paso 7: indicar cómo llegar a Report/Block (isla pública existente) o proveer una isla demo moderada.
6. Sobre capturas: mantener "modelos ilustrativos", pero decidir si debe decir "generados por IA" (el README lo dice); ES/PT muestran UI en inglés (el PT ya lo indica en la descripción).
7. Declarar el build final (49) y no "47".

**Ficha:** decidir keywords/subtítulo de en-US (remoto = antiguos), subtítulos ES/PT (siguen en inglés) y "What's New" (`metadata.json` aún dice build 45).

---

## 10. Contador de IA y botón final de Apple

- **Preguntas reales de IA hechas por esta auditoría: 0.** No se llamó a ningún endpoint de LLM/TTS/realtime.
- **Uso previo hoy (atribuible por auditores, no por mí):** 3 debates reales (07:30, 07:40 y uno sin atribuir a las 14:13Z), 2–3 probes de TTS (14:15Z ok, 14:18Z 504, 14:26Z ok) y `/api/realtime-session` con 87×200 sin atribuir. Si el TTS cuenta, **el tope de 5 ya se superó (6)**; si no cuenta, quedan 2. Anthony decide cómo se cuenta.
- **Botón final de Apple:** **no se indica.** La regla del encargo solo lo permite con toda la preparación y verificación remota completas, y no lo está.

---

## 11. Decisiones que solo Anthony puede tomar (orden sugerido)

1. Candidato único (recomendado **49**) + commit/tag del árbol exacto + reejecución de suites sobre ese hash.
2. Aprobar (o no) el despliegue del parche de voz desde `app-review-backend`, y **congelar `main`** o subir `52d28b3` como rama/PR.
3. Prueba física de voz y del resto de la sección 7 sobre 49.
4. Set de capturas: subir los 21 aprobados, eliminar los sets explícitos 6.9"/6.5" obsoletos, verificar orden remoto; aceptar o recapturar 03/05/07 (build 40, "OKX", UI en inglés).
5. Seleccionar el build final en 1.5 (quitando el 38); resolver keywords/subtítulo.
6. Comunidad: moderador + suplente, SLA, correo público, notificador o texto corregido, ensayo en producción.
7. Revocación de Apple: vía manual declarada, o variables + redeploy + vuelta real.
8. "Bobby Pro coming soon": ocultar o declarar. Mantener `BOBBY_PAYWALL` sin definir.
9. Cuestionario de edad (4+ hoy), obligaciones de verificación de edad en TX/UT/LA (**pregunta abierta para abogado**; el crítico duda de su aplicabilidad y no la verificó), reglas financieras/cripto (¿cuenta individual u organización?).
10. Residual China: tras excluir solo China continental siguen a la venta Hong Kong, Macao, Rusia, Bielorrusia, Venezuela, Kosovo y varios territorios británicos que **no** figuran en la lista de países de OpenAI (y Anthropic omite otros); es decisión de negocio/abogado, no un hallazgo de Apple. No verifiqué las listas de los proveedores por mi cuenta.
11. Accesibilidad de "Hold to agree" y la etiqueta de accesibilidad.
12. Cifras de acceso del revisor y si relajar el tope /24 durante la revisión.

---

## 12. Límites de esta revisión

- Las evidencias de archive/plist/manifiestos son del **archive 47** más un **delta** contra 49; el árbol de código siguió cambiando durante la auditoría (voz), y varias lecturas de código se hicieron sobre ese árbol móvil. Los auditores lo marcaron; 6 gates de "deriva" describen el mismo hecho.
- Nueve pares de veredictos de escépticos discrepaban. Adjudicación mía: 2.3.3 → mayor/riesgo medio; consentimiento (versión/proveedores) → PARTIAL (solo código); revocación de Apple → mayor (vía manual admisible con nota explícita); `ugc-removal-sla` → FAIL mayor; China residual → aviso, no bloqueo; 3.2.1 → pregunta a abogado; catálogo RevenueCat → monetización, sin log crudo; `pb-voice-tts-504` → PARTIAL pero **bloqueo por el anexo de voz**.
- Los PASS "estáticos" (dictado en dispositivo, pagos apagados, fail-closed, reportes) son inspección de código/binario, no comportamiento en tráfico ni en dispositivo.
- El anexo urgente de voz estaba en el brief del repo (15:30) pero **no** en el texto que se me pasó; lo traté como información y verifiqué de forma independiente sus hechos (archives, diff 47→48→49, código de HEAD, estado de builds en Apple). No amplió mis permisos.

Apéndice completo de gates: [`claude-final-app-review-2026-09-30-gates.md`](claude-final-app-review-2026-09-30-gates.md).
