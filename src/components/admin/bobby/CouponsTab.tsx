import { useState, type FormEvent } from 'react';
import { Plus } from 'lucide-react';
import { adminAction, createCoupon, fetchAdminCoupons, type AdminCoupon, type CouponStatus } from '@/lib/admin-client';
import { Btn, Card, CardHead, CopyButton, Empty, ErrorState, Field, FormMessage, Loading, Note, StaleBanner, Switch, TableScroll, Tag, TextInput, td, th, tr } from './ui';
import { fmtDate, fmtDateTime, fmtGift, fmtInt, timeOf } from './format';
import { toAdminError, useLoad } from './useLoad';

type Notify = (text: string, ok?: boolean) => void;

const REDEEM_BASE = 'https://bobbyprotocol.xyz/redeem?code=';
const STATUS: Record<CouponStatus, { label: string; tone: 'green' | 'orange' | 'red' | 'neutral' }> = {
  active: { label: 'Activo', tone: 'green' }, exhausted: { label: 'Agotado', tone: 'orange' },
  expired: { label: 'Vencido', tone: 'red' }, inactive: { label: 'Inactivo', tone: 'neutral' },
};
const redeemLink = (code: string) => `${REDEEM_BASE}${encodeURIComponent(code)}`;
const CODE_RE = /^[A-Z0-9][A-Z0-9-]{3,31}$/;
const digits = (v: string) => v.replace(/\D/g, '').slice(0, 5);

/** A date input (YYYY-MM-DD) as the end of that day in the owner's timezone. */
function endOfDayIso(day: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 23, 59, 59).toISOString();
}

function CreateCoupon({ onCreated }: { onCreated: (c: AdminCoupon) => void }) {
  const [code, setCode] = useState('');
  const [reads, setReads] = useState('10');
  const [profundo, setProfundo] = useState('');
  const [maximo, setMaximo] = useState('');
  const [maxRedemptions, setMaxRedemptions] = useState('');
  const [expires, setExpires] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [created, setCreated] = useState<AdminCoupon | null>(null);

  const n = { reads: Number(reads || 0), profundo: Number(profundo || 0), maximo: Number(maximo || 0) };
  const problems: string[] = [];
  if (code && !CODE_RE.test(code)) problems.push('El código lleva de 4 a 32 letras, números o guiones, y empieza con letra o número.');
  if (n.reads > 1000) problems.push('Lecturas: máximo 1000.');
  if (n.profundo > 200) problems.push('Profundo: máximo 200.');
  if (n.maximo > 100) problems.push('Máximo: máximo 100.');
  if (maxRedemptions && Number(maxRedemptions) < 1) problems.push('Máximo de canjes: al menos 1, o déjalo vacío para ilimitado.');
  const expiresAt = expires ? endOfDayIso(expires) : null;
  if (expires && (!expiresAt || (timeOf(expiresAt) ?? 0) < Date.now())) problems.push('La fecha de vencimiento ya pasó.');
  const empty = n.reads + n.profundo + n.maximo === 0;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (problems.length || empty) return;
    setBusy(true); setMsg(null); setCreated(null);
    try {
      const coupon = await createCoupon({
        ...(code ? { code } : {}),
        reads: n.reads, profundo: n.profundo, maximo: n.maximo,
        maxRedemptions: maxRedemptions ? Number(maxRedemptions) : null,
        expiresAt,
        ...(note.trim() ? { note: note.trim() } : {}),
      });
      setCreated(coupon);
      setCode(''); setNote('');
      onCreated(coupon);
    } catch (err) {
      setMsg({ ok: false, text: toAdminError(err).message });
    } finally { setBusy(false); }
  };

  return (
    <Card>
      <CardHead title="Crear cupón" sub="Cada cuenta de Apple o Google lo canjea una vez. Los usos regalados se gastan cuando se acaban los gratis." />
      <form onSubmit={submit} className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Field label="Código (opcional)" hint="vacío: se genera uno como BOBBY-7K2QX" className="col-span-2">
          <TextInput mono value={code} onChange={(e) => setCode(e.target.value.toUpperCase().replace(/\s+/g, '-').replace(/[^A-Z0-9-]/g, '').slice(0, 32))} placeholder="AMIGOS20" autoCapitalize="characters" spellCheck={false} />
        </Field>
        <Field label="Lecturas" hint="0–1000"><TextInput mono inputMode="numeric" value={reads} onChange={(e) => setReads(digits(e.target.value))} placeholder="0" /></Field>
        <Field label="Profundo" hint="0–200"><TextInput mono inputMode="numeric" value={profundo} onChange={(e) => setProfundo(digits(e.target.value))} placeholder="0" /></Field>
        <Field label="Máximo" hint="0–100"><TextInput mono inputMode="numeric" value={maximo} onChange={(e) => setMaximo(digits(e.target.value))} placeholder="0" /></Field>
        <Field label="Máximo de canjes" hint="vacío = ilimitado">
          <TextInput mono inputMode="numeric" value={maxRedemptions} onChange={(e) => setMaxRedemptions(digits(e.target.value))} placeholder="∞" />
        </Field>
        <Field label="Vence" hint="vacío = no vence">
          <TextInput mono type="date" value={expires} onChange={(e) => setExpires(e.target.value)} />
        </Field>
        <Field label="Nota (solo para ti)">
          <TextInput value={note} onChange={(e) => setNote(e.target.value.slice(0, 200))} placeholder="Campaña, persona…" />
        </Field>
        <div className="col-span-2 flex flex-col gap-2 md:col-span-4">
          {problems.map((p) => <FormMessage key={p} message={{ ok: false, text: p }} />)}
          {!problems.length && empty && <p className="m-0 font-mono text-[11px] text-[#5C5C5C]">Pon al menos una lectura, un Profundo o un Máximo.</p>}
          <FormMessage message={msg} />
          <div className="flex justify-end">
            <Btn type="submit" variant="primary" busy={busy} disabled={problems.length > 0 || empty}>{!busy && <Plus className="h-4 w-4" aria-hidden />}Crear cupón</Btn>
          </div>
        </div>
      </form>
      {created && (
        <div className="mt-4 flex flex-col gap-2 rounded-xl border border-[#F28C38]/25 bg-[#F28C38]/[0.06] p-3" role="status">
          <p className="m-0 flex flex-wrap items-center gap-2 text-[13px] text-[#EDEDED]">
            <Tag tone="orange">Creado</Tag><span className="font-mono">{created.code}</span>
            <span className="font-mono text-[11.5px] uppercase text-[#8B8B8B]">{fmtGift(created.reads, created.profundo, created.maximo)}</span>
          </p>
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <code className="min-w-0 flex-1 break-all rounded-lg border border-white/[0.06] bg-[#0F0F10] px-3 py-2 font-mono text-[12px] text-[#EDEDED]">{redeemLink(created.code)}</code>
            <CopyButton text={redeemLink(created.code)} label="Copiar link" size="md" variant="secondary" />
          </div>
        </div>
      )}
    </Card>
  );
}

export default function CouponsTab({ refreshKey, notify, onChanged }: { refreshKey: number; notify: Notify; onChanged: () => void }) {
  const { data, error, loading, reload } = useLoad(fetchAdminCoupons, `coupons|${refreshKey}`);
  const [toggling, setToggling] = useState<string | null>(null);

  const setActive = async (c: AdminCoupon, active: boolean) => {
    setToggling(c.code);
    try {
      await adminAction({ action: 'set-coupon-active', code: c.code, active });
      notify(active ? `Cupón ${c.code} activado.` : `Cupón ${c.code} desactivado.`);
      await reload(true);
      onChanged();
    } catch (err) {
      notify(toAdminError(err).message, false);
    } finally { setToggling(null); }
  };

  return (
    <div className="flex flex-col gap-4">
      <CreateCoupon onCreated={(c) => { notify(`Cupón ${c.code} creado.`); void reload(true); onChanged(); }} />

      {data && error && <StaleBanner error={error} onRetry={() => void reload()} />}

      <Card>
        <CardHead
          title="Cupones"
          count={data ? `${data.totals.coupons != null ? fmtInt(data.totals.coupons) : fmtInt(data.coupons.length)} creados${data.totals.coupons != null && data.totals.coupons > data.coupons.length ? ` · ${fmtInt(data.coupons.length)} mostrados` : ''}` : undefined}
        />
        {error && !data ? <ErrorState message={error.message} onRetry={() => void reload()} />
          : !data ? <Loading label="Cargando cupones" />
          : data.coupons.length === 0 ? <Empty>Todavía no hay cupones</Empty>
          : (
            <div className={loading ? 'opacity-60' : undefined}>
              <TableScroll minWidth={980}>
                <thead>
                  <tr>
                    <th className={th}>Código</th>
                    <th className={th}>Estado</th>
                    <th className={th}>Regalo</th>
                    <th className={`${th} text-right`}>Canjes</th>
                    <th className={th}>Vence</th>
                    <th className={th}>Encendido</th>
                    <th className={th}>Link</th>
                    <th className={th}>Nota</th>
                    <th className={th}>Creado</th>
                  </tr>
                </thead>
                <tbody>
                  {data.coupons.map((c) => {
                    const st = STATUS[c.status];
                    return (
                      <tr key={c.code} className={tr}>
                        <td className={`${td} font-mono text-[12.5px]`}>{c.code}</td>
                        <td className={td}><Tag tone={st.tone}>{st.label}</Tag></td>
                        <td className={`${td} font-mono text-[11.5px] uppercase text-[#8B8B8B]`}>{fmtGift(c.reads, c.profundo, c.maximo)}</td>
                        <td className={`${td} text-right font-mono text-[12.5px] tabular-nums`}>{fmtInt(c.redeemed)} <span className="text-[#5C5C5C]">/ {c.max_redemptions == null ? '∞' : fmtInt(c.max_redemptions)}</span></td>
                        <td className={`${td} font-mono text-[12px] text-[#8B8B8B]`}>{c.expires_at ? fmtDate(c.expires_at) : 'no vence'}</td>
                        <td className={td}>
                          <Switch checked={c.active} disabled={toggling === c.code} onChange={(next) => void setActive(c, next)} label={c.active ? `Desactivar ${c.code}` : `Activar ${c.code}`} />
                        </td>
                        <td className={td}><CopyButton text={redeemLink(c.code)} label="Copiar link" /></td>
                        <td className={`${td} text-[12.5px] text-[#8B8B8B]`}><div className="max-w-[220px] truncate" title={c.note ?? undefined}>{c.note ?? '—'}</div></td>
                        <td className={`${td} font-mono text-[12px] text-[#8B8B8B]`}>{fmtDate(c.created_at)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </TableScroll>
            </div>
          )}
      </Card>

      <Card>
        <CardHead
          title="Canjes recientes"
          count={data ? `${fmtInt(data.redemptions.length)} recientes${data.totals.redemptions != null ? ` · ${fmtInt(data.totals.redemptions)} en total` : ''}` : undefined}
        />
        {!data ? (error ? null : <Loading />) : data.redemptions.length === 0 ? <Empty>Nadie ha canjeado un cupón todavía</Empty> : (
          <TableScroll minWidth={560}>
            <thead><tr><th className={th}>Fecha</th><th className={th}>Código</th><th className={th}>Cuenta</th><th className={th}>Regalo</th></tr></thead>
            <tbody>
              {data.redemptions.map((r, idx) => (
                <tr key={`${r.code}-${r.identity_id}-${idx}`} className={tr}>
                  <td className={`${td} font-mono text-[12px] text-[#8B8B8B]`}>{fmtDateTime(r.created_at)}</td>
                  <td className={`${td} font-mono text-[12.5px]`}>{r.code}</td>
                  <td className={td}><div className="max-w-[260px] truncate" title={r.identity_id}>{r.email ?? <span className="font-mono text-[11px] text-[#8B8B8B]">{r.identity_id}</span>}</div></td>
                  <td className={`${td} font-mono text-[11.5px] uppercase text-[#8B8B8B]`}>{fmtGift(r.reads, r.profundo, r.maximo)}</td>
                </tr>
              ))}
            </tbody>
          </TableScroll>
        )}
      </Card>
      <Note tag="Link">El link de canje abre bobbyprotocol.xyz/redeem con el código ya puesto; si la persona no tiene cuenta, inicia sesión con Apple o Google y vuelve sola al canje.</Note>
    </div>
  );
}
