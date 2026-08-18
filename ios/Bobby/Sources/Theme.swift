// Bobby visual language — consumer-smooth take on the Kinetic terminal:
// deep ink ground, Base blue accent, soft 20pt cards, SF Rounded.
import SwiftUI

enum Theme {
    static let bg = Color(red: 0.039, green: 0.047, blue: 0.070)        // #0A0C12
    static let card = Color(red: 0.075, green: 0.090, blue: 0.133)      // #131722
    static let cardSoft = Color(red: 0.105, green: 0.122, blue: 0.173)  // #1B1F2C
    static let accent = Color(red: 0.239, green: 0.482, blue: 1.0)      // #3D7BFF (Base blue, lifted for dark)
    static let up = Color(red: 0.204, green: 0.827, blue: 0.600)        // #34D399
    static let down = Color(red: 1.0, green: 0.420, blue: 0.420)        // #FF6B6B
    static let text = Color(red: 0.949, green: 0.957, blue: 0.973)      // #F2F4F8
    static let muted = Color(red: 0.604, green: 0.639, blue: 0.698)     // #9AA3B2
    static let stroke = Color.white.opacity(0.06)
}

extension Font {
    static func rounded(_ size: CGFloat, _ weight: Font.Weight = .regular) -> Font {
        .system(size: size, weight: weight, design: .rounded)
    }
    static func mono(_ size: CGFloat, _ weight: Font.Weight = .regular) -> Font {
        .system(size: size, weight: weight, design: .monospaced)
    }
}

struct CardBackground: ViewModifier {
    func body(content: Content) -> some View {
        content
            .background(Theme.card)
            .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 20, style: .continuous).stroke(Theme.stroke, lineWidth: 1))
    }
}

extension View {
    func card() -> some View { modifier(CardBackground()) }
}
