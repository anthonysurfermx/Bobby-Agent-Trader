// Bobby visual language — the Kinetic terminal translated to a pocket desk.
import SwiftUI

enum Theme {
    static let bg = Color(red: 0.010, green: 0.012, blue: 0.019)        // #030305
    static let panel = Color(red: 0.018, green: 0.021, blue: 0.031)     // #050508
    static let card = Color.white.opacity(0.035)
    static let cardSoft = Color.white.opacity(0.065)
    static let accent = Color(red: 0.129, green: 0.408, blue: 1.0)      // Base electric blue
    static let accentSoft = Color(red: 0.49, green: 0.65, blue: 1.0)
    static let up = Color(red: 0.204, green: 0.827, blue: 0.600)        // #34D399
    static let down = Color(red: 1.0, green: 0.420, blue: 0.420)        // #FF6B6B
    static let cio = Color(red: 0.98, green: 0.78, blue: 0.18)
    static let text = Color(red: 0.949, green: 0.957, blue: 0.973)      // #F2F4F8
    static let muted = Color.white.opacity(0.42)
    static let stroke = Color.white.opacity(0.075)
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
            .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).stroke(Theme.stroke, lineWidth: 1))
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
