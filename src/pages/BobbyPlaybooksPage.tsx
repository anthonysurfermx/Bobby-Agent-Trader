// ============================================================
// /protocol/playbooks — Pressure-Test Playbooks
// Example plays showing where Bobby's harness prevents a specific
// failure mode. Not trading advice.
// ============================================================

import { useMemo, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import ProtocolLayout from '@/components/protocol/ProtocolLayout';
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
      <ProtocolLayout
        active="playbooks"
        eyebrow="Build with Bobby / Playbooks"
        title="A better question before committing capital."
        description="Pressure-test playbooks show where Bobby's harness prevents a specific failure mode. Every demo calls live MCP tools against real market data."
      >
        <div className="protocol-content pb-20">
          <div className="mb-14 flex flex-col gap-7 sm:flex-row sm:items-center sm:justify-between">
            <div className="max-w-lg">
              <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[#8a8378]">Explore / {PLAYBOOKS.length} playbooks</p>
              <p className="mt-3 text-sm leading-7 text-[#a39c91]">Examples of how traders use Bobby before committing capital. Choose a strategy to inspect its failure modes, tools, and guardrails.</p>
            </div>
            <a
              href="/protocol/sandbox"
              className="protocol-button self-start sm:self-auto"
            >
              Open the live sandbox <span aria-hidden="true">↗</span>
            </a>
          </div>

          {/* ── Filter + sort rail ── */}
          <div className="mb-8 flex flex-col gap-5 border-y border-white/10 py-5 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex flex-wrap gap-2">
              {CATEGORIES.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setCategory(c.id)}
                  aria-pressed={category === c.id}
                  className={`rounded-full border px-4 py-2 text-xs transition ${
                    category === c.id
                      ? 'border-[#f2ede4] bg-[#f2ede4] text-[#0b0a09]'
                      : 'border-white/10 bg-transparent text-[#a39c91] hover:bg-white/[0.04] hover:text-[#f2ede4]'
                  }`}
                >
                  {c.label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <label htmlFor="playbook-sort" className="font-mono text-[10px] uppercase tracking-[0.12em] text-[#8a8378]">Sort</label>
              <select
                id="playbook-sort"
                value={sort}
                onChange={(e) => setSort(e.target.value as SortOption)}
                className="rounded-xl border border-white/10 bg-[#15121c] px-3 py-2 text-xs text-[#f2ede4] focus:border-[#b5a2de]/60 focus:outline-none"
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
          <div className="mb-6 flex items-center justify-between gap-4">
            <h2 className="text-2xl font-light tracking-[-0.04em]">Pressure-test playbooks</h2>
            <span className="font-mono text-[10px] text-[#8a8378]">{playbooks.length} results</span>
          </div>
          <div className="grid items-start gap-5 md:grid-cols-2 [&>div]:rounded-[24px] [&>div]:p-6 [&>div]:md:p-8 [&_h3]:font-light [&_a]:rounded-full [&_button]:rounded-full">
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
      </ProtocolLayout>
    </>
  );
}
