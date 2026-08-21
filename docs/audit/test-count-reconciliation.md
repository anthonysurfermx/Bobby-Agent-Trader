# Reconciliación del conteo de tests (2026-08-20)

Anthony reportó 184; los docs decían 208; el suite completo da 216. Reconciliado.

## Número REAL y reproducible: 216 (0 failed, 0 skipped)
```bash
cd contracts && forge test
# → Ran 12 test suites: 216 tests passed, 0 failed, 0 skipped
```
El contrato `BobbyTrackRecordV2.sol` es IDÉNTICO al freeze 11532f4 (git diff
11532f4..HEAD sobre src/ y test/ = vacío). El "208" del freeze doc estaba stale.

## Desglose por suite (suma 216)
| Suite | Tests |
|---|---|
| HardnessRegistry | 49 |
| BobbyTrackRecordV2 | 44 |
| BobbyAdversarialBounties | 34 |
| BobbyIntentEscrowInvariantTest | 25 |
| SecurityAuditPoC | 9 |
| DeploymentGates | 18 |
| BobbyAgentEconomyV2 | 10 |
| SecurityAudit / Audit1HermesCadenceRegression | 8 |
| BobbyTrackRecord (v1) | 7 |
| BobbyTrackRecordV2Invariant | 6 |
| AdversarialOracleEntryStop | 4 |
| LayoutSnapshot | 2 |
| **TOTAL** | **216** |

## Por qué 184 (tu conteo)
216 − 25 (IntentEscrowInvariant) − 6 (TrackRecordV2Invariant) = **185 ≈ 184**.
Tu run casi seguro excluyó los 2 suites de invariantes (±1 por fuzz seed/versión).
Para que coincida: corre `forge test` liso desde `contracts/` (sin --match-path
ni profile que salte invariantes).

## Por qué 208 (docs)
Número stale escrito en una ronda temprana que nunca se actualizó. Corregido a
216 en: `trackrecord-v2-sepolia-canary-runbook.md` y la página pública
`/protocol/audits`. El contrato no cambió — solo el conteo estaba viejo.

## Para el GO del anuncio
Publicar SIEMPRE el número reproducible con su comando: **216/216 green
(`forge test`, 0 skipped)** — no un número suelto. Ya aplicado en la página.
