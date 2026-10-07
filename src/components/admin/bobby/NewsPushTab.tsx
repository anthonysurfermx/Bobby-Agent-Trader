import { useEffect, useMemo, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { RefreshCw } from 'lucide-react';
import { fetchAdminUsers, type AdminMe } from '@/lib/admin-client';
import { fetchNewsPreview, sendNewsCampaign, sendNewsTest, type NewsFilters, type NewsLanguage } from '@/lib/push-news-client';
import { Btn, Card, CardHead, Empty, ErrorState, Field, Loading, Note, Tag } from './ui';
import { fmtInt } from './format';
import { useLoad } from './useLoad';

const LANGUAGES: Array<{ id: NewsLanguage; label: string }> = [
  { id: 'de', label: 'Alemán' }, { id: 'fr', label: 'Francés' }, { id: 'it', label: 'Italiano' },
  { id: 'pt', label: 'Portugués' }, { id: 'pt-BR', label: 'Portugués de Brasil' }, { id: 'es', label: 'Español' },
];
const COUNTRIES = [['DE', 'Alemania'], ['FR', 'Francia'], ['IT', 'Italia'], ['PT', 'Portugal'], ['BR', 'Brasil'], ['ES', 'España']];
const inputClass = 'h-9 w-full rounded-lg border border-white/[0.08] bg-[#0F0F10] px-3 text-[13px] text-[#EDEDED] [color-scheme:dark]';
const testIds = new Map<string, string>();

function testIdentifier(identityId: string, fresh = false): string {
  const key = `bobby:news-push-test:${identityId}`;
  let previous = testIds.get(identityId);
  try {
    previous ??= sessionStorage.getItem(key) ?? undefined;
  } catch { /* Keep the in-memory identifier when browser storage is unavailable. */ }
  if (!fresh && previous) { testIds.set(identityId, previous); return previous; }
  const next = crypto.randomUUID(); testIds.set(identityId, next);
  try { sessionStorage.setItem(key, next); } catch { /* In-memory retries still use the same test. */ }
  return next;
}

export default function NewsPushTab({ me, refreshKey }: { me: AdminMe; refreshKey: number }) {
  const [languages, setLanguages] = useState<NewsLanguage[]>(LANGUAGES.map((l) => l.id));
  const [country, setCountry] = useState('');
  const [testAccount, setTestAccount] = useState(me.identityId);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const filters = useMemo<NewsFilters>(() => ({ languages, countries: country ? [country] : [] }), [languages, country]);
  const preview = useLoad((signal) => fetchNewsPreview(filters, signal), `news|${refreshKey}|${JSON.stringify(filters)}`, { intervalMs: 60_000 });
  const accounts = useLoad((signal) => fetchAdminUsers({ limit: 100, signal }), `news-accounts|${refreshKey}`);
  // A previous filter's count cannot authorize the next filter's send while it is loading.
  useEffect(() => { setConfirm(false); setMessage(null); setSendError(null); }, [filters]);
  const data = preview.data;
  const configured = !!data && data.config.enabled && data.config.apnsConfigured && data.config.tokenKeyConfigured;
  const ready = configured && !preview.loading && !preview.stale && !preview.error && languages.length > 0;
  const eligible = data?.eligible;
  const pending = data?.delivery.pending ?? 0;
  const canDispatch = ready && ((eligible ?? 0) > 0 || pending > 0);
  const deliver = async (kind: 'test' | 'campaign', fresh = false) => {
    setBusy(true); setMessage(null); setSendError(null); setConfirm(false);
    try {
      const result = kind === 'test' ? await sendNewsTest(testAccount, testIdentifier(testAccount, fresh)) : await sendNewsCampaign(filters);
      const sent = result.accepted;
      setMessage(typeof sent === 'number'
        ? `${fmtInt(sent)} ${sent === 1 ? 'notificación aceptada' : 'notificaciones aceptadas'} por Apple. La recepción se comprueba en el iPhone.`
        : 'Solicitud procesada. Actualiza el estado y comprueba la recepción en el iPhone.');
      if (result.blocker) setSendError('Apple Push ha detenido el envío por un problema de configuración. Los resultados anteriores quedan guardados.');
      await preview.reload(true);
    } catch (error) { setSendError(error instanceof Error ? error.message : 'No se pudo confirmar el envío.'); }
    finally { setBusy(false); }
  };
  return <div className="flex flex-col gap-4">
    <Card>
      <CardHead title="Bobby en tu idioma" sub="Aviso de los nuevos idiomas para iPhones que aceptaron recibir novedades."
        right={<Btn size="sm" busy={preview.loading} disabled={busy} onClick={() => void preview.reload(true)}><RefreshCw className="h-3.5 w-3.5" />Actualizar</Btn>} />
      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {[["iPhones registrados", data?.registeredDevices], ["Cuentas con permiso", data?.optInAccounts], ["Destinatarios de este aviso", eligible]].map(([label, value]) =>
          <div key={String(label)} className="rounded-xl bg-white/[0.03] px-4 py-3"><div className="text-[12px] text-[#8B8B8B]">{label}</div><div className="mt-1 font-mono text-xl">{typeof value === 'number' ? fmtInt(value) : '—'}</div></div>)}
      </div>
      {preview.error && <ErrorState message={preview.error.message} onRetry={() => void preview.reload(true)} />}
      {preview.loading && !data && <Loading label="Consultando los destinatarios" />}
      {data && !configured && <Note tone="orange" tag="Pendiente">Falta activar la conexión con Apple Push. Las preferencias pueden guardarse, pero el envío permanece desactivado.</Note>}
      {data && configured && eligible === 0 && <Note tag="Sin destinatarios">Los usuarios deben abrir una versión compatible de Bobby y activar «Novedades de Bobby» para recibir este aviso.</Note>}
    </Card>
    <Card>
      <CardHead title="Público y mensajes" sub="Cada iPhone recibe el texto en el idioma elegido en Bobby. El país es un filtro adicional." />
      <div className="mb-4 flex flex-wrap gap-x-5 gap-y-3">
        {LANGUAGES.map((language) => <label key={language.id} className="flex items-center gap-2 text-[13px]">
          <input type="checkbox" checked={languages.includes(language.id)} disabled={busy} className="accent-[#F28C38]"
            onChange={(event) => setLanguages((current) => event.target.checked ? [...current, language.id].sort() : current.filter((id) => id !== language.id))} />{language.label}
        </label>)}
      </div>
      <Field label="País" className="mb-4 max-w-sm" hint="Se detecta al guardar la preferencia. Sin filtro también incluye usuarios con permiso sin país registrado.">
        <select className={inputClass} value={country} onChange={(event) => setCountry(event.target.value)} disabled={busy}>
          <option value="">Todos los países</option>{COUNTRIES.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
        </select>
      </Field>
      {data ? <div className="grid gap-3 md:grid-cols-2">{LANGUAGES.filter((l) => languages.includes(l.id)).map((language) => {
        const copy = data.copy[language.id];
        return <article key={language.id} className="rounded-xl border border-white/[0.06] p-4">
          <div className="mb-2 flex justify-between gap-3"><span className="text-[12px] text-[#8B8B8B]">{language.label}</span><Tag>{data.byLanguage[language.id] ?? 0} iPhones</Tag></div>
          {copy ? <><p className="m-0 text-[14px] font-medium">{copy.title}</p><p className="m-0 mt-1 text-[13px] leading-relaxed text-[#BDBDBD]">{copy.body}</p></> : <p className="text-[#F7A04B]">Mensaje pendiente de consulta.</p>}
        </article>;
      })}</div> : <Empty>Los mensajes se muestran cuando el servidor responde.</Empty>}
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <Btn variant="primary" disabled={!canDispatch || busy} onClick={() => setConfirm(true)}>{pending > 0 && !eligible ? `Revisar ${fmtInt(pending)} envíos pendientes` : `Revisar envío a ${typeof eligible === 'number' ? fmtInt(eligible) : '—'} iPhones`}</Btn>
        <p className="m-0 text-[12px] text-[#8B8B8B]">Un aviso por instalación. Volver a ejecutar la campaña conserva los envíos anteriores.</p>
      </div>
    </Card>
    <Card>
      <CardHead title="Probar en un iPhone" sub="La prueba solo va a la cuenta elegida, con el mismo permiso y la misma versión compatible que la campaña." />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <Field label="Cuenta de prueba" className="sm:max-w-md sm:flex-1">
          <select className={inputClass} value={testAccount} disabled={busy || accounts.loading} onChange={(event) => { setTestAccount(event.target.value); setMessage(null); setSendError(null); }}>
            <option value={me.identityId}>{me.email ?? 'Mi cuenta de administrador'}</option>
            {accounts.data?.users.filter((user) => !user.wallet_only && user.id !== me.identityId).map((user) => <option key={user.id} value={user.id}>{user.email ?? `${user.provider ?? 'Cuenta'} · ${user.id.slice(0, 8)}`}</option>)}
          </select>
        </Field>
        <Btn busy={busy} disabled={!configured || !testAccount} onClick={() => void deliver('test')}>Enviar prueba</Btn>
        <Btn size="sm" disabled={!configured || busy || !message} onClick={() => void deliver('test', true)}>Nueva prueba</Btn>
      </div>
      {accounts.error && <p role="alert" className="text-[12px] text-[#F7A04B]">No se pudo consultar la lista de cuentas.</p>}
    </Card>
    {data && <Card><CardHead title="Resultado de la campaña" sub="Aceptada por Apple indica que Apple recibió la solicitud; la recepción y la apertura en el iPhone requieren su propia comprobación." />
      <div className="flex flex-wrap gap-x-6 gap-y-2 text-[13px] text-[#BDBDBD]">
        {[["Aceptadas por Apple", 'sent'], ["Resultado sin confirmar", 'unknown'], ["Pendientes", 'pending'], ["En curso", 'sending'], ["Fallidas", 'failed'], ["Canceladas", 'cancelled'], ["Caducadas", 'expired']].map(([label, key]) => <span key={key}>{label}: <span className="font-mono text-[#EDEDED]">{typeof data.delivery[key] === 'number' ? fmtInt(data.delivery[key]) : '—'}</span></span>)}
      </div>
    </Card>}
    {message && <Note tag="Resultado"><span role="status">{message}</span></Note>}
    {sendError && <Note tone="red"><span role="alert">{sendError}</span></Note>}
    <Dialog.Root open={confirm} onOpenChange={setConfirm}><Dialog.Portal>
      <Dialog.Overlay className="fixed inset-0 z-50 bg-black/70" />
      <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-white/[0.08] bg-[#141415] p-6 text-[#EDEDED]">
        <Dialog.Title className="m-0 text-base">Enviar el aviso de idiomas</Dialog.Title>
        <Dialog.Description className="mt-3 text-[13px] leading-relaxed text-[#8B8B8B]">Se enviará a {typeof eligible === 'number' ? fmtInt(eligible) : '—'} iPhones con permiso para novedades{country ? ` en ${COUNTRIES.find(([id]) => id === country)?.[1]}` : ''}. Cada uno recibirá el mensaje de su idioma. Se comprobará el permiso otra vez antes de enviar y se cancelarán los pendientes sin permiso. Este envío llega a usuarios reales.</Dialog.Description>
        <div className="mt-5 flex justify-end gap-3"><Dialog.Close asChild><Btn>Volver</Btn></Dialog.Close><Btn variant="primary" busy={busy} disabled={!canDispatch} onClick={() => void deliver('campaign')}>Enviar aviso</Btn></div>
      </Dialog.Content>
    </Dialog.Portal></Dialog.Root>
  </div>;
}
