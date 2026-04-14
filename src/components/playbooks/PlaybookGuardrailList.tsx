// ============================================================
// PlaybookGuardrailList — renders trader-facing guardrail chips
// Maps slugs to human labels via GUARDRAIL_LABELS. Unknown slugs
// are silently dropped in prod (dev warns) — keeps the data file
// as single source of truth.
// ============================================================

import { ShieldCheck } from 'lucide-react';
import { GUARDRAIL_LABELS } from '@/data/playbooks';

interface PlaybookGuardrailListProps {
  slugs: string[];
}

export default function PlaybookGuardrailList({ slugs }: PlaybookGuardrailListProps) {
  const items = slugs
    .map((slug) => {
      const label = GUARDRAIL_LABELS[slug];
      if (!label && import.meta.env.DEV) {
        console.warn(`[PlaybookGuardrailList] unknown guardrail slug: ${slug}`);
      }
      return label ? { slug, label } : null;
    })
    .filter((x): x is { slug: string; label: string } => x !== null);

  if (items.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2">
      {items.map((g) => (
        <div
          key={g.slug}
          className="inline-flex items-center gap-2 rounded-lg border border-white/[0.04] bg-white/[0.02] px-3 py-1.5"
        >
          <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-[#ff716a]" />
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-white/70">{g.label}</span>
        </div>
      ))}
    </div>
  );
}
