import { useState, type FormEvent } from 'react';
import { Helmet } from 'react-helmet-async';
import KineticShell from '@/components/kinetic/KineticShell';
import { lang, LANGS, LANG_NAME, translateText, type Lang } from '@/lib/companions/i18n';
import { appLanguage, appLocale, isAppLanguage } from '@/lib/app-language';
import { clientLanguagePath, clientLocale } from '@/lib/client-language';
import { sendSupportRequest } from '@/pages/BobbySupportPage';

// The deletion receipt explains a private request, never completed deletion or cancelled billing.
const DELETION_COPY: Record<string, Record<'fr' | 'pt' | 'it' | 'de', string>> = {
  "Delete your Bobby account": {
    "fr": "Supprimer votre compte Bobby",
    "pt": "Eliminar a tua conta Bobby",
    "it": "Elimina il tuo account Bobby",
    "de": "Dein Bobby-Konto löschen"
  },
  "Language": {
    "fr": "Langue",
    "pt": "Idioma",
    "it": "Lingua",
    "de": "Sprache"
  },
  "Request deletion of your Bobby account and its associated data here, even if you no longer have the app. This private request does not require a new account or a public GitHub issue.": {
    "fr": "Demandez ici la suppression de votre compte Bobby et de ses données associées, même si vous n’avez plus l’application. Cette demande privée ne nécessite ni nouveau compte ni ticket GitHub public.",
    "pt": "Pede aqui a eliminação da tua conta Bobby e dos dados associados, mesmo que já não tenhas a aplicação. Este pedido privado não exige uma conta nova nem uma issue pública no GitHub.",
    "it": "Richiedi qui l’eliminazione del tuo account Bobby e dei dati associati, anche se non hai più l’app. Questa richiesta privata non richiede un nuovo account né una issue pubblica su GitHub.",
    "de": "Beantrage hier die Löschung deines Bobby-Kontos und der zugehörigen Daten, auch wenn du die App nicht mehr hast. Diese private Anfrage erfordert weder ein neues Konto noch einen öffentlichen GitHub-Issue."
  },
  "What deletion means": {
    "fr": "Ce que signifie la suppression",
    "pt": "O que significa eliminar",
    "it": "Cosa comporta l’eliminazione",
    "de": "Was die Löschung bedeutet"
  },
  "Account deletion removes the Bobby account, synced progress, Trader Land account data, memory and account-linked briefing records. Public blockchain transactions cannot be erased. Limited records needed for security, fraud prevention, audit, legal compliance or disputes may remain under the retention terms in the privacy policy. Providers may retain operational data under their own terms.": {
    "fr": "La suppression efface le compte Bobby, la progression synchronisée, les données de compte Trader Land, la mémoire et les dossiers de briefings liés au compte. Les transactions publiques sur la blockchain ne peuvent pas être effacées. Des dossiers limités nécessaires à la sécurité, à la prévention de la fraude, à l’audit, au respect de la loi ou aux litiges peuvent être conservés selon les conditions de la politique de confidentialité. Les fournisseurs peuvent conserver des données opérationnelles selon leurs propres conditions.",
    "pt": "A eliminação remove a conta Bobby, o progresso sincronizado, os dados da conta Trader Land, a memória e os registos de briefings ligados à conta. As transações públicas na blockchain não podem ser apagadas. Podem permanecer registos limitados necessários para segurança, prevenção de fraude, auditoria, cumprimento legal ou litígios, de acordo com os termos de conservação da política de privacidade. Os fornecedores podem conservar dados operacionais segundo os seus próprios termos.",
    "it": "L’eliminazione rimuove l’account Bobby, i progressi sincronizzati, i dati dell’account Trader Land, la memoria e i registri dei briefing collegati all’account. Le transazioni pubbliche sulla blockchain non possono essere cancellate. Possono essere conservati registri limitati necessari per sicurezza, prevenzione delle frodi, audit, obblighi di legge o controversie secondo i termini dell’informativa privacy. I fornitori possono conservare dati operativi secondo i propri termini.",
    "de": "Die Löschung entfernt das Bobby-Konto, synchronisierte Fortschritte, Trader-Land-Kontodaten, die Memory-Daten und mit dem Konto verknüpfte Briefing-Aufzeichnungen. Öffentliche Blockchain-Transaktionen können nicht gelöscht werden. Begrenzte Aufzeichnungen für Sicherheit, Betrugsprävention, Audit, gesetzliche Pflichten oder Streitfälle können gemäß den Aufbewahrungsbedingungen der Datenschutzerklärung erhalten bleiben. Anbieter können Betriebsdaten nach ihren eigenen Bedingungen aufbewahren."
  },
  "Where Bobby applies Google Play and website card purchase checks, limited private purchase records remain after the account link is removed, to reconcile payments, prevent duplicate charges and resolve disputes. Unresolved purchases can retain encrypted Google Play purchase tokens and card Checkout request details. Verified terminal outcomes remove those encrypted tokens and full Checkout details; limited hashed ownership, provider references and verification evidence remain without an automatic deletion deadline in this protocol. See the privacy policy for the retained data and use the private form below for a retention request.": {
    "fr": "Lorsque Bobby applique des contrôles d’achat Google Play et par carte sur le site, des dossiers privés limités restent après le retrait du lien avec le compte, pour rapprocher les paiements, éviter les doubles débits et résoudre les litiges. Les achats non résolus peuvent conserver des jetons d’achat Google Play chiffrés et les détails des demandes Checkout par carte. Les résultats terminaux vérifiés suppriment ces jetons chiffrés et les détails Checkout complets ; les éléments limités de propriété hachée, les références fournisseur et les preuves de vérification restent sans délai automatique de suppression défini par ce protocole. Consultez les données conservées dans la politique de confidentialité et utilisez le formulaire privé ci-dessous pour une demande de conservation.",
    "pt": "Quando Bobby aplica verificações de compras Google Play e por cartão no site, ficam registos privados limitados após a remoção da ligação à conta, para reconciliar pagamentos, evitar cobranças duplicadas e resolver litígios. Compras por resolver podem conservar tokens de compra Google Play cifrados e detalhes dos pedidos Checkout por cartão. Resultados terminais verificados removem esses tokens cifrados e os detalhes completos do Checkout; os registos limitados de titularidade com hash, referências do fornecedor e provas de verificação ficam sem um prazo automático de eliminação definido neste protocolo. Consulta os dados conservados na política de privacidade e usa o formulário privado abaixo para um pedido sobre conservação.",
    "it": "Quando Bobby applica controlli sugli acquisti Google Play e con carta sul sito, alcuni registri privati limitati restano dopo la rimozione del collegamento all’account, per riconciliare i pagamenti, evitare addebiti duplicati e risolvere controversie. Gli acquisti irrisolti possono conservare token Google Play cifrati e dettagli delle richieste Checkout con carta. Gli esiti terminali verificati eliminano quei token cifrati e i dettagli completi di Checkout; i dati limitati di titolarità con hash, i riferimenti del fornitore e le prove di verifica restano senza una scadenza automatica di eliminazione definita da questo protocollo. Consulta i dati conservati nell’informativa privacy e usa il modulo privato qui sotto per richieste sulla conservazione.",
    "de": "Wenn Bobby Google-Play- und Kartenkäufe auf der Website prüft, bleiben begrenzte private Kaufaufzeichnungen nach dem Entfernen der Kontoverknüpfung erhalten, um Zahlungen abzugleichen, doppelte Belastungen zu verhindern und Streitfälle zu lösen. Ungeklärte Käufe können verschlüsselte Google-Play-Kauftokens und Angaben zur Karten-Checkout-Anfrage behalten. Verifizierte endgültige Ergebnisse entfernen diese verschlüsselten Tokens und vollständigen Checkout-Angaben; begrenzte gehashte Eigentumsdaten, Anbieterreferenzen und Verifizierungsnachweise bleiben ohne eine in diesem Protokoll festgelegte automatische Löschfrist erhalten. Siehe die gespeicherten Daten in der Datenschutzerklärung und nutze das private Formular unten für eine Anfrage zur Aufbewahrung."
  },
  "Deleting Bobby does not cancel Google Play or Apple subscriptions; manage them separately with the purchasing store account. For directly billed website-card subscriptions, the in-app deletion service attempts to stop open Checkout and card billing before removing the account; a potentially chargeable card operation whose closure cannot be confirmed can prevent deletion. Other billing providers need their own management process. You can submit this private request before cancelling; receiving it does not cancel billing or confirm completed deletion.": {
    "fr": "Supprimer Bobby n’annule pas les abonnements Google Play ou Apple ; gérez-les séparément avec le compte du magasin ayant effectué l’achat. Pour les abonnements du site facturés directement par carte, le service de suppression dans l’application tente d’arrêter les sessions Checkout ouvertes et la facturation par carte avant de retirer le compte ; une opération par carte pouvant encore être débitée et dont la clôture ne peut pas être confirmée peut empêcher la suppression. Les autres fournisseurs de facturation nécessitent leur propre procédure. Vous pouvez envoyer cette demande privée avant d’annuler ; sa réception n’annule pas la facturation et ne confirme pas une suppression terminée.",
    "pt": "Eliminar Bobby não cancela subscrições Google Play ou Apple; gere-as separadamente com a conta da loja que fez a compra. Nas subscrições do site cobradas diretamente por cartão, o serviço de eliminação na aplicação tenta parar sessões Checkout abertas e a cobrança por cartão antes de remover a conta; uma operação por cartão que ainda possa cobrar e cujo encerramento não seja confirmado pode impedir a eliminação. Outros fornecedores de faturação precisam do seu próprio processo. Podes enviar este pedido privado antes de cancelar; recebê-lo não cancela a faturação nem confirma a eliminação concluída.",
    "it": "Eliminare Bobby non annulla gli abbonamenti Google Play o Apple; gestiscili separatamente con l’account del negozio che ha acquistato. Per gli abbonamenti del sito fatturati direttamente con carta, il servizio di eliminazione nell’app tenta di fermare le sessioni Checkout aperte e la fatturazione con carta prima di rimuovere l’account; un’operazione con carta ancora addebitabile e di cui non si può confermare la chiusura può impedire l’eliminazione. Gli altri fornitori di fatturazione richiedono il proprio processo. Puoi inviare questa richiesta privata prima di annullare; riceverla non annulla la fatturazione e non conferma l’eliminazione completata.",
    "de": "Das Löschen von Bobby kündigt keine Google-Play- oder Apple-Abonnements; verwalte sie separat über das Store-Konto, das den Kauf vorgenommen hat. Bei direkt per Karte abgerechneten Website-Abonnements versucht der Löschdienst in der App, offene Checkout-Sitzungen und Kartenabrechnungen vor dem Entfernen des Kontos zu stoppen; ein noch belastbarer Kartenvorgang, dessen Abschluss nicht bestätigt werden kann, kann die Löschung verhindern. Andere Abrechnungsanbieter benötigen ihren eigenen Prozess. Du kannst diese private Anfrage vor der Kündigung senden; ihr Eingang kündigt keine Abrechnung und bestätigt keine abgeschlossene Löschung."
  },
  "Google Play subscriptions": {
    "fr": "Abonnements Google Play",
    "pt": "Subscrições Google Play",
    "it": "Abbonamenti Google Play",
    "de": "Google-Play-Abonnements"
  },
  "Apple subscriptions": {
    "fr": "Abonnements Apple",
    "pt": "Subscrições Apple",
    "it": "Abbonamenti Apple",
    "de": "Apple-Abonnements"
  },
  "Privacy and retention": {
    "fr": "Confidentialité et conservation",
    "pt": "Privacidade e conservação",
    "it": "Privacy e conservazione",
    "de": "Datenschutz und Aufbewahrung"
  },
  "Send a private deletion request": {
    "fr": "Envoyer une demande privée de suppression",
    "pt": "Enviar um pedido privado de eliminação",
    "it": "Invia una richiesta privata di eliminazione",
    "de": "Private Löschanfrage senden"
  },
  "Bobby needs enough information to locate your account and verify that it belongs to you before removing account data. Provide the sign-in email or Bobby account identifier and a reply email. Never include passwords, seed phrases, private keys, card numbers or identity documents.": {
    "fr": "Bobby doit disposer d’assez d’informations pour trouver votre compte et vérifier qu’il vous appartient avant de supprimer les données. Indiquez l’adresse de connexion ou l’identifiant Bobby et une adresse de réponse. N’incluez jamais de mots de passe, phrases de récupération, clés privées, numéros de carte ou documents d’identité.",
    "pt": "Bobby precisa de informação suficiente para encontrar a tua conta e verificar que te pertence antes de remover os dados. Indica o email de início de sessão ou o identificador Bobby e um email para resposta. Nunca incluas palavras-passe, frases de recuperação, chaves privadas, números de cartão ou documentos de identificação.",
    "it": "Bobby necessita di informazioni sufficienti per trovare il tuo account e verificarne la titolarità prima di eliminare i dati. Indica l’email di accesso o l’identificativo Bobby e un’email per la risposta. Non includere mai password, frasi di recupero, chiavi private, numeri di carta o documenti d’identità.",
    "de": "Bobby benötigt ausreichende Angaben, um dein Konto zu finden und deine Eigentümerschaft vor dem Entfernen der Daten zu prüfen. Gib die Anmelde-E-Mail oder Bobby-Konto-ID und eine Antwortadresse an. Sende niemals Passwörter, Wiederherstellungsphrasen, private Schlüssel, Kartennummern oder Identitätsdokumente."
  },
  "Bobby sign-in email or account ID": {
    "fr": "Adresse de connexion ou identifiant Bobby",
    "pt": "Email de início de sessão ou ID Bobby",
    "it": "Email di accesso o ID Bobby",
    "de": "Bobby-Anmelde-E-Mail oder Konto-ID"
  },
  "How you signed in": {
    "fr": "Votre méthode de connexion",
    "pt": "Como iniciaste sessão",
    "it": "Come hai effettuato l’accesso",
    "de": "Wie du dich angemeldet hast"
  },
  "Not sure": {
    "fr": "Je ne sais pas",
    "pt": "Não tenho a certeza",
    "it": "Non sono sicuro",
    "de": "Nicht sicher"
  },
  "Website wallet account": {
    "fr": "Compte avec portefeuille du site",
    "pt": "Conta com carteira do site",
    "it": "Account con wallet del sito",
    "de": "Website-Wallet-Konto"
  },
  "Reply email": {
    "fr": "Adresse de réponse",
    "pt": "Email para resposta",
    "it": "Email per la risposta",
    "de": "Antwort-E-Mail"
  },
  "Additional details (optional)": {
    "fr": "Informations supplémentaires (facultatif)",
    "pt": "Detalhes adicionais (opcional)",
    "it": "Dettagli aggiuntivi (facoltativi)",
    "de": "Zusätzliche Angaben (optional)"
  },
  "I request deletion of my Bobby account and associated account data. I understand store subscriptions are managed separately.": {
    "fr": "Je demande la suppression de mon compte Bobby et des données de compte associées. Je comprends que les abonnements des magasins sont gérés séparément.",
    "pt": "Peço a eliminação da minha conta Bobby e dos dados de conta associados. Compreendo que as subscrições das lojas são geridas separadamente.",
    "it": "Richiedo l’eliminazione del mio account Bobby e dei dati associati. Comprendo che gli abbonamenti dei negozi vengono gestiti separatamente.",
    "de": "Ich beantrage die Löschung meines Bobby-Kontos und der zugehörigen Kontodaten. Ich verstehe, dass Store-Abonnements separat verwaltet werden."
  },
  "Sending shares these fields with Bobby’s private support service. A saved receipt confirms the request was received; it does not mean deletion is complete. If we cannot confirm the request was saved, it remains here for you to retry.": {
    "fr": "L’envoi partage ces champs avec le service d’assistance privé de Bobby. Un reçu enregistré confirme la réception de la demande ; il ne signifie pas que la suppression est terminée. Si nous ne pouvons pas confirmer l’enregistrement, la demande reste ici pour que vous puissiez réessayer.",
    "pt": "Ao enviar, partilhas estes campos com o serviço privado de apoio Bobby. Um recibo guardado confirma que o pedido foi recebido; não significa que a eliminação esteja concluída. Se não pudermos confirmar que foi guardado, o pedido fica aqui para tentares novamente.",
    "it": "L’invio condivide questi campi con il servizio di assistenza privato di Bobby. Una ricevuta salvata conferma la ricezione della richiesta; non significa che l’eliminazione sia completata. Se non possiamo confermarne il salvataggio, la richiesta resta qui per poter riprovare.",
    "de": "Beim Senden werden diese Felder mit Bobbys privatem Support geteilt. Eine gespeicherte Bestätigung belegt den Eingang der Anfrage; sie bedeutet nicht, dass die Löschung abgeschlossen ist. Wenn wir das Speichern nicht bestätigen können, bleibt die Anfrage zum erneuten Senden hier."
  },
  "Sending…": {
    "fr": "Envoi…",
    "pt": "A enviar…",
    "it": "Invio…",
    "de": "Wird gesendet…"
  },
  "Request account deletion": {
    "fr": "Demander la suppression du compte",
    "pt": "Pedir eliminação da conta",
    "it": "Richiedi l’eliminazione dell’account",
    "de": "Kontolöschung beantragen"
  },
  "Your deletion request was saved privately. Account deletion is not yet confirmed. Bobby must verify ownership and process the request.": {
    "fr": "Votre demande de suppression a été enregistrée en privé. La suppression du compte n’est pas encore confirmée. Bobby doit vérifier la propriété et traiter la demande.",
    "pt": "O teu pedido de eliminação foi guardado em privado. A eliminação da conta ainda não está confirmada. Bobby tem de verificar a titularidade e processar o pedido.",
    "it": "La tua richiesta di eliminazione è stata salvata in privato. L’eliminazione dell’account non è ancora confermata. Bobby deve verificare la titolarità ed elaborare la richiesta.",
    "de": "Deine Löschanfrage wurde privat gespeichert. Die Kontolöschung ist noch nicht bestätigt. Bobby muss die Eigentümerschaft prüfen und die Anfrage bearbeiten."
  },
  "We could not confirm that your request was saved. Your information remains in this form; please try again.": {
    "fr": "Nous n’avons pas pu confirmer l’enregistrement de votre demande. Vos informations restent dans ce formulaire ; veuillez réessayer.",
    "pt": "Não conseguimos confirmar que o teu pedido foi guardado. A tua informação continua neste formulário; tenta novamente.",
    "it": "Non abbiamo potuto confermare il salvataggio della richiesta. Le informazioni restano in questo modulo; riprova.",
    "de": "Wir konnten nicht bestätigen, dass deine Anfrage gespeichert wurde. Deine Angaben bleiben in diesem Formular; versuche es erneut."
  },
  "In the app": {
    "fr": "Dans l’application",
    "pt": "Na aplicação",
    "it": "Nell’app",
    "de": "In der App"
  },
  "Android: open Profile → Delete account → Confirm. For Apple accounts, follow the separate manual Apple revocation instructions after Bobby confirms deletion. If deletion cannot be completed in the app, use the private request above. On iPhone, open Profile → Delete account and confirm; Apple may require a fresh authorization. Signing out or uninstalling does not delete a synced account.": {
    "fr": "Android : ouvrez Profil → Supprimer le compte → Confirmer. Pour les comptes Apple, suivez les instructions séparées de révocation manuelle après la confirmation de suppression par Bobby. Si la suppression ne peut pas être terminée dans l’application, utilisez la demande privée ci-dessus. Sur iPhone, ouvrez Profil → Supprimer le compte et confirmez ; Apple peut exiger une nouvelle autorisation. Se déconnecter ou désinstaller ne supprime pas un compte synchronisé.",
    "pt": "Android: abre Perfil → Eliminar conta → Confirmar. Para contas Apple, segue as instruções separadas de revogação manual depois de Bobby confirmar a eliminação. Se não conseguires concluir na aplicação, usa o pedido privado acima. No iPhone, abre Perfil → Eliminar conta e confirma; Apple pode exigir uma nova autorização. Terminar sessão ou desinstalar não elimina uma conta sincronizada.",
    "it": "Android: apri Profilo → Elimina account → Conferma. Per gli account Apple, segui le istruzioni separate di revoca manuale dopo la conferma di eliminazione da Bobby. Se non riesci a completare nell’app, usa la richiesta privata sopra. Su iPhone, apri Profilo → Elimina account e conferma; Apple potrebbe richiedere una nuova autorizzazione. Uscire o disinstallare non elimina un account sincronizzato.",
    "de": "Android: Öffne Profil → Konto löschen → Bestätigen. Bei Apple-Konten folge den separaten Anweisungen zum manuellen Widerruf, nachdem Bobby die Löschung bestätigt hat. Wenn die Löschung in der App nicht abgeschlossen werden kann, nutze die private Anfrage oben. Öffne auf dem iPhone Profil → Konto löschen und bestätige; Apple kann eine neue Autorisierung verlangen. Abmelden oder Deinstallieren löscht kein synchronisiertes Konto."
  },
  "If Apple access is not revoked automatically, follow Apple’s instructions to stop using Sign in with Apple for Bobby. This step is separate from requesting removal of Bobby account data.": {
    "fr": "Si l’accès Apple n’est pas révoqué automatiquement, suivez les instructions d’Apple pour cesser d’utiliser Se connecter avec Apple pour Bobby. Cette étape est distincte de la demande de suppression des données de compte Bobby.",
    "pt": "Se o acesso Apple não for revogado automaticamente, segue as instruções Apple para deixar de usar Iniciar sessão com Apple para Bobby. Este passo é separado do pedido para remover os dados da conta Bobby.",
    "it": "Se l’accesso Apple non viene revocato automaticamente, segui le istruzioni Apple per smettere di usare Accedi con Apple per Bobby. Questo passaggio è separato dalla richiesta di rimozione dei dati dell’account Bobby.",
    "de": "Wenn der Apple-Zugriff nicht automatisch widerrufen wird, folge Apples Anweisungen, um Mit Apple anmelden für Bobby nicht mehr zu verwenden. Dieser Schritt ist von der Anfrage zur Entfernung der Bobby-Kontodaten getrennt."
  },
  "Apple instructions": {
    "fr": "Instructions Apple",
    "pt": "Instruções Apple",
    "it": "Istruzioni Apple",
    "de": "Apple-Anweisungen"
  },
  "Other support or data requests": {
    "fr": "Autres demandes d’assistance ou de données",
    "pt": "Outros pedidos de apoio ou dados",
    "it": "Altre richieste di assistenza o dati",
    "de": "Andere Support- oder Datenanfragen"
  }
};

export default function BobbyDeleteAccountPage() {
  const requested = new URLSearchParams(window.location.search).get('lang');
  const language: Lang = isAppLanguage(requested?.toLowerCase().split(/[-_]/)[0]) ? appLanguage(requested) : lang();
  const locale = clientLocale();
  const android = new URLSearchParams(window.location.search).get('platform') === 'android';
  const t = (en: string, spanish: string) => language === 'es' ? spanish : language === 'en' ? en : DELETION_COPY[en]?.[language] ?? translateText(language, en);
  const languageLink = (code: Lang) => {
    const query = new URLSearchParams(window.location.search);
    query.set('lang', code); query.set('locale', appLocale(code));
    return '?' + query.toString();
  };
  const [account, setAccount] = useState('');
  const [provider, setProvider] = useState('unknown');
  const [email, setEmail] = useState('');
  const [details, setDetails] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [status, setStatus] = useState<'idle' | 'sending' | 'saved' | 'error'>('idle');
  const canSubmit = confirmed && account.trim().length >= 3 && email.trim().length > 0 && status !== 'sending' && status !== 'saved';
  const fieldClass = 'mt-2 w-full rounded-xl border border-white/15 bg-white/[0.04] px-4 py-3 text-white outline-none focus:border-green-400';

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit) return;
    setStatus('sending');
    try {
      await sendSupportRequest({
        kind: 'account_deletion', language, email,
        message: `Bobby account deletion request\nAccount identifier: ${account.trim()}\nSign-in method: ${provider}\nRequested: delete the Bobby account and associated account data. Store subscriptions are managed separately.\nAdditional details: ${details.trim() || 'None'}`,
      });
      setStatus('saved');
      setAccount(''); setEmail(''); setDetails(''); setConfirmed(false);
    } catch { setStatus('error'); }
  }

  const content = <main className="min-h-screen bg-[#050505] px-4 py-16 text-white sm:px-6">
      <Helmet><title>{t('Delete your Bobby account', 'Borrar tu cuenta Bobby')}</title><html lang={locale} /></Helmet>
      <div className="mx-auto max-w-2xl space-y-8 leading-7">
        <nav aria-label={t('Language', 'Idioma')} className="flex gap-4 font-mono text-[11px] uppercase tracking-[0.14em] text-white/40">
          {LANGS.map(code => <a key={code} href={languageLink(code)} aria-current={language === code ? 'page' : undefined} className={language === code ? 'text-white' : 'hover:text-white'}>{LANG_NAME[code]}</a>)}
        </nav>
        <h1 className="text-4xl md:text-5xl">{t('Delete your Bobby account', 'Borrar tu cuenta Bobby')}</h1>
        <p>{t('Request deletion of your Bobby account and its associated data here, even if you no longer have the app. This private request does not require a new account or a public GitHub issue.', 'Solicita aquí el borrado de tu cuenta Bobby y sus datos asociados, aunque ya no tengas la app. Esta solicitud privada no requiere una cuenta nueva ni un issue público en GitHub.')}</p>

        <section className="space-y-3" aria-labelledby="deletion-scope">
          <h2 id="deletion-scope" className="text-xl">{t('What deletion means', 'Qué implica el borrado')}</h2>
          <p>{t('Account deletion removes the Bobby account, synced progress, Trader Land account data, memory and account-linked briefing records. Public blockchain transactions cannot be erased. Limited records needed for security, fraud prevention, audit, legal compliance or disputes may remain under the retention terms in the privacy policy. Providers may retain operational data under their own terms.', 'El borrado elimina la cuenta Bobby, progreso sincronizado, datos de cuenta de Trader Land, memoria e informes vinculados a la cuenta. Las transacciones públicas de blockchain no pueden borrarse. Pueden permanecer los registros limitados necesarios por seguridad, prevención de fraude, auditoría, cumplimiento legal o disputas, según los plazos del aviso de privacidad. Los proveedores pueden conservar datos operativos según sus términos.')}</p>
          <p>{t('Where Bobby applies Google Play and website card purchase checks, limited private purchase records remain after the account link is removed, to reconcile payments, prevent duplicate charges and resolve disputes. Unresolved purchases can retain encrypted Google Play purchase tokens and card Checkout request details. Verified terminal outcomes remove those encrypted tokens and full Checkout details; limited hashed ownership, provider references and verification evidence remain without an automatic deletion deadline in this protocol. See the privacy policy for the retained data and use the private form below for a retention request.', 'Cuando Bobby aplica controles de compra de Google Play y tarjeta del sitio web, conserva registros privados limitados de compra después de eliminar el vínculo con la cuenta, para conciliar pagos, evitar cargos duplicados y resolver disputas. Las compras sin resolver pueden conservar tokens Google Play cifrados y detalles de la solicitud de Checkout con tarjeta. Los resultados finales verificados eliminan esos tokens cifrados y el detalle completo de Checkout; las referencias limitadas de titularidad protegidas con hash, proveedor y verificación permanecen sin un plazo de borrado automático definido en este protocolo. Consulta los datos conservados en el aviso de privacidad y usa el formulario privado de abajo para una solicitud sobre su conservación.')}</p>
          <p>{t('Deleting Bobby does not cancel Google Play or Apple subscriptions; manage them separately with the purchasing store account. For directly billed website-card subscriptions, the in-app deletion service attempts to stop open Checkout and card billing before removing the account; a potentially chargeable card operation whose closure cannot be confirmed can prevent deletion. Other billing providers need their own management process. You can submit this private request before cancelling; receiving it does not cancel billing or confirm completed deletion.', 'Borrar Bobby no cancela las suscripciones de Google Play o Apple; adminístralas por separado con la cuenta de la tienda que compró. En las suscripciones del sitio web cobradas directamente con tarjeta, el servicio de borrado de la app intenta detener Checkout abierto y el cobro antes de eliminar la cuenta; una operación con tarjeta que aún pueda cobrar y cuyo cierre no se confirme puede impedir el borrado. Otros proveedores de cobro necesitan su propio proceso de administración. Puedes enviar esta solicitud privada antes de cancelar; recibirla no cancela la facturación ni confirma que el borrado terminó.')}</p>
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            <a className="underline underline-offset-4" href="https://play.google.com/store/account/subscriptions" target="_blank" rel="noopener noreferrer">{t('Google Play subscriptions', 'Suscripciones de Google Play')}</a>
            <a className="underline underline-offset-4" href="https://support.apple.com/en-us/118428" target="_blank" rel="noopener noreferrer">{t('Apple subscriptions', 'Suscripciones de Apple')}</a>
            <a className="underline underline-offset-4" href={clientLanguagePath(android ? '/privacy?platform=android' : '/privacy')}>{t('Privacy and retention', 'Privacidad y conservación')}</a>
          </div>
        </section>

        <section id="request" className="space-y-3" aria-labelledby="deletion-request">
          <h2 id="deletion-request" className="text-xl">{t('Send a private deletion request', 'Enviar una solicitud privada de borrado')}</h2>
          <p>{t('Bobby needs enough information to locate your account and verify that it belongs to you before removing account data. Provide the sign-in email or Bobby account identifier and a reply email. Never include passwords, seed phrases, private keys, card numbers or identity documents.', 'Bobby necesita localizar tu cuenta y comprobar que te pertenece antes de eliminar datos de cuenta. Indica el correo de inicio de sesión o identificador de cuenta Bobby y un correo para responderte. Nunca incluyas contraseñas, frases semilla, llaves privadas, números de tarjeta ni documentos de identidad.')}</p>
          <form onSubmit={submit} className="space-y-4 rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5">
            <label className="block" htmlFor="delete-account-id">{t('Bobby sign-in email or account ID', 'Correo de inicio de sesión o ID de cuenta Bobby')}
              <input id="delete-account-id" className={fieldClass} value={account} onChange={event => setAccount(event.target.value)} required minLength={3} maxLength={200} autoComplete="off" disabled={status === 'sending' || status === 'saved'} />
            </label>
            <label className="block" htmlFor="delete-account-provider">{t('How you signed in', 'Cómo iniciaste sesión')}
              <select id="delete-account-provider" className={fieldClass} value={provider} onChange={event => setProvider(event.target.value)} disabled={status === 'sending' || status === 'saved'}>
                <option value="unknown">{t('Not sure', 'No estoy seguro')}</option><option value="google">Google</option><option value="apple">Apple</option><option value="wallet">{t('Website wallet account', 'Cuenta de wallet del sitio web')}</option>
              </select>
            </label>
            <label className="block" htmlFor="delete-account-reply">{t('Reply email', 'Correo para responderte')}
              <input id="delete-account-reply" type="email" className={fieldClass} value={email} onChange={event => setEmail(event.target.value)} required maxLength={200} autoComplete="email" disabled={status === 'sending' || status === 'saved'} />
            </label>
            <label className="block" htmlFor="delete-account-details">{t('Additional details (optional)', 'Detalles adicionales (opcionales)')}
              <textarea id="delete-account-details" className={fieldClass} rows={3} value={details} onChange={event => setDetails(event.target.value)} maxLength={1000} disabled={status === 'sending' || status === 'saved'} />
            </label>
            <label className="flex items-start gap-3" htmlFor="delete-account-confirm">
              <input id="delete-account-confirm" type="checkbox" className="mt-2 h-4 w-4 shrink-0 accent-green-400" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} required disabled={status === 'sending' || status === 'saved'} />
              <span>{t('I request deletion of my Bobby account and associated account data. I understand store subscriptions are managed separately.', 'Solicito el borrado de mi cuenta Bobby y datos de cuenta asociados. Entiendo que las suscripciones se administran por separado.')}</span>
            </label>
            <p className="text-sm text-white/60">{t('Sending shares these fields with Bobby’s private support service. A saved receipt confirms the request was received; it does not mean deletion is complete. If we cannot confirm the request was saved, it remains here for you to retry.', 'Al enviar, compartes estos campos con el servicio privado de soporte de Bobby. El recibo confirma que se recibió la solicitud; no significa que el borrado esté completo. Si no podemos confirmar que se guardó, la solicitud queda aquí para que lo intentes de nuevo.')}</p>
            <button type="submit" disabled={!canSubmit} className="min-h-12 rounded-xl bg-green-400 px-5 py-3 font-semibold text-[#050505] disabled:opacity-50">{status === 'sending' ? t('Sending…', 'Enviando…') : t('Request account deletion', 'Solicitar borrado de cuenta')}</button>
            <p role={status === 'error' ? 'alert' : 'status'} aria-live="polite" className={status === 'error' ? 'text-red-300' : 'text-green-300'}>
              {status === 'saved' ? t('Your deletion request was saved privately. Account deletion is not yet confirmed. Bobby must verify ownership and process the request.', 'Tu solicitud de borrado se guardó de forma privada. El borrado de cuenta todavía no está confirmado. Bobby debe verificar la titularidad y procesar la solicitud.') : status === 'error' ? t('We could not confirm that your request was saved. Your information remains in this form; please try again.', 'No pudimos confirmar que se guardara tu solicitud. Tu información sigue en este formulario; vuelve a intentarlo.') : ''}
            </p>
          </form>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl">{t('In the app', 'Desde la app')}</h2>
          <p>{t('Android: open Profile → Delete account → Confirm. For Apple accounts, follow the separate manual Apple revocation instructions after Bobby confirms deletion. If deletion cannot be completed in the app, use the private request above. On iPhone, open Profile → Delete account and confirm; Apple may require a fresh authorization. Signing out or uninstalling does not delete a synced account.', 'Android: abre Perfil → Eliminar cuenta → Confirmar. En cuentas Apple, sigue las instrucciones separadas de revocación manual después de que Bobby confirme el borrado. Si no puedes completarlo en la app, usa la solicitud privada de arriba. En iPhone, abre Perfil → Borrar cuenta y confirma; Apple puede pedir una autorización nueva. Cerrar sesión o desinstalar no borra una cuenta sincronizada.')}</p>
          <p>{t('If Apple access is not revoked automatically, follow Apple’s instructions to stop using Sign in with Apple for Bobby. This step is separate from requesting removal of Bobby account data.', 'Si el acceso de Apple no se revoca automáticamente, sigue las instrucciones de Apple para dejar de usar Iniciar sesión con Apple para Bobby. Este paso es independiente de solicitar el borrado de los datos de cuenta Bobby.')} <a href="https://support.apple.com/en-us/102571" className="underline underline-offset-4" target="_blank" rel="noopener noreferrer">{t('Apple instructions', 'Instrucciones de Apple')}</a></p>
          <a href={clientLanguagePath(android ? '/support?platform=android#contact' : '/support#contact')} className="underline underline-offset-4">{t('Other support or data requests', 'Otras solicitudes de soporte o datos')}</a>
        </section>
      </div>
    </main>;
  return android ? <div className="min-h-screen bg-[#050505] text-white"><header className="border-b border-white/[0.06] px-6 py-4 font-mono text-sm">Bobby</header>{content}</div> : <KineticShell activeTab="terminal" minimalNav showTicker={false} showStatus={false} nucleo>{content}</KineticShell>;
}
