// Eval (2026-09-29, docs/ai/2026-09-29-bobby-intelligence-brief.md §2c): would the recorded model answers
// survive the production /desk path? Offline, no API calls: replays every stored debate through the same
// schema as api/_lib/desk-debate.ts (Paragraph 20–1800 chars, verdict wait|review, direction) and the real
// reviewDeskOutput guard, and counts the calls that would have hit production's 650-token cap.
// Run: node_modules/.bin/tsx scripts/eval/desk-guard-check.mts
import { readFileSync } from 'node:fs';
import { z } from 'zod';
import { reviewDeskOutput, DeskOutputRejected } from '../../api/_lib/desk-debate.ts';

// Mirrors desk-debate.ts (Paragraph / Argument / Verdict are module-private there).
const Paragraph = z.string().trim().min(20).max(1800);
const Argument = z.object({ analysis: Paragraph });
const Verdict = Argument.extend({ verdict: z.enum(['wait', 'review']), direction: z.enum(['long', 'short', 'none']) });
const PROD_MAX_TOKENS = 650;

type Call = { model: string; tout: number; stop: string; text: string };
type Run = { case: string; name: string; calls?: Call[]; error?: string };

const parse = (t: string) => { try { return JSON.parse(t.trim().replace(/^```(?:json)?\s*|\s*```$/g, '')); } catch { return null; } };
const strictParse = (t: string) => { try { return JSON.parse(t); } catch { return null; } };

const files = ['docs/ai/data/2026-09-29-desk-model-matrix.json', 'docs/ai/data/2026-09-29-desk-slider-levels.json'];
const rows: Record<string, { runs: number; schemaFail: number; fenced: number; guard: Record<string, number>; overCap: number; calls: number; wait: number; review: number }> = {};

for (const file of files) {
  for (const run of JSON.parse(readFileSync(file, 'utf8')) as Run[]) {
    if (!run.calls) continue;
    const key = run.name;
    const r = rows[key] ??= { runs: 0, schemaFail: 0, fenced: 0, guard: {}, overCap: 0, calls: 0, wait: 0, review: 0 };
    r.runs++;
    r.calls += run.calls.length;
    r.overCap += run.calls.filter((c) => c.tout > PROD_MAX_TOKENS).length;
    // Production parses the raw content with JSON.parse: a ```json fence fails there even if the text is fine.
    if (run.calls.some((c) => strictParse(c.text) === null && parse(c.text) !== null)) r.fenced++;
    const [a, red, c] = run.calls.map((x) => parse(x.text));
    const ok = Argument.safeParse(a).success && Argument.safeParse(red).success && Verdict.safeParse(c).success;
    if (!ok) { r.schemaFail++; continue; }
    const cio = Verdict.parse(c);
    cio.verdict === 'wait' ? r.wait++ : r.review++;
    try {
      reviewDeskOutput({ alpha: a.analysis, red: red.analysis, cio: cio.analysis, verdict: cio.verdict, direction: cio.verdict === 'wait' ? 'none' : cio.direction });
    } catch (e) {
      const reason = e instanceof DeskOutputRejected ? e.reason : 'error';
      r.guard[reason] = (r.guard[reason] ?? 0) + 1;
    }
  }
}

console.log(['config', 'debates', 'schema fail', 'fenced JSON', 'guard reject', `calls > ${PROD_MAX_TOKENS} tok`, 'wait/review'].join('\t'));
for (const [name, r] of Object.entries(rows)) {
  const guard = Object.entries(r.guard).map(([k, v]) => `${v} ${k}`).join(', ') || '0';
  console.log([name, r.runs, r.schemaFail, r.fenced, guard, `${r.overCap}/${r.calls}`, `${r.wait}/${r.review}`].join('\t'));
}
