import Foundation

extension NativeTranslations18 {
    /// Reminders: the offer, the schedule, the notification text.
    /// The screen's title, "Reminders", is not here on purpose: it is one of the two shared strings
    /// the lead adds to `NativeTranslations18.shared` at merge.
    static let reminders: [String: [String: String]] = {
        var result: [String: [String: String]] = [:]
        result["A reminder is a note to yourself: on the day you choose, Bobby reminds you to review a thesis. Bobby does not watch the market for you."] = ["fr": "Un rappel est une note pour toi : le jour que tu choisis, Bobby te rappelle de revoir une thèse. Bobby ne surveille pas le marché à ta place.", "pt": "Um lembrete é uma nota para ti: no dia que escolheres, o Bobby lembra-te de rever uma tese. O Bobby não vigia o mercado por ti.", "it": "Un promemoria è una nota per te: nel giorno che scegli, Bobby ti ricorda di rivedere una tesi. Bobby non sorveglia il mercato al posto tuo.", "de": "Eine Erinnerung ist eine Notiz an dich selbst: An dem Tag, den du wählst, erinnert Bobby dich daran, eine These zu überprüfen. Bobby beobachtet den Markt nicht für dich."]
        result["Day and time"] = ["fr": "Jour et heure", "pt": "Dia e hora", "it": "Giorno e ora", "de": "Tag und Uhrzeit"]
        result["In 3 days"] = ["fr": "Dans 3 jours", "pt": "Daqui a 3 dias", "it": "Tra 3 giorni", "de": "In 3 Tagen"]
        result["In a month"] = ["fr": "Dans un mois", "pt": "Daqui a um mês", "it": "Tra un mese", "de": "In einem Monat"]
        result["In a week"] = ["fr": "Dans une semaine", "pt": "Daqui a uma semana", "it": "Tra una settimana", "de": "In einer Woche"]
        result["Included with Bobby Pro. It is off for now."] = ["fr": "Inclus avec Bobby Pro. Il est désactivé pour l’instant.", "pt": "Incluído no Bobby Pro. Por agora está desligado.", "it": "Incluso in Bobby Pro. Per ora è disattivato.", "de": "In Bobby Pro enthalten. Im Moment ist er aus."]
        result["Keep this day"] = ["fr": "Garder ce jour", "pt": "Manter este dia", "it": "Tieni questo giorno", "de": "Diesen Tag behalten"]
        result["Monday briefing"] = ["fr": "Bilan du lundi", "pt": "Resumo de segunda", "it": "Riepilogo del lunedì", "de": "Montagsbericht"]
        result["Notifications are off for Bobby in iOS Settings."] = ["fr": "Les notifications de Bobby sont désactivées dans les Réglages iOS.", "pt": "As notificações do Bobby estão desligadas nas Definições do iOS.", "it": "Le notifiche di Bobby sono disattivate nelle Impostazioni di iOS.", "de": "Mitteilungen für Bobby sind in den iOS-Einstellungen aus."]
        result["Notes to yourself to review a thesis"] = ["fr": "Des notes pour toi pour revoir une thèse", "pt": "Notas para ti para rever uma tese", "it": "Note per te per rivedere una tesi", "de": "Notizen an dich, um eine These zu überprüfen"]
        result["Pick a day"] = ["fr": "Choisir un jour", "pt": "Escolher um dia", "it": "Scegli un giorno", "de": "Tag wählen"]
        result["Remind me"] = ["fr": "Rappelle-le-moi", "pt": "Lembra-me", "it": "Ricordamelo", "de": "Erinnere mich"]
        result["Remind me then"] = ["fr": "Rappelle-le-moi ce jour-là", "pt": "Lembra-me nesse dia", "it": "Ricordamelo quel giorno", "de": "Erinnere mich dann"]
        result["Reminder on {0}"] = ["fr": "Rappel le {0}", "pt": "Lembrete a {0}", "it": "Promemoria il {0}", "de": "Erinnerung am {0}"]
        result["Reminders are for theses you wrote. Write one after your next read."] = ["fr": "Les rappels sont pour les thèses que tu as écrites. Écris-en une après ta prochaine analyse.", "pt": "Os lembretes são para as teses que escreveste. Escreve uma depois da tua próxima análise.", "it": "I promemoria sono per le tesi che hai scritto. Scrivine una dopo la tua prossima analisi.", "de": "Erinnerungen sind für Thesen, die du geschrieben hast. Schreib eine nach deiner nächsten Analyse."]
        result["Remove"] = ["fr": "Retirer", "pt": "Remover", "it": "Rimuovi", "de": "Entfernen"]
        result["Set a reminder"] = ["fr": "Créer un rappel", "pt": "Criar um lembrete", "it": "Imposta un promemoria", "de": "Erinnerung einrichten"]
        result["The reminder could not be set. Try again."] = ["fr": "Le rappel n’a pas pu être créé. Réessaie.", "pt": "Não foi possível criar o lembrete. Tenta outra vez.", "it": "Non è stato possibile impostare il promemoria. Riprova.", "de": "Die Erinnerung konnte nicht eingerichtet werden. Versuch es noch einmal."]
        result["Turn it on"] = ["fr": "L’activer", "pt": "Ativar", "it": "Attivalo", "de": "Einschalten"]
        result["Want a reminder to review it?"] = ["fr": "Tu veux un rappel pour la revoir ?", "pt": "Queres um lembrete para a rever?", "it": "Vuoi un promemoria per rivederla?", "de": "Soll ich dich ans Überprüfen erinnern?"]
        result["You asked me to remind you to review a thesis. This is your reminder, not a market alert."] = ["fr": "Tu m’as demandé de te rappeler de revoir une thèse. Voici ton rappel, ce n’est pas une alerte de marché.", "pt": "Pediste-me para te lembrar de rever uma tese. Este é o teu lembrete, não um alerta de mercado.", "it": "Mi hai chiesto di ricordarti di rivedere una tesi. Questo è il tuo promemoria, non un avviso di mercato.", "de": "Du hast mich gebeten, dich an die Überprüfung einer These zu erinnern. Das ist deine Erinnerung, keine Marktwarnung."]
        result["Your Monday briefing is included"] = ["fr": "Ton bilan du lundi est inclus", "pt": "O teu resumo de segunda está incluído", "it": "Il tuo riepilogo del lunedì è incluso", "de": "Dein Montagsbericht ist inklusive"]
        return result
    }()
}
