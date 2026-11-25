import Foundation

extension NativeTranslations18 {
    /// Watches (V19/Watches): the few words the screen owns. Informal address in every language.
    /// The lines about a watch itself come from the server, already in the person's language.
    static let watches: [String: [String: String]] = {
        var result: [String: [String: String]] = [:]
        result["Watches"] = ["fr": "Surveillances", "pt": "Vigias", "it": "Cose che seguo", "de": "Beobachtungen"]
        result["Bobby tells you when it happens."] = ["fr": "Bobby te prévient quand ça arrive.", "pt": "O Bobby avisa quando acontecer.", "it": "Bobby ti avvisa quando succede.", "de": "Bobby sagt dir Bescheid, wenn es passiert."]
        result["Watch"] = ["fr": "Surveiller", "pt": "Vigiar", "it": "Segui", "de": "Beobachten"]
        result["At a day's close, not during the day."] = ["fr": "À la clôture du jour, pas en cours de journée.", "pt": "No fecho do dia, não durante o dia.", "it": "Alla chiusura del giorno, non durante il giorno.", "de": "Zum Tagesschluss, nicht während des Tages."]
        result["Say “tell me if Nvidia falls 5%” and Bobby watches it for you."] = ["fr": "Dis « préviens-moi si Nvidia baisse de 5 % » et Bobby le surveille pour toi.", "pt": "Diz «avisa-me se a Nvidia descer 5 %» e o Bobby vigia por ti.", "it": "Di’ «avvisami se Nvidia scende del 5%» e Bobby lo segue per te.", "de": "Sag „Sag mir Bescheid, wenn Nvidia 5 % fällt“ und Bobby beobachtet es für dich."]
        result["Bobby tells you when it happens"] = ["fr": "Bobby te prévient quand ça arrive", "pt": "O Bobby avisa quando acontecer", "it": "Bobby ti avvisa quando succede", "de": "Bobby sagt dir Bescheid, wenn es passiert"]
        result["Done. Bobby tells you when it happens."] = ["fr": "C’est fait. Bobby te prévient quand ça arrive.", "pt": "Feito. O Bobby avisa quando acontecer.", "it": "Fatto. Bobby ti avvisa quando succede.", "de": "Erledigt. Bobby sagt dir Bescheid, wenn es passiert."]
        result["See"] = ["fr": "Voir", "pt": "Ver", "it": "Vedi", "de": "Ansehen"]
        result["What was reported"] = ["fr": "Ce qui a été publié", "pt": "O que foi publicado", "it": "Cosa è stato pubblicato", "de": "Was berichtet wurde"]
        result["For your thesis"] = ["fr": "Pour ta thèse", "pt": "Para a tua tese", "it": "Per la tua tesi", "de": "Für deine These"]
        result["See watches"] = ["fr": "Voir les surveillances", "pt": "Ver vigias", "it": "Vedi cosa seguo", "de": "Beobachtungen ansehen"]
        result["{0}: what you asked me to watch happened"] = ["fr": "{0} : ce que tu m’as demandé est arrivé", "pt": "{0}: aconteceu o que me pediste", "it": "{0}: è successo ciò che mi hai chiesto", "de": "{0}: Es ist passiert, worum du gebeten hast"]
        result["Shall I watch {0} for you?"] = ["fr": "Je surveille {0} pour toi ?", "pt": "Vigio {0} por ti?", "it": "Seguo {0} per te?", "de": "Soll ich {0} für dich beobachten?"]
        result["Stop watching"] = ["fr": "Arrêter de surveiller", "pt": "Parar de vigiar", "it": "Smetti di seguire", "de": "Nicht mehr beobachten"]
        result["Watch {0}"] = ["fr": "Surveiller {0}", "pt": "Vigiar {0}", "it": "Segui {0}", "de": "{0} beobachten"]
        result["Watching {0} of {1}"] = ["fr": "{0} surveillances sur {1}", "pt": "A vigiar {0} de {1}", "it": "Ne seguo {0} su {1}", "de": "{0} von {1} Beobachtungen"]
        result["Falls"] = ["fr": "Baisse", "pt": "Desce", "it": "Scende", "de": "Fällt"]
        result["Rises"] = ["fr": "Monte", "pt": "Sobe", "it": "Sale", "de": "Steigt"]
        result["Either way"] = ["fr": "Les deux", "pt": "Qualquer um", "it": "In entrambi i sensi", "de": "Beides"]
        result["Sign in so Bobby can watch for you."] = ["fr": "Connecte-toi pour que Bobby surveille pour toi.", "pt": "Inicia sessão para o Bobby vigiar por ti.", "it": "Accedi così Bobby può seguirlo per te.", "de": "Melde dich an, damit Bobby für dich beobachten kann."]
        result["Allow notifications in Settings so Bobby can tell you."] = ["fr": "Autorise les notifications dans Réglages pour que Bobby puisse te prévenir.", "pt": "Permite as notificações nas Definições para o Bobby te poder avisar.", "it": "Consenti le notifiche in Impostazioni così Bobby può avvisarti.", "de": "Erlaube Mitteilungen in den Einstellungen, damit Bobby dir Bescheid sagen kann."]
        result["You already have {0} watches. Stop one to add another."] = ["fr": "Tu as déjà {0} surveillances. Arrêtes-en une pour en ajouter une autre.", "pt": "Já tens {0} vigias. Para uma para adicionar outra.", "it": "Ne segui già {0}. Smetti di seguirne una per aggiungerne un’altra.", "de": "Du hast schon {0} Beobachtungen. Beende eine, um eine neue hinzuzufügen."]
        result["Bobby could not read this asset right now. Nothing was started."] = ["fr": "Bobby n’a pas pu lire cet actif pour l’instant. Rien n’a été lancé.", "pt": "O Bobby não conseguiu ler este ativo agora. Nada foi iniciado.", "it": "Bobby non è riuscito a leggere questo asset adesso. Non è stato avviato nulla.", "de": "Bobby konnte diesen Wert gerade nicht lesen. Es wurde nichts gestartet."]
        result["Not available right now. Try again in a moment."] = ["fr": "Indisponible pour l’instant. Réessaie dans un instant.", "pt": "Indisponível agora. Tenta de novo daqui a pouco.", "it": "Non disponibile adesso. Riprova tra un momento.", "de": "Gerade nicht verfügbar. Versuch es gleich noch einmal."]
        return result
    }()
}
