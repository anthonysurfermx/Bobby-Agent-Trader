---
globs: api/*.ts
---

# API Endpoint Rules

- Always export `config = { maxDuration: N }` — Vercel needs this for serverless functions
- Use environment variables for all secrets: `process.env.VARIABLE_NAME`
- For Supabase access, use SB_URL + SUPABASE_SERVICE_KEY from env, never hardcode
- For Anthropic API, use ANTHROPIC_API_KEY from env
- CORS: Vercel handles this via vercel.json rewrites, don't add manual CORS headers
- Error responses: always return JSON with `{ error: string }` and appropriate HTTP status
- Logging: use `console.error('[EndpointName]', ...)` prefix for debugging in Vercel logs
- Rate limiting: batch concurrent API calls (5 per batch) to avoid 429s from external APIs
