# DeFi Mexico Hub + Bobby Agent Trader

## Project
Vite + React + TypeScript app. Supabase backend. Deployed on Vercel at defimexico.org.
Main product: **Bobby Agent Trader** — 3-agent debate system (Alpha Hunter, Red Team, CIO) for the OKX X Layer hackathon.

## Tech Stack
- Frontend: React 18, TypeScript, Tailwind CSS, Framer Motion, Recharts, wagmi/viem
- Backend: Vercel serverless functions (api/*.ts), Supabase (Postgres + RLS)
- AI: Mixed provider — OpenAI GPT-4o for agent-run / bobby-cycle / bobby-intel debates (function-call tools API), Anthropic Claude Haiku for explain.ts streaming. Migrated from Anthropic tool_use to OpenAI function-call during the hackathon for stricter structured-output behavior; revert path is `api/_lib/llm.ts` wrapper if/when we reunify providers.
- Blockchain: OKX X Layer (Chain 196), OKB native + USDT ERC-20
- Design: Stitch Kinetic Terminal — dark terminal aesthetic (green-400 on #050505, glassmorphism cards)
- Bot: Telegram via webhook (api/telegram-webhook.ts)

## Architecture
```
api/agent-run.ts      — Main 8h cycle: signals → filter → debate → risk gate → execute
api/bobby-intel.ts    — Fast intelligence snapshot (~10s): regime, conviction, mood
api/bobby-cycle.ts    — User-facing debate cycle (every 5min via cron)
api/explain.ts        — Anthropic Claude Haiku streaming analysis via SSE (only endpoint still on Anthropic)
api/telegram-*.ts     — Bot webhook + payment verification
src/pages/Bobby*.tsx  — 11+ views wrapped in KineticShell
src/components/kinetic/KineticShell.tsx — Terminal frame + nav + ticker
```

## Code Conventions
- Language: Spanish for conversation with user, English for all code (variables, comments, commits)
- Commit messages: `feat:`, `fix:`, `chore:` prefix, English
- New Bobby pages: wrap in `<KineticShell activeTab="...">`, add lazy route in App.tsx
- API endpoints: Vercel serverless in api/ directory, export config = { maxDuration: N }
- Supabase: use MCP for queries, migrations via mcp__supabase__apply_migration
- Styling: Stitch tokens — bg-white/[0.02], border-white/[0.04], text-green-400
- Charts: Recharts in ResponsiveContainer, green/amber/red color scheme
- Animations: Framer Motion, staggered entry with motion.div

## Key Constants
- Supabase project: egpixaunlnzauztbrnuz
- X Layer Chain ID: 196
- USDT on X Layer: 0x1E4a5963aBFD975d8c9021ce480b42188849D41d
- Bobby treasury wallet: 0x09a81ff70ddbc5e8b88f168b3eef01384b6cdcea
- Bobby Telegram bot: @bobbyagentraderbot

## Commands
- `npm run dev` — local dev server
- `npm run build` — production build (always run before pushing)
- `git push` — auto-deploys to Vercel

## Don'ts
- Never hardcode API keys or bot tokens — use process.env
- Never push without building first
- Don't add files to git that contain secrets (.env, credentials)
- Don't over-engineer — ship fast, iterate after (hackathon mindset)

## Nightly Sandbox Rules

When running unsupervised (overnight, scheduled, or `/loop` in auto mode), the agent operates as a **branch factory**, not a deployer. Produce reviewable work — branches, commits, tests, reports, drafts. **Never take irreversible actions.**

### Absolute prohibitions (enforced by `.claude/settings.local.json` deny list)
- `git push origin main`, `git push --force`, `git reset --hard`, `git clean -f`
- `git branch -D`, `git commit --amend`, `git rebase -i`, `git filter-branch`
- `gh pr merge`, `gh pr close`, `gh repo delete`
- `rm -rf`, `find -delete`, `sudo rm`
- `vercel deploy`, `vercel --prod`, any Supabase prod write (`db push`, `db reset`)
- `forge script --broadcast`, `forge create`, `cast send`
- Any edit/write to `.env*` files
- Any `--no-verify` or `--no-gpg-sign` flag
- External comms: Telegram send, tweet, webhook POST to external APIs

### Always do instead
- Create a dedicated worktree per task: `.claude/worktrees/nightly-YYYY-MM-DD-<slug>/`
- Commit to a dedicated branch: `nightly/YYYY-MM-DD-<slug>`
- Write a report to `.ai/overnight/YYYY-MM-DD-<slug>.md` documenting: scope, commands run, tests pass/fail, files touched, risks flagged, open questions
- Run `npm run build` and relevant tests before committing — commit only if they pass
- Stop and write to `.ai/overnight/` if uncertain — never guess on ambiguous decisions

### Scope rules for overnight tasks
- **🟢 Safe**: research briefs, documentation, local-only tests, static analysis, translation, draft markdown in `.ai/`
- **🟡 Medium (only with full test coverage)**: refactors within a single module, dependency bumps with test gate, bug fixes with explicit reproducer
- **🔴 Forbidden**: prod deploys, DB migrations, contract deploys, architectural decisions, external comms, changes to `main`, bulk file deletion, any commit to `main` branch directly

### Kill-switch
If anything seems off, run `./scripts/panic.sh` — it kills overnight processes, resets worktrees with uncommitted changes back to their branch HEAD, and writes an incident report. It does **NOT** delete branches or commits.

### Morning ritual (user, not agent)
1. Read `.ai/overnight/YYYY-MM-DD-summary.md`
2. `./scripts/morning-review.sh` to see diffs per branch
3. Per branch: merge, refine, or delete worktree
4. No agent action takes effect on `main` without explicit human approval
