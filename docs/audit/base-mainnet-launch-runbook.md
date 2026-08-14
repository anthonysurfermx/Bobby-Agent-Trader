# Base mainnet launch runbook

**Target:** Monday, 2026-08-17
**Rule:** no single environment-variable change may both select Base and authorize writes.

This runbook covers release engineering only. Contract-level approval remains
blocked until the TrackRecordV2 audit closes and the final artifact is merged.

## Friday — freeze and prerequisites

1. Freeze the launch commit; every deploy, verification, preview and production
   artifact must point to the same SHA.
   Set `PROTOCOL_CUTOVER_FREEZE=true` so cron cannot execute live trades while
   chain state and backend configuration are changing.
2. Create and audit the Base Safe 2-of-3. Owners must be three independent keys;
   deployer, keeper and recorder are not Safe owners. Record the exact reviewed
   owner set in `OWNER_SAFE_OWNERS` as three comma-separated addresses.
3. Record the public Safe pins: `OWNER_SAFE_ADDRESS`, `OWNER_SAFE_CODEHASH`,
   `OWNER_SAFE_SINGLETON`.
4. Select seven operational role addresses and at least three unique Hardness
   resolvers with threshold at least two.
5. Create dedicated production values for `XLAYER_RECORD_SECRET`,
   `TRADING_API_SECRET` and `PROTOCOL_AUTOMATION_SECRET` before deploying this
   release. Keep the cutover freeze enabled; these secrets separate capabilities
   and must exist before old X Layer callers switch to the new auth policy.
6. Run the predeploy gate without printing secret values:

   ```bash
   npm run check:mainnet:predeploy
   ```

7. Rotate the branch-preview recorder key. Base Sepolia uses
   `BASE_SEPOLIA_RECORDER_KEY`; Base mainnet uses a different
   `BASE_RECORDER_KEY`. Never copy `BOBBY_RECORDER_KEY` into either. Remove the
   legacy key from Preview/Development and keep
   `ALLOW_NON_PROD_XLAYER_WRITES` unset or false.

## Saturday — exact Sepolia rehearsal

1. Merge the final audited contracts and deployment scripts into the frozen SHA.
2. Deploy the exact artifact to Base Sepolia with a mirror Safe.
3. Accept every two-step ownership handoff from the Safe.
4. Run `VerifyBaseDeployment` against live Sepolia state.
5. Load Sepolia addresses only into a branch-scoped preview. Arm writes with both:
   `PROTOCOL_WRITES_ENABLED=true` and `PROTOCOL_WRITE_CHAIN_ID=84532`.
6. Execute commit, resolve, expiry, challenge, fee and emergency-pause smoke tests.
7. Leave the canary running for at least 24 hours. Any redeploy resets the clock.

## Sunday — signed mainnet rehearsal

1. Run `DeployBase` against Base mainnet without `--broadcast` using the final
   environment and sender.
2. Review every simulated address, fee, role and Safe pin with a second person.
3. Archive the dry-run output and transaction plan. Confirm the deployer has only
   enough ETH for deployment plus a bounded reserve.
4. Confirm production has all Base address variable names prepared but keep
   `PROTOCOL_WRITES_ENABLED=false`.
5. Run the production build locally with production-scoped variables. Preview
   environments must not receive the Base recorder key.

## Monday — deploy, verify, then cut over

1. Broadcast once with an interactive hardware-backed signer. Never deploy from
   an API route or a server-held key.
2. If any transaction fails, stop. Do not rerun blindly: enumerate mined receipts
   and decide whether to continue the partial deployment or restart with a fresh
   manifest.
3. Reconcile Foundry's broadcast with live Base receipts, then commit the
   resulting manifest. Do not patch addresses, hashes or blocks by hand:

   ```bash
   npm run finalize:base-manifest -- --chain-id=8453 --write
   npm run finalize:base-manifest -- --chain-id=8453
   ```
4. Batch all ownership acceptances from the Safe with two signatures.
   Generate the exact seven-call payload from the finalized manifest and review
   every destination before importing/signing the generated Safe Transaction
   Builder JSON:

   ```bash
   npm run build:safe-launch-batch -- --action=accept --chain-id=8453
   ```
5. Run `VerifyBaseDeployment` against live Base state. Mainnet passes only when
   the Safe owns every contract and all pending owners are cleared.
6. Verify source on Basescan and independently compare runtime bytecode for all
   contracts.
7. Populate the seven `BASE_*_ADDRESS` variables and
   `BASE_PROTOCOL_DEPLOYMENT_BLOCK` from the manifest, never by hand.
8. Run the postdeploy gate:

   ```bash
   npm run check:mainnet:postdeploy
   ```

9. Deploy read-only production first: `PROTOCOL_CHAIN=base`, writes disabled.
   Smoke-test public reads, explorer links and balances.
10. Arm the final deployment using all three values:
    `PROTOCOL_CHAIN=base`, `PROTOCOL_WRITES_ENABLED=true`,
    `PROTOCOL_WRITE_CHAIN_ID=8453`, plus `BASE_RECORDER_KEY`.
11. Run the cutover gate before deploying/promoting:

    ```bash
   npm run check:mainnet:cutover
   ```

   This gate independently reads Base mainnet and rechecks the pinned Safe
   codehash/singleton, exact 2-of-3 owner set, modules, guard, contract runtime
   code, accepted ownership and cleared `pendingOwner` values.

12. Send one bounded canary write and verify its receipt, emitted events and API
    readback before enabling cron-driven writes.
13. Only after the canary and monitoring checks pass, deploy
    `PROTOCOL_CUTOVER_FREEZE=false` to resume live Bobby cycles.

## Immediate rollback

1. Deploy with `PROTOCOL_WRITES_ENABLED=false`; this is the first kill switch.
2. Pause affected contracts from the Safe if integrity, role or oracle checks fail.
   The six-call batch (AgentRegistry has no pausable mutation surface) is derived
   from the same manifest:

   ```bash
   npm run build:safe-launch-batch -- --action=pause --chain-id=8453
   ```
3. Roll the production alias back to the last known-good deployment.
4. Do not delete the mainnet manifest or overwrite it with a simulation.
5. Preserve receipts, logs and the exact environment-name inventory for incident
   analysis. Rotate the Base recorder key if exposure is suspected.

## Hard no-go conditions

- TrackRecord artifact does not pass EIP-170 under the committed compiler config.
- `api/xlayer-record.ts` still carries the explicit
  `requireCompatibleTrackRecordAdapter` Base guard; remove it only with the
  audited V2 ABI/proof-flow adapter and regression tests.
- Any contract source or runtime bytecode is unverified.
- Safe handoff is pending instead of accepted.
- Mainnet manifest is missing, simulated or differs from Vercel addresses.
- Base recorder key exists in a preview environment.
- `PROTOCOL_WRITE_CHAIN_ID` is absent or differs from 8453.
- Any legacy X Layer generator is able to run while `PROTOCOL_CHAIN=base`.
- `PROTOCOL_CUTOVER_FREEZE` is not true during deploy/cutover.
- Canary has less than 24 hours on the final bytecode.
