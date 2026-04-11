# OKLink Verification — BobbyAdversarialBounties

**Status: ✅ Verified on 2026-04-12** via the OKLink UI (single-file flatten).
Public source: https://www.oklink.com/xlayer/address/0xa8005ab465a0e02cb14824cd0e7630391fba673d

Foundry auto-verify does not work for X Layer today: Sourcify rejects
chain 196, and Etherscan V2 does not list X Layer in its 66-chain set
(checked 2026-04-12). The OKLink Etherscan-compatible API works but
needs an `Ok-Access-Key`. Until that key is in `.env.local`, re-verify
manually using the steps below.

## Facts

| Field                 | Value                                                      |
|-----------------------|------------------------------------------------------------|
| Contract address      | `0xa8005ab465A0E02CB14824cD0e7630391Fba673d`               |
| Chain                 | X Layer mainnet (196)                                      |
| Source entry point    | `src/BobbyAdversarialBounties.sol`                         |
| Compiler              | `v0.8.19+commit.7dd6d404`                                  |
| Optimizer             | **Disabled** (foundry.toml has no optimizer block → off)   |
| EVM version           | `paris` (Foundry default for 0.8.19)                       |
| Via IR                | No                                                         |
| Verified at           | 2026-04-12 via OKLink UI (single file flatten)             |
| License               | MIT                                                         |
| Constructor arg (raw) | `0xc27Bf54D67165d1C81E3a39B4Dec7DD7F82137e0` (resolver)    |
| Constructor ABI-encoded | `0x000000000000000000000000c27bf54d67165d1c81e3a39b4dec7dd7f82137e0` |

## Steps

1. Open the contract page:
   https://www.oklink.com/xlayer/address/0xa8005ab465a0e02cb14824cd0e7630391fba673d
2. Click **Verify and Publish**.
3. Select:
   - Compiler type: **Single file**
   - Compiler version: `v0.8.19+commit.7dd6d404`
   - License: **MIT**
4. Paste the entire contents of
   [`BobbyAdversarialBounties.flat.sol`](./BobbyAdversarialBounties.flat.sol)
   into the source code box.
5. Optimization: **No**. This is the non-obvious gotcha — `foundry.toml`
   has no `optimizer = true` line, so Foundry compiled this contract with
   the optimizer **off**. Setting it to "Yes" on OKLink will recompile
   with optimizer on and produce a non-matching bytecode, and verification
   will fail with "El resultado de la compilación... no coincide".
   The `runs` value is irrelevant when optimizer is off.
6. EVM version: **paris**.
7. License: **MIT License (MIT)**.
8. Constructor arguments (ABI-encoded, no `0x` prefix):
   ```
   000000000000000000000000c27bf54d67165d1c81e3a39b4dec7dd7f82137e0
   ```
9. Submit.

## If it fails

OKLink sometimes mismatches on metadata hashes produced by newer Foundry
versions. Two things to try:

- Re-flatten with the exact compiler you deployed with
  (`forge --version` at deploy time vs now).
- Rebuild with `forge build --use 0.8.19` and upload the
  `contracts/out/BobbyAdversarialBounties.sol/BobbyAdversarialBounties.json`
  `metadata` field instead — OKLink accepts the standard JSON input flow.

## Future automation

Once we have an `OKLINK_API_KEY`, automate with:

```bash
forge verify-contract \
  0xa8005ab465a0e02cb14824cd0e7630391fba673d \
  src/BobbyAdversarialBounties.sol:BobbyAdversarialBounties \
  --chain-id 196 \
  --verifier etherscan \
  --verifier-url "https://www.oklink.com/api/v5/explorer/xlayer/api" \
  --etherscan-api-key "$OKLINK_API_KEY" \
  --constructor-args 0x000000000000000000000000c27bf54d67165d1c81e3a39b4dec7dd7f82137e0 \
  --compiler-version v0.8.19+commit.7dd6d404
```
