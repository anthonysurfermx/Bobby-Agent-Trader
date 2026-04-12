# DeFi Mexico Hub + Bobby Agent Trader

## Project
Vite + React + TypeScript app. Supabase backend. Deployed on Vercel at defimexico.org.
Main product: **Bobby Agent Trader** — 3-agent debate system (Alpha Hunter, Red Team, CIO) for the OKX X Layer hackathon.

## Tech Stack
- Frontend: React 18, TypeScript, Tailwind CSS, Framer Motion, Recharts, wagmi/viem
- Backend: Vercel serverless functions (api/*.ts), Supabase (Postgres + RLS)
- AI: Codex API (Haiku for debates, Sonnet for judge), streaming via SSE
- Blockchain: OKX X Layer (Chain 196), OKB native + USDT ERC-20
- Design: Stitch Kinetic Terminal — dark terminal aesthetic (green-400 on #050505, glassmorphism cards)
- Bot: Telegram via webhook (api/telegram-webhook.ts)

## Architecture
```
api/agent-run.ts      — Main 8h cycle: signals → filter → debate → risk gate → execute
api/bobby-intel.ts    — Fast intelligence snapshot (~10s): regime, conviction, mood
api/bobby-cycle.ts    — User-facing debate cycle (every 5min via cron)
api/explain.ts        — Codex Haiku streaming analysis via SSE
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
