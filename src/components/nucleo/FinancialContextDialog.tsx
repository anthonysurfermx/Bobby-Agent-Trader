import { useCallback, useEffect, useRef, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Check, Copy, Download, FileInput, Pause, Play, RefreshCw, Trash2, X } from 'lucide-react';
import { t, speechLocale } from '@/lib/companions/i18n';
import { CHATGPT_EXPORT_PROMPT, FINANCIAL_CATEGORIES, FinancialItemSchema, type FinancialItem } from '../../../shared/financial-context';
import {
  deleteFinancialContext, exportRecommendations, fetchChatGPTConnection, fetchFinancialContext,
  FinancialContextError, importFinancialContext, parseFinancialImport, revokeChatGPTConnection,
  setFinancialContextEnabled, updateFinancialItem, useFinancialAccount,
  type ChatGPTConnection, type FinancialContextState,
} from '@/lib/financial-context-client';

const button = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-white/15 px-4 py-2 text-sm text-[#F2EDE4] hover:bg-white/5 disabled:opacity-40 disabled:cursor-not-allowed';
const primary = `${button} bg-[#F2EDE4] !text-[#0B0A09] hover:!bg-white`;
const field = 'w-full min-h-11 rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-sm text-[#F2EDE4] focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-300';
const card = 'rounded-2xl border border-white/10 bg-white/[0.025] p-4 sm:p-5';

function categoryLabel(category: FinancialItem['category']): string {
  const names: Record<FinancialItem['category'], string> = {
    goal: t('Goal', 'Objetivo', 'Objetivo', 'Objectif', 'Obiettivo', 'Ziel'),
    income: t('Income', 'Ingreso', 'Rendimento', 'Revenu', 'Reddito', 'Einkommen'),
    expense: t('Expense', 'Gasto', 'Despesa', 'Dépense', 'Spesa', 'Ausgabe'),
    debt: t('Debt', 'Deuda', 'Dívida', 'Dette', 'Debito', 'Schulden'),
    asset: t('Asset', 'Activo', 'Ativo', 'Actif', 'Attività', 'Vermögenswert'),
    preference: t('Preference', 'Preferencia', 'Preferência', 'Préférence', 'Preferenza', 'Präferenz'),
    transaction: t('Reported transaction', 'Transacción declarada', 'Transação declarada', 'Transaction déclarée', 'Transazione dichiarata', 'Gemeldete Transaktion'),
  };
  return names[category];
}
// The shared page uses the same translated failure messages as the dialog.
// eslint-disable-next-line react-refresh/only-export-components
export function financialContextErrorMessage(error: unknown): string {
  const code = error instanceof FinancialContextError ? error.code : 'context_unavailable';
  if (code === 'signin_required') return t('Sign in again with your Bobby account.', 'Vuelve a iniciar sesión con tu cuenta de Bobby.', 'Inicia sessão novamente com a tua conta Bobby.', 'Reconnecte-toi avec ton compte Bobby.', 'Accedi di nuovo con il tuo account Bobby.', 'Melde dich erneut mit deinem Bobby-Konto an.');
  if (code === 'context_paused') return t('Context is paused. Resume it before saving.', 'El contexto está en pausa. Reanúdalo antes de guardar.', 'O contexto está em pausa. Retoma-o antes de guardar.', 'Le contexte est en pause. Réactive-le avant d’enregistrer.', 'Il contesto è in pausa. Riattivalo prima di salvare.', 'Der Kontext ist pausiert. Aktiviere ihn vor dem Speichern.');
  if (code === 'invalid_import') return t('Use the JSON from the prompt below: 1–20 facts, short summaries, valid amounts and currencies. Remove account numbers and credentials.', 'Usa el JSON del mensaje de abajo: 1–20 datos, resúmenes breves, importes y monedas válidos. Elimina números de cuenta y credenciales.', 'Usa o JSON da mensagem abaixo: 1–20 dados, resumos breves, valores e moedas válidos. Remove números de conta e credenciais.', 'Utilise le JSON du message ci-dessous : 1 à 20 faits, des résumés courts, des montants et devises valides. Retire les numéros de compte et identifiants.', 'Usa il JSON del messaggio qui sotto: 1–20 dati, riepiloghi brevi, importi e valute validi. Rimuovi numeri di conto e credenziali.', 'Verwende das JSON aus der Vorlage unten: 1–20 Angaben, kurze Texte, gültige Beträge und Währungen. Entferne Kontonummern und Zugangsdaten.');
  if (['draft_missing', 'draft_not_found', 'draft_unavailable'].includes(code)) return t('This draft has expired or was removed. Ask ChatGPT to prepare it again.', 'Este borrador caducó o se eliminó. Pide a ChatGPT que lo prepare de nuevo.', 'Este rascunho expirou ou foi eliminado. Pede ao ChatGPT que o prepare novamente.', 'Ce brouillon a expiré ou a été supprimé. Demande à ChatGPT de le préparer à nouveau.', 'Questa bozza è scaduta o è stata eliminata. Chiedi a ChatGPT di prepararla di nuovo.', 'Dieser Entwurf ist abgelaufen oder wurde gelöscht. Bitte ChatGPT, ihn erneut vorzubereiten.');
  if (code === 'context_limit') return t('Your account has reached 50 facts. Delete older items before importing more.', 'Tu cuenta llegó a 50 datos. Borra los antiguos antes de importar más.', 'A tua conta chegou a 50 dados. Elimina os antigos antes de importar mais.', 'Ton compte a atteint 50 faits. Supprime les anciens avant d’en importer davantage.', 'Il tuo account ha raggiunto 50 dati. Elimina quelli vecchi prima di importarne altri.', 'Dein Konto hat 50 Angaben erreicht. Lösche ältere Einträge vor weiteren Importen.');
  if (code === 'duplicate_context') return t('Some selected facts are already saved. Remove duplicates from your selection.', 'Algunos datos seleccionados ya están guardados. Quita los duplicados de tu selección.', 'Alguns dados selecionados já estão guardados. Remove os duplicados da seleção.', 'Certains faits sélectionnés sont déjà enregistrés. Retire les doublons de ta sélection.', 'Alcuni dati selezionati sono già salvati. Rimuovi i duplicati dalla selezione.', 'Einige ausgewählte Angaben sind bereits gespeichert. Entferne doppelte Einträge aus der Auswahl.');
  return t('This could not be completed. Your changes have not been confirmed. Try again.', 'No se pudo completar. Tus cambios no se han confirmado. Inténtalo de nuevo.', 'Não foi possível concluir. As alterações não foram confirmadas. Tenta novamente.', 'L’opération a échoué. Tes modifications ne sont pas confirmées. Réessaie.', 'Impossibile completare. Le modifiche non sono state confermate. Riprova.', 'Der Vorgang konnte nicht abgeschlossen werden. Deine Änderungen wurden nicht bestätigt. Versuche es erneut.');
}

interface ReviewItem { key: string; selected: boolean; item: FinancialItem }
function ItemEditor({ item, onChange, disabled }: { item: FinancialItem; onChange: (item: FinancialItem) => void; disabled: boolean }) {
  return <div className="grid gap-3">
    <label className="grid gap-1 text-xs text-[#A39C91]">{t('Category', 'Categoría', 'Categoria', 'Catégorie', 'Categoria', 'Kategorie')}
      <select className={field} value={item.category} disabled={disabled} onChange={e => onChange({ ...item, category: e.target.value as FinancialItem['category'] })}>
        {FINANCIAL_CATEGORIES.map(category => <option key={category} value={category}>{categoryLabel(category)}</option>)}
      </select>
    </label>
    <label className="grid gap-1 text-xs text-[#A39C91]">{t('Financial fact · up to 240 characters', 'Dato financiero · hasta 240 caracteres', 'Dado financeiro · até 240 caracteres', 'Fait financier · 240 caractères maximum', 'Dato finanziario · fino a 240 caratteri', 'Finanzielle Angabe · bis zu 240 Zeichen')}
      <textarea className={`${field} min-h-20 resize-y`} maxLength={240} value={item.summary} disabled={disabled} onChange={e => onChange({ ...item, summary: e.target.value })} />
    </label>
    <div className="grid grid-cols-2 gap-3">
      <label className="grid gap-1 text-xs text-[#A39C91]">{t('Amount (optional)', 'Importe (opcional)', 'Valor (opcional)', 'Montant (facultatif)', 'Importo (facoltativo)', 'Betrag (optional)')}
        <input className={field} type="number" min="0" max="1000000000000" step="any" value={item.amount ?? ''} disabled={disabled} onChange={e => onChange({ ...item, amount: e.target.value === '' ? undefined : Number(e.target.value) })} />
      </label>
      <label className="grid gap-1 text-xs text-[#A39C91]">{t('Currency · e.g. EUR', 'Moneda · ej. EUR', 'Moeda · ex. EUR', 'Devise · ex. EUR', 'Valuta · es. EUR', 'Währung · z. B. EUR')}
        <input className={field} maxLength={3} value={item.currency ?? ''} disabled={disabled} onChange={e => onChange({ ...item, currency: e.target.value ? e.target.value.toUpperCase() : undefined })} />
      </label>
    </div>
    <label className="grid gap-1 text-xs text-[#A39C91]">{t('Date of the fact (optional)', 'Fecha del dato (opcional)', 'Data do dado (opcional)', 'Date du fait (facultative)', 'Data del dato (facoltativa)', 'Datum der Angabe (optional)')}
      <input className={field} type="date" value={item.observedAt ?? ''} disabled={disabled} onChange={e => onChange({ ...item, observedAt: e.target.value || undefined })} />
    </label>
  </div>;
}

export function FinancialContextPanel({ onSignIn, initialDraftId }: { onSignIn: () => void; initialDraftId?: string }) {
  const account = useFinancialAccount();
  if (!account.ready) return <p aria-busy="true">{t('Loading…', 'Cargando…', 'A carregar…', 'Chargement…', 'Caricamento…', 'Wird geladen…')}</p>;
  if (!account.id) return <div className="grid gap-4">
    <p className="text-sm leading-6 text-[#A39C91]">{t('Sign in with the same Apple or Google account you use in Bobby on iOS, Android and the web. Your reviewed context belongs to that account.', 'Inicia sesión con la misma cuenta de Apple o Google que usas en Bobby en iOS, Android y web. El contexto revisado pertenece a esa cuenta.', 'Inicia sessão com a mesma conta Apple ou Google que usas no Bobby em iOS, Android e web. O contexto revisto pertence a essa conta.', 'Connecte-toi avec le même compte Apple ou Google que dans Bobby sur iOS, Android et le web. Le contexte validé appartient à ce compte.', 'Accedi con lo stesso account Apple o Google che usi in Bobby su iOS, Android e web. Il contesto approvato appartiene a quell’account.', 'Melde dich mit demselben Apple- oder Google-Konto wie in Bobby auf iOS, Android und im Web an. Dein geprüfter Kontext gehört zu diesem Konto.')}</p>
    <button className={primary} onClick={onSignIn}>{t('Sign in to Bobby', 'Iniciar sesión en Bobby', 'Iniciar sessão no Bobby', 'Se connecter à Bobby', 'Accedi a Bobby', 'Bei Bobby anmelden')}</button>
  </div>;
  return <AccountFinancialContext key={`${account.id}:${account.revision}`} accountId={account.id} initialDraftId={initialDraftId} />;
}

function AccountFinancialContext({ accountId, initialDraftId }: { accountId: string; initialDraftId?: string }) {
  const [state, setState] = useState<FinancialContextState | null>(null);
  const [connection, setConnection] = useState<ChatGPTConnection | null>(null);
  const [source, setSource] = useState('');
  const [review, setReview] = useState<ReviewItem[]>([]);
  const [draftId, setDraftId] = useState<string | undefined>();
  const [consent, setConsent] = useState(false);
  const [editing, setEditing] = useState<{ id: string; item: FinancialItem } | null>(null);
  const [share, setShare] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const active = useRef(true), inFlight = useRef(false), requestId = useRef<string>();
  const controllers = useRef(new Set<AbortController>());
  const draftOpened = useRef<string>();

  const beginReview = useCallback((items: FinancialItem[], id?: string) => {
    setReview(items.map(item => ({ item, key: crypto.randomUUID(), selected: true })));
    setDraftId(id); setConsent(false); setError(''); setNotice(''); setSource('');
    requestId.current = crypto.randomUUID();
  }, []);
  useEffect(() => {
    active.current = true;
    setLoading(true);
    const pendingControllers = controllers.current;
    const controller = new AbortController(); pendingControllers.add(controller);
    void fetchFinancialContext(accountId, controller.signal).then(result => {
      if (!active.current || controller.signal.aborted) return;
      setState(result);
      if (initialDraftId && draftOpened.current !== initialDraftId) {
        draftOpened.current = initialDraftId;
        const pending = result.drafts.find(draft => draft.id === initialDraftId && Date.parse(draft.expiresAt) > Date.now());
        if (pending) beginReview(pending.items, pending.id);
        else setError(financialContextErrorMessage(new FinancialContextError('draft_missing')));
      }
    }).catch(caught => { if (active.current && !controller.signal.aborted) setError(financialContextErrorMessage(caught)); })
      .finally(() => { controllers.current.delete(controller); if (active.current && !controller.signal.aborted) setLoading(false); });
    void fetchChatGPTConnection(accountId, controller.signal).then(result => {
      if (active.current && !controller.signal.aborted) setConnection(result);
    }).catch(() => {});
    return () => { active.current = false; pendingControllers.forEach(item => item.abort()); pendingControllers.clear(); };
  }, [accountId, beginReview, initialDraftId]);

  const run = async (task: (signal: AbortSignal) => Promise<FinancialContextState>, after?: () => void) => {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setError(''); setNotice('');
    const controller = new AbortController(); controllers.current.add(controller);
    try {
      const result = await task(controller.signal);
      if (!active.current || controller.signal.aborted) return;
      setState(result); after?.();
      setNotice(t('Changes confirmed in your Bobby account.', 'Cambios confirmados en tu cuenta de Bobby.', 'Alterações confirmadas na tua conta Bobby.', 'Modifications confirmées dans ton compte Bobby.', 'Modifiche confermate nel tuo account Bobby.', 'Änderungen in deinem Bobby-Konto bestätigt.'));
    } catch (caught) { if (active.current && !controller.signal.aborted) setError(financialContextErrorMessage(caught)); }
    finally { controllers.current.delete(controller); inFlight.current = false; if (active.current) setBusy(false); }
  };
  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      if (active.current) setNotice(t('Copied. Choose what to share in ChatGPT.', 'Copiado. Elige qué compartir en ChatGPT.', 'Copiado. Escolhe o que partilhar no ChatGPT.', 'Copié. Choisis ce que tu souhaites partager dans ChatGPT.', 'Copiato. Scegli cosa condividere in ChatGPT.', 'Kopiert. Wähle aus, was du mit ChatGPT teilen möchtest.'));
    } catch { if (active.current) setError(t('Select and copy the text manually.', 'Selecciona y copia el texto manualmente.', 'Seleciona e copia o texto manualmente.', 'Sélectionne et copie le texte manuellement.', 'Seleziona e copia il testo manualmente.', 'Markiere und kopiere den Text manuell.')); }
  };
  const changeReview = (key: string, patch: Partial<ReviewItem>) => {
    setReview(previous => previous.map(row => row.key === key ? { ...row, ...patch } : row));
    setConsent(false); requestId.current = crypto.randomUUID();
  };
  const selected = review.filter(row => row.selected).map(row => row.item);
  const validSelection = selected.length > 0 && selected.every(item => FinancialItemSchema.safeParse(item).success);
  const clearReview = () => { setReview([]); setDraftId(undefined); setConsent(false); requestId.current = undefined; };

  return <div className="grid gap-5 text-[#F2EDE4]" aria-busy={busy}>
    <p className="text-sm leading-6 text-[#A39C91]">{t('Share only the financial facts you choose. Bobby cannot read your full ChatGPT history. Reported amounts and transactions are not bank-verified.', 'Comparte solo los datos financieros que elijas. Bobby no puede leer todo tu historial de ChatGPT. Los importes y transacciones declarados no están verificados por un banco.', 'Partilha apenas os dados financeiros que escolheres. O Bobby não pode ler todo o teu histórico do ChatGPT. Os valores e transações declarados não são verificados pelo banco.', 'Partage uniquement les faits financiers que tu choisis. Bobby ne peut pas lire tout ton historique ChatGPT. Les montants et transactions déclarés ne sont pas vérifiés par une banque.', 'Condividi solo i dati finanziari che scegli. Bobby non può leggere tutta la tua cronologia ChatGPT. Importi e transazioni dichiarati non sono verificati dalla banca.', 'Teile nur die finanziellen Angaben, die du auswählst. Bobby kann nicht deinen gesamten ChatGPT-Verlauf lesen. Gemeldete Beträge und Transaktionen sind nicht von einer Bank geprüft.')}</p>
    {error && <p role="alert" className="rounded-xl border border-red-300/20 bg-red-300/5 p-3 text-sm text-red-200">{error}</p>}
    {notice && <p role="status" className="flex gap-2 text-sm text-emerald-200"><Check size={16} className="shrink-0" />{notice}</p>}
    {!state ? <button className={button} disabled={busy || loading} onClick={() => void run(signal => fetchFinancialContext(accountId, signal))}><RefreshCw size={16} />{loading ? t('Loading…', 'Cargando…', 'A carregar…', 'Chargement…', 'Caricamento…', 'Wird geladen…') : t('Load my context', 'Cargar mi contexto', 'Carregar o meu contexto', 'Charger mon contexte', 'Carica il mio contesto', 'Meinen Kontext laden')}</button> : <>
      <div className={card}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><h3 className="font-medium">{t('Use my financial context', 'Usar mi contexto financiero', 'Usar o meu contexto financeiro', 'Utiliser mon contexte financier', 'Usa il mio contesto finanziario', 'Meinen Finanzkontext verwenden')}</h3>
            <p className="mt-1 text-xs leading-5 text-[#A39C91]">{state.financialMemoryEnabled ? t('Enabled: remember reviewed facts and save delivered Bobby recommendations. You can correct or delete them.', 'Activado: recordar datos revisados y guardar recomendaciones entregadas por Bobby. Puedes corregirlos o borrarlos.', 'Ativado: recordar dados revistos e guardar recomendações entregues pelo Bobby. Podes corrigi-los ou eliminá-los.', 'Activé : mémoriser les faits validés et enregistrer les recommandations de Bobby. Tu peux les corriger ou les supprimer.', 'Attivo: ricorda i dati controllati e salva le raccomandazioni fornite da Bobby. Puoi correggerli o eliminarli.', 'Aktiviert: geprüfte Angaben und erhaltene Bobby-Empfehlungen speichern. Du kannst sie korrigieren oder löschen.') : t('Off. Enable to remember reviewed facts and save delivered recommendations. While off, new imports and ChatGPT access are blocked. Existing data stays until deleted.', 'Desactivado. Activa para recordar datos revisados y guardar recomendaciones entregadas. Se bloquean nuevas importaciones y el acceso de ChatGPT. Los datos existentes se conservan hasta que los borres.', 'Desativado. Ativa para recordar dados revistos e guardar recomendações entregues. Novas importações e acesso pelo ChatGPT estão bloqueados. Os dados existentes ficam até os eliminares.', 'Désactivé. Active pour mémoriser les faits validés et les recommandations reçues. Les importations et l’accès ChatGPT sont bloqués. Les données existantes restent jusqu’à leur suppression.', 'Disattivato. Attiva per ricordare i dati controllati e salvare le raccomandazioni ricevute. Importazioni e accesso ChatGPT sono bloccati. I dati restano finché non li elimini.', 'Deaktiviert. Aktiviere, um geprüfte Angaben und erhaltene Empfehlungen zu speichern. Importe und ChatGPT-Zugriff sind gesperrt. Vorhandene Daten bleiben, bis du sie löschst.')}</p></div>
          <button className={button} disabled={busy} onClick={() => void run(signal => setFinancialContextEnabled(accountId, !state.financialMemoryEnabled, signal))}>{state.financialMemoryEnabled ? <Pause size={16} /> : <Play size={16} />}{state.financialMemoryEnabled ? t('Pause', 'Pausar', 'Pausar', 'Mettre en pause', 'Pausa', 'Pausieren') : t('Enable context', 'Activar contexto', 'Ativar contexto', 'Activer le contexte', 'Attiva contesto', 'Kontext aktivieren')}</button>
        </div>
        {!state.accountMemoryEnabled && <p className="mt-3 text-sm leading-6 text-amber-200">{t('Your account memory is paused. Imports, recommendation saving and ChatGPT access stay blocked even when financial context is enabled. Resume Memory from your Bobby profile to use them. You can still turn financial context off here.', 'La memoria de tu cuenta está en pausa. Importar, guardar recomendaciones y acceder desde ChatGPT siguen bloqueados aunque actives el contexto financiero. Reanuda Memoria desde tu perfil de Bobby. Puedes desactivar el contexto financiero aquí.', 'A memória da tua conta está em pausa. Importar, guardar recomendações e acesso pelo ChatGPT continuam bloqueados mesmo com contexto financeiro ativo. Retoma Memória no perfil Bobby. Podes desativar o contexto financeiro aqui.', 'La mémoire du compte est en pause. Les importations, l’enregistrement des recommandations et l’accès ChatGPT restent bloqués même si le contexte financier est actif. Réactive Mémoire dans ton profil Bobby. Tu peux désactiver le contexte financier ici.', 'La memoria del tuo account è in pausa. Importazioni, salvataggio raccomandazioni e accesso ChatGPT restano bloccati anche con contesto finanziario attivo. Riattiva Memoria dal profilo Bobby. Puoi disattivare il contesto finanziario qui.', 'Dein Kontogedächtnis ist pausiert. Importe, Speichern von Empfehlungen und ChatGPT-Zugriff bleiben auch bei aktiviertem Finanzkontext gesperrt. Aktiviere Gedächtnis in deinem Bobby-Profil. Hier kannst du den Finanzkontext weiterhin deaktivieren.')}</p>}
      </div>

      <section className={card} aria-labelledby="financial-import-title">
        <h3 id="financial-import-title" className="text-lg font-medium">{t('Bring context from ChatGPT', 'Traer contexto de ChatGPT', 'Trazer contexto do ChatGPT', 'Importer du contexte depuis ChatGPT', 'Importa contesto da ChatGPT', 'Kontext aus ChatGPT importieren')}</h3>
        <p className="mt-2 text-sm leading-6 text-[#A39C91]">{t('Copy this prompt into a conversation you choose. Paste the JSON reply here to review it before saving.', 'Copia este mensaje en la conversación que elijas. Pega aquí la respuesta JSON y revísala antes de guardarla.', 'Copia esta mensagem para a conversa que escolheres. Cola aqui a resposta JSON para a rever antes de guardar.', 'Copie ce message dans la conversation de ton choix. Colle la réponse JSON ici pour la vérifier avant de l’enregistrer.', 'Copia questo messaggio nella conversazione che scegli. Incolla qui la risposta JSON per controllarla prima di salvarla.', 'Kopiere diese Vorlage in eine ausgewählte Unterhaltung. Füge die JSON-Antwort hier ein und prüfe sie vor dem Speichern.')}</p>
        <details className="mt-3 text-sm"><summary className="cursor-pointer text-[#F2EDE4]">{t('Prompt to use in ChatGPT', 'Mensaje para usar en ChatGPT', 'Mensagem para usar no ChatGPT', 'Message à utiliser dans ChatGPT', 'Messaggio da usare in ChatGPT', 'Vorlage für ChatGPT')}</summary><textarea readOnly className={`${field} mt-3 min-h-40`} aria-label={t('ChatGPT prompt', 'Mensaje para ChatGPT', 'Mensagem para o ChatGPT', 'Message pour ChatGPT', 'Messaggio per ChatGPT', 'ChatGPT-Vorlage')} value={CHATGPT_EXPORT_PROMPT} /></details>
        <button className={`${button} mt-3`} onClick={() => void copy(CHATGPT_EXPORT_PROMPT)}><Copy size={16} />{t('Copy prompt', 'Copiar mensaje', 'Copiar mensagem', 'Copier le message', 'Copia messaggio', 'Vorlage kopieren')}</button>
        <label className="mt-4 grid gap-2 text-sm">{t('Paste selected facts as JSON', 'Pega los datos seleccionados en JSON', 'Cola os dados selecionados em JSON', 'Colle les faits sélectionnés en JSON', 'Incolla i dati selezionati in JSON', 'Ausgewählte Angaben als JSON einfügen')}
          <textarea className={`${field} min-h-32 font-mono text-xs`} value={source} disabled={busy || !state.enabled} maxLength={16384} placeholder={'{"format":"bobby-context-v1","items":[…]}'} onChange={e => setSource(e.target.value)} autoComplete="off" spellCheck={false} />
        </label>
        <p className="mt-2 text-xs leading-5 text-[#A39C91]">{t('The pasted reply stays on this device until you select and save facts. No transcript is uploaded.', 'La respuesta pegada permanece en este dispositivo hasta que selecciones y guardes los datos. No se sube una transcripción.', 'A resposta colada fica neste dispositivo até selecionares e guardares os dados. Não é enviada uma transcrição.', 'La réponse collée reste sur cet appareil jusqu’à la sélection et l’enregistrement des faits. Aucune transcription n’est envoyée.', 'La risposta incollata resta su questo dispositivo finché non selezioni e salvi i dati. Nessuna trascrizione viene caricata.', 'Die eingefügte Antwort bleibt auf diesem Gerät, bis du Angaben auswählst und speicherst. Es wird kein Gesprächsprotokoll hochgeladen.')}</p>
        <button className={`${button} mt-3`} disabled={busy || !state.enabled || !source.trim()} onClick={() => { try { beginReview(parseFinancialImport(source)); } catch (caught) { setError(financialContextErrorMessage(caught)); } }}><FileInput size={16} />{t('Review facts', 'Revisar datos', 'Rever dados', 'Vérifier les faits', 'Controlla i dati', 'Angaben prüfen')}</button>
      </section>

      {state.drafts.length > 0 && <section className={card}>
        <h3 className="font-medium">{t('Drafts from ChatGPT', 'Borradores de ChatGPT', 'Rascunhos do ChatGPT', 'Brouillons de ChatGPT', 'Bozze da ChatGPT', 'Entwürfe aus ChatGPT')}</h3>
        <p className="mt-2 text-xs text-[#A39C91]">{t('Drafts expire after 24 hours. Nothing is saved to your profile until you approve it.', 'Los borradores caducan a las 24 horas. Nada se guarda en tu perfil hasta que lo apruebes.', 'Os rascunhos expiram após 24 horas. Nada é guardado no perfil até aprovares.', 'Les brouillons expirent après 24 heures. Rien n’est enregistré dans ton profil sans ton accord.', 'Le bozze scadono dopo 24 ore. Nulla viene salvato nel profilo finché non approvi.', 'Entwürfe laufen nach 24 Stunden ab. Erst nach deiner Zustimmung wird etwas im Profil gespeichert.')}</p>
        <ul className="mt-3 grid gap-3">{state.drafts.map(draft => <li key={draft.id} className="rounded-xl border border-white/10 p-3">
          <p className="break-words text-sm">{draft.items[0]?.summary}</p><p className="mt-1 text-xs text-[#A39C91]">{draft.items.length} · {new Date(draft.expiresAt).toLocaleString(speechLocale())}</p>
          <div className="mt-2 flex flex-wrap gap-2"><button className={button} disabled={busy || !state.enabled || Date.parse(draft.expiresAt) <= Date.now()} onClick={() => beginReview(draft.items, draft.id)}>{t('Review', 'Revisar', 'Rever', 'Vérifier', 'Controlla', 'Prüfen')}</button>
            <button className={button} disabled={busy} onClick={() => void run(signal => deleteFinancialContext(accountId, { draftId: draft.id }, signal), () => { if (draftId === draft.id) clearReview(); })}><Trash2 size={15} />{t('Discard', 'Descartar', 'Descartar', 'Supprimer', 'Scarta', 'Verwerfen')}</button></div>
        </li>)}</ul>
      </section>}

      {review.length > 0 && <section className={card} aria-labelledby="financial-review-title">
        <h3 id="financial-review-title" className="font-medium">{t('Review and choose what Bobby saves', 'Revisa y elige qué guarda Bobby', 'Revê e escolhe o que o Bobby guarda', 'Vérifie et choisis ce que Bobby enregistre', 'Controlla e scegli cosa salva Bobby', 'Prüfe und wähle, was Bobby speichert')}</h3>
        <div className="mt-4 grid gap-4">{review.map((row, index) => <div key={row.key} className="rounded-xl border border-white/10 p-3">
          <label className="mb-3 flex min-h-10 items-center gap-3 text-sm"><input type="checkbox" checked={row.selected} disabled={busy} onChange={e => changeReview(row.key, { selected: e.target.checked })} />{t('Include', 'Incluir', 'Incluir', 'Inclure', 'Includi', 'Einbeziehen')} {index + 1}</label>
          <ItemEditor item={row.item} disabled={busy || !row.selected} onChange={item => changeReview(row.key, { item })} />
          {row.selected && !FinancialItemSchema.safeParse(row.item).success && <p className="mt-2 text-xs text-amber-200">{t('Check the summary, amount, currency and date. Remove sensitive identifiers.', 'Revisa el resumen, importe, moneda y fecha. Elimina identificadores sensibles.', 'Revê o resumo, valor, moeda e data. Remove identificadores sensíveis.', 'Vérifie le résumé, le montant, la devise et la date. Retire les identifiants sensibles.', 'Controlla riepilogo, importo, valuta e data. Rimuovi identificatori sensibili.', 'Prüfe Text, Betrag, Währung und Datum. Entferne sensible Kennungen.')}</p>}
        </div>)}</div>
        <label className="mt-4 flex items-start gap-3 text-sm leading-6"><input type="checkbox" className="mt-1.5" checked={consent} disabled={busy || !state.enabled || !validSelection} onChange={e => setConsent(e.target.checked)} />{t('I reviewed these facts and allow Bobby to save the selected items to my account. I can correct or delete them.', 'Revisé estos datos y autorizo a Bobby a guardar los seleccionados en mi cuenta. Puedo corregirlos o borrarlos.', 'Revi estes dados e autorizo o Bobby a guardar os selecionados na minha conta. Posso corrigi-los ou eliminá-los.', 'J’ai vérifié ces faits et j’autorise Bobby à enregistrer les éléments sélectionnés dans mon compte. Je peux les corriger ou les supprimer.', 'Ho controllato i dati e autorizzo Bobby a salvare quelli selezionati nel mio account. Posso correggerli o eliminarli.', 'Ich habe diese Angaben geprüft und erlaube Bobby, die ausgewählten Einträge in meinem Konto zu speichern. Ich kann sie korrigieren oder löschen.')}</label>
        <div className="mt-4 flex flex-wrap gap-2"><button className={primary} disabled={busy || !state.enabled || !consent || !validSelection} onClick={() => void run(signal => importFinancialContext(accountId, selected.map(item => FinancialItemSchema.parse(item)), requestId.current ?? crypto.randomUUID(), draftId, signal), clearReview)}>{t('Save selected facts', 'Guardar datos seleccionados', 'Guardar dados selecionados', 'Enregistrer les faits sélectionnés', 'Salva i dati selezionati', 'Ausgewählte Angaben speichern')} · {selected.length}</button>
          <button className={button} disabled={busy} onClick={clearReview}>{t('Cancel review', 'Cancelar revisión', 'Cancelar revisão', 'Annuler la vérification', 'Annulla controllo', 'Prüfung abbrechen')}</button></div>
      </section>}

      <section className={card}>
        <h3 className="font-medium">{t('Saved financial context', 'Contexto financiero guardado', 'Contexto financeiro guardado', 'Contexte financier enregistré', 'Contesto finanziario salvato', 'Gespeicherter Finanzkontext')} · {state.items.length}</h3>
        <p className="mt-2 text-xs leading-5 text-[#A39C91]">{t('Provided by you via ChatGPT. These facts do not override Bobby’s market analysis and are not verified transactions. They stay until you delete them.', 'Aportado por ti mediante ChatGPT. Estos datos no sustituyen el análisis de mercado de Bobby y no son transacciones verificadas. Se conservan hasta que los borres.', 'Fornecido por ti através do ChatGPT. Estes dados não substituem a análise de mercado do Bobby e não são transações verificadas. São guardados até os eliminares.', 'Fourni par toi via ChatGPT. Ces faits ne remplacent pas l’analyse de marché de Bobby et ne sont pas des transactions vérifiées. Ils restent jusqu’à leur suppression.', 'Fornito da te tramite ChatGPT. Questi dati non sostituiscono l’analisi di mercato di Bobby e non sono transazioni verificate. Restano finché non li elimini.', 'Von dir über ChatGPT angegeben. Diese Angaben ersetzen nicht Bobbys Marktanalyse und sind keine geprüften Transaktionen. Sie bleiben, bis du sie löschst.')}</p>
        {state.items.length === 0 ? <p className="mt-4 text-sm text-[#A39C91]">{t('No facts saved yet.', 'Todavía no hay datos guardados.', 'Ainda não há dados guardados.', 'Aucun fait enregistré pour le moment.', 'Nessun dato salvato.', 'Noch keine Angaben gespeichert.')}</p> : <ul className="mt-4 grid gap-4">{state.items.map(saved => <li key={saved.id} className="rounded-xl border border-white/10 p-3">
          {editing?.id === saved.id ? <><ItemEditor item={editing.item} disabled={busy} onChange={item => setEditing({ id: saved.id, item })} /><div className="mt-3 flex flex-wrap gap-2">
            <button className={primary} disabled={busy || !FinancialItemSchema.safeParse(editing.item).success} onClick={() => void run(signal => updateFinancialItem(accountId, saved.id, FinancialItemSchema.parse(editing.item), signal), () => setEditing(null))}>{t('Approve correction', 'Aprobar corrección', 'Aprovar correção', 'Approuver la correction', 'Approva correzione', 'Korrektur bestätigen')}</button>
            <button className={button} disabled={busy} onClick={() => setEditing(null)}>{t('Cancel', 'Cancelar', 'Cancelar', 'Annuler', 'Annulla', 'Abbrechen')}</button></div></> : <>
            <p className="text-xs text-[#A39C91]">{categoryLabel(saved.category)} · {saved.observedAt || new Date(saved.updatedAt).toLocaleDateString(speechLocale())}</p><p className="mt-1 break-words text-sm">{saved.summary}</p>
            {saved.amount !== undefined && <p className="mt-1 text-sm">{saved.amount.toLocaleString(speechLocale())} {saved.currency}</p>}
            <div className="mt-3 flex flex-wrap gap-2"><button className={button} disabled={busy} onClick={() => { const { category, summary, amount, currency, observedAt } = saved; setEditing({ id: saved.id, item: { category, summary, amount, currency, observedAt } }); }}>{t('Correct', 'Corregir', 'Corrigir', 'Corriger', 'Correggi', 'Korrigieren')}</button>
              <button className={button} disabled={busy} onClick={() => void run(signal => deleteFinancialContext(accountId, { id: saved.id }, signal))}><Trash2 size={15} />{t('Delete', 'Borrar', 'Eliminar', 'Supprimer', 'Elimina', 'Löschen')}</button></div>
          </>}
        </li>)}</ul>}
        {(state.items.length > 0 || state.drafts.length > 0 || state.recommendations.length > 0) && <button className={`${button} mt-4 text-red-200`} disabled={busy} onClick={() => {
          if (window.confirm(t('Delete all saved financial facts, pending drafts and recommendation snapshots from your Bobby account?', '¿Borrar todos los datos financieros, borradores y recomendaciones guardados en tu cuenta de Bobby?', 'Eliminar todos os dados financeiros, rascunhos e recomendações guardados na tua conta Bobby?', 'Supprimer tous les faits financiers, brouillons et recommandations enregistrés dans ton compte Bobby ?', 'Eliminare tutti i dati finanziari, le bozze e le raccomandazioni salvati nel tuo account Bobby?', 'Alle finanziellen Angaben, Entwürfe und gespeicherten Empfehlungen aus deinem Bobby-Konto löschen?'))) void run(signal => deleteFinancialContext(accountId, { scope: 'all' }, signal), () => { clearReview(); setEditing(null); setShare(''); });
        }}><Trash2 size={15} />{t('Delete all financial context', 'Borrar todo el contexto financiero', 'Eliminar todo o contexto financeiro', 'Supprimer tout le contexte financier', 'Elimina tutto il contesto finanziario', 'Gesamten Finanzkontext löschen')}</button>}
      </section>

      <section className={card}>
        <h3 className="font-medium">{t('Bring Bobby’s recommendations to ChatGPT', 'Llevar recomendaciones de Bobby a ChatGPT', 'Levar recomendações do Bobby para o ChatGPT', 'Transférer les recommandations Bobby vers ChatGPT', 'Porta le raccomandazioni Bobby in ChatGPT', 'Bobbys Empfehlungen zu ChatGPT übertragen')}</h3>
        <p className="mt-2 text-xs leading-5 text-[#A39C91]">{t('Saved analyses from your Bobby account, with their dates. They expire after 90 days. They do not download your ChatGPT conversations or represent current prices.', 'Análisis guardados de tu cuenta de Bobby, con sus fechas. Caducan a los 90 días. No descargan tus conversaciones de ChatGPT ni representan precios actuales.', 'Análises guardadas na tua conta Bobby, com as respetivas datas. Expiram após 90 dias. Não descarregam conversas do ChatGPT nem representam preços atuais.', 'Analyses enregistrées dans ton compte Bobby, avec leurs dates. Elles expirent après 90 jours. Elles ne téléchargent pas tes conversations ChatGPT et ne représentent pas les cours actuels.', 'Analisi salvate nel tuo account Bobby, con le date. Scadono dopo 90 giorni. Non scaricano le conversazioni ChatGPT né rappresentano i prezzi attuali.', 'Gespeicherte Analysen aus deinem Bobby-Konto mit Datum. Sie laufen nach 90 Tagen ab. Sie laden keine ChatGPT-Unterhaltungen herunter und zeigen keine aktuellen Kurse.')}</p>
        {state.recommendations.length === 0 ? <p className="mt-4 text-sm text-[#A39C91]">{t('No saved recommendations yet. Your next signed-in Bobby analysis can appear here.', 'Todavía no hay recomendaciones guardadas. Tu próximo análisis con sesión iniciada puede aparecer aquí.', 'Ainda não há recomendações guardadas. A tua próxima análise com sessão iniciada pode aparecer aqui.', 'Aucune recommandation enregistrée. Ta prochaine analyse Bobby avec connexion peut apparaître ici.', 'Nessuna raccomandazione salvata. La prossima analisi con accesso può apparire qui.', 'Noch keine Empfehlungen gespeichert. Deine nächste Bobby-Analyse mit Anmeldung kann hier erscheinen.')}</p> : <>
          <ul className="mt-4 grid gap-3">{state.recommendations.map(recommendation => <li key={recommendation.id} className="border-b border-white/10 pb-3">
            <p className="text-sm">{recommendation.symbol}</p>
            <p className="mt-1 text-xs text-[#A39C91]">{t('Market data', 'Datos de mercado', 'Dados de mercado', 'Données de marché', 'Dati di mercato', 'Marktdaten')}: {new Date(recommendation.asOf).toLocaleString(speechLocale())}</p>
            <p className="mt-1 text-xs text-[#A39C91]">{t('Saved', 'Guardado', 'Guardado', 'Enregistré', 'Salvato', 'Gespeichert')}: {new Date(recommendation.createdAt).toLocaleString(speechLocale())}</p>
            <p className="mt-2 text-sm">{recommendation.headline}</p><p className="mt-1 text-xs leading-5 text-[#A39C91]">{recommendation.risk}</p>
          </li>)}</ul>
          <button className={`${button} mt-4`} onClick={() => setShare(exportRecommendations(state.recommendations))}>{t('Review export', 'Revisar exportación', 'Rever exportação', 'Vérifier l’export', 'Controlla esportazione', 'Export prüfen')}</button>
        </>}
        {share && <div className="mt-4 grid gap-3"><textarea className={`${field} min-h-40 font-mono text-xs`} readOnly value={share} aria-label={t('Recommendations to share', 'Recomendaciones para compartir', 'Recomendações para partilhar', 'Recommandations à partager', 'Raccomandazioni da condividere', 'Empfehlungen zum Teilen')} />
          <div className="flex flex-wrap gap-2"><button className={button} onClick={() => void copy(share)}><Copy size={16} />{t('Copy for ChatGPT', 'Copiar para ChatGPT', 'Copiar para o ChatGPT', 'Copier pour ChatGPT', 'Copia per ChatGPT', 'Für ChatGPT kopieren')}</button>
            <button className={button} onClick={() => { const url = URL.createObjectURL(new Blob([share], { type: 'application/json' })); const link = document.createElement('a'); link.href = url; link.download = 'bobby-recommendations.json'; link.click(); URL.revokeObjectURL(url); }}><Download size={16} />{t('Download JSON', 'Descargar JSON', 'Descarregar JSON', 'Télécharger le JSON', 'Scarica JSON', 'JSON herunterladen')}</button></div>
        </div>}
      </section>
      <section className={card}>
        <h3 className="font-medium">{t('ChatGPT connection', 'Conexión con ChatGPT', 'Ligação ao ChatGPT', 'Connexion ChatGPT', 'Connessione ChatGPT', 'ChatGPT-Verbindung')}</h3>
        <p className="mt-2 text-sm leading-6 text-[#A39C91]">{connection?.connected ? t('Connected with your approval. ChatGPT can read approved context and saved recommendations, and prepare drafts for you to review.', 'Conectado con tu autorización. ChatGPT puede leer el contexto aprobado y las recomendaciones guardadas, y preparar borradores para que los revises.', 'Ligado com a tua autorização. O ChatGPT pode ler o contexto aprovado e as recomendações guardadas, e preparar rascunhos para reveres.', 'Connecté avec ton accord. ChatGPT peut lire le contexte approuvé et les recommandations enregistrées, et préparer des brouillons à vérifier.', 'Connesso con la tua approvazione. ChatGPT può leggere contesto e raccomandazioni approvati e preparare bozze da controllare.', 'Mit deiner Zustimmung verbunden. ChatGPT kann freigegebenen Kontext und gespeicherte Empfehlungen lesen und Entwürfe zur Prüfung vorbereiten.') : t('The manual import works here. A connection starts in ChatGPT when Bobby is available as a connector, then asks for your approval in Bobby.', 'Aquí funciona la importación manual. La conexión comienza en ChatGPT cuando Bobby esté disponible como conector y después pide tu autorización en Bobby.', 'A importação manual funciona aqui. A ligação começa no ChatGPT quando o Bobby estiver disponível como conector e pede depois a tua autorização no Bobby.', 'L’importation manuelle fonctionne ici. La connexion démarre dans ChatGPT lorsque Bobby est disponible comme connecteur, puis demande ton accord dans Bobby.', 'Qui puoi importare manualmente. La connessione parte da ChatGPT quando Bobby è disponibile come connettore e poi chiede la tua approvazione in Bobby.', 'Der manuelle Import funktioniert hier. Eine Verbindung startet in ChatGPT, wenn Bobby als Connector verfügbar ist, und bittet dann in Bobby um deine Zustimmung.')}</p>
        {connection?.connected && <button className={`${button} mt-3`} disabled={busy} onClick={async () => {
          if (inFlight.current) return; inFlight.current = true; setBusy(true); setError('');
          const controller = new AbortController(); controllers.current.add(controller);
          try { const result = await revokeChatGPTConnection(accountId, controller.signal); if (active.current && !controller.signal.aborted) { setConnection(result); setNotice(t('ChatGPT access revoked.', 'Acceso de ChatGPT revocado.', 'Acesso do ChatGPT revogado.', 'Accès de ChatGPT révoqué.', 'Accesso ChatGPT revocato.', 'ChatGPT-Zugriff widerrufen.')); } }
          catch (caught) { if (active.current && !controller.signal.aborted) setError(financialContextErrorMessage(caught)); }
          finally { controllers.current.delete(controller); inFlight.current = false; if (active.current) setBusy(false); }
        }}>{t('Revoke ChatGPT access', 'Revocar acceso de ChatGPT', 'Revogar acesso do ChatGPT', 'Révoquer l’accès de ChatGPT', 'Revoca accesso ChatGPT', 'ChatGPT-Zugriff widerrufen')}</button>}
      </section>
    </>}
  </div>;
}

export default function FinancialContextDialog({ open, onOpenChange, onSignIn }: { open: boolean; onOpenChange: (open: boolean) => void; onSignIn: () => void }) {
  return <Dialog.Root open={open} onOpenChange={onOpenChange}><Dialog.Portal>
    <Dialog.Overlay className="fixed inset-0 z-[70] bg-black/75 backdrop-blur-sm" />
    <Dialog.Content className="fixed left-1/2 top-1/2 z-[71] max-h-[calc(100dvh-32px)] w-[min(680px,calc(100vw-24px))] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-3xl border border-white/10 bg-[#0B0A09] p-5 text-[#F2EDE4] shadow-2xl sm:p-7">
      <Dialog.Close className="absolute right-3 top-3 grid h-10 w-10 place-items-center rounded-full bg-white/5" aria-label={t('Close', 'Cerrar', 'Fechar', 'Fermer', 'Chiudi', 'Schließen')}><X size={18} /></Dialog.Close>
      <Dialog.Title className="pr-10 text-2xl font-light tracking-tight">{t('Bobby + ChatGPT', 'Bobby + ChatGPT', 'Bobby + ChatGPT', 'Bobby + ChatGPT', 'Bobby + ChatGPT', 'Bobby + ChatGPT')}</Dialog.Title>
      <Dialog.Description className="mt-2 mb-6 text-sm text-[#A39C91]">{t('Your context. Your choice.', 'Tu contexto. Tú eliges.', 'O teu contexto. Tu escolhes.', 'Ton contexte. Ton choix.', 'Il tuo contesto. La tua scelta.', 'Dein Kontext. Deine Wahl.')}</Dialog.Description>
      {open && <FinancialContextPanel onSignIn={onSignIn} />}
    </Dialog.Content>
  </Dialog.Portal></Dialog.Root>;
}
