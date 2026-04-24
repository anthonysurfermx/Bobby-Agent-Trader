#!/usr/bin/env bash
# ============================================================
# morning-review.sh — daily review of last night's agent work.
#
# Usage:
#   ./scripts/morning-review.sh          # summary
#   ./scripts/morning-review.sh <slug>   # detail for one branch
#
# Output:
#   - List of nightly branches + worktrees
#   - Per-branch: commits, files changed, pass/fail from report
#   - Location of overnight reports
#   - Suggested next-actions per branch (merge / refine / discard)
#
# Does NOT:
#   - Merge anything
#   - Delete anything
#   - Push anything
#   - Modify any file
# ============================================================

set -uo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"

TARGET_SLUG="${1:-}"

YELLOW='\033[0;33m'
GREEN='\033[0;32m'
RED='\033[0;31m'
DIM='\033[2m'
RESET='\033[0m'

echo ""
echo "============================================================"
echo -e "${GREEN}🌅 Morning Review — $(date '+%Y-%m-%d %H:%M')${RESET}"
echo "============================================================"
echo ""

# Fetch to know if nightly branches were pushed
git fetch origin --quiet 2>/dev/null || true

# List nightly worktrees
WORKTREES=$(git worktree list --porcelain | awk '/^worktree/ {print $2}' | grep "/nightly-" || true)
if [[ -z "$WORKTREES" ]]; then
  echo -e "${DIM}No nightly-* worktrees active.${RESET}"
else
  echo -e "${YELLOW}Active nightly worktrees:${RESET}"
  while IFS= read -r wt; do
    [[ -z "$wt" ]] && continue
    rel="${wt#${REPO_ROOT}/}"
    echo "  - $rel"
  done <<< "$WORKTREES"
  echo ""
fi

# List nightly branches (local)
NIGHTLY_BRANCHES=$(git for-each-ref --format='%(refname:short)' refs/heads/nightly/ 2>/dev/null || true)

if [[ -z "$NIGHTLY_BRANCHES" ]]; then
  echo -e "${DIM}No nightly/* branches found.${RESET}"
  echo ""
  echo "============================================================"
  exit 0
fi

# If a target slug is given, filter
if [[ -n "$TARGET_SLUG" ]]; then
  NIGHTLY_BRANCHES=$(echo "$NIGHTLY_BRANCHES" | grep "$TARGET_SLUG" || true)
  if [[ -z "$NIGHTLY_BRANCHES" ]]; then
    echo -e "${RED}No branches matching slug: $TARGET_SLUG${RESET}"
    exit 1
  fi
fi

echo -e "${YELLOW}Nightly branches:${RESET}"
echo ""

while IFS= read -r branch; do
  [[ -z "$branch" ]] && continue

  # Slug extraction (strip the "nightly/YYYY-MM-DD-" prefix)
  SLUG=$(echo "$branch" | sed -E 's|^nightly/[0-9]{4}-[0-9]{2}-[0-9]{2}-||')
  DATE=$(echo "$branch" | sed -E 's|^nightly/([0-9]{4}-[0-9]{2}-[0-9]{2}).*|\1|')

  echo "────────────────────────────────────────"
  echo -e "${GREEN}${branch}${RESET}"

  # Ahead of main?
  AHEAD=$(git rev-list --count "origin/main..${branch}" 2>/dev/null || echo "?")
  BEHIND=$(git rev-list --count "${branch}..origin/main" 2>/dev/null || echo "?")
  echo "  ${DIM}Ahead of main:${RESET} ${AHEAD}  ${DIM}Behind:${RESET} ${BEHIND}"

  # Recent commits on branch
  echo "  ${DIM}Recent commits:${RESET}"
  git log --oneline -5 "origin/main..${branch}" 2>/dev/null | sed 's/^/    /' || echo "    (no commits beyond main)"

  # Files touched
  FILES_CHANGED=$(git diff --name-only "origin/main...${branch}" 2>/dev/null | wc -l | tr -d ' ')
  echo "  ${DIM}Files changed:${RESET} ${FILES_CHANGED}"
  if [[ "$FILES_CHANGED" -gt 0 && "$FILES_CHANGED" -le 10 ]]; then
    git diff --name-status "origin/main...${branch}" 2>/dev/null | sed 's/^/    /'
  elif [[ "$FILES_CHANGED" -gt 10 ]]; then
    echo "    (too many to list — use: git diff --name-status origin/main...${branch})"
  fi

  # Overnight report
  REPORT=".ai/overnight/${DATE}-${SLUG}-report.md"
  if [[ -f "$REPORT" ]]; then
    echo -e "  ${DIM}Report:${RESET} ${GREEN}${REPORT}${RESET}"
    # Extract lines matching TESTS|FAIL|PASS|RISK|ISSUE
    GREP_HITS=$(grep -iE "^(tests|fail|pass|risk|issue|blocker)" "$REPORT" 2>/dev/null | head -5 || true)
    if [[ -n "$GREP_HITS" ]]; then
      echo "  ${DIM}Signals from report:${RESET}"
      echo "$GREP_HITS" | sed 's/^/    /'
    fi
  else
    echo -e "  ${DIM}Report:${RESET} ${RED}MISSING (${REPORT})${RESET}"
    echo "    → Agent did not produce a final report. Investigate before merging."
  fi

  # Suggested action
  if [[ ! -f "$REPORT" ]]; then
    echo -e "  ${RED}Suggested action:${RESET} Refuse merge until report exists."
  elif [[ "$AHEAD" == "0" ]]; then
    echo -e "  ${YELLOW}Suggested action:${RESET} No commits — delete branch + worktree."
    echo "    git worktree remove .claude/worktrees/nightly-${DATE}-${SLUG} --force"
    echo "    git branch -D ${branch}"
  else
    echo -e "  ${GREEN}Suggested action:${RESET} Review diff, then one of:"
    echo "    # inspect"
    echo "    git diff origin/main...${branch}"
    echo "    # merge via PR (recommended)"
    echo "    gh pr create --base main --head ${branch}"
    echo "    # or discard"
    echo "    git worktree remove .claude/worktrees/nightly-${DATE}-${SLUG} --force && git branch -D ${branch}"
  fi

  echo ""
done <<< "$NIGHTLY_BRANCHES"

echo "============================================================"
echo -e "${DIM}Reports live in: .ai/overnight/${RESET}"
echo -e "${DIM}To dive into one branch: ${0} <slug>${RESET}"
echo "============================================================"
