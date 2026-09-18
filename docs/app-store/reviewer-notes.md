# Bobby iOS — App Review notes

## Gate antes de copiar estas notas

No enviar este build a App Review hasta que estén documentados: cuenta Apple
Developer de organización, permisos/licencias de la entidad para cada país de
distribución, allow-list legal definitiva, feature flag de producción y método
de revisión para una función no disponible a personas de EE. UU. No debe
activarse un bypass geográfico secreto para Review.

## Texto para App Store Connect (English)

Actualizado para el build 27 (1.1): sin swaps ni wallet (retirados en el build
25) y sin micrófono ni Bobby Live (retirados en el build 27).

```text
Bobby is an educational market-analysis companion. Key facts for review:

MARKET ANALYSIS
- The user types an asset; a three-agent debate shows an opportunity case, a
  risk case and a final read over a live chart.
- Analysis is generic and is always labeled as analysis, not personalized
  investment advice. “NO TRADE” is a normal outcome.
- The companion earns Discipline XP for reviewing analysis and respecting
  no-trade outcomes, never for transaction volume, frequency or P&L.
- Bobby never executes trades, never connects to an exchange or wallet and
  never takes custody of funds.

VOICE
- Input is typed only. The app does not use the microphone, speech
  recognition or the camera.
- The companion reads its answer aloud with synthesized speech: the answer
  text is sent to our text-to-speech endpoint and nothing is recorded. The
  speaker button on the desk mutes it.

ACCOUNTS AND DATA
- The analysis experience requires no account.
- Sign in with Apple (or X) is optional and only syncs companion progress.
- Account deletion: top-right menu → Delete account (with confirmation). It is
  also in the menu's account screen.
- The privacy label declares linked User ID and Product Interaction for app
  functionality, with no tracking.

TESTING
- The app follows the device language (English or Spanish).
- Share my skin (top-right menu) exports an image through the system share
  sheet; saving to Photos asks for add-only permission.
```

No declarar “Sign-in required” para el análisis. Si App Store Connect pide una
cuenta demo, explicar que Sign in with Apple es opcional y que una wallet es un
servicio externo controlado por el reviewer; adjuntar un video del recorrido
completo en país elegible si Apple lo solicita.
