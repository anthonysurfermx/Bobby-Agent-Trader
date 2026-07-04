# Bobby × OKX AI (okx.ai) — integración en dos direcciones

Fecha: 2026-07-03. Estado: skill empaquetado, submission pendiente.

OKX AI es el marketplace onchain de la economía de agentes: **Agent
Marketplace** (agentes listan servicios), **Task Marketplace** (agentes
toman trabajo y cobran en USDT/USDG, escrow o pay-per-call) y **Skills
Marketplace** (skills instalables con scan de seguridad y firma). La
reputación es onchain y portable — exactamente el moat que Bobby ya
modela con `registry.ts` / `reputation.ts` / `agent-identity.ts`.

## Oferta — Bobby como producto en el marketplace

### Hallazgo competitivo (verificado 2026-07-03 vía skills_search)
- Búsqueda "debate": **0 resultados**. No existe verificación adversarial
  pre-trade en el marketplace.
- Categoría Review (10+ skills): todo es 复盘 post-trade (pnl-loss-reviewer,
  okx-trade-review-suite, hindsight-reviewer…). El slot pre-trade está vacío.

### Entregable
`okx-skills/bobby-debate/SKILL.md` — skill formato oficial okx/agent-skills
(frontmatter YAML, description con trigger phrases EN/ES/中文 <1024 chars).
Read-only: consume la API pública de Bobby, no ejecuta órdenes.
- Briefing barato: `GET /api/bobby-intel` (caché 5 min, ilimitado)
- Debate completo: `GET /api/agent-run?manual=true` (3/h por IP, 12/h global)

El hardening de endpoints (PR #12/#13) es prerequisito de esto: sin rate
limits persistentes no se puede exponer la API a un marketplace.

### Pendiente para publicar
1. Proceso de submission: el repo okx/agent-skills documenta el formato
   pero no el proceso de publicación de terceros. Vías a confirmar:
   portal en okx.com/agent-tradekit/skills o el skill `okx-cex-skill-mp`.
2. Pasar el security scan de OKX (malicious content / prompt injection /
   data leakage) — el skill es read-only y no pide credenciales, debería
   pasar limpio.
3. Decidir monetización v2: pay-per-debate vía x402 en `api/mcp-http.ts`
   (los payment challenges ya existen — migración 20260407) en cuanto el
   Agent Marketplace permita cobrar por llamada.

## Demanda — Bobby consumiendo el ecosistema

### Verificado
- MCP Agent Trade Kit conectado (v1.3.5): módulos `news`, `smartmoney`,
  `market`, `event` habilitados. El harness local del copiloto ya los usa
  (okx-cex-smartmoney, okx-sentiment-tracker instalados del marketplace).
- **No hay endpoint público serverless de news**: `POST
  /api/v5/aigc/mcp/news` devuelve 404 (probado 2026-07-03). Los
  indicadores sí son públicos (`aigc/mcp/indicators`, bobby-intel ya los
  consume). La integración de news/sentiment al briefing serverless queda
  bloqueada hasta que OKX exponga ese módulo por HTTP público o demos de
  alta una API key del Trade Kit en Vercel.

### Siguiente paso concreto (cuando se desbloquee)
Agregar `fetchNewsSentiment()` al fan-out de `bobby-intel.ts` (mismo
patrón que `fetchTechnicalIndicators`) y pasarle el sentiment al Red Team
en el prompt del debate — un vector de ataque más ("la narrativa está
eufórica, el trade está crowded").

## Narrativa

"Los agentes prometen. Bobby prueba." — en okx.ai eso se convierte en:
los agentes del marketplace ejecutan; Bobby es el único que vende la
*verificación adversarial* previa, con calibración pública y track record
onchain. Oferta: skill + agente contratable. Demanda: sus debates se
alimentan del mismo ecosistema que audita.
