# Handoff runbook — pasar el V2 canary al Safe 2-de-3 (Base Sepolia)

**Estado 2026-08-19:** Safe canary creado y validado
(`0x8BE60853F27b944e11486285d95c3e06596553b4`, 6/6 del gate). El V2 canary
vivo (`0x4bfEF46d920fd67C68046901f591Fad0a2F7cadC`) tiene owner = deployer
(`0x821990…7302`), pendingOwner vacío. Usa Ownable de 2 pasos.

## Paso 1 — el DEPLOYER firma transferOwnership(Safe)
La firma la hace quien controla la deployer EOA `0x8219…7302` (Wallet A).
Es una tx normal, no pasa por el Safe:

- **to:** `0x4bfEF46d920fd67C68046901f591Fad0a2F7cadC`
- **data:** `0xf2fde38b0000000000000000000000008be60853f27b944e11486285d95c3e06596553b4`
- (equivale a `transferOwnership(0x8BE6…53b4)`)

Con cast: 
```
cast send 0x4bfEF46d920fd67C68046901f591Fad0a2F7cadC \
  "transferOwnership(address)" 0x8BE60853F27b944e11486285d95c3e06596553b4 \
  --rpc-url https://base-sepolia-rpc.publicnode.com --interactive
```
Tras esto: `pendingOwner == Safe`.

## Paso 2 — el SAFE (2-de-3) acepta
Cargar el batch `artifacts/safe/v2-canary-accept-ownership.json` en el
Transaction Builder de app.safe.global (con el Safe canary abierto), proponer,
y firmar con 2 de los 3 owners (B / C / G). Ejecuta `acceptOwnership()`.
Tras esto: `owner == Safe`, `pendingOwner == 0`. Handoff cerrado.

## Paso 3 — verificar
```
cast call 0x4bfEF46d920fd67C68046901f591Fad0a2F7cadC "owner()(address)" \
  --rpc-url https://base-sepolia-rpc.publicnode.com
# debe devolver 0x8BE60853F27b944e11486285d95c3e06596553b4
```

## Notas
- El canary lo desplegó Codex como UN contrato (no el set de 7 del manifest
  `84532.json`, que es un deploy anterior con trackRecord `0xE23c8E…`).
- Ambos pasos cambian estado on-chain y requieren llaves — Anthony/Codex los
  firman. El agente NO firma ni transmite (regla de la casa).
- Pinning ya derivado en `safe-canary-state.md` (OWNER_SAFE_*). Para MAINNET
  se repite todo con el Safe de 8453.
