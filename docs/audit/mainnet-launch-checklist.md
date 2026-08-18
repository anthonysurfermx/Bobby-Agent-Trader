# Mainnet launch checklist — qué DEBE estar público el día del anuncio

Fuente: red-team Kimi K3 v3 (2026-08-18, `.ai/responses/2026-08-18_kimi-redteam-genz-app-protocol.md`)
+ gates ya vigentes del runbook. **Veredicto de Kimi: NO-GO a mainnet hasta
cerrar los 3 bloqueantes.** El canario Sepolia sigue su curso normal.

## Bloqueantes (los 3 NO-GO)

- [ ] **1. Safe 2-de-3 real** con pin de codehash/singleton, handoff ACEPTADO
      de los 7 contratos, ownership verificable públicamente (link a
      app.safe.global + direcciones + roles). Ver `safe-setup-runbook.md`.
- [ ] **2. Página pública de calls verificables + Challenge UI/docs.**
      Cada call: tx hash, prueba Pyth, símbolo, modo (VERIFIED/ATTESTED),
      resultado, link a Basescan. Botón "Retar este call" + guía paso a paso
      + UN CHALLENGE EJEMPLO EXITOSO documentado. Si retar requiere `cast`,
      no cuenta como abierto.
- [ ] **3. Bug bounty con premio real publicado.** Premios por challenges
      válidos, bugs y reportes de frontrunning. Sin incentivo nadie audita
      gratis y "gran protocolo" suena a marketing.

## El resto del kit de anuncio (en orden)

- [ ] Auditorías publicadas completas (5 rondas, severidades y fixes — no hilos).
- [ ] Risk/disclaimer page honesta: VERIFIED = BTC/ETH/SOL con oráculo;
      ATTESTED = self-reported (NUNCA venderlo como inmanipulable); el
      recorder key puede pausar pero no reescribir el pasado; smart contract risk.
- [ ] Demo en video de 60s: un challenge real reclasificando WIN→LOSS.
- [ ] 3 challenges públicos hechos por nosotros mismos ANTES del anuncio,
      documentados (mitigación del riesgo "fractura de credibilidad en CT").
- [ ] Thread de respuesta preparado para el escrutinio hostil.

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
