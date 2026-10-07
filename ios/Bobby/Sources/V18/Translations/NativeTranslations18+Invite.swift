import Foundation

extension NativeTranslations18 {
    /// Invitations: the link, the code, the claim.
    static let invite: [String: [String: String]] = {
        var result: [String: [String: String]] = [:]
        // The nudge on the glass (46 characters at most for the line, 22 for the button).
        result["A friend invited you to Bobby"] = ["fr": "Un ami t'a invité sur Bobby", "pt": "Um amigo convidou-te para o Bobby", "it": "Un amico ti ha invitato su Bobby", "de": "Ein Freund hat dich zu Bobby eingeladen"]
        result["Accept"] = ["fr": "Accepter", "pt": "Aceitar", "it": "Accetta", "de": "Annehmen"]
        // The answer to an invitation claimed with an account, on the glass (same limits).
        result["The invitation you received was accepted"] = ["fr": "L'invitation reçue a été acceptée", "pt": "O convite que recebeste foi aceite", "it": "L'invito ricevuto è stato accettato", "de": "Die erhaltene Einladung wurde angenommen"]
        result["The invitation you received was not accepted"] = ["fr": "L'invitation reçue n'a pas été acceptée", "pt": "O convite que recebeste não foi aceite", "it": "L'invito ricevuto non è stato accettato", "de": "Die erhaltene Einladung wurde nicht angenommen"]
        result["See details"] = ["fr": "Voir les détails", "pt": "Ver detalhes", "it": "Vedi i dettagli", "de": "Details ansehen"]
        result["See why"] = ["fr": "Voir pourquoi", "pt": "Ver porquê", "it": "Vedi perché", "de": "Grund ansehen"]
        // What the claim answered, in words.
        result["Invitation accepted. It counts for the friend who invited you."] = ["fr": "Invitation acceptée. Elle compte pour l'ami qui t'a invité.", "pt": "Convite aceite. Conta para o amigo que te convidou.", "it": "Invito accettato. Vale per l'amico che ti ha invitato.", "de": "Einladung angenommen. Sie zählt für den Freund, der dich eingeladen hat."]
        result["That is your own invitation."] = ["fr": "C'est ta propre invitation.", "pt": "Esse é o teu próprio convite.", "it": "Questo è il tuo stesso invito.", "de": "Das ist deine eigene Einladung."]
        result["Invitations work for new accounts, during their first week."] = ["fr": "Les invitations fonctionnent pour les nouveaux comptes, pendant leur première semaine.", "pt": "Os convites funcionam para contas novas, durante a primeira semana.", "it": "Gli inviti valgono per i nuovi account, durante la prima settimana.", "de": "Einladungen gelten für neue Konten in ihrer ersten Woche."]
        result["This account already accepted an invitation."] = ["fr": "Ce compte a déjà accepté une invitation.", "pt": "Esta conta já aceitou um convite.", "it": "Questo account ha già accettato un invito.", "de": "Dieses Konto hat bereits eine Einladung angenommen."]
        result["Your friend already invited all the friends allowed."] = ["fr": "Ton ami a déjà invité tous les amis autorisés.", "pt": "O teu amigo já convidou todos os amigos permitidos.", "it": "Il tuo amico ha già invitato tutti gli amici consentiti.", "de": "Dein Freund hat bereits alle erlaubten Freunde eingeladen."]
        result["That invitation code is not valid."] = ["fr": "Ce code d'invitation n'est pas valide.", "pt": "Esse código de convite não é válido.", "it": "Questo codice d'invito non è valido.", "de": "Dieser Einladungscode ist nicht gültig."]
        result["That invitation could not be applied."] = ["fr": "Cette invitation n'a pas pu être appliquée.", "pt": "Não foi possível aplicar esse convite.", "it": "Non è stato possibile applicare questo invito.", "de": "Diese Einladung konnte nicht angewendet werden."]
        result["Sign in to accept an invitation."] = ["fr": "Connecte-toi pour accepter une invitation.", "pt": "Inicia sessão para aceitar um convite.", "it": "Accedi per accettare un invito.", "de": "Melde dich an, um eine Einladung anzunehmen."]
        result["Bobby could not check that code right now. It is saved and will be tried again."] = ["fr": "Bobby n'a pas pu vérifier ce code pour l'instant. Il est enregistré et sera réessayé.", "pt": "O Bobby não conseguiu verificar esse código agora. Fica guardado e será tentado de novo.", "it": "Bobby non è riuscito a verificare questo codice ora. È salvato e verrà riprovato.", "de": "Bobby konnte diesen Code gerade nicht prüfen. Er ist gespeichert und wird erneut versucht."]
        // The invite sheet: accepting a friend's invitation.
        result["Invitation code"] = ["fr": "Code d'invitation", "pt": "Código de convite", "it": "Codice d'invito", "de": "Einladungscode"]
        result["Apply"] = ["fr": "Appliquer", "pt": "Aplicar", "it": "Applica", "de": "Anwenden"]
        result["Applying…"] = ["fr": "Vérification…", "pt": "A aplicar…", "it": "Verifica in corso…", "de": "Wird angewendet…"]
        result["Remove the saved invitation"] = ["fr": "Retirer l'invitation enregistrée", "pt": "Remover o convite guardado", "it": "Rimuovi l'invito salvato", "de": "Gespeicherte Einladung entfernen"]
        // The invite sheet: the person's own code.
        result["Your invitation code"] = ["fr": "Ton code d'invitation", "pt": "O teu código de convite", "it": "Il tuo codice d'invito", "de": "Dein Einladungscode"]
        result["Copy code"] = ["fr": "Copier le code", "pt": "Copiar código", "it": "Copia codice", "de": "Code kopieren"]
        result["You get {0} days of Bobby Pro for each friend who creates an account with your invitation, up to {1} friends."] = ["fr": "Tu reçois {0} jours de Bobby Pro pour chaque ami qui crée un compte avec ton invitation, jusqu'à {1} amis.", "pt": "Recebes {0} dias de Bobby Pro por cada amigo que cria conta com o teu convite, até {1} amigos.", "it": "Ricevi {0} giorni di Bobby Pro per ogni amico che crea un account con il tuo invito, fino a {1} amici.", "de": "Du bekommst {0} Tage Bobby Pro für jeden Freund, der mit deiner Einladung ein Konto erstellt, für bis zu {1} Freunde."]
        result["My invitation code: {0}"] = ["fr": "Mon code d'invitation : {0}", "pt": "O meu código de convite: {0}", "it": "Il mio codice d'invito: {0}", "de": "Mein Einladungscode: {0}"]
        result["Getting your link…"] = ["fr": "Récupération de ton lien…", "pt": "A obter o teu link…", "it": "Recupero del tuo link…", "de": "Dein Link wird geladen…"]
        result["Have a code?"] = ["fr": "Tu as un code ?", "pt": "Tens um código?", "it": "Hai un codice?", "de": "Hast du einen Code?"]
        result["Invitation ready"] = ["fr": "Invitation en attente", "pt": "Convite pendente", "it": "Invito in attesa", "de": "Einladung wartet"]
        result["Invite link unavailable."] = ["fr": "Lien d'invitation indisponible.", "pt": "Link de convite indisponível.", "it": "Link di invito non disponibile.", "de": "Einladungslink nicht verfügbar."]
        result["New accounts only, within their first week."] = ["fr": "Nouveaux comptes uniquement, pendant leur première semaine.", "pt": "Só contas novas, durante a primeira semana.", "it": "Solo nuovi account, durante la prima settimana.", "de": "Nur neue Konten, in ihrer ersten Woche."]
        result["Saved on this iPhone."] = ["fr": "Enregistrée sur cet iPhone.", "pt": "Guardado neste iPhone.", "it": "Salvato su questo iPhone.", "de": "Auf diesem iPhone gespeichert."]
        result["Share"] = ["fr": "Partager", "pt": "Partilhar", "it": "Condividi", "de": "Teilen"]
        result["Sign in for your link."] = ["fr": "Connecte-toi pour obtenir ton lien.", "pt": "Inicia sessão para teres o teu link.", "it": "Accedi per avere il tuo link.", "de": "Melde dich an, um deinen Link zu erhalten."]
        result["You get {0} Pro days per new account."] = ["fr": "Tu reçois {0} jours Pro par nouveau compte.", "pt": "Recebes {0} dias Pro por cada conta nova.", "it": "Ricevi {0} giorni Pro per ogni nuovo account.", "de": "Du erhältst {0} Pro-Tage pro neuem Konto."]
        return result
    }()
}
