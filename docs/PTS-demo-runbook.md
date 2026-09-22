# PTS demo runbook — 0.8.0 (18)

## The night before / morning of

1. **No merges to Bobby `main` until the demo is over.** Production auto-deploys from `main`, and
   `api/pts-realtime-session.ts` is only in the current CLI deploy (branch `codex/pts-live-relay`).
   A deploy from `main` removes it and Copiloto shows "Voz en vivo no disponible".
2. Check that the voice endpoint is live (expect `405`; `404` means it was dropped):
   ```bash
   curl -s -o /dev/null -w "%{http_code}\n" https://bobbyprotocol.xyz/api/pts-realtime-session
   ```
3. iPhone: volume up, Focus / Do Not Disturb on (a call ends the session), Wi‑Fi on,
   disconnect AirPods unless you want the audio in them, Low Power Mode off.
4. Settings › PTS › Micrófono = on.
5. Rehearse once and screen-record it on the iPhone (Control Center › Screen Recording, long-press to
   turn the microphone on). That is the backup if Live fails in the room.
   Each rehearsal uses one of 6 voice sessions allowed per network every 10 minutes.

## Reset between runs

Swipe PTS away from the app switcher and reopen it. Nothing is stored: it always opens on the
splash, then Home › Opciones with COIN.

## The path (≈6 minutes, four signals, four lifecycle states)

1. Splash (≈2.8 s) → Home › **Opciones**: **ASTS** leads the carousel — Daniel sent it on Sep 22
   during the session ("entrada activa · 64.00–65.85"), high-risk, call 75 / 20 nov 2026 documented.
   Open it → Comunidad: tap ♥ (asks your name once) → "Le gustó a <nombre>" → write a comment.
   Copiloto → "¿Por qué es de alto riesgo?".
2. Swipe to **COIN** — result reported ("2.º objetivo"), contract **not** documented, YouTube
   05:27 / 15:29. Copiloto → "¿Qué niveles menciona Daniel?" → an out-of-scope question → redirect.
3. Home › **Stocks · XLY** — plan pending at publication: entry 112.99, stop 109.26, BE 115,
   targets 116/118/123 drawn with roles; call 115 / 19 mar 2027 documented.
4. Swipe to **DRAM** — activated and in profit per Daniel (Sep 21); levels stay neutral because the
   entry message of Sep 17 is not in the material. Copiloto → "¿Ya activó DRAM?".
5. Tap **Guardar** on any signal → Home › **Guardadas** (top right) shows it.

Each Copiloto stays inside its own signal ("¿Y COIN?" inside XLY gets the redirect).
Each Copiloto opening uses one of the 6 voice sessions per network per 10 minutes. Likes and
comments do not count against that limit. Everyone with the app sees the same likes and comments
within ~8 s; if Daniel's team installs it, their likes show up live.

Facts worth saying out loud: XLY's Yahoo data shows a Sep 22 intraday high of 113.29 (above the
112.99 entry), but the app's snapshot stops at the Sep 21 close on purpose, so it shows the plan as
published. Daniel's Sep 21 post also reports COIN reached all 3 targets (+$1,800, +180 %); the COIN
card still shows the Sep 18 video claim ("2.º objetivo").


## What is live (0.8.0)

- **Prices and charts are live** during US market hours (Yahoo data via Bobby's public
  `stock-candles`, ≤ a few minutes behind): each card shows "● En vivo", the day's change and a
  follow-up line computed from real candles since publication. Right now that reads, e.g.,
  COIN "Superó el Nivel 6 204.53 · 21 sep", XLY "Alcanzó Entrada 112.99 · 22 sep", ASTS "Entrada
  activa desde la publicación". Outside market hours it shows the last close; offline, the bundled
  snapshot.
- **Seguimiento en vivo** inside each signal: every documented milestone with ✓ + date or the
  distance from the current price. It is PTS tracking with market prices, not Daniel's account.
- **The Copiloto receives the live price** at connect, so "¿Cómo va ASTS?" is answered with it.
- **Backup voice**: if OpenAI fails (credits, outage, timeout, no network) the Copiloto keeps
  talking with the pre-rendered Edge es-MX Dalia voice (24 clips in the app, no provider needed):
  greeting plus reviewed answers to the chips and typed questions. It does not listen to the
  microphone in that mode — tap the examples or type.
- **Launch**: black launch screen (no white flash) and the new motion-graphics splash (≈2.75 s).

## If something fails

| You see | Do |
|---|---|
| "Sin conexión" | Check Wi‑Fi, tap Reintentar voz. Meanwhile the chips give reviewed answers labeled "Respuesta revisada · sin voz en vivo". |
| "Voz en vivo ocupada" | Too many sessions in 10 min from this network. Switch to cellular or wait; use the chips. |
| "Voz en vivo no disponible" | Run the curl above. `404` = endpoint dropped by a deploy. Use chips + backup recording. |
| "Error de audio" | A call/Siri took the audio or the route failed. Tap Reintentar voz. |
| "Micrófono desactivado" | Tap Abrir Ajustes, enable Micrófono, come back, Reintentar voz. |
| Silence while "Copiloto hablando" | Check the volume and whether audio went to AirPods. |

Say it plainly: the chart is a historical snapshot (not live), Daniel's result is reported by him and
not verified, and PTS never places orders.
