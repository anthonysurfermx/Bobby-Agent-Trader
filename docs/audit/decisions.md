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

## D-3 · Fees on-chain en token nativo; USDC solo para el rail x402 (r1 H-2, revisada 2026-08-12)

- **Hallazgo original**: todos los fees/floors eran literales `ether` dimensionados
  para OKB (`0.001 ether` ≈ $0.10 en OKB, ≈ $4 en ETH). `ABSOLUTE_MIN_BOUNTY` era
  `constant`.
- **Decisión FINAL (opción A, la implementada)**: los fees ON-CHAIN (MCP calls,
  bounties, stakes, debate fees) se pagan en el **token nativo de cada chain**
  (`msg.value`) — OKB en X Layer, ETH en Base — con parámetros re-dimensionados
  por deploy vía constructor (ya immutables/configurables, no constants). USDC es
  **exclusivamente** el rail de settlement x402/off-chain. Los dos rieles nunca se
  mezclan. Fuente de verdad: `api/_lib/chains.ts` (`onchainFeeToken: 'native'`,
  `x402SettlementToken: USDC`) y los constructores en `DeployBase.s.sol`.
- **Nota histórica**: una versión anterior de esta decisión proponía denominar los
  fees on-chain en USDC (6 decimales). Se descartó antes del deploy de Sepolia —
  cobrar ERC-20 en cada write añadía approve-flow y gas sin beneficio para el
  canario. El deploy de Sepolia (84532) ya corre con fees nativos ETH
  (mcpCallFee 0.000025 ETH, debateFee 0.0000025 ETH por agente).

## D-4 · Mainnet Base: el owner de los 7 contratos será un Safe, no una EOA (2026-08-11)

- **Contexto**: el canario Sepolia (84532) usa Wallet A
  (`0x821990Bda0BAa05F96506fd73ef439D0C2f17302`) como owner/bobby/alpha/red/
  hardnessScorer simultáneamente. Aceptable en testnet; inaceptable en mainnet:
  una sola llave comprometida controla pausas, fees, roles y upgrades de rol en
  los 7 contratos.
- **Decisión**: para el deploy a Base mainnet (8453), `--sender`/owner será un
  **Safe multisig** (mínimo 2-de-3). La EOA Wallet A puede conservar roles
  operativos calientes (recorder/bobby) porque firma transacciones frecuentes,
  pero owner, arbiter y la administración del quórum de resolvers viven en el Safe.
- **Implicaciones ejecutables**:
  1. Crear el Safe en Base antes del dry-run de mainnet y añadirlo al runbook
     como variable (`OWNER_SAFE_ADDRESS`).
  2. `DeployBase.s.sol` ya separa roles por env vars — solo cambia el valor de
     owner; validar que el guard pairwise de mainnet (r7) acepte Safe como owner.
  3. Los params de fees re-denominados (D-3) se ejecutan vía el Safe, no por EOA.
- **Estado**: decisión tomada; bloqueante para mainnet, no para el canario.
