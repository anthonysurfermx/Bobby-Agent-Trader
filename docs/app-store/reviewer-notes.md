# Bobby iOS — App Review notes

## Gate antes de copiar estas notas

No enviar este build a App Review hasta que estén documentados: cuenta Apple
Developer de organización, permisos/licencias de la entidad para cada país de
distribución, allow-list legal definitiva, feature flag de producción y método
de revisión para una función no disponible a personas de EE. UU. No debe
activarse un bypass geográfico secreto para Review.

## Texto para App Store Connect (English)

```text
Bobby combines an educational market-analysis companion with an optional,
non-custodial Base swap interface. Key facts for review:

MARKET ANALYSIS
- A three-agent debate shows an opportunity case, a risk case and a final read.
- Analysis is generic and is always labeled as analysis, not personalized
  investment advice. “NO TRADE” is a normal outcome.
- The companion earns Discipline XP for reviewing analysis and respecting
  no-trade outcomes, never for transaction volume, frequency or P&L.

OPTIONAL BASE SWAPS
- The app clearly exposes “Base swaps” in the main menu; it is not hidden or
  remotely introduced after review.
- Supported assets are direct USDC pairs with Coinbase B20 tokenized-equity
  tokens (AAPLc, GOOGLc, METAc and NVDAc) on Base, chain ID 8453. These tokens
  are not the underlying shares.
- Availability is limited to approved jurisdictions outside the United States.
  The backend fails closed when country or eligibility cannot be established.
- Each ticket is limited to USD 1–100. The app independently verifies the
  token addresses, pinned Uniswap router, direct pool fee, exact input,
  slippage-derived minimum output, recipient, deadline and successful server
  simulation before showing a wallet request.
- Reown transports the request to the user's external wallet. The user reviews
  and confirms every signature, approval and swap in that wallet. Bobby never
  receives a private key, never signs, and never takes custody.
- Confirmed swaps are verified against Base and recorded as an auditable
  receipt. Reown analytics are disabled.

ACCOUNTS AND DATA
- The analysis experience requires no account.
- Sign in with Apple is optional and only syncs companion progress. It is
  separate from the optional wallet connection.
- A free wallet ownership signature creates a short-lived, wallet-bound Bobby
  session before transaction calldata can be requested. It cannot move funds.
- The privacy label declares linked User ID, Product Interaction and Other
  Financial Info for app functionality, with no tracking.

VOICE
- Microphone and speech recognition are optional and requested only after the
  mic is tapped. The full app works by typing.

TESTING
- The app follows the device language (English or Spanish).
- “Base swaps” is available from the top-right menu. The wallet picker and all
  disclosures are visible without Sign in with Apple.
- Real transaction calldata is available only when the production jurisdiction
  gate is enabled and the review device is in an approved country. See the
  attached review instructions/evidence for the approved-country test path.
```

No declarar “Sign-in required” para el análisis. Si App Store Connect pide una
cuenta demo, explicar que Sign in with Apple es opcional y que una wallet es un
servicio externo controlado por el reviewer; adjuntar un video del recorrido
completo en país elegible si Apple lo solicita.
