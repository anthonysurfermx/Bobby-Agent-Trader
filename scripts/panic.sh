#!/usr/bin/env bash
# ============================================================
# panic.sh — emergency kill-switch for overnight Claude sessions.
#
# Usage:
#   ./scripts/panic.sh           # kill + report, preserve commits
#   ./scripts/panic.sh --status  # dry run, show what would happen
#
# What it does:
#   1. Kill any running `claude` CLI processes (SIGTERM, then SIGKILL if needed)
#   2. For each nightly-* worktree:
#      - Show git status
#      - If uncommitted changes exist, stash them (never discard)
#      - Do NOT delete branches, worktrees, or commits
#   3. Write incident report to .ai/overnight/YYYY-MM-DD-panic-HHMMSS.md
#   4. Print summary of surviving branches so user can inspect next morning
#
# Does NOT:
#   - Delete worktrees
#   - Delete branches
#   - Force-push anything
#   - Revert commits
# ============================================================

set -uo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"

DRY_RUN=false
if [[ "${1:-}" == "--status" ]]; then
  DRY_RUN=true
fi

TS="$(date +%Y-%m-%d-%H%M%S)"
REPORT=".ai/overnight/${TS}-panic.md"
mkdir -p .ai/overnight

echo "# Panic incident — ${TS}" > "$REPORT"
echo "" >> "$REPORT"
echo "- **Mode**: $([ "$DRY_RUN" == true ] && echo "DRY RUN (--status)" || echo "LIVE")" >> "$REPORT"
echo "- **Repo**: ${REPO_ROOT}" >> "$REPORT"
echo "- **Operator**: ${USER}" >> "$REPORT"
echo "" >> "$REPORT"

echo "==> Panic triggered at ${TS} ($([ "$DRY_RUN" == true ] && echo "dry run" || echo "LIVE"))"

# Step 1: kill claude processes
echo "" >> "$REPORT"
echo "## Processes" >> "$REPORT"
CLAUDE_PIDS=$(pgrep -f "claude" 2>/dev/null | grep -v "$$" || true)
if [[ -z "$CLAUDE_PIDS" ]]; then
  echo "- No running claude processes found." >> "$REPORT"
  echo "    (no claude processes running)"
else
  echo "- Detected PIDs: $(echo $CLAUDE_PIDS | tr '\n' ' ')" >> "$REPORT"
  echo "    Detected claude PIDs: $CLAUDE_PIDS"
  if [[ "$DRY_RUN" == false ]]; then
    echo "$CLAUDE_PIDS" | xargs -r kill -TERM 2>/dev/null || true
    sleep 2
    # Force kill any stragglers
    STRAGGLERS=$(echo "$CLAUDE_PIDS" | xargs -r ps -p 2>/dev/null | tail -n +2 | awk '{print $1}')
    if [[ -n "$STRAGGLERS" ]]; then
      echo "$STRAGGLERS" | xargs -r kill -KILL 2>/dev/null || true
      echo "- SIGKILL sent to stragglers: $STRAGGLERS" >> "$REPORT"
    fi
    echo "- Processes terminated." >> "$REPORT"
  else
    echo "- (dry run — not killed)" >> "$REPORT"
  fi
fi

# Step 2: inspect nightly worktrees
echo "" >> "$REPORT"
echo "## Nightly worktrees" >> "$REPORT"
echo ""

WORKTREES=$(git worktree list --porcelain | awk '/^worktree/ {print $2}' | grep "/nightly-" || true)

if [[ -z "$WORKTREES" ]]; then
  echo "- No nightly-* worktrees found." >> "$REPORT"
  echo "    (no nightly worktrees)"
else
  while IFS= read -r wt; do
    [[ -z "$wt" ]] && continue
    echo "    Inspecting: $wt"
    echo "### \`$wt\`" >> "$REPORT"

    if cd "$wt" 2>/dev/null; then
      BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "unknown")
      STATUS=$(git status --short 2>/dev/null || echo "unreadable")
      LAST_COMMIT=$(git log -1 --format="%h %s" 2>/dev/null || echo "none")

      {
        echo "- Branch: \`${BRANCH}\`"
        echo "- Last commit: ${LAST_COMMIT}"
        if [[ -z "$STATUS" ]]; then
          echo "- Working tree: **clean**"
        else
          echo "- Working tree: **dirty**"
          echo ""
          echo '```'
          echo "$STATUS"
          echo '```'

          if [[ "$DRY_RUN" == false ]]; then
            STASH_MSG="panic-stash-${TS}"
            if git stash push -u -m "$STASH_MSG" > /dev/null 2>&1; then
              echo "- Stashed as: \`${STASH_MSG}\`"
            else
              echo "- Stash failed (see incident terminal output)"
            fi
          else
            echo "- (dry run — would stash)"
          fi
        fi
      } >> "$REPO_ROOT/$REPORT"

      cd "$REPO_ROOT"
    else
      echo "- Could not enter worktree." >> "$REPORT"
    fi

    echo "" >> "$REPORT"
  done <<< "$WORKTREES"
fi

# Step 3: summary of branches starting with nightly/
echo "## Nightly branches surviving" >> "$REPORT"
echo '```' >> "$REPORT"
git branch --list "nightly/*" 2>/dev/null | sed 's/^/  /' >> "$REPORT" || echo "  (none)" >> "$REPORT"
echo '```' >> "$REPORT"

echo ""
echo "============================================================"
echo "✅ Panic report written: ${REPORT}"
echo ""
echo "Branches and commits are PRESERVED. Nothing was deleted."
echo "Review the report + morning-review.sh to decide what to merge/discard."
echo "============================================================"
