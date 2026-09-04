# Bobby iOS — App Privacy (App Store Connect)

Estado verificado contra el código del build 14, 2026-09-04. Estas respuestas
sustituyen la antigua declaración “Data Not Collected”: la app ya ofrece cuenta
opcional, sincronización de progreso y swaps no custodiales.

## Datos que salen del dispositivo

| Dato | Retención | Uso |
|---|---|---|
| Credencial de Sign in with Apple y UUID de Supabase | Sí, por Supabase Auth | Cuenta opcional y sesión |
| Companion elegido, XP, racha y eventos de progreso | Sí, sólo al iniciar sesión | Sincronizar progreso entre app y web |
| Dirección pública de wallet y prueba firmada | Sesión temporal; la dirección se conserva con recibos | Probar control de la wallet y limitar calldata a su dueño |
| Par, importes, ruta, hash de calldata y transacción confirmada | Sí, ligados a la dirección pública | Auditoría y historial de swaps |
| País inferido por el edge | Se procesa para elegibilidad; no se guarda en el recibo | Bloqueo geográfico fail-closed |
| Pregunta de mercado y texto TTS | Sólo durante la petición; Bobby no los retiene | Análisis y audio solicitados |
| Perfil creativo (nombre, voz, vibe y aura) | No sale del dispositivo | Personalización local |

Reown 2.3.2 tiene analytics desactivado en la app. Sus privacy manifests
declaran cero tracking y cero datos recolectados. No hay ads ni SDK de
analytics o crash reporting.

## Respuestas en App Store Connect

**Do you or your third-party partners collect data from this app?** → **Yes**.

Declarar, todos con propósito **App Functionality**, **Linked to the User: Yes**
y **Used for Tracking: No**:

- **Identifiers → User ID**: UUID de cuenta y dirección pública de wallet.
- **Usage Data → Product Interaction**: eventos de progreso/discipline usados
  para XP, racha y sincronización.
- **Financial Info → Other Financial Info**: par, importes y recibos on-chain de
  swaps solicitados por la persona.

No declarar ubicación: el país del edge no se retiene después de resolver la
elegibilidad. No declarar Audio Data: Speech de Apple procesa el dictado y el
backend recibe texto, no la grabación. No declarar Search History mientras las
preguntas no se almacenen.

**Tracking / ATT** → No.
**Privacy Policy URL** → https://bobbyprotocol.xyz/privacy
**User Privacy Choices URL** → https://bobbyprotocol.xyz/privacy. La política
explica acceso/borrado y la app ofrece Account → Delete account and synced
progress, con confirmación destructiva.

## Correspondencia con el binario

`Sources/PrivacyInfo.xcprivacy` declara `UserID`, `ProductInteraction` y
`OtherFinancialInfo`, todos ligados, sólo para funcionalidad y sin tracking.
También declara UserDefaults con motivo `CA92.1` para preferencias y caché de
progreso propias de la app.

Antes de cada submit hay que comprobar que:

1. la política pública describe wallet, Reown, Supabase y recibos on-chain;
2. los privacy manifests de todas las dependencias resueltas no cambiaron;
3. App Store Connect conserva estas tres categorías y no “Data Not Collected”.
