// ============================================================
// L — device-language copy. Bobby speaks whatever the phone
// speaks: Spanish device → Spanish companion, anything else →
// English. One helper instead of .lproj bundles so every string
// keeps both versions side by side, readable in the diff.
// ============================================================

import Foundation

enum L {
    /// Resolved once per launch from the device's preferred language.
    static let isSpanish: Bool = {
        let code = Locale.preferredLanguages.first?.prefix(2).lowercased()
            ?? Locale.current.language.languageCode?.identifier
            ?? "en"
        return code == "es"
    }()

    /// t("English", "Español")
    static func t(_ en: String, _ es: String) -> String { isSpanish ? es : en }

    /// What the TTS backend should pronounce — the companion's voice
    /// follows the device, so an English phone never gets Spanish audio.
    static var ttsLang: String { isSpanish ? "es" : "en" }
}
