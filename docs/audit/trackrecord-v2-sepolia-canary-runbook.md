# Runbook — Canario TrackRecordV2 en Base Sepolia (84532)

**Objetivo:** desplegar el set completo con **BobbyTrackRecordV2** en Sepolia,
correr un ciclo canario que ejercite la ruta VERIFIED (commit→resolve→challenge)
con evidencia Pyth REAL, y dejarlo en soak 24h. Es el prerrequisito del NO-GO #3
de mainnet ("redeploy Sepolia + canario 24h").

**Estado del código:** `feat/trackrecord-v2` — 208/208 tests, viaIR 23,499 B
(margen 1,077), P1 externo cerrado, layout gate en CI. Dry-run V2 en Sepolia:
`post-deploy assertions: ALL PASSED`.

**Regla de la casa:** el broadcast (paso 2) lo firma Anthony. El agente prepara,
verifica y documenta; no firma ni promueve nada.

---

## 0. Diferencias vs el canario r10.2 (no-V2)

| | r10.2 | Este (V2) |
|---|---|---|
| Contrato TrackRecord | `BobbyTrackRecord` (1 arg) | `BobbyTrackRecordV2` (5 args) |
| Oráculo | ninguno | **Pyth canónico por chainId** (Sepolia: 1 dirección; mainnet: upgraded+fallback) |
| Env nuevas | — | `V2_*` params (opcionales, tienen defaults auditados) |
| Ciclo canario | commit→resolve WIN/LOSS | + **verificación de precio con update firmado de Hermes** + **challenge de stop-breach** |
| Feeds | — | BTC/ETH/SOL sembrados en el constructor |

El gate de Pyth (`PythOracleGate.sol`) exige el set canónico exacto: en Sepolia
es `0xA2aa501b19aff244D90cc15a4Cf739D2725B5729` (1 dirección — el requisito de
≥2 con fallback es SOLO mainnet). Feeds pineados en la librería.

## 1. Direcciones que Anthony define (roles — ninguna vive en el repo)

Igual que el runbook r10.2. En Sepolia los roles económicos pueden colapsar a
`BOBBY_ADDRESS`, PERO el escrow exige cio/arbiter/keeper/resolver distintos:

| Variable | Rol |
|---|---|
| `--account` / firmante | Owner inicial de los 7. Con ETH de Sepolia |
| `BOBBY_ADDRESS` | Recorder (el backend/canario que comitea) |
| `CIO_ADDRESS` `ARBITER_ADDRESS` `KEEPER_ADDRESS` `RESOLVER_ADDRESS` | 4 distintas entre sí, del firmante y del keeper |
| `RESOLVER_ADDRESSES` | quórum HardnessRegistry `0xR1,0xR2,0xR3` |
| `RESOLVER_THRESHOLD` | `2` |
| `BASESCAN_API_KEY` | verificación (export en shell, nunca a git) |

`OWNER_SAFE_*` NO aplica en Sepolia (opcional; default = firmante, sin handoff).
`V2_*` params: omitir para usar los defaults auditados (maxExitLag 600, challenge
7d, tolerances 100 bps, conf 50 bps).

## 2. Paso 1 — Dry-run (sin broadcast)

Usar el RPC sin rate-limit (`base_sepolia_publicnode`). El dry-run SOBREESCRIBE
`deployments/84532.json` con direcciones simuladas — restaurarlo después.

```bash
cd contracts && export BASESCAN_API_KEY=... && \
BOBBY_ADDRESS=0x... CIO_ADDRESS=0x... ARBITER_ADDRESS=0x... KEEPER_ADDRESS=0x... \
RESOLVER_ADDRESS=0xR1 RESOLVER_ADDRESSES=0xR1,0xR2,0xR3 RESOLVER_THRESHOLD=2 \
forge script script/DeployBase.s.sol --rpc-url base_sepolia_publicnode --sender 0xFIRMANTE
```

Éxito = `post-deploy assertions: ALL PASSED` + `manifest written: deployments/84532.json`.
Los asserts nuevos de V2 confirman: `activePyth == canonical`, fallback aprobado,
y los 3 feeds sembrados. Luego:

```bash
git checkout HEAD -- deployments/84532.json      # descartar manifiesto simulado
rm -rf broadcast/DeployBase.s.sol/84532/dry-run cache/DeployBase.s.sol
```

## 3. Paso 2 — Broadcast (Anthony firma — SOLO Anthony)

Mismo comando + `--broadcast --verify --interactives 1 --account <keystore>`.
Tras el broadcast, `deployments/84532.json` queda con las direcciones REALES
minadas (ese sí se commitea). Si el frente de Codex ya tiene el reconciliador de
manifiesto (`finalize:base-manifest`), usarlo en vez de editar a mano.

## 4. Paso 3 — Verificación de lo minado (Claude)

```bash
cd contracts && forge script script/VerifyBaseDeployment.s.sol --rpc-url base_sepolia_publicnode
```

Éxito = `LIVE VERIFICATION PASSED`. Incluye los checks nuevos de V2 (activePyth,
fallback aprobado, feeds sembrados) contra estado minado.

## 5. Paso 4 — Ciclo canario VERIFIED (evidencia Pyth real)

El flujo VERIFIED necesita un update firmado de Hermes por extremo. Mientras el
endpoint público siga abierto (**hasta 2026-08-18**; después requiere API key),
se puede hacer manual. Para BTC (feed `0xe62df6c8…415b43`):

```bash
# update firmado más reciente (borde inferior de la ventana de entry)
TS=$(( $(date +%s) - 5 ))
curl -s "https://hermes.pyth.network/v2/updates/price/$TS?ids[]=0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43&encoding=hex" \
  | python3 -c "import json,sys; d=json.load(sys.stdin); print('0x'+d['binary']['data'][0]); print(d['parsed'][0]['price'])"
```

Secuencia a ejercer (por el backend o `cast send` firmado por el recorder):
1. **commit VERIFIED** BTC: `commitTrade(hash, "BTC", agent, conv, entryPx,
   targetPx, stopPx, 1 /*VERIFIED*/, [entryUpdate])` con `value = getUpdateFee`
   (10 wei en Sepolia). `entryPx` dentro de 100 bps del precio del update;
   `stopPx` estrictamente del lado de pérdida (long: stop < entry Y stop <
   precio oráculo). Un `ModeMismatch` o `InvalidDirection` aquí es señal de
   config mal armada, no del contrato.
2. **resolve** tras `minResolveAt` (1h): `resolveTrade(hash, pnlBps, result,
   exitPx, exitAt, [exitUpdate])`. `exitAt` reciente (≤ maxExitLag 600s de now).
3. **challenge** (opcional pero recomendado — es la feature nueva): con un
   trade VERIFIED resuelto WIN, `challengeStopBreach(hash, anchorTs,
   [breachUpdate])` presentando un tick que cruce el stop; debe reclasificar a
   LOSS. Un tick que NO cruce, o que sea ganancia vs el oráculo, debe revertir
   `NoBreach`.
4. Repetir para ETH y SOL (los 3 feeds verified).
5. Un trade **ATTESTED** (símbolo sin feed, p.ej. "OKB") para confirmar que la
   ruta v1 sigue viva y que las stats NO se cruzan (D-1).

**Gas de referencia (medido):** commit VERIFIED ~0.4–0.5M, resolve VERIFIED
~0.5–0.6M, challenge ~0.6M, fee Pyth ~10 wei/update en Sepolia. Todo < $0.01.

## 6. Paso 5 — Verificación de estado + soak 24–48h

Leer y confirmar coherencia (D-1):
```bash
cast call <trackRecordV2> "getVerifiedScorecard()(uint256,uint256,uint256,uint256,uint256,uint256)" --rpc-url base_sepolia_publicnode
cast call <trackRecordV2> "getCoverage(uint8)(uint256,uint256,uint256)" 1 --rpc-url base_sepolia_publicnode  # VERIFIED
cast call <trackRecordV2> "getAttestedWinRate()(uint256)" --rpc-url base_sepolia_publicnode
```
- El scorecard debe traer win rate + coverage + `resolutionBps` juntos.
- VERIFIED y ATTESTED nunca se suman.
- Un challenge exitoso mueve un WIN a LOSS en el bucket VERIFIED.

Dejar el canario 24–48h. Vigilar (bugs que el canario cazó históricamente):
carrera de nonces, gas fijo (out-of-gas en payable), shim de chain a medias,
y ahora: fetch de Hermes fallando (reintentar, nunca degradar a ATTESTED).

## 7. No hacer

- No usar direcciones ficticias en el dry-run real.
- No presentar el canario como track record inmanipulable de mainnet — es
  Sepolia; el claim vive tras el Safe + canario mainnet.
- No reutilizar estas addresses/params para mainnet sin nueva aprobación.
- No cablear el backend de producción a este deploy — es canario.

## 8. Bloqueantes de mainnet que este canario NO cubre

Safe 2-de-3 real (+ pin codehash/singleton), los 2 Pyth canónicos de mainnet
(el gate ya los exige), recorte de tolerances con basis real, y el handoff
ACEPTADO de los 7 contratos. Ver `safe-setup-runbook.md` y el frente de Codex.
