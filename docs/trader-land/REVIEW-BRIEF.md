# Trader Land — review brief for Codex and Kimi K3 (CLI)

Objetivo: dos revisiones independientes del plan v0.1 de Trader Land
(`docs/trader-land/PLAN.md`) antes de escribir una sola línea de código.
Queremos que rompan el plan, no que lo aplaudan.

## Qué leer (en este orden)

1. `docs/trader-land/PLAN.md` — el plan completo.
2. `CLAUDE.md` — reglas del repo (no hardcode, sandbox, endpoints, Supabase).
3. `src/lib/companions/data.ts` y `src/lib/companions/progress.ts` — las
   reglas de XP que ya viven en producción (20 NO TRADE / 10 accionable,
   cap 3/día, racha con 1 día de gracia, niveles 0/50/150/400/1000,
   herramientas 1/100/200 XP, mascota 500 XP).
4. `ios/Bobby/Sources/Companion.swift` y `CompanionTools.swift` — lo mismo
   en iOS (rama `ios/companion-bond`).
5. `docs/base-builder-quest/README.md` — la parte on-chain (contexto para
   la fase P4, no es requisito).

## Contexto en tres líneas

- Bobby es un compañero de análisis de mercado (3 agentes: Alpha Hunter,
  Red Team, CIO). Nunca ejecuta, nunca toca dinero, no es asesoría.
- El sistema de gamificación premia **disciplina** (leer completo, aceptar
  NO TRADE, tesis con invalidación, cerrar el loop). Jamás volumen, frecuencia
  ni P&L. Esto no se negocia.
- Trader Land es la versión "Focus Tree" de eso: cada sesión de desk deja
  piezas para construir un mundo isométrico; amigos y squads lo ven.

## Qué queremos que evalúen (responder punto por punto)

1. **Economía y exploits.** ¿Dónde se puede farmear sin disciplina real?
   ¿Qué señal del quality score es falsificable desde el cliente? ¿Los caps
   (3 XP awards/día, 40 Aura/día) son suficientes o crean techo aburrido?
2. **Incentivos perversos.** ¿Algo del diseño empuja a operar más, a
   apostar, o a "cerrar tesis" solo por el drop? Propongan cambios
   concretos, no advertencias genéricas.
3. **Esquema de datos.** Revisen el SQL: RLS, idempotencia de
   `award_session`, race conditions (dos clientes), integridad del ledger,
   índices, lo que falta para squads/temporadas. Señalen columnas inútiles.
4. **Cumplimiento.** App Store 3.1.1 / 5.3 (loot, odds, IAP cosmético),
   apps financieras, menores (13–22 es la audiencia de Focus Tree). ¿Qué
   nos frena en revisión de Apple? ¿Qué texto legal mínimo necesita el mundo?
5. **Alcance realista.** Equipo de 2 (Anthony + agente). ¿P1 en 2–3 semanas
   es creíble? ¿Qué cortarían de P1 para lanzar en 10 días? ¿Qué es
   imprescindible que NO se corte?
6. **Tecnología.** PixiJS vs three.js ortográfico en web; SpriteKit vs
   SceneKit en iOS; ¿un solo renderer compartido tiene sentido? Sync de
   progreso local → Supabase en el primer login: riesgos.
7. **Diseño / arte.** ~100 créditos Higgsfield para 38 sprites: ¿es la
   lista correcta? ¿Qué falta para que el mundo se sienta vivo con solo 12
   edificios?
8. **Métricas.** Las 5 métricas que probarían que Trader Land mejora
   disciplina (no engagement vacío) en 30 días.

## Formato de salida que esperamos

```
## Veredicto (1 línea): GO / GO con cambios / NO GO
## Top 5 problemas (ordenados por severidad, con la solución propuesta)
## Cambios al esquema (diff SQL o lista)
## Qué cortar de P1 / qué no cortar
## Riesgos legales y de App Store
## Preguntas abiertas para Anthony
```

Sin cumplidos, sin resumen del plan, sin relleno.

## Comandos

Codex (desde la raíz del worktree `feat/web-companion`):

```bash
codex exec --full-auto "Lee docs/trader-land/REVIEW-BRIEF.md y sigue sus instrucciones al pie de la letra. Escribe tu revisión en docs/trader-land/reviews/codex-$(date +%F).md"
```

Kimi K3 (CLI de Moonshot; ajusta el nombre del modelo/flag a tu versión):

```bash
kimi --model kimi-k3 --yolo "Lee docs/trader-land/REVIEW-BRIEF.md y sigue sus instrucciones al pie de la letra. Escribe tu revisión en docs/trader-land/reviews/kimi-$(date +%F).md"
```

Cuando existan los dos archivos en `docs/trader-land/reviews/`, pásamelos y
consolido un v0.2 con lo que sobreviva de las dos revisiones.
