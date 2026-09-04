#!/usr/bin/env bash
# EIP-170 gate for the PRODUCTION inventory (BP-06, 2026-09-04 review).
#
# `forge build --sizes` exits non-zero on ANY oversized artifact — including
# test harnesses such as DeployerEoa (test/DeploymentGates.t.sol), which
# deliberately bundles two production contracts and is never deployed. In CI
# that made the contracts job die before `forge test` and the layout gate ever
# ran. This script enforces the 24,576-byte runtime limit on exactly the seven
# contracts DeployBase broadcasts, and fails loudly if any of them is missing
# from the build, so the harness can stay compiled and tested.
set -euo pipefail

cd "$(dirname "$0")/.."
LIMIT=24576
# The seven contracts DeployBase.s.sol deploys — keep in sync with `Deployed`.
PRODUCTION=(
  BobbyTrackRecordV2
  BobbyConvictionOracle
  BobbyAgentEconomyV2
  BobbyAdversarialBounties
  HardnessRegistry
  BobbyAgentRegistry
  BobbyIntentEscrow
)

status=0
printf '%-28s %8s %8s\n' "contract" "runtime" "margin"
for c in "${PRODUCTION[@]}"; do
  artifact="out/${c}.sol/${c}.json"
  if [[ ! -f "$artifact" ]]; then
    echo "MISSING: $artifact (run forge build)"; status=1; continue
  fi
  # deployedBytecode.object is 0x-prefixed hex; two hex chars per byte.
  hex="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["deployedBytecode"]["object"])' "$artifact")"
  bytes=$(( (${#hex} - 2) / 2 ))
  margin=$(( LIMIT - bytes ))
  printf '%-28s %8d %8d\n' "$c" "$bytes" "$margin"
  if (( bytes > LIMIT )); then
    echo "OVER EIP-170: $c is $bytes bytes (> $LIMIT)"; status=1
  fi
done

if (( status == 0 )); then
  echo "OK: all ${#PRODUCTION[@]} production contracts are within EIP-170 ($LIMIT bytes)."
fi
exit $status
