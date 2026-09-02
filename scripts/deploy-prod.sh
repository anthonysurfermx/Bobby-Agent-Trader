#!/usr/bin/env bash
# ============================================================
# Traceable production deploy from the CLI — the deployed tree IS the commit.
#
# Why: production is deployed with `vercel --prod` from a git worktree. A
# worktree's `.git` is a file, so the Vercel CLI ships no git metadata and
# /api/bobby-health reports `sha: null` (Codex finding 5). Worse, a plain
# `vercel --prod` uploads the WORKING TREE — untracked files included — so a
# reported SHA would not certify what is live (Codex round 2, P1).
#
# This script therefore:
#   1. requires a clean tree (tracked AND untracked, ignored files excluded)
#   2. requires HEAD == origin/main after a fetch (override only with
#      DEPLOY_ALLOW_NON_MAIN=1, which is printed loudly)
#   3. exports `git archive HEAD` to a temp dir and deploys THAT — nothing
#      outside the commit can reach Vercel
#   4. builds inside the export (npm ci + npm run build) before uploading
#   5. injects BOBBY_BUILD_SHA / BOBBY_BUILD_REF as runtime env for this
#      deployment and refuses to exit 0 until /api/bobby-health reports
#      deployment.fullSha === HEAD
# A git-integrated deploy (push to the production branch) makes all of this
# unnecessary — Vercel sets VERCEL_GIT_COMMIT_SHA itself. Prefer it.
#
# Usage: scripts/deploy-prod.sh
#        DEPLOY_HEALTH_URL=https://bobbyprotocol.xyz/api/bobby-health scripts/deploy-prod.sh
# ============================================================
set -euo pipefail

HEALTH_URL="${DEPLOY_HEALTH_URL:-https://bobbyprotocol.xyz/api/bobby-health}"
REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"

# 1. clean tree — tracked changes AND untracked files (ignored ones excluded)
DIRTY="$(git status --porcelain --untracked-files=all)"
if [ -n "$DIRTY" ]; then
  echo "refusing to deploy: the working tree is not exactly HEAD (commit or remove these first)" >&2
  echo "$DIRTY" | head -40 >&2
  exit 1
fi

SHA="$(git rev-parse HEAD)"
SHORT="${SHA:0:7}"
REF="$(git rev-parse --abbrev-ref HEAD)"

# 2. HEAD must be what origin/main points at
git fetch -q origin main
MAIN="$(git rev-parse origin/main)"
if [ "$SHA" != "$MAIN" ]; then
  if [ "${DEPLOY_ALLOW_NON_MAIN:-0}" = "1" ]; then
    echo "WARNING: deploying ${REF}@${SHORT}, which is NOT origin/main (${MAIN:0:7}) — DEPLOY_ALLOW_NON_MAIN=1 set" >&2
  else
    echo "refusing to deploy: HEAD ${SHORT} != origin/main ${MAIN:0:7}. Fast-forward main and push first (or set DEPLOY_ALLOW_NON_MAIN=1 for an explicit exception)." >&2
    exit 1
  fi
fi

# 3. export exactly the commit
EXPORT_DIR="$(mktemp -d "${TMPDIR:-/tmp}/bobby-deploy-${SHORT}.XXXXXX")"
trap 'rm -rf "$EXPORT_DIR"' EXIT
git archive --format=tar "$SHA" | tar -x -C "$EXPORT_DIR"
if [ ! -f .vercel/project.json ]; then
  echo "refusing to deploy: .vercel/project.json missing — run 'vercel link' in the repo first" >&2
  exit 1
fi
mkdir -p "$EXPORT_DIR/.vercel" && cp .vercel/project.json "$EXPORT_DIR/.vercel/project.json"
echo "exported ${REF}@${SHORT} to ${EXPORT_DIR} ($(find "$EXPORT_DIR" -type f | wc -l | tr -d ' ') files from the commit only)"

# 4. build the export, not the working tree
( cd "$EXPORT_DIR" && npm ci --no-audit --no-fund --silent && npm run build )

# 5. deploy the export with the SHA pinned as runtime env for this deployment
vercel --prod --yes --cwd "$EXPORT_DIR" \
  -e "BOBBY_BUILD_SHA=${SHA}" \
  -e "BOBBY_BUILD_REF=${REF}" \
  -b "VITE_BUILD_SHA=${SHA}" \
  -m "gitCommitSha=${SHA}" \
  -m "gitCommitRef=${REF}"

echo "verifying ${HEALTH_URL}"
for attempt in 1 2 3 4 5 6 7 8 9 10 11 12; do
  LIVE="$(curl -sf "${HEALTH_URL}" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s);console.log(`${j.deployment?.fullSha||""} ${j.deployment?.shaSource||""}`)})' || true)"
  LIVE_SHA="${LIVE%% *}"
  if [ "${LIVE_SHA}" = "${SHA}" ]; then
    echo "OK: production reports ${SHORT} (${LIVE#* })"
    exit 0
  fi
  echo "attempt ${attempt}: health reports '${LIVE:-none}', waiting for the alias to move…"
  sleep 10
done
echo "FAIL: production health does not report ${SHORT} — do not trust this deploy until the alias is checked" >&2
exit 1
