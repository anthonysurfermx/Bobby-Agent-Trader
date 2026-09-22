import SwiftUI

struct PTSOrbit: View {
    var speaking = false
    var level: CGFloat = 0
    var active = false
    @State private var floating = false

    var body: some View {
        ZStack {
            Circle()
                .fill(RadialGradient(
                    colors: [Theme.accentSoft, Theme.accent, Color(red: 0.44, green: 0.30, blue: 0.12)],
                    center: .topLeading,
                    startRadius: 2,
                    endRadius: 38
                ))
                .frame(width: 68 + min(level, 0.22) * 14, height: 68 + min(level, 0.22) * 14)
                .overlay(Circle().stroke(Theme.accentSoft.opacity(active ? 0.7 : 0.42), lineWidth: 1))
                .shadow(color: Theme.accent.opacity(active ? 0.46 : 0.24), radius: active ? 24 : 14)
            Circle()
                .fill(.white.opacity(speaking ? 0.72 : 0.42))
                .frame(width: 13, height: 13)
                .blur(radius: 2)
                .offset(x: -16, y: -19)
            Circle()
                .fill(.white.opacity(0.28))
                .frame(width: 5, height: 5)
                .offset(x: 13, y: -23)
        }
        .frame(width: 92, height: 92)
        .offset(y: floating ? -5 : 5)
        .animation(.easeInOut(duration: 2.2).repeatForever(autoreverses: true), value: floating)
        .onAppear { floating = true }
        .accessibilityHidden(true)
    }
}
