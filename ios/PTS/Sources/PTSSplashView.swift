import SwiftUI

struct PTSLaunchView: View {
    @State private var showSplash = true

    var body: some View {
        Group {
            if showSplash {
                PTSSplashView {
                    withAnimation(.easeOut(duration: 0.20)) {
                        showSplash = false
                    }
                }
            } else {
                SignalHome()
            }
        }
    }
}

/// The PTS identity motion shown before the signal home (≈2.75 s with the
/// fade). One timeline drives every layer: the bull runs in with motion blur
/// and light streaks, lands with a pulse and a ring, a glint crosses it, and
/// the title reveals behind it before a gold rule draws underneath. The final
/// frame keeps the approved composition: title left, bull landing at right.
struct PTSSplashView: View {
    let onFinished: () -> Void

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var start: Date?

    private let title = Array("Pro trading Skills")
    private static let duration: TimeInterval = 2.55
    // Geometry of the bull inside the original 942×1670 artwork.
    private static let art = CGSize(width: 942, height: 1670)
    private static let bullCenter = CGPoint(x: 0.1561, y: 0.494)
    private static let bullWidth: CGFloat = 0.2484

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
            DispatchQueue.main.asyncAfter(deadline: .now() + Self.duration) { onFinished() }
        }
    }

    // MARK: - Timeline

    private func frame(t: TimeInterval, size: CGSize) -> some View {
        let scale = min(size.width / Self.art.width, size.height / Self.art.height)
        let shown = CGSize(width: Self.art.width * scale, height: Self.art.height * scale)
        let origin = CGPoint(x: (size.width - shown.width) / 2, y: (size.height - shown.height) / 2)
        let bullW = Self.bullWidth * shown.width
        let bullH = bullW * 186 / 234
        // Same landing spot as the approved splash (artwork offset by 70 % of the width).
        let end = CGPoint(x: origin.x + Self.bullCenter.x * shown.width + size.width * 0.70,
                          y: origin.y + Self.bullCenter.y * shown.height)
        let startX = -bullW
        let run = reduceMotion ? 1 : ease(progress(t, 0.10, 1.30))
        let bullX = startX + (end.x - startX) * run
        let landing = progress(t, 1.18, 1.62)
        let bump = reduceMotion ? 0 : sin(landing * .pi) * 0.05
        let titleCenter = CGPoint(x: size.width * 0.39, y: size.height * 0.52)

        return ZStack {
            Color.black

            // Warm halo that settles behind the landed bull.
            RadialGradient(colors: [Theme.accent.opacity(0.28), .clear], center: .center, startRadius: 0, endRadius: bullW * 1.6)
                .frame(width: bullW * 3.2, height: bullW * 3.2)
                .position(end)
                .opacity(progress(t, 1.15, 1.7) * (0.85 + 0.15 * sin(t * 3)))

            if !reduceMotion {
                streaks(bullX: bullX, y: end.y, bullW: bullW, bullH: bullH, speed: 1 - run)
                // Impact ring on landing.
                Circle()
                    .stroke(Theme.accentSoft, lineWidth: 1.2)
                    .frame(width: bullW * (0.6 + 1.4 * landing), height: bullW * (0.6 + 1.4 * landing))
                    .position(end)
                    .opacity(landing > 0 ? (1 - landing) * 0.6 : 0)
            }

            titleView(t: t, bullX: bullX, center: titleCenter)

            // Gold rule drawing under the title once the bull lands.
            Capsule()
                .fill(LinearGradient(colors: [Theme.accent.opacity(0), Theme.accent, Theme.accentSoft], startPoint: .leading, endPoint: .trailing))
                .frame(width: 190 * ease(progress(t, 1.35, 1.9)), height: 1.5)
                .frame(width: 190, alignment: .leading)
                .position(x: titleCenter.x, y: titleCenter.y + 22)
                .opacity(progress(t, 1.3, 1.5))

            bull(width: bullW, height: bullH, t: t, run: run)
                .scaleEffect(x: 1 + bump + (reduceMotion ? 0 : 0.16 * (1 - run)), y: 1 + bump, anchor: .center)
                .blur(radius: reduceMotion ? 0 : 11 * pow(1 - run, 1.6))
                .opacity(reduceMotion ? progress(t, 0.1, 0.7) : min(1, progress(t, 0.1, 0.35) * 1.2))
                .position(x: bullX, y: end.y)
                .accessibilityIdentifier("pts-login-splash-bull")
        }
    }

    private func bull(width: CGFloat, height: CGFloat, t: TimeInterval, run: Double) -> some View {
        let glint = progress(t, 1.35, 1.85)
        return Image("pts-bull-mark")
            .resizable()
            .scaledToFit()
            .frame(width: width, height: height)
            .overlay {
                // A diagonal light band sweeps across the gold, clipped to the bull.
                LinearGradient(colors: [.clear, .white.opacity(0.85), .clear], startPoint: .leading, endPoint: .trailing)
                    .frame(width: width * 0.35, height: height * 1.8)
                    .rotationEffect(.degrees(22))
                    .offset(x: -width + glint * width * 2)
                    .blendMode(.plusLighter)
                    .opacity(reduceMotion || glint == 0 || glint == 1 ? 0 : 1)
                    .mask(Image("pts-bull-mark").resizable().scaledToFit().frame(width: width, height: height))
            }
            .shadow(color: Theme.accent.opacity(0.35 * progress(t, 1.2, 1.7)), radius: 14)
    }

    private func streaks(bullX: CGFloat, y: CGFloat, bullW: CGFloat, bullH: CGFloat, speed: Double) -> some View {
        let specs: [(dy: CGFloat, length: CGFloat, weight: CGFloat)] = [(-bullH * 0.22, 1.0, 1.6), (0, 1.35, 1.1), (bullH * 0.24, 0.8, 1.2)]
        return ZStack {
            ForEach(Array(specs.enumerated()), id: \.offset) { _, spec in
                let length = bullW * 2.2 * spec.length * speed
                Capsule()
                    .fill(LinearGradient(colors: [Theme.accent.opacity(0), Theme.accentSoft.opacity(0.9)], startPoint: .leading, endPoint: .trailing))
                    .frame(width: max(0, length), height: spec.weight)
                    .position(x: bullX - bullW * 0.35 - length / 2, y: y + spec.dy)
            }
        }
        .opacity(min(1, speed * 1.4))
    }

    private func titleView(t: TimeInterval, bullX: CGFloat, center: CGPoint) -> some View {
        let letterWidth: CGFloat = 11.6
        let startX = center.x - CGFloat(title.count) * letterWidth / 2
        return HStack(spacing: 0) {
            ForEach(Array(title.enumerated()), id: \.offset) { index, character in
                // Each letter appears as the bull passes it (or on a gentle
                // stagger with Reduce Motion).
                let letterX = startX + (CGFloat(index) + 0.5) * letterWidth
                let reveal = reduceMotion
                    ? progress(t, 0.4 + Double(index) * 0.03, 0.9 + Double(index) * 0.03)
                    : min(1, max(0, Double((bullX - letterX) / 46)))
                Text(String(character))
                    .font(.system(size: 22, weight: .bold, design: .rounded))
                    .foregroundStyle(.white)
                    .opacity(reveal)
                    .blur(radius: 5 * (1 - reveal))
                    .offset(y: 8 * (1 - reveal))
            }
        }
        .shadow(color: Theme.accent.opacity(0.35), radius: 12)
        .position(center)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Pro trading Skills")
        .accessibilityIdentifier("pts-login-splash-title")
    }

    // MARK: - Easing

    private func progress(_ t: TimeInterval, _ from: TimeInterval, _ to: TimeInterval) -> Double {
        min(1, max(0, (t - from) / (to - from)))
    }

    /// Cubic ease-out: a readable run that decelerates into a soft landing.
    private func ease(_ x: Double) -> Double {
        1 - pow(1 - min(1, max(0, x)), 3)
    }
}
