// The live desk orb. It mirrors the web experience: particle field, audio
// spectrum, orbital paths and a luminous core driven by the real mic/TTS level.
import SwiftUI

struct BobbyOrb: View {
    var size: CGFloat = 44
    var thinking = false
    var speaking = false
    var listening = false
    var level: CGFloat = 0
    /// Aura tint — the orb inherits the agent's chosen energy.
    var tint: Color = Theme.accent
    var tintSoft: Color = Theme.accentSoft

    var body: some View {
        // Battery: the idle orb breathes at 12fps; full 30fps only while the
        // desk is actually doing something (Kimi red-team v3 perf note).
        let fps: Double = (thinking || speaking || listening || level > 0.12) ? 30 : 12
        return TimelineView(.animation(minimumInterval: 1.0 / fps)) { timeline in
            let t = timeline.date.timeIntervalSinceReferenceDate
            let idle = CGFloat(0.10 + sin(t * 1.4) * 0.035)
            let energy = max(idle, min(1, level))
            let active = thinking || speaking || listening
            let dim: CGFloat = active ? 1 : 0.72
            let core = size * 0.29

            ZStack {
                Circle()
                    .fill(
                        RadialGradient(
                            colors: [tint.opacity((0.30 + energy * 0.42) * dim), tint.opacity(0.06), .clear],
                            center: .center, startRadius: 0, endRadius: size * 0.74
                        )
                    )
                    .frame(width: size, height: size)
                    .blur(radius: size * 0.035)

                ForEach(0..<32, id: \.self) { index in
                    let angle = Double(index) * 2.399 + t * (thinking ? 0.34 : 0.10)
                    let radius = size * (0.22 + CGFloat((index * 19) % 31) / 100)
                    let x = cos(angle) * radius
                    let y = sin(angle) * radius * 0.82
                    Circle()
                        .fill(tintSoft.opacity((0.16 + energy * 0.30) * dim))
                        .frame(width: CGFloat(1 + index % 3), height: CGFloat(1 + index % 3))
                        .offset(x: x, y: y)
                }

                ForEach(0..<64, id: \.self) { index in
                    let noise = (sin(Double(index) * 0.73 + t * 3.1) + sin(Double(index) * 1.9 - t * 2.2)) * 0.25 + 0.5
                    let bar = size * (0.018 + energy * CGFloat(0.115 + noise * 0.13))
                    Capsule()
                        .fill((speaking ? tint : tintSoft).opacity((0.25 + energy * 0.72) * dim))
                        .frame(width: max(1, size * 0.006), height: max(3, bar))
                        .offset(y: -(core * 1.50 + bar / 2))
                        .rotationEffect(.degrees(Double(index) / 64 * 360))
                }

                orbit(width: size * 0.64, height: size * 0.23, rotation: t * 10, energy: energy, dim: dim)
                orbit(width: size * 0.79, height: size * 0.29, rotation: -t * 7 + 61, energy: energy, dim: dim)
                orbit(width: size * 0.91, height: size * 0.18, rotation: t * 4 + 128, energy: energy, dim: dim)

                Circle()
                    .fill(
                        RadialGradient(
                            colors: [.white.opacity(0.92), tintSoft, tint],
                            center: UnitPoint(x: 0.34, y: 0.30), startRadius: 0, endRadius: core
                        )
                    )
                    .frame(width: core * 2, height: core * 2)
                    .scaleEffect(1 + energy * 0.18)
                    .overlay(Circle().stroke(.white.opacity(0.24 + energy * 0.36), lineWidth: 1))
                    .shadow(color: tint.opacity(0.80), radius: 18 + energy * 30)
            }
        }
        .frame(width: size, height: size)
        .accessibilityHidden(true)
    }

    private func orbit(width: CGFloat, height: CGFloat, rotation: Double, energy: CGFloat, dim: CGFloat) -> some View {
        Ellipse()
            .stroke(tintSoft.opacity((0.16 + energy * 0.24) * dim), lineWidth: 0.8)
            .frame(width: width, height: height * (1 + energy * 0.14))
            .rotationEffect(.degrees(rotation))
            .overlay(alignment: .trailing) {
                Circle()
                    .fill(.white.opacity((0.55 + energy * 0.4) * dim))
                    .frame(width: 4 + energy * 3, height: 4 + energy * 3)
                    .offset(x: 1)
            }
    }
}
