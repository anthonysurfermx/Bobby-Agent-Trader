---
globs: "**/*.{ts,tsx,js,jsx}"
---

# No Hardcode Rule — Real Data Only

- NEVER hardcode data, phrases, states, or mock values into components or endpoints
- ALL displayed data must come from a real source: Supabase, API endpoint, or on-chain
- If a feature needs data that doesn't exist yet, CREATE the data source first (DB column, API endpoint, or computation in the cycle), THEN consume it in the UI
- Placeholder/mock data is only acceptable in loading skeletons or error fallbacks
- When Bobby generates text (vibe, analysis, verdict), it must come from the LLM output, not from a static array of phrases
- Static configuration (chain IDs, contract addresses, wallet addresses) goes in constants at the top of the file or in environment variables — that's not "data", that's config
