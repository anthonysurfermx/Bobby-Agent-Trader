#!/bin/bash
# ============================================================
# Generate on-chain activity for Bobby Protocol on X Layer
# Usage: ./scripts/generate-onchain-activity.sh [rounds]
# Each round generates ~11 txs across 5 contracts
# ============================================================

set -euo pipefail

# Load env if .env exists
if [ -f .env ]; then
  set -a; source .env; set +a
fi
if [ -f .env.local ]; then
  set -a; source .env.local; set +a
fi

# Config
API_BASE="${API_BASE:-https://bobbyprotocol.xyz}"
SECRET="${BOBBY_CYCLE_SECRET:-${CRON_SECRET:-${2:-}}}"
ROUNDS="${1:-3}"
DELAY_BETWEEN_ROUNDS=5

if [ -z "$SECRET" ]; then
  echo "ERROR: Set BOBBY_CYCLE_SECRET or CRON_SECRET in .env"
  echo "  Or pass as second arg: ./scripts/generate-onchain-activity.sh <rounds> <secret>"
  exit 1
fi

echo "╔══════════════════════════════════════════════════╗"
echo "║  Bobby Protocol — On-Chain Activity Generator    ║"
echo "║  Target: X Layer (Chain 196)                     ║"
echo "║  Rounds: $ROUNDS                                       ║"
echo "╚══════════════════════════════════════════════════╝"
echo ""

TOTAL_TXS=0

for i in $(seq 1 "$ROUNDS"); do
  echo "━━━ Round $i/$ROUNDS ━━━"

  RESPONSE=$(curl -s -X POST "$API_BASE/api/generate-activity" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $SECRET" \
    -d '{
      "signals": 3,
      "bounties": 2,
      "commits": 2,
      "economy": true,
      "oracle": true
    }')

  # Parse response
  OK=$(echo "$RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin).get('ok',''))" 2>/dev/null || echo "")
  GENERATED=$(echo "$RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin).get('generated',0))" 2>/dev/null || echo "0")
  ERROR=$(echo "$RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin).get('error',''))" 2>/dev/null || echo "")

  if [ "$OK" = "True" ]; then
    TOTAL_TXS=$((TOTAL_TXS + GENERATED))
    COST=$(echo "$RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin).get('cost',{}).get('spent','?'))" 2>/dev/null || echo "?")
    echo "  ✓ Generated $GENERATED txs (cost: $COST OKB)"

    # Show breakdown
    echo "$RESPONSE" | python3 -c "
import sys, json
data = json.load(sys.stdin)
b = data.get('breakdown', {})
parts = []
for k, v in b.items():
    if v > 0:
        parts.append(f'{k}={v}')
print('    ' + ', '.join(parts))
" 2>/dev/null || true

  else
    echo "  ✗ Failed: ${ERROR:-unknown error}"
    echo "    Response: $RESPONSE" | head -c 200
    echo ""
  fi

  if [ "$i" -lt "$ROUNDS" ]; then
    echo "  Waiting ${DELAY_BETWEEN_ROUNDS}s before next round..."
    sleep $DELAY_BETWEEN_ROUNDS
  fi
done

echo ""
echo "════════════════════════════════════════════"
echo "  Total transactions generated: $TOTAL_TXS"
echo "  Explorer: https://www.oklink.com/xlayer/address/0x09a81ff70ddbc5e8b88f168b3eef01384b6cdcea"
echo "════════════════════════════════════════════"
