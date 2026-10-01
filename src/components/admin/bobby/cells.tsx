// Table cells shared by Usuarios and Membresías.
import type { AdminUser } from '@/lib/admin-client';
import { Tag } from './ui';
import { T } from './tokens';
import { ACTIVE_SUB, DASH, effectiveSubStatus, fmtDate, fmtDateTime, fmtInt, label, statusLabel, timeOf } from './format';

/** Apple lets people hide their email: such an account is told apart by its id. */
export function identityName(u: AdminUser): string {
  if (u.email) return u.email;
  if (u.wallet_only) return u.wallet ?? 'Wallet sin dirección';
  if (u.provider) return `${label(u.provider)} · ${u.id.slice(0, 8)}`;
  return u.id.slice(0, 8);
}

/** The last day the person really used Bobby (opened it or read): never an API call such as /admin's own. */
function lastActiveTime(u: AdminUser): number | null {
  const day = timeOf(u.last_active_day);
  const read = timeOf(u.last_read_at);
  if (day == null && read == null) return null;
  return Math.max(day ?? 0, read ?? 0);
}

/**
 * `team`: the email is on the owner's list (internal by email, which the users list does not flag itself).
 * Badges: Admin and Interna (by hand) and Equipo (by email) all leave the account out of every figure.
 */
export function Identity({ u, self, team }: { u: AdminUser; self?: boolean; team?: boolean }) {
  const name = identityName(u);
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="flex flex-wrap items-center gap-1.5">
        <span className={`max-w-[200px] truncate text-[13px] ${u.wallet_only && !u.email ? 'font-mono' : ''}`} title={u.email ?? u.id}>{name}</span>
        {!u.email && !u.wallet_only && (
          <span className="font-mono text-[10px] uppercase text-[#5C5C5C]" title={u.provider === 'apple' ? 'Apple oculta el email de esta persona' : 'La cuenta no tiene email'}>sin email</span>
        )}
      </span>
      <span className="flex flex-wrap items-center gap-1">
        {u.is_admin && <Tag tone="orange" title="Admin: queda fuera de todas las cifras">Admin</Tag>}
        {u.is_internal && <Tag tone="blue" title="Marcada a mano como interna: queda fuera de todas las cifras">Interna</Tag>}
        {team && !u.is_internal && <Tag tone="blue" title="Su email está en la lista del equipo: queda fuera de todas las cifras">Equipo</Tag>}
        {u.pro && <Tag tone="green">Pro</Tag>}
        {self && <Tag>Tú</Tag>}
        <span className="max-w-[150px] truncate font-mono text-[10.5px] text-[#5C5C5C]" title={u.id}>{u.id}</span>
      </span>
    </div>
  );
}

export function ProviderCell({ u }: { u: AdminUser }) {
  return (
    <div className="flex flex-col items-start gap-1">
      <Tag>{u.wallet_only ? 'Wallet' : label(u.provider)}</Tag>
      <span className="font-mono text-[10.5px] uppercase text-[#5C5C5C]" title="Plataforma de su primera lectura con cuenta">
        1.ª lectura: <span className="text-[#8B8B8B]">{u.platform ? label(u.platform) : DASH}</span>
      </span>
    </div>
  );
}

/** Plan from the server's `pro` (the source of truth); the subscription status is shown as it really is now. */
export function PlanCell({ u }: { u: AdminUser }) {
  const status = effectiveSubStatus(u.sub_status, u.current_period_end);
  const paidLive = !!status && ACTIVE_SUB.has(status);
  if (u.pro) {
    const source = paidLive && u.sub_provider
      ? `${label(u.sub_provider)} · ${statusLabel(status)}`
      : u.grant_source ? `Regalo · ${u.grant_source}` : u.sub_provider ? label(u.sub_provider) : '';
    const until = paidLive ? u.current_period_end : u.pro_until;
    return (
      <div className="flex flex-col items-start gap-1">
        <span className="flex items-center gap-1.5"><Tag tone="orange">Pro</Tag><span className="font-mono text-[10.5px] uppercase text-[#8B8B8B]">{source}</span></span>
        {until && <span className="font-mono text-[10.5px] uppercase text-[#5C5C5C]">{paidLive ? 'Renueva' : 'Hasta'} {fmtDate(until)}</span>}
      </div>
    );
  }
  return (
    <div className="flex flex-col items-start gap-1">
      <Tag>Gratis</Tag>
      {status && <span className="font-mono text-[10.5px] uppercase text-[#5C5C5C]">{label(u.sub_provider)} · {statusLabel(status)}</span>}
    </div>
  );
}

/** What is left of what an admin or a coupon gave (not what was given). */
export function GiftCell({ u }: { u: AdminUser }) {
  const parts: string[] = [];
  if (u.bonus_reads) parts.push(`${fmtInt(u.bonus_reads)} lect`);
  if (u.bonus_profundo) parts.push(`${fmtInt(u.bonus_profundo)} prof`);
  if (u.bonus_maximo) parts.push(`${fmtInt(u.bonus_maximo)} máx`);
  return <span className={`font-mono text-[11.5px] uppercase ${parts.length ? 'text-[#EDEDED]' : 'text-[#5C5C5C]'}`}>{parts.length ? parts.join(' · ') : DASH}</span>;
}

/** Created → first read → last real use on one line, scaled from the account's birth to now. */
export function Lifecycle({ u, now }: { u: AdminUser; now: number }) {
  const t0 = timeOf(u.created_at);
  if (t0 == null) return null;
  const span = Math.max(now - t0, 60_000);
  const x = (t: number | null) => (t == null ? null : 4 + Math.min(1, Math.max(0, (t - t0) / span)) * 72);
  const lastT = lastActiveTime(u);
  const first = x(timeOf(u.first_read_at));
  const last = x(lastT);
  const title = [
    `Creada ${fmtDateTime(u.created_at)}`,
    u.first_read_at ? `primera lectura ${fmtDateTime(u.first_read_at)}` : 'sin lecturas',
    lastT != null ? `último uso ${fmtDate(new Date(lastT).toISOString())}` : null,
  ].filter(Boolean).join(' → ');
  return (
    <svg width="80" height="12" viewBox="0 0 80 12" role="img" aria-label={title} className="block">
      <title>{title}</title>
      <line x1="4" y1="6" x2="76" y2="6" stroke={T.track} strokeWidth="3" strokeLinecap="round" />
      {first != null && last != null && last > first && <line x1={first} y1="6" x2={last} y2="6" stroke={T.blue} strokeOpacity="0.55" strokeWidth="3" strokeLinecap="round" />}
      <circle cx="4" cy="6" r="2.5" fill={T.card} stroke={T.muted} strokeWidth="1.25" />
      {first != null && <circle cx={first} cy="6" r="3" fill={T.blue} stroke={T.card} strokeWidth="1.25" />}
      {last != null && <circle cx={last} cy="6" r="3" fill={T.orange} stroke={T.card} strokeWidth="1.25" />}
    </svg>
  );
}
