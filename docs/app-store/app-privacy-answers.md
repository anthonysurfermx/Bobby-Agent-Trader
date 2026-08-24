# Bobby iOS — App Privacy (App Store Connect questionnaire)

Estas respuestas están **verificadas contra el código** (2026-08-24). Son
válidas una vez mergeado el PR #42 (hash de IP en rate-limit) — sin ese merge,
la fila de rate-limit en Supabase guarda IP cruda y habría que declarar
"Identifiers".

## Lo que la app realmente hace con datos

| Dato | ¿Sale del dispositivo? | ¿Se almacena? | Dónde |
|---|---|---|---|
| Nombre/voz/vibe/aura del agente | No | Sí (local) | UserDefaults |
| Companion + Discipline XP/racha | No | Sí (local) | UserDefaults |
| Pregunta de mercado ("bitcoin") | Sí → bobbyprotocol.xyz | No (solo se procesa; logs solo de errores) | — |
| Texto a sintetizar (TTS) | Sí → bobbyprotocol.xyz → OpenAI/Edge | No (respuesta de audio; sin retención propia) | — |
| Idioma del dispositivo (es/en) | Sí (parámetro `lang`) | No | — |
| IP | Solo como contador de rate-limit **hasheado con sal** (PR #42) | TTL corto, irreversible | Supabase api_cache |
| Identificadores (device ID, cuenta, email) | **No existen** — la app no tiene cuentas ni SDKs | — | — |

Sin SDKs de analytics, sin ads, sin crash reporting de terceros, sin tracking.

## Respuestas al cuestionario

**Do you or your third-party partners collect data from this app?**
→ **No** ("Data Not Collected").

Justificación bajo la definición de Apple ("collect" = transmitir fuera del
dispositivo Y retener más allá de lo necesario para atender la petición):
- Las preguntas y textos TTS se transmiten pero **no se retienen** (se
  procesan y se descartan; los logs de los endpoints solo registran errores,
  verificado en `bobby-voice-free.ts`, `voice-tool.ts`, `bobby-asset-search.ts`).
- El contador de rate-limit persiste un **hash salado** de la IP, no la IP
  (PR #42) — no es un identificador legible.
- Todo el perfil/XP vive en UserDefaults **en el dispositivo**.

**Tracking (ATT)?** → No. Sin App Tracking Transparency necesaria.

**Privacy Policy URL** (obligatoria aunque no se recolecte):
https://bobbyprotocol.xyz/privacy — ⚠️ hay que publicar esa página antes del
submit (contenido: lo de la tabla de arriba en prosa; pedirla cuando toque).

## Permisos del sistema (Info.plist, ya declarados)

- **Micrófono** — "Bobby te escucha para responder sobre cualquier activo."
  Uso: dictar preguntas. El audio se procesa con Speech de Apple; no se sube.
- **Reconocimiento de voz** — ídem; transcripción en dispositivo/Apple.

Ambos son opcionales (la app funciona 100% tecleando).

## Notas de mantenimiento

- Si algún día se agrega analytics, cuentas, o se loguean preguntas con
  identificador → este documento y la declaración cambian. Revisar antes.
- `RATE_LIMIT_SALT` en Vercel env hace el hash no-reproducible fuera de prod
  (opcional pero recomendado — un env var de un click).
