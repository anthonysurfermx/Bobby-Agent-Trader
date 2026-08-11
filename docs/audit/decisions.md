# Audit decision log — Base migration

Decisiones explícitas sobre hallazgos que no son fixes mecánicos. Cada entrada
registra qué se decidió, quién y la regla operativa que deja.

## D-1 · IntentEscrow es un ledger de ATTESTATION, no de prueba verificable

- **Hallazgo**: r5 #4 — `resolveIntent` acepta `pnlBps` y `resolveHash` arbitrarios
  del resolver; no están atados a precio, ejecución ni oráculo.
- **Decisión** (Anthony, 2026-08-11): se acepta como registro de attestation.
  Atarlo a un oráculo de precio es un proyecto aparte y el contrato no custodia
  valor (non-payable, sin `receive`/`fallback` — verificado en r1).
- **Regla operativa resultante**:
  1. Cualquier superficie pública que muestre PnL de IntentEscrow debe
     etiquetarlo **"attested by resolver"**.
  2. Ese PnL **nunca** se mezcla con métricas price-verified (el win rate de
     BobbyTrackRecord, que desde r4 sí está atado a precio). Son dos clases de
     verdad distintas y se presentan separadas.
  3. `overrideResolution` + challenge window es el mecanismo de corrección.
  4. Si IntentEscrow llega a custodiar valor real, esta decisión se revisita
     como bloqueante.
- **Estado**: documentado en NatSpec de `resolveIntent` (BobbyIntentEscrow.sol).
  Hoy ningún endpoint ni página consume este PnL (verificado por grep en api/ y
  src/pages/); la regla aplica al primero que lo haga.

## D-2 · Resolver removido conserva votos emitidos (r5 #6) — pendiente de rediseño

- **Hallazgo**: `updateResolver(resolver, false)` en HardnessRegistry no invalida
  aprobaciones ya emitidas; una llave comprometida revocada sigue contando hacia
  el quórum del bounty en curso.
- **Estado**: pendiente para ronda 6 (requiere rediseño del conteo de quórum).
- **Mitigación operativa mientras tanto**: al revocar una llave comprometida,
  cualquier resolver honesto propone un `winner` distinto — el mecanismo de
  rondas existente resetea `approvalCount` a 0 e invalida los votos previos
  (incluidos los de la llave comprometida). Documentado como runbook, no como fix.

## D-3 · Fees OKB → USDC en el deploy a Base (r1 H-2)

- **Hallazgo**: todos los fees/floors son literales `ether` dimensionados para OKB
  (`0.001 ether` ≈ $0.10 en OKB, ≈ $4 en ETH). `ABSOLUTE_MIN_BOUNTY` es `constant`.
- **Decisión de arquitectura ya tomada**: en Base los fees se denominan en USDC
  (6 decimales) — ver `api/_lib/chains.ts` (`feeToken`/`feeTokenDecimals`).
- **Pendiente ejecutable**: antes del deploy, los scripts `Deploy*.s.sol` deben
  fijar los parámetros re-denominados, y las constantes `constant` (como
  `ABSOLUTE_MIN_BOUNTY`) deben editarse en fuente. Checklist en r3.
