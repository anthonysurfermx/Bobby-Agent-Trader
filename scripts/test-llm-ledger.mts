// Synthetic provider replies verify request contracts, billed attempts, cache tiers and streaming safety.
// No request reaches a real provider or database, and no real credential is read.
import assert from 'node:assert/strict';

process.env.BOBBY_SUPABASE_URL = 'https://db.test';
process.env.BOBBY_SUPABASE_SERVICE_ROLE_KEY = 'test-service';
process.env.OPENAI_API_KEY = 'test-openai';
process.env.ANTHROPIC_API_KEY = 'test-anthropic';
delete process.env.BOBBY_LLM_PRIMARY;
delete process.env.BOBBY_APP_TEXT_MODEL;
delete process.env.BOBBY_PRO_TEXT_MODEL;
delete process.env.BOBBY_DESK_MODEL;
delete process.env.RESEND_API_KEY;

const deferred: Promise<unknown>[] = [];
(globalThis as Record<symbol, unknown>)[Symbol.for('@vercel/request-context')] = { get: () => ({ waitUntil: (p: Promise<unknown>) => { deferred.push(p); } }) };
const { completeJson, callLlm, streamText, modelCost, modelPrice, MODEL_PRICES, LlmIncompleteError } = await import('../api/_lib/llm.ts');
const { appTextModel } = await import('../api/_lib/app-model.ts');

let checks = 0;
const eq = (got: unknown, want: unknown, what: string) => { assert.deepEqual(got, want, what); checks++; };
const ok = (v: unknown, what: string) => { assert.ok(v, what); checks++; };
const close = (got: number, want: number, what: string) => ok(Math.abs(got - want) < 1e-12, what);
const rejects = async (promise: Promise<unknown>, what: string, matcher?: (error: unknown) => boolean) => {
  await assert.rejects(promise, matcher ?? (() => true), what); checks++;
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
interface Call { url: string; body: any; headers: Record<string, string>; signal?: AbortSignal | null }
type Reply = (call: Call) => Response | Promise<Response>;
const originalFetch = globalThis.fetch;
const originalError = console.error;
const originalWarn = console.warn;
const logs: unknown[][] = [];
console.error = (...args: unknown[]) => { logs.push(args); };
console.warn = (...args: unknown[]) => { logs.push(args); };
let calls: Call[] = [];
let replies: Reply[] = [];
const ledgerWrites: Array<Array<Record<string, any>>> = [];
const serviceWrites: unknown[] = [];
globalThis.fetch = (async (input: string | URL, init?: RequestInit) => {
  const call: Call = { url: String(input), body: init?.body ? JSON.parse(String(init.body)) : null,
    headers: Object.fromEntries(Object.entries((init?.headers ?? {}) as Record<string, string>).map(([key, value]) => [key.toLowerCase(), value])), signal: init?.signal };
  if (new URL(call.url).hostname === 'db.test') {
    if (init?.body) serviceWrites.push(call.body);
    if (call.url.includes('/rest/v1/bobby_llm_usage')) ledgerWrites.push(call.body);
    return (init?.method ?? 'GET') === 'GET' ? json([]) : new Response(null, { status: 201 });
  }
  calls.push(call);
  if (!['api.anthropic.com', 'api.openai.com'].includes(new URL(call.url).hostname)) throw new Error('Unexpected external host in fixture');
  const reply = replies.shift();
  if (!reply) throw new Error('Unexpected provider request in fixture');
  return reply(call);
}) as typeof fetch;
function reset(...next: Reply[]) { calls = []; replies = next; }
async function settledLedger() {
  while (deferred.length) await Promise.all(deferred.splice(0));
  return ledgerWrites.at(-1) ?? [];
}
const claudeData = (text: string, stop = 'end_turn', usage: Record<string, unknown> = { input_tokens: 100, output_tokens: 50 }) => ({ stop_reason: stop, content: [{ type: 'text', text }], usage });
const claudeOk = (text: string) => () => json(claudeData(text));
const openaiOk = (text: string) => () => json({ choices: [{ finish_reason: 'stop', message: { content: text } }], usage: { prompt_tokens: 1000, completion_tokens: 100 } });
const noCredit = () => json({ type: 'error', error: { type: 'invalid_request_error', message: 'Your credit balance is too low to access the Anthropic API.' } }, 400);
const rateLimited = () => json({ error: { type: 'rate_limit_error' } }, 429);
const spec = { provider: 'anthropic' as const, model: 'claude-haiku-5-5', maxTokens: 500, timeoutMs: 20_000 };
const schema = { name: 's', schema: { type: 'object' } };
const tool = { name: 'emit_verdict', description: 'Return the verdict', parameters: { type: 'object', properties: { verdict: { type: 'string' } }, required: ['verdict'], additionalProperties: false } };
const proTool = { name: 'emit_allocation', description: 'Return a bounded allocation', parameters: {
  type: 'object', properties: {
    verdict: { type: 'string', enum: ['wait', 'buy'] },
    allocation: { type: 'number', minimum: 0, maximum: 100 },
    note: { type: 'string', minLength: 2, maxLength: 32 },
    steps: { type: 'array', minItems: 1, maxItems: 2, items: {
      type: 'object', properties: { amount: { type: 'integer', minimum: 1, maximum: 3 } }, required: ['amount'], additionalProperties: false,
    } },
  }, required: ['verdict', 'allocation', 'note', 'steps'], additionalProperties: false,
} };
const validProInput = { verdict: 'wait', allocation: 25, note: 'Valid allocation', steps: [{ amount: 2 }] };
const base = { endpoint: 'bobby-cycle', system: 'system fixture', user: 'user fixture' };
const proBase = { ...base, tier: 'pro' as const };
const privateMarker = 'PRIVATE_PROMPT_AND_TOKEN';

// Byte-at-a-time fragments split UTF-8 characters, JSON, and CRLF across transport chunks.
function sse(events: Array<unknown | string>, fragment = true, trailing = true): Response {
  const text = events.map(event => `data: ${typeof event === 'string' ? event : JSON.stringify(event)}\r\n\r\n`).join('');
  const bytes = new TextEncoder().encode(trailing ? text : text.replace(/\r\n\r\n$/, ''));
  let offset = 0;
  return new Response(new ReadableStream<Uint8Array>({ pull(controller) {
    if (offset >= bytes.length) { controller.close(); return; }
    const end = fragment ? offset + 1 : bytes.length;
    controller.enqueue(bytes.slice(offset, end)); offset = end;
  } }), { headers: { 'Content-Type': 'text/event-stream' } });
}
const start = { type: 'message_start', message: { usage: { input_tokens: 100, cache_creation_input_tokens: 2, cache_read_input_tokens: 5, output_tokens: 0 } } };
const textDelta = (text: string) => ({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } });
const stopEvents = (reason = 'end_turn') => [{ type: 'message_delta', delta: { stop_reason: reason }, usage: { output_tokens: 3 } }, { type: 'message_stop' }];
const streamBase = { endpoint: 'openclaw-chat', system: 'system fixture', messages: [{ role: 'user' as const, content: 'user fixture' }] };

try {
  // Structured retries and parse failures keep separate billable rows.
  reset(() => json({ error: { type: 'api_error' } }, 500), claudeOk('{"a":1}'));
  let usage: any[] = [];
  eq(await completeJson(spec, 's', 'u', schema, { endpoint: 'test', usage }), { a: 1 }, 'the structured retry answers');
  eq(usage.map(row => [row.ok, row.stop]), [[false, 'http_500'], [true, 'end_turn']], 'each structured attempt has its own row');
  reset(claudeOk('Sure! Here is the analysis…'));
  usage = [];
  await rejects(completeJson(spec, 's', 'u', schema, { endpoint: 'test', usage }), 'unreadable structured output fails');
  eq([usage.length, usage[0].ok, usage[0].stop], [1, false, 'invalid_json'], 'unreadable output records failed status');
  ok(usage[0].usd > 0, 'unreadable output still costs');
  reset(() => new Response(`{${privateMarker}`, { headers: { 'Content-Type': 'application/json' } }));
  usage = [];
  await rejects(completeJson(spec, 's', 'u', schema, { endpoint: 'test', usage }), 'malformed provider JSON is redacted', error => error instanceof Error && !error.message.includes(privateMarker));
  eq([calls.length, usage[0].ok, usage[0].stop], [1, false, 'invalid_response'], 'malformed provider JSON records failure and does not retry');
  reset(() => json({ choices: [{ finish_reason: 'stop', message: { content: '{"a":1}', refusal: privateMarker } }], usage: { prompt_tokens: 100, completion_tokens: 20 } }));
  usage = [];
  await rejects(completeJson({ ...spec, provider: 'openai', model: 'gpt-6-luna' }, 's', 'u', schema, { endpoint: 'test', usage }), 'a refusal overrides otherwise valid structured content', error => error instanceof LlmIncompleteError && !error.message.includes(privateMarker));
  eq([calls.length, usage[0].ok, usage[0].stop, usage[0].tokensOut], [1, false, 'refusal', 20], 'a structured refusal is one failed billed request');

  // Central model selection and exact input/cache-tier boundaries.
  eq(appTextModel({}), 'claude-haiku-5-5', 'Haiku is the app default');
  eq(appTextModel({}, 'free'), 'claude-haiku-5-5', 'verified free access selects Haiku');
  eq(appTextModel({}, 'pro'), 'claude-opus-5-5', 'verified Pro access selects Opus');
  eq(appTextModel({ BOBBY_APP_TEXT_MODEL: 'claude-sonnet-5-5' }, 'pro'), 'claude-opus-5-5', 'a free override never changes the Pro model');
  eq(appTextModel({ BOBBY_PRO_TEXT_MODEL: 'claude-sonnet-5-5' }, 'free'), 'claude-haiku-5-5', 'a Pro override never changes the free model');
  eq(appTextModel({ BOBBY_PRO_TEXT_MODEL: ' claude-sonnet-5-5 ' }, 'pro'), 'claude-sonnet-5-5', 'the independent Pro override trims whitespace');
  assert.throws(() => appTextModel({ BOBBY_PRO_TEXT_MODEL: 'gpt-6-luna' }, 'pro')); checks++;
  eq(appTextModel({ BOBBY_APP_TEXT_MODEL: ' claude-sonnet-5-5 ' }), 'claude-sonnet-5-5', 'controlled app model overrides trim whitespace');
  assert.throws(() => appTextModel({ BOBBY_APP_TEXT_MODEL: 'gpt-6-luna' })); checks++;
  eq(modelPrice('claude-haiku-5-5', 100000), [.10, .01, .50], 'exactly 100k input keeps the low Haiku tier');
  eq(modelPrice('claude-haiku-5-5', 100001), [.50, .05, 2.50], 'above 100k input uses the high Haiku tier');
  eq(modelPrice('claude-haiku-5-5-20261001', 100001), [.50, .05, 2.50], 'dated Haiku ids use the same high-context tier');
  ok(modelPrice('claude-haiku-5-50', 100001)[2] >= 2.50, 'a different family is never priced as cheap Haiku');
  close(modelCost('claude-haiku-5-5', 100000, 0, 1000), .0105, 'low-tier uncached cost');
  close(modelCost('claude-haiku-5-5', 100001, 0, 1000), .0525005, 'high-tier uncached cost');
  close(modelCost('claude-haiku-5-5', 0, 100000, 1000), .0015, 'cached input counts toward the exact low-tier boundary');
  close(modelCost('claude-haiku-5-5', 1, 100000, 1000), .0075005, 'cached plus uncached input selects the high tier');
  eq(modelCost('claude-sonnet-5-5', 0, 1e6, 0), .10, 'Sonnet cached input uses its corrected price');
  eq(modelPrice('claude-opus-5-5', 1_000_000), [4, .20, 20], 'Opus has standard prices across the full context window');
  close(modelCost('claude-opus-5-5', 900_000, 100_000, 1000), 3.64, 'Opus input, cache read and output cost at the verified rates');
  eq(modelCost('claude-haiku-4-5-20251001', 1e6, 0, 0), MODEL_PRICES['claude-haiku-4-5'][0], 'an older dated id is priced by its family');
  eq(modelCost('mystery-model', 0, 0, 1e6), Math.max(...Object.values(MODEL_PRICES).map(price => price[2])), 'unknown models use the dearest known price');
  reset(() => json(claudeData('{"a":1}', 'end_turn', { input_tokens: 90, cache_creation_input_tokens: 10, cache_read_input_tokens: 100001, output_tokens: 20 })));
  usage = [];
  await completeJson(spec, 's', 'u', schema, { endpoint: 'test', usage });
  eq([usage[0].tokensIn, usage[0].tokensCached, usage[0].tokensOut], [100101, 100001, 20], 'cache creation and cache reads retain all billed input');
  close(usage[0].usd, .00510005, 'structured cache usage selects the high tier');

  // Legacy caller aliases cannot defeat the app default. A retried attempt keeps its endpoint.
  reset(() => json({ error: { type: 'api_error' } }, 500), claudeOk('hi'));
  eq(await callLlm({ ...base, model: 'gpt-4o-mini' }), { text: 'hi', toolInput: null, provider: 'anthropic', model: 'claude-haiku-5-5' }, 'normal text uses Anthropic despite a legacy OpenAI alias');
  let rows = await settledLedger();
  eq(rows.map(row => [row.surface, row.ok, row.stop]), [['bobby-cycle', false, 'http_500'], ['bobby-cycle', true, 'end_turn']], 'both attempts retain the cycle surface');
  ok(rows[1].usd > 0, 'successful cycle output is billed');
  eq(calls.map(call => call.body.model), ['claude-haiku-5-5', 'claude-haiku-5-5'], 'both attempts select the central Haiku model');
  const request = calls[0];
  eq([request.url, request.headers['x-api-key'], request.headers['anthropic-version']], ['https://api.anthropic.com/v1/messages', 'test-anthropic', '2023-06-01'], 'Anthropic endpoint and headers');
  eq([request.body.max_tokens, request.body.system, request.body.messages, request.body.output_config], [4096, base.system, [{ role: 'user', content: base.user }], { effort: 'low' }], 'normal text sends the Anthropic system/message contract');
  ok(!('temperature' in request.body) && !('top_p' in request.body) && !('stream' in request.body), 'normal text sends no sampling or stream parameters');
  eq(request.body.thinking, { type: 'disabled' }, 'ordinary low-effort text reserves its short cap for the answer');
  reset(claudeOk('legacy Claude caller'));
  await callLlm({ ...base, model: 'claude-sonnet-4' }); await settledLedger();
  eq(calls[0].body.model, 'claude-haiku-5-5', 'legacy Claude aliases cannot override the central model either');
  process.env.BOBBY_APP_TEXT_MODEL = 'claude-sonnet-5-5';
  reset(claudeOk('controlled rollback'));
  await callLlm({ ...base, model: 'gpt-4o-mini' }); await settledLedger();
  eq(calls[0].body.model, 'claude-sonnet-5-5', 'the central controlled override does reach normal text');
  delete process.env.BOBBY_APP_TEXT_MODEL;
  reset(claudeOk('higher effort'));
  await callLlm({ ...base, effort: 'high', maxTokens: 2000 }); await settledLedger();
  eq([calls[0].body.output_config.effort, 'thinking' in calls[0].body], ['high', false], 'plain higher-effort text keeps adaptive thinking available');

  // Account tier is a per-request decision, including concurrent requests in the same warm worker.
  reset(() => json({ stop_reason: 'end_turn', content: [{ type: 'thinking', thinking: privateMarker, signature: privateMarker },
    { type: 'text', text: 'Pro answer' }], usage: { input_tokens: 600, cache_read_input_tokens: 20, output_tokens: 400 } }));
  const proAnswer = await callLlm({ ...proBase, maxTokens: 100, model: 'claude-haiku-5-5' });
  eq(proAnswer, { text: 'Pro answer', toolInput: null, provider: 'anthropic', model: 'claude-opus-5-5' }, 'Pro text selects Opus and excludes thinking blocks');
  rows = await settledLedger();
  eq([calls[0].body.model, calls[0].body.max_tokens, calls[0].body.output_config.effort], ['claude-opus-5-5', 2048, 'low'], 'Pro raises short output ceilings for always-on thinking');
  ok(!('thinking' in calls[0].body) && !('temperature' in calls[0].body) && !('top_p' in calls[0].body), 'Opus ordinary text sends no unsupported thinking or sampling settings');
  eq([rows[0].model, rows[0].tokens_out, rows[0].ok], ['claude-opus-5-5', 400, true], 'Pro ledger records all billed output tokens');
  close(rows[0].usd, .010404, 'Pro ledger uses Opus cache pricing');
  reset(claudeOk('longer Pro answer'));
  await callLlm({ ...proBase, effort: 'medium', maxTokens: 8000 }); await settledLedger();
  eq([calls[0].body.max_tokens, calls[0].body.output_config.effort], [8000, 'medium'], 'Pro keeps an explicitly larger output ceiling and effort');
  const configuredFreeModel = process.env.BOBBY_APP_TEXT_MODEL, configuredProModel = process.env.BOBBY_PRO_TEXT_MODEL;
  const routedReply: Reply = call => json(claudeData(call.body.model));
  reset(routedReply, routedReply, routedReply);
  const interleaved = await Promise.all([callLlm({ ...base, tier: 'free' }), callLlm(proBase), callLlm({ ...base, tier: 'free' })]);
  await settledLedger();
  eq(interleaved.map(answer => answer.model), ['claude-haiku-5-5', 'claude-opus-5-5', 'claude-haiku-5-5'], 'interleaved free and Pro requests never inherit another account model');
  eq([process.env.BOBBY_APP_TEXT_MODEL, process.env.BOBBY_PRO_TEXT_MODEL], [configuredFreeModel, configuredProModel], 'tier routing never mutates global model configuration');

  // Forced tools preserve optional visible text and require exactly one matching object input.
  reset(() => json({ stop_reason: 'tool_use', content: [{ type: 'text', text: 'Validated ' }, { type: 'thinking', thinking: privateMarker },
    { type: 'tool_use', name: tool.name, input: { verdict: 'wait' } }, { type: 'text', text: 'answer' }], usage: { input_tokens: 100, output_tokens: 50 } }));
  eq(await callLlm({ ...base, tool, maxTokens: 1234, effort: 'medium' }), { text: 'Validated answer', toolInput: { verdict: 'wait' }, provider: 'anthropic', model: 'claude-haiku-5-5' }, 'visible text and named tool input are preserved');
  await settledLedger();
  eq([calls[0].body.tools, calls[0].body.tool_choice, calls[0].body.max_tokens, calls[0].body.output_config], [[{ name: tool.name, description: tool.description, input_schema: tool.parameters }], { type: 'tool', name: tool.name }, 1234, { effort: 'medium' }], 'forced-tool request uses Anthropic schemas and the caller cap');
  eq(calls[0].body.thinking, { type: 'disabled' }, 'a named forced tool disables thinking even at higher effort');
  for (const [label, blocks] of [
    ['missing', []], ['wrong-name', [{ type: 'tool_use', name: 'other', input: {} }]],
    ['null-input', [{ type: 'tool_use', name: tool.name, input: null }]],
    ['array-input', [{ type: 'tool_use', name: tool.name, input: [] }]],
    ['multiple', [{ type: 'tool_use', name: tool.name, input: {} }, { type: 'tool_use', name: tool.name, input: {} }]],
  ] as const) {
    reset(() => json({ stop_reason: 'tool_use', content: blocks, usage: { input_tokens: 100, output_tokens: 50 } }));
    await rejects(callLlm({ ...base, tool }), `${label} forced tool fails`);
    rows = await settledLedger();
    eq([calls.length, rows.length, rows[0].ok, rows[0].tokens_out], [1, 1, false, 50], `${label} tool stays a single failed billable attempt`);
  }
  for (const stop of ['refusal', 'max_tokens']) {
    reset(() => json(claudeData('unsafe partial', stop)));
    await rejects(callLlm(base), `${stop} normal text fails`, error => error instanceof LlmIncompleteError);
    rows = await settledLedger();
    eq([calls.length, rows[0].ok, rows[0].stop, rows[0].tokens_out], [1, false, stop, 50], `${stop} never retries or falls back, and still bills output`);
  }

  // Opus cannot force tools: structured JSON preserves the caller's toolInput contract safely.
  const originalProSchema = JSON.stringify(proTool.parameters);
  reset(() => json({ ...claudeData(JSON.stringify(validProInput)), content: [{ type: 'thinking', thinking: privateMarker },
    { type: 'text', text: JSON.stringify(validProInput) }] }));
  const proVerdict = await callLlm({ ...proBase, tool: proTool, maxTokens: 500 });
  rows = await settledLedger();
  eq([proVerdict.toolInput, proVerdict.provider, proVerdict.model], [validProInput, 'anthropic', 'claude-opus-5-5'], 'Opus schema output becomes the existing toolInput object');
  ok(!proVerdict.text.includes(privateMarker), 'Opus structured output excludes thinking text');
  eq([calls[0].body.model, calls[0].body.max_tokens, calls[0].body.output_config.format.type], ['claude-opus-5-5', 2048, 'json_schema'], 'Opus tools use native structured output with a thinking allowance');
  ok(!('thinking' in calls[0].body) && !('tools' in calls[0].body) && !('tool_choice' in calls[0].body), 'Opus structured tools never send disabled thinking or forced tools');
  const wireSchema = calls[0].body.output_config.format.schema;
  eq([wireSchema.type, wireSchema.required, wireSchema.additionalProperties, wireSchema.properties.verdict.enum],
    ['object', proTool.parameters.required, false, ['wait', 'buy']], 'wire schema keeps the result shape and allowed verdicts');
  ok(!('minimum' in wireSchema.properties.allocation) && !('maximum' in wireSchema.properties.allocation)
    && !('minLength' in wireSchema.properties.note) && !('maxLength' in wireSchema.properties.note)
    && !('maxItems' in wireSchema.properties.steps) && !('minimum' in wireSchema.properties.steps.items.properties.amount),
    'wire schema removes unsupported constraints recursively');
  eq(JSON.stringify(proTool.parameters), originalProSchema, 'wire normalization never changes the original validation schema');
  eq([rows[0].ok, rows[0].stop], [true, 'end_turn'], 'validated Opus JSON is one successful billed result');
  for (const [label, invalid] of [
    ['missing required field', { allocation: 25, note: 'valid', steps: [{ amount: 2 }] }],
    ['wrong type', { ...validProInput, allocation: '25' }],
    ['invalid enum', { ...validProInput, verdict: 'sell' }],
    ['range below minimum', { ...validProInput, allocation: -1 }],
    ['range above maximum', { ...validProInput, allocation: 101 }],
    ['string too short', { ...validProInput, note: 'x' }],
    ['string too long', { ...validProInput, note: 'x'.repeat(33) }],
    ['extra root property', { ...validProInput, other: true }],
    ['extra nested property', { ...validProInput, steps: [{ amount: 2, other: true }] }],
    ['nested integer type', { ...validProInput, steps: [{ amount: 1.5 }] }],
    ['nested numeric range', { ...validProInput, steps: [{ amount: 4 }] }],
    ['too few array items', { ...validProInput, steps: [] }],
    ['too many array items', { ...validProInput, steps: [{ amount: 1 }, { amount: 2 }, { amount: 3 }] }],
    ['null result', null], ['array result', [validProInput]],
  ] as const) {
    reset(claudeOk(JSON.stringify(invalid)));
    await rejects(callLlm({ ...proBase, tool: proTool }), `Pro ${label} fails original schema validation`);
    rows = await settledLedger();
    eq([calls.length, rows.length, rows[0].ok, rows[0].tokens_out], [1, 1, false, 50], `Pro ${label} stays a failed billed request without retry or fallback`);
  }
  reset(claudeOk(`{${privateMarker}`));
  await rejects(callLlm({ ...proBase, tool: proTool }), 'malformed Pro tool JSON fails without private payload leakage', error => error instanceof Error && !error.message.includes(privateMarker));
  rows = await settledLedger(); eq([calls.length, rows[0].ok], [1, false], 'malformed Pro tool JSON never becomes success or provider fallback');
  for (const stop of ['refusal', 'max_tokens']) {
    reset(() => json(claudeData(JSON.stringify(validProInput), stop)));
    await rejects(callLlm({ ...proBase, tool: proTool }), `Pro ${stop} cannot accept even complete-looking JSON`, error => error instanceof LlmIncompleteError);
    rows = await settledLedger();
    eq([calls.length, rows[0].ok, rows[0].stop], [1, false, stop], `Pro ${stop} never retries or falls back`);
  }

  // Quota/billing and absent keys can fail over; safety and transport errors cannot.
  for (const [label, refusal] of [['rate', rateLimited], ['billing', noCredit]] as const) {
    reset(refusal, openaiOk('backup'));
    eq(await callLlm({ ...base, maxTokens: 777 }), { text: 'backup', toolInput: null, provider: 'openai', model: 'gpt-6-luna' }, `${label} fallback answers and identifies the actual model`);
    rows = await settledLedger();
    eq(calls.map(call => new URL(call.url).hostname), ['api.anthropic.com', 'api.openai.com'], `${label} tries each provider once`);
    eq([calls[1].body.model, calls[1].body.max_completion_tokens, 'max_tokens' in calls[1].body, 'temperature' in calls[1].body, 'top_p' in calls[1].body], ['gpt-6-luna', 777, false, false, false], `${label} fallback keeps the cap and OpenAI parameter contract`);
    eq(rows.map(row => [row.provider, row.ok]), [['anthropic', false], ['openai', true]], `${label} records both provider attempts`);
  }
  reset(rateLimited, openaiOk('Pro quota backup'));
  eq(await callLlm({ ...proBase, maxTokens: 100 }), { text: 'Pro quota backup', toolInput: null, provider: 'openai', model: 'gpt-6-luna' }, 'Pro quota fallback reports the actual serving model');
  rows = await settledLedger();
  eq(rows.map(row => [row.model, row.provider, row.ok]), [['claude-opus-5-5', 'anthropic', false], ['gpt-6-luna', 'openai', true]], 'Pro fallback preserves both attempted and successful model metadata');
  const openaiToolReply = (input: unknown) => () => json({ choices: [{ finish_reason: 'tool_calls', message: { content: null,
    tool_calls: [{ type: 'function', function: { name: proTool.name, arguments: JSON.stringify(input) } }] } }],
    usage: { prompt_tokens: 100, completion_tokens: 50 } });
  reset(rateLimited, openaiToolReply(validProInput));
  const backedUpTool = await callLlm({ ...proBase, tool: proTool });
  rows = await settledLedger();
  eq([backedUpTool.toolInput, backedUpTool.provider, backedUpTool.model], [validProInput, 'openai', 'gpt-6-luna'], 'Pro tool fallback preserves validated input and actual serving model');
  reset(rateLimited, openaiToolReply({ ...validProInput, allocation: 101 }));
  await rejects(callLlm({ ...proBase, tool: proTool }), 'quota fallback cannot bypass original Pro tool bounds');
  rows = await settledLedger();
  eq(rows.map(row => [row.model, row.ok, row.tokens_out]), [['claude-opus-5-5', false, 0], ['gpt-6-luna', false, 50]], 'out-of-range fallback tools remain failed billable responses without a third attempt');
  delete process.env.ANTHROPIC_API_KEY;
  reset(openaiOk('key fallback')); await callLlm(base); await settledLedger();
  eq(calls.map(call => new URL(call.url).hostname), ['api.openai.com'], 'a missing Anthropic key spends only OpenAI');
  process.env.ANTHROPIC_API_KEY = 'test-anthropic';
  process.env.BOBBY_LLM_PRIMARY = 'openai';
  reset(() => json({ error: { code: 'insufficient_quota' } }, 429), claudeOk('reciprocal'));
  eq((await callLlm(base)).text, 'reciprocal', 'explicit OpenAI-first can fall back reciprocally'); await settledLedger();
  eq(calls.map(call => call.body.model), ['gpt-6-luna', 'claude-haiku-5-5'], 'reciprocal fallback returns to the central model');
  delete process.env.BOBBY_LLM_PRIMARY;
  reset(() => json({ error: { type: privateMarker, message: privateMarker } }, 400));
  await rejects(callLlm({ ...base, user: privateMarker }), 'HTTP errors redact provider payload', error => error instanceof Error && !error.message.includes(privateMarker));
  await settledLedger(); eq(calls.length, 1, 'an ordinary client error does not cross providers');
  reset(() => { throw new Error(privateMarker); });
  await rejects(callLlm({ ...base, user: privateMarker }), 'transport errors redact the thrown message', error => error instanceof Error && !error.message.includes(privateMarker));
  await settledLedger(); eq(calls.length, 1, 'a transport failure is not retried');

  // Fragmented Anthropic SSE emits only visible text, preserving conversation and usage.
  const messages = [{ role: 'user' as const, content: 'earlier question' }, { role: 'assistant' as const, content: 'earlier answer' }, { role: 'user' as const, content: 'follow-up' }];
  const deltas: string[] = [];
  reset(() => sse([start, { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
    { type: 'content_block_start', index: 1, content_block: { type: 'thinking', thinking: privateMarker } },
    { type: 'content_block_delta', index: 1, delta: { type: 'thinking_delta', thinking: privateMarker } },
    textDelta('héllo '), { type: 'content_block_delta', index: 2, delta: { type: 'input_json_delta', partial_json: privateMarker } }, textDelta('world'), ...stopEvents()]));
  eq(await streamText({ ...streamBase, messages, maxTokens: 1234, onDelta: text => { deltas.push(text); } }), { text: 'héllo world', toolInput: null, provider: 'anthropic', model: 'claude-haiku-5-5' }, 'fragmented UTF-8/CRLF stream is complete');
  eq(deltas, ['héllo ', 'world'], 'only visible text deltas reach the caller');
  rows = await settledLedger();
  eq([calls[0].body.model, calls[0].body.messages, calls[0].body.system, calls[0].body.max_tokens, calls[0].body.stream, calls[0].body.output_config], ['claude-haiku-5-5', messages, streamBase.system, 1234, true, { effort: 'low' }], 'stream keeps the conversation, system, cap and Anthropic effort');
  ok(!('temperature' in calls[0].body) && !('top_p' in calls[0].body), 'stream sends no sampling parameters');
  eq(calls[0].body.thinking, { type: 'disabled' }, 'ordinary low-effort streaming reserves its cap for visible output');
  eq(rows.map(row => [row.surface, row.tokens_in, row.tokens_cached, row.tokens_out, row.ok, row.stop]), [['openclaw-chat', 107, 5, 3, true, 'end_turn']], 'stream usage combines start/cache and terminal output');
  reset(() => sse([start, { type: 'content_block_start', content_block: { type: 'text', text: 'initial ' } }, textDelta('delta'), ...stopEvents()]));
  eq((await streamText(streamBase)).text, 'initial delta', 'initial text blocks also contribute visible text'); await settledLedger();
  let terminalCancelled = false;
  reset(() => new Response(new ReadableStream<Uint8Array>({ start(controller) {
    controller.enqueue(new TextEncoder().encode([start, textDelta('terminal'), ...stopEvents()].map(event => `data: ${JSON.stringify(event)}\n\n`).join('')));
  }, cancel() { terminalCancelled = true; } }), { headers: { 'Content-Type': 'text/event-stream' } }));
  eq((await streamText(streamBase)).text, 'terminal', 'message_stop completes even while the provider socket stays open');
  await settledLedger(); ok(terminalCancelled, 'the completed stream releases the still-open provider reader');

  const proDeltas: string[] = [];
  reset(() => sse([{ type: 'message_start', message: { usage: { input_tokens: 90, cache_read_input_tokens: 10, output_tokens: 0 } } },
    { type: 'content_block_start', index: 0, content_block: { type: 'thinking', thinking: '', signature: '' } },
    { type: 'content_block_delta', index: 0, delta: { type: 'thinking_delta', thinking: privateMarker } },
    { type: 'content_block_delta', index: 0, delta: { type: 'signature_delta', signature: privateMarker } },
    textDelta('Pro visible'),
    { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 120, output_tokens_details: { thinking_tokens: 90 } } },
    { type: 'message_stop' }]));
  eq(await streamText({ ...streamBase, tier: 'pro', maxTokens: 200, onDelta: text => { proDeltas.push(text); } }),
    { text: 'Pro visible', toolInput: null, provider: 'anthropic', model: 'claude-opus-5-5' }, 'Pro SSE returns only the completed visible answer and actual model');
  rows = await settledLedger();
  eq(proDeltas, ['Pro visible'], 'Pro thinking and signatures never become app text');
  eq([calls[0].body.model, calls[0].body.max_tokens, 'thinking' in calls[0].body, 'tool_choice' in calls[0].body],
    ['claude-opus-5-5', 2048, false, false], 'Pro stream reserves thinking tokens without unsupported flags');
  eq([rows[0].model, rows[0].tokens_in, rows[0].tokens_cached, rows[0].tokens_out, rows[0].tokens_reasoning, rows[0].ok],
    ['claude-opus-5-5', 100, 10, 120, 90, true], 'Pro SSE counts billed thinking output and cache usage');
  close(rows[0].usd, .002762, 'Pro SSE bills the verified Opus token rates');
  reset(() => sse([start, textDelta('Pro partial'), { type: 'error', error: { type: 'rate_limit_error' } }]));
  await rejects(streamText({ ...streamBase, tier: 'pro' }), 'Pro partial streaming cannot fail over after quota error');
  rows = await settledLedger(); eq([calls.length, rows[0].model, rows[0].ok], [1, 'claude-opus-5-5', false], 'Pro partial output remains one failed attempt without replay');

  // Before visible output a quota refusal can use the OpenAI SSE contract.
  reset(rateLimited, () => sse([{ choices: [{ delta: { content: 'backup' }, finish_reason: null }] },
    { choices: [{ delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 1000, completion_tokens: 5 } }, '[DONE]']));
  eq((await streamText({ ...streamBase, maxTokens: 222 })).text, 'backup', 'quota failover before streaming text completes on OpenAI');
  rows = await settledLedger();
  eq([calls.length, calls[1].body.max_completion_tokens, calls[1].body.stream_options], [2, 222, { include_usage: true }], 'OpenAI stream preserves cap and requests terminal usage');
  eq(rows.map(row => [row.provider, row.ok, row.stop]), [['anthropic', false, 'http_429'], ['openai', true, 'stop']], 'stream fallback accounts for both attempts');
  reset(() => sse([start, { type: 'error', error: { type: 'invalid_request_error', message: 'Your credit balance is too low to access the Anthropic API.' } }]),
    () => sse([{ choices: [{ delta: { content: 'stream billing backup' }, finish_reason: 'stop' }] }, '[DONE]']));
  eq((await streamText(streamBase)).text, 'stream billing backup', 'in-stream billing failure before visible text can fail over'); await settledLedger();
  eq(calls.length, 2, 'pre-text SSE billing fallback spends exactly one request per provider');

  // No spend when already cancelled; no replay after any visible output.
  const aborted = new AbortController(); aborted.abort();
  const ledgerCount = ledgerWrites.length;
  reset();
  await rejects(streamText({ ...streamBase, signal: aborted.signal }), 'pre-aborted stream rejects');
  await rejects(callLlm({ ...base, signal: aborted.signal }), 'pre-aborted plain text rejects');
  await settledLedger(); eq([calls.length, ledgerWrites.length], [0, ledgerCount], 'pre-abort costs zero provider calls and no usage rows');
  const duringBody = new AbortController();
  reset(() => {
    const response = json(claudeData('must not succeed'));
    response.json = async () => { duringBody.abort(); return claudeData('must not succeed'); };
    return response;
  });
  await rejects(callLlm({ ...base, signal: duringBody.signal }), 'cancellation during response decoding cannot return success');
  rows = await settledLedger();
  eq([calls.length, rows[0].ok, rows[0].stop, rows[0].tokens_out], [1, false, 'cancelled', 50], 'decoding cancellation keeps known billable usage without retry or failover');
  reset();
  await rejects(streamText({ ...streamBase, messages: [{ role: 'assistant', content: 'not a user ending' }] }), 'invalid conversation is rejected before network');
  eq(calls.length, 0, 'invalid conversation costs no request');
  for (const [label, ending, wantedStop] of [
    ['billing', [{ type: 'error', error: { type: 'invalid_request_error', message: 'Your credit balance is too low to access the Anthropic API.' } }], 'http_400'],
    ['rate', [{ type: 'error', error: { type: 'rate_limit_error' } }], 'http_429'],
    ['refusal', stopEvents('refusal'), 'refusal'], ['max_tokens', stopEvents('max_tokens'), 'max_tokens'],
  ] as const) {
    const visible: string[] = [];
    reset(() => sse([start, textDelta('partial'), ...ending]));
    await rejects(streamText({ ...streamBase, onDelta: text => { visible.push(text); } }), `${label} after partial text rejects`);
    rows = await settledLedger();
    eq([calls.length, visible, rows[0].ok, rows[0].stop, rows[0].tokens_in], [1, ['partial'], false, wantedStop, 107], `${label} partial stream never retries or falls back, and retains known input usage`);
  }
  const midstream = new AbortController();
  reset(() => sse([start, textDelta('partial'), textDelta('must not emit'), ...stopEvents()]));
  const cancelledDeltas: string[] = [];
  await rejects(streamText({ ...streamBase, signal: midstream.signal, onDelta: text => { cancelledDeltas.push(text); midstream.abort(); } }), 'caller cancellation after text rejects');
  rows = await settledLedger();
  eq([calls.length, cancelledDeltas, rows[0].ok, rows[0].stop], [1, ['partial'], false, 'cancelled'], 'caller cancellation never replays and records failed cancellation');
  reset(() => sse([start, textDelta('partial')]));
  await rejects(streamText(streamBase), 'early EOF cannot turn a partial answer into success', error => error instanceof LlmIncompleteError);
  rows = await settledLedger(); eq([calls.length, rows[0].ok], [1, false], 'early EOF remains one failed billable stream');
  reset(() => sse([start, '{invalid json}']));
  await rejects(streamText(streamBase), 'malformed stream JSON fails without payload leakage', error => error instanceof Error && !error.message.includes('invalid json'));
  rows = await settledLedger(); eq([calls.length, rows[0].ok, rows[0].stop], [1, false, 'stream_error'], 'malformed stream is not retried or passed to another provider');
  reset(() => sse([start, textDelta('partial'), ...stopEvents()]));
  await rejects(streamText({ ...streamBase, onDelta: () => { throw new Error(privateMarker); } }), 'caller delta errors are redacted', error => error instanceof Error && !error.message.includes(privateMarker));
  await settledLedger(); eq(calls.length, 1, 'a callback failure after emitted text never replays');

  ok(!JSON.stringify(serviceWrites).includes(privateMarker) && !JSON.stringify(logs).includes(privateMarker), 'usage, health writes and logs omit private prompts, thinking and provider payloads');
  ok(!/test-anthropic|test-openai/.test(JSON.stringify(serviceWrites) + JSON.stringify(logs)), 'observability does not store synthetic provider keys');
  console.log(`llm-ledger: ${checks} checks passed`);
} finally {
  await settledLedger();
  globalThis.fetch = originalFetch;
  console.error = originalError;
  console.warn = originalWarn;
}
