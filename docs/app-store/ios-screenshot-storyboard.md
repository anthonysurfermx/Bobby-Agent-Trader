# Bobby iOS — Screenshot storyboard (App Store 6.9")

Capturas reales en `store-shots/` — **1320×2868 px** (iPhone 17 Pro Max,
exactamente lo que pide App Store Connect para 6.9"; ASC deriva los demás
tamaños solo). Idioma: inglés (decisión de tienda). Producidas por el rig
de UI tests, no a mano.

## Los 5 para subir (en este orden)

App Store muestra ~3 en el search result — las primeras venden:

| # | Archivo | Momento | Por qué vende |
|---|---|---|---|
| 1 | `08-desk-companion.png` | **Hero**: BYTE vivo en el Live Desk, quick access BTC/NVDA/ETH | El producto en un frame: companion + desk real |
| 2 | `09-verdict.png` | **NO TRADE** halo: "No setup yet. Capital protected." + 20 XP + chart BTC en vivo | El diferenciador — honestidad como feature |
| 3 | `10-evolution.png` | **EVOLVED**: GIGABYTE · LEVEL 4 · RISK GUARDIAN, "Earned with discipline, never with volume" | El vínculo que crece con disciplina |
| 4 | `06-squad.png` | **SQUAD** gallery: roster 3D, emotes, "DISCIPLINE, NOT SPEND" | Colección/identidad Gen Z |
| 5 | `01-forge-aura.png` | Onboarding: "Describe its aura" + FORGE | El primer minuto se siente videojuego |

Alternativas si alguna no convence: `02-voice-personas.png` (voces CORAL/
BALLAD/SAGE/ASH), `07-companion-detail.png` (BYTE en detalle con XP bar).

## Cómo regenerarlas (el rig)

Target `BobbyUITests` (`UITests/StoreShots.swift`) + simulador iPhone 17
Pro Max en inglés (`simctl spawn <udid> defaults write -g AppleLanguages
-array en`):

1. `xcrun simctl uninstall <udid> xyz.bobbyprotocol.bobby` (estado limpio)
2. `xcodebuild test -project Bobby.xcodeproj -scheme Bobby -destination
   'platform=iOS Simulator,id=<udid>' -resultBundlePath shots1.xcresult
   -only-testing:BobbyUITests/StoreShots/test01_OnboardingAndCompanion`
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
