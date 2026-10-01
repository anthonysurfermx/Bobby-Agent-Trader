// Building blocks for the owner dashboard: near-black cards with hairline borders, sans labels, and every
// number, delta, tag and caption in mono. Tables scroll inside their card, never the page.
import { forwardRef, useEffect, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Check, Copy, Loader2, RefreshCw, X } from 'lucide-react';
import type { Delta } from './deltas';

const cx = (...parts: Array<string | false | null | undefined>) => parts.filter(Boolean).join(' ');

export function Card({ children, className, padded = true }: { children: ReactNode; className?: string; padded?: boolean }) {
  return (
    <section className={cx('min-w-0 rounded-2xl border border-white/[0.06] bg-[#141415]', padded && 'p-5', className)}>
      {children}
    </section>
  );
}

/** Card title row: label, optional mono count, actions on the right. */
export function CardHead({ title, count, sub, right, className }: { title: ReactNode; count?: ReactNode; sub?: ReactNode; right?: ReactNode; className?: string }) {
  return (
    <header className={cx('mb-4 flex flex-wrap items-start justify-between gap-x-3 gap-y-2', className)}>
      <div className="min-w-0">
        <h3 className="m-0 flex items-baseline gap-2 text-[13px] font-normal text-[#EDEDED]">
          {title}
          {count != null && <span className="font-mono text-[10.5px] uppercase tracking-[0.06em] text-[#5C5C5C]">{count}</span>}
        </h3>
        {sub && <p className="m-0 mt-1 text-[12px] leading-snug text-[#8B8B8B]">{sub}</p>}
      </div>
      {right && <div className="flex min-w-0 flex-wrap items-center gap-2">{right}</div>}
    </header>
  );
}

// ---------------------------------------------------------------- deltas

function pctText(p: number): string {
  const v = Math.abs(p * 100);
  const s = v >= 100 ? Math.round(v).toLocaleString('es-MX') : v.toFixed(1).replace(/\.0$/, '');
  return `${s}%`;
}

/** "+25% ↑" green / "12.5% ↓" red (inverted for costs). Null pct: no base to compare with. */
export function DeltaValue({ d, invert }: { d: Delta; invert?: boolean }) {
  if (d.pct == null) return <span className="text-[#8B8B8B]">{d.cur > 0 ? 'nuevo' : '0%'}</span>;
  if (Math.abs(d.pct) < 0.0005) return <span className="text-[#8B8B8B]">0% →</span>;
  const up = d.pct > 0;
  const good = invert ? !up : up;
  return <span className={good ? 'text-[#4ADE80]' : 'text-[#F06A6A]'}>{up ? `+${pctText(d.pct)} ↑` : `${pctText(d.pct)} ↓`}</span>;
}

export function DeltaLine({ d, invert, suffix = 'vs periodo anterior', fallback }: { d: Delta | null | undefined; invert?: boolean; suffix?: string; fallback?: ReactNode }) {
  if (!d) return fallback ? <div className="font-mono text-[12px] text-[#5C5C5C]">{fallback}</div> : null;
  return (
    <div className="flex flex-wrap items-baseline gap-x-2 font-mono text-[12px]">
      <DeltaValue d={d} invert={invert} />
      <span className="text-[#8B8B8B]">{d.pct == null && d.prev === 0 ? 'sin periodo anterior' : suffix}</span>
    </div>
  );
}

// ---------------------------------------------------------------- KPI strip

export interface KpiItem { label: string; value: ReactNode; delta?: Delta | null; invert?: boolean; caption?: ReactNode; tone?: 'red' }

/** One card split in three columns with hairline dividers (stacks on phones). */
export function KpiStrip({ items }: { items: KpiItem[] }) {
  return (
    <Card padded={false} className="grid grid-cols-1 divide-y divide-white/[0.06] sm:grid-cols-3 sm:divide-x sm:divide-y-0">
      {items.map((k) => (
        <div key={k.label} className="flex min-w-0 flex-col justify-between gap-5 p-5">
          <div className="min-w-0">
            <div className="text-[13px] text-[#EDEDED]/90">{k.label}</div>
            <div className={cx('mt-2 truncate font-mono text-[28px] font-medium leading-none tracking-[-0.02em]', k.tone === 'red' ? 'text-[#F06A6A]' : 'text-[#EDEDED]')}>{k.value}</div>
          </div>
          {k.delta !== undefined || k.caption ? (
            <div className="flex min-w-0 flex-col gap-1">
              {k.delta !== undefined && <DeltaLine d={k.delta} invert={k.invert} fallback={!k.caption ? 'sin comparación' : undefined} />}
              {k.caption && <div className="truncate font-mono text-[12px] text-[#8B8B8B]">{k.caption}</div>}
            </div>
          ) : null}
        </div>
      ))}
    </Card>
  );
}

/** Secondary metric: label, big mono value, delta or caption. */
export function Metric({ label, value, delta, invert, caption, className }: { label: string; value: ReactNode; delta?: Delta | null; invert?: boolean; caption?: ReactNode; className?: string }) {
  return (
    <Card className={cx('flex flex-col justify-between gap-4', className)}>
      <div className="min-w-0">
        <div className="text-[13px] text-[#EDEDED]/90">{label}</div>
        <div className="mt-2 truncate font-mono text-[26px] font-medium leading-none tracking-[-0.02em] text-[#EDEDED]">{value}</div>
      </div>
      <div className="flex flex-col gap-1">
        {delta !== undefined && <DeltaLine d={delta} invert={invert} fallback={!caption ? 'sin comparación' : undefined} />}
        {caption && <div className="font-mono text-[12px] leading-snug text-[#8B8B8B]">{caption}</div>}
      </div>
    </Card>
  );
}

/** Small mono label/value row inside cards. */
export function Row({ label, value, hint }: { label: ReactNode; value: ReactNode; hint?: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-white/[0.05] py-2.5 last:border-b-0">
      <span className="min-w-0 font-mono text-[11.5px] uppercase tracking-[0.04em] text-[#8B8B8B]">
        {label}{hint != null && <span className="ml-2 normal-case tracking-normal text-[#5C5C5C]">{hint}</span>}
      </span>
      <span className="shrink-0 font-mono text-[13px] tabular-nums text-[#EDEDED]">{value}</span>
    </div>
  );
}

// ---------------------------------------------------------------- controls

type TagTone = 'neutral' | 'orange' | 'blue' | 'green' | 'red';
export function Tag({ children, tone = 'neutral', title }: { children: ReactNode; tone?: TagTone; title?: string }) {
  return (
    <span
      title={title}
      className={cx('inline-flex items-center whitespace-nowrap rounded-md border px-1.5 py-[3px] font-mono text-[10px] font-medium uppercase leading-none tracking-[0.06em]',
        tone === 'neutral' && 'border-white/[0.08] text-[#8B8B8B]',
        tone === 'orange' && 'border-[#F28C38]/30 bg-[#F28C38]/10 text-[#F7A04B]',
        tone === 'blue' && 'border-[#4FB3FF]/30 bg-[#4FB3FF]/10 text-[#6CC4FF]',
        tone === 'green' && 'border-[#4ADE80]/25 bg-[#4ADE80]/10 text-[#4ADE80]',
        tone === 'red' && 'border-[#F06A6A]/30 bg-[#F06A6A]/10 text-[#F06A6A]',
      )}
    >
      {children}
    </span>
  );
}

type BtnVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export function Btn({ variant = 'secondary', size = 'md', busy, className, children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: BtnVariant; size?: 'sm' | 'md'; busy?: boolean;
}) {
  return (
    <button
      type="button"
      {...rest}
      disabled={rest.disabled || busy}
      className={cx(
        'inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#F28C38]',
        size === 'sm' ? 'h-7 px-2 text-[12px]' : 'h-9 px-3 text-[13px]',
        variant === 'primary' && 'bg-[#EDEDED] text-[#0B0B0C] hover:bg-white',
        variant === 'secondary' && 'border border-white/[0.08] bg-white/[0.04] text-[#EDEDED] hover:bg-white/[0.08]',
        variant === 'ghost' && 'text-[#8B8B8B] hover:bg-white/[0.05] hover:text-[#EDEDED]',
        variant === 'danger' && 'text-[#F06A6A] hover:bg-[#F06A6A]/10',
        className,
      )}
    >
      {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />}
      {children}
    </button>
  );
}

export function IconBtn({ label, children, className, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      type="button" aria-label={label} title={label} {...rest}
      className={cx('inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[#8B8B8B] transition-colors hover:bg-white/[0.06] hover:text-[#EDEDED] disabled:opacity-40',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#F28C38]', className)}
    >
      {children}
    </button>
  );
}

/** Small mono segmented chips (period selector, chart toggles). */
export function Segmented<V extends string | number>({ options, value, onChange, label }: {
  options: Array<{ value: V; label: string }>; value: V; onChange: (v: V) => void; label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex shrink-0 rounded-lg border border-white/[0.06] bg-[#0F0F10] p-0.5">
      {options.map((o) => (
        <button
          key={String(o.value)} type="button" role="radio" aria-checked={value === o.value} onClick={() => onChange(o.value)}
          className={cx('h-6 rounded-md px-2 font-mono text-[10.5px] uppercase tracking-[0.06em] transition-colors',
            'focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#F28C38]',
            value === o.value ? 'bg-white/[0.09] text-[#EDEDED]' : 'text-[#5C5C5C] hover:text-[#8B8B8B]')}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Field({ label, hint, children, className }: { label: string; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <label className={cx('flex min-w-0 flex-col gap-1.5', className)}>
      <span className="text-[12px] text-[#8B8B8B]">{label}</span>
      {children}
      {hint && <span className="font-mono text-[10.5px] leading-snug text-[#5C5C5C]">{hint}</span>}
    </label>
  );
}

export const TextInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { mono?: boolean }>(function TextInput({ className, mono, ...rest }, ref) {
  return (
    <input
      ref={ref}
      {...rest}
      className={cx(
        'h-9 w-full min-w-0 rounded-lg border border-white/[0.08] bg-[#0F0F10] px-3 text-[13px] text-[#EDEDED] placeholder:text-[#5C5C5C]',
        'focus:border-[#F28C38]/60 focus:outline-none [color-scheme:dark]',
        mono && 'font-mono',
        className,
      )}
    />
  );
});

/** On/off switch with an accessible label. */
export function Switch({ checked, onChange, label, disabled }: { checked: boolean; onChange: (next: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button
      type="button" role="switch" aria-checked={checked} aria-label={label} title={label} disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cx('relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors disabled:opacity-40',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#F28C38]',
        checked ? 'border-[#F28C38]/50 bg-[#F28C38]/25' : 'border-white/[0.08] bg-[#1F1F20]')}
    >
      <span className={cx('inline-block h-3.5 w-3.5 rounded-full transition-transform', checked ? 'translate-x-[18px] bg-[#F7A04B]' : 'translate-x-[2px] bg-[#5C5C5C]')} />
    </button>
  );
}

export function CopyButton({ text, label = 'Copiar', size = 'sm', variant = 'ghost' }: { text: string; label?: string; size?: 'sm' | 'md'; variant?: BtnVariant }) {
  const [done, setDone] = useState(false);
  useEffect(() => { if (!done) return; const t = window.setTimeout(() => setDone(false), 1600); return () => window.clearTimeout(t); }, [done]);
  const copy = async () => {
    try { await navigator.clipboard.writeText(text); setDone(true); }
    catch {
      const ta = document.createElement('textarea');
      ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); setDone(true); } finally { ta.remove(); }
    }
  };
  return (
    <Btn size={size} variant={variant} onClick={() => void copy()} aria-label={`${label}: ${text}`}>
      {done ? <Check className="h-3.5 w-3.5 text-[#4ADE80]" aria-hidden /> : <Copy className="h-3.5 w-3.5" aria-hidden />}
      {done ? 'Copiado' : label}
    </Btn>
  );
}

// ---------------------------------------------------------------- tables

/** Horizontal scroll for wide tables, contained in the card (bleeds to the card edge). */
export function TableScroll({ children, minWidth = 720 }: { children: ReactNode; minWidth?: number }) {
  return (
    <div className="-mx-5 overflow-x-auto overscroll-x-contain px-5">
      <table className="w-full border-collapse text-left text-[13px]" style={{ minWidth }}>{children}</table>
    </div>
  );
}
export const th = 'whitespace-nowrap border-b border-white/[0.06] px-2 pb-2.5 pt-0 font-mono text-[10px] font-normal uppercase tracking-[0.08em] text-[#5C5C5C] first:pl-0 last:pr-0';
export const td = 'whitespace-nowrap border-b border-white/[0.04] px-2 py-3 align-middle text-[#EDEDED] first:pl-0 last:pr-0';
/** A cell whose text may wrap (Tailwind cannot override whitespace-nowrap by class order). */
export const tdWrap = 'border-b border-white/[0.04] px-2 py-3 align-middle text-[#EDEDED] first:pl-0 last:pr-0';
export const tr = 'transition-colors hover:bg-white/[0.03]';

// ---------------------------------------------------------------- states

export function Note({ children, tag, tone = 'neutral' }: { children: ReactNode; tag?: string; tone?: 'neutral' | 'orange' | 'red' }) {
  return (
    <div className={cx('flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded-2xl border px-4 py-3 text-[13px] leading-relaxed',
      tone === 'neutral' && 'border-white/[0.06] bg-[#141415] text-[#8B8B8B]',
      tone === 'orange' && 'border-[#F28C38]/25 bg-[#F28C38]/[0.06] text-[#EDEDED]',
      tone === 'red' && 'border-[#F06A6A]/30 bg-[#F06A6A]/[0.06] text-[#F3B0B0]')}
    >
      {tag && <Tag tone={tone === 'neutral' ? 'neutral' : tone}>{tag}</Tag>}
      <span className="min-w-0 flex-1">{children}</span>
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="m-0 py-8 text-center font-mono text-[12px] uppercase tracking-[0.06em] text-[#5C5C5C]">{children}</p>;
}

export function Loading({ label = 'Cargando…' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-12 font-mono text-[12px] uppercase tracking-[0.06em] text-[#5C5C5C]" role="status">
      <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> {label}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-center gap-3 rounded-2xl border border-[#F06A6A]/25 bg-[#F06A6A]/[0.05] px-4 py-6 text-center">
      <p className="m-0 max-w-[460px] text-[13px] leading-relaxed text-[#F3B0B0]">{message}</p>
      {onRetry && <Btn size="sm" onClick={onRetry}><RefreshCw className="h-3.5 w-3.5" aria-hidden />Reintentar</Btn>}
    </div>
  );
}

export function Modal({ open, onOpenChange, title, description, children, footer, tone }: {
  open: boolean; onOpenChange: (open: boolean) => void; title: string; description?: ReactNode; children?: ReactNode; footer?: ReactNode; tone?: 'danger';
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/70 backdrop-blur-[2px]" />
        <Dialog.Content
          className={cx('fixed left-1/2 top-1/2 z-50 flex max-h-[calc(100svh-32px)] w-[calc(100vw-32px)] max-w-[440px] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border bg-[#141415] font-sans text-[#EDEDED] shadow-2xl focus:outline-none',
            tone === 'danger' ? 'border-[#F06A6A]/30' : 'border-white/[0.08]')}
        >
          <div className="flex items-start justify-between gap-3 px-5 pt-5">
            <Dialog.Title className={cx('m-0 text-[15px] font-medium', tone === 'danger' && 'text-[#F06A6A]')}>{title}</Dialog.Title>
            <Dialog.Close className="-mr-1 -mt-1 rounded-md p-1 text-[#5C5C5C] hover:text-[#EDEDED] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#F28C38]" aria-label="Cerrar">
              <X className="h-4 w-4" />
            </Dialog.Close>
          </div>
          {description ? (
            <Dialog.Description asChild>
              <div className="px-5 pt-2 text-[13px] leading-relaxed text-[#8B8B8B]">{description}</div>
            </Dialog.Description>
          ) : (
            <Dialog.Description className="sr-only">{title}</Dialog.Description>
          )}
          <div className="min-h-0 overflow-y-auto px-5 py-4">{children}</div>
          {footer && <div className="flex flex-wrap items-center justify-end gap-2 border-t border-white/[0.06] px-5 py-3">{footer}</div>}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/** Inline result line under a form (server messages are shown verbatim). */
export function FormMessage({ message }: { message: { ok: boolean; text: string } | null }) {
  if (!message) return null;
  return (
    <p role={message.ok ? 'status' : 'alert'} className={cx('m-0 text-[12.5px] leading-snug', message.ok ? 'text-[#4ADE80]' : 'text-[#F06A6A]')}>
      {message.text}
    </p>
  );
}
