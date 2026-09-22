import SwiftUI

enum Theme {
    static let accent = Color(red: 0.86, green: 0.70, blue: 0.40)
    static let accentSoft = Color(red: 0.98, green: 0.88, blue: 0.65)
    static let bg = Color(red: 0.025, green: 0.032, blue: 0.041)
    static let secondary = Color(red: 0.663, green: 0.690, blue: 0.729)
}

// Language constants required by the small narration helper retained for the
// signal detail screen; this is unrelated to account or Live authentication.
enum L {
    static let isSpanish = true
    static let ttsLang = "es"
}
