# Bobby iOS — Screenshot storyboard (App Store 6.9")

> **Obsoleto para el build 14:** este set documenta la versión de análisis
> read-only y no muestra “Base swaps”. Regenerar el storyboard y las capturas
> después del GO legal; no subir las imágenes actuales con el binario nuevo.

Capturas reales en `store-shots/` — **1320×2868 px** (iPhone 17 Pro Max,
exactamente lo que pide App Store Connect para 6.9"; ASC deriva los demás
tamaños solo). Idioma: inglés (decisión de tienda). Producidas por el rig
de UI tests, no a mano. Flujo v2: onboarding companion-first (el wizard
azul del orbe murió el 2026-08-24).

## Los 5 para subir (en este orden)

App Store muestra ~3 en el search result — las primeras venden:

| # | Archivo | Momento | Por qué vende |
|---|---|---|---|
| 1 | `05-desk-companion.png` | **Hero**: BYTE vivo en el Live Desk | El producto en un frame |
| 2 | `09-verdict.png` | **NO TRADE** halo: "No setup yet. Capital protected." + XP + chart BTC vivo | El diferenciador — honestidad como feature |
| 3 | `10-evolution.png` | **EVOLVED**: GIGABYTE · LEVEL 4 · RISK GUARDIAN | El vínculo que crece con disciplina |
| 4 | `01-choose-companion.png` | Onboarding: "MEET YOUR SQUAD", BYTE en escena + roster | Entras al mundo desde el segundo uno |
| 5 | `06-squad.png` | SQUAD gallery: roster 3D, emotes, "DISCIPLINE, NOT SPEND" | Colección/identidad Gen Z |

Alternativas: `02-companion-kora.png` (KORA en escena), `03-vibe.png`
("How should BYTE talk to you?"), `04-pact.png` (el pacto de honestidad).

## Cómo regenerarlas (el rig)

Target `BobbyUITests` (`UITests/StoreShots.swift`) + simulador iPhone 17
Pro Max en inglés (`simctl spawn <udid> defaults write -g AppleLanguages
-array en`):

1. `xcrun simctl uninstall <udid> xyz.bobbyprotocol.bobby` (estado limpio)
2. `xcodebuild test -project Bobby.xcodeproj -scheme Bobby -destination
   'platform=iOS Simulator,id=<udid>' -resultBundlePath shots1.xcresult
   -only-testing:BobbyUITests/StoreShots/test01_OnboardingAndCompanion`
   → onboarding (choose/vibe/pact) + desk + SQUAD
3. Sembrar XP al borde de nivel (evolución en vivo en el shot):
   `/usr/libexec/PlistBuddy -c "Set :companion.disciplineXP 395"
   "$(xcrun simctl get_app_container <udid> xyz.bobbyprotocol.bobby data)/Library/Preferences/xyz.bobbyprotocol.bobby.plist"`
4. `xcodebuild test-without-building … -only-testing:…/test02_VerdictAndEvolution`
5. Extraer: `xcrun xcresulttool export attachments --path shots1.xcresult
   --output-path out/` (los nombres vienen en `manifest.json`)

Notas:
- El launch arg `-store-shots` oculta la línea de métricas de performance
  de la galería (LOAD/ΔMEM) — solo sale en capturas y QA.
- El test pregunta "bitcoin" real contra producción: el chart, el precio y
  el veredicto de las capturas son datos vivos, no mocks.
- Para español: cambiar AppleLanguages a `es` y re-correr (mismo rig).
