# Bobby iOS — App Store readiness checklist (2026-08-24)

## ✅ Hecho (verificado en simulador)

- **App icon** 1024 (Bobby Orb, `Assets.xcassets/AppIcon.appiconset`) + display
  name **"Bobby"** + `ITSAppUsesNonExemptEncryption: NO` (export compliance).
- **Bilingüe por idioma del dispositivo** (`L.t`): UI, saludos, veredictos,
  onboarding, accesibilidad. Verificado EN y ES en pantalla.
- **Companion habla y SE MUEVE** (puppet-talk: nod + pulso por nivel de audio,
  procedural cuando el player no da métricas). Verificado en vivo.
- **Evolución en vivo**: byte→KILOBYTE (orgánico) →MEGABYTE (verificado hoy):
  nombre, badge de nivel, tono del saludo y overlay. XP solo por disciplina,
  tope diario, racha con día de gracia.
- Privacy strings de micrófono y speech ya en Info.plist (project.yml).
- Métricas de carga/memoria de mascotas instrumentadas (sesión paralela).

## 🔴 BLOQUEANTE #1 — la voz (antes de cualquier build de tienda)

**Merge del PR #41** (github.com/anthonysurfermx/Bobby-Agent-Trader/pull/41).
Producción hoy devuelve **Ogg/Opus** que `AVAudioPlayer` NO reproduce → la app
cae al fallback robótico de AVSpeech. El PR trae: **MP3** (reproducible), las
**personas por companion** (coral/ballad/sage/ash — hoy el backend ignora el
campo), instructions cálidas es/en y el breaker de gasto. Sin ese merge, las
voces "buenas" no existen en el teléfono. Tras merge: probar 30s en la app
(un análisis ES y uno EN) — debe sonar suave, no robótico.

## Pasos de publicación (requieren tu Apple ID — no automatizables desde CLI)

1. **Cuenta**: Xcode → Settings → Accounts → añadir el Apple ID del team
   `QZRTV6CMTT` (Apple Developer Program activo, $99/año).
2. **Bundle ID**: registrar `xyz.bobbyprotocol.bobby` en
   developer.apple.com → Identifiers (o dejar que Xcode lo haga automatic).
3. **App Store Connect**: crear la app (nombre "Bobby — AI Market Companion"
   o similar; el nombre corto "Bobby" puede estar tomado), idioma primario
   English (US), añadir localización Spanish (MX).
4. **Archive**: abrir `ios/Bobby/Bobby.xcodeproj`, destino "Any iOS Device",
   Product → Archive → Distribute → App Store Connect. (Signing: Automatic
   con el team QZRTV6CMTT ya configurado en project.yml.)
5. **TestFlight primero**: subir build, probarla en TU iPhone real 1-2 días
   (voz real, datos móviles, memoria en dispositivo físico).
6. **App Privacy** (App Store Connect): micrófono = "App Functionality"
   (voz→texto local), sin tracking, sin data collection vinculada a identidad
   (todo el perfil/XP vive on-device en UserDefaults). Data Not Collected si
   se confirma que bobby-voice-free no loguea texto con IP (revisar antes de
   declarar).
7. **Review notes**: explicar que es análisis de mercados **read-only**, sin
   ejecución de operaciones, sin custodia, sin recomendaciones personalizadas
   (guideline 3.1.5 fintech / 2.3 metadata). Incluir el disclaimer que ya
   aparece en onboarding.
8. **Screenshots**: en inglés (decisión), 6.9" (iPhone 17 Pro Max) y 6.5".
   Storyboard en `docs/app-store/ios-screenshot-storyboard.md` + capturas de
   referencia en `docs/app-store/ui-captures/`. Momentos: companion en desk,
   SQUAD gallery, evolución (MEGABYTE overlay), veredicto con chart, NO TRADE.
9. **Edad**: 17+ ó 4+ con "Unrestricted Web Access: No"… contenido financiero
   → marcar categoría Finance; cuestionario de rating honesto.

## ⚠️ Deuda consciente antes del release público (TestFlight OK sin esto)

- Momento firma **NO TRADE / Halo** (escudo + XP + sello) — el diferenciador.
- Sonido corto + partículas al seleccionar companion (háptico ya está).
- Pausar el rAF/spin del SceneKit cuando la app pasa a background (batería).
- `docs/app-store/ui-captures/` regenerar con el saludo nuevo.
- Revisar retención de logs del backend antes de declarar App Privacy.

## Round 4 (Codex + Kimi, 2026-08-24) — estado

Corregidos: F1 fallo-backend≠NO-TRADE (isUnavailable, cero XP, mensaje honesto),
F2 XP fantasma (awardDiscipline devuelve lo otorgado; "DAILY XP COMPLETE" al
tope), F3 etiqueta honesta ("SAVED ON THIS DEVICE" hasta tener ledger real),
F5 aritmética del día de gracia (1=+1, 2=mantener, >2=reset), F7 lifecycle 3D
(dismantleUIView + teardown de display link/acciones), F8 persona en la frase
de selección + delegate del fallback AVSpeech, F9 fallback del desk al orb si
el GLB falla, F10 parcial (Reduce Motion en spin/talk/burst).

Diferidos conscientemente a la fase de servidor-autoridad (arquitectura
avatar-evolution): F4 XP con cycleId idempotente y acción de revisión
explícita, F6 ledger firmado server-side (UserDefaults como caché). También
pendiente: target de tests unitarios para XP/cap/gracia.
