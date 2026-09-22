# Auditoría: cuándo se apagaron las voces de Bobby y quién hizo cada cambio

Fecha de revisión: 22 de septiembre de 2026. Todas las horas de la cronología están en **Lisboa, UTC+1**.

## Conclusión

**El apagado global de la narración de los avatares lo introdujo Codex, no Claude.** La llamada que modificó el archivo quedó registrada el **19 de septiembre de 2026 a las 18:55:18.124**. La salida de la herramienta a las 18:55:19.299 ya muestra el interruptor y las guardas. El cambio se guardó en el commit `03a780357c332c64f21874de2f2de827cdce8219` a las **19:04:58**.

Claude participó en otros dos cambios distintos: previamente quitó el zumbido de la máquina y, después del apagado global, ocultó el paso de estilos porque la narración estaba desactivada. Atribuirle a Claude el interruptor global sería incorrecto.

El fallo de alcance fue agrupar la narración del avatar y la función de conversación bajo un mismo concepto de «voz». Debieron tener controles independientes. La corrección actual mantiene la narración y permite silenciarla por decisión de cada persona.

## Cronología comprobable

| Hora en Lisboa | Cambio | Atribución y evidencia |
|---|---|---|
| 18 sep., 18:20:27 | Se retiran el zumbido continuo y los efectos de carga al sustituir la forja anterior por el escáner de rayos X. | Commit `cfd2f53f8a9568c4d317f2807be517b89b5a823d`, con `Co-Authored-By: Claude Opus 5`. Es un antecedente de la rama nativa posteriormente integrada. |
| 18 sep., 18:32:05 | El primer paso deja de hablar; la voz queda para estilos. El golpe final de aura pasa a sesión `.ambient`, que respeta el modo silencio. | Commit `50b5441611fc0b716bc374a40d9b6b1a7d921c90`, también con coautoría de Claude. Su descripción atribuye el primer paso silencioso a la sesión de pulido con el usuario; esto no equivale a apagar todos los avatares. |
| **19 sep., 18:55:18** | **Codex introduce `static let enabled = false`, bloquea `speak` y `speakClip`, e impide mostrar el control del altavoz.** | Invocación real de herramienta en la sesión de Codex `01a0b92b-e84e-7de1-9b87-60ce4f05ee15`. La salida confirma la edición. |
| **19 sep., 19:04:58** | **Se guarda el apagado global en Git.** | Commit `03a7803`, rama `codex/ios-audit-remediation`, mensaje `fix: address iOS release audit and connect native market debate`. `git blame` del código previo a la restauración atribuye a este commit la línea que apaga la voz. |
| 19 sep., 21:38:47 | Se omite la elección de Chill / Directo / Pro cuando `NeuralVoice.enabled` es falso. El onboarding queda en dos pasos. | Commit `674059dacd2c899bf2f0dc172ed8db781e5b6767`, con `Co-Authored-By: Claude Opus 5`. El diff agrega `showsVibeStep` y salta del primer paso a la forja. No introduce el interruptor global: lo consume. |
| 19 sep., 23:18:21 | Los cambios llegan a `main` con el merge de la versión 1.2 (34). | Commit `ff1b67b900f70dc866da961b4577e0dd29d59e98`, PR #98 desde `claude/build34`. El nombre de la rama de integración no identifica al autor de cada cambio incluido. |
| 22 sep., 09:58:50 | Codex vuelve a habilitar la narración y distingue el interruptor de las llamadas Live/ChatGPT. | Commit `540f8bddf83f0252cd08fde1f0958ba871479488`. |
| 22 sep., 10:30:32 | Codex restaura la máquina, completa los 108 clips bilingües y deja estilos después de la forja, en 3/3. | Commit `9028620076c9ebaeb63480edb578ea015075c6ab`. |

## Qué se cambió exactamente

En `NeuralVoice.swift`, antes del apagado, no existía un interruptor global de esta forma. Codex agregó:

```swift
static let enabled = false // Text-only App Store release.
```

También agregó esta salida temprana tanto a las respuestas sintetizadas como a los clips incluidos en la aplicación:

```swift
guard Self.enabled else { return }
```

Por eso conservar los archivos MP3 o tener el backend de audio funcionando no bastaba: el cliente salía de ambas funciones antes de reproducirlos. El mismo cambio inicializó `speakEnabled` con el interruptor y escondió el botón del altavoz.

El commit posterior de Claude agregó:

```swift
private var showsVibeStep: Bool {
    Self.showsVibeStep(voiceEnabled: NeuralVoice.enabled)
}
```

Esa dependencia explica la pantalla **02 / 02** que apareció en la captura del usuario.

## Contexto de la instrucción y precisión de la atribución

En la sesión original consta el mensaje del usuario del 19 de septiembre a las 11:22:12: «en la nueva versión quitamos por ahora voice». Más tarde, Codex preguntó por la versión sin voz para preparar las capturas. El cambio técnico acabó aplicándose a toda la narración. La aclaración posterior del usuario distingue la conversación Live/ChatGPT de las voces de los avatares, que debían mantenerse.

La firma normal de Git es la cuenta humana configurada en el equipo y, por sí sola, **no permite distinguir Claude de Codex**. Para el apagado global hay evidencia adicional directa: el registro de la herramienta de Codex que escribió el archivo. Para los cambios de Claude, esta auditoría usa los diffs y la coautoría declarada en los commits; no atribuye a Claude instrucciones que no se hayan verificado.

La hora 18:55:18 es la de la invocación registrada; no se afirma conocer el nanosegundo de escritura del archivo. El instante de subida a TestFlight, aprobación de Apple o instalación en el iPhone tampoco se deduce del commit ni de este registro.

## Fuentes reproducibles

- Sesión local de Codex: `rollout-2026-09-19T11-17-37-01a0b92b-e84e-7de1-9b87-60ce4f05ee15.jsonl`, líneas 49 y 224 para el contexto del usuario; 1174 para la mutación; 1176 para su salida; 1338 para el commit. El metadato de sesión identifica `Codex Desktop` y proveedor `openai`.
- `git show 03a7803 -- ios/Bobby/Sources/NeuralVoice.swift ios/Bobby/Sources/ContentView.swift`
- `git blame 6f117bf -L 7,15 -- ios/Bobby/Sources/NeuralVoice.swift`
- `git show 674059d -- ios/Bobby/Sources/CompanionOnboarding.swift`
- `git show --format=fuller cfd2f53` y `git show --format=fuller 50b5441`
- `git show -s --format=fuller ff1b67b`

No se han incluido credenciales, registros de conversaciones ajenas a este cambio ni razonamientos internos de agentes.
