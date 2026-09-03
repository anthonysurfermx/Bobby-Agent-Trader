#!/usr/bin/env bash
# ============================================================
# End-to-end ROLLBACK DRILL — proves the journal path without changing the
# primary. Sequence agreed with Codex (2026-09-03):
#   1. freeze the destination (legacy is already frozen) → production writes
#      answer 503 for the duration (~1–2 min)
#   2. replay-outbox --from target  (drains the journal onto legacy; refuses
#      unless both sides report writeFreeze=true; skips control-plane entries)
#   3. T0 on both sides under freeze + verify(destination → legacy): the data
#      tables must be identical on both projects (control plane excluded)
#   4. unfreeze the destination — it STAYS primary; legacy stays frozen
# Env: SOURCE_* = legacy, TARGET_* = destination (as every other tool), plus
# LEGACY_SERVICE_KEY/URL for the manifest role swap in step 3.
# Run only outside demo hours. Every step is logged; a failure stops before
# the unfreeze so the operator decides (production stays frozen = safe).
# ============================================================
set -euo pipefail
: "${SOURCE_SUPABASE_URL:?legacy url}" "${SOURCE_SUPABASE_SERVICE_KEY:?legacy service key}"
: "${TARGET_SUPABASE_URL:?destination url}" "${TARGET_SUPABASE_SERVICE_KEY:?destination service key}"
HEALTH="${DEPLOY_HEALTH_URL:-https://bobbyprotocol.xyz/api/bobby-health}"
OUT=".ai/migration/rollback-drill-$(date -u +%Y%m%dT%H%M%SZ)"; mkdir -p "$OUT"
log() { echo "[$(date -u +%H:%M:%S)] $*"; }
ctl() { # ctl <url> <key> <true|false> <note>
  curl -sf -o /dev/null -X PATCH "$1/rest/v1/bobby_control?id=eq.global" -H "apikey: $2" -H "Authorization: Bearer $2" -H "Content-Type: application/json" -H "Prefer: return=minimal" -d "{\"write_freeze\":$3,\"note\":\"$4\"}"
}
health_freeze() { curl -sf "$HEALTH" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s);console.log(`${j.db.ref} writeFreeze=${j.control.writeFreeze}`)})'; }

log "1. freezing the destination (primary) for the drill"
ctl "$TARGET_SUPABASE_URL" "$TARGET_SUPABASE_SERVICE_KEY" true "rollback drill $(date -u +%FT%TZ): destination frozen, stays primary"
sleep 12; log "production health: $(health_freeze)"

log "2. replaying the journal destination → legacy"
npx tsx scripts/migration/replay-outbox.mts --from target 2>&1 | tee "$OUT/replay.log"

log "3. manifests under freeze on both sides"
npx tsx scripts/migration/t0-manifest.mts --side target --out "$OUT/t0-destination.json" 2>&1 | tail -1
npx tsx scripts/migration/t0-manifest.mts --side source --out "$OUT/t0-legacy.json" 2>&1 | tail -1
log "   verify: destination (as source of truth) vs legacy (as restore target)"
# role swap: verify runs its orphan/sequence checks against TARGET_*, which must be legacy here
if TARGET_SUPABASE_URL="$SOURCE_SUPABASE_URL" TARGET_SUPABASE_SERVICE_KEY="$SOURCE_SUPABASE_SERVICE_KEY" \
   npx tsx scripts/migration/verify.mts --source "$OUT/t0-destination.json" --target "$OUT/t0-legacy.json" 2>&1 | tee "$OUT/verify.log" | tail -1 | grep -q '^VERIFIED'; then
  log "   legacy == destination for every data table"
else
  log "   VERIFY FAILED — destination left FROZEN on purpose; inspect $OUT/verify.log before unfreezing"; exit 1
fi

log "4. unfreezing the destination — it remains primary; legacy remains frozen"
ctl "$TARGET_SUPABASE_URL" "$TARGET_SUPABASE_SERVICE_KEY" false "bobby-protocol primary; rollback drill passed $(date -u +%FT%TZ); legacy frozen as rollback target"
sleep 12; log "production health: $(health_freeze)"
log "DRILL PASSED — evidence in $OUT"
