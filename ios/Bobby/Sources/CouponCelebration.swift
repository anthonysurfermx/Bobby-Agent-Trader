// Animation proposed by Claude CLI; integrated and verified locally.
import SwiftUI

private func seg(_ p: CGFloat, _ a: CGFloat, _ b: CGFloat) -> CGFloat {
    let t = min(max((p - a) / (b - a), 0), 1); return 1 - pow(1 - t, 3) // Cubic ease-out
}

struct CouponCelebration: View {
    let reduceMotion: Bool
    @State private var progress: CGFloat = 0
    var body: some View {
        CelebrationFrame(progress: reduceMotion ? 1 : progress, still: reduceMotion)
            .frame(width: 120, height: 120)
            .accessibilityHidden(true)
            .task(id: reduceMotion) {
                guard !reduceMotion, progress == 0 else { return } // One shot per receipt
                withAnimation(.linear(duration: 1.2)) { progress = 1 }
            }
            .onDisappear {
                var t = Transaction(); t.disablesAnimations = true
                withTransaction(t) { progress = 1 } // Cancel and leave the static resting frame
            }
    }
}

private struct CelebrationFrame: View, Animatable {
    var progress: CGFloat
    let still: Bool
    var animatableData: CGFloat { get { progress } set { progress = newValue } }
    var body: some View {
        let check = seg(progress, 0.25, 0.6)
        ZStack {
            Canvas { ctx, size in draw(ctx, size) }
            Image(systemName: "checkmark").font(.system(size: 30, weight: .bold)).foregroundStyle(Theme.cream)
                .scaleEffect(0.6 + 0.4 * check + 0.12 * sin(check * .pi)).opacity(check)
        }
    }
    private func draw(_ ctx: GraphicsContext, _ size: CGSize) {
        let c = CGPoint(x: size.width / 2, y: size.height / 2), u = min(size.width, size.height) / 120
        let ring = seg(progress, 0, 0.6), burst = seg(progress, 0.1, 0.85), check = seg(progress, 0.25, 0.6)
        func circle(_ r: CGFloat) -> Path { Path(ellipseIn: CGRect(x: c.x - r, y: c.y - r, width: 2 * r, height: 2 * r)) }
        let orb = GraphicsContext.Shading.linearGradient(Gradient(colors: [Theme.orbViolet, Theme.orbBlue]),
            startPoint: .zero, endPoint: CGPoint(x: size.width, y: size.height))
        ctx.fill(circle(58 * u), with: .radialGradient(Gradient(colors: [Theme.orbViolet.opacity(0.2 + 0.3 * check),
            Theme.orbBlue.opacity(0.12), .clear]), center: c, startRadius: 0, endRadius: 58 * u))
        var ringCtx = ctx; ringCtx.opacity = 1 - 0.65 * ring
        ringCtx.stroke(circle((16 + 36 * ring) * u), with: orb, lineWidth: (3 - 1.5 * ring) * u)
        if !still && burst > 0 && burst < 1 {
            let palette = [Theme.orbViolet, Theme.cream, Theme.orbBlue]
            for i in 0..<16 { // Deterministic particle directions
                let a: CGFloat = CGFloat(i) * .pi / 8 + (i % 2 == 0 ? 0 : 0.12)
                let d: CGFloat = (12 + (26 + CGFloat(i * 7 % 5) * 3) * burst) * u
                let s: CGFloat = (i % 3 == 0 ? 5 : 3.5) * u * (1 - 0.4 * burst)
                var g = ctx
                g.opacity = min(1, burst * 8) * (1 - pow(burst, 3))
                g.translateBy(x: c.x + cos(a) * d, y: c.y + sin(a) * d)
                g.rotate(by: .radians(Double(a + burst * 2)))
                let box = CGRect(x: -s / 2, y: -s / 2, width: s, height: s)
                var tri = Path()
                tri.addLines([CGPoint(x: 0, y: -s / 2), CGPoint(x: s / 2, y: s / 2), CGPoint(x: -s / 2, y: s / 2)]); tri.closeSubpath()
                g.fill(i % 3 == 0 ? Path(box) : i % 3 == 1 ? Path(ellipseIn: box) : tri, with: .color(palette[i % 3]))
            }
        }
        ctx.fill(circle(22 * u * (0.7 + 0.3 * seg(progress, 0, 0.3))), with: orb) // Core
    }
}
