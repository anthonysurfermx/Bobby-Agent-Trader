# Respuesta al red-team de Codex (NO-GO 2026-08-21) — estado de cada punto

Brief: `.ai/briefs/2026-08-21_codex-mainnet-launch-review.md`

## P0 — CERRADOS con evidencia reproducible

### P0-1 ESCROW_MAX_SIZE_USD mal escalado → CERRADO
- Template corregido a `10000000000000000000000` (1e22 = $10k en 18dp).
- Checker endurecido: valida escala (>= 1e18 = $1 mínimo), no solo formato.
- Probado ambos sentidos: `10000` crudo → `invalid format` (NO-GO);
  `1e22` → ok. El default del script (10_000e18) siempre fue correcto —
  el bug era el env crudo pisándolo.

### P0-2 freeze no bloqueaba escrituras → CERRADO
- `PROTOCOL_CUTOVER_FREEZE` integrado a `evaluateProtocolWriteSafety`
  (guard común) — bloquea TODOS los escritores Base-family, no solo
  bobby-cycle.
- Reproducido el escenario exacto de Codex (writes on + chain + key +
  freeze on): antes `{"ok":true,"blockers":[]}`, ahora
  `{"ok":false,"blockers":["PROTOCOL_CUTOVER_FREEZE is active…"]}`.
- Caso normal (freeze off) intacto.
- Test de ejecución: `xlayer-record` → `requireProtocolWriteSafety` →
  guard → **503** cuando bloquea (cadena verificada en código).
- Template: `PROTOCOL_WRITES_ENABLED=false` durante deploy/handoff.

## P1 — plan de cierre (pre-broadcast)
1. **Separar llaves**: deployer = hardware temporal de Anthony (nueva);
   recorder = hot dedicada NUEVA de alcance mínimo (rotable vía setBobby()
   desde el Safe). La 0xC3F8 (nonce 37) queda descartada para ambos roles
   o degradada a solo-gas. → DECISIÓN DE ANTHONY.
2. **SHA operativo único**: congelar release completo (contratos 11532f4 +
   recorder retry + snapshot) en un tag; verificar bytecode idéntico.
3. **Tamaño real**: re-medir BobbyTrackRecordV2 con el toolchain congelado
   (Codex midió 24,094 B = 482 de margen EIP-170); pin de solc/optimizer/
   foundry.toml en el tag.
4. **Recorder endpoint hardening**: rate limit, idempotencia, mutex de
   nonce, límite de gasto, circuit breaker — ANTES de abrir writes (no
   bloquea el broadcast, sí la apertura de producción).
5. **Scorer explícito** en env (hecho en template).
6. **Fondeo**: re-estimar gas inmediatamente antes de firmar (presupuesto
   en ETH, no equivalencia USD).

## P2 — aceptados y documentados
- ALPHA/RED/CIO = owners del Safe: concentración de gobernanza/fees
  aceptada conscientemente en esta etapa; revisar al crecer.
- E/F en doble rol (resolver/arbiter + quórum Hardness): buscar un
  resolver externo post-lanzamiento.
- Confianza en la gobernanza del proxy de Pyth: inherente al diseño.

## Secuencia acordada para el GO
1. Anthony: deployer hardware nuevo + recorder hot nueva (direcciones).
2. Congelar SHA operativo + verificar bytecode + re-dry-run con las
   llaves nuevas y el env corregido.
3. Batch Safe preparado + 2 signers presentes.
4. Broadcast (writes=false, freeze=true) → handoff → runtime-bytecode
   verification de los 7 → canario mainnet (script controlado, NO el
   endpoint público) → soak 24-48h → recién ahí levantar freeze y writes.

## Cierre 2026-08-21 (segunda tanda) — listo para re-review
- **P1 llaves SEPARADAS ✅**: recorder DEDICADO `0xDf475D7D3e97c8988Fdff5AF7887403e4295F4EC`
  generado local, key en Vercel Production (sensitive, write-only), distinto de
  TODO (roles/Safe/treasury/deployer/quemada). Deployer `0xC3F8` separado del
  recorder. Dry-run final con la separación + escrow 1e22 = ALL PASSED.
  (Deployer no-hardware: decisión de Anthony, mitigada con writes=false +
  2 signers + batch listo en el handoff; se retira tras el handoff.)
- **P1 tamaño real ✅**: re-medido = 24,094 B runtime (482 margen EIP-170).
  Corregido el claim viejo (23,499) en la página pública /protocol/audits.
- **P1 SHA operativo congelado ✅**: tag `mainnet-launch-candidate-2026-08-21`
  (HEAD 8f0a591) — contratos 11532f4 + recorder retry + fixes Codex.
  Codehash del runtime artefacto: 0xac1b415cc015dd11… (24,094 B).
- **P1 scorer explícito ✅** en template.

## Queda para DESPUÉS del broadcast (no bloquea la firma)
- Verificación runtime-bytecode de los 7 contratos vs artefacto congelado
  (contemplando immutables) + registro de codehashes ANTES de abrir writes.
- Hardening del endpoint recorder (rate limit, idempotencia, mutex de nonce,
  circuit breaker) ANTES de levantar el freeze.

## Estado para el re-review de Codex
Los 2 P0 cerrados con evidencia. Llaves separadas. SHA congelado. Config final
validada en dry-run. Falta el re-review de Codex → GO → broadcast.
