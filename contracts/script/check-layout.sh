#!/usr/bin/env bash
# Storage-layout regression gate (spec F-06 / audit r2 fix 4 + external P2).
#
# The Commitment/Trade struct layouts AND the top-level storage slots are the
# ABI that off-chain consumers (bobby-protocol-stats, reputation, xlayer-record)
# align to BY HAND. A silent layout drift would decode garbage in production.
# This script regenerates the live layout with `forge inspect` and diffs it
# against the committed baseline, failing LOUDLY on any drift — INCLUDING
# struct-member drift (audit r2 external, Codex: dumping only top-level slots
# let a swap of entryTolBps <-> exitTolBps pass unnoticed).
# Runs in CI (.github/workflows/ci.yml). Update the baseline ONLY together
# with the consumer migration: re-run with --update.
set -euo pipefail

cd "$(dirname "$0")/.."
CONTRACT="BobbyTrackRecordV2"
BASELINE="test/snapshots/${CONTRACT}.layout.json"
RAW="$(mktemp)"
TMP="$(mktemp)"
trap 'rm -f "$RAW" "$TMP"' EXIT

# Incremental builds sometimes emit artifacts without the storageLayout
# section ("storage layout missing from artifact"); self-heal with a clean
# rebuild so neither CI nor local runs flake on stale cache.
if ! forge inspect "$CONTRACT" storageLayout --json > "$RAW" 2>/dev/null; then
  echo "storageLayout missing from artifact — clean rebuild..."
  forge clean && forge build > /dev/null
  forge inspect "$CONTRACT" storageLayout --json > "$RAW"
fi

python3 - "$RAW" > "$TMP" <<'PYEOF'
import json, sys

d = json.load(open(sys.argv[1]))
types = d.get("types", {})

# Solidity assigns internal type names such as `t_struct(Commitment)170_storage`
# from AST ids. Those ids are not storage layout and vary across compiler
# versions, so resolve them to their stable human-readable labels before
# comparing the snapshot.
def stable_type(type_id):
    return types.get(type_id, {}).get("label", type_id)

out = {
    "storage": [
        {"label": s["label"], "slot": s["slot"], "offset": s["offset"], "type": stable_type(s["type"])}
        for s in d["storage"]
    ],
    # Full member layouts: every struct field's slot/offset/type is frozen.
    "types": {
        t.get("label", name): {
            "label": t.get("label"),
            "numberOfBytes": t.get("numberOfBytes"),
            "members": [
                {"label": m["label"], "slot": m["slot"], "offset": m["offset"], "type": stable_type(m["type"])}
                for m in t.get("members", [])
            ],
        }
        for name, t in sorted(d.get("types", {}).items())
    },
}
json.dump(out, sys.stdout, indent=2, sort_keys=True)
PYEOF

if [[ "${1:-}" == "--update" ]]; then
  cp "$TMP" "$BASELINE"
  echo "layout baseline updated: $BASELINE"
  exit 0
fi

if diff -u "$BASELINE" "$TMP"; then
  echo "OK: ${CONTRACT} storage + struct-member layout matches baseline."
else
  echo "DRIFT: ${CONTRACT} layout changed (slots or struct members). If"
  echo "intentional, update the baseline AND the off-chain consumers, then"
  echo "re-run with --update."
  exit 1
fi
