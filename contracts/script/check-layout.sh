#!/usr/bin/env bash
# Storage-layout regression gate (spec F-06 / audit r2 fix 4).
#
# The Commitment/Trade struct layouts AND the top-level storage slots are the
# ABI that off-chain consumers (bobby-protocol-stats, reputation, xlayer-record)
# align to BY HAND. A silent layout drift would decode garbage in production.
# This script regenerates the live layout with `forge inspect` and diffs it
# against the committed baseline, failing LOUDLY on any drift. Wire it into CI
# and run it in the pre-commit gate. Update the baseline ONLY together with the
# consumer migration (regenerate with --update).
set -euo pipefail

cd "$(dirname "$0")/.."
CONTRACT="BobbyTrackRecordV2"
BASELINE="test/snapshots/${CONTRACT}.layout.json"
TMP="$(mktemp)"
trap 'rm -f "$TMP"' EXIT

forge inspect "$CONTRACT" storageLayout --json \
  | python3 -c "import json,sys; d=json.load(sys.stdin); json.dump([{'label':s['label'],'slot':s['slot'],'offset':s['offset'],'type':s['type']} for s in d['storage']], sys.stdout, indent=2)" \
  > "$TMP"

if [[ "${1:-}" == "--update" ]]; then
  cp "$TMP" "$BASELINE"
  echo "layout baseline updated: $BASELINE"
  exit 0
fi

if diff -u "$BASELINE" "$TMP"; then
  echo "OK: ${CONTRACT} storage layout matches baseline."
else
  echo "DRIFT: ${CONTRACT} storage layout changed. If intentional, update the"
  echo "baseline AND the off-chain consumers, then re-run with --update."
  exit 1
fi
