# PTS Copiloto — voice contract (0.6.8)

Verified end to end against production on 2026-09-22 (see "Evidence").

## Transport

One transport only: **WebSocket with an ephemeral OpenAI credential.** No WebRTC, no SDP.

```
iPhone ──POST──▶ https://bobbyprotocol.xyz/api/pts-realtime-session   (no auth, rate limited)
       ◀─200──  { ok, client_secret: "ek_…", expires_at, model }
iPhone ══WSS══▶ wss://api.openai.com/v1/realtime?model=<model>
                Authorization: Bearer <client_secret>
```

`api/realtime-session.ts` is Bobby's own WebRTC/SDP endpoint (Supabase auth, quotas). PTS does not use it.

## Broker endpoint — `api/pts-realtime-session.ts`

| | |
|---|---|
| Source | Bobby repo, branch `codex/pts-live-relay` (89464bc). **Not in `main`.** |
| Deployed | Production CLI deploy `dpl_7x4f49omCCK6KaY76LhszV2AEFFC` (2026-09-22 12:48 WEST) |
| Method | `POST`, body ignored (`{"lang":"es","voice":"marin"}` sent) |
| Auth | None. The OpenAI key stays on the server; only an `ek_` secret leaves it. |
| Rate limit | 6 mints per IP per 10 min (in-memory + Supabase persistent) → `429` |
| Secret TTL | 600 s to open the socket (OpenAI default) |
| Session length | OpenAI allows up to 60 min; **the 180 s limit is enforced by the app only** |
| Model / voice | `gpt-realtime-2.1-mini` / `marin` (env `REALTIME_MODEL`, `REALTIME_VOICE`) |
| Errors | `405` wrong method, `429` rate limit, `503` key missing, `502` mint failed |

Hardening prepared on branch `claude/pts-realtime-hardening` (not deployed): `Cache-Control: no-store`
(prod currently sends `public, max-age=0, must-revalidate` on a response that carries a credential),
`GET` health check that never mints, 8 s upstream timeout (`504`), upstream rate-limit `429` passed through with
`Retry-After` (billing `insufficient_quota` stays `502`), and one structured log line per outcome: `mint_ok`, `rate_limited`, `not_configured`,
`upstream_auth`, `upstream_quota`, `upstream_timeout`, `mint_failed`, `mint_empty`, `exception`.
Audio failures happen on the device and are not visible server-side.

## Session protocol (client → server events)

1. `session.created` → client sends `session.update`: reviewed `PTSVoicePolicy.instructions`,
   `output_modalities: ["audio"]`, `max_output_tokens: 1536`, `tools: []`, PCM16 24 kHz in/out,
   `gpt-4o-mini-transcribe` (es), server VAD with **`create_response: false`**, `interrupt_response: true`.
2. `session.updated` → audio graph starts, 180 s deadline starts, greeting requested with
   `response.create` ("Di exactamente: Hola, ¿qué quieres saber sobre COIN y el análisis de Daniel?").
3. Each question (voice transcript or typed/chip) is routed on device by `PTSVoicePolicy.route`:
   - `answer` — has a case anchor (whole-word "coin", Coinbase, Daniel, nivel, rango, ruptura, escenario…);
     crypto/macro context next to an anchor stays askable ("¿si baja bitcoin qué pasa con COIN?").
   - `redirect` — role injection, or clearly foreign topics (personal life, recipes, code, other stocks);
     the model is told to say the scripted redirect.
   - `judge` — everything else (short follow-ups like "Sí", generic phrasing); `judgeInstruction` lets the
     model answer if it is about the case or a follow-up, otherwise say the redirect.
   The local fallback answers `answer` routes and recognizable follow-ups; other questions get the redirect.
   Deltas of a cancelled or barged-in response are ignored by `response_id`.
4. Barge-in: `response.cancel`, `conversation.item.truncate`, `conversation.item.delete`, all tagged
   `event_id: pts-cleanup-N`; server errors caused by them are ignored instead of ending the session.
5. At 180 s the client closes the socket and audio (`Terminó tu sesión de 3 minutos`).

## Client states

| State | Sheet shows | Cause |
|---|---|---|
| connecting | spinner · "Conectando voz…" | up to 15 s total budget (mint + socket + handshake) |
| listening | "Te escucho" | VAD waiting |
| thinking | "Revisando el análisis…" | response requested |
| speaking | "Copiloto hablando" | audio deltas playing |
| error · offline | "Sin conexión" + Reintentar | URLError offline codes |
| error · microphone | "Micrófono desactivado" + Abrir Ajustes | permission denied |
| error · audio | "Error de audio" + Reintentar | engine/route failure, call/Siri interruption |
| error · busy | "Voz en vivo ocupada" | HTTP 429 |
| error · timeout/server | "Voz en vivo no disponible" | 15 s budget, 5xx, socket closed |
| ended | "Terminó tu sesión de 3 minutos" / "Conversación finalizada" + Nueva conversación | deadline, background, user |

In any error state, chips and typed questions return the **local reviewed answers**, labeled
"Respuesta revisada · sin voz en vivo". They never imitate a live session.

`AVAudioEngineConfigurationChange` (speaker override, voice processing, AirPods) restarts the **same**
engine in place — new input tap for the new format, `engine.start()`, `player.play()` — with bounded retries
(6). The first 0.6.8 attempt rebuilt a new engine instead; on the physical iPhone it ended in "Error de audio"
with speech received but never rendered. The likely cause is that rebuild re-enabling voice processing while the
route settles; device traces to confirm it are pending (the phone locked before they ran). The idle timer is disabled while a session is
connecting or active, because Auto-Lock would background the app and end a hands-off conversation.

## Evidence (2026-09-22, production)

- Probe replicating the client event-for-event: mint 1.3 s, socket open 2.6 s, greeting first audio 1.2 s,
  exact greeting text returned.
- Routing matrix, 25 isolated trials plus 3 "Sí" follow-ups in context: follow-ups answered 3/3 (the
  previous filter redirected every "Sí"), generic off-topic questions redirected 8/8.
- Scope matrix, 36 isolated trials: previous prompt refused 11/27 in-scope questions (including
  "¿Qué dijo Daniel?" 3/3 and "¿Qué niveles menciona Daniel?" 1/3). Current prompt: 0/27 wrong refusals,
  0/9 out-of-scope leaks, answers 29–50 words.

## Health check

Today (prod, before hardening): `curl -s -o /dev/null -w "%{http_code}\n" https://bobbyprotocol.xyz/api/pts-realtime-session` → `405` means the route is deployed; `404` means it was dropped by a deploy from `main`.
After hardening: `curl -s https://bobbyprotocol.xyz/api/pts-realtime-session` → `{"ok":true,"configured":true,…}`.

# Community layer — likes, comments, saves (0.7.0)

Migration `20260922_pts_signal_social` on Supabase `bobby-protocol` (`qbvdqkknnuweatptjohi`), applied
2026-09-22 with Anthony's approval. Additive only; nothing in Bobby reads these objects.

| Object | Purpose |
|---|---|
| `pts_signal_likes (signal_id, member_hash, display_name, created_at)` | one like per member per signal |
| `pts_signal_comments (id, signal_id, member_hash, display_name, body ≤500, created_at)` | comments |
| `pts_signal_feed(p_signal_id, p_secret?)` | likes (who + when, last 50), comments (last 100), `liked`, `mine` |
| `pts_toggle_like(p_signal_id, p_secret, p_name)` | like / unlike, returns the feed |
| `pts_add_comment(p_signal_id, p_secret, p_name, p_body)` | ≤10 per member per 10 min, ≤200 per signal per hour |
| `pts_delete_comment(p_comment_id, p_secret)` | only the author |
| `pts_signal_summary()` | like and comment counts per signal for the Home cards |

- Tables have RLS on and no grants; anon/authenticated can only execute the five RPCs
  (`SECURITY DEFINER`, `search_path = ''`). Direct table reads return `42501`.
- A member is a random 64-hex device secret (`PTSMember`, UserDefaults) plus a display name asked
  once. The server stores only `sha256(secret)` and never returns it. No accounts, no email.
- The app calls `https://qbvdqkknnuweatptjohi.supabase.co/rest/v1/rpc/<fn>` with the publishable key.
- Saves are personal and stay on the device (`SavedSignals`). Nothing is seeded: every like and
  comment shown was made by a real person through the app.
- Verified 2026-09-22: RPC smoke test (like/unlike, comment, stranger delete → `not_found`, bad
  secret → `invalid_member`, direct read → `42501`) and the UI test `testCommunityLikesCommentsAndSaves`
  against the real backend; both leave zero rows behind.

Moderation: none beyond limits. Remove a row with SQL if needed:
`delete from public.pts_signal_comments where id = '<id>';`

Rollback:
```sql
drop function if exists public.pts_signal_summary(), public.pts_delete_comment(uuid, text),
  public.pts_add_comment(text, text, text, text), public.pts_toggle_like(text, text, text),
  public.pts_signal_feed(text, text), public.pts_member_hash(text);
drop table if exists public.pts_signal_comments, public.pts_signal_likes;
```
