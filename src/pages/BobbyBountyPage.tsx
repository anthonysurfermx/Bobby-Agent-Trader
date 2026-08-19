// /protocol/bounty — real money for breaking Bobby (mainnet blocker #3).
// Amounts approved 2026-08-19. Funding goes live with the mainnet Safe;
// the terms are published now so hunters can start reading the code today.
import { Helmet } from 'react-helmet-async';
import { ArrowLeft, ArrowUpRight, Bug, Swords, Trophy } from 'lucide-react';

const GH = 'https://github.com/anthonysurfermx/Bobby-Agent-Trader';

const TIERS: Array<[string, string, string]> = [
  [
    '$2,500 · Critical',
    'Falsify the VERIFIED track record, steal escrowed funds, or bypass the oracle gate (commit/resolve/challenge accepting evidence it must reject).',
    'The claims on the risk page are the spec — break one and this tier is yours.',
  ],
  [
    '$500 · High',
    'Degrade a core guarantee without direct falsification: challenge window bypass, ledger mixing (VERIFIED/ATTESTED), pause bypass, ownership escalation.',
    'Anything that makes the scoreboard lie by omission.',
  ],
  [
    '$150 · Medium',
    'Griefing or DoS at the contract level (blocking legitimate commits/resolves/challenges), state corruption without record falsification.',
    'Public RPC outages and gas-price griefing are out of scope.',
  ],
  [
    '$100 · Valid challenge',
    'First successful stop-breach challenge on any mainnet call the protocol missed — the reclassification tx is the proof.',
    'Paid per call, first challenger wins. The breach scanner on the calls page does the scouting for you.',
  ],
];

export default function BobbyBountyPage() {
  return (
    <div className="min-h-screen bg-[#050505] text-white">
      <Helmet>
        <title>Bug Bounty — Bobby Protocol</title>
        <meta name="description" content="Real rewards for breaking Bobby's track record, contracts or challenge mechanism. $5,000 initial pool." />
      </Helmet>
      <div className="pointer-events-none fixed inset-0 opacity-[0.05] [background-image:linear-gradient(rgba(255,255,255,.6)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.6)_1px,transparent_1px)] [background-size:52px_52px]" />

      <div className="relative mx-auto max-w-3xl px-5 py-12 lg:px-8">
        <a href="/protocol" className="inline-flex items-center gap-2 font-mono text-xs uppercase tracking-[0.15em] text-white/50 transition hover:text-white">
          <ArrowLeft className="h-3.5 w-3.5" /> Bobby Protocol
        </a>

        <div className="mt-8 flex flex-wrap items-center gap-3">
          <h1 className="text-4xl font-extrabold tracking-[-0.06em] md:text-6xl">Break Bobby, <span className="text-[#0052ff]">get paid.</span></h1>
        </div>
        <p className="mt-5 max-w-2xl text-lg leading-8 text-white/55">
          Being wrong in public is part of the design — paying you to prove it is too.
          <b className="text-white/85"> $5,000 USDC initial pool</b>, funded from the protocol treasury
          when mainnet ships behind the 2-of-3 Safe. Terms are live now; start reading the code.
        </p>

        <div className="mt-10 space-y-4">
          {TIERS.map(([amount, scope, note]) => (
            <div key={amount} className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
              <div className="flex items-center gap-2 font-mono text-lg font-bold tracking-[-0.02em] text-white">
                {amount.includes('challenge') ? <Swords className="h-4 w-4 text-[#7da6ff]" /> : <Bug className="h-4 w-4 text-[#7da6ff]" />} {amount} USDC
              </div>
              <p className="mt-2 text-sm leading-6 text-white/60">{scope}</p>
              <p className="mt-1.5 text-xs leading-5 text-white/35">{note}</p>
            </div>
          ))}
        </div>

        <h2 className="mt-12 text-2xl font-extrabold tracking-[-0.04em]">Scope</h2>
        <ul className="mt-4 list-disc space-y-2 pl-5 text-sm leading-7 text-white/60">
          <li><b className="text-white/85">In:</b> the frozen contracts (<code className="rounded bg-white/10 px-1.5 text-xs">contracts/src</code>, release 11532f4), the recorder pipeline, the verifiable-calls ledger and challenge scanner (spoofing counts).</li>
          <li><b className="text-white/85">Out:</b> public RPC outages, social engineering, findings already documented on the <a href="/protocol/risk" className="text-[#7da6ff] hover:text-white">risk page</a> as accepted trust assumptions, and testnet-only issues with no mainnet equivalent.</li>
          <li>First valid report per finding wins. Duplicates split nothing — check the <a href="/protocol/audits" className="text-[#7da6ff] hover:text-white">audit trail</a> first: four P1s are already dead.</li>
        </ul>

        <h2 className="mt-12 text-2xl font-extrabold tracking-[-0.04em]">How to report</h2>
        <ul className="mt-4 list-disc space-y-2 pl-5 text-sm leading-7 text-white/60">
          <li><b className="text-white/85">Vulnerabilities:</b> private disclosure via <a href={`${GH}/security/advisories/new`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[#7da6ff] hover:text-white">GitHub Security Advisories <ArrowUpRight className="h-3 w-3" /></a> — include a reproduction. 90-day coordinated disclosure.</li>
          <li><b className="text-white/85">Challenges:</b> no report needed — the reclassification tx IS the claim. Drop the tx hash in a <a href={`${GH}/issues/new`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[#7da6ff] hover:text-white">GitHub issue <ArrowUpRight className="h-3 w-3" /></a> with your payout address.</li>
          <li>Payouts in USDC on Base within 14 days of validation, from the treasury Safe. Public hall of fame — or stay anon, your call.</li>
        </ul>

        <div className="mt-12 flex items-start gap-3 rounded-2xl border border-amber-400/25 bg-amber-400/[0.06] p-5">
          <Trophy className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
          <p className="text-sm leading-6 text-white/60">
            <b className="text-amber-200">Program status:</b> terms published, pool funds at mainnet
            launch together with the Safe. Reports are accepted starting now — anything valid found
            before funding still pays at launch.
          </p>
        </div>

        <p className="mt-10 font-mono text-[11px] leading-5 text-white/30">
          See also: <a href="/protocol/calls" className="text-white/50 underline-offset-2 hover:underline">verifiable calls</a> ·{' '}
          <a href="/protocol/audits" className="text-white/50 underline-offset-2 hover:underline">audit trail</a> ·{' '}
          <a href="/protocol/risk" className="text-white/50 underline-offset-2 hover:underline">risk & claims</a>
        </p>
      </div>
    </div>
  );
}
