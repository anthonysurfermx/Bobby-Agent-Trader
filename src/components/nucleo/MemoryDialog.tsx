// What Bobby remembers: the assets you asked about (how many times, when last, the price that read used), what
// Bobby answered each time, the name you asked to be called and the preferences you set yourself, to see,
// correct or delete. Nothing here is inferred; every value comes from /api/memory.
// Only an Apple/Google account has memory: signed out, the dialog explains that and offers the sign-in.
// Every load is tied to the account it was made for: switching accounts clears the view first, and a reply
// that arrives for a previous account is dropped.
import { useEffect, useRef, useState } from 'react';
import { useBobbyAccount } from '@/hooks/useBobbyAccount';
import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { isPortuguese, isSpanish, t } from '@/lib/companions/i18n';
import { sfxTock } from '@/lib/companions/sfx';
import {
  fetchMemory, forgetAllMemory, forgetAsset, patchMemory,
  type MemoryPrefs, type MemoryResult, type MemoryState,
} from '@/lib/memory-client';

interface Props { open: boolean; onOpenChange: (open: boolean) => void; onSignIn: () => void; onState?: (state: MemoryState | null) => void }

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
function when(iso: string): string {
  try { return new Intl.DateTimeFormat(isSpanish() ? 'es-MX' : isPortuguese() ? 'pt-BR' : 'en-US', { day: 'numeric', month: 'short' }).format(new Date(iso)); } catch { return iso.slice(0, 10); }
}
const money = (n: number) => `$${n.toLocaleString('en-US', { maximumFractionDigits: n >= 100 ? 2 : n >= 1 ? 4 : 8 })}`;
const verdictWord = (v: 'wait' | 'review') => (v === 'wait' ? t('Wait', 'Esperar', 'Esperar') : t('Review', 'Revisar', 'Revisar'));
const times = (n: number) => (n === 1 ? t('1 time', '1 vez', '1 vez') : t(`${n} times`, `${n} veces`, `${n} vezes`));

export default function MemoryDialog({ open, onOpenChange, onSignIn, onState }: Props) {
  const { account } = useBobbyAccount();
  const accountId = account?.id ?? null;
  const [state, setState] = useState<MemoryState | null>(null);
  const [signedOut, setSignedOut] = useState(false);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  // Each request carries the generation it was made in; a reply from an older one (another account, a closed
  // dialog) is dropped.
  const generation = useRef(0);

  const apply = (r: MemoryResult, gen: number) => {
    if (gen !== generation.current) return;
    if ('state' in r) { setState(r.state); setNameDraft(r.state.preferredName ?? ''); setSignedOut(false); setFailed(false); onState?.(r.state); }
    else if (r.signedOut) { setSignedOut(true); setState(null); onState?.(null); }
    else setFailed(true);
  };
  const run = async (task: () => Promise<MemoryResult>) => {
    if (busy) return;
    const gen = generation.current;
    setBusy(true);
    try { apply(await task(), gen); } finally { setBusy(false); }
  };

  useEffect(() => {
    // A new account (or a reopened dialog) starts from nothing, never from what the last one showed.
    const gen = ++generation.current;
    setState(null); setSignedOut(false); setFailed(false); setNameDraft('');
    if (!open) return;
    void fetchMemory().then((r) => apply(r, gen));
  }, [open, accountId]);

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
              <button type="button" className="n-mem-btn mt-4" onClick={() => { setFailed(false); setState(null); void run(fetchMemory); }}>{t('Try again', 'Reintentar', 'Tentar de novo')}</button>
            </>
          ) : (
            <>
              <p className="n-dlg-copy">{t(`The assets you ask about, what Bobby answered, the name you asked for and what you choose here. A daily cleanup erases anything older than ${state.retentionDays} days.`, `Los activos que preguntas, lo que Bobby te respondió, el nombre que pediste y lo que eliges aquí. Una limpieza diaria borra lo que tenga más de ${state.retentionDays} días.`, `Os ativos que você pergunta, o que o Bobby respondeu, o nome que você pediu e o que você escolhe aqui. Uma limpeza diária apaga o que tiver mais de ${state.retentionDays} dias.`)}</p>

              <div className="n-mem-toggle">
                <span id="n-mem-switch-label">{t('Remember my assets', 'Recordar mis activos', 'Lembrar meus ativos')}</span>
                <button type="button" role="switch" aria-checked={state.enabled} aria-labelledby="n-mem-switch-label" disabled={busy} className={`n-mem-switch ${state.enabled ? 'on' : ''}`}
                  onClick={() => { sfxTock(); void run(() => patchMemory({ memoryEnabled: !state.enabled })); }}>
                  <i />
                </button>
              </div>
              {!state.enabled && <p className="n-mem-note">{t('Paused: Bobby saves nothing new from your questions and does not personalize answers. What you change here is still saved.', 'En pausa: Bobby no guarda nada nuevo de tus preguntas ni personaliza respuestas. Lo que cambies aquí sí se guarda.', 'Em pausa: o Bobby não salva nada novo das suas perguntas nem personaliza respostas. O que você mudar aqui continua salvo.')}</p>}

              <div className="n-mem-pref">
                <label className="n-label" htmlFor="n-mem-name">{t('What Bobby calls you', 'Cómo te llama Bobby', 'Como o Bobby te chama')}</label>
                <form className="n-mem-name" onSubmit={(e) => { e.preventDefault(); const v = nameDraft.trim(); if (v === (state.preferredName ?? '')) return; sfxTock(); void run(() => patchMemory({ preferredName: v ? v : null })); }}>
                  <input id="n-mem-name" value={nameDraft} maxLength={40} autoComplete="given-name" disabled={busy}
                    placeholder={t('Your Apple/Google first name', 'Tu nombre de Apple/Google', 'Seu nome da Apple/Google')} onChange={(e) => setNameDraft(e.target.value)} />
                  <button type="submit" className="n-mem-btn" disabled={busy || nameDraft.trim() === (state.preferredName ?? '')}>{t('Save', 'Guardar', 'Salvar')}</button>
                </form>
              </div>

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
                        <small>{times(a.asks)} · {ago(a.lastAskedAt)}{a.lastPrice !== null && a.lastPriceAt ? ` · ${money(a.lastPrice)} (${when(a.lastPriceAt)})` : ''}</small>
                      </span>
                      <button type="button" className="n-mem-btn" disabled={busy} onClick={() => { sfxTock(); void run(() => forgetAsset(a.symbol)); }}>{t('Forget', 'Olvidar', 'Esquecer')}</button>
                    </li>
                  ))}
                </ul>
              )}
              <div className="n-label mt-6">{t('What Bobby answered', 'Lo que Bobby te respondió', 'O que o Bobby respondeu')} · {state.reads.length}</div>
              {state.reads.length === 0 ? (
                <p className="n-mem-note">{t('Each answer Bobby gives you is kept here as you saw it: the verdict and its four lines.', 'Cada respuesta que Bobby te da se guarda aquí tal como la viste: el veredicto y sus cuatro líneas.', 'Cada resposta que o Bobby te dá fica aqui como você viu: o veredito e suas quatro linhas.')}</p>
              ) : (
                <ul className="n-mem-reads">
                  {state.reads.map((r) => (
                    <li key={`${r.symbol}-${r.deliveredAt}`}>
                      <details>
                        <summary><b>{r.symbol} · {verdictWord(r.verdict)}</b><small>{when(r.deliveredAt)}{r.price !== null && r.priceAt ? ` · ${money(r.price)}` : ''}</small><span>{r.headline}</span></summary>
                        <dl>
                          <dt>{t('Why', 'Por qué', 'Por quê')}</dt><dd>{r.why}</dd>
                          <dt>{t('The risk', 'El riesgo', 'O risco')}</dt><dd>{r.risk}</dd>
                          <dt>{t('Watch', 'Qué vigilar', 'O que vigiar')}</dt><dd>{r.watch}</dd>
                        </dl>
                      </details>
                    </li>
                  ))}
                </ul>
              )}
              <button type="button" className="n-mem-btn danger mt-5" disabled={busy}
                onClick={() => { if (window.confirm(t('Erase every remembered asset, every answer Bobby kept, your name and your preferences?', '¿Borrar todos los activos recordados, las respuestas guardadas, tu nombre y tus preferencias?', 'Apagar todos os ativos lembrados, as respostas guardadas, seu nome e suas preferências?'))) void run(forgetAllMemory); }}>
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
