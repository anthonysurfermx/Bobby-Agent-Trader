// /protocol/risk — honest claims, trust assumptions and the disclaimer.
// Content red-teamed by Kimi K3 (2026-08-19); mechanism numbers match the
// frozen BobbyTrackRecordV2. Scoped claims only — see "What we will never claim".
import { Helmet } from 'react-helmet-async';
import { ArrowLeft } from 'lucide-react';

const TRUST_ROWS: Array<[string, string, string]> = [
  [
    'Recorder key is compromised',
    'Attacker could issue bad commits within the announce window; cannot rewrite past records.',
    'Key monitoring and rotation runbook; ownership handoff is pending to the published 2-of-3 Safe; writes stay frozen until acceptance.',
  ],
  [
    'Hermes / Pyth is down',
    'VERIFIED commits and resolves halt.',
    'ATTESTED path remains functional; a fallback Pyth contract is pre-approved; feed staleness is public.',
  ],
  [
    'Safe 2-of-3 is misused',
    'Owners could change parameters or pause the system.',
    '3 independent owners, threshold 2, no modules, addresses published for monitoring. History stays immutable.',
  ],
  [
    'Smart contract bug',
    'Records or protocol fees could be at risk.',
    '5 adversarial audit rounds, bug bounty, emergency pause via Safe, immutable on-chain history.',
  ],
  [
    'Pyth oracle is corrupted',
    'A bad price could pass the verification gate.',
    'Hermes-signed proofs, 50 bps confidence cap, 100 bps tolerance, 7-day permissionless challenge window.',
  ],
];

const NEVER_CLAIM = [
  '“Tamper-proof”, unqualified.',
  '“Guaranteed returns.”',
  '“Personalized investment advice.”',
  '“All symbols are oracle-verified.”',
  '“Bobby trades real capital.”',
  '“Unhackable.”',
  '“The win rate proves future performance.”',
];

function H2({ children }: { children: React.ReactNode }) {
  return <h2 className="mt-12 text-2xl font-extrabold tracking-[-0.04em] md:text-3xl">{children}</h2>;
}

export default function BobbyRiskPage() {
  return (
    <div className="min-h-screen bg-[#050505] text-white">
      <Helmet>
        <title>Risk & Claims — Bobby Protocol</title>
        <meta name="description" content="Exactly what VERIFIED proves, what ATTESTED is, our trust assumptions, and what we will never claim." />
      </Helmet>
      <div className="pointer-events-none fixed inset-0 opacity-[0.05] [background-image:linear-gradient(rgba(255,255,255,.6)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.6)_1px,transparent_1px)] [background-size:52px_52px]" />

      <div className="relative mx-auto max-w-3xl px-5 py-12 lg:px-8">
        <a href="/protocol" className="inline-flex items-center gap-2 font-mono text-xs uppercase tracking-[0.15em] text-white/50 transition hover:text-white">
          <ArrowLeft className="h-3.5 w-3.5" /> Bobby Protocol
        </a>

        <h1 className="mt-8 text-4xl font-extrabold tracking-[-0.06em] md:text-6xl">Risk & <span className="text-[#0052ff]">claims.</span></h1>
        <p className="mt-5 text-lg leading-8 text-white/55">
          Don&apos;t trust — verify. This page says exactly what the mechanism proves,
          what it does not, and where you still have to trust someone.
        </p>

        <H2>What VERIFIED proves</H2>
        <p className="mt-4 leading-7 text-white/60">
          VERIFIED applies only to <b className="text-white/85">BTC, ETH and SOL</b>. Every commit,
          resolve and challenge is backed by a signed Pyth price update from Hermes:
        </p>
        <ul className="mt-4 list-disc space-y-2 pl-5 leading-7 text-white/60">
          <li>The entry anchor derives from an on-chain announcement: <code className="rounded bg-white/10 px-1.5 text-sm">entryAt = announcedAt + 10s</code>. The recorder cannot know the Pyth tick when the anchor is fixed — no tick-shopping, no same-block games.</li>
          <li>The reported entry must sit within <b className="text-white/85">100 bps</b> of the signed oracle price; confidence is capped at 50 bps.</li>
          <li>The stop is forced onto the loss side of the <i>oracle</i> entry at commit time.</li>
          <li>Resolve verifies a signed Pyth benchmark at the declared exit instant (max lag 600s).</li>
          <li>Any pending commitment — or any resolved WIN/BREAK_EVEN for <b className="text-white/85">7 days</b> — can be challenged permissionlessly with a signed tick that crossed the stop. A real breach reclassifies to LOSS, with the loss derived from the oracle entry.</li>
        </ul>
        <p className="mt-4 leading-7 text-white/60">
          What it does <b className="text-white/85">not</b> guarantee: future prices or returns; the
          quality of the strategy; immunity if the recorder key is compromised going forward. It
          proves the recorded outcome was checked against an oracle — nothing more, nothing less.
        </p>

        <H2>What ATTESTED is</H2>
        <p className="mt-4 leading-7 text-white/60">
          Everything outside BTC/ETH/SOL is <b className="text-white/85">ATTESTED</b>: prices are
          self-reported. The contract enforces internal consistency between pnl and result, but no
          oracle checks the numbers. ATTESTED and VERIFIED are separate ledgers —
          <b className="text-white/85"> they are never added together</b>.
        </p>

        <H2>Trust assumptions</H2>
        <div className="mt-4 overflow-x-auto rounded-2xl border border-white/10">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead>
              <tr className="border-b border-white/10 bg-white/[0.03] font-mono text-[10px] uppercase tracking-[0.16em] text-white/40">
                <th className="px-4 py-3">Assumption</th>
                <th className="px-4 py-3">If it fails</th>
                <th className="px-4 py-3">Mitigation today</th>
              </tr>
            </thead>
            <tbody>
              {TRUST_ROWS.map(([a, f, m]) => (
                <tr key={a} className="border-b border-white/5 align-top leading-6 text-white/60">
                  <td className="px-4 py-3 font-semibold text-white/85">{a}</td>
                  <td className="px-4 py-3">{f}</td>
                  <td className="px-4 py-3">{m}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <H2>What we will never claim</H2>
        <ul className="mt-4 list-disc space-y-1.5 pl-5 leading-7 text-white/60">
          {NEVER_CLAIM.map((c) => <li key={c}>{c}</li>)}
        </ul>

        <H2>Disclaimer</H2>
        <p className="mt-4 leading-7 text-white/60">
          Bobby provides market analysis and simulated trading signals, not personalized investment
          advice. All of Bobby&apos;s own trading is paper/simulated. Past performance — including any
          verified win rate — does not predict future results. Smart contracts carry risk. Verify
          everything yourself before acting; if you need financial advice, talk to a licensed
          professional.
        </p>

        <p className="mt-12 font-mono text-[11px] text-white/30">
          See the proofs: <a href="/protocol/calls" className="text-white/50 underline-offset-2 hover:underline">verifiable calls ledger</a>
        </p>
      </div>
    </div>
  );
}
