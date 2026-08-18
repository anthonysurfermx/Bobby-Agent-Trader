# Cutover X Layer → Base — secuencia ejecutable del flip a producción

**Decisión:** Anthony (2026-08-14) — mover TODO a Base, quitando X Layer como
chain de ejecución, **preservando el historial de X Layer como archivo de
solo-lectura** (los 2,038 commitments son el track record; el cutover quita
rutas de ejecución, no evidencia).

**Naturaleza:** este flip **ES el lanzamiento a mainnet**. No es un cambio de
config aislado — depende de compuertas duras. Documento y preparo; **no ejecuto
el flip** (toca producción y el carril de chain-selection es de Codex; la firma
es de Anthony).

**Mecánica del flip (ya construida):** `api/_lib/chains.ts` selecciona la chain
por `PROTOCOL_CHAIN` (unset → X Layer; `base`; `base-sepolia`). El frontend
(`src/config/chains.ts`) YA default-ea a Base. Así que el cutover backend es,
en esencia, poblar `BASE.contracts` con las direcciones desplegadas y poner
`PROTOCOL_CHAIN=base`. El latch existe para que ese flip NO ocurra con una
config incompleta.

---

## 0. Compuertas (TODAS verdes antes de tocar el flip)

Ninguna es negociable. Si una falla, el flip no ocurre.

| # | Compuerta | Dueño | Estado hoy |
|---|---|---|---|
| G1 | TrackRecordV2 auditado (3 rondas) + ABI congelado | Claude | ✅ ABI frozen; faltan las 3 rondas sobre el bytecode final |
| G2 | `DeployBase`/`Verify` → V2 con gate de Pyth canónico | Claude | ✅ commit 78feada + PythOracleGate |
| G3 | Adaptador backend V2 (endpoint chain-aware v1/v2 + Hermes) | Claude/Codex | ◔ fundación (6025a12); falta el wiring del endpoint |
| G4 | Safe 2-de-3 real creado, auditado, codehash/singleton pineado, handoffs ACEPTADOS en los 7 | Anthony | ✗ no existe |
| G5 | API key de Hermes/Pyth provisionada (antes 2026-08-18) | Anthony | ✗ pendiente |
| G6 | Canario V2 en Sepolia corrido + soak 24-48h limpio | Claude/Anthony | ✗ no corrido |
| G7 | `check:mainnet:predeploy` de Codex en verde (Safe, roles, quórum, manifiesto por recibos, sin escritores legacy) | Codex | ✗ hoy marca los bloqueos correctamente |
| G8 | Los 2 Pyth canónicos de mainnet vivos (verificado on-chain 2026-08-14: ambos con código) | — | ✅ |

**Hoy:** NO-GO. G1(parcial), G3(parcial), G4, G5, G6, G7 abiertas.

---

## 1. Secuencia ejecutable (en orden; cada paso bloquea al siguiente)

### Fase A — Contratos en Base mainnet (tras G1/G4/G5)
1. **Crear + auditar + pinear el Safe** (runbook `safe-setup-runbook.md`):
   `OWNER_SAFE_ADDRESS/CODEHASH/SINGLETON`. Ensayo previo del handoff en Sepolia.
2. **Dry-run** de `DeployBase.s.sol` en 8453 (sin broadcast):
   `post-deploy assertions: ALL PASSED`. El gate de Pyth exige el set canónico
   (upgraded activa `0xbC16…`, current fallback `0x8250…`).
3. **Broadcast firmado por Anthony** (`--broadcast --verify --interactives 1`).
   Propone el handoff two-step a los 7 contratos en la misma tx.
4. **Reconciliar manifiesto** con el reconciliador de recibos de Codex
   (`finalize:base-manifest --chain-id=8453`) — NUNCA editar `8453.json` a mano.
   Exige status=1 en los 7 recibos y direcciones coincidentes.
5. **Safe acepta los 7 `acceptOwnership()`** (batch en Transaction Builder,
   2 firmas). `VerifyBaseDeployment` en 8453 SOLO pasa con ownership ACEPTADO
   y `pendingOwner == 0`.

### Fase B — Backend apuntado a Base, aún NO en vivo
6. **Poblar `BASE.contracts`** en `api/_lib/chains.ts` + `src/config/chains.ts`
   con las 7 direcciones del manifiesto (V2 en el slot de TrackRecord).
7. **Cargar las vars de Vercel** desde `8453.json` (7 direcciones + treasury +
   recorder + `OWNER_SAFE_*` + `PYTH_HERMES_API_KEY` como Sensitive) en
   Production. Derivadas del manifiesto, no a mano.
8. **Wiring del endpoint V2** (G3): `xlayer-record` chain-aware — usa las firmas
   v1 cuando `PROTOCOL_CHAIN` es X Layer, y las V2 (payable + updates Pyth +
   `declaredMode`) cuando es Base, importando `api/_lib/trackrecord-v2.ts`.
   Migrar los 4 lectores (matar el selector `0x6f61e432` → getVerifiedWinRate/
   getAttestedWinRate). **Clave:** con `PROTOCOL_CHAIN` aún en X Layer, este
   código nuevo NO se activa — producción sigue en v1, sin cambios.
9. **Deploy a Vercel** de este build (SIN flip): producción sigue leyendo/
   escribiendo X Layer porque `PROTOCOL_CHAIN` no ha cambiado. El guard se
   activa solo al redeploy — verificado por el patrón del lote de seguridad.

### Fase C — El flip (un solo cambio, reversible)
10. **Congelar escrituras** durante el corte (`PROTOCOL_CUTOVER_FREEZE=true` de
    Codex): pausa crons de trading y la cuenta live de Bobby.
11. **Snapshot final del estado X Layer** para el archivo (ver §2).
12. **`PROTOCOL_CHAIN=base`** en Vercel Production + redeploy. Este es EL flip.
    A partir de aquí producción lee/escribe Base mainnet con V2.
13. **Descongelar** (`PROTOCOL_CUTOVER_FREEZE=false`).

### Fase D — Verificación post-flip
14. Smoke del API contra Base: `/api/bobby-protocol-stats` devuelve chain 8453,
    `getVerifiedScorecard` responde, direcciones = manifiesto.
15. Ciclo V2 real chico (commit VERIFIED → resolve) con evidencia Pyth.
16. Los 7 contratos verificados en Basescan.
17. Vigilar 24h.

---

## 2. Preservación del historial de X Layer (archivo de solo-lectura)

**No se borra nada.** El cutover quita rutas de *ejecución*, conserva la
*evidencia*:
- Las filas Supabase `chain=196` se **conservan**, marcadas `legacy (X Layer)`.
- Las páginas de proof / evidencia / submission de X Layer se **conservan**,
  reetiquetadas "Legacy (X Layer)" — Codex ya reencuadró esto en el sitio.
- Los 7 contratos de X Layer quedan vivos on-chain (inmutables); dejan de
  recibir escrituras nuevas al flipear `PROTOCOL_CHAIN`.
- Los lectores pueden seguir mostrando el historial de X Layer vía
  `getChain(196)` explícito; solo `DEFAULT_CHAIN` deja de ser X Layer.
- **Exportar un snapshot inmutable** del track record de X Layer (win rate,
  2,038 commitments, wins/losses) a JSON versionado en el repo antes del flip —
  el proof no depende de que el RPC de X Layer siga respondiendo para siempre.

---

## 3. Rollback (el flip es reversible)

Si el smoke post-flip (Fase D) falla:
1. `PROTOCOL_CHAIN` de vuelta a unset (X Layer) o `base-sepolia` + redeploy.
2. Producción vuelve a X Layer v1 en un redeploy — sin pérdida de datos (X Layer
   nunca se tocó; sus contratos y filas siguen intactos).
3. Diagnosticar en Sepolia, no en mainnet.

**Irreversible de verdad** solo: el deploy de contratos a mainnet (gastó gas) y
las escrituras V2 ya minadas. El *flip de config* NO — por eso el latch
`PROTOCOL_CHAIN` es la red de seguridad.

---

## 4. Reparto

- **Claude (contratos):** G1 (3 rondas sobre V2), G2 (hecho), G3 (fundación
  hecha; wiring del endpoint pendiente de coordinación), snapshot del archivo,
  poblar `BASE.contracts`.
- **Codex (release/chain):** G7, el freeze, el reconciliador de manifiesto, los
  latches de escritura fail-closed, las vars de Vercel, el redeploy y el flip
  operativo.
- **Anthony (humano):** G4 (Safe + firmas), G5 (Hermes key), la firma del
  broadcast, y el "go" del flip.

Nada de esto ocurre hoy. La primera compuerta accionable es el canario V2 de
Sepolia (G6), que a su vez necesita G5 (Hermes key). El flip es el último paso,
no el primero.
