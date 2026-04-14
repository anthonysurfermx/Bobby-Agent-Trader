// ============================================================
// /protocol/sandbox — Live Adversarial Simulation
// Pressure-test a playbook in a glass-box SSE stream:
// Alpha Hunter → Red Team → CIO → Judge → 11 Guardrails → Verdict.
// Simulation only. No capital moves. No on-chain commit.
// ============================================================

import { useEffect, useMemo, useRef, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { motion, AnimatePresence } from 'framer-motion';
import KineticShell from '@/components/kinetic/KineticShell';
import { PLAYBOOKS } from '@/data/playbooks';

// ── Types ──────────────────────────────────────────────────
type AgentPhase = 'alpha_hunter' | 'red_team' | 'cio' | 'judge' | 'guardrails';
type GuardrailStatus = 'pending' | 'pass' | 'fail' | 'skip';
type VerdictAction = 'EXECUTE' | 'YIELD_PARK' | 'BLOCKED';

interface MarketContext {
  ticker: string;
  price: number | null;
  change24hPct: number | null;
  high24h: number | null;
  low24h: number | null;
  volUsd24h: number | null;
  source: 'okx' | 'unavailable';
}

interface BobbyIntel {
  regime?: string;
  fearGreed?: number | string;
  mood?: string;
  dynamicConviction?: number;
  technicalLeader?: string;
  available: boolean;
}

interface InterruptionState {
  phase: string;
  message: string;
  partialText?: string;
}

interface FeedRun {
  id: string;
  created_at: string;
  playbook_slug: string;
  ticker: string;
  cio_action: string | null;
  cio_conviction: number | null;
  verdict_action: string | null;
  guardrails_passed: number | null;
  guardrails_total: number | null;
  status: string;
  error_phase: string | null;
  market_snapshot?: MarketContext | null;
}

const TICKER_PRESETS = ['BTC', 'ETH', 'SOL', 'OKB', 'BNB', 'XRP', 'DOGE'] as const;
const RUN_COUNT_KEY = 'bobby_sandbox_runs';

interface GuardrailCell {
  id: string;
  label: string;
  status: GuardrailStatus;
}

interface AgentState {
  text: string;
  status: 'idle' | 'thinking' | 'done';
}

interface Verdict {
  action: VerdictAction;
  conviction: number;
  guardrailsPassed: number;
  guardrailsFailed: number;
  guardrailsTotal: number;
  reason: string;
}

const AGENT_META: Record<AgentPhase, { label: string; accent: string; glyph: string; tagline: string }> = {
  alpha_hunter: { label: 'Alpha Hunter', accent: '#6dfe9c', glyph: '>>>', tagline: 'Bull thesis' },
  red_team:     { label: 'Red Team',     accent: '#ff716a', glyph: ':::', tagline: 'Adversarial rebuttal' },
  cio:          { label: 'CIO',          accent: '#fcc025', glyph: '[!]', tagline: 'Capital decision' },
  judge:        { label: 'Judge',        accent: '#60a5fa', glyph: '(6)', tagline: '6-dimension audit' },
  guardrails:   { label: 'Guardrails',   accent: '#c084fc', glyph: '###', tagline: 'Fail-closed checks' },
};

const ACTION_STYLE: Record<VerdictAction, { bg: string; border: string; text: string; label: string }> = {
  EXECUTE:    { bg: 'bg-[#6dfe9c]/10', border: 'border-[#6dfe9c]/40', text: 'text-[#6dfe9c]', label: 'EXECUTE' },
  YIELD_PARK: { bg: 'bg-[#fcc025]/10', border: 'border-[#fcc025]/40', text: 'text-[#fcc025]', label: 'YIELD PARK' },
  BLOCKED:    { bg: 'bg-[#ff716a]/10', border: 'border-[#ff716a]/40', text: 'text-[#ff716a]', label: 'BLOCKED' },
};

// ── Page ───────────────────────────────────────────────────
export default function BobbySandboxPage() {
  // Read ?playbook= from URL
  const initialPlaybook = (() => {
    if (typeof window === 'undefined') return PLAYBOOKS[0]?.slug ?? '';
    const params = new URLSearchParams(window.location.search);
    const requested = params.get('playbook');
    if (requested && PLAYBOOKS.some((p) => p.slug === requested)) return requested;
    return PLAYBOOKS[0]?.slug ?? '';
  })();

  const [playbookSlug, setPlaybookSlug] = useState<string>(initialPlaybook);
  const [ticker, setTicker] = useState('BTC');
  const [running, setRunning] = useState(false);
  const [agents, setAgents] = useState<Record<AgentPhase, AgentState>>({
    alpha_hunter: { text: '', status: 'idle' },
    red_team:     { text: '', status: 'idle' },
    cio:          { text: '', status: 'idle' },
    judge:        { text: '', status: 'idle' },
    guardrails:   { text: '', status: 'idle' },
  });
  const [guardrails, setGuardrails] = useState<GuardrailCell[]>([]);
  const [market, setMarket] = useState<MarketContext | null>(null);
  const [intel, setIntel] = useState<BobbyIntel | null>(null);
  const [cioVerdict, setCioVerdict] = useState<{ action: VerdictAction; conviction: number } | null>(null);
  const [judgeScores, setJudgeScores] = useState<Record<string, number>>({});
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [interruption, setInterruption] = useState<InterruptionState | null>(null);
  const [runCount, setRunCount] = useState(0);
  const [feed, setFeed] = useState<FeedRun[]>([]);
  const [feedLoading, setFeedLoading] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const verdictRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(RUN_COUNT_KEY);
      if (raw) setRunCount(parseInt(raw, 10) || 0);
    } catch {}
  }, []);

  async function loadFeed() {
    setFeedLoading(true);
    try {
      const r = await fetch('/api/sandbox-runs?limit=20');
      const data = await r.json();
      if (data.ok && Array.isArray(data.runs)) setFeed(data.runs);
    } catch {
      // non-fatal
    } finally {
      setFeedLoading(false);
    }
  }

  useEffect(() => {
    loadFeed();
  }, []);

  const selectedPlaybook = useMemo(
    () => PLAYBOOKS.find((p) => p.slug === playbookSlug),
    [playbookSlug]
  );

  // Scroll to verdict when it arrives
  useEffect(() => {
    if (verdict && verdictRef.current) {
      verdictRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [verdict]);

  function resetState() {
    setAgents({
      alpha_hunter: { text: '', status: 'idle' },
      red_team:     { text: '', status: 'idle' },
      cio:          { text: '', status: 'idle' },
      judge:        { text: '', status: 'idle' },
      guardrails:   { text: '', status: 'idle' },
    });
    setGuardrails([]);
    setMarket(null);
    setIntel(null);
    setCioVerdict(null);
    setJudgeScores({});
    setVerdict(null);
    setError(null);
    setInterruption(null);
  }

  function bumpRunCount() {
    try {
      const next = runCount + 1;
      setRunCount(next);
      localStorage.setItem(RUN_COUNT_KEY, String(next));
    } catch {}
  }

  async function runSandbox() {
    if (running) return;
    resetState();
    setRunning(true);
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    try {
      const res = await fetch('/api/sandbox-run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playbookSlug, ticker: ticker.trim() || 'BTC' }),
        signal: ctrl.signal,
      });
      if (res.status === 429) {
        const data = await res.json().catch(() => ({ message: 'Rate limit exceeded' }));
        setError(data.message || 'Rate limit exceeded');
        return;
      }
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });

        // Parse SSE blocks: each block ends with \n\n
        const blocks = buf.split('\n\n');
        buf = blocks.pop() ?? '';

        for (const block of blocks) {
          const lines = block.split('\n');
          let eventName = 'message';
          let dataRaw = '';
          for (const ln of lines) {
            if (ln.startsWith('event: ')) eventName = ln.slice(7).trim();
            else if (ln.startsWith('data: ')) dataRaw += ln.slice(6);
          }
          if (!dataRaw) continue;
          let payload: any;
          try { payload = JSON.parse(dataRaw); } catch { continue; }
          handleEvent(eventName, payload);
        }
      }
    } catch (err: any) {
      if (err?.name !== 'AbortError') {
        setError(err?.message || 'Stream failed');
      }
    } finally {
      setRunning(false);
    }
  }

  function handleEvent(name: string, payload: any) {
    switch (name) {
      case 'meta': {
        // Seed the gauntlet with pending cells
        const cells: GuardrailCell[] = (payload.guardrails ?? []).map((g: any) => ({
          id: g.id,
          label: g.label,
          status: 'pending' as const,
        }));
        setGuardrails(cells);
        break;
      }
      case 'phase_start': {
        const phase = payload.phase as AgentPhase;
        setAgents((s) => ({ ...s, [phase]: { ...s[phase], status: 'thinking' } }));
        break;
      }
      case 'phase_token': {
        const phase = payload.phase as AgentPhase;
        setAgents((s) => ({
          ...s,
          [phase]: { text: s[phase].text + payload.token, status: 'thinking' },
        }));
        break;
      }
      case 'phase_end': {
        const phase = payload.phase as AgentPhase;
        setAgents((s) => ({ ...s, [phase]: { ...s[phase], status: 'done' } }));
        break;
      }
      case 'market_context':
        setMarket(payload as MarketContext);
        break;
      case 'bobby_intel':
        setIntel(payload as BobbyIntel);
        break;
      case 'cio_verdict':
        setCioVerdict({ action: payload.action, conviction: payload.conviction });
        break;
      case 'judge_scores':
        setJudgeScores(payload.scores || {});
        break;
      case 'guardrail':
        setGuardrails((list) =>
          list.map((c) => (c.id === payload.id ? { ...c, status: payload.status } : c))
        );
        break;
      case 'verdict':
        setVerdict(payload as Verdict);
        bumpRunCount();
        break;
      case 'error':
        setInterruption({
          phase: payload.phase || 'unknown',
          message: payload.message || 'Stream error',
          partialText: payload.partialText,
        });
        // If partial text exists, try to attach it to the right agent card
        if (payload.partialText && payload.phase) {
          const phase = payload.phase as AgentPhase;
          if (['alpha_hunter', 'red_team', 'cio'].includes(phase)) {
            setAgents((s) => ({
              ...s,
              [phase]: { text: s[phase].text || payload.partialText, status: 'done' },
            }));
          }
        }
        break;
      case 'done':
        // Refresh feed so the new run shows up
        loadFeed();
        break;
    }
  }

  return (
    <>
      <Helmet>
        <title>Sandbox | Bobby Agent Trader</title>
        <meta
          name="description"
          content="Pressure-test a playbook in a live adversarial simulation. Watch Alpha Hunter, Red Team, CIO, Judge, and 11 guardrails run in real time."
        />
      </Helmet>
      <KineticShell activeTab="sandbox">
        <div className="mx-auto max-w-7xl px-4 py-10 md:px-8">
          {/* ── Header ── */}
          <header className="mb-8">
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-[#6dfe9c]/20 bg-[#6dfe9c]/10 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.24em] text-[#6dfe9c]">
              Live adversarial simulation · ~60–90s · No capital moves
            </div>
            <h1 className="max-w-3xl font-['Space_Grotesk'] text-4xl font-bold leading-tight md:text-5xl">
              Sandbox — Watch Bobby Pressure-Test a Trade
            </h1>
            <p className="mt-4 max-w-3xl text-base leading-7 text-white/65">
              Pick a playbook, choose a ticker, and watch the full adversarial debate run in real time.
              Alpha Hunter builds the thesis, Red Team attacks it, CIO decides, Judge audits, and 11
              guardrails gate the outcome. Simulation only — Bobby never moves capital here.
            </p>
          </header>

          <div className="grid gap-6 lg:grid-cols-[340px_1fr]">
            {/* ── LEFT: Controls ── */}
            <aside className="space-y-5">
              <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5">
                <label className="mb-2 block font-mono text-[10px] uppercase tracking-[0.2em] text-white/50">
                  Playbook
                </label>
                <select
                  value={playbookSlug}
                  onChange={(e) => setPlaybookSlug(e.target.value)}
                  disabled={running}
                  className="w-full rounded-lg border border-white/[0.08] bg-black/40 px-3 py-2 font-mono text-sm text-white/90 focus:border-[#6dfe9c]/50 focus:outline-none disabled:opacity-50"
                >
                  {PLAYBOOKS.map((p) => (
                    <option key={p.slug} value={p.slug}>
                      {p.name}
                    </option>
                  ))}
                </select>

                {selectedPlaybook && (
                  <p className="mt-3 text-xs leading-5 text-white/60">{selectedPlaybook.tagline}</p>
                )}

                <label className="mt-5 mb-2 block font-mono text-[10px] uppercase tracking-[0.2em] text-white/50">
                  Ticker
                </label>
                <div className="mb-2 flex flex-wrap gap-1.5">
                  {TICKER_PRESETS.map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setTicker(t)}
                      disabled={running}
                      className={`rounded-md border px-2 py-1 font-mono text-[10px] font-bold tracking-[0.14em] transition-colors disabled:opacity-50 ${
                        ticker === t
                          ? 'border-[#6dfe9c]/50 bg-[#6dfe9c]/15 text-[#6dfe9c]'
                          : 'border-white/[0.08] bg-white/[0.02] text-white/55 hover:text-white/85'
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
                <input
                  type="text"
                  value={ticker}
                  onChange={(e) => setTicker(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
                  disabled={running}
                  maxLength={12}
                  placeholder="Or type any OKX spot ticker"
                  className="w-full rounded-lg border border-white/[0.08] bg-black/40 px-3 py-2 font-mono text-sm text-white/90 focus:border-[#6dfe9c]/50 focus:outline-none disabled:opacity-50"
                />

                <button
                  onClick={runSandbox}
                  disabled={running || !ticker}
                  className="mt-5 w-full rounded-lg border border-[#6dfe9c]/40 bg-[#6dfe9c]/10 px-4 py-3 font-['Space_Grotesk'] text-sm font-bold uppercase tracking-wider text-[#6dfe9c] transition-all hover:bg-[#6dfe9c]/20 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {running ? 'Pressure-Testing...' : `Run Pressure-Test · ${ticker || '—'}`}
                </button>

                <p className="mt-3 text-center font-mono text-[10px] uppercase tracking-[0.18em] text-white/35">
                  Real OKX data · Simulation only · No capital moves
                </p>

                {runCount > 0 && (
                  <p className="mt-3 text-center font-mono text-[10px] uppercase tracking-[0.16em] text-[#6dfe9c]/70">
                    You&apos;ve run {runCount} pressure-test{runCount === 1 ? '' : 's'} in this browser
                  </p>
                )}
              </div>

              {/* Guardrail Gauntlet preview */}
              <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5">
                <div className="mb-3 flex items-center justify-between">
                  <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-white/50">
                    Guardrail Gauntlet
                  </span>
                  <span className="font-mono text-[10px] text-white/40">
                    {guardrails.filter((g) => g.status === 'pass').length}/
                    {guardrails.length || 11}
                  </span>
                </div>
                <div className="grid grid-cols-4 gap-2">
                  {(guardrails.length
                    ? guardrails
                    : Array.from({ length: 11 }, (_, i) => ({
                        id: `placeholder-${i}`,
                        label: '',
                        status: 'pending' as GuardrailStatus,
                      }))
                  ).map((g) => (
                    <GuardrailDot key={g.id} cell={g} />
                  ))}
                </div>
              </div>
            </aside>

            {/* ── RIGHT: Live stream ── */}
            <section className="space-y-5">
              {error && (
                <div className="rounded-lg border border-[#ff716a]/40 bg-[#ff716a]/10 p-4 font-mono text-sm text-[#ff716a]">
                  :: STREAM ERROR — {error} ::
                </div>
              )}

              {market && <MarketContextCard ctx={market} />}
              {intel && intel.available && <IntelCard intel={intel} />}

              {interruption && (
                <motion.div
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="rounded-xl border border-[#fcc025]/40 bg-[#fcc025]/10 p-5"
                >
                  <div className="mb-2 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.18em] text-[#fcc025]">
                    <span className="font-bold">[!]</span>
                    Phase interrupted — {interruption.phase}
                  </div>
                  <p className="text-sm leading-6 text-white/75">
                    {interruption.message}
                  </p>
                  {interruption.partialText && (
                    <div className="mt-3 rounded-md border border-white/[0.06] bg-black/30 p-3">
                      <div className="mb-1 font-mono text-[10px] uppercase tracking-[0.14em] text-white/45">
                        Partial transcript preserved
                      </div>
                      <div className="whitespace-pre-wrap font-mono text-xs leading-5 text-white/70">
                        {interruption.partialText}
                      </div>
                    </div>
                  )}
                  <p className="mt-3 text-xs text-white/50">
                    This run was still logged to the audit trail below with status{' '}
                    <span className="font-bold text-[#fcc025]">interrupted</span>. Press <em>Run Pressure-Test</em> to try again.
                  </p>
                </motion.div>
              )}

              <AgentCard phase="alpha_hunter" state={agents.alpha_hunter} />
              <AgentCard phase="red_team" state={agents.red_team} />
              <CioCard state={agents.cio} verdict={cioVerdict} />
              <JudgeCard state={agents.judge} scores={judgeScores} />

              {/* Live guardrail gauntlet, larger */}
              <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5">
                <div className="mb-4 flex items-center gap-3">
                  <span className="font-mono text-lg font-bold text-[#c084fc]">###</span>
                  <div>
                    <div className="font-['Space_Grotesk'] text-lg font-bold text-white">
                      Guardrail Gauntlet
                    </div>
                    <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/45">
                      Fail-closed checks · 11 gates
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
                  {(guardrails.length
                    ? guardrails
                    : Array.from({ length: 11 }, (_, i) => ({
                        id: `placeholder-${i}`,
                        label: '—',
                        status: 'pending' as GuardrailStatus,
                      }))
                  ).map((g) => (
                    <GuardrailRow key={g.id} cell={g} />
                  ))}
                </div>
              </div>

              {/* Verdict */}
              <AnimatePresence>
                {verdict && (
                  <motion.div
                    ref={verdictRef}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.4 }}
                    className={`rounded-2xl border-2 p-8 ${ACTION_STYLE[verdict.action].border} ${ACTION_STYLE[verdict.action].bg}`}
                  >
                    <div className="font-mono text-[10px] uppercase tracking-[0.24em] text-white/45">
                      Final Verdict
                    </div>
                    <div
                      className={`mt-2 font-['Space_Grotesk'] text-5xl font-black tracking-tight ${ACTION_STYLE[verdict.action].text}`}
                    >
                      {ACTION_STYLE[verdict.action].label}
                    </div>
                    <div className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-3">
                      <Stat label="Conviction" value={`${verdict.conviction.toFixed(1)}/10`} />
                      <Stat
                        label="Guardrails Passed"
                        value={`${verdict.guardrailsPassed}/${verdict.guardrailsTotal}`}
                      />
                      <Stat label="Guardrails Failed" value={`${verdict.guardrailsFailed}`} />
                    </div>
                    <p className="mt-5 text-sm leading-6 text-white/75">{verdict.reason}</p>
                    <p className="mt-4 border-t border-white/[0.08] pt-3 font-mono text-[10px] uppercase tracking-[0.18em] text-white/35">
                      Simulation only · No capital moved · No on-chain commit
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>
            </section>
          </div>

          {/* ── Public audit trail ── */}
          <section className="mt-14">
            <div className="mb-4 flex flex-col gap-1 md:flex-row md:items-end md:justify-between">
              <div>
                <h2 className="font-['Space_Grotesk'] text-2xl font-bold text-white md:text-3xl">
                  Last 20 pressure-tests
                </h2>
                <p className="mt-1 text-sm text-white/55">
                  Every Sandbox run — including yours — is logged on a public audit trail. No run disappears.
                </p>
              </div>
              <button
                onClick={loadFeed}
                disabled={feedLoading}
                className="self-start rounded-lg border border-white/[0.08] bg-white/[0.02] px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-white/55 transition-colors hover:text-white/90 disabled:opacity-50 md:self-auto"
              >
                {feedLoading ? 'Refreshing...' : 'Refresh'}
              </button>
            </div>
            <FeedList runs={feed} />
          </section>
        </div>
      </KineticShell>
    </>
  );
}

// ── Sub-components ─────────────────────────────────────────
function AgentCard({ phase, state }: { phase: AgentPhase; state: AgentState }) {
  const meta = AGENT_META[phase];
  const isActive = state.status === 'thinking';
  const isDone = state.status === 'done';
  return (
    <motion.div
      animate={{
        borderColor: isActive ? `${meta.accent}66` : 'rgba(255,255,255,0.06)',
        boxShadow: isActive ? `0 0 24px ${meta.accent}22` : '0 0 0 transparent',
      }}
      transition={{ duration: 0.3 }}
      className="rounded-xl border bg-white/[0.02] p-5"
    >
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="font-mono text-lg font-bold" style={{ color: meta.accent }}>
            {meta.glyph}
          </span>
          <div>
            <div className="font-['Space_Grotesk'] text-lg font-bold text-white">{meta.label}</div>
            <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/45">
              {meta.tagline}
            </div>
          </div>
        </div>
        <StatusPill status={state.status} accent={meta.accent} />
      </div>
      <div className="min-h-[3.5em] whitespace-pre-wrap font-mono text-sm leading-6 text-white/80">
        {state.text || (state.status === 'idle' ? <span className="text-white/30">Awaiting run...</span> : <ThinkingDots />)}
        {isActive && state.text && <BlinkingCursor />}
      </div>
    </motion.div>
  );
}

function CioCard({
  state,
  verdict,
}: {
  state: AgentState;
  verdict: { action: VerdictAction; conviction: number } | null;
}) {
  const meta = AGENT_META.cio;
  const isActive = state.status === 'thinking';
  return (
    <motion.div
      animate={{
        borderColor: isActive ? `${meta.accent}66` : 'rgba(255,255,255,0.06)',
        boxShadow: isActive ? `0 0 24px ${meta.accent}22` : '0 0 0 transparent',
      }}
      transition={{ duration: 0.3 }}
      className="rounded-xl border bg-white/[0.02] p-5"
    >
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="font-mono text-lg font-bold" style={{ color: meta.accent }}>
            {meta.glyph}
          </span>
          <div>
            <div className="font-['Space_Grotesk'] text-lg font-bold text-white">{meta.label}</div>
            <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/45">
              {meta.tagline}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {verdict && (
            <span
              className={`rounded-md border px-2 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.18em] ${ACTION_STYLE[verdict.action].border} ${ACTION_STYLE[verdict.action].text}`}
            >
              {ACTION_STYLE[verdict.action].label}
            </span>
          )}
          <StatusPill status={state.status} accent={meta.accent} />
        </div>
      </div>
      {verdict && (
        <div className="mb-3 flex items-center gap-6">
          <div>
            <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/45">
              Conviction
            </div>
            <div className="font-['Space_Grotesk'] text-2xl font-bold text-white">
              {verdict.conviction.toFixed(1)}<span className="text-sm text-white/40">/10</span>
            </div>
          </div>
          <ConvictionBar value={verdict.conviction} />
        </div>
      )}
      <div className="min-h-[3.5em] whitespace-pre-wrap font-mono text-sm leading-6 text-white/80">
        {state.text || (state.status === 'idle' ? <span className="text-white/30">Awaiting debate...</span> : <ThinkingDots />)}
        {isActive && state.text && <BlinkingCursor />}
      </div>
    </motion.div>
  );
}

function JudgeCard({ state, scores }: { state: AgentState; scores: Record<string, number> }) {
  const meta = AGENT_META.judge;
  const hasScores = Object.keys(scores).length > 0;
  const dims = [
    { id: 'data_integrity',        label: 'Data' },
    { id: 'adversarial_quality',   label: 'Adversarial' },
    { id: 'decision_logic',        label: 'Logic' },
    { id: 'risk_management',       label: 'Risk' },
    { id: 'calibration_alignment', label: 'Calibration' },
    { id: 'novelty',               label: 'Novelty' },
  ];
  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="font-mono text-lg font-bold" style={{ color: meta.accent }}>
            {meta.glyph}
          </span>
          <div>
            <div className="font-['Space_Grotesk'] text-lg font-bold text-white">{meta.label}</div>
            <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/45">
              {meta.tagline}
            </div>
          </div>
        </div>
        <StatusPill status={state.status} accent={meta.accent} />
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        {dims.map((d) => {
          const raw = scores[d.id] ?? 0;
          const pct = hasScores ? (raw / 5) * 100 : 0;
          return (
            <div key={d.id} className="rounded-lg bg-black/30 p-3">
              <div className="mb-1 flex items-center justify-between">
                <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-white/55">
                  {d.label}
                </span>
                <span className="font-mono text-[10px] font-bold text-white/80">
                  {hasScores ? `${raw}/5` : '—'}
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
                <motion.div
                  animate={{ width: `${pct}%` }}
                  transition={{ duration: 0.5 }}
                  className="h-full"
                  style={{ background: meta.accent }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function GuardrailDot({ cell }: { cell: GuardrailCell }) {
  const color =
    cell.status === 'pass' ? '#6dfe9c' :
    cell.status === 'fail' ? '#ff716a' :
    cell.status === 'skip' ? '#64748b' : '#2a2a2a';
  const isActive = cell.status !== 'pending';
  return (
    <motion.div
      title={`${cell.label || ''} — ${cell.status}`}
      animate={{
        background: isActive ? `${color}33` : 'rgba(255,255,255,0.03)',
        borderColor: isActive ? `${color}99` : 'rgba(255,255,255,0.08)',
      }}
      className="aspect-square rounded-md border"
    >
      {isActive && (
        <motion.div
          initial={{ scale: 0.4, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="flex h-full w-full items-center justify-center font-mono text-xs font-bold"
          style={{ color }}
        >
          {cell.status === 'pass' ? '✓' : cell.status === 'fail' ? '✕' : '–'}
        </motion.div>
      )}
    </motion.div>
  );
}

function GuardrailRow({ cell }: { cell: GuardrailCell }) {
  const color =
    cell.status === 'pass' ? '#6dfe9c' :
    cell.status === 'fail' ? '#ff716a' :
    cell.status === 'skip' ? '#64748b' : '#555';
  const symbol =
    cell.status === 'pass' ? '✓' :
    cell.status === 'fail' ? '✕' :
    cell.status === 'skip' ? '–' : '·';
  const isActive = cell.status !== 'pending';
  return (
    <motion.div
      animate={{
        borderColor: isActive ? `${color}55` : 'rgba(255,255,255,0.05)',
        background: isActive ? `${color}14` : 'rgba(255,255,255,0.02)',
      }}
      className="flex items-center gap-3 rounded-lg border px-3 py-2"
    >
      <span className="font-mono text-sm font-bold" style={{ color }}>
        {symbol}
      </span>
      <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-white/75">
        {cell.label || '—'}
      </span>
    </motion.div>
  );
}

function StatusPill({ status, accent }: { status: AgentState['status']; accent: string }) {
  const label = status === 'thinking' ? 'THINKING' : status === 'done' ? 'DONE' : 'IDLE';
  const color = status === 'done' ? accent : status === 'thinking' ? accent : '#555';
  return (
    <span
      className="flex items-center gap-2 rounded-full border px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.2em]"
      style={{ borderColor: `${color}44`, color }}
    >
      {status === 'thinking' && (
        <motion.span
          animate={{ opacity: [0.3, 1, 0.3] }}
          transition={{ repeat: Infinity, duration: 1 }}
          className="inline-block h-1.5 w-1.5 rounded-full"
          style={{ background: color }}
        />
      )}
      {label}
    </span>
  );
}

function ConvictionBar({ value }: { value: number }) {
  const pct = Math.max(0, Math.min(100, (value / 10) * 100));
  const color = value >= 3.5 ? '#6dfe9c' : value >= 1.5 ? '#fcc025' : '#ff716a';
  return (
    <div className="flex-1">
      <div className="h-2 overflow-hidden rounded-full bg-white/[0.06]">
        <motion.div
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.6 }}
          className="h-full"
          style={{ background: color }}
        />
      </div>
    </div>
  );
}

function ThinkingDots() {
  return (
    <span className="inline-flex items-center gap-1 text-white/50">
      <motion.span animate={{ opacity: [0.3, 1, 0.3] }} transition={{ repeat: Infinity, duration: 1.2, delay: 0 }}>●</motion.span>
      <motion.span animate={{ opacity: [0.3, 1, 0.3] }} transition={{ repeat: Infinity, duration: 1.2, delay: 0.2 }}>●</motion.span>
      <motion.span animate={{ opacity: [0.3, 1, 0.3] }} transition={{ repeat: Infinity, duration: 1.2, delay: 0.4 }}>●</motion.span>
    </span>
  );
}

function BlinkingCursor() {
  return (
    <motion.span
      animate={{ opacity: [1, 0, 1] }}
      transition={{ repeat: Infinity, duration: 1 }}
      className="ml-0.5 inline-block h-3 w-1.5 translate-y-0.5 bg-white/60"
    />
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/45">{label}</div>
      <div className="font-['Space_Grotesk'] text-xl font-bold text-white">{value}</div>
    </div>
  );
}

function MarketContextCard({ ctx }: { ctx: MarketContext }) {
  const change = ctx.change24hPct;
  const changeColor =
    change === null ? '#888' : change > 0 ? '#6dfe9c' : change < 0 ? '#ff716a' : '#888';
  const regime =
    change === null ? 'unknown'
    : change > 3 ? 'risk-on expansion'
    : change > 0 ? 'mild bid'
    : change > -3 ? 'chop / distribution'
    : 'risk-off drawdown';
  const fmtPrice = (n: number | null) =>
    n === null ? '—' : `$${n.toLocaleString(undefined, { maximumFractionDigits: n < 1 ? 6 : 2 })}`;
  const fmtVol = (n: number | null) => {
    if (n === null || !Number.isFinite(n)) return '—';
    if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
    if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
    if (n >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
    return `$${n.toFixed(0)}`;
  };
  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl border border-white/[0.08] bg-gradient-to-br from-white/[0.03] to-transparent p-5"
    >
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="font-mono text-lg font-bold text-white/80">◉</span>
          <div>
            <div className="font-['Space_Grotesk'] text-lg font-bold text-white">
              Market Context — {ctx.ticker}
            </div>
            <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/45">
              {ctx.source === 'okx' ? 'Live OKX spot · fetched just now' : 'data unavailable · reasoning general only'}
            </div>
          </div>
        </div>
        {change !== null && (
          <span
            className="rounded-md border px-2 py-1 font-mono text-xs font-bold"
            style={{ borderColor: `${changeColor}55`, color: changeColor, background: `${changeColor}10` }}
          >
            {change >= 0 ? '+' : ''}{change.toFixed(2)}%
          </span>
        )}
      </div>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Stat label="Last" value={fmtPrice(ctx.price)} />
        <Stat label="24h High" value={fmtPrice(ctx.high24h)} />
        <Stat label="24h Low" value={fmtPrice(ctx.low24h)} />
        <Stat label="24h Volume" value={fmtVol(ctx.volUsd24h)} />
      </div>
      <div className="mt-3 border-t border-white/[0.06] pt-3 font-mono text-[11px] uppercase tracking-[0.14em] text-white/50">
        Regime read: <span style={{ color: changeColor }}>{regime}</span>
      </div>
    </motion.div>
  );
}

function IntelCard({ intel }: { intel: BobbyIntel }) {
  const bits: Array<{ label: string; value: string }> = [];
  if (intel.regime) bits.push({ label: 'Regime', value: String(intel.regime) });
  if (intel.fearGreed !== undefined) bits.push({ label: 'Fear/Greed', value: String(intel.fearGreed) });
  if (intel.mood) bits.push({ label: 'Protocol Mood', value: String(intel.mood) });
  if (typeof intel.dynamicConviction === 'number') {
    bits.push({ label: 'Dynamic Conviction', value: intel.dynamicConviction.toFixed(2) });
  }
  if (intel.technicalLeader) bits.push({ label: 'Tech Leader', value: String(intel.technicalLeader) });
  if (!bits.length) return null;
  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl border border-[#60a5fa]/30 bg-[#60a5fa]/[0.06] p-5"
    >
      <div className="mb-3 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.18em] text-[#60a5fa]">
        <span className="font-bold">◆</span>
        Protocol Intel — injected into Alpha / Red / CIO prompts
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {bits.map((b) => (
          <div key={b.label} className="rounded-md bg-black/30 p-2">
            <div className="font-mono text-[9px] uppercase tracking-[0.14em] text-white/45">{b.label}</div>
            <div className="mt-0.5 font-['Space_Grotesk'] text-sm font-bold text-white">{b.value}</div>
          </div>
        ))}
      </div>
    </motion.div>
  );
}

function FeedList({ runs }: { runs: FeedRun[] }) {
  if (!runs.length) {
    return (
      <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-8 text-center text-sm text-white/45">
        No pressure-tests logged yet. Be the first — pick a playbook above and run one.
      </div>
    );
  }

  const verdictStyle: Record<string, { color: string; label: string }> = {
    EXECUTE:    { color: '#6dfe9c', label: 'EXECUTE' },
    YIELD_PARK: { color: '#fcc025', label: 'YIELD PARK' },
    BLOCKED:    { color: '#ff716a', label: 'BLOCKED' },
  };

  return (
    <div className="space-y-2">
      {runs.map((r) => {
        const vs = r.verdict_action ? verdictStyle[r.verdict_action] : null;
        const isInterrupted = r.status === 'interrupted';
        const ago = timeAgo(r.created_at);
        return (
          <div
            key={r.id}
            className="flex flex-col gap-3 rounded-lg border border-white/[0.05] bg-white/[0.02] p-3 md:flex-row md:items-center md:justify-between"
          >
            <div className="flex flex-wrap items-center gap-3">
              <span className="rounded-md border border-white/[0.08] bg-black/30 px-2 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-white/80">
                {r.ticker}
              </span>
              <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-white/55">
                {r.playbook_slug}
              </span>
              {isInterrupted && (
                <span className="rounded-md border border-[#fcc025]/30 bg-[#fcc025]/10 px-2 py-0.5 font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-[#fcc025]">
                  interrupted @ {r.error_phase || '?'}
                </span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-4 text-[11px] text-white/65">
              {typeof r.cio_conviction === 'number' && (
                <span className="font-mono">
                  <span className="text-white/40">conv</span>{' '}
                  <span className="font-bold text-white/90">{r.cio_conviction.toFixed(1)}</span>
                </span>
              )}
              {r.guardrails_total !== null && r.guardrails_total !== undefined && (
                <span className="font-mono">
                  <span className="text-white/40">gates</span>{' '}
                  <span className="font-bold text-white/90">
                    {r.guardrails_passed ?? '—'}/{r.guardrails_total}
                  </span>
                </span>
              )}
              {vs && (
                <span
                  className="rounded-md border px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-[0.14em]"
                  style={{ borderColor: `${vs.color}55`, color: vs.color, background: `${vs.color}10` }}
                >
                  {vs.label}
                </span>
              )}
              <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-white/40">{ago}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}
