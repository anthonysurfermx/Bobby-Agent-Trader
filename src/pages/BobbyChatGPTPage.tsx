import { useEffect, useRef, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { Link, useLocation } from 'react-router-dom';
import { ArrowLeft, ShieldCheck } from 'lucide-react';
import KineticShell from '@/components/kinetic/KineticShell';
import { FinancialContextPanel, financialContextErrorMessage } from '@/components/nucleo/FinancialContextDialog';
import { rememberReturn } from '@/lib/access-client';
import { clientLanguagePath } from '@/lib/client-language';
import { locale, t } from '@/lib/companions/i18n';
import { useBobbyAccount } from '@/hooks/useBobbyAccount';
import { authorizeChatGPT, denyChatGPTAuthorization, useFinancialAccount, validateChatGPTAuthorization, type ChatGPTAuthorizationRequest } from '@/lib/financial-context-client';

const button = 'inline-flex min-h-12 items-center justify-center rounded-xl border border-white/15 px-5 py-3 text-sm disabled:opacity-40 disabled:cursor-not-allowed hover:bg-white/5';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function signIn() {
  // Only a same-origin, strictly allowlisted path is stored, never a financial fact or transcript.
  rememberReturn(window.location.pathname + window.location.search);
  window.location.assign(clientLanguagePath('/signin'));
}

function ChatGPTConsent() {
  const account = useFinancialAccount();
  const { account: displayAccount } = useBobbyAccount();
  const location = useLocation();
  const [request, setRequest] = useState<ChatGPTAuthorizationRequest | null>(null);
  const [error, setError] = useState('');
  const [validationError, setValidationError] = useState('');
  const [approved, setApproved] = useState(false);
  const [busy, setBusy] = useState(false);
  const active = useRef(true), lock = useRef(false), controller = useRef<AbortController>();
  const identity = useRef(`${account.id}:${account.revision}`);
  identity.current = `${account.id}:${account.revision}`;

  useEffect(() => {
    setApproved(false); setError(''); setBusy(false); lock.current = false;
    controller.current?.abort();
  }, [account.id, account.revision]);

  useEffect(() => {
    active.current = true;
    setRequest(null); setApproved(false); setError(''); setValidationError('');
    const query = new URLSearchParams(location.search), signalController = new AbortController();
    void validateChatGPTAuthorization(query, signalController.signal).then(result => {
      if (active.current && !signalController.signal.aborted) {
        if (!result?.client?.id || !Array.isArray(result.requestedScopes)) {
          setValidationError(t('This connection is unavailable or its request is invalid. Start again from ChatGPT.', 'Esta conexión no está disponible o la solicitud no es válida. Empieza de nuevo desde ChatGPT.', 'Esta ligação não está disponível ou o pedido é inválido. Começa novamente no ChatGPT.', 'Cette connexion est indisponible ou la demande est invalide. Recommence depuis ChatGPT.', 'Questa connessione non è disponibile o la richiesta non è valida. Ricomincia da ChatGPT.', 'Diese Verbindung ist nicht verfügbar oder die Anfrage ist ungültig. Starte erneut aus ChatGPT.'));
        } else {
          setRequest(result);
          if (!result.available) setValidationError(t('This connection is unavailable. You can cancel this request and return to ChatGPT.', 'Esta conexión no está disponible. Puedes cancelar la solicitud y volver a ChatGPT.', 'Esta ligação não está disponível. Podes cancelar o pedido e voltar ao ChatGPT.', 'Cette connexion est indisponible. Tu peux annuler cette demande et retourner dans ChatGPT.', 'Questa connessione non è disponibile. Puoi annullare la richiesta e tornare a ChatGPT.', 'Diese Verbindung ist nicht verfügbar. Du kannst die Anfrage abbrechen und zu ChatGPT zurückkehren.'));
        }
      }
    }).catch(() => { if (active.current && !signalController.signal.aborted) setValidationError(t('This connection could not be verified. Start again from ChatGPT.', 'No se pudo verificar esta conexión. Empieza de nuevo desde ChatGPT.', 'Não foi possível verificar esta ligação. Começa novamente no ChatGPT.', 'Cette connexion n’a pas pu être vérifiée. Recommence depuis ChatGPT.', 'Impossibile verificare la connessione. Ricomincia da ChatGPT.', 'Diese Verbindung konnte nicht geprüft werden. Starte erneut aus ChatGPT.')); });
    return () => { active.current = false; signalController.abort(); controller.current?.abort(); };
  }, [location.search]);

  const decide = async (allow: boolean) => {
    if (!request || !account.ready || lock.current || (allow && (!account.id || !approved || !request.available))) return;
    lock.current = true; setBusy(true); setError('');
    const owner = identity.current, signalController = new AbortController(); controller.current = signalController;
    try {
      const query = new URLSearchParams(location.search);
      const redirectUrl = allow
        ? await authorizeChatGPT(account.id!, query, signalController.signal)
        : await denyChatGPTAuthorization(account.id, query, signalController.signal);
      if (active.current && !signalController.signal.aborted && identity.current === owner) window.location.assign(redirectUrl);
      // Keep the decision locked until navigation unloads this page. A delayed or blocked
      // callback must not permit a second approval to rotate the authorization code.
    } catch (caught) {
      if (active.current && !signalController.signal.aborted && identity.current === owner) {
        setError(financialContextErrorMessage(caught)); setBusy(false); lock.current = false;
      }
    }
  };
  const scopeLabel = (scope: string) => {
    if (scope === 'bobby.context.read') return t('Read the financial facts you approved in Bobby and your saved recommendations with their dates.', 'Leer los datos financieros que aprobaste en Bobby y tus recomendaciones guardadas con sus fechas.', 'Ler os dados financeiros que aprovaste no Bobby e as recomendações guardadas com as respetivas datas.', 'Lire les faits financiers approuvés dans Bobby et tes recommandations enregistrées avec leurs dates.', 'Leggere i dati finanziari approvati in Bobby e le raccomandazioni salvate con le date.', 'Die freigegebenen Finanzangaben in Bobby und deine gespeicherten Empfehlungen mit Datum lesen.');
    if (scope === 'bobby.context.write') return t('Prepare financial drafts. Saving requires your separate review in Bobby.', 'Preparar borradores financieros. Guardarlos requiere una revisión separada en Bobby.', 'Preparar rascunhos financeiros. Guardar exige a tua revisão separada no Bobby.', 'Préparer des brouillons financiers. Leur enregistrement nécessite ta validation dans Bobby.', 'Preparare bozze finanziarie. Il salvataggio richiede una tua verifica separata in Bobby.', 'Finanzielle Entwürfe vorbereiten. Das Speichern erfordert deine gesonderte Prüfung in Bobby.');
    return scope;
  };

  return <section className="rounded-3xl border border-white/10 bg-white/[0.025] p-5 sm:p-7" aria-busy={busy}>
    <ShieldCheck className="text-emerald-300" size={28} />
    <h2 className="mt-4 text-2xl font-light">{t('Allow ChatGPT to connect to Bobby', 'Permitir que ChatGPT se conecte a Bobby', 'Permitir que o ChatGPT se ligue ao Bobby', 'Autoriser ChatGPT à se connecter à Bobby', 'Consenti a ChatGPT di collegarsi a Bobby', 'ChatGPT mit Bobby verbinden')}</h2>
    <p className="mt-3 text-sm leading-6 text-[#A39C91]">{t('This grants access to your Bobby account only. It does not give Bobby access to your ChatGPT history. You can pause or revoke this connection in Bobby.', 'Esto da acceso solo a tu cuenta de Bobby. No permite a Bobby acceder a tu historial de ChatGPT. Puedes pausar o revocar esta conexión en Bobby.', 'Isto dá acesso apenas à tua conta Bobby. Não permite ao Bobby aceder ao teu histórico do ChatGPT. Podes pausar ou revogar esta ligação no Bobby.', 'Cela donne accès uniquement à ton compte Bobby. Bobby n’accède pas à ton historique ChatGPT. Tu peux mettre en pause ou révoquer cette connexion dans Bobby.', 'Questo consente l’accesso solo al tuo account Bobby. Non dà a Bobby accesso alla cronologia ChatGPT. Puoi mettere in pausa o revocare la connessione in Bobby.', 'Dies gewährt nur Zugriff auf dein Bobby-Konto. Bobby erhält keinen Zugriff auf deinen ChatGPT-Verlauf. Du kannst die Verbindung in Bobby pausieren oder widerrufen.')}</p>
    {(error || validationError) && <p role="alert" className="mt-4 text-sm text-red-200">{validationError || error}</p>}
    {!request && !error && !validationError && <p className="mt-4 text-sm text-[#A39C91]" aria-busy="true">{t('Verifying connection…', 'Verificando conexión…', 'A verificar ligação…', 'Vérification de la connexion…', 'Verifica connessione…', 'Verbindung wird geprüft…')}</p>}
    {request && <>
      <p className="mt-4 text-sm">{request.client.name}</p>
      <ul className="mt-4 list-disc space-y-3 pl-5 text-sm leading-6 text-[#F2EDE4]">{request.requestedScopes.map(scope => <li key={scope}>{scopeLabel(scope)}</li>)}</ul>
      {account.ready && account.id ? <>
        {displayAccount?.email && <p className="mt-4 break-all text-sm text-[#A39C91]">{displayAccount.email}</p>}
        <label className="mt-6 flex gap-3 text-sm leading-6"><input type="checkbox" checked={approved} className="mt-1.5" disabled={busy || !request.available} onChange={event => setApproved(event.target.checked)} />{t('I approve these permissions for my Bobby account.', 'Apruebo estos permisos para mi cuenta de Bobby.', 'Aprovo estas permissões para a minha conta Bobby.', 'J’approuve ces autorisations pour mon compte Bobby.', 'Approvo queste autorizzazioni per il mio account Bobby.', 'Ich bestätige diese Berechtigungen für mein Bobby-Konto.')}</label>
        <button className={`${button} mt-5 bg-[#F2EDE4] !text-[#0B0A09]`} disabled={busy || !approved || !request.available} onClick={() => void decide(true)}>{t('Approve connection', 'Aprobar conexión', 'Aprovar ligação', 'Approuver la connexion', 'Approva connessione', 'Verbindung bestätigen')}</button>
      </> : <button className={`${button} mt-5 bg-[#F2EDE4] !text-[#0B0A09]`} disabled={!account.ready || busy || !request.available} onClick={signIn}>{t('Sign in to review permissions', 'Inicia sesión para revisar permisos', 'Inicia sessão para rever permissões', 'Connecte-toi pour vérifier les autorisations', 'Accedi per controllare le autorizzazioni', 'Anmelden und Berechtigungen prüfen')}</button>}
    </>}
    {request
      ? <button className={`${button} ml-0 mt-3 sm:ml-3`} disabled={busy || !account.ready} onClick={() => void decide(false)}>{t('Cancel', 'Cancelar', 'Cancelar', 'Annuler', 'Annulla', 'Abbrechen')}</button>
      : <Link className={`${button} ml-0 mt-3 sm:ml-3`} to={clientLanguagePath('/chatgpt')}>{t('Cancel', 'Cancelar', 'Cancelar', 'Annuler', 'Annulla', 'Abbrechen')}</Link>}
  </section>;
}

export default function BobbyChatGPTPage() {
  const location = useLocation();
  const initialDraft = new URLSearchParams(location.search).get('draft');
  const connect = location.pathname === '/chatgpt/connect';
  return <KineticShell activeTab="docs" nucleo showTicker={false} showStatus={false}>
    <Helmet htmlAttributes={{ lang: locale() }}><title>Bobby + ChatGPT</title><meta name="robots" content="noindex" /></Helmet>
    <div className="mx-auto w-full max-w-3xl px-4 py-8 pb-24 text-[#F2EDE4] sm:py-12">
      <Link className="mb-6 inline-flex min-h-10 items-center gap-2 text-sm text-[#A39C91]" to={clientLanguagePath('/desk')}><ArrowLeft size={16} />{t('Back to Bobby', 'Volver a Bobby', 'Voltar ao Bobby', 'Retour à Bobby', 'Torna a Bobby', 'Zurück zu Bobby')}</Link>
      <h1 className="mb-2 text-4xl font-light tracking-tight">Bobby + ChatGPT</h1>
      <p className="mb-7 text-sm text-[#A39C91]">{t('Your context. Your choice.', 'Tu contexto. Tú eliges.', 'O teu contexto. Tu escolhes.', 'Ton contexte. Ton choix.', 'Il tuo contesto. La tua scelta.', 'Dein Kontext. Deine Wahl.')}</p>
      {connect ? <ChatGPTConsent key={location.search} /> : <FinancialContextPanel onSignIn={signIn} initialDraftId={initialDraft && uuid.test(initialDraft) ? initialDraft : undefined} />}
    </div>
  </KineticShell>;
}
