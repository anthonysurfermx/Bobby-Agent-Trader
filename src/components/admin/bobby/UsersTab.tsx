import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { ChevronLeft, ChevronRight, Gift, Search, Trash2 } from 'lucide-react';
import { adminAction, fetchAdminUsers, type AdminMe, type AdminUser, type InternalResponse } from '@/lib/admin-client';
import { Btn, Card, CardHead, Empty, ErrorState, Field, FormMessage, Loading, Modal, Note, Segmented, StaleBanner, Switch, TableScroll, TextInput, td, tdWrap, th, tr } from './ui';
import { GiftCell, Identity, Lifecycle, PlanCell, ProviderCell, identityName } from './cells';
import { DASH, fmtDate, fmtDateTime, fmtInt, fmtMinutes, fmtRelative, timeOf } from './format';
import { toAdminError, useLoad } from './useLoad';
import InternalTrafficCard from './InternalTrafficCard';

const PAGE = 50;

type Notify = (text: string, ok?: boolean) => void;
type WalletFilter = 'all' | 'accounts' | 'wallets';

/** 'YYYY-MM-DD' (a UTC day) as "hoy", "ayer", "hace 4 días"; older than two months, the date. */
function dayAgo(day: string | null): string {
  const m = day ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(day) : null;
  if (!m) return DASH;
  const now = new Date();
  const diff = Math.round((Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))) / 86_400_000);
  if (diff <= 0) return 'hoy';
  if (diff === 1) return 'ayer';
  if (diff <= 60) return `hace ${diff} días`;
  return fmtDate(day);
}

export default function UsersTab({ me, refreshKey, notify, onChanged, focusSearch, onSearchFocused }: {
  me: AdminMe; refreshKey: number; notify: Notify; onChanged: () => void; focusSearch: boolean; onSearchFocused: () => void;
}) {
  const [input, setInput] = useState('');
  const [q, setQ] = useState('');
  const [offset, setOffset] = useState(0);
  const [hideInternal, setHideInternal] = useState(true);
  const [walletFilter, setWalletFilter] = useState<WalletFilter>('all');
  const [grantFor, setGrantFor] = useState<AdminUser | null>(null);
  const [deleteFor, setDeleteFor] = useState<AdminUser | null>(null);
  const [adminFor, setAdminFor] = useState<AdminUser | null>(null);
  const [savingInternal, setSavingInternal] = useState<string | null>(null);
  // The page's onChanged reloads the overview only: a change here (or in the internal-traffic card) bumps
  // this so both lists reload together.
  const [localKey, setLocalKey] = useState(0);
  const [teamEmails, setTeamEmails] = useState<Set<string>>(() => new Set());
  const searchRef = useRef<HTMLInputElement>(null);

  // The sidebar's "Buscar" item and the "/" shortcut land here.
  useEffect(() => {
    if (!focusSearch) return;
    searchRef.current?.focus();
    searchRef.current?.select();
    onSearchFocused();
  }, [focusSearch, onSearchFocused]);

  // Search as you type, a beat after the last key.
  useEffect(() => {
    const t = window.setTimeout(() => { setQ(input.trim()); setOffset(0); }, 350);
    return () => window.clearTimeout(t);
  }, [input]);

  const { data, error, loading, reload } = useLoad(() => fetchAdminUsers({ q, limit: PAGE, offset }), `${q}|${offset}|${refreshKey}|${localKey}`);
  const now = Date.now();

  const changed = useCallback(() => { setLocalKey((k) => k + 1); onChanged(); }, [onChanged]);
  const onInternalLoaded = useCallback((r: InternalResponse) => { setTeamEmails(new Set(r.emails.map((e) => e.toLowerCase()))); }, []);

  const submit = (e: FormEvent) => { e.preventDefault(); setQ(input.trim()); setOffset(0); };
  // changed() bumps localKey, which reloads this list and the internal-traffic card.
  const done = (text: string) => { notify(text); changed(); };

  // The users list flags admins and hand marks; the owner's email list is matched here, so "Ocultar internas"
  // hides every account the overview already leaves out.
  const onTeamList = useCallback((u: AdminUser) => !!u.email && teamEmails.has(u.email.toLowerCase()), [teamEmails]);
  // The server's is_team applies the same rule as the figures; the email list covers a response from before it.
  const isInternal = useCallback((u: AdminUser) => u.is_team || u.is_admin || u.is_internal || onTeamList(u), [onTeamList]);

  const setInternal = async (u: AdminUser, internal: boolean) => {
    setSavingInternal(u.id);
    try {
      await adminAction({ action: 'set-internal', identityId: u.id, internal });
      done(internal ? `${identityName(u)} queda fuera de las cifras.` : `${identityName(u)} vuelve a contar en las cifras.`);
    } catch (err) {
      notify(toAdminError(err).message, false);
    } finally { setSavingInternal(null); }
  };

  const rows = useMemo(() => (data?.users ?? []).filter((u) =>
    (!hideInternal || !isInternal(u))
    && (walletFilter === 'all' || (walletFilter === 'wallets' ? u.wallet_only : !u.wallet_only))), [data, hideInternal, isInternal, walletFilter]);
  const hiddenHere = (data?.users.length ?? 0) - rows.length;

  const total = data?.total ?? 0;
  const from = total ? offset + 1 : 0;
  const to = Math.min(offset + PAGE, total);
  const readsSince = data?.readsSince ?? null;

  return (
    <div className="flex flex-col gap-4">
    <Card>
      <CardHead
        title="Usuarios"
        count={data ? `${fmtInt(data.accounts)} cuentas · ${fmtInt(data.wallets)} wallets · ${fmtInt(data.internal)} internas${q ? ` · para “${q}”` : ''}` : undefined}
        sub={data ? (
          <>Internas = admins o marcadas a mano{teamEmails.size ? '; las de los emails del equipo también salen de las cifras y aquí se marcan «Equipo»' : ''}. Lecturas con cuenta desde {readsSince ? fmtDate(readsSince) : 'sin lecturas aún'}.</>
        ) : undefined}
        right={(
          <form onSubmit={submit} className="w-full sm:w-[320px]" role="search">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#5C5C5C]" aria-hidden />
              <TextInput
                ref={searchRef} value={input} onChange={(e) => setInput(e.target.value)}
                placeholder="Buscar por email, id (prefijo) o wallet" aria-label="Buscar por email, id (prefijo) o wallet" className="pl-8 pr-9" type="search"
              />
              <kbd className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 rounded border border-white/[0.08] px-1.5 font-mono text-[10px] text-[#5C5C5C]">/</kbd>
            </div>
          </form>
        )}
        className="flex-col sm:flex-row [&>div:last-child]:w-full sm:[&>div:last-child]:w-auto"
      />
      <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2">
        <label className="flex cursor-pointer items-center gap-2 text-[12px] text-[#8B8B8B]">
          <Switch checked={hideInternal} onChange={setHideInternal} label="Ocultar cuentas internas (admins, marcadas y del equipo)" />
          Ocultar internas
        </label>
        <Segmented<WalletFilter>
          label="Tipo de cuenta" value={walletFilter} onChange={setWalletFilter}
          options={[{ value: 'all', label: 'Todas' }, { value: 'accounts', label: 'Sin wallets' }, { value: 'wallets', label: 'Solo wallets' }]}
        />
        {data && hiddenHere > 0 && (
          <span className="font-mono text-[10.5px] uppercase tracking-[0.06em] text-[#5C5C5C]">{fmtInt(hiddenHere)} ocultas en esta página</span>
        )}
      </div>
      {error && !data ? (
        <ErrorState message={error.message} onRetry={() => void reload()} />
      ) : !data ? (
        <Loading label="Cargando cuentas" />
      ) : (
        <>
          {error && <div className="mb-3"><StaleBanner error={error} onRetry={() => void reload()} /></div>}
          {data.users.length === 0 ? (
            <Empty>{q ? `Nada coincide con “${q}”` : 'Todavía no hay cuentas'}</Empty>
          ) : rows.length === 0 ? (
            <Empty>Las {fmtInt(data.users.length)} cuentas de esta página están ocultas por los filtros</Empty>
          ) : (
            <div className={loading ? 'opacity-60 transition-opacity' : 'transition-opacity'}>
              <TableScroll minWidth={1160}>
                <thead>
                  <tr>
                    <th className={th}>Cuenta</th>
                    <th className={th}>Proveedor</th>
                    <th className={th}>Creada · activación</th>
                    <th className={`${th} text-right`} title={`Lecturas registradas desde ${readsSince ? fmtDate(readsSince) : '—'}`}>Lecturas</th>
                    <th className={th}>Última actividad</th>
                    <th className={th}>Plan</th>
                    <th className={th}>Saldo regalado</th>
                    <th className={`${th} text-right`} title="Instalaciones (navegadores o iPhones) ligadas a la cuenta">Instal.</th>
                    <th className={th}>Admin</th>
                    <th className={th} title="Interna: queda fuera de todas las cifras">Interna</th>
                    <th className={`${th} text-right`}>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((u) => {
                    const self = u.id === me.identityId;
                    const team = onTeamList(u);
                    const created = timeOf(u.created_at);
                    const since = timeOf(readsSince);
                    const beforeMeasure = created != null && since != null && created < since;
                    return (
                      <tr key={u.id} className={`${tr} ${isInternal(u) ? 'bg-[#4FB3FF]/[0.03]' : ''}`}>
                        <td className={td}><Identity u={u} self={self} team={team} /></td>
                        <td className={td}><ProviderCell u={u} /></td>
                        <td className={td}>
                          <div className="flex flex-col gap-1 font-mono">
                            <span className="text-[12px] text-[#EDEDED]" title={fmtDateTime(u.created_at)}>{fmtDate(u.created_at)}</span>
                            <span className="text-[10.5px] uppercase text-[#5C5C5C]" title={u.first_read_at ? `Primera lectura ${fmtDateTime(u.first_read_at)}` : undefined}>
                              {!u.first_read_at ? 'sin lecturas'
                                : u.activation_minutes != null
                                  ? <>1.ª lect {fmtDate(u.first_read_at)} · <span className="text-[#8B8B8B]">{fmtMinutes(u.activation_minutes)}</span></>
                                  : <>1.ª lect {fmtDate(u.first_read_at)} · {beforeMeasure ? `sin dato (cuenta anterior al ${fmtDate(readsSince)})` : 'sin dato'}</>}
                            </span>
                          </div>
                        </td>
                        <td className={`${td} text-right`}>
                          <div className="flex flex-col items-end gap-1 font-mono tabular-nums">
                            <span className="text-[12.5px]">{fmtInt(u.reads ?? 0)}</span>
                            {u.guest_reads > 0 && <span className="text-[10.5px] text-[#5C5C5C]" title="Lecturas de sus instalaciones antes de iniciar sesión">+{fmtInt(u.guest_reads)} como invitado</span>}
                          </div>
                        </td>
                        <td className={td}>
                          <div className="flex flex-col gap-1.5">
                            <span className="font-mono text-[11.5px] text-[#EDEDED]" title={u.last_active_day ? `Último día que abrió Bobby o leyó (UTC): ${fmtDate(u.last_active_day)}` : 'No ha abierto Bobby ni leído desde que se mide'}>
                              {u.last_active_day ? dayAgo(u.last_active_day) : 'sin uso registrado'}
                            </span>
                            <span className="font-mono text-[10px] uppercase text-[#5C5C5C]" title={u.last_seen_at ? `Última sesión: ${fmtDateTime(u.last_seen_at)} (cualquier llamada con su sesión)` : undefined}>
                              última sesión {fmtRelative(u.last_seen_at, now)}
                            </span>
                            <Lifecycle u={u} now={now} />
                          </div>
                        </td>
                        <td className={td}><PlanCell u={u} /></td>
                        <td className={`${tdWrap} w-[120px] min-w-[96px] leading-snug`}><GiftCell u={u} /></td>
                        <td className={`${td} text-right font-mono text-[12px] tabular-nums text-[#8B8B8B]`}>{fmtInt(u.installs)}</td>
                        <td className={td}>
                          <Switch
                            checked={u.is_admin}
                            onChange={() => setAdminFor(u)}
                            label={u.wallet_only ? 'Una cuenta de wallet no puede ser admin' : self ? 'No puedes quitarte el acceso a ti mismo' : u.is_admin ? `Quitar admin a ${identityName(u)}` : `Hacer admin a ${identityName(u)}`}
                            disabled={self || u.wallet_only}
                          />
                        </td>
                        <td className={td}>
                          <Switch
                            checked={u.is_internal}
                            onChange={(next) => void setInternal(u, next)}
                            label={savingInternal === u.id ? 'Guardando…'
                              : u.is_internal ? `Volver a contar a ${identityName(u)} en las cifras`
                              : u.is_admin ? `${identityName(u)} ya queda fuera por ser admin; marcarla la deja fuera aunque deje de serlo`
                              : team ? `${identityName(u)} ya queda fuera por estar en los emails del equipo; marcarla la deja fuera aunque se quite de la lista`
                              : `Marcar a ${identityName(u)} como interna (queda fuera de todas las cifras)`}
                            disabled={savingInternal != null}
                          />
                        </td>
                        <td className={td}>
                          <div className="flex items-center justify-end gap-1">
                            <Btn size="sm" variant="ghost" onClick={() => setGrantFor(u)}><Gift className="h-3.5 w-3.5" aria-hidden />Regalar</Btn>
                            <Btn
                              size="sm" variant="danger" onClick={() => setDeleteFor(u)} disabled={self}
                              title={self ? 'No puedes borrar tu propia cuenta' : `Borrar ${identityName(u)}`}
                              aria-label={self ? 'No puedes borrar tu propia cuenta' : `Borrar ${identityName(u)}`}
                            >
                              <Trash2 className="h-3.5 w-3.5" aria-hidden />
                            </Btn>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </TableScroll>
            </div>
          )}
          {total > 0 && (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
              <span className="font-mono text-[11px] uppercase tracking-[0.06em] text-[#5C5C5C]">
                {fmtInt(from)}–{fmtInt(to)} de {fmtInt(total)}{hiddenHere > 0 ? ` · los filtros aplican a esta página` : ''}
              </span>
              <div className="flex gap-1">
                <Btn size="sm" variant="secondary" onClick={() => setOffset(Math.max(0, offset - PAGE))} disabled={offset === 0 || loading}><ChevronLeft className="h-3.5 w-3.5" aria-hidden />Anterior</Btn>
                <Btn size="sm" variant="secondary" onClick={() => setOffset(offset + PAGE)} disabled={to >= total || loading}>Siguiente<ChevronRight className="h-3.5 w-3.5" aria-hidden /></Btn>
              </div>
            </div>
          )}
          {data.users.some((u) => u.activation_minutes == null && u.first_read_at) && readsSince && (
            <div className="mt-3">
              <Note>La activación (minutos de la cuenta a su primera lectura) solo se mide en cuentas creadas desde el {fmtDate(readsSince)}, cuando empezaron a registrarse las lecturas.</Note>
            </div>
          )}
        </>
      )}

      <GrantDialog user={grantFor} onClose={() => setGrantFor(null)} onDone={done} />
      <DeleteDialog user={deleteFor} onClose={() => setDeleteFor(null)} onDone={done} />
      <AdminDialog user={adminFor} onClose={() => setAdminFor(null)} onDone={done} />
    </Card>
    <InternalTrafficCard refreshKey={`${refreshKey}|${localKey}`} notify={notify} onChanged={changed} onLoaded={onInternalLoaded} meEmail={me.email} />
    </div>
  );
}

const who = (u: AdminUser) => u.email ?? u.id;
const intOrZero = (v: string) => { const n = Number(v); return /^\d+$/.test(v) && Number.isSafeInteger(n) ? n : NaN; };

function GrantDialog({ user, onClose, onDone }: { user: AdminUser | null; onClose: () => void; onDone: (text: string) => void }) {
  const inFlight = useRef(false);
  const [reads, setReads] = useState('');
  const [profundo, setProfundo] = useState('');
  const [maximo, setMaximo] = useState('');
  const [proDays, setProDays] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => { if (user) { setReads(''); setProfundo(''); setMaximo(''); setProDays(''); setMsg(null); } }, [user]);

  const values = { reads: intOrZero(reads || '0'), profundo: intOrZero(profundo || '0'), maximo: intOrZero(maximo || '0'), proDays: intOrZero(proDays || '0') };
  const limits = { reads: 1000, profundo: 200, maximo: 100, proDays: 366 };
  const invalid = (Object.keys(values) as Array<keyof typeof values>).find((k) => Number.isNaN(values[k]) || values[k] < 0 || values[k] > limits[k]);
  const empty = Object.values(values).every((v) => v === 0);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!user || invalid || empty || inFlight.current) return;
    inFlight.current = true;
    setBusy(true); setMsg(null);
    try {
      const body: { action: 'grant'; identityId: string; reads?: number; profundo?: number; maximo?: number; proDays?: number } = { action: 'grant', identityId: user.id };
      if (values.reads) body.reads = values.reads;
      if (values.profundo) body.profundo = values.profundo;
      if (values.maximo) body.maximo = values.maximo;
      if (values.proDays) body.proDays = values.proDays;
      await adminAction(body);
      onClose();
      onDone(`Regalo enviado a ${identityName(user)}.`);
    } catch (err) {
      setMsg({ ok: false, text: toAdminError(err).message });
    } finally { inFlight.current = false; setBusy(false); }
  };

  return (
    <Modal
      open={!!user} onOpenChange={(o) => { if (!o && !inFlight.current) onClose(); }}
      title="Regalar a esta cuenta"
      description={user && (
        <div className="flex flex-col gap-2">
          <p className="m-0">Se suma a lo que ya tiene <span className="break-all text-[#EDEDED]">{identityName(user)}</span>. Los días Pro se suman a su membresía.</p>
          <p className="m-0">Las lecturas regaladas solo se gastan cuando el cobro (BOBBY_PAYWALL) está encendido; Profundo y Máximo se gastan siempre.</p>
        </div>
      )}
    >
      <form onSubmit={submit} className="grid grid-cols-2 gap-3">
        <Field label="Lecturas" hint="0–1000"><TextInput mono disabled={busy} inputMode="numeric" value={reads} onChange={(e) => setReads(e.target.value)} placeholder="0" /></Field>
        <Field label="Profundo" hint="0–200"><TextInput mono disabled={busy} inputMode="numeric" value={profundo} onChange={(e) => setProfundo(e.target.value)} placeholder="0" /></Field>
        <Field label="Máximo" hint="0–100"><TextInput mono disabled={busy} inputMode="numeric" value={maximo} onChange={(e) => setMaximo(e.target.value)} placeholder="0" /></Field>
        <Field label="Días de Bobby Pro" hint="0–366"><TextInput mono disabled={busy} inputMode="numeric" value={proDays} onChange={(e) => setProDays(e.target.value)} placeholder="0" /></Field>
        <div className="col-span-2 flex flex-col gap-3">
          {invalid && <FormMessage message={{ ok: false, text: `Revisa el valor de ${{ reads: 'lecturas', profundo: 'Profundo', maximo: 'Máximo', proDays: 'días Pro' }[invalid]}.` }} />}
          <FormMessage message={msg} />
          <div className="flex justify-end gap-2">
            <Btn variant="ghost" disabled={busy} onClick={onClose}>Cancelar</Btn>
            <Btn type="submit" variant="primary" busy={busy} disabled={!!invalid || empty}>Regalar</Btn>
          </div>
        </div>
      </form>
    </Modal>
  );
}

function DeleteDialog({ user, onClose, onDone }: { user: AdminUser | null; onClose: () => void; onDone: (text: string) => void }) {
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => { if (user) { setTyped(''); setMsg(null); } }, [user]);
  const expected = user ? who(user) : '';
  // The server compares without case, like this.
  const matches = expected !== '' && typed.trim().toLowerCase() === expected.toLowerCase();
  const apple = !!user && (user.sub_provider === 'apple' || !!user.sub_status);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!user || !matches) return;
    setBusy(true); setMsg(null);
    try {
      await adminAction({ action: 'delete-user', identityId: user.id, confirm: typed.trim() });
      onClose();
      onDone(`Cuenta ${identityName(user)} borrada.`);
    } catch (err) {
      setMsg({ ok: false, text: toAdminError(err).message });
    } finally { setBusy(false); }
  };

  return (
    <Modal
      open={!!user} onOpenChange={(o) => { if (!o) onClose(); }} tone="danger"
      title="Borrar cuenta"
      description={user && (
        <div className="flex flex-col gap-2">
          <p className="m-0">Se borra la cuenta de Bobby de <span className="break-all font-mono text-[12px] text-[#EDEDED]">{expected}</span> y su inicio de sesión: progreso, lecturas, regalos y membresía en Bobby. <strong className="font-medium text-[#F06A6A]">No se puede deshacer.</strong></p>
          <p className="m-0">
            {apple
              ? 'Si paga con Apple, la suscripción sigue viva en Apple: la persona tiene que cancelarla en su iPhone (Ajustes › su nombre › Suscripciones). Bobby no puede cancelarla por ella.'
              : 'Una suscripción de Apple, si la hubiera, la tiene que cancelar la persona en los ajustes de Apple.'}
          </p>
        </div>
      )}
    >
      <form onSubmit={submit} className="flex flex-col gap-3">
        <Field
          label={user?.email ? 'Escribe el email de la cuenta para confirmar' : 'Escribe el id completo de la cuenta para confirmar'}
          hint={user && !user.email ? (user.wallet_only ? 'Las cuentas de wallet no tienen email.' : 'Esta cuenta no tiene email (Apple lo oculta).') : undefined}
        >
          <TextInput mono value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={expected} autoComplete="off" autoCapitalize="none" spellCheck={false} />
        </Field>
        <FormMessage message={msg} />
        <div className="flex justify-end gap-2">
          <Btn variant="ghost" onClick={onClose}>Cancelar</Btn>
          <Btn type="submit" variant="danger" className="border border-[#F06A6A]/30" busy={busy} disabled={!matches}><Trash2 className="h-3.5 w-3.5" aria-hidden />Borrar para siempre</Btn>
        </div>
      </form>
    </Modal>
  );
}

function AdminDialog({ user, onClose, onDone }: { user: AdminUser | null; onClose: () => void; onDone: (text: string) => void }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => { if (user) setMsg(null); }, [user]);
  const grant = user ? !user.is_admin : false;

  const confirm = async () => {
    if (!user) return;
    setBusy(true); setMsg(null);
    try {
      await adminAction({ action: 'set-admin', identityId: user.id, admin: grant });
      onClose();
      onDone(grant ? `${identityName(user)} ahora es admin.` : `${identityName(user)} ya no es admin.`);
    } catch (err) {
      setMsg({ ok: false, text: toAdminError(err).message });
    } finally { setBusy(false); }
  };

  return (
    <Modal
      open={!!user} onOpenChange={(o) => { if (!o) onClose(); }}
      title={grant ? 'Dar acceso de administrador' : 'Quitar acceso de administrador'}
      description={user && (grant
        ? <><span className="break-all text-[#EDEDED]">{identityName(user)}</span> podrá ver este panel, regalar, crear cupones y borrar cuentas. Como admin, su tráfico queda fuera de todas las cifras.</>
        : <><span className="break-all text-[#EDEDED]">{identityName(user)}</span> dejará de ver este panel y volverá a contar en las cifras (salvo que esté marcada como interna o en los emails del equipo).</>)}
      footer={(
        <>
          <FormMessage message={msg} />
          <Btn variant="ghost" onClick={onClose}>Cancelar</Btn>
          <Btn variant={grant ? 'primary' : 'danger'} busy={busy} onClick={() => void confirm()}>{grant ? 'Hacer admin' : 'Quitar admin'}</Btn>
        </>
      )}
    />
  );
}
