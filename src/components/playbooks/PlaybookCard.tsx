// ============================================================
// PlaybookCard — collapsed + expanded states for a single playbook
// ============================================================

import { useState } from 'react';
import { ChevronDown, Lock } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import type { Playbook } from '@/data/playbooks';
import PlaybookLiveDemo from './PlaybookLiveDemo';
import PlaybookGuardrailList from './PlaybookGuardrailList';

interface PlaybookCardProps {
  playbook: Playbook;
}

const CATEGORY_LABEL: Record<string, string> = {
  directional: 'Directional',
  yield: 'Yield',
  volatility: 'Volatility',
  arbitrage: 'Arbitrage',
  'on-chain-flow': 'On-chain flow',
  'risk-management': 'Risk management',
};

export default function PlaybookCard({ playbook }: PlaybookCardProps) {
  const [open, setOpen] = useState(false);
  const disabled = playbook.status === 'advanced' || playbook.demo === null;

  return (
    <div
      className={`rounded-2xl border p-5 transition-colors ${
        disabled
          ? 'border-white/[0.03] bg-white/[0.01] opacity-70'
          : 'border-white/[0.04] bg-white/[0.02] hover:border-white/[0.08]'
      }`}
    >
      {/* ── Header ── */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-white/[0.06] bg-white/[0.03] px-2.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.18em] text-white/50">
              {CATEGORY_LABEL[playbook.category] || playbook.category}
            </span>
            {playbook.badge && (
              <span
                className={`rounded-full border px-2.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.18em] ${
                  playbook.badge.tone === 'preview'
                    ? 'border-amber-300/20 bg-amber-300/10 text-amber-200'
                    : 'border-white/[0.08] bg-white/[0.04] text-white/50'
                }`}
              >
                {playbook.badge.label}
              </span>
            )}
          </div>
          <h3 className="font-['Space_Grotesk'] text-xl font-semibold leading-tight text-white">
            {playbook.name}
          </h3>
          <p className="mt-1.5 text-sm leading-6 text-white/60">{playbook.tagline}</p>
        </div>
      </div>

      {/* ── Metrics row ── */}
      <div className="mt-4 flex flex-wrap items-center gap-5 font-mono text-[10px] uppercase tracking-[0.14em] text-white/50">
        <div className="flex items-center gap-2">
          <span className="text-green-400">{playbook.blockRatePct}%</span>
          <span className="text-white/40">block rate</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-white/70">{playbook.guardrails.length}</span>
          <span className="text-white/40">guardrails fire</span>
        </div>
      </div>

      {/* ── CTA ── */}
      <div className="mt-5 flex items-center justify-between gap-3 border-t border-white/[0.04] pt-4">
        <span className="text-xs text-white/50">{playbook.blockRateCopy}</span>
        {disabled ? (
          <span className="inline-flex items-center gap-2 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-white/35">
            <Lock className="h-3 w-3" />
            Coming soon
          </span>
        ) : (
          <div className="flex items-center gap-2">
            <button
              onClick={() => setOpen((o) => !o)}
              className="inline-flex items-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-white/60 transition-colors hover:bg-white/[0.06]"
            >
              {open ? 'Collapse' : 'Details'}
              <ChevronDown className={`h-3 w-3 transition-transform ${open ? 'rotate-180' : ''}`} />
            </button>
            <a
              href={`/protocol/sandbox?playbook=${encodeURIComponent(playbook.slug)}`}
              className="inline-flex items-center gap-2 rounded-lg border border-green-500/40 bg-green-500/15 px-3 py-1.5 font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-green-400 transition-colors hover:bg-green-500/25"
            >
              Run in Sandbox →
            </a>
          </div>
        )}
      </div>

      {/* ── Expanded detail ── */}
      <AnimatePresence initial={false}>
        {open && !disabled && playbook.demo && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="overflow-hidden"
          >
            <div className="mt-5 space-y-5 border-t border-white/[0.04] pt-5">
              {/* 1. What it is */}
              <section>
                <div className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-green-400/70">
                  What it is
                </div>
                <p className="text-sm leading-6 text-white/70">{playbook.whatItIs}</p>
              </section>

              {/* 2. Where it hurts without Bobby */}
              <section>
                <div className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-[#ff716a]">
                  Where it hurts without Bobby
                </div>
                <p className="text-sm leading-6 text-white/70">{playbook.painWithoutBobby}</p>
              </section>

              {/* 3. Tools */}
              <section>
                <div className="mb-2 font-mono text-[10px] uppercase tracking-[0.18em] text-white/50">
                  Bobby tools this playbook uses
                </div>
                <div className="flex flex-wrap gap-2">
                  {playbook.tools.map((tool) => (
                    <div
                      key={tool.name}
                      className="inline-flex flex-col rounded-lg border border-white/[0.06] bg-black/20 px-3 py-2"
                    >
                      <div className="flex items-center gap-2">
                        <code className="font-mono text-xs text-green-400">{tool.name}</code>
                        {tool.paid && (
                          <span className="rounded-sm border border-amber-300/20 bg-amber-300/10 px-1.5 py-[1px] font-mono text-[8px] uppercase tracking-[0.14em] text-amber-200">
                            Optional deeper audit
                          </span>
                        )}
                      </div>
                      <span className="mt-0.5 text-[11px] text-white/50">{tool.role}</span>
                    </div>
                  ))}
                </div>
              </section>

              {/* 4. Live demo */}
              <section>
                <div className="mb-2 font-mono text-[10px] uppercase tracking-[0.18em] text-white/50">
                  Live pressure-test
                </div>
                <PlaybookLiveDemo demo={playbook.demo} />
              </section>

              {/* 5. Guardrails */}
              <section>
                <div className="mb-2 font-mono text-[10px] uppercase tracking-[0.18em] text-white/50">
                  Guardrails that fire
                </div>
                <PlaybookGuardrailList slugs={playbook.guardrails} />
              </section>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
