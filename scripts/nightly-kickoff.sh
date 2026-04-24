#!/usr/bin/env bash
# ============================================================
# nightly-kickoff.sh — start an overnight task in a dedicated worktree.
#
# Usage:
#   ./scripts/nightly-kickoff.sh <slug> <prompt-file>
#
# Example:
#   ./scripts/nightly-kickoff.sh pyth-xlayer-research .ai/overnight/prompts/pyth.md
#
# What it does:
#   1. Creates worktree at .claude/worktrees/nightly-YYYY-MM-DD-<slug>/
#   2. Creates branch nightly/YYYY-MM-DD-<slug> from origin/main
#   3. Prepends Nightly Sandbox Rules header to the prompt
#   4. Writes a kickoff marker to .ai/overnight/YYYY-MM-DD-<slug>-kickoff.md
#   5. Prints the command to launch claude CLI inside the worktree
#
# Does NOT:
#   - Push anything
#   - Apply any edits
#   - Actually run claude (prints the command; user/systemd runs it)
# ============================================================

set -euo pipefail

SLUG="${1:-}"
PROMPT_FILE="${2:-}"

if [[ -z "$SLUG" || -z "$PROMPT_FILE" ]]; then
  echo "Usage: $0 <slug> <prompt-file>" >&2
  echo "Example: $0 pyth-research .ai/overnight/prompts/pyth.md" >&2
  exit 1
fi

if [[ ! -f "$PROMPT_FILE" ]]; then
  echo "ERROR: prompt file not found: $PROMPT_FILE" >&2
  exit 1
fi

# Validate slug (alphanumeric + hyphen only)
if ! [[ "$SLUG" =~ ^[a-z0-9-]+$ ]]; then
  echo "ERROR: slug must be lowercase alphanumeric + hyphens only (got: $SLUG)" >&2
  exit 1
fi

DATE="$(date +%Y-%m-%d)"
BRANCH="nightly/${DATE}-${SLUG}"
WORKTREE_PATH=".claude/worktrees/nightly-${DATE}-${SLUG}"
REPO_ROOT="$(git rev-parse --show-toplevel)"
ABS_WORKTREE="${REPO_ROOT}/${WORKTREE_PATH}"

cd "$REPO_ROOT"

# Refuse to overwrite existing worktree
if [[ -d "$ABS_WORKTREE" ]]; then
  echo "ERROR: worktree already exists at $ABS_WORKTREE" >&2
  echo "Choose a different slug or clean up first." >&2
  exit 1
fi

# Fetch fresh origin/main
echo "==> git fetch origin main"
git fetch origin main --quiet

# Create worktree + branch from origin/main
echo "==> git worktree add $WORKTREE_PATH -b $BRANCH origin/main"
git worktree add "$WORKTREE_PATH" -b "$BRANCH" origin/main

# Ensure .ai/overnight dir exists in the worktree
mkdir -p "${ABS_WORKTREE}/.ai/overnight"

# Write kickoff marker
KICKOFF_REPORT="${ABS_WORKTREE}/.ai/overnight/${DATE}-${SLUG}-kickoff.md"
cat > "$KICKOFF_REPORT" <<EOF
# Nightly Kickoff — ${DATE} — ${SLUG}

- **Branch**: \`${BRANCH}\`
- **Worktree**: \`${WORKTREE_PATH}\`
- **Started**: $(date -Iseconds)
- **Prompt source**: \`${PROMPT_FILE}\`

## Original prompt

$(cat "$PROMPT_FILE")

EOF

# Wrap the prompt with the Nightly Sandbox header
WRAPPED_PROMPT_FILE="${ABS_WORKTREE}/.ai/overnight/${DATE}-${SLUG}-wrapped-prompt.md"
cat > "$WRAPPED_PROMPT_FILE" <<EOF
## NIGHTLY SANDBOX MODE — READ FIRST

You are running unsupervised. Follow the Nightly Sandbox Rules in CLAUDE.md precisely:
- You are a **branch factory**, not a deployer.
- NEVER commit to main. NEVER push --force. NEVER run vercel/supabase/forge-broadcast/external-comms.
- If you are uncertain, **stop and write your uncertainty** to \`.ai/overnight/${DATE}-${SLUG}-report.md\` — do not guess.
- Before committing any code change, run \`npm run build\` (and forge tests if you touched Solidity). Commit only if they pass.

At the END of your work, you MUST:
1. Write a final report to \`.ai/overnight/${DATE}-${SLUG}-report.md\` covering: scope, commands run, tests pass/fail, files touched, risks flagged, open questions.
2. Commit on branch \`${BRANCH}\`. Do NOT push, do NOT open a PR, do NOT merge.
3. Exit cleanly.

---

## TASK

$(cat "$PROMPT_FILE")
EOF

echo ""
echo "============================================================"
echo "✅ Worktree ready: ${WORKTREE_PATH}"
echo "✅ Branch:         ${BRANCH}"
echo "✅ Kickoff report: ${KICKOFF_REPORT}"
echo "✅ Wrapped prompt: ${WRAPPED_PROMPT_FILE}"
echo ""
echo "Next step — launch claude inside the worktree:"
echo ""
echo "    cd ${WORKTREE_PATH}"
echo "    claude --print \"\$(cat ${WRAPPED_PROMPT_FILE})\" > .ai/overnight/${DATE}-${SLUG}-stdout.log 2>&1"
echo ""
echo "Or for interactive supervision:"
echo "    cd ${WORKTREE_PATH} && claude"
echo "    then paste the content of: ${WRAPPED_PROMPT_FILE}"
echo "============================================================"
