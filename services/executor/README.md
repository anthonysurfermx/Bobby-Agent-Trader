# Bobby Executor (Fly.io)

Reemplaza el droplet borrado de Digital Ocean. Servicio de ejecución en **Base (8453)**.
Contrato HTTP compatible con el anterior: `POST /api/base` con `{ action, params }`.

## Seguridad (por diseño)
- **Bearer token obligatorio** (`EXECUTOR_TOKEN`) — el proceso no arranca sin él.
- **Allowlist de actions**: `status`, `quote` (Uniswap v3 QuoterV2 real). `swap` existe pero
  está **deshabilitado** hasta que Anthony provisione la signing key y la capa de política
  (cap por trade, cap diario, allowlist de pares).
- Sin passthrough de params arbitrarios; body limitado a 64kb.

## Deploy (lo ejecuta Anthony — requiere cuenta Fly)
```bash
brew install flyctl
```
```bash
fly auth login
```
```bash
cd services/executor && fly launch --no-deploy --copy-config
```
```bash
fly secrets set EXECUTOR_TOKEN=$(openssl rand -hex 32) BASE_RPC_URL=https://mainnet.base.org
```
```bash
fly deploy
```

## Conectar con Vercel
En Vercel, setear:
- `EXECUTOR_URL=https://bobby-executor.fly.dev`
- `EXECUTOR_TOKEN=<el mismo token>`

`api/chain-trade.ts` (ex `xlayer-trade.ts`) debe apuntar a `${EXECUTOR_URL}/api/base`
con header `Authorization: Bearer ${EXECUTOR_TOKEN}`.

## Probar
```bash
curl -s https://bobby-executor.fly.dev/health
```
```bash
curl -s -X POST https://bobby-executor.fly.dev/api/base -H "Authorization: Bearer $EXECUTOR_TOKEN" -H "Content-Type: application/json" -d '{"action":"quote","params":{"from":"ETH","to":"USDC","amount":"0.1"}}'
```
