import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ChevronLeft, ChevronRight, Gift, Search, Trash2 } from 'lucide-react';
import { adminAction, fetchAdminUsers, type AdminMe, type AdminUser } from '@/lib/admin-client';
import { Btn, Card, CardHead, Empty, ErrorState, Field, FormMessage, Loading, Modal, Note, Switch, TableScroll, TextInput, td, tdWrap, th, tr } from './ui';
import { GiftCell, Identity, Lifecycle, PlanCell, ProviderCell } from './cells';
import { fmtDate, fmtDateTime, fmtInt, fmtMinutes, fmtRelative, lastActivity } from './format';
import { toAdminError, useLoad } from './useLoad';

const PAGE = 50;

type Notify = (text: string, ok?: boolean) => void;

export default function UsersTab({ me, refreshKey, notify, onChanged, focusSearch, onSearchFocused }: {
  me: AdminMe; refreshKey: number; notify: Notify; onChanged: () => void; focusSearch: boolean; onSearchFocused: () => void;
}) {
  const [input, setInput] = useState('');
  const [q, setQ] = useState('');
  const [offset, setOffset] = useState(0);
  const [grantFor, setGrantFor] = useState<AdminUser | null>(null);
  const [deleteFor, setDeleteFor] = useState<AdminUser | null>(null);
  const [adminFor, setAdminFor] = useState<AdminUser | null>(null);
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

  const { data, error, loading, reload } = useLoad(() => fetchAdminUsers({ q, limit: PAGE, offset }), `${q}|${offset}|${refreshKey}`);
  const now = Date.now();

  const submit = (e: FormEvent) => { e.preventDefault(); setQ(input.trim()); setOffset(0); };
  const done = (text: string) => { notify(text); void reload(true); onChanged(); };

  const total = data?.total ?? 0;
  const from = total ? offset + 1 : 0;
  const to = Math.min(offset + PAGE, total);

  return (
    <Card>
      <CardHead
        title="Usuarios"
        count={data ? `${fmtInt(total)} ${q ? 'resultados' : 'cuentas'}` : undefined}
        right={(
          <form onSubmit={submit} className="w-full sm:w-[300px]" role="search">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#5C5C5C]" aria-hidden />
              <TextInput
                ref={searchRef} value={input} onChange={(e) => setInput(e.target.value)}
                placeholder="Buscar por email o id" aria-label="Buscar por email o id" className="pl-8 pr-9" type="search"
              />
              <kbd className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 rounded border border-white/[0.08] px-1.5 font-mono text-[10px] text-[#5C5C5C]">/</kbd>
            </div>
          </form>
        )}
        className="flex-col sm:flex-row [&>div:last-child]:w-full sm:[&>div:last-child]:w-auto"
      />
      {error && !data ? (
        <ErrorState message={error.message} onRetry={() => void reload()} />
      ) : !data ? (
        <Loading label="Cargando cuentas" />
      ) : (
        <>
          {error && <div className="mb-3"><Note tone="red">{error.message}</Note></div>}
          {data.users.length === 0 ? (
            <Empty>{q ? `Nada coincide con “${q}”` : 'Todavía no hay cuentas'}</Empty>
          ) : (
            <div className={loading ? 'opacity-60 transition-opacity' : 'transition-opacity'}>
              <TableScroll minWidth={980}>
                <thead>
                  <tr>
                    <th className={th}>Cuenta</th>
                    <th className={th}>Proveedor</th>
                    <th className={th}>Creada · activación</th>
                    <th className={`${th} text-right`}>Lecturas</th>
                    <th className={th}>Última actividad</th>
                    <th className={th}>Plan</th>
                    <th className={th}>Regalo</th>
                    <th className={th}>Admin</th>
                    <th className={`${th} text-right`}>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {data.users.map((u) => {
                    const self = u.id === me.identityId;
                    const last = lastActivity(u);
                    return (
                      <tr key={u.id} className={tr}>
                        <td className={td}><Identity u={u} self={self} /></td>
                        <td className={td}><ProviderCell u={u} /></td>
                        <td className={td}>
                          <div className="flex flex-col gap-1 font-mono">
                            <span className="text-[12px] text-[#EDEDED]" title={fmtDateTime(u.created_at)}>{fmtDate(u.created_at)}</span>
                            <span className="text-[10.5px] uppercase text-[#5C5C5C]" title={u.first_read_at ? `Primera lectura ${fmtDateTime(u.first_read_at)}` : undefined}>
                              {u.first_read_at ? <>1.ª lect {fmtDate(u.first_read_at)} · <span className="text-[#8B8B8B]">{fmtMinutes(u.activation_minutes)}</span></> : 'sin lecturas'}
                            </span>
                          </div>
                        </td>
                        <td className={`${td} text-right font-mono text-[12.5px] tabular-nums`}>{fmtInt(u.reads ?? 0)}</td>
                        <td className={td}>
                          <div className="flex flex-col gap-1.5">
                            <span className="font-mono text-[11.5px] text-[#8B8B8B]" title={fmtDateTime(last)}>{fmtRelative(last, now)}</span>
                            <Lifecycle u={u} now={now} />
                          </div>
                        </td>
                        <td className={td}><PlanCell u={u} /></td>
                        <td className={`${tdWrap} w-[120px] min-w-[96px] leading-snug`}><GiftCell u={u} /></td>
                        <td className={td}>
                          <Switch
                            checked={u.is_admin}
                            onChange={() => setAdminFor(u)}
                            label={self ? 'No puedes quitarte el acceso a ti mismo' : u.is_admin ? `Quitar admin a ${u.email ?? u.id}` : `Hacer admin a ${u.email ?? u.id}`}
                            disabled={self}
                          />
                        </td>
                        <td className={td}>
                          <div className="flex items-center justify-end gap-1">
                            <Btn size="sm" variant="ghost" onClick={() => setGrantFor(u)}><Gift className="h-3.5 w-3.5" aria-hidden />Regalar</Btn>
                            <Btn
                              size="sm" variant="danger" onClick={() => setDeleteFor(u)} disabled={self}
                              title={self ? 'No puedes borrar tu propia cuenta' : `Borrar ${u.email ?? u.id}`}
                              aria-label={self ? 'No puedes borrar tu propia cuenta' : `Borrar ${u.email ?? u.id}`}
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
              <span className="font-mono text-[11px] uppercase tracking-[0.06em] text-[#5C5C5C]">{fmtInt(from)}–{fmtInt(to)} de {fmtInt(total)}</span>
              <div className="flex gap-1">
                <Btn size="sm" variant="secondary" onClick={() => setOffset(Math.max(0, offset - PAGE))} disabled={offset === 0 || loading}><ChevronLeft className="h-3.5 w-3.5" aria-hidden />Anterior</Btn>
                <Btn size="sm" variant="secondary" onClick={() => setOffset(offset + PAGE)} disabled={to >= total || loading}>Siguiente<ChevronRight className="h-3.5 w-3.5" aria-hidden /></Btn>
              </div>
            </div>
          )}
        </>
      )}

      <GrantDialog user={grantFor} onClose={() => setGrantFor(null)} onDone={done} />
      <DeleteDialog user={deleteFor} onClose={() => setDeleteFor(null)} onDone={done} />
      <AdminDialog user={adminFor} onClose={() => setAdminFor(null)} onDone={done} />
    </Card>
  );
}

const who = (u: AdminUser) => u.email ?? u.id;
const intOrZero = (v: string) => { const n = Number(v); return Number.isFinite(n) ? Math.floor(n) : NaN; };
const digits = (v: string) => v.replace(/\D/g, '').slice(0, 4);

function GrantDialog({ user, onClose, onDone }: { user: AdminUser | null; onClose: () => void; onDone: (text: string) => void }) {
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
    if (!user || invalid || empty) return;
    setBusy(true); setMsg(null);
    try {
      const body: { action: 'grant'; identityId: string; reads?: number; profundo?: number; maximo?: number; proDays?: number } = { action: 'grant', identityId: user.id };
      if (values.reads) body.reads = values.reads;
      if (values.profundo) body.profundo = values.profundo;
      if (values.maximo) body.maximo = values.maximo;
      if (values.proDays) body.proDays = values.proDays;
      await adminAction(body);
      onClose();
      onDone(`Regalo enviado a ${who(user)}.`);
    } catch (err) {
      setMsg({ ok: false, text: toAdminError(err).message });
    } finally { setBusy(false); }
  };

  return (
    <Modal
      open={!!user} onOpenChange={(o) => { if (!o) onClose(); }}
      title="Regalar a esta cuenta"
      description={user && <>Se suma a lo que ya tiene <span className="text-[#EDEDED]">{who(user)}</span>. Las lecturas regaladas se usan cuando se acaban las gratis; los días Pro se suman a su membresía.</>}
    >
      <form onSubmit={submit} className="grid grid-cols-2 gap-3">
        <Field label="Lecturas" hint="0–1000"><TextInput mono inputMode="numeric" value={reads} onChange={(e) => setReads(digits(e.target.value))} placeholder="0" /></Field>
        <Field label="Profundo" hint="0–200"><TextInput mono inputMode="numeric" value={profundo} onChange={(e) => setProfundo(digits(e.target.value))} placeholder="0" /></Field>
        <Field label="Máximo" hint="0–100"><TextInput mono inputMode="numeric" value={maximo} onChange={(e) => setMaximo(digits(e.target.value))} placeholder="0" /></Field>
        <Field label="Días de Bobby Pro" hint="0–366"><TextInput mono inputMode="numeric" value={proDays} onChange={(e) => setProDays(digits(e.target.value))} placeholder="0" /></Field>
        <div className="col-span-2 flex flex-col gap-3">
          {invalid && <FormMessage message={{ ok: false, text: `Revisa el valor de ${{ reads: 'lecturas', profundo: 'Profundo', maximo: 'Máximo', proDays: 'días Pro' }[invalid]}.` }} />}
          <FormMessage message={msg} />
          <div className="flex justify-end gap-2">
            <Btn variant="ghost" onClick={onClose}>Cancelar</Btn>
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
      onDone(`Cuenta ${expected} borrada.`);
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
        <Field label={user?.email ? 'Escribe el email de la cuenta para confirmar' : 'Escribe el id de la cuenta para confirmar'}>
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
      onDone(grant ? `${who(user)} ahora es admin.` : `${who(user)} ya no es admin.`);
    } catch (err) {
      setMsg({ ok: false, text: toAdminError(err).message });
    } finally { setBusy(false); }
  };

  return (
    <Modal
      open={!!user} onOpenChange={(o) => { if (!o) onClose(); }}
      title={grant ? 'Dar acceso de administrador' : 'Quitar acceso de administrador'}
      description={user && (grant
        ? <><span className="break-all text-[#EDEDED]">{who(user)}</span> podrá ver este panel, regalar, crear cupones y borrar cuentas.</>
        : <><span className="break-all text-[#EDEDED]">{who(user)}</span> dejará de ver este panel.</>)}
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
