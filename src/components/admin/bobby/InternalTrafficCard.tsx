// What "internal" means right now: the team's emails, the accounts marked by hand, the networks an admin
// used and every install with its state. Everything here is left out of the dashboard's figures by default,
// so this is where the owner checks (and fixes) that the numbers are only outside people.
import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { Plus, X } from 'lucide-react';
import { adminAction, fetchAdminInternal, type AdminPostBody, type InstallRow, type InternalResponse } from '@/lib/admin-client';
import { Btn, Card, CardHead, Empty, ErrorState, Loading, Note, Segmented, StaleBanner, Switch, TableScroll, Tag, TextInput, td, tdWrap, th, tr } from './ui';
import { DASH, fmtDate, fmtDateTime, fmtInt, fmtRelative, label } from './format';
import { toAdminError, useLoad } from './useLoad';

type Notify = (text: string, ok?: boolean) => void;
type DeviceFilter = 'all' | 'internal' | 'outside';

// Same shape the server accepts (api/_lib/admin.ts), so a typo is caught before the round trip.
const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[a-z]{2,24}$/i;
const MAX_EMAILS = 50;
// bobby_admin_devices returns at most this many installs (newest first).
const DEVICE_LIMIT = 200;

const sameList = (a: string[], b: string[]) => a.length === b.length && a.every((v, i) => v === b[i]);
// Surface names as src/lib/track.ts sends them, shown as the page they stand for.
const SURFACE_ES: Record<string, string> = {
  home: '/ (inicio)', app: '/app', desk: '/desk', redeem: '/redeem', signin: '/signin', protocol: '/protocol', support: '/support',
  privacy: '/privacy', terms: '/terms', bobby: '/agentic-world/bobby', nucleo: '/nucleo', auth: '/auth/callback', other: 'otra página',
};
const surface = (s: string | null) => (s ? SURFACE_ES[s] ?? s : DASH);

export default function InternalTrafficCard({ refreshKey, notify, onChanged, onLoaded, meEmail }: {
  refreshKey: string | number; notify: Notify; onChanged: () => void;
  /** Lets the users table flag accounts that are internal by email (the users list does not say so itself). */
  onLoaded?: (r: InternalResponse) => void;
  meEmail?: string | null;
}) {
  const { data, error, loading, reload } = useLoad(fetchAdminInternal, `internal|${refreshKey}`);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => { if (data) onLoaded?.(data); }, [data, onLoaded]);

  /** One action at a time: every control is disabled while it runs; errors show the server's message. */
  const run = async (key: string, body: AdminPostBody, ok: string): Promise<boolean> => {
    setBusy(key);
    try {
      await adminAction(body);
      notify(ok);
      void reload(true);
      onChanged();
      return true;
    } catch (err) {
      notify(toAdminError(err).message, false);
      return false;
    } finally { setBusy(null); }
  };

  return (
    <Card>
      <CardHead
        title="Tráfico interno"
        count={data ? `${fmtInt(data.emails.length)} emails · ${fmtInt(data.marks.length)} cuentas · ${fmtInt(data.networks.length)} redes · ${fmtInt(data.devices.filter((d) => d.internal).length)} instalaciones` : undefined}
        sub="Todo lo de aquí queda fuera de las cifras del panel (salvo que arriba cambies a «Con equipo»). Revisa que solo estés tú y tu equipo: así cada número es gente de fuera."
      />
      {error && !data ? (
        <ErrorState message={error.message} onRetry={() => void reload()} />
      ) : !data ? (
        <Loading label="Cargando tráfico interno" />
      ) : (
        <div className={`flex flex-col gap-6 ${loading ? 'opacity-60 transition-opacity' : 'transition-opacity'}`}>
          {error && <StaleBanner error={error} onRetry={() => void reload()} />}
          <EmailsSection emails={data.emails} busy={busy} meEmail={meEmail ?? null}
            onSave={(emails) => run('emails', { action: 'set-internal-emails', emails }, emails.length ? `Lista del equipo guardada (${emails.length} ${emails.length === 1 ? 'email' : 'emails'}).` : 'Lista del equipo vaciada.')} />
          <MarksSection marks={data.marks} busy={busy}
            onRemove={(m) => void run(`mark:${m.identity_id}`, { action: 'set-internal', identityId: m.identity_id, internal: false }, `${markName(m)} vuelve a contar en las cifras.`)} />
          <NetworksSection networks={data.networks} busy={busy}
            onRemove={(n) => void run(`net:${n.network}`, { action: 'remove-internal-network', network: n.network }, 'Red quitada: su tráfico vuelve a contar (salvo lo que sea interno por otra razón).')} />
          <DevicesSection devices={data.devices} busy={busy}
            onToggle={(d, internal) => void run(`dev:${d.device}`, { action: 'set-device-internal', device: d.device, internal },
              internal ? `Instalación ${d.device} marcada como interna.` : `Instalación ${d.device} desmarcada.`)} />
        </div>
      )}
    </Card>
  );
}

function SectionHead({ title, count, children }: { title: string; count?: string; children?: ReactNode }) {
  return (
    <div className="mb-3 flex flex-col gap-1">
      <h4 className="m-0 flex items-baseline gap-2 text-[13px] font-normal text-[#EDEDED]">
        {title}
        {count && <span className="font-mono text-[10.5px] uppercase tracking-[0.06em] text-[#5C5C5C]">{count}</span>}
      </h4>
      {children && <p className="m-0 text-[12px] leading-snug text-[#8B8B8B]">{children}</p>}
    </div>
  );
}

// ---------------------------------------------------------------- a) team emails

function EmailsSection({ emails, busy, meEmail, onSave }: { emails: string[]; busy: string | null; meEmail: string | null; onSave: (emails: string[]) => Promise<boolean> }) {
  const [draft, setDraft] = useState<string[]>(emails);
  const [input, setInput] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  // A reload after saving (or from elsewhere) resets the draft to what the server has.
  useEffect(() => { setDraft(emails); }, [emails]);

  const dirty = !sameList(draft, emails);
  const saving = busy === 'emails';
  const me = meEmail?.trim().toLowerCase() || null;

  const add = (raw: string) => {
    // Several at once are fine: pasted lists split on commas, spaces or new lines.
    const parts = raw.split(/[\s,;]+/).map((e) => e.trim().toLowerCase()).filter(Boolean);
    if (!parts.length) return;
    const bad = parts.find((e) => !EMAIL.test(e));
    if (bad) { setMsg(`«${bad}» no parece un email.`); return; }
    const next = [...new Set([...draft, ...parts])];
    if (next.length > MAX_EMAILS) { setMsg(`Máximo ${MAX_EMAILS} emails.`); return; }
    setDraft(next); setInput(''); setMsg(null);
  };
  const submit = (e: FormEvent) => { e.preventDefault(); add(input); };

  return (
    <section>
      <SectionHead title="Emails del equipo" count={`${fmtInt(emails.length)} guardados`}>
        Sus cuentas, actuales o futuras, quedan fuera de todas las cifras (y las instalaciones ligadas a ellas también).
      </SectionHead>
      <div className="flex flex-wrap gap-1.5">
        {draft.length === 0 && <span className="font-mono text-[11px] uppercase tracking-[0.06em] text-[#5C5C5C]">Sin emails: solo los admins y lo marcado a mano quedan fuera</span>}
        {draft.map((e) => (
          <span key={e} className={`inline-flex items-center gap-1 rounded-md border py-0.5 pl-2 pr-0.5 font-mono text-[11.5px] ${emails.includes(e) ? 'border-white/[0.08] text-[#EDEDED]' : 'border-[#F28C38]/40 text-[#F7A04B]'}`}>
            <span className="max-w-[260px] truncate" title={emails.includes(e) ? e : `${e} (sin guardar)`}>{e}</span>
            <button
              type="button" disabled={saving} onClick={() => setDraft(draft.filter((x) => x !== e))}
              className="rounded p-0.5 text-[#5C5C5C] hover:bg-white/[0.06] hover:text-[#EDEDED] disabled:opacity-40" aria-label={`Quitar ${e}`} title={`Quitar ${e}`}
            >
              <X className="h-3 w-3" aria-hidden />
            </button>
          </span>
        ))}
      </div>
      <form onSubmit={submit} className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
        <TextInput
          mono value={input} onChange={(e) => { setInput(e.target.value); setMsg(null); }} disabled={saving}
          placeholder="email@ejemplo.com (puedes pegar varios)" aria-label="Agregar email del equipo" autoComplete="off" autoCapitalize="none" spellCheck={false}
          className="sm:max-w-[340px]"
        />
        <div className="flex flex-wrap gap-2">
          <Btn type="submit" size="md" disabled={saving || !input.trim()}><Plus className="h-3.5 w-3.5" aria-hidden />Agregar</Btn>
          {me && !draft.includes(me) && <Btn size="md" variant="ghost" disabled={saving} onClick={() => add(me)}>Agregar el mío</Btn>}
          {dirty && <Btn size="md" variant="ghost" disabled={saving} onClick={() => { setDraft(emails); setMsg(null); }}>Descartar</Btn>}
          <Btn size="md" variant="primary" busy={saving} disabled={!dirty || busy != null} onClick={() => void onSave(draft)}>Guardar lista</Btn>
        </div>
      </form>
      {msg && <p role="alert" className="m-0 mt-2 text-[12.5px] text-[#F06A6A]">{msg}</p>}
      {dirty && !msg && <p className="m-0 mt-2 font-mono text-[11px] uppercase tracking-[0.06em] text-[#F7A04B]">Cambios sin guardar</p>}
    </section>
  );
}

// ---------------------------------------------------------------- b) accounts marked by hand

type Mark = InternalResponse['marks'][number];
const markName = (m: Mark) => m.email ?? `${m.provider ? label(m.provider) : 'Cuenta'} · ${m.identity_id.slice(0, 8)}`;

function MarksSection({ marks, busy, onRemove }: { marks: Mark[]; busy: string | null; onRemove: (m: Mark) => void }) {
  return (
    <section>
      <SectionHead title="Cuentas marcadas como internas" count={`${fmtInt(marks.length)}`}>
        Se marcan con el interruptor «Interna» de la tabla de arriba (una cuenta de prueba de Apple, alguien del equipo).
      </SectionHead>
      {marks.length === 0 ? (
        <Empty>Ninguna cuenta marcada a mano</Empty>
      ) : (
        <ul className="m-0 flex list-none flex-col p-0">
          {marks.map((m) => (
            <li key={m.identity_id} className="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.05] py-2.5 last:border-b-0">
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="flex flex-wrap items-center gap-1.5">
                  <span className="max-w-[260px] truncate text-[13px]" title={m.email ?? m.identity_id}>{markName(m)}</span>
                  {!m.email && <span className="font-mono text-[10px] uppercase text-[#5C5C5C]">sin email</span>}
                  {m.provider && <Tag>{label(m.provider)}</Tag>}
                </span>
                <span className="font-mono text-[10.5px] text-[#5C5C5C]">
                  marcada {fmtDate(m.created_at)}{m.note ? ` · ${m.note}` : ''}
                </span>
              </div>
              <Btn size="sm" variant="ghost" busy={busy === `mark:${m.identity_id}`} disabled={busy != null} onClick={() => onRemove(m)}>
                <X className="h-3.5 w-3.5" aria-hidden />Quitar
              </Btn>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ---------------------------------------------------------------- c) team networks

type Network = InternalResponse['networks'][number];

function NetworksSection({ networks, busy, onRemove }: { networks: Network[]; busy: string | null; onRemove: (n: Network) => void }) {
  const now = Date.now();
  return (
    <section>
      <SectionHead title="Redes del equipo" count={`${fmtInt(networks.length)}`}>
        Se agregan solas cuando un admin abre /admin. Bobby no guarda IPs: solo un hash del rango de red (/24 o /48). Ojo: en datos móviles un mismo rango lo comparten muchas personas — si una red no es tuya, quítala.
      </SectionHead>
      {networks.length === 0 ? (
        <Empty>Sin redes registradas</Empty>
      ) : (
        <ul className="m-0 flex list-none flex-col p-0">
          {networks.map((n) => (
            <li key={n.network} className="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.05] py-2.5 last:border-b-0">
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-[12.5px] text-[#EDEDED]" title="Prefijo del hash del rango de red (no es la IP)">{n.network}…</span>
                  {n.note && <span className="text-[12px] text-[#8B8B8B]">{n.note}</span>}
                </span>
                <span className="font-mono text-[10.5px] text-[#5C5C5C]">
                  <span title={fmtDateTime(n.createdAt)}>desde {fmtDate(n.createdAt)}</span> · <span title={fmtDateTime(n.lastSeenAt)}>última vez {fmtRelative(n.lastSeenAt, now)}</span>
                </span>
              </div>
              <Btn size="sm" variant="ghost" busy={busy === `net:${n.network}`} disabled={busy != null} onClick={() => onRemove(n)}>
                <X className="h-3.5 w-3.5" aria-hidden />Quitar
              </Btn>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ---------------------------------------------------------------- d) installs

function DevicesSection({ devices, busy, onToggle }: { devices: InstallRow[]; busy: string | null; onToggle: (d: InstallRow, internal: boolean) => void }) {
  const [filter, setFilter] = useState<DeviceFilter>('all');
  const now = Date.now();
  const internalCount = devices.filter((d) => d.internal).length;
  const rows = useMemo(() => devices.filter((d) => (filter === 'all' ? true : filter === 'internal' ? d.internal : !d.internal)), [devices, filter]);

  return (
    <section>
      <SectionHead
        title="Instalaciones"
        count={`${fmtInt(devices.length)}${devices.length >= DEVICE_LIMIT ? ` (las ${DEVICE_LIMIT} más recientes)` : ''} · ${fmtInt(internalCount)} internas · ${fmtInt(devices.length - internalCount)} de fuera`}
      >
        Cada navegador o iPhone que abrió Bobby, de la más nueva a la más vieja. «Auto» = interna porque abrió /admin, está ligada a una cuenta del equipo o se vio desde una red del equipo; «Manual» = la marcaste tú.
      </SectionHead>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Segmented<DeviceFilter>
          label="Filtrar instalaciones" value={filter} onChange={setFilter}
          options={[{ value: 'all', label: 'Todas' }, { value: 'internal', label: 'Internas' }, { value: 'outside', label: 'De fuera' }]}
        />
      </div>
      <div className="mb-3">
        <Note tag="Pista">
          Para reconocer tus pruebas: instalaciones iOS cuya primera vez coincide con los días que instalaste un build de TestFlight, y las web que llegan «directo» justo a la hora en que estabas probando. Una ligada a una de tus cuentas ya sale sola. Si dudas, no la marques: marcar a alguien de fuera esconde a un usuario real.
        </Note>
      </div>
      {rows.length === 0 ? (
        <Empty>{devices.length === 0 ? 'Todavía no hay instalaciones' : 'Ninguna instalación con este filtro'}</Empty>
      ) : (
        <TableScroll minWidth={1180}>
          <thead>
            <tr>
              <th className={th}>Instalación</th>
              <th className={th} title="Observada: se registró al llegar. Reconstruida: armada después a partir de sus lecturas, antes de que se midiera la llegada.">Origen</th>
              <th className={th}>Primera vez</th>
              <th className={th}>Última vez</th>
              <th className={th}>País</th>
              <th className={th}>Llegó a</th>
              <th className={th}>Referencia · utm</th>
              <th className={`${th} text-right`}>Lecturas</th>
              <th className={`${th} text-right`} title="Lecturas del desk entregadas completas (se registran desde el deploy de esta versión)">Entregadas</th>
              <th className={th}>Cuenta</th>
              <th className={th}>Interna</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((d) => {
              const key = `dev:${d.device}`;
              const auto = d.internal && !d.manualInternal;
              return (
                <tr key={d.device} className={`${tr} ${d.internal ? 'bg-[#4FB3FF]/[0.04]' : ''}`}>
                  <td className={td}>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[12px] text-[#EDEDED]" title="Prefijo del id de la instalación">{d.device}</span>
                      <Tag tone={d.platform === 'ios' ? 'blue' : 'neutral'}>{label(d.platform)}</Tag>
                    </div>
                  </td>
                  <td className={td}>
                    <span className={`font-mono text-[10.5px] uppercase ${d.source === 'observed' ? 'text-[#8B8B8B]' : 'text-[#5C5C5C]'}`}>{d.source === 'observed' ? 'Observada' : 'Reconstruida'}</span>
                  </td>
                  <td className={`${td} font-mono text-[11.5px] text-[#8B8B8B]`} title={fmtDateTime(d.firstSeen)}>{fmtDate(d.firstSeen)}</td>
                  <td className={`${td} font-mono text-[11.5px] text-[#8B8B8B]`} title={fmtDateTime(d.lastSeen)}>{d.lastSeen ? fmtRelative(d.lastSeen, now) : DASH}</td>
                  <td className={`${td} font-mono text-[11.5px]`}>{d.country ?? <span className="text-[#5C5C5C]">{DASH}</span>}</td>
                  <td className={`${td} text-[12px] text-[#8B8B8B]`}>{surface(d.firstSurface)}</td>
                  <td className={`${tdWrap} max-w-[200px] font-mono text-[11px] leading-snug text-[#8B8B8B]`}>
                    {d.referrer || d.utm ? (
                      <span className="flex flex-col gap-0.5">
                        {d.referrer && <span className="truncate" title={d.referrer}>{d.referrer}</span>}
                        {d.utm && <span className="truncate text-[#F7A04B]" title={`utm_source=${d.utm}`}>utm: {d.utm}</span>}
                      </span>
                    ) : <span className="text-[#5C5C5C]" title="Sin referencia ni utm: entró directo, desde una app o desde iOS">directo</span>}
                  </td>
                  <td className={`${td} text-right font-mono text-[12px] tabular-nums`}>{fmtInt(d.reads)}</td>
                  <td className={`${td} text-right font-mono text-[12px] tabular-nums text-[#8B8B8B]`}>{fmtInt(d.delivered)}</td>
                  <td className={td}>
                    {d.account || d.accountId
                      ? <span className="block max-w-[180px] truncate text-[12px]" title={d.accountId ?? undefined}>{d.account ?? `${d.accountId?.slice(0, 8)} · sin email`}</span>
                      : <span className="font-mono text-[10.5px] uppercase text-[#5C5C5C]">invitado</span>}
                  </td>
                  <td className={td}>
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={d.manualInternal}
                        onChange={(next) => onToggle(d, next)}
                        disabled={busy != null}
                        label={busy === key ? 'Guardando…'
                          : d.manualInternal ? `Desmarcar la instalación ${d.device}${d.internal ? ' (seguirá interna si abrió /admin, es de una cuenta del equipo o de una red del equipo)' : ''}`
                          : auto ? `La instalación ${d.device} ya es interna automáticamente; marcarla la deja fuera aunque eso cambie`
                          : `Marcar la instalación ${d.device} como interna`}
                      />
                      {d.manualInternal ? <Tag tone="blue">Manual</Tag> : auto ? <Tag tone="blue" title="Abrió /admin, está ligada a una cuenta del equipo o se vio desde una red del equipo">Auto</Tag> : null}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </TableScroll>
      )}
    </section>
  );
}
