// What Bobby remembers: the assets you asked about (how many times, when last) and the preferences you set
// yourself, to see, correct or delete. Nothing here is inferred; every value comes from /api/memory.
// Only an Apple/Google account has memory: signed out, the dialog explains that and offers the sign-in.
import { useEffect, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { isPortuguese, isSpanish, t } from '@/lib/companions/i18n';
import { sfxTock } from '@/lib/companions/sfx';
import {
  fetchMemory, forgetAllMemory, forgetAsset, patchMemory,
  type MemoryPrefs, type MemoryResult, type MemoryState,
} from '@/lib/memory-client';

interface Props { open: boolean; onOpenChange: (open: boolean) => void; onSignIn: () => void }

type Field = keyof MemoryPrefs;
const OPTIONS: Record<Field, Array<[string, () => string]>> = {
  horizon: [['intraday', () => t('Today', 'Hoy', 'Hoje')], ['week', () => t('Weeks', 'Semanas', 'Semanas')], ['month', () => t('Months', 'Meses', 'Meses')], ['long', () => t('Long', 'Largo', 'Longo')]],
  experience: [['new', () => t('Starting', 'Empezando', 'Começando')], ['some', () => t('Some', 'Algo', 'Alguma')], ['experienced', () => t('Experienced', 'Con experiencia', 'Experiente')]],
  risk: [['low', () => t('Low', 'Bajo', 'Baixo')], ['medium', () => t('Medium', 'Medio', 'Médio')], ['high', () => t('High', 'Alto', 'Alto')]],
};
const FIELD_LABEL: Record<Field, () => string> = {
  horizon: () => t('Horizon', 'Horizonte', 'Horizonte'),
  experience: () => t('Experience', 'Experiencia', 'Experiência'),
  risk: () => t('Risk you prefer explained', 'Riesgo que prefieres ver explicado', 'Risco que você prefere ver explicado'),
};

function ago(iso: string): string {
  const days = Math.floor((Date.now() - Date.parse(iso)) / 86_400_000);
  if (!Number.isFinite(days) || days <= 0) return t('today', 'hoy', 'hoje');
  try {
    return new Intl.RelativeTimeFormat(isSpanish() ? 'es' : isPortuguese() ? 'pt-BR' : 'en', { numeric: 'auto' }).format(-days, 'day');
  } catch { return t(`${days} days ago`, `hace ${days} días`, `há ${days} dias`); }
}
const times = (n: number) => (n === 1 ? t('1 time', '1 vez', '1 vez') : t(`${n} times`, `${n} veces`, `${n} vezes`));

export default function MemoryDialog({ open, onOpenChange, onSignIn }: Props) {
  const [state, setState] = useState<MemoryState | null>(null);
  const [signedOut, setSignedOut] = useState(false);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);

  const apply = (r: MemoryResult) => {
    if ('state' in r) { setState(r.state); setSignedOut(false); setFailed(false); }
    else if (r.signedOut) { setSignedOut(true); setState(null); }
    else setFailed(true);
  };
  const run = async (task: () => Promise<MemoryResult>) => {
    if (busy) return;
    setBusy(true);
    try { apply(await task()); } finally { setBusy(false); }
  };

  useEffect(() => {
    if (!open) return;
    setFailed(false);
    let live = true;
    void fetchMemory().then((r) => { if (live) apply(r); });
    return () => { live = false; };
  }, [open]);

  const setPref = (field: Field, value: string | null) => { sfxTock(); void run(() => patchMemory({ [field]: value } as Partial<MemoryPrefs>)); };
  const loading = open && !state && !signedOut && !failed;

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="n-dlg-overlay" />
        <Dialog.Content className="n-dlg" aria-describedby={undefined}>
          <Dialog.Close className="n-dlg-x" aria-label={t('Close', 'Cerrar', 'Fechar')}><X size={15} /></Dialog.Close>
          <div className="n-label">{t('Memory', 'Memoria', 'Memória')}</div>
          <Dialog.Title className="n-dlg-title">{t('What Bobby remembers', 'Lo que Bobby recuerda', 'O que o Bobby lembra')}</Dialog.Title>

          {signedOut ? (
            <>
              <p className="n-dlg-copy">{t('Sign in with Apple or Google so Bobby remembers your assets and preferences.', 'Inicia sesión con Apple o Google para que Bobby recuerde tus activos y preferencias.', 'Entre com Apple ou Google para o Bobby lembrar seus ativos e preferências.')}</p>
              <button type="button" className="n-cta on mt-6" onClick={onSignIn}>{t('Continue with Apple or Google', 'Continuar con Apple o Google', 'Continuar com Apple ou Google')}</button>
            </>
          ) : loading ? (
            <p className="n-dlg-copy" aria-busy="true">{t('Loading…', 'Cargando…', 'Carregando…')}</p>
          ) : !state ? (
            <>
              <p className="n-dlg-copy" role="alert">{t('Memory is unavailable right now.', 'La memoria no está disponible por ahora.', 'A memória não está disponível agora.')}</p>
              <button type="button" className="n-mem-btn mt-4" onClick={() => { setFailed(false); void run(fetchMemory); }}>{t('Try again', 'Reintentar', 'Tentar de novo')}</button>
            </>
          ) : (
            <>
              <p className="n-dlg-copy">{t(`Only the assets you ask about and what you choose here. Anything untouched for ${state.retentionDays} days is erased.`, `Solo los activos que preguntas y lo que eliges aquí. Lo que no uses en ${state.retentionDays} días se borra.`, `Só os ativos que você pergunta e o que você escolhe aqui. O que ficar ${state.retentionDays} dias sem uso é apagado.`)}</p>

              <div className="n-mem-toggle">
                <span id="n-mem-switch-label">{t('Remember my assets', 'Recordar mis activos', 'Lembrar meus ativos')}</span>
                <button type="button" role="switch" aria-checked={state.enabled} aria-labelledby="n-mem-switch-label" disabled={busy} className={`n-mem-switch ${state.enabled ? 'on' : ''}`}
                  onClick={() => { sfxTock(); void run(() => patchMemory({ memoryEnabled: !state.enabled })); }}>
                  <i />
                </button>
              </div>
              {!state.enabled && <p className="n-mem-note">{t('Paused: Bobby saves nothing new and does not personalize answers.', 'En pausa: Bobby no guarda nada nuevo ni personaliza respuestas.', 'Em pausa: o Bobby não salva nada novo nem personaliza respostas.')}</p>}

              {(Object.keys(OPTIONS) as Field[]).map((field) => (
                <div key={field} className="n-mem-pref">
                  <div className="n-label">{FIELD_LABEL[field]()}</div>
                  <div className="n-mem-seg" role="group" aria-label={FIELD_LABEL[field]()}>
                    {[[null, () => t('Not set', 'Sin definir', 'Sem definir')] as const, ...OPTIONS[field]].map(([value, label]) => (
                      <button key={value ?? 'none'} type="button" disabled={busy} aria-pressed={state.prefs[field] === value}
                        onClick={() => { if (state.prefs[field] !== value) setPref(field, value); }}>{label()}</button>
                    ))}
                  </div>
                </div>
              ))}

              <div className="n-label mt-6">{t('Assets', 'Activos', 'Ativos')} · {state.assets.length}</div>
              {state.assets.length === 0 ? (
                <p className="n-mem-note">{t('Nothing yet. Each asset you ask about shows up here.', 'Todavía nada. Cada activo que preguntes aparece aquí.', 'Nada ainda. Cada ativo que você perguntar aparece aqui.')}</p>
              ) : (
                <ul className="n-mem-list">
                  {state.assets.map((a) => (
                    <li key={a.symbol}>
                      <span className="min-w-0 flex-1">
                        <b>{a.symbol}</b>
                        <small>{times(a.asks)} · {ago(a.lastAskedAt)}</small>
                      </span>
                      <button type="button" className="n-mem-btn" disabled={busy} onClick={() => { sfxTock(); void run(() => forgetAsset(a.symbol)); }}>{t('Forget', 'Olvidar', 'Esquecer')}</button>
                    </li>
                  ))}
                </ul>
              )}
              <button type="button" className="n-mem-btn danger mt-5" disabled={busy}
                onClick={() => { if (window.confirm(t('Erase every remembered asset and your preferences?', '¿Borrar todos los activos recordados y tus preferencias?', 'Apagar todos os ativos lembrados e suas preferências?'))) void run(forgetAllMemory); }}>
                {t('Erase all', 'Borrar todo', 'Apagar tudo')}
              </button>
              {failed && <p role="alert" className="n-mem-note" style={{ color: '#FFB3B5' }}>{t('That did not save. Try again.', 'No se guardó. Inténtalo de nuevo.', 'Não foi salvo. Tente de novo.')}</p>}
            </>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
