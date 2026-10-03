# Android equipment 3D stage

The 18 GLB files come unchanged from Bobby iOS release54 `ios/Bobby/Resources/Mascots/`, commit `7385ec9c`. `assets/equipment-stage/provenance.json` records SHA-256 for every model and decoder.

`MascotScene.ts` and `mascot.ts` originate from that release's Bobby web renderer. The copied renderer retains the approved per-character accessory body anchors, original textures, models, palette and geometry. Android adaptations redirect paths to bundled assets, expose readiness and pause controls, preserve the locked silver appearance, and use the approved portrait instead of a procedural substitute on GLB failure. It uses the project's installed Three.js 0.182.0 and bundled Draco WASM decoder; the Three.js license ships with the assets.

Build: `node android/nucleo/equipment-stage/build.mjs`. The generated viewer has no native bridge, authentication, microphone, metering, storage or remote request capability. Its AssetLoader accepts only local stage/model/decoder and equipment-image paths. No viewer assets are fetched from a CDN.

Compose entry point: `xyz.bobbyprotocol.android.equipment.EquipmentStage(companionId, label, attachments, locked, reducedMotion, active, modifier, onReady)`. Pass only items returned by the genuine owned/equipped ledger. Keep the approved native portrait behind the stage until `onReady(true)` and use it after `onReady(false)`. Equipment remains cosmetic and local; this viewer grants no items or XP.

This uses the approved Bobby models and existing web attachment geometry. Native SceneKit lighting and GPU performance are separate device checks; a compiled viewer does not prove its pixels or frame rate on a physical Android device.

The Android build transforms only the installed Three 0.182.0 `build/three.core.js` UUID random-word block to `crypto.getRandomValues(new Uint32Array(4))`. The existing lowercase UUID formatter, version and variant bit masks are preserved. The generator fails if that reviewed module or block changes. Other rendering randomness remains unchanged; these identifiers belong to Three objects and caches and do not authenticate users or native requests. The installed dependency is never modified.
