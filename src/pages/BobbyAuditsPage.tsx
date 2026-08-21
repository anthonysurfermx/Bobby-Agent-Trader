// /protocol/audits — the adversarial audit trail, published in full.
// Summaries in English for CT; every card links the complete (Spanish) report
// in the public repo. The chain is the point: every round tried to break the
// previous fix, verdicts were NO-GO until fixed, and each fix was re-audited.
import { Helmet } from 'react-helmet-async';
import { ArrowLeft, ArrowUpRight, ShieldAlert } from 'lucide-react';

const GH = 'https://github.com/anthonysurfermx/Bobby-Agent-Trader/blob';

interface Round {
  name: string;
  date: string;
  verdict: string;
  finding: string;
  fix: string;
  href: string;
}

const ROUNDS: Round[] = [
  {
    name: 'Round 1',
    date: '2026-08-17',
    verdict: 'NO-GO → fixed',
    finding: 'A1-1 (P1): the Hermes fetch pattern could not satisfy parsePriceFeedUpdatesUnique against ~1 Hz feeds — VERIFIED commits and resolves reverted against the real Pyth. Mocks had hidden it by modeling an impossible feed cadence (A1-3).',
    fix: 'Fetch pattern rebuilt against real Hermes cadence; mocks corrected so they can no longer hide it. A1-2 (TTL-boundary breach race) closed; a bounded residual documented.',
    href: `${GH}/main/docs/audit/trackrecord-v2-audit-round1.md`,
  },
  {
    name: 'Round 2 — Codex',
    date: '2026-08-17',
    verdict: 'NO-GO → fixed',
    finding: 'A2-1 (P1): the round-1 fix reintroduced cherry-picking — a non-Unique parse over [now−600s, now] let the recorder retroactively pick the most favorable signed tick as the oracle entry.',
    fix: 'Entry re-anchored to a declared entryAt under Unique semantics: given the anchor, the evidence tick is deterministic.',
    href: `${GH}/main/docs/audit/trackrecord-v2-audit-round2.md`,
  },
  {
    name: 'Round 3 — Codex',
    date: '2026-08-18',
    verdict: 'NO-GO → fixed',
    finding: 'A3-1 (P1): the round-2 residual was still bounded backdating — with the market already observed, the recorder could choose WHICH past instant to anchor (up to 600s back). Unique makes the evidence deterministic, not the timing honest.',
    fix: 'Two-step announce → commit: the announcement fixes the anchor on-chain BEFORE the evidence can be known.',
    href: `${GH}/main/docs/audit/trackrecord-v2-audit-round3.md`,
  },
  {
    name: 'Round 4 — Codex',
    date: '2026-08-18',
    verdict: 'NO-GO → fixed',
    finding: 'A4-1 (P1): same-block announce+commit — the contract only required entryAt == announcedAt, so a malicious recorder holding the current second’s Pyth update could bundle both in one block. “Announcement precedes evidence” was not enforced by code.',
    fix: 'Derived FUTURE anchor: entryAt = announcedAt + 10s, strictly in the announce block’s future — its tick cannot exist when the anchor is fixed. Codex also ratified the round-1 residual (A1-2) as acceptable: the exact TTL boundary favors the challenger and expiries are public.',
    href: `${GH}/main/docs/audit/trackrecord-v2-audit-round4.md`,
  },
  {
    name: 'Round 5 — Freeze & live PoC',
    date: '2026-08-18',
    verdict: 'GO (frozen)',
    finding: 'Final pass over the round-4 commit: storage-layout snapshot pinned in CI, artifact hashes recorded, and a proof-of-concept exercising the full VERIFIED path (announce → commit → resolve → challenge) against the REAL Pyth contract with signed Hermes updates.',
    fix: 'Release frozen at 11532f4 · 216/216 tests (forge test, 0 skipped) · viaIR 24,094 bytes runtime (482 B under EIP-170). The Sepolia canary you can inspect on the calls page runs this exact build.',
    href: `${GH}/feat/trackrecord-v2/docs/audit/trackrecord-v2-freeze.md`,
  },
];

export default function BobbyAuditsPage() {
  return (
    <div className="min-h-screen bg-[#050505] text-white">
      <Helmet>
        <title>Audit Trail — Bobby Protocol</title>
        <meta name="description" content="Five adversarial audit rounds on BobbyTrackRecordV2 — findings, severities and fixes, published in full." />
      </Helmet>
      <div className="pointer-events-none fixed inset-0 opacity-[0.05] [background-image:linear-gradient(rgba(255,255,255,.6)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.6)_1px,transparent_1px)] [background-size:52px_52px]" />

      <div className="relative mx-auto max-w-3xl px-5 py-12 lg:px-8">
        <a href="/protocol" className="inline-flex items-center gap-2 font-mono text-xs uppercase tracking-[0.15em] text-white/50 transition hover:text-white">
          <ArrowLeft className="h-3.5 w-3.5" /> Bobby Protocol
        </a>

        <h1 className="mt-8 text-4xl font-extrabold tracking-[-0.06em] md:text-6xl">Audit <span className="text-[#0052ff]">trail.</span></h1>
        <p className="mt-5 text-lg leading-8 text-white/55">
          Five adversarial rounds on the track-record contract. Every round attacked the previous
          round&apos;s fix, verdicts stayed <b className="text-white/85">NO-GO until fixed</b>, and every
          fix was re-audited. Four P1s found and killed — being wrong in public is part of the design.
        </p>

        <div className="mt-10 space-y-5">
          {ROUNDS.map((r) => (
            <div key={r.name} className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 font-mono text-sm font-bold tracking-[0.08em] text-white">
                  <ShieldAlert className="h-4 w-4 text-[#7da6ff]" /> {r.name}
                </div>
                <div className="flex items-center gap-3 font-mono text-[10px] uppercase tracking-[0.14em]">
                  <span className="text-white/35">{r.date}</span>
                  <span className={`rounded-full border px-2.5 py-1 font-bold ${r.verdict.startsWith('GO') ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-300' : 'border-amber-400/30 bg-amber-400/10 text-amber-300'}`}>
                    {r.verdict}
                  </span>
                </div>
              </div>
              <p className="mt-3 text-sm leading-6 text-white/60">{r.finding}</p>
              <p className="mt-2 text-sm leading-6 text-white/45"><b className="font-mono text-[11px] uppercase tracking-[0.12em] text-emerald-300/80">Fix · </b>{r.fix}</p>
              <a href={r.href} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1 font-mono text-[11px] uppercase tracking-[0.12em] text-[#7da6ff] transition hover:text-white">
                Full report <ArrowUpRight className="h-3 w-3" />
              </a>
            </div>
          ))}
        </div>

        <p className="mt-10 font-mono text-[11px] leading-5 text-white/30">
          Reports are the working documents, unedited (Spanish). See also:{' '}
          <a href="/protocol/calls" className="text-white/50 underline-offset-2 hover:underline">verifiable calls</a> ·{' '}
          <a href="/protocol/risk" className="text-white/50 underline-offset-2 hover:underline">risk & claims</a>
        </p>
      </div>
    </div>
  );
}
