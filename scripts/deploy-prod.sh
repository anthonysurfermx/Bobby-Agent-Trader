#!/usr/bin/env bash
# ============================================================
# Traceable production deploy from the CLI.
#
# Why: production is deployed with `vercel --prod` from a git worktree, and a
# worktree's `.git` is a file, so the Vercel CLI ships no git metadata and
# /api/bobby-health reports `sha: null`. Nobody outside can then certify which
# commit is live (Codex review, finding 5). This script injects the commit as
# runtime env for that deployment only and verifies it against the health
# endpoint afterwards. A git-integrated deploy (push to the production
# branch) makes this unnecessary — VERCEL_GIT_COMMIT_SHA is set by Vercel.
#
# Usage: scripts/deploy-prod.sh            # refuses a dirty tree
#        DEPLOY_HEALTH_URL=https://bobbyprotocol.xyz/api/bobby-health scripts/deploy-prod.sh
# ============================================================
set -euo pipefail

HEALTH_URL="${DEPLOY_HEALTH_URL:-https://bobbyprotocol.xyz/api/bobby-health}"

if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
  echo "refusing to deploy: tracked files have uncommitted changes" >&2
  git status --short --untracked-files=no >&2
  exit 1
fi

SHA="$(git rev-parse HEAD)"
SHORT="${SHA:0:7}"
REF="$(git rev-parse --abbrev-ref HEAD)"

echo "deploying ${REF}@${SHORT} to production"
npm run build

vercel --prod --yes \
  -e "BOBBY_BUILD_SHA=${SHA}" \
  -e "BOBBY_BUILD_REF=${REF}" \
  -b "VITE_BUILD_SHA=${SHA}" \
  -m "gitCommitSha=${SHA}" \
  -m "gitCommitRef=${REF}"

echo "verifying ${HEALTH_URL}"
for attempt in 1 2 3 4 5 6; do
  LIVE="$(curl -sf "${HEALTH_URL}" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s);console.log(`${j.deployment?.fullSha||""} ${j.deployment?.shaSource||""}`)})' || true)"
  LIVE_SHA="${LIVE%% *}"
  if [ "${LIVE_SHA}" = "${SHA}" ]; then
    echo "OK: production reports ${SHORT} (${LIVE#* })"
    exit 0
  fi
  echo "attempt ${attempt}: health reports '${LIVE:-none}', waiting for the alias to move…"
  sleep 10
done
echo "FAIL: production health does not report ${SHORT} — check the alias before trusting this deploy" >&2
exit 1
