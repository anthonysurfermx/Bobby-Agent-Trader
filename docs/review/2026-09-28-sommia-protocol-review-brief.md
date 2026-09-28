# Brief para Codex: revisión técnica del protocolo antes de Sommia (jueves 2026-10-01)

## Contexto

El jueves gente técnica de Sommia va a evaluar Bobby: sobre todo la web y también la app de iOS.
Lo que más pesa es la parte de **agentes** del protocolo. Una sola afirmación falsa en
bobbyprotocol.xyz/protocol nos cuesta más que diez secciones bien hechas.

El 2026-09-28 Claude dejó en `main` (commits `44bffc1` y `1935d2f`, desplegados a prod vía Git):

1. **El resolvedor de llamadas públicas vuelve a correr.** `api/forum-resolve.ts` más
   `api/_lib/path-resolution.ts`, con cron diario a las 12:30 UTC en `vercel.json`.
   - Había perdido su cron el 2026-06-07, así que 70 llamadas llevaban meses en "pending".
   - Ahora cada llamada se resuelve contra la trayectoria de velas 1H entre su creación y su
     expiración:
     - Gana el primer toque, y si stop y target caen en la misma vela, gana el stop.
     - La vela que ya estaba en curso al crear la llamada se excluye.
     - Si no hubo toque, se marca al cierre de la última vela dentro de la ventana.
   - Nunca se usa el precio de hoy.
2. **La web /desk ahora usa el debate real de 3 agentes.**
   - Antes, en la web Alpha, Red Team y CIO eran plantillas armadas en el navegador. Ahora
     `src/components/nucleo/deskData.ts` (`runAgents`) y `NucleoDesk.tsx` llaman a
     `/api/desk-debate`, igual que iOS.
   - El CIO solo puede **vetar** la señal del motor de indicadores, nunca subirla (regla R5 de
     iOS, `ios/Bobby/Nucleo/ARCHITECTURE.md`).
   - `desk-debate` ahora acepta `pt`.
3. **Stats y heartbeat.**
   - `/api/bobby-protocol-stats` agrega `debatesRun`, `abstentions`, `lastDebateAt`,
     `latestDebate` (con los 3 agentes) y `pipeline` (modelos y horarios).
   - El heartbeat tenía una tolerancia de 9 h contra un cron diario. Ahora aguanta el ciclo
     diario, y "overall" ya no depende de si alguien ha pagado un contrato.
4. **Copy de /protocol, /protocol/docs, console, harness y sandbox**, alineado con lo que
   el código hace hoy.

## Tu trabajo

Haz una **segunda revisión independiente y adversarial**, apoyándote en **DeepSeek V4 Flash**
como segundo revisor. No confíes en el copy ni en este brief: verifica todo contra el código y
contra producción.

### Cómo usar DeepSeek

- La API de DeepSeek es compatible con OpenAI: `https://api.deepseek.com`, con la llave en
  `DEEPSEEK_API_KEY`, que tomas del entorno y nunca escribes en archivos ni en logs.
- **No inventes el model id.** Primero haz `curl -s https://api.deepseek.com/models -H "Authorization: Bearer $DEEPSEEK_API_KEY"`
  y usa el id exacto que aparezca para V4 Flash. Si no aparece, detente y repórtalo.
- Uso sugerido: tú extraes los hechos (archivo:línea más la respuesta real de prod) y le pides a
  DeepSeek que ataque cada afirmación pública con esos hechos. Tú decides; DeepSeek es el Red Team.
  Guarda sus respuestas crudas en `.ai/review/deepseek/`.
- Nunca le mandes secretos, `.env`, llaves ni datos de usuarios. Solo código y respuestas públicas.

### Qué revisar (en orden de importancia)

1. **Agentes: cada afirmación de /protocol y /protocol/docs frente al código.**
   - Revisa `src/pages/BobbyProtocolLanding.tsx`, `src/pages/BobbyDocsPage.tsx`,
     `api/_lib/desk-debate.ts`, `api/desk-debate.ts`, `api/bobby-cycle.ts`,
     `api/_lib/commit-policy.ts` y `api/_lib/llm.ts`.
   - Afirmaciones a verificar: roles y orden, qué ve cada agente, modelos, veto del CIO,
     guardia de salida, fuentes de datos, frescura mínima, mezcla de convicción 70/30, piso
     de commit, expiración de 48 h, resolvedor.
   - Entrega una tabla: afirmación → verdadera / falsa / exagerada → evidencia archivo:línea.
2. **Paridad web ↔ iOS del debate.** Confirma que la web y la iOS muestran el mismo veredicto
   para la misma respuesta (R5/R6). Casos borde:
   - `desk-debate` falla o hace timeout: la web debe mostrar "no trade" con la razón "el debate
     no terminó".
   - El CIO dice `review` en una dirección distinta a la del motor.
   - Idioma `pt`: la guardia de salida (`reviewDeskOutput`) solo tiene patrones EN/ES. Dime si
     hace falta PT antes del jueves.
3. **Resolvedor.** Revisa `api/_lib/path-resolution.ts` en busca de lookahead, zonas horarias,
   velas de OKX contra Yahoo en acciones (fines de semana), paginación (máximo 100 velas por
   llamada) y llamadas sin stop o sin target.
   - Después del cron de mañana a las 12:30 UTC, confirma en Supabase (proyecto
     `qbvdqkknnuweatptjohi`, **solo lectura**) que las 70 pendientes se resolvieron, que
     `resolved_at` es la hora del mercado y no la del job, y que el win rate público cambió de
     forma coherente.
   - Revisa que no se hayan disparado transacciones on-chain para llamadas anteriores a
     2026-08-18 (`ONCHAIN_V2_SINCE_MS`).
4. **Números públicos.** Cada número de /protocol debe salir de `/api/bobby-protocol-stats` o del
   contrato. Compara la API contra lecturas directas de los contratos en Base
   (TrackRecord `0x822DB0DbbCAB398e610fcBA86DA9BB92d2493321`, usando las direcciones de
   `src/config/chains.ts`). Marca cualquier número hardcodeado.
5. **MCP.**
   - `POST /api/mcp-bobby` y `/api/mcp-http` con `tools/list` deben dar 11 y 20 herramientas,
     como dicen las docs.
   - Que el precio premium coincida con `mcpCallFee` de AgentEconomy.
   - `bobby_debate` va por `/api/openclaw-chat`, no por `/api/desk-debate`. Evalúa si eso
     contradice el "misma procedura" de la landing y propón el cambio mínimo.
6. **iOS.** Confirma que la build en TestFlight o la última archivada usa `/api/desk-debate` y
   muestra Wait/Review. Anota cualquier texto de la app que contradiga el protocolo.
7. **Las otras páginas del protocolo**: `/protocol/calls`, `/risk`, `/audits`, `/bounty`,
   `/heartbeat`, `/console`, `/harness`, `/playbooks`, `/sandbox`.
   - Busca links rotos, restos de X Layer/OKB, afirmaciones de "trading" (el trading está
     retirado), números en cero que se vean como fallas y textos que prometan algo que el
     endpoint no hace.

### Reglas

- Trabaja en un worktree y una rama propia: `codex/sommia-protocol-review`. **No hagas push a
  `main` ni despliegues.**
- No escribas en la base de datos de prod ni mandes transacciones.
- Los arreglos pequeños y obvios de copy van en commits separados en tu rama. Todo lo que toque
  lógica va como propuesta, no como commit.
- Corre `npm run build` antes de cada commit.
- Entregable: `.ai/review/2026-09-29-sommia-protocol-review.md` con:
  - Veredicto GO / NO-GO para el jueves.
  - Hallazgos por severidad, con evidencia archivo:línea o la respuesta de prod.
  - Qué dijo DeepSeek y en qué no estás de acuerdo.
  - Lista corta de lo que Anthony debe decir (y no decir) en la reunión.

### Límites conocidos (no los reportes como hallazgos nuevos)

Menciónalos solo si ves algo peor:

- **App y ledger público.** Las lecturas del app (/desk, iOS) no se publican en el ledger
  público. Es por diseño y la página lo dice.
- **On-chain.**
  - TrackRecordV2 en Base tiene n=1.
  - ConvictionOracle no tiene símbolos publicados.
  - AgentEconomy no tiene pagos.
  - AdversarialBounties no tiene bounties.
- **Ciclo diario.** Desde el 2026-08-17 el ciclo no ha emitido ninguna llamada direccional (el
  CIO se abstuvo todos los días). Es real y la página lo presenta como abstenciones.
