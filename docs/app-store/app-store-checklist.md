# Bobby iOS — App Store readiness checklist (2026-09-04)

## Implementado y verificado

- Build 14, iOS, bundle `xyz.bobbyprotocol.bobby`, deep link
  `bobbyprotocol://wallet`, Sign in with Apple y App Group de Reown declarados
  desde `project.yml`.
- Reown AppKit 2.3.2, Web3 0.8.8 y CryptoSwift 1.8.3 fijados a versión exacta;
  Reown analytics desactivado.
- Pantalla visible “Base swaps” con conexión no custodial, attestation de
  jurisdicción, USDC ↔ AAPLc/GOOGLc/METAc/NVDAc, approve exacto, swap, recibo y
  revocación de allowance.
- Guard local independiente: Base 8453, direcciones de tokens y router,
  calldata ABI, fee de pool, recipient, importe, mínimo recalculado desde
  slippage, deadline y simulación.
- `xcodebuild` para simulador: PASS. XCTest nativo: 9/9 PASS. Flujo visual y
  selector Reown revisados en iPhone 16e / iOS 26.1.
- Aviso de riesgo v2 y copy de cuenta distinguen cuenta Apple, wallet externa,
  firma del usuario y ausencia de custodia.
- Borrado de cuenta dentro de la app, con confirmación destructiva: elimina la
  identidad Auth y los datos sincronizados; desliga recibos que deban conservarse.
- Privacy manifest y respuestas de tienda actualizados para `UserID`,
  `ProductInteraction` y `OtherFinancialInfo`, sin tracking.

## NO-GO para TestFlight/App Review

- [ ] La cuenta del Apple Developer Program debe ser de **organización**, no de
  una persona, y el App ID debe habilitar Sign in with Apple + App Group
  `group.xyz.bobbyprotocol.bobby`.
- [ ] Legal debe confirmar por escrito la entidad, permisos/licencias y países
  donde puede ofrecerse cada B20 token. La allow-list actual de México sigue en
  estado draft; no activar producción con esa etiqueta.
- [ ] Definir con Apple un camino revisable para la función restringida fuera
  de EE. UU. sin bypass secreto de geolocalización.
- [ ] Ejecutar el camino destructivo de `DELETE /api/account` en producción
  con una cuenta de prueba desechable. La política publicada y los rechazos
  403/401 del endpoint ya se verificaron en el SHA web `a12daea4`.
- [ ] Actualizar App Store Connect: ya no es “Data Not Collected” ni una app
  read-only. Usar `app-privacy-answers.md`, `reviewer-notes.md` y el listing
  corregido.
- [ ] Regenerar screenshots: el set actual no muestra la función de swaps.
- [ ] Probar en iPhone real: regreso por deep link desde OKX/MetaMask/Trust,
  cambio a Base, rechazo de firma, approve minado, re-quote, swap, recibo,
  revocación y restauración de sesión tras relaunch.
- [ ] Ejecutar un archive firmado y validar privacy report / export compliance.

## Orden de publicación

1. Cerrar los ocho NO-GO anteriores.
2. Activar `BASE_STOCK_SWAPS_ENABLED=true` y la allow-list aprobada sólo para el
   test legal controlado; verificar una operación mínima y su recibo.
3. Subir a TestFlight interno, no a producción pública.
4. Probar 1–2 días en dispositivo físico y revisar logs/recibos.
5. Enviar a App Review con las notas y evidencia exactas.
6. Ampliar países sólo mediante una nueva aprobación legal y cambio explícito
   de allow-list.

## Evidencia que debe conservarse

- Resultado de `xcodebuild test` y SHA del commit enviado.
- Versiones resueltas de Swift Package Manager.
- Capturas EN/ES del aviso, swap, wallet picker, quote y confirmación.
- Matriz país → permiso/licencia → fecha de aprobación.
- Hash de la política de privacidad publicada y respuestas de App Store
  Connect del mismo release.
