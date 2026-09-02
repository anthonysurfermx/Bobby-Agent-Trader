# Voz para Bobby: qué se parece a ElevenLabs sin pagar ElevenLabs (2026-09-02)

Pregunta: la voz actual (OpenAI `gpt-4o-mini-tts`) no convence; ElevenLabs
es caro para B2C. ¿Qué es lo más parecido, gratis o casi?

Investigación verificada contra páginas oficiales el 2026-09-02 (precios y
licencias cambian; re-verificar antes de contratar).

## Respuesta corta

- **"Gratis y nivel ElevenLabs en español" no existe hoy.** Los modelos
  abiertos que superan a ElevenLabs en el arena (Breeze TTS 2, Fish S2 Pro)
  son no comerciales, y Breeze no habla español.
- **Mejor "casi gratis" con español latino y licencia MIT:**
  Chatterbox Multilingual V3 + paquete `es-mx-latam` (Resemble). Clonación de
  voz con 10 s de referencia (una voz por companion), perilla de
  expresividad. Hospedado en DeepInfra cuesta **$1 por millón de caracteres**
  (ElevenLabs: $50–100 por millón). Calidad: por debajo de ElevenLabs v3
  (Elo 1019 vs 1178), sin streaming nativo en la versión multilingüe.
- **Mejor calidad por dólar (gestionado):** Inworld TTS-2 ($15–25/M en
  on-demand, baja a $5–7/M con volumen). Elo 1250, arriba de Eleven v3.
  Español es-MX vía diseño/clonación de voz, tags de estilo `[laugh]`,
  latencia < 100 ms. Es el candidato para reemplazar OpenAI.
- **Lo que pagamos hoy:** OpenAI gpt-4o-mini-tts ≈ $15/M. No es caro; el
  problema es expresividad, no precio.

## Tabla resumen (precio por millón de caracteres)

| Opción | Precio | Español LatAm | Emoción | Licencia / notas |
|---|---|---|---|---|
| ElevenLabs v3 / Multilingual v2 | $100 | sí | tags v3 | referencia (Elo 1178 / 1099) |
| ElevenLabs Flash / Turbo | $50 | sí | menos | Elo 1079 |
| **Inworld TTS-2 / Flash** | $25 / $15 → $5–7 con volumen | es-MX por diseño/clon | tags + estilo | Elo 1250, gestionado |
| Cartesia Sonic 3.6 | ~$37–50 | `es` (dice MX + ES) | tags | Elo 1282 (#1), caro |
| Gemini 2.5 Flash TTS | ~$15 (tier gratis) | `es` genérico | prompt de estilo | sin streaming en 2.5 |
| Fish Audio s2.1-pro | $15/M bytes; `s2.1-pro-free` = $0 | tier 2 | tags libres | gratis "fair use", datos entrenan, fecha vencida: verificar |
| Deepgram Aura-2 | $30 | es-MX ×6, es-419 | sin tags | voces reales MX |
| Azure HD Omni | $22 (500K/mes gratis) | es-MX | estilos solo en inglés | |
| OpenAI gpt-4o-mini-tts (hoy) | ~$15 | `es` sin selector | instrucciones | tope 2,000 tokens |
| **Chatterbox Multilingual + es-mx-latam** | **$1 en DeepInfra** / self-host $5–8 | finetune LatAm | perilla `exaggeration` | **MIT**, Elo 1019, sin streaming nativo |
| Qwen3-TTS 1.7B | $20 DeepInfra / self-host $7–25 | sí (diseño de voz filtra acento inglés) | instrucciones | Apache-2.0, streaming 97 ms |
| Kokoro-82M | $0.62 | 3 voces sin grado, "delgadas" | no | Apache-2.0, sin clonación |
| Fish S2 Pro (abierto) | — | sí | tags | no comercial |
| Breeze TTS 2 | — | **no** | sí | no comercial, #1 abierto |

## Recomendación operativa

1. **Prueba A/B de 1 día**: mismas 6 frases de Bobby (hype de apertura,
   NO TRADE, veredicto) en Inworld TTS-2 y Chatterbox es-mx-latam (DeepInfra),
   contra la voz actual. Anthony elige a oído.
2. **Abstraer el proveedor** en `api/_lib/tts.ts` (`TTS_PROVIDER=openai|inworld|chatterbox`),
   con caché por texto+voz (ya existe la idea en `bobby-voice-free`).
3. Si gana Inworld: cuenta + `INWORLD_API_KEY` en Vercel (lo crea Anthony).
   Si gana Chatterbox: `DEEPINFRA_API_KEY`; clonar 4 voces de referencia
   (una por companion) con locutores nativos MX, 10 s cada una.
4. Costo esperado a 10k usuarios × 30 frases/día × 120 caracteres ≈ 36M
   caracteres/mes: OpenAI ≈ $540, Inworld ≈ $250–900, Chatterbox ≈ $36,
   ElevenLabs ≈ $1,800–3,600.

## Trampas

- Licencias no comerciales: Fish S1-mini/S2 Pro, Voxtral, Breeze, Higgs v3.
- Acento: casi nadie expone es-MX como flag; lo decide la voz que clonas.
- Streaming: Chatterbox Multilingual y Gemini 2.5 no lo tienen.
- Self-host no cabe en Vercel Functions: Modal/RunPod/DeepInfra; el
  "keep-warm" convierte $0 en factura por hora.
