// App language and regional speech routing. The persisted selection is independent of the account.
import Foundation

enum AppLanguage: String, CaseIterable, Sendable {
    case en, es, fr, pt, it, de
    var name: String {
        switch self { case .en: return "English"; case .es: return "Español"; case .fr: return "Français"; case .pt: return "Português"; case .it: return "Italiano"; case .de: return "Deutsch" }
    }
}

struct LanguageResolution: Equatable, Sendable {
    let language: AppLanguage
    let localeIdentifier: String
    let country: String?

    static func resolve(selection: String?, preferredLanguages: [String], region: String?) -> LanguageResolution {
        let country = region.flatMap { value in
            let code = value.uppercased()
            return code.range(of: "^[A-Z]{2}$", options: .regularExpression) != nil ? code : nil
        }
        let preferred = preferredLanguages.map { $0.replacingOccurrences(of: "_", with: "-") }
        let selected = selection.flatMap(AppLanguage.init(rawValue:))
        let language = selected ?? preferred.compactMap { AppLanguage(rawValue: $0.split(separator: "-").first.map(String.init)?.lowercased() ?? "") }.first ?? .en
        let deviceLocale = preferred.first { $0.split(separator: "-").first?.lowercased() == language.rawValue }
        let deviceRegion = deviceLocale?.split(separator: "-").dropFirst().first { $0.count == 2 }?.uppercased()
        let locale: String
        switch language {
        case .fr: locale = "fr-FR"
        case .it: locale = "it-IT"
        case .de: locale = "de-DE"
        case .pt: locale = (deviceRegion == "BR" || (deviceRegion == nil && country == "BR")) ? "pt-BR" : "pt-PT"
        case .es: locale = "es-" + (["ES", "MX", "US"].contains(deviceRegion ?? "") ? deviceRegion! : "MX")
        case .en: locale = "en-" + (["US", "GB", "AU", "CA", "IE"].contains(deviceRegion ?? "") ? deviceRegion! : "US")
        }
        return LanguageResolution(language: language, localeIdentifier: locale, country: country)
    }

    var speechLocaleCandidates: [String] {
        let alternatives: [String]
        switch language {
        case .fr: alternatives = ["fr-FR", "fr-CA"]
        case .pt: alternatives = ["pt-PT", "pt-BR"]
        case .it: alternatives = ["it-IT"]
        case .de: alternatives = ["de-DE", "de-AT", "de-CH"]
        case .es: alternatives = ["es-MX", "es-ES", "es-US"]
        case .en: alternatives = ["en-US", "en-GB"]
        }
        return [localeIdentifier] + alternatives.filter { $0 != localeIdentifier }
    }
}

/// Retains a stable catalog key and argument boundaries, so names, prices and tickers are never
/// translated or guessed with regex. Catalog translations can reorder `{0}` placeholders.
struct LocalizedText: ExpressibleByStringLiteral, ExpressibleByStringInterpolation {
    let key: String
    let arguments: [String]
    init(stringLiteral value: String) { key = value; arguments = [] }
    init(_ value: String) { key = value; arguments = [] }
    init(stringInterpolation: StringInterpolation) { key = stringInterpolation.key; arguments = stringInterpolation.arguments }
    struct StringInterpolation: StringInterpolationProtocol {
        var key = ""
        var arguments: [String] = []
        init(literalCapacity: Int, interpolationCount: Int) { key.reserveCapacity(literalCapacity); arguments.reserveCapacity(interpolationCount) }
        mutating func appendLiteral(_ literal: String) { key += literal }
        mutating func appendInterpolation<T>(_ value: T) { key += "{\(arguments.count)}"; arguments.append(String(describing: value)) }
    }
    func render(_ template: String) -> String {
        // Split before inserting values: a user's name containing `{1}` cannot alter another argument.
        var output = ""; var cursor = template.startIndex
        while let open = template[cursor...].firstIndex(of: "{"), let close = template[open...].firstIndex(of: "}") {
            output += template[cursor..<open]
            let indexText = template[template.index(after: open)..<close]
            if let index = Int(indexText), arguments.indices.contains(index) { output += arguments[index] }
            else { output += template[open...close] }
            cursor = template.index(after: close)
        }
        output += template[cursor...]
        return output
    }
}

enum L {
    static let preferenceKey = "app.language"
    static let didChange = Notification.Name("Bobby.languageDidChange")
    static var selection: String { UserDefaults.standard.string(forKey: preferenceKey) ?? "system" }
    static var resolution: LanguageResolution {
        LanguageResolution.resolve(selection: selection, preferredLanguages: Locale.preferredLanguages, region: Locale.current.region?.identifier)
    }
    static var language: String { resolution.language.rawValue }
    static var ttsLang: String { language }
    static var localeIdentifier: String { resolution.localeIdentifier }
    static var country: String? { resolution.country }
    static var speechLocaleCandidates: [String] { resolution.speechLocaleCandidates }
    static var isSpanish: Bool { language == "es" }
    static var displayName: String { resolution.language.name }
    static var locale: Locale { Locale(identifier: localeIdentifier) }
    static func formatLocale(spanish: Bool? = nil) -> Locale { spanish.map { Locale(identifier: $0 ? "es_MX" : "en_US") } ?? locale }
    static func select(_ value: String) {
        guard value == "system" || AppLanguage(rawValue: value) != nil else { return }
        UserDefaults.standard.set(value, forKey: preferenceKey)
        NotificationCenter.default.post(name: didChange, object: nil)
    }

    static func t(_ en: LocalizedText, _ es: String, spanish: Bool? = nil) -> String {
        let selected = spanish.map { $0 ? "es" : "en" } ?? language
        if selected == "es" { return es }
        let template = NativeTranslations.rows[en.key]?[selected] ?? en.key
        return en.render(template)
    }
    @_disfavoredOverload
    static func t(_ en: String, _ es: String, spanish: Bool? = nil) -> String { t(LocalizedText(en), es, spanish: spanish) }

    static func site(_ path: String) -> URL {
        var c = URLComponents()
        c.scheme = "https"; c.host = "bobbyprotocol.xyz"; c.path = "/" + path
        c.queryItems = [URLQueryItem(name: "lang", value: language)]
        return c.url!
    }

    static func disciplineStreak(_ days: Int) -> String {
        switch language {
        case "es": return "Racha de disciplina: \(days) \(days == 1 ? "día" : "días") 🔥"
        case "fr": return "Série de discipline : \(days) \(days == 1 ? "jour" : "jours") 🔥"
        case "pt": return "Sequência de disciplina: \(days) \(days == 1 ? "dia" : "dias") 🔥"
        case "it": return "Serie di disciplina: \(days) \(days == 1 ? "giorno" : "giorni") 🔥"
        case "de": return "Disziplinserie: \(days) \(days == 1 ? "Tag" : "Tage") 🔥"
        default: return "Discipline streak: \(days) \(days == 1 ? "day" : "days") 🔥"
        }
    }

    static func weeklyGreeting(name: String, language: String) -> String {
        switch AppLanguage(rawValue: language.split(separator: "-").first.map(String.init) ?? language) {
        case .es: return "Hola, \(name). Este es tu resumen semanal."
        case .fr: return "Bonjour, \(name). Voici ton récapitulatif de la semaine."
        case .pt: return "Olá, \(name). Este é o teu resumo semanal."
        case .it: return "Ciao, \(name). Ecco il tuo riepilogo settimanale."
        case .de: return "Hallo, \(name). Hier ist dein Wochenüberblick."
        default: return "Hi, \(name). This is your weekly briefing."
        }
    }
}
