# Bobby × Gen Z — benchmark y decisiones (2026-08-23)

Fuentes: research web (Cleo, Duolingo, Finch, Cash App, Robinhood, Step/Fizz/Frich/Bloom,
Monzo/Revolut, Partiful, Nu/Klar/Stori) + Codex CLI + Kimi K3 CLI.
Reporte completo: artifact "Bobby × Gen Z" (claude.ai/code/artifacts).

## Decisiones aplicadas

1. **Mascota primero, legal al final** (Finch). El wizard abre con el spawn de la mascota;
   el disclaimer es una "neta" humana con checkbox en la pantalla de deploy.
2. **Vibe como config estrella** (Cleo Roast/Hype → 7M usuarios, $150M ARR).
   Directo 🔥 / Táctico 🧠 / Sensei 🧘 — mapean a direct/analytical/wise (sin cambio de API).
3. **Voz por sensación con preview en vivo** — nunca male/female.
   Personas: coral (Cálida), ballad (Chill), sage (Serena), ash (Táctica).
   Motor: gpt-4o-mini-tts con `instructions` cálidas es-MX; Edge Neural como fallback $0.
   Web = MP3 (Safari iOS no reproduce opus); Telegram = opus (nota de voz real).
4. **Mascota 3D estilo Duolingo** (three.js, sin react-three-fiber): ojos siguen el cursor,
   squash-and-stretch al tap, parpadeo, boca sincronizada con el analyser.
   `BobbyMascot3D` (fallback SVG `BobbyMascot` si no hay WebGL). Reemplaza al orbe en
   AdamsChat cuando existe mascota configurada.
5. **10 avatares 3D premade** (los produce Anthony): soltar `.glb` en `public/mascots/`,
   registrarlos en `MASCOT_AVATARS` (src/lib/mascot.ts) con thumb PNG → la galería aparece
   sola en el paso 1 del wizard. Loader GLB ya integrado en MascotScene.

## Backlog (en orden)

- [ ] 10 avatares GLB + thumbs + registro.
- [ ] Migración SQL (MCP Supabase quedó read-only):
      `ALTER TABLE agent_profiles ADD COLUMN IF NOT EXISTS mascot jsonb;`
      (agent-setup ya tolera la columna ausente y reintenta sin mascot).
- [ ] Primer análisis como premio al terminar el wizard (momento "free stock" de Robinhood).
- [ ] Notificaciones con personalidad por vibe (inventario A/B, patrón bandit Duolingo).
- [ ] Agent card compartible (growth loop Cleo/Partiful).
- [ ] Bake-off ciego de voces con 20–30 usuarios 18–28 MX; gana la que mantiene calidez
      diciendo "no operes".

## Reglas de copy que quedaron en el wizard

- Tutear siempre; cero consola militar ("Acaba de nacer tu agente").
- CTAs imperativos cortos: "Dale", "Me gusta su look", "Así se queda".
- Juguetón en lo cosmético, serio en dinero/riesgo.
- Permiso para cambiar de opinión: "Puedes cambiarlo cuando quieras. Sin drama."
- Humor con datos del usuario, nunca contra él (fórmula Cleo).
