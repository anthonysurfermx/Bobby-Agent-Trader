# Cutover X Layer → Base — secuencia ejecutable

**Decisión:** mover la ejecución del protocolo a Base y preservar X Layer como
archivo de solo lectura. El corte no migra ni reescribe evidencia histórica.

**Estado al 2026-08-15:** **NO-GO**. Este documento prepara el procedimiento;
no autoriza un deploy, una firma ni un cambio en Vercel.

El selector de backend vive en `api/_lib/chains.ts`. Cambiar
`PROTOCOL_CHAIN=base` selecciona Base para las lecturas, pero **no autoriza
escrituras por sí solo**. Base mainnet requiere además:

```text
PROTOCOL_WRITES_ENABLED=true
PROTOCOL_WRITE_CHAIN_ID=8453
BASE_RECORDER_KEY=<clave exclusiva de Base>
PROTOCOL_CUTOVER_FREEZE=false
```

Durante el corte, `PROTOCOL_CUTOVER_FREEZE=true` bloquea los escritores del
backend candidato, los generadores legacy, los ciclos live y las mutaciones de
la cuenta OKX de Bobby. **No congela por sí solo** wallets directas,
deployments viejos, requests ya en vuelo, crons externos ni webhooks. La
separación entre selección de chain, latch de escritura y freeze es deliberada,
pero el silencio real de X Layer requiere los controles operativos de la fase D.

## 0. Compuertas duras

| # | Compuerta | Estado actual | Salida exigida |
|---|---|---|---|
| G1 | TrackRecordV2, ABI y layout revisados | Código completo | El bytecode desplegado debe corresponder al artefacto congelado; cualquier cambio reabre revisión |
| G2 | Deploy/Verify V2 + Pyth canónico | Completo | Dry-run y verificación live pasan con el mismo SHA |
| G3 | Adaptador backend V1/V2 + Hermes | Código completo, canario pendiente | 53/53 checks y ciclos VERIFIED/ATTESTED reales en Sepolia |
| G4 | Safe real 2-de-3 | **Pendiente humano** | Owners, threshold, singleton, codehash, módulos/guard y siete handoffs aceptados |
| G5 | Acceso Hermes/Pyth | **Pendiente humano** | `PYTH_HERMES_API_KEY` funciona desde el runtime de producción sin exponerse |
| G6 | Canario Base Sepolia | **Pendiente** | Ciclo completo y soak de 24–48 h sobre el artefacto final |
| G7 | Checker de configuración mainnet | Tooling integrado; hoy da NO-GO | `predeploy`, `postdeploy`, `canary` y `cutover` verdes con Pyth oficial, Hermes, ledger de claims y evidencia live; su GO no autoriza el lanzamiento |
| G8 | Pyth oficial en Base | Verificado on-chain el 2026-08-14 | Upgraded activa `0xbC16…72F5`, current fallback `0x8250…487a` |
| G9 | Watcher histórico de stop breach | **Pendiente** | Escanea la ventana completa antes de publicar/finalizar un WIN |
| G10 | Funding acotado de deploy | **Pendiente humano** | Deployer financiado solo para gas aprobado + reserva acotada |
| G11 | X Layer quieto + archivo final | **Pendiente** | Productores retirados, cola drenada, período quieto probado, snapshot verificado y digest anclado |

No hay lanzamiento con una G pendiente. El estado detallado y los números de
prueba viven en `docs/release-readiness.md`.

## 1. Secuencia ejecutable

### Fase A — congelar y ensayar

1. Congelar SHA, artefactos, ABI y layout. Activar
   `PROTOCOL_CUTOVER_FREEZE=true`.
2. Cerrar G4, G5 y G9.
3. Desplegar el SHA exacto en Base Sepolia, aceptar ownership desde el Safe
   espejo y ejecutar el runbook del canario V2.
4. Reiniciar el reloj de soak si cambia contrato, constructor, adaptador,
   configuración Pyth o watcher.
5. Ejecutar `npm run check:mainnet:predeploy`. Un NO-GO detiene la secuencia.

### Fase B — desplegar contratos en Base mainnet

6. Simular `DeployBase.s.sol` en 8453 sin broadcast y revisar roles, fees,
   direcciones derivadas, Pyth y Safe con una segunda persona.
7. Anthony ejecuta el único broadcast con signer interactivo/hardware. Si una
   transacción falla, detenerse y enumerar recibos; no reintentar a ciegas.
8. Reconstruir `contracts/deployments/8453.json` desde transacciones y recibos:

   ```bash
   npm run finalize:base-manifest -- --chain-id=8453 --write
   npm run finalize:base-manifest -- --chain-id=8453
   ```

9. Generar y revisar el batch de siete `acceptOwnership()`; firmarlo 2-de-3:

   ```bash
   npm run build:safe-launch-batch -- --action=accept --chain-id=8453
   ```

10. Ejecutar `VerifyBaseDeployment`, verificar código/constructor en Basescan y
    correr `npm run check:mainnet:postdeploy`.

### Fase C — preparar backend sin escrituras

11. Cargar en Production las siete direcciones `BASE_*`,
    `BASE_PROTOCOL_DEPLOYMENT_BLOCK`, treasury, pins del Safe, secretos
    dedicados y `PYTH_HERMES_API_KEY`. Los valores públicos se derivan del
    manifiesto; las claves nunca entran al repo.
12. Desplegar primero en modo lectura:

    ```text
    PROTOCOL_CHAIN=base
    PROTOCOL_WRITES_ENABLED=false
    PROTOCOL_CUTOVER_FREEZE=true
    ```

13. Confirmar que `/api/xlayer-record` y la telemetría reportan chain `8453`,
    direcciones del manifiesto y scorecards VERIFIED/ATTESTED separados. El
    adaptador está en `api/_lib/track-record-v2.ts`.

### Fase D — apagar X Layer sin split-brain

14. Mantener `PROTOCOL_CUTOVER_FREEZE=true` y retirar **todos** los productores
    legacy: deshabilitar crons y webhooks en Vercel/GitHub/terceros, detener bots
    y workers, y bloquear acceso a deployments/aliases viejos.
15. Revocar de los deployments viejos los secretos de recorder, trading y
    automatización. Pausar el contrato o revocar el writer on-chain cuando el
    contrato y la política de rollback lo permitan; si no, retirar la clave de
    todos los runtimes y documentar esa limitación.
16. Drenar requests, jobs, transacciones y nonces en vuelo. Esperar al menos dos
    intervalos del productor más lento más la profundidad de confirmación del
    snapshot. Probar con logs y nonce del recorder que no hubo escrituras en
    toda la ventana. Cualquier escritura reinicia el período quieto.
17. Capturar el estado final desde un bloque confirmado posterior a la última
    escritura. Para el artefacto preferido, usar un RPC de archivo con eventos:

    ```bash
    npm run export:xlayer-track-record -- \
      --confirmations=64 \
      --include-events \
      --write

    npm run export:xlayer-track-record -- \
      --verify=docs/archive/xlayer-track-record-<BLOCK>.json
    ```

    El RPC nunca se guarda en el JSON. URLs potencialmente credential-bearing
    son rechazadas antes de escribir. Si no se pueden recuperar los eventos,
    el snapshot state-only solo puede ser final si su digest, bloque/hash y la
    excepción quedan anclados en una atestación firmada o transacción del Safe.
18. Publicar/anclar el SHA-256 fuera del repo y volver a verificar el archivo.
    No eliminar todavía los controles legacy: permanecerán retirados después
    de activar Base.

### Fase E — ejecutar el canario y armar Base

19. Con producción apuntando a Base en modo lectura, mantener
    `PROTOCOL_WRITES_ENABLED=false`, `PROTOCOL_WRITE_CHAIN_ID=8453` y
    `PROTOCOL_CUTOVER_FREEZE=true`. Ejecutar:

    ```bash
    npm run check:mainnet:canary
    ```

20. Verificar que una llamada autenticada del backend recibe 503 por freeze.
    Fuera del backend congelado, enviar un canario directo y acotado desde el
    recorder revisado: commit VERIFIED → receipt → lectura pública →
    resolve. Esperar al menos 12 confirmaciones y guardar ambos hashes.
21. Preparar, sin promoverla, la configuración objetivo con
    `PROTOCOL_WRITES_ENABLED=true`, `PROTOCOL_WRITE_CHAIN_ID=8453`,
    `PROTOCOL_CUTOVER_FREEZE=false`, `BASE_RECORDER_KEY` dedicado y los hashes
    `BASE_CANARY_COMMIT_TX_HASH`/`BASE_CANARY_RESOLVE_TX_HASH`. Ejecutar
    `npm run check:mainnet:cutover` contra esa configuración exacta.
22. Tratar la salida del checker como **GO de configuración únicamente**. El GO
    humano de lanzamiento exige evidencia separada de G1–G11: Hermes, soak,
    watcher, Safe, funding, archivo/digest y período quieto.
23. Tras el GO humano, promover una sola vez la configuración objetivo exacta.
    Confirmar un ciclo live acotado antes de habilitar los crons de Base y
    vigilar receipts, errores Hermes, nonces, balance del recorder y stop
    breaches durante 24 h.

## 2. Archivo verificable de X Layer

Los contratos y filas `chain=196` permanecen intactos y se etiquetan como
`Legacy (X Layer)`. No se mezclan con el scorecard VERIFIED de Base.

Un JSON versionado no es “inmutable” por sí mismo. El exportador genera un
artefacto **content-addressed** con:

- chain id `196`, proveedor RPC saneado (nunca el endpoint), dirección del
  TrackRecord y código hash;
- bloque final, hash y timestamp fijados;
- política de selección (`finalized` o profundidad de confirmación);
- deployment block y totales on-chain;
- todos los commitments y trades por índice, incluidos símbolos;
- metadatos de eventos con `--include-events` cuando se use un RPC de archivo;
  IDs y totales se validan antes de publicar;
- un `.sha256` adyacente calculado sobre los bytes exactos del JSON.

El formato v2 elimina timestamps de ejecución y permite regenerar el mismo
digest para el mismo bloque y contenido. `--verify` valida primero el sidecar y
después vuelve a leer el bloque fijado. El hash se publica en las notas firmadas
del release o se ancla con el Safe. Sin ese anclaje externo, SHA-256 detecta
cambios posteriores pero no demuestra por sí solo el origen on-chain.

## 3. Rollback y prevención de split-brain

Ante un fallo post-cutover:

1. restaurar `PROTOCOL_CUTOVER_FREEZE=true` y
   `PROTOCOL_WRITES_ENABLED=false`;
2. pausar desde el Safe cuando aplique;
3. conservar recibos y logs y revertir el alias web a una versión de solo
   lectura;
4. diagnosticar y repetir en Sepolia.

No se reactivan automáticamente escritores de X Layer después de que exista
historial V2 en Base: eso crearía dos libros activos. Volver temporalmente a
lecturas legacy puede ser reversible; reanudar escrituras en chain 196 requiere
una decisión de incidente explícita. Antes de cualquier rollback se vuelve a
congelar Base, se drenan sus operaciones y se prueba que solo una chain puede
recibir escrituras; nunca se usan ambas como fallback simultáneo.

## 4. Responsabilidades

- **Contratos/revisión:** preservar el artefacto congelado y validar que el
  deploy coincide byte por byte.
- **Release engineering:** checker, freeze global, manifiesto por recibos,
  snapshot, configuración y observabilidad.
- **Anthony:** Safe, secretos, funding, firmas del broadcast y GO final.

La siguiente compuerta accionable es G4/G5, seguida inmediatamente por el
canario V2 de Sepolia. El flip de producción es el último paso.
