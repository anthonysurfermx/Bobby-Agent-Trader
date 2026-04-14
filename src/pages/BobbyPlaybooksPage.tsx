// ============================================================
// /protocol/playbooks — Pressure-Test Playbooks
// Example plays showing where Bobby's harness prevents a specific
// failure mode. Not trading advice.
// ============================================================

import { useMemo, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import KineticShell from '@/components/kinetic/KineticShell';
import PlaybookCard from '@/components/playbooks/PlaybookCard';
import { PLAYBOOKS, type PlaybookCategory } from '@/data/playbooks';

type CategoryFilter = 'all' | PlaybookCategory;
type SortOption = 'default' | 'most-restrictive' | 'most-permissive';

const CATEGORIES: Array<{ id: CategoryFilter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'directional', label: 'Directional' },
  { id: 'yield', label: 'Yield' },
  { id: 'on-chain-flow', label: 'On-chain flow' },
  { id: 'risk-management', label: 'Risk management' },
];

const SORT_OPTIONS: Array<{ id: SortOption; label: string }> = [
  { id: 'default', label: 'Default' },
  { id: 'most-restrictive', label: 'Most restrictive' },
  { id: 'most-permissive', label: 'Most permissive' },
];

export default function BobbyPlaybooksPage() {
  const [category, setCategory] = useState<CategoryFilter>('all');
  const [sort, setSort] = useState<SortOption>('default');

  const playbooks = useMemo(() => {
    const filtered = category === 'all' ? PLAYBOOKS : PLAYBOOKS.filter((p) => p.category === category);
    if (sort === 'most-restrictive') {
      return [...filtered].sort((a, b) => b.blockRatePct - a.blockRatePct);
    }
    if (sort === 'most-permissive') {
      return [...filtered].sort((a, b) => a.blockRatePct - b.blockRatePct);
    }
    return filtered;
  }, [category, sort]);

  return (
    <>
      <Helmet>
        <title>Pressure-Test Playbooks | Bobby Agent Trader</title>
      </Helmet>
      <KineticShell activeTab="playbooks">
        <div className="mx-auto max-w-6xl px-4 py-10 md:px-8">
          {/* ── Header ── */}
          <header className="mb-8">
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-green-500/20 bg-green-500/10 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.24em] text-green-400">
              Examples of how traders use Bobby before committing capital
            </div>
            <h1 className="max-w-3xl font-['Space_Grotesk'] text-4xl font-bold leading-tight md:text-5xl">
              Pressure-Test Playbooks
            </h1>
            <p className="mt-4 max-w-3xl text-base leading-7 text-white/65">
              Example plays showing where Bobby&apos;s harness prevents a specific failure mode. Every demo calls Bobby&apos;s
              live MCP tools against real market data. Not trading advice.
            </p>
            <a
              href="/protocol/sandbox"
              className="mt-5 inline-flex items-center gap-2 rounded-lg border border-[#6dfe9c]/40 bg-[#6dfe9c]/10 px-4 py-2.5 font-['Space_Grotesk'] text-sm font-bold uppercase tracking-wider text-[#6dfe9c] transition-all hover:bg-[#6dfe9c]/20"
            >
              Run in Sandbox — Live Simulation →
            </a>
          </header>

          {/* ── Filter + sort rail ── */}
          <div className="mb-6 flex flex-col gap-3 border-b border-white/[0.06] pb-4 md:flex-row md:items-center md:justify-between">
            <div className="flex flex-wrap gap-2">
              {CATEGORIES.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setCategory(c.id)}
                  className={`rounded-full border px-3 py-1 font-mono text-[10px] uppercase tracking-[0.16em] transition-colors ${
                    category === c.id
                      ? 'border-green-500/40 bg-green-500/10 text-green-400'
                      : 'border-white/[0.06] bg-white/[0.02] text-white/50 hover:text-white/80'
                  }`}
                >
                  {c.label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-white/35">Sort</span>
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as SortOption)}
                className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-white/70 focus:border-green-500/40 focus:outline-none"
              >
                {SORT_OPTIONS.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* ── Grid ── */}
          <div className="grid gap-4 md:grid-cols-2">
            {playbooks.map((playbook) => (
              <PlaybookCard key={playbook.slug} playbook={playbook} />
            ))}
          </div>

          {/* ── Footer disclaimer ── */}
          <p className="mt-10 border-t border-white/[0.04] pt-6 text-center text-xs italic text-white/40">
            Examples of how traders use Bobby before committing capital. Not trading advice. Bobby never executes trades;
            your agent decides.
          </p>
        </div>
      </KineticShell>
    </>
  );
}
