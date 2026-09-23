import SwiftUI
import UIKit

/// Hosts the opening motion and hands off to the signal home. The home is
/// mounted during the splash's hold (so its first layout never lands on the
/// busy part of the motion) and zooms in underneath as the splash clears.
struct PTSLaunchView: View {
    @State private var homeMounted = false
    @State private var homeRevealed = false
    @State private var splashDone = false

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()
            if homeMounted {
                SignalHome()
                    .scaleEffect(homeRevealed ? 1 : 1.06)
                    .opacity(homeRevealed ? 1 : 0)
                    .accessibilityHidden(!splashDone)
            }
            if !splashDone {
                PTSSplashView(
                    onHold: { homeMounted = true },
                    onExit: { withAnimation(.smooth(duration: 0.55)) { homeRevealed = true } },
                    onFinished: { splashDone = true }
                )
                .transition(.identity)
            }
        }
    }
}

/// The PTS opening (≈2.7 s). One deterministic timeline drives every layer:
/// the gold icon springs in with a haptic and a glint, the logos of the
/// signals Daniel is covering fly in from the edges and keep floating, the
/// wordmark reveals word by word, and the whole scene pushes through into
/// the home.
struct PTSSplashView: View {
    var onHold: () -> Void = {}
    var onExit: () -> Void = {}
    let onFinished: () -> Void

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var start: Date?

    private static let holdAt: TimeInterval = 1.85
    private static let exitAt: TimeInterval = 2.2
    private static let exitLength: TimeInterval = 0.5

    private let titleWords = ["Pro", "Trading", "Skills"]

    /// Resting spot, tilt and depth for each orbiting logo, in order of the
    /// curated signals (the logos themselves come from the catalog).
    private static let orbit: [(x: CGFloat, y: CGFloat, tilt: Double, size: CGFloat)] = [
        (0.21, 0.165, -10, 70), (0.81, 0.225, 9, 58), (0.19, 0.745, 8, 58), (0.79, 0.80, -8, 72),
    ]

    var body: some View {
        GeometryReader { proxy in
            TimelineView(.animation) { context in
                let t = start.map { context.date.timeIntervalSince($0) } ?? 0
                frame(t: t, size: proxy.size)
            }
        }
        .background(Color.black)
        .ignoresSafeArea()
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("pts-login-splash")
        .onAppear {
            guard start == nil else { return }
            start = Date()
            let haptic = UIImpactFeedbackGenerator(style: .soft)
            haptic.prepare()
            DispatchQueue.main.asyncAfter(deadline: .now() + (reduceMotion ? 0.3 : 0.4)) { haptic.impactOccurred(intensity: 0.8) }
            DispatchQueue.main.asyncAfter(deadline: .now() + Self.holdAt) { onHold() }
            DispatchQueue.main.asyncAfter(deadline: .now() + Self.exitAt) { onExit() }
            DispatchQueue.main.asyncAfter(deadline: .now() + Self.exitAt + Self.exitLength) { onFinished() }
        }
    }

    // MARK: - Timeline

    private func frame(t: TimeInterval, size: CGSize) -> some View {
        let center = CGPoint(x: size.width / 2, y: size.height * 0.44)
        let iconSize = min(144, size.width * 0.35)
        let exit = easeIn(progress(t, Self.exitAt, Self.exitAt + Self.exitLength))
        // Slow camera push across the whole opening.
        let push = reduceMotion ? 1 : 1.04 - 0.04 * easeOut(progress(t, 0, Self.exitAt))

        return ZStack {
            Color.black

            levels(t: t, size: size)
                .opacity(1 - exit)

            bloom(iconSize: iconSize, t: t, exit: exit)
                .position(center)

            ForEach(Array(SignalListItem.curated.prefix(Self.orbit.count).enumerated()), id: \.element.id) { index, signal in
                tile(signal.symbol, index: index, t: t, center: center, size: size, exit: exit)
            }

            icon(size: iconSize, t: t, exit: exit)
                .position(center)

            title(t: t, exit: exit)
                .frame(width: size.width - 48)
                .position(x: center.x, y: center.y + iconSize / 2 + 50)
        }
        .scaleEffect(push)
    }

    // MARK: - Layers

    /// Gold bloom that grows behind the icon and breathes while it holds.
    private func bloom(iconSize: CGFloat, t: TimeInterval, exit: Double) -> some View {
        let grow: Double = reduceMotion ? 1 : 0.55 + 0.45 * easeOut(progress(t, 0.05, 0.9))
        let scale = grow + 0.03 * sin(t * 2.2) + 0.35 * exit
        let colors = [Theme.accent.opacity(0.34), Theme.accent.opacity(0.08), Color.clear]
        return RadialGradient(colors: colors, center: .center, startRadius: 0, endRadius: iconSize * 2.1)
            .frame(width: iconSize * 4.2, height: iconSize * 4.2)
            .scaleEffect(scale)
            .opacity(progress(t, 0.05, 0.6) * (1 - exit))
    }

    private func icon(size: CGFloat, t: TimeInterval, exit: Double) -> some View {
        let s = reduceMotion ? progress(t, 0.05, 0.45) : spring(t, delay: 0.12, response: 0.62, damping: 0.62)
        let focus = reduceMotion ? 1 : easeOut(progress(t, 0.12, 0.5))
        let glint = progress(t, 1.1, 1.65)
        let shape = RoundedRectangle(cornerRadius: size * 0.215, style: .continuous)
        return Image("pts-bull")
            .resizable()
            .interpolation(.high)
            .scaledToFit()
            .frame(width: size, height: size)
            .overlay {
                // A diagonal light band sweeps across the gold. Overlay blending
                // leaves the black untouched, so only the bull and rim catch it.
                LinearGradient(colors: [.clear, .white.opacity(0.9), .clear], startPoint: .leading, endPoint: .trailing)
                    .frame(width: size * 0.32, height: size * 1.9)
                    .rotationEffect(.degrees(24))
                    .offset(x: -size * 0.95 + glint * size * 1.9)
                    .blendMode(.overlay)
                    .opacity(reduceMotion || glint == 0 || glint == 1 ? 0 : 1)
            }
            .mask(shape.padding(size * 0.035))
            .shadow(color: Theme.accent.opacity(0.45 * progress(t, 0.3, 0.8)), radius: 24)
            .scaleEffect((reduceMotion ? 1 : 0.45 + 0.55 * s) + 0.22 * exit)
            .blur(radius: 14 * (1 - focus) + 10 * exit)
            .opacity(min(1, progress(t, 0.12, 0.32)) * (1 - exit))
            .accessibilityHidden(true)
            .accessibilityIdentifier("pts-login-splash-bull")
    }

    /// One orbiting signal logo: flies in from beyond its edge on a bouncy
    /// spring, then floats; on exit it keeps going outward, like a camera
    /// pushing through the scene.
    private func tile(_ symbol: String, index: Int, t: TimeInterval, center: CGPoint, size: CGSize, exit: Double) -> some View {
        let spec = Self.orbit[index]
        let rest = CGPoint(x: size.width * spec.x, y: size.height * spec.y)
        let dx = rest.x - center.x, dy = rest.y - center.y
        let length = max(1, sqrt(dx * dx + dy * dy))
        let out = CGPoint(x: dx / length, y: dy / length)
        let delay = 0.42 + Double(index) * 0.075
        let s = reduceMotion ? 1 : spring(t, delay: delay, response: 0.72, damping: 0.6)
        let travel = (1 - s) * 280 + exit * exit * 360
        let phase = Double(index) * 1.7
        let float = reduceMotion ? 0 : sin(t * 2.3 + phase) * 4 * progress(t, delay + 0.4, delay + 0.9)
        let appear = reduceMotion ? progress(t, 0.35, 0.8) : min(1, progress(t, delay, delay + 0.18))
        // Smaller tiles read as farther away: a touch softer and dimmer.
        let far = spec.size < 64
        // Tilts in 3D along its flight path, then keeps a gentle wobble.
        let flip = reduceMotion ? 0 : (1 - s) * 55 + sin(t * 1.9 + phase) * 7
        return SignalLogo(symbol: symbol, size: spec.size)
            .rotation3DEffect(.degrees(flip), axis: (x: -out.y, y: out.x, z: 0), perspective: 0.6)
            .shadow(color: .black.opacity(0.6), radius: 14, y: 8)
            .shadow(color: SignalBrand.chart(symbol).opacity(0.3), radius: 20)
            .rotationEffect(.degrees(spec.tilt + (reduceMotion ? 0 : (1 - s) * spec.tilt * 3.5)))
            .scaleEffect(reduceMotion ? 1 : 0.55 + 0.45 * s)
            .blur(radius: (far ? 0.6 : 0) + 6 * exit)
            .brightness(far ? -0.06 : 0)
            .opacity(appear * (1 - exit))
            .position(x: rest.x + out.x * travel, y: rest.y + out.y * travel + float)
    }

    private func title(t: TimeInterval, exit: Double) -> some View {
        HStack(spacing: 9) {
            ForEach(Array(titleWords.enumerated()), id: \.offset) { index, word in
                reveal(Text(word), t: t, delay: 0.72 + Double(index) * 0.08, rise: 16)
            }
        }
        .font(.system(size: 34, weight: .bold))
        .tracking(-0.8)
        .foregroundStyle(.white)
        .lineLimit(1)
        .minimumScaleFactor(0.7)
        .offset(y: -14 * exit)
        .blur(radius: 6 * exit)
        .opacity(1 - min(1, exit * 1.6))
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Pro Trading Skills")
        .accessibilityIdentifier("pts-login-splash-title")
    }

    /// Word reveal: rises out of a blur on a soft spring.
    private func reveal(_ text: Text, t: TimeInterval, delay: TimeInterval, rise: CGFloat) -> some View {
        let s = reduceMotion ? progress(t, delay, delay + 0.4) : spring(t, delay: delay, response: 0.5, damping: 0.82)
        let fade = progress(t, delay, delay + 0.28)
        return text
            .opacity(fade)
            .blur(radius: 8 * (1 - fade))
            .offset(y: reduceMotion ? 0 : rise * (1 - s))
    }

    /// Thin horizontal levels that draw across the screen, echoing the
    /// entry / stop / target lines on Daniel's charts. Purely decorative.
    private func levels(t: TimeInterval, size: CGSize) -> some View {
        let rows: [(y: CGFloat, alpha: Double)] = [(0.105, 0.16), (0.30, 0.24), (0.675, 0.22), (0.885, 0.14)]
        return ZStack(alignment: .topLeading) {
            ForEach(Array(rows.enumerated()), id: \.offset) { index, row in
                let draw = reduceMotion ? 1 : easeOut(progress(t, 0.08 + Double(index) * 0.07, 0.9 + Double(index) * 0.07))
                let y = size.height * row.y
                Path { path in
                    path.move(to: CGPoint(x: 0, y: y))
                    path.addLine(to: CGPoint(x: size.width, y: y))
                }
                .trim(from: 0, to: draw)
                .stroke(LinearGradient(colors: [.clear, Theme.accentSoft.opacity(row.alpha), Theme.accentSoft.opacity(row.alpha), .clear],
                                       startPoint: .leading, endPoint: .trailing), lineWidth: 0.5)
                // Glowing head that rides the line while it draws.
                Circle()
                    .fill(Theme.accentSoft)
                    .frame(width: 3, height: 3)
                    .shadow(color: Theme.accent, radius: 5)
                    .position(x: size.width * draw, y: y)
                    .opacity(reduceMotion || draw == 0 ? 0 : 1 - draw)
            }
        }
        .frame(width: size.width, height: size.height)
        .accessibilityHidden(true)
    }

    // MARK: - Curves

    private func progress(_ t: TimeInterval, _ from: TimeInterval, _ to: TimeInterval) -> Double {
        min(1, max(0, (t - from) / (to - from)))
    }

    private func easeOut(_ x: Double) -> Double { 1 - pow(1 - min(1, max(0, x)), 3) }
    private func easeIn(_ x: Double) -> Double { pow(min(1, max(0, x)), 2) }

    /// Closed-form damped spring from 0 to 1 (overshoots when damping < 1),
    /// so the motion stays deterministic frame by frame.
    private func spring(_ t: TimeInterval, delay: TimeInterval, response: Double, damping: Double) -> Double {
        let x = t - delay
        guard x > 0 else { return 0 }
        let omega = 2 * Double.pi / response
        let damped = omega * sqrt(1 - damping * damping)
        return 1 - exp(-damping * omega * x) * (cos(damped * x) + damping * omega / damped * sin(damped * x))
    }
}
