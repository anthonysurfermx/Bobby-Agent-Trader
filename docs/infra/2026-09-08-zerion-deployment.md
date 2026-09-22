# Mobile signing for the Base deployment

The operator originally selected Zerion, then explicitly accepted Rainbow mobile after the successful account connection. Ledger is not used. Connecting the deployer to the Safe
web app does not execute `DeployBase.s.sol`; the deployer is intentionally not a
Safe owner. This local tool adapts the already simulated transaction sequence to
WalletConnect. It does not change Solidity, any production endpoint or flags.

Contract candidate: `258a3850a8505d47b155165e11151477a6cf3c48`.
The new signing adapter has its own validation evidence; the earlier GO 3/3 does
not constitute an independent review of this new adapter. All 19 deployment transactions were signed in Rainbow and verified against live Base receipts. The Safe acceptance batch was executed with two owner signatures. See the completion record below.

## Evidence

- The unchanged readiness checker ran inside Vercel with actual Production
  service secrets: 53 PASS, 0 NO-GO. Validation build
  `dpl_DVidHCSfBGWYHQMmKKAQTsXBxyoD` intentionally exited 78 before publication.
  It used the intended public example configuration and actual service secrets;
  it did not test provider authentication or certify every existing Vercel value.
- Fresh `DeployBase.s.sol` dry run passed all deployment assertions. Estimated
  25,036,664 gas / approximately 0.00025037 ETH at that quote. This is an estimate.
- `test-mobile-deploy.mjs` checks the real simulation plus 26 positive/negative
  controls for exact data, chain, wallet, sequence and receipts.
- `test-mobile-deploy-anvil.mjs` exercises the actual execution module on a
  loopback-only fork. Pre-send failures and lost responses cannot trigger retries.
  Its gas-price suggestion is stubbed to Base's scale because Anvil suggests a
  1-gwei priority fee. Its Safe sender is impersonated and funded locally to test
  ownership semantics; this does not test real Safe signature collection.
- Local HTTP checks cover missing token, wrong Host, missing Origin, and signing
  refusal in connection-only mode. The page was inspected in the browser.
- Production build and API typecheck passed. Production audit remains 22
  moderate / 0 high / 0 critical. Existing development advisories are not fixed here.

## Generate an immutable packet

Use an isolated checkout. Back up `contracts/deployments/8453.json` first: even a
Foundry dry run writes a simulated manifest. Never promote that simulated file
to the live manifest. Restore the old file after the packet has been captured.

```sh
set -a
source deploy/base-mainnet.env.example
set +a
(cd contracts && forge script script/DeployBase.s.sol --rpc-url "$BASE_RPC_URL" --sender "$DEPLOYER_ADDRESS")
node scripts/prepare-mobile-deploy.mjs /absolute/path/to/new-packet-directory
node scripts/test-mobile-deploy.mjs /absolute/path/to/new-packet-directory/packet.json
```

The preparer refuses to overwrite an existing packet. It reconstructs all seven
constructor payloads from compiler artifacts and the reviewed public config,
including canonical Pyths, feeds, roles and V2 parameters. It independently
encodes the scorer, treasury, bonds and seven ownership proposals and compares
all 19 items byte for byte with Foundry. Nonces must be consecutive, the chain
must be Base 8453, sender must be the pinned deployer, and ETH value must be zero.
Save and review both printed hashes and the human-readable operations.

## Connect first

```sh
node scripts/mobile-deploy.mjs --packet=/absolute/path/to/packet.json --sha256=REVIEWED_PACKET_SHA256
```

Open the printed loopback URL on the computer and scan the QR in Zerion. Select
only `0xC3F836EC06A2202af23e59997A613CA0722F35d1` on Base. The page clearly says
signing is disabled. WalletConnect metadata identifies the local application;
it does not impersonate the public Bobby website. Session keys and pairing URIs
remain in process memory, and the QR is never written to the journal.

The HTTP listener binds only `127.0.0.1:8787`; it rejects foreign Host headers.
State requires a random control token; POST additionally requires the exact
Origin and JSON. It accepts only an index into the immutable plan, not arbitrary
RPC methods, calldata, addresses or wallet actions. No browser request can
enable signing in a process started without the signing flag.

## Signing activation and sequencing

After reviewing the adapter and packet and verifying Zerion connection, restart
with the additional argument `--sign-plan=REVIEWED_PLAN_SHA256`. Reconnect using
the new QR. Signing activation refuses simulations older than two hours or an
existing broadcast journal. Re-run the simulation if wallet activity changed
the nonce; do not hand-edit the predicted addresses.

Each step requires a deliberate click in the local page and approval in Zerion.
The wallet must support contract creation through `eth_sendTransaction`; actual
device confirmation remains to be checked. The tool requests no seed, private
key, token approval, personal signature or EIP-7702 delegation.

Before each request it rechecks the session, chain, latest and pending nonce,
creation-address availability, gas estimate and available ETH. Requested fees
are capped at 0.02 gwei, with a 30% gas-limit margin, a cumulative requested
execution-fee ceiling of 0.001 ETH and an additional balance reserve. L1 fees
and any wallet modifications are outside that execution-fee ceiling: the user
must review the wallet's final fee. No transaction sends ETH value.

The request is recorded before WalletConnect is invoked. Only a successful
receipt with the expected sender, nonce, chain, zero value, target, creation
address and exact input hash can advance the sequence. The receipt block must
still be canonical. Any rejection, timeout, disk failure, RPC failure or session
change halts further requests. There is no automatic resend. Explicit journal reconciliation is described below.
The journal contains only public requests and receipt evidence, never sessions.

## After signing

`mobile-broadcast.json` is written alongside the immutable packet. It must hold
19 verified attempts, 19 transactions and 19 receipts. Before adopting any
artifact, re-query all receipts and exact transaction inputs against Base.

The packet's simulated manifest supplies the expected addresses. The completed
mobile journal supplies the Foundry-compatible `transactions` and `receipts`.
Stage those as `contracts/deployments/8453.json` and
`contracts/broadcast/DeployBase.s.sol/8453/run-latest.json` in an isolated checkout,
then run the existing finalizer to replace simulated block numbers with live
evidence. Keep the previous live manifest backed up and review the resulting diff.

```sh
npm run finalize:base-manifest -- --write
npm run --silent build:safe-launch-batch -- --action=accept > contracts/deployments/safe-batches/8453-accept-ownership.json
```

Check all seven Safe batch targets against the finalized manifest. Execute
acceptance with two of the three actual Safe owners, run deployment verification
and postdeploy checks, then update Vercel addresses. This tool does not perform
those steps or enable swaps. The restricted signed swap canary and explicit
public cutover remain separate.

On interruption, inspect the journal and pending/mined nonce before doing
anything else. A missing wallet response is not proof that nothing was sent.
Do not delete the journal to bypass the restart guard. Partial deployment
recovery needs a reviewed continuation that preserves already-created addresses.


## Observed mobile receipt and explicit recovery

Rainbow successfully sent transaction
`0x353bec35e07ac963f658d7aa4e37b78d4900a47b3068c1f6b447b9a947ea1eaa`,
creating TrackRecordV2 at `0x953181F1E7179BAA5659f0b8bbd13e901fa2DeBd`.
Publicnode returned HTTP 403 for its receipt lookup. The Base public RPC returned
an exact successful transaction/receipt match. The signing entry point now reads
from `https://mainnet.base.org`.

For this failure class, `--resume-journal=REVIEWED_JOURNAL_SHA256` explicitly
selects the existing journal in addition to the normal packet and plan hashes.
The tool re-queries every recorded hash and verifies exact input, sender, nonce,
chain, value, target, creation address, receipt success and canonical block. It
also requires the live and pending nonce to equal the end of the verified prefix.
A missing hash, pending transaction or reverted receipt prevents continuation.
It preserves a hash-named backup before recording reconciliation and starts at
the next unexecuted index. It never sends during reconciliation. The 14 recovery
checks use the observed first receipt and reject altered or incomplete evidence.

A temporary QR image was generated in `/tmp` at the operator's request because
the browser image was not visible in the chat. Session encryption keys remain in
memory; the temporary QR is pairing material and should be removed after use.


The local page now offers **Renovar QR** after a connection proposal expires or
is rejected, preserving the same URL and verified transaction index. This route
requires the same control token and Origin checks. It cannot clear a transaction
halt, replace an active session, or issue a transaction request. An active
proposal blocks duplicate connection attempts. The original five-minute QR
images in chat may expire; use the live panel to obtain a fresh QR.


The second mobile creation also succeeded, at transaction
`0x2ca12bbe6644a94142d140181788ef32136d6d4b05e697d1da1155e4a1040bdf`.
The initial verifier failed, while a subsequent exact receipt/input/canonical
block check passed. Read-only RPC calls now have bounded retries and null
transaction bodies/blocks are polled before validation. Send methods are rejected
by the retry transport. Exact data mismatches still halt immediately.

When a known submitted hash remains unverified, the authenticated panel can run
**Verificar recibo enviado**. It checks the current journal hash, revalidates the
entire sent prefix and requires the same valid wallet session/revision before
clearing the halt. It preserves a backup and never calls the wallet's send method.
The panel now records a bounded diagnostic for local assertion/read failures.


## Mainnet completion — 2026-09-08

All 19 transactions (deployer nonces 53–71) succeeded. The finalized mainnet
manifest records exact live hashes, canonical blocks and input hashes.
The seven-contract acceptance batch was executed by the Safe at:
`0xb74f11e247125796c6016c8de01c38c603362f724710acb3dce15c2b2d6d522d`.
Safe transaction hash:
`0xc57d74a9a1ac20ff8b1aca09d170f6ef7f6308734d5e9261d38a584fc3e32b9c`.
The two signers were the reviewed owners ending 27D7 and 5843. Live reads
confirmed all seven owners are the Safe and all pending owners are zero.
`VerifyBaseDeployment` passed 60 checks against Base after acceptance.
Production address propagation, configuration postdeploy and the signed stock
canary remain separate gates; this record does not authorize public activation.

The RPC reader now retries lagging nonce reads at most ten times. Both latest
and pending must equal the reviewed nonce before sending; any higher nonce
stops immediately. No wallet send is automatically retried.

Postdeploy candidate configuration passed 116 checks / 0 NO-GO inside Vercel
validation build `dpl_GnKjxKUyV8JhWka8qERqacD1fhHh`, using actual service
secrets without export. Exit 78 deliberately prevented publication. This first
check used intended public configuration; actual Production validation follows
the public address, treasury and V2 parameter updates.

Actual Production postdeploy also passed 116 checks / 0 NO-GO in validation
build `dpl_AUizNDRwmxh7u9oEQs55zo8rYt1v`, with no public configuration
overrides. Stock master remained off and the canary list remained defined empty.
The validation worker exited 78 deliberately. Production address propagation
is tracked separately from that read-only configuration result.

The public site now serves redeployment `dpl_3JxvNGQnZV9Y6qWapBAYUish7hLp`
from main `03c66a0`, preserving the newer UI changes. Public health passed;
protocol heartbeat reported the six new addresses it exposes; an anonymous
USDC-to-NVDAc quote returned no transaction bundle. Frozen cutover subsequently passed as recorded below. No stock or
protocol-write flag was enabled in Production.


Frozen cutover passed **142 checks / 0 NO-GO** in validation build
`dpl_9tY3AhC7vKqs1wr1JhwcoT8fk99J`. The unchanged checker used the actual
Production secrets, public configuration and RPC endpoint. A worker-only
Ethers FetchRequest transport serialized reads at 1200 ms and retried only
rate-limit responses, at most four attempts; no send methods were allowed.
The earlier CALL_EXCEPTIONs disappeared with pacing. The worker alone set
PROTOCOL_WRITES_ENABLED=true to check the prepared frozen configuration, then
exited 78 to prevent publication. This is not live write enablement, a recorder
soak, or a signed stock-swap canary. Those remain separate steps.
