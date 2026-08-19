# Mainnet launch checklist — qué DEBE estar público el día del anuncio

Fuente: red-team Kimi K3 v3 (2026-08-18, `.ai/responses/2026-08-18_kimi-redteam-genz-app-protocol.md`)
+ gates ya vigentes del runbook. **Veredicto de Kimi: NO-GO a mainnet hasta
cerrar los 3 bloqueantes.** El canario Sepolia sigue su curso normal.

## Bloqueantes (los 3 NO-GO)

- [~] **1. Safe 2-de-3 real** con pin de codehash/singleton, handoff ACEPTADO
      de los 7 contratos, ownership verificable públicamente. Ver
      `safe-setup-runbook.md`, `safe-canary-state.md`, `mainnet-env-template.md`.
      **AVANCE 2026-08-19c (grande):** Safe CANARY ya existe y pasa 6/6 del gate
      (`0x8BE60853F27b944e11486285d95c3e06596553b4`, owners B/C/G, threshold 2,
      singleton canónico). Pinning derivado on-chain (OWNER_SAFE_*). Handoff
      canary preparado (batch + runbook). **Anthony aprobó REUSAR B/C/G para
      mainnet.** Env de mainnet plantillada con owners/fees/quórum/flags.
      FALTA (firma de Anthony, no del agente): (a) crear el Safe mainnet 8453
      con B/C/G; (b) recorder key nueva ≠ deployer; (c) handoff canary (2 firmas).
- [~] **2. Página pública de calls verificables + Challenge UI/docs.**
      Cada call: tx hash, prueba Pyth, símbolo, modo (VERIFIED/ATTESTED),
      resultado, link a Basescan. Botón "Retar este call" + guía paso a paso
      + UN CHALLENGE EJEMPLO EXITOSO documentado. Si retar requiere `cast`,
      no cuenta como abierto.
      **AVANCE 2026-08-19:** bobbyprotocol.xyz/protocol/calls LIVE (canary):
      ledger on-chain con tx hashes commit/resolve/challenge, evidencia Pyth
      (precio + publishTime), scorecard V2, guía de verificación y docs del
      challenge permissionless.
      **AVANCE 2026-08-19b:** breach scanner de un clic LIVE en la misma página
      ("retar" por call): busca el tick firmado de Pyth en el anchor elegido y
      SIMULA challengeStopBreach vía eth_call — el veredicto lo da el contrato
      (BREACH / NoBreach / ventana cerrada), sin wallet ni gas; en BREACH
      entrega updateData + cast command listos para mandar la tx real.
      FALTA: submit con wallet desde la página + el challenge ejemplo
      documentado (sale del ciclo canario 003).
- [~] **3. Bug bounty con premio real publicado.** Premios por challenges
      válidos, bugs y reportes de frontrunning. Sin incentivo nadie audita
      gratis y "gran protocolo" suena a marketing.
      **AVANCE 2026-08-19:** bobbyprotocol.xyz/protocol/bounty LIVE — pool
      inicial $5,000 USDC: $2,500 crítico / $500 alto / $150 medio / $100
      por challenge válido en mainnet; scope pineado al release congelado,
      disclosure 90 días vía GitHub Advisories, challenge-tx-as-claim.
      Montos aprobados por Anthony 2026-08-19. FALTA: fondear el pool al
      lanzar el Safe (los términos ya aceptan reportes desde hoy).

## El resto del kit de anuncio (en orden)

- [x] Auditorías publicadas completas — bobbyprotocol.xyz/protocol/audits LIVE (5 rondas, NO-GO→fix→re-audit, 4 P1s, links a informes).
- [x] Risk/disclaimer page — bobbyprotocol.xyz/protocol/risk LIVE (VERIFIED vs ATTESTED, tabla de supuestos, never-claim list, disclaimer). Contenido red-teamed por Kimi.
- [ ] Demo en video de 60s: un challenge real reclasificando WIN→LOSS.
- [ ] 3 challenges públicos hechos por nosotros mismos ANTES del anuncio,
      documentados (mitigación del riesgo "fractura de credibilidad en CT").
- [x] Thread de defensa CT preparado — docs/strategy/ct-defense-thread.md (12 ataques + respuesta técnica). Falta solo sustituir links placeholder al publicar.

## Claims — lenguaje permitido

- ✅ "Track record VERIFIED (BTC/ETH/SOL) verificable por terceros con pruebas
     Pyth y challenges permissionless"
- ❌ "Track record inmanipulable" a secas (el bucket ATTESTED no lo aguanta)

## Riesgos de lanzar protocolo antes que app (aceptado: protocolo primero)

| Riesgo | Mitigación barata |
|---|---|
| Ghost chain (solo bots tocan el contrato) | Lanzar mainnet con campaña "Reto Bobby": KOLs hacen calls, seguidores retan, leaderboard público, USDC real a challengers |
| Fractura de credibilidad técnica en CT | Los 3 challenges propios pre-anuncio + thread de respuesta listo |
| Custodia inmadura del recorder key | Safe + hardware signer + monitoreo; política de rotación publicada; **recorder key ≠ deployer key** (hoy en Sepolia son la misma — corregir en mainnet) |

## Hallazgos técnicos de Kimi a resolver (no bloquean Sepolia)

- Recorder key comprometida puede seguir comiteando dentro de su ventana:
  no hay pausa automática ni timelock de parámetros en V2 → evaluar guardian
  pause o monitoreo con revoke runbook.
- Hermes API key centralizada = single point of liveness para VERIFIED
  commits → fallback plan (segunda key / current contract como respaldo ya
  aprobado en el gate).

## Pre-flight verificado (2026-08-19)
Set canónico de Pyth mainnet (8453) confirmado on-chain (`mainnet-preflight-checks.md`): UPGRADED+CURRENT existen y el gate pasará. Safe canary 6/6. Falta solo lo gated por firma/deploy.
