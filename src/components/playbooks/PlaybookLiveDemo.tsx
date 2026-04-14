// ============================================================
// PlaybookLiveDemo — fires a real MCP tool call against /api/mcp-http
// and renders a human-first summary. JSON payload is collapsible
// and never shown first. Every request tags meta.demo_source so
// public metrics can filter this traffic out.
// ============================================================

import { useState } from 'react';
import { ChevronDown, Clock, Radio, Zap } from 'lucide-react';
import type { PlaybookDemo } from '@/data/playbooks';

interface PlaybookLiveDemoProps {
  demo: PlaybookDemo;
}

type DemoState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'success'; result: unknown; ranAt: string }
  | { kind: 'error'; message: string };

interface WheelLegInput {
  asset: string;
  side: string;
  strike: number;
  expiry_days: number;
}

function isWheelLeg(v: unknown): v is WheelLegInput {
  if (!v || typeof v !== 'object') return false;
  const r = v as Record<string, unknown>;
  return typeof r.asset === 'string' && typeof r.side === 'string';
}

export default function PlaybookLiveDemo({ demo }: PlaybookLiveDemoProps) {
  const [input, setInput] = useState<unknown>(demo.defaultInput);
  const [state, setState] = useState<DemoState>({ kind: 'idle' });
  const [jsonOpen, setJsonOpen] = useState(false);

  async function run() {
    setState({ kind: 'loading' });
    try {
      const args = { ...demo.buildArgs(input), demo_source: 'playbooks_page' };
      const res = await fetch('/api/mcp-http', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: Date.now(),
          method: 'tools/call',
          params: { name: demo.tool, arguments: args },
        }),
      });
      const payload = await res.json();
      if (payload?.error) {
        setState({ kind: 'error', message: String(payload.error.message || 'Tool error') });
        return;
      }
      setState({ kind: 'success', result: payload?.result, ranAt: new Date().toISOString() });
    } catch (err) {
      setState({ kind: 'error', message: err instanceof Error ? err.message : 'Unknown error' });
    }
  }

  const ctaLabel = demo.ctaOverride || 'Pressure-test this playbook';

  return (
    <div className="rounded-2xl border border-white/[0.04] bg-black/20 p-4">
      {/* ── Input ── */}
      <div className="mb-4">
        <label className="mb-2 block font-mono text-[10px] uppercase tracking-[0.18em] text-white/50">
          {demo.inputLabel}
        </label>
        {demo.inputType === 'symbol' || demo.inputType === 'chain' ? (
          <input
            type="text"
            value={String(input ?? '')}
            onChange={(e) => setInput(e.target.value)}
            placeholder={demo.inputPlaceholder}
            className="w-full rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2 font-mono text-sm text-white placeholder:text-white/30 focus:border-green-500/40 focus:outline-none"
          />
        ) : demo.inputType === 'wheel_leg' && isWheelLeg(input) ? (
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            <select
              value={input.asset}
              onChange={(e) => setInput({ ...input, asset: e.target.value })}
              className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2 font-mono text-sm text-white focus:border-green-500/40 focus:outline-none"
            >
              <option value="eth">ETH</option>
              <option value="cbbtc">cbBTC</option>
            </select>
            <select
              value={input.side}
              onChange={(e) => setInput({ ...input, side: e.target.value })}
              className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2 font-mono text-sm text-white focus:border-green-500/40 focus:outline-none"
            >
              <option value="put">Put</option>
              <option value="call">Call</option>
            </select>
            <input
              type="number"
              value={input.strike}
              onChange={(e) => setInput({ ...input, strike: Number(e.target.value) })}
              placeholder="Strike"
              className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2 font-mono text-sm text-white focus:border-green-500/40 focus:outline-none"
            />
            <input
              type="number"
              value={input.expiry_days}
              onChange={(e) => setInput({ ...input, expiry_days: Number(e.target.value) })}
              placeholder="Days"
              className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2 font-mono text-sm text-white focus:border-green-500/40 focus:outline-none"
            />
          </div>
        ) : null}
      </div>

      {/* ── CTA ── */}
      <button
        onClick={run}
        disabled={state.kind === 'loading'}
        className="inline-flex items-center gap-2 rounded-lg border border-green-500/30 bg-green-500/10 px-4 py-2 font-mono text-xs uppercase tracking-[0.16em] text-green-400 transition-colors hover:bg-green-500/20 disabled:opacity-50"
      >
        <Zap className="h-3.5 w-3.5" />
        {state.kind === 'loading' ? 'Bobby is pressure-testing this setup...' : ctaLabel}
      </button>

      {/* ── Source metadata ── */}
      <div className="mt-3 flex flex-wrap items-center gap-4 font-mono text-[10px] uppercase tracking-[0.14em] text-white/40">
        <span className="inline-flex items-center gap-1.5">
          <Radio className="h-3 w-3" />
          {demo.sourceLabel}
        </span>
        {demo.freshnessLabel && (
          <span className="inline-flex items-center gap-1.5">
            <Clock className="h-3 w-3" />
            {demo.freshnessLabel}
          </span>
        )}
      </div>

      {/* ── Result pane ── */}
      {state.kind === 'success' && (
        <div className="mt-4 rounded-xl border border-white/[0.04] bg-white/[0.02] p-4">
          {(() => {
            const summary = demo.summarize(state.result);
            return (
              <>
                <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-green-400/70 mb-2">
                  Bobby verdict
                </div>
                <div className="text-base font-semibold leading-snug text-white">{summary.headline}</div>
                {summary.detail && <p className="mt-2 text-sm leading-6 text-white/65">{summary.detail}</p>}
                <div className="mt-3 flex flex-wrap items-center gap-4 font-mono text-[10px] uppercase tracking-[0.12em] text-white/35">
                  <span>ran at {state.ranAt}</span>
                  <span>{demo.sourceLabel}</span>
                </div>
                <button
                  onClick={() => setJsonOpen((o) => !o)}
                  className="mt-4 inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.14em] text-white/40 hover:text-white/70"
                >
                  <ChevronDown className={`h-3 w-3 transition-transform ${jsonOpen ? 'rotate-180' : ''}`} />
                  {jsonOpen ? 'Hide raw payload' : 'Show raw payload'}
                </button>
                {jsonOpen && (
                  <pre className="mt-3 max-h-96 overflow-auto rounded-lg border border-white/[0.04] bg-black/40 p-3 font-mono text-[11px] leading-relaxed text-white/60">
                    {JSON.stringify(state.result, null, 2)}
                  </pre>
                )}
                <p className="mt-4 border-t border-white/[0.04] pt-3 text-[11px] italic text-white/40">
                  Examples of how traders use Bobby before committing capital. Not trading advice.
                </p>
              </>
            );
          })()}
        </div>
      )}

      {state.kind === 'error' && (
        <div className="mt-4 rounded-xl border border-[#ff716a]/20 bg-[#ff716a]/[0.04] p-4">
          <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#ff716a] mb-2">Tool error</div>
          <div className="text-sm text-white/70">{state.message}</div>
          <a
            href="/protocol/harness"
            className="mt-3 inline-block font-mono text-[10px] uppercase tracking-[0.14em] text-green-400/70 hover:text-green-400"
          >
            See Harness Console →
          </a>
        </div>
      )}
    </div>
  );
}
