// Shared Núcleo visual language, drawn from Bobby's violet and blue orb.
import SwiftUI

enum Theme {
    static let bg = Color(red: 0.016, green: 0.012, blue: 0.025)       // #040306
    static let panel = Color(red: 0.051, green: 0.043, blue: 0.082)    // #0D0B15
    static let orbViolet = Color(red: 0.655, green: 0.584, blue: 0.937) // #A795EF
    static let orbBlue = Color(red: 0.471, green: 0.525, blue: 0.980)   // #7886FA
    static let orbCyan = Color(red: 0.502, green: 0.851, blue: 0.910)   // #80D9E8
    static let orbGradient = LinearGradient(colors: [orbViolet, orbBlue, orbCyan], startPoint: .topLeading, endPoint: .bottomTrailing)
    static let nucleoSurface = panel
    static let nucleoGlass = Color(red: 0.655, green: 0.584, blue: 0.937).opacity(0.06)
    static let nucleoStroke = Color(red: 0.655, green: 0.584, blue: 0.937).opacity(0.16)
    static let card = nucleoGlass
    static let cardSoft = orbViolet.opacity(0.10)
    static let accent = orbViolet
    static let accentSoft = orbCyan
    static let up = Color(red: 0.204, green: 0.827, blue: 0.600)        // #34D399
    static let down = Color(red: 1.0, green: 0.420, blue: 0.420)        // #FF6B6B
    static let cio = Color(red: 0.98, green: 0.78, blue: 0.18)
    static let text = cream
    static let muted = warmMuted
    static let stroke = nucleoStroke

    // Núcleo warm palette (the web profile drawer, src/styles/nucleo-desk.css).
    static let cream = Color(red: 0.949, green: 0.929, blue: 0.894)      // #F2EDE4 — primary ink
    static let warmMuted = Color(red: 0.639, green: 0.612, blue: 0.569)  // #A39C91 — secondary ink
    static let warmDim = Color(red: 0.541, green: 0.514, blue: 0.471)    // #8A8378 — labels, details
    static let warmFill = Color(red: 0.949, green: 0.929, blue: 0.894).opacity(0.05)   // row icon well
    static let warmHair = Color(red: 0.949, green: 0.929, blue: 0.894).opacity(0.07)   // hairline separators
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
            .overlay(RoundedRectangle(cornerRadius: 20, style: .continuous).stroke(Theme.nucleoStroke, lineWidth: 1))
    }
}

extension View {
    func card() -> some View { modifier(CardBackground()) }
}

struct KineticBackground: View {
    var body: some View {
        TimelineView(.animation(minimumInterval: 1.0 / 24.0)) { timeline in
            Canvas { context, size in
                let step: CGFloat = 42
                var grid = Path()
                stride(from: CGFloat.zero, through: size.width, by: step).forEach { x in
                    grid.move(to: CGPoint(x: x, y: 0))
                    grid.addLine(to: CGPoint(x: x, y: size.height))
                }
                stride(from: CGFloat.zero, through: size.height, by: step).forEach { y in
                    grid.move(to: CGPoint(x: 0, y: y))
                    grid.addLine(to: CGPoint(x: size.width, y: y))
                }
                context.stroke(grid, with: .color(.white.opacity(0.035)), lineWidth: 0.5)

                let t = timeline.date.timeIntervalSinceReferenceDate
                let scanY = CGFloat((t * 24).truncatingRemainder(dividingBy: max(1, size.height)))
                var scan = Path()
                scan.move(to: CGPoint(x: 0, y: scanY))
                scan.addLine(to: CGPoint(x: size.width, y: scanY))
                context.stroke(scan, with: .color(Theme.accent.opacity(0.10)), lineWidth: 1)
            }
        }
        .background(
            RadialGradient(
                colors: [Theme.accent.opacity(0.09), .clear],
                center: UnitPoint(x: 0.5, y: 0.16),
                startRadius: 0,
                endRadius: 300
            )
        )
        .background(Theme.bg)
        .ignoresSafeArea()
        .accessibilityHidden(true)
    }
}
