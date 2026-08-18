// The Bobby orb — the mascot. A living gradient blob that idles calmly,
// spins while thinking and pulses while speaking. This is the emotional
// anchor of the app: Bobby feels ALIVE, not like a form field.
import SwiftUI

struct BobbyOrb: View {
    var size: CGFloat = 44
    var thinking = false
    var speaking = false

    var body: some View {
        TimelineView(.animation(minimumInterval: 1.0 / 30.0)) { timeline in
            let t = timeline.date.timeIntervalSinceReferenceDate
            let breathe = 1 + 0.04 * sin(t * 2)
            let excited = speaking ? 1 + 0.10 * abs(sin(t * 9)) : 1.0
            let spin = thinking ? Angle(radians: t * 3.2) : Angle(radians: t * 0.55)

            ZStack {
                // aura
                Circle()
                    .fill(
                        RadialGradient(
                            colors: [Theme.accent.opacity(speaking ? 0.5 : 0.25), .clear],
                            center: .center, startRadius: 0, endRadius: size * 0.95
                        )
                    )
                    .frame(width: size * 1.9, height: size * 1.9)
                    .scaleEffect(breathe * excited)

                // body
                Circle()
                    .fill(
                        AngularGradient(
                            colors: [
                                Theme.accent,
                                Color(red: 0.55, green: 0.35, blue: 1.0),   // violet
                                Color(red: 0.15, green: 0.85, blue: 0.90),  // cyan
                                Theme.accent,
                            ],
                            center: .center, angle: spin
                        )
                    )
                    .frame(width: size, height: size)
                    .scaleEffect(breathe * excited)
                    .shadow(color: Theme.accent.opacity(0.55), radius: speaking ? 18 : 10)

                // eye highlight — the "face"
                Circle()
                    .fill(.white.opacity(0.9))
                    .frame(width: size * 0.16, height: size * 0.16)
                    .offset(x: -size * 0.14, y: -size * 0.16)
                    .blur(radius: 0.4)
            }
        }
        .frame(width: size * 1.9, height: size * 1.9)
        .accessibilityHidden(true)
    }
}
