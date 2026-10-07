import Foundation

extension NativeTranslations18 {
    /// Reminders: the offer, the schedule, the notification text.
    /// The screen's title, "Reminders", is not here on purpose: it is one of the two shared strings
    /// the lead adds to `NativeTranslations18.shared` at merge.
    static let reminders: [String: [String: String]] = {
        var result: [String: [String: String]] = [:]
        result["Day and time"] = ["fr": "Jour et heure", "pt": "Dia e hora", "it": "Giorno e ora", "de": "Tag und Uhrzeit"]
        result["Included with Bobby Pro. It is off for now."] = ["fr": "Inclus avec Bobby Pro. Il est désactivé pour l’instant.", "pt": "Incluído no Bobby Pro. Por agora está desligado.", "it": "Incluso in Bobby Pro. Per ora è disattivato.", "de": "In Bobby Pro enthalten. Im Moment ist er aus."]
        result["Keep this day"] = ["fr": "Garder ce jour", "pt": "Manter este dia", "it": "Tieni questo giorno", "de": "Diesen Tag behalten"]
        result["Monday briefing"] = ["fr": "Bilan du lundi", "pt": "Resumo de segunda", "it": "Riepilogo del lunedì", "de": "Montagsbericht"]
        result["Notes to yourself to review a thesis"] = ["fr": "Des notes pour toi pour revoir une thèse", "pt": "Notas para ti para rever uma tese", "it": "Note per te per rivedere una tesi", "de": "Notizen an dich, um eine These zu überprüfen"]
        result["Remind me"] = ["fr": "Rappelle-le-moi", "pt": "Lembra-me", "it": "Ricordamelo", "de": "Erinnere mich"]
        result["Reminder on {0}"] = ["fr": "Rappel le {0}", "pt": "Lembrete a {0}", "it": "Promemoria il {0}", "de": "Erinnerung am {0}"]
        result["Turn it on"] = ["fr": "L’activer", "pt": "Ativar", "it": "Attivalo", "de": "Einschalten"]
        result["Want a reminder to review it?"] = ["fr": "Tu veux un rappel pour la revoir ?", "pt": "Queres um lembrete para a rever?", "it": "Vuoi un promemoria per rivederla?", "de": "Soll ich dich ans Überprüfen erinnern?"]
        result["Your Monday briefing is included"] = ["fr": "Ton bilan du lundi est inclus", "pt": "O teu resumo de segunda está incluído", "it": "Il tuo riepilogo del lunedì è incluso", "de": "Dein Montagsbericht ist inklusive"]
        result["1 month"] = ["fr": "1 mois", "pt": "1 mês", "it": "1 mese", "de": "1 Monat"]
        result["1 week"] = ["fr": "1 semaine", "pt": "1 semana", "it": "1 settimana", "de": "1 Woche"]
        result["3 days"] = ["fr": "3 jours", "pt": "3 dias", "it": "3 giorni", "de": "3 Tage"]
        result["Bobby notifications are off."] = ["fr": "Les notifications de Bobby sont désactivées.", "pt": "As notificações do Bobby estão desligadas.", "it": "Le notifiche di Bobby sono disattivate.", "de": "Mitteilungen für Bobby sind aus."]
        result["Choose date"] = ["fr": "Choisir une date", "pt": "Escolher data", "it": "Scegli la data", "de": "Datum wählen"]
        result["Reminder not set."] = ["fr": "Rappel non enregistré.", "pt": "Lembrete não guardado.", "it": "Promemoria non salvato.", "de": "Erinnerung nicht gespeichert."]
        result["Set"] = ["fr": "Enregistrer", "pt": "Guardar", "it": "Salva", "de": "Speichern"]
        result["Set reminder"] = ["fr": "Créer un rappel", "pt": "Criar lembrete", "it": "Imposta promemoria", "de": "Erinnerung setzen"]
        result["Write a thesis first."] = ["fr": "Écris d'abord une thèse.", "pt": "Escreve primeiro uma tese.", "it": "Scrivi prima una tesi.", "de": "Schreib zuerst eine These."]
        result["Your chosen date. Bobby does not monitor markets."] = ["fr": "Tu choisis la date. Bobby ne surveille pas les marchés.", "pt": "Tu escolhes a data. O Bobby não vigia os mercados.", "it": "Scegli tu la data. Bobby non sorveglia i mercati.", "de": "Du wählst das Datum. Bobby beobachtet die Märkte nicht."]
        result["Your reminder to review a thesis."] = ["fr": "Ton rappel pour revoir une thèse.", "pt": "O teu lembrete para rever uma tese.", "it": "Il tuo promemoria per rivedere una tesi.", "de": "Deine Erinnerung, eine These zu überprüfen."]
        return result
    }()
}
