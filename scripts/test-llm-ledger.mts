// The LLM cost ledger counts what was actually spent and tried (dashboard audit of 2026-10-01): a retried
// failure is its own failed row, a reply that is not the requested JSON is a failed call, dated model ids are
// priced by family and unknown models at the dearest known price, and the cycle / agent-run calls (callLlm)
// write the ledger under their endpoint.
import assert from 'node:assert/strict';

process.env.BOBBY_SUPABASE_URL = 'https://db.test';
process.env.BOBBY_SUPABASE_SERVICE_ROLE_KEY = 'test-service';
process.env.OPENAI_API_KEY = 'test-openai';
process.env.ANTHROPIC_API_KEY = 'test-anthropic';

const deferred: Promise<unknown>[] = [];
(globalThis as Record<symbol, unknown>)[Symbol.for('@vercel/request-context')] = { get: () => ({ waitUntil: (p: Promise<unknown>) => { deferred.push(p); } }) };
const { completeJson, callLlm, modelCost, MODEL_PRICES } = await import('../api/_lib/llm.ts');

let checks = 0;
const eq = (got: unknown, want: unknown, what: string) => { assert.deepEqual(got, want, what); checks++; };
const ok = (v: unknown, what: string) => { assert.ok(v, what); checks++; };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
let replies: Array<() => Response> = [];
const ledgerWrites: unknown[][] = [];
globalThis.fetch = (async (input: string | URL, init?: RequestInit) => {
  const url = String(input);
  if (url.includes('/rest/v1/bobby_llm_usage')) { ledgerWrites.push(JSON.parse(String(init?.body))); return new Response(null, { status: 201 }); }
  if (url.includes('/rest/v1/')) return json([]);
  const next = replies.shift();
  if (!next) throw new Error(`unexpected ${url}`);
  return next();
}) as typeof fetch;

const claudeOk = (text: string) => () => json({ stop_reason: 'end_turn', content: [{ type: 'text', text }], usage: { input_tokens: 100, output_tokens: 50 } });
const spec = { provider: 'anthropic' as const, model: 'claude-sonnet-5-5', maxTokens: 500, timeoutMs: 20_000 };
const schema = { name: 's', schema: { type: 'object' } };

// A 500 then a success: two rows, the first failed.
replies = [() => json({ error: { type: 'api_error' } }, 500), claudeOk('{"a":1}')];
let usage: Array<{ ok: boolean; stop: string | null; usd: number }> = [];
eq(await completeJson(spec, 's', 'u', schema, { endpoint: 'test', usage: usage as never }), { a: 1 }, 'the retry answers');
eq(usage.map((u) => [u.ok, u.stop]), [[false, 'http_500'], [true, 'end_turn']], 'the failed attempt is its own failed row');

// Prose instead of JSON: the call failed.
replies = [claudeOk('Sure! Here is the analysis…')];
usage = [];
await assert.rejects(completeJson(spec, 's', 'u', schema, { endpoint: 'test', usage: usage as never })); checks++;
eq([usage.length, usage[0].ok, usage[0].stop], [1, false, 'invalid_json'], 'an unreadable reply is a failed call');
ok(usage[0].usd > 0, 'its tokens still cost');

// Prices.
eq(modelCost('claude-haiku-4-5-20251001', 1e6, 0, 0), MODEL_PRICES['claude-haiku-4-5'][0], 'a dated id is priced by its family');
const dearest = Math.max(...Object.values(MODEL_PRICES).map((p) => p[2]));
eq(modelCost('mystery-model', 0, 0, 1e6), dearest, 'an unknown model is never $0');

// callLlm (cycle, agent-run) writes the ledger under its endpoint, failures included.
replies = [() => json({ error: { code: 'server_error' } }, 500), () => json({ choices: [{ message: { content: 'hi' } }], usage: { prompt_tokens: 1000, completion_tokens: 100 } })];
const r = await callLlm({ endpoint: 'bobby-cycle', system: 's', user: 'u', model: 'gpt-4o-mini' });
eq(r.text, 'hi', 'the cycle call answers');
await Promise.all(deferred.splice(0));
const rows = ledgerWrites.at(-1) as Array<{ surface: string; ok: boolean; stop: string; usd: number }>;
eq(rows.map((x) => [x.surface, x.ok, x.stop]), [['bobby-cycle', false, 'http_500'], ['bobby-cycle', true, 'stop']], 'both attempts, under the cycle surface');
ok(rows[1].usd > 0, 'with its cost');

console.log(`llm-ledger: ${checks} checks passed`);
