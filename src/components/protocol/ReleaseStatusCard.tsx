import { ArrowUpRight, ShieldCheck } from 'lucide-react';
import { PROTOCOL_RELEASE } from '@/data/protocol-release';

interface ReleaseStatusCardProps {
  className?: string;
  showGates?: boolean;
}

export default function ReleaseStatusCard({
  className = '',
  showGates = true,
}: ReleaseStatusCardProps) {
  return (
    <aside
      className={`overflow-hidden rounded-2xl border border-[#0052ff]/35 bg-[linear-gradient(135deg,rgba(0,82,255,.15),rgba(11,11,18,.92)_55%)] ${className}`}
      aria-label="Base mainnet release status"
    >
      <div className="grid gap-6 p-5 sm:p-6 lg:grid-cols-[1.15fr_.85fr] lg:p-7">
        <div>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-2 rounded-full border border-[#7da6ff]/35 bg-[#0052ff]/15 px-3 py-1 font-mono text-[9px] font-bold uppercase tracking-[0.16em] text-[#a9c5ff]">
              <ShieldCheck className="h-3 w-3" aria-hidden="true" />
              {PROTOCOL_RELEASE.stage}
            </span>
            <span className="rounded-full border border-amber-300/20 bg-amber-300/[0.08] px-3 py-1 font-mono text-[9px] font-bold uppercase tracking-[0.16em] text-amber-200/80">
              {PROTOCOL_RELEASE.mainnetState}
            </span>
          </div>
          <h3 className="text-xl font-extrabold tracking-[-0.04em] text-white sm:text-2xl">
            TrackRecord V2 is reviewed. Deployment is the next proof.
          </h3>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-white/55">
            {PROTOCOL_RELEASE.trackRecordDetail}. No Base mainnet address is
            published until deployment receipts, Safe ownership and public
            telemetry reconcile.
          </p>
          <a
            href={PROTOCOL_RELEASE.readinessUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-5 inline-flex min-h-10 items-center gap-2 font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-[#9bbaff] transition hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7da6ff]"
          >
            Read the launch gates
            <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
          </a>
        </div>

        {showGates ? (
          <div className="border-t border-white/10 pt-5 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
            <div className="font-mono text-[9px] font-bold uppercase tracking-[0.16em] text-white/35">
              Gates still open
            </div>
            <ul className="mt-4 space-y-2.5">
              {PROTOCOL_RELEASE.gates.map((gate) => (
                <li key={gate} className="flex items-start gap-2.5 text-xs leading-5 text-white/55">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-300/70" aria-hidden="true" />
                  {gate}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
      <div className="flex flex-col gap-1 border-t border-white/10 bg-black/20 px-5 py-3 font-mono text-[9px] uppercase tracking-[0.14em] text-white/30 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-7">
        <span>{PROTOCOL_RELEASE.testEvidence}</span>
        <span>Updated {PROTOCOL_RELEASE.updatedAt}</span>
      </div>
    </aside>
  );
}
