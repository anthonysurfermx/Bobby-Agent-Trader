// Audit3 BP-08 — a faithful PostgREST emulation for public.mcp_payment_challenges.
// Differences from the r2 test's emulation that matter here:
//   * challenge_id is uuid-typed: a filter literal that Postgres cannot cast to uuid
//     is answered 400 / 22P02 exactly like PostgREST does (verified against Postgres 17).
//   * the logic tree (or=(...), and(...)) is parsed with PostgREST's grammar
//     (field.op.value, value = many (noneOf ",)")), not substring checks.
//   * timestamptz columns compare as instants, text as text, SQL NULL semantics for eq.
//   * the status CHECK constraint and the tx_hash UNIQUE constraint are enforced.
import { randomUUID } from 'node:crypto';

export type Row = Record<string, any>;
type Node =
  | { kind: 'filter'; field: string; op: string; value: string; negated: boolean }
  | { kind: 'logic'; op: 'and' | 'or'; negated: boolean; children: Node[] };

const COLS: Record<string, 'uuid' | 'timestamptz' | 'int' | 'text' | 'jsonb'> = {
  challenge_id: 'uuid', tool_name: 'text', request_hash: 'text', price_wei: 'text', status: 'text',
  expires_at: 'timestamptz', payer_address: 'text', tx_hash: 'text', external_agent: 'text', metadata: 'jsonb',
  created_at: 'timestamptz', consumed_at: 'timestamptz', client_secret_hash: 'text', result_json: 'jsonb',
  error: 'text', attempts: 'int', completed_at: 'timestamptz',
};
const STATUSES = new Set(['pending', 'consumed', 'expired', 'in_progress', 'completed', 'retryable_failure']);

class PgError extends Error { constructor(public code: string, message: string, public http = 400) { super(message); } }

function uuidNorm(v: string): string {
  const s = v.replace(/^\{|\}$/g, '').replace(/-/g, '').toLowerCase();
  if (!/^[0-9a-f]{32}$/.test(s)) throw new PgError('22P02', `invalid input syntax for type uuid: "${v}"`);
  return s;
}
function tsNorm(v: string): number {
  const t = Date.parse(v);
  if (Number.isNaN(t)) throw new PgError('22007', `invalid input syntax for type timestamp with time zone: "${v}"`);
  return t;
}

// ---- PostgREST logic-tree grammar ----
function parseTree(src: string, pos = { i: 0 }): Node {
  // Expr: [not.](and|or)(tree, tree, ...)
  const rest = src.slice(pos.i);
  const m = rest.match(/^(not\.)?(and|or)\(/);
  if (m) {
    pos.i += m[0].length;
    const children: Node[] = [];
    for (;;) {
      children.push(parseTree(src, pos));
      if (src[pos.i] === ',') { pos.i += 1; continue; }
      if (src[pos.i] === ')') { pos.i += 1; break; }
      throw new PgError('PGRST100', `unexpected "${src[pos.i] ?? 'end'}" in logic tree at ${pos.i}`);
    }
    return { kind: 'logic', op: m[2] as 'and' | 'or', negated: Boolean(m[1]), children };
  }
  // Stmnt: field.[not.]op.value   value = many (noneOf ",)")  (quoted values not needed here)
  const fm = rest.match(/^([A-Za-z_][A-Za-z0-9_]*)\./);
  if (!fm) throw new PgError('PGRST100', `expected field at ${pos.i}`);
  pos.i += fm[0].length;
  let negated = false;
  if (src.startsWith('not.', pos.i)) { negated = true; pos.i += 4; }
  const om = src.slice(pos.i).match(/^(eq|neq|gt|gte|lt|lte|like|ilike|is|in)\./);
  if (!om) throw new PgError('PGRST100', `unknown operator at ${pos.i}`);
  pos.i += om[0].length;
  let value = '';
  while (pos.i < src.length && src[pos.i] !== ',' && src[pos.i] !== ')') value += src[pos.i++];
  return { kind: 'filter', field: fm[1], op: om[1], value, negated };
}
function parseTopFilter(field: string, raw: string): Node {
  // top-level: field=[not.]op.value  where value is the WHOLE rest (pSingleVal)
  let negated = false; let s = raw;
  if (s.startsWith('not.')) { negated = true; s = s.slice(4); }
  const om = s.match(/^(eq|neq|gt|gte|lt|lte|like|ilike|is|in)\.(.*)$/s);
  if (!om) throw new PgError('PGRST100', `unknown operator in "${field}=${raw}"`);
  return { kind: 'filter', field, op: om[1], value: om[2], negated };
}

function evalFilter(row: Row, n: Node): boolean {
  if (n.kind === 'logic') {
    const r = n.op === 'and' ? n.children.every((c) => evalFilter(row, c)) : n.children.some((c) => evalFilter(row, c));
    return n.negated ? !r : r;
  }
  const type = COLS[n.field];
  if (!type) throw new PgError('42703', `column ${n.field} does not exist`);
  const rv = row[n.field];
  let r: boolean;
  if (n.op === 'is') {
    r = n.value === 'null' ? rv === null || rv === undefined : n.value === 'not.null' ? rv !== null && rv !== undefined : false;
  } else {
    // cast the literal FIRST (Postgres does, whatever the row holds) — this is where a bytes32 id fails
    let lit: string | number; let val: string | number | null;
    if (type === 'uuid') { lit = uuidNorm(n.value); val = rv == null ? null : uuidNorm(String(rv)); }
    else if (type === 'timestamptz') { lit = tsNorm(n.value); val = rv == null ? null : tsNorm(String(rv)); }
    else if (type === 'int') { lit = Number(n.value); val = rv == null ? null : Number(rv); }
    else { lit = n.value; val = rv == null ? null : String(rv); }
    if (val === null) r = false; // SQL NULL never satisfies eq/gt/lt
    else if (n.op === 'eq') r = val === lit;
    else if (n.op === 'neq') r = val !== lit;
    else if (n.op === 'gt') r = val > lit;
    else if (n.op === 'gte') r = val >= lit;
    else if (n.op === 'lt') r = val < lit;
    else if (n.op === 'lte') r = val <= lit;
    else throw new PgError('PGRST100', `operator ${n.op} not emulated`);
  }
  return n.negated ? !r : r;
}

export function parseQuery(u: URL): { where: Node[]; select: string[] | null } {
  const where: Node[] = []; let select: string[] | null = null;
  for (const [k, v] of u.searchParams) {
    if (k === 'select') { select = v.split(','); continue; }
    if (k === 'order' || k === 'limit' || k === 'offset' || k === 'on_conflict') continue;
    if (k === 'or' || k === 'and' || k === 'not.or' || k === 'not.and') {
      const pos = { i: 0 }; const node = parseTree(`${k}${v}`, pos);
      if (pos.i !== `${k}${v}`.length) throw new PgError('PGRST100', 'trailing characters in logic tree');
      where.push(node); continue;
    }
    where.push(parseTopFilter(k, v));
  }
  return { where, select };
}

export interface Emu {
  rows: Row[];
  calls: { method: string; url: string; body?: string; status: number }[];
  handle(url: URL, init?: RequestInit): Response;
  reset(): void;
  /** Reinterpret challenge_id as text (a hypothetical where the on-chain bytes32 IS the row key). */
  idType: 'uuid' | 'text';
}

export function createEmu(): Emu {
  const emu: Emu = {
    rows: [], calls: [], idType: 'uuid',
    reset() { emu.rows.length = 0; emu.calls.length = 0; },
    handle(u, init) {
      const method = (init?.method || 'GET').toUpperCase();
      const body = typeof init?.body === 'string' ? init.body : undefined;
      const prefer = String((init?.headers as Record<string, string> | undefined)?.Prefer ?? (init?.headers as Record<string, string> | undefined)?.prefer ?? '');
      const json = (v: unknown, status: number) => new Response(v === undefined ? null : JSON.stringify(v), { status, headers: { 'content-type': 'application/json' } });
      const rec = (status: number) => emu.calls.push({ method, url: u.toString(), body, status });
      try {
        COLS.challenge_id = emu.idType === 'text' ? 'text' : 'uuid';
        const { where, select } = parseQuery(u);
        const match = (r: Row) => where.every((n) => evalFilter(r, n));
        const project = (r: Row) => select ? Object.fromEntries(select.map((c) => [c, r[c] ?? null])) : { ...r };
        const validate = (r: Row, self: Row | null) => {
          if (r.status !== undefined && !STATUSES.has(r.status)) throw new PgError('23514', `new row for relation "mcp_payment_challenges" violates check constraint "mcp_payment_challenges_status_check"`);
          // UNIQUE(tx_hash): another row (not the one being updated) already holds this hash
          if (r.tx_hash != null && emu.rows.some((o) => o !== self && o.tx_hash === r.tx_hash)) throw new PgError('23505', 'duplicate key value violates unique constraint "mcp_payment_challenges_tx_hash_key"', 409);
        };
        if (method === 'POST') {
          const b = JSON.parse(body || '{}');
          const now = new Date();
          const r: Row = { challenge_id: randomUUID(), status: 'pending', expires_at: new Date(now.getTime() + 600_000).toISOString(), created_at: now.toISOString(),
            request_hash: null, payer_address: null, tx_hash: null, external_agent: null, metadata: {}, consumed_at: null, client_secret_hash: null, result_json: null, error: null, attempts: 0, completed_at: null, ...b };
          validate(r, null); emu.rows.push(r); rec(201);
          return json(prefer.includes('representation') ? [project(r)] : undefined, 201);
        }
        if (method === 'PATCH') {
          const patch = JSON.parse(body || '{}');
          const hit = emu.rows.filter(match);
          for (const r of hit) { const next = { ...r, ...patch }; validate(next, r); Object.assign(r, patch); }
          rec(prefer.includes('representation') ? 200 : 204);
          return json(prefer.includes('representation') ? hit.map(project) : undefined, prefer.includes('representation') ? 200 : 204);
        }
        if (method === 'GET') { const out = emu.rows.filter(match).map(project); rec(200); return json(out, 200); }
        throw new PgError('PGRST', `method ${method} not emulated`, 405);
      } catch (e) {
        if (e instanceof PgError) { rec(e.http); return json({ code: e.code, message: e.message, details: null, hint: null }, e.http); }
        throw e;
      }
    },
  };
  return emu;
}
