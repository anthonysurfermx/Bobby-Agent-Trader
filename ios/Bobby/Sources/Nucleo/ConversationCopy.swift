import Foundation

@MainActor enum ConversationCopy {
    static func readLabel(_ p0: String) -> String { L.t("See the {0} read", "Ver lectura de {0}").replacingOccurrences(of: "{0}", with: p0) }
    static func readFallback() -> String { L.t("See the read", "Ver la lectura") }
    static func reading(_ p0: String) -> String { L.t("Reading {0}…", "Leyendo {0}…").replacingOccurrences(of: "{0}", with: p0) }
    static func ready() -> String { L.t("Read ready", "Lectura lista") }
    static func k1(_ p0: String) -> String { L.t("Uses 1 of your {0} reads", "Usa 1 de tus {0} lecturas").replacingOccurrences(of: "{0}", with: p0) }
    static func k2() -> String { L.t("Uses your last read", "Usa tu última lectura") }
    static func k3() -> String { L.t("Uses 1 read", "Usa 1 lectura") }
    static func k4(_ p0: String) -> String { L.t("Uses 1 of your {0} free reads", "Usa 1 de tus {0} lecturas gratis").replacingOccurrences(of: "{0}", with: p0) }
    static func k4b() -> String { L.t("Uses your last free read", "Usa tu última lectura gratis") }
    static func k5() -> String { L.t("Included in Bobby Pro", "Incluida en Bobby Pro") }
    static func k6(_ p0: String, _ p1: String, _ p2: String) -> String { L.t("Uses 1 of your {1} {0} and 1 of your {2} reads", "Usa 1 de tus {1} {0} y 1 de tus {2} lecturas").replacingOccurrences(of: "{0}", with: p0).replacingOccurrences(of: "{1}", with: p1).replacingOccurrences(of: "{2}", with: p2) }
    static func k6g(_ p0: String, _ p1: String, _ p2: String) -> String { L.t("Uses 1 of your {1} {0} and 1 of your {2} free reads", "Usa 1 de tus {1} {0} y 1 de tus {2} lecturas gratis").replacingOccurrences(of: "{0}", with: p0).replacingOccurrences(of: "{1}", with: p1).replacingOccurrences(of: "{2}", with: p2) }
    static func k7(_ p0: String) -> String { L.t("Uses 1 {0} and 1 read", "Usa 1 {0} y 1 lectura").replacingOccurrences(of: "{0}", with: p0) }
    static func k8(_ p0: String, _ p1: String) -> String { L.t("Uses 1 of your {1} {0} with Bobby Pro", "Usa 1 de tus {1} {0} con Bobby Pro").replacingOccurrences(of: "{0}", with: p0).replacingOccurrences(of: "{1}", with: p1) }
    static func k9(_ p0: String) -> String { L.t("Uses 1 {0} with Bobby Pro", "Usa 1 {0} con Bobby Pro").replacingOccurrences(of: "{0}", with: p0) }
    static func limitKnown(_ p0: String) -> String { L.t("I can’t explain more right now. I’ll be back {0}", "Por ahora no puedo explicar más. Vuelvo {0}").replacingOccurrences(of: "{0}", with: p0) }
    static func limitUnknown() -> String { L.t("I can’t explain more right now. Try again later.", "Por ahora no puedo explicar más. Inténtalo más tarde.") }
    static func limit(headers: [String: String], now: Date = Date(), calendar: Calendar = .current, locale: Locale = L.locale) -> String {
        guard let raw = headers.first(where: { $0.key.lowercased() == "retry-after" })?.value,
              let seconds = Double(raw), seconds.isFinite, seconds >= 0 else { return limitUnknown() }
        return limitKnown(when(now.addingTimeInterval(seconds), now: now, calendar: calendar, locale: locale))
    }
    static func when(_ date: Date, now: Date, calendar: Calendar, locale: Locale) -> String {
        let days = calendar.dateComponents([.day], from: calendar.startOfDay(for: now), to: calendar.startOfDay(for: date)).day ?? 0
        let f = DateFormatter(); f.locale = locale; f.timeZone = calendar.timeZone; f.timeStyle = .short
        let time = f.string(from: date)
        let weekday = DateFormatter(); weekday.locale = locale; weekday.timeZone = calendar.timeZone; weekday.dateFormat = "EEEE"
        let row: String
        switch days {
        case 0: row = L.t("today at {t}", "hoy a las {t}")
        case 1: row = L.t("tomorrow at {t}", "mañana a las {t}")
        case 2...6: row = L.t("{weekday} at {t}", "el {weekday} a las {t}")
        default:
            f.timeStyle = .none; f.setLocalizedDateFormatFromTemplate("d MMM")
            return L.t("on {d MMM}", "el {d} de {MMM}").replacingOccurrences(of: "{d MMM}", with: f.string(from: date))
                .replacingOccurrences(of: "{d}", with: String(calendar.component(.day, from: date)))
                .replacingOccurrences(of: "{MMM}", with: { f.setLocalizedDateFormatFromTemplate("MMM"); return f.string(from: date) }())
        }
        var words = row
        let hour = calendar.component(.hour, from: date)
        let language = locale.language.languageCode?.identifier
        if hour == 1 {
            if language == "es" { words = words.replacingOccurrences(of: "a las {t}", with: "a la {t}") }
            if language == "pt" { words = words.replacingOccurrences(of: "às {t}", with: "à {t}") }
            if language == "it" { words = words.replacingOccurrences(of: "alle {t}", with: "all’{t}") }
        }
        if language == "pt", [1, 7].contains(calendar.component(.weekday, from: date)) {
            words = words.replacingOccurrences(of: "na {weekday}", with: "no {weekday}")
        }
        return words.replacingOccurrences(of: "{t}", with: time).replacingOccurrences(of: "{weekday}", with: weekday.string(from: date))
    }
}
