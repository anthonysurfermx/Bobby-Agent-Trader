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
  { id: 'volatility', label: 'Volatility' },
  { id: 'arbitrage', label: 'Arbitrage' },
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
      <KineticShell activeTab="playbooks" minimalNav>
        <div className="mx-auto max-w-6xl px-4 py-10 md:px-8">
          {/* ── Header ── */}
          <header className="mb-8">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-[#0052ff]/40 bg-[#0052ff]/10 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.2em] text-[#7da6ff]">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#0052ff]" />
              Examples of how traders use Bobby before committing capital
            </div>
            <h1 className="max-w-3xl text-4xl font-extrabold leading-[.98] tracking-[-0.07em] md:text-5xl">
              Pressure-test playbooks
            </h1>
            <p className="mt-5 max-w-3xl text-base leading-7 text-white/55">
              Example plays showing where Bobby&apos;s harness prevents a specific failure mode. Every demo calls Bobby&apos;s
              live MCP tools against real market data. Not trading advice.
            </p>
            <a
              href="/protocol/sandbox"
              className="mt-6 inline-flex items-center gap-2 rounded-lg bg-white px-5 py-3 font-mono text-xs font-bold uppercase tracking-[0.15em] text-black transition hover:bg-[#0052ff] hover:text-white"
            >
              Run in sandbox — live simulation →
            </a>
          </header>

          {/* ── Filter + sort rail ── */}
          <div className="mb-6 flex flex-col gap-3 border-b border-white/10 pb-5 md:flex-row md:items-center md:justify-between">
            <div className="flex flex-wrap gap-2">
              {CATEGORIES.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setCategory(c.id)}
                  className={`rounded-lg border px-3.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.15em] transition ${
                    category === c.id
                      ? 'border-transparent bg-white text-black'
                      : 'border-white/15 bg-white/[0.06] text-white/55 hover:bg-white/[0.12] hover:text-white'
                  }`}
                >
                  {c.label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-white/40">Sort</span>
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as SortOption)}
                className="rounded-lg border border-white/15 bg-white/[0.06] px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-white/70 backdrop-blur focus:border-[#0052ff]/60 focus:outline-none"
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
          <p className="mt-10 border-t border-white/10 pt-6 text-center text-xs italic leading-6 text-white/40">
            Examples of how traders use Bobby before committing capital. Not trading advice. Bobby never executes trades;
            your agent decides.
          </p>
        </div>
      </KineticShell>
    </>
  );
}
