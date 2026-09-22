// Onboarding beat 3 — the AURA FORGE. No cards, no copy: the companion
// stands on the forge's platform, turning 360°, while an X-ray scan sweeps it
// head to toe and materializes it (FloatingMascotView + XRayScan). The
// platform charges with each quarter of the scan; when it finishes the aura
// maxes out with one hit, one haptic and one burst.
import SwiftUI
import AVFoundation

/// The aura forge: the machine (Higgsfield render) with the companion standing
/// on its platform. Rings spin in perspective and the platform charges with
/// the scan — all live SwiftUI around a live 3D model, no video.
struct AuraForgeStage<Content: View>: View {
    let tint: Color
    /// 0…4: quarters of the first scan pass.
    let charged: Int
    let ready: Bool
    @ViewBuilder let content: () -> Content
    @State private var spin = false
    @State private var pulse = false
    @State private var burst = false

    var body: some View {
        GeometryReader { geo in
            let w = geo.size.width
            let h = geo.size.height
            ZStack {
                Image("aura_forge")
                    .resizable()
                    .scaledToFill()
                    .frame(width: w, height: h)
                    .scaleEffect(pulse ? 1.0 : 1.04)
                    .animation(.easeInOut(duration: 12).repeatForever(autoreverses: true), value: pulse)
                    .clipped()
                // The platform charges: brighter with every quarter scanned.
                Ellipse()
                    .fill(RadialGradient(colors: [tint.opacity(0.22 + Double(charged) * 0.16), .clear],
                                         center: .center, startRadius: 0, endRadius: w * 0.38))
                    .frame(width: w * 0.76, height: h * 0.19)
                    .blur(radius: 12)
                    .scaleEffect(pulse ? 1.1 : 1)
                    .position(x: w / 2, y: h * 0.72)
                    .animation(.easeInOut(duration: 2).repeatForever(autoreverses: true), value: pulse)
                    .animation(.easeOut(duration: 0.4), value: charged)
                // Rings around the feet, in perspective.
                Circle()
                    .stroke(tint.opacity(0.7), style: StrokeStyle(lineWidth: 2, dash: [10, 8]))
                    .frame(width: w * 0.66, height: w * 0.66)
                    .rotationEffect(.degrees(spin ? 360 : 0))
                    .rotation3DEffect(.degrees(72), axis: (x: 1, y: 0, z: 0))
                    .position(x: w / 2, y: h * 0.72)
                    .animation(.linear(duration: 8).repeatForever(autoreverses: false), value: spin)
                Circle()
                    .stroke(tint.opacity(0.45), lineWidth: 1)
                    .frame(width: w * 0.54, height: w * 0.54)
                    .rotationEffect(.degrees(spin ? -360 : 0))
                    .rotation3DEffect(.degrees(72), axis: (x: 1, y: 0, z: 0))
                    .position(x: w / 2, y: h * 0.72)
                    .animation(.linear(duration: 5).repeatForever(autoreverses: false), value: spin)
                // The companion on the platform — it scans itself.
                // Framed so the feet land on the platform's light disc.
                content()
                    .frame(width: w * 0.86, height: h * 0.64)
                    .position(x: w / 2, y: h * 0.495)
                if burst {
                    SpawnBurst(tint: tint)
                        .position(x: w / 2, y: h * 0.48)
                        .allowsHitTesting(false)
                }
                if ready {
                    Text(L.t("AURA · MAX", "AURA · MÁXIMA"))
                        .font(.mono(10, .bold)).kerning(3)
                        .foregroundStyle(.black)
                        .padding(.horizontal, 12).padding(.vertical, 5)
                        .background(Capsule().fill(tint))
                        .shadow(color: tint, radius: 12)
                        .position(x: w / 2, y: 22)
                        .transition(.scale.combined(with: .opacity))
                }
            }
        }
        .aspectRatio(0.68, contentMode: .fit)
        .clipShape(RoundedRectangle(cornerRadius: 24, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 24, style: .continuous).stroke(Theme.stroke, lineWidth: 1))
        .shadow(color: tint.opacity(ready ? 0.35 : 0.15), radius: 24)
        .animation(.spring(duration: 0.5, bounce: 0.35), value: ready)
        .onAppear { spin = true; pulse = true }
        .onChange(of: ready) { _, isReady in
            guard isReady else { return }
            burst = true
            Task { @MainActor in
                try? await Task.sleep(nanoseconds: 1_400_000_000)
                withAnimation(.easeOut(duration: 0.3)) { burst = false }
            }
        }
    }
}

/// A short particle burst in the companion's tint — the "materialized" moment.
/// Pure Canvas, no assets, gone in a second.
private struct SpawnBurst: View {
    let tint: Color
    @State private var start = Date()

    private struct Particle {
        let angle: Double
        let speed: Double
        let size: Double
        let spin: Double
    }

    // Drawn once per burst: the parent re-renders mid-flight (a tap on the
    // companion) and a fresh random set would teleport every particle.
    @State private var particles: [Particle] = SpawnBurst.makeParticles()

    private static func makeParticles() -> [Particle] {
        (0..<30).map { i in
            let a = Double(i) / 30 * .pi * 2 + Double.random(in: -0.12...0.12)
            return Particle(angle: a, speed: Double.random(in: 90...170), size: Double.random(in: 3...7), spin: Double.random(in: -3...3))
        }
    }

    var body: some View {
        TimelineView(.animation) { timeline in
            let t = timeline.date.timeIntervalSince(start)
            Canvas { context, size in
                let origin = CGPoint(x: size.width / 2, y: size.height / 2)
                let life = min(1, t / 1.1)
                for p in particles {
                    let dist = p.speed * life
                    let x = origin.x + cos(p.angle) * dist
                    let y = origin.y + sin(p.angle) * dist * 0.75 + 40 * life * life
                    let alpha = 1 - life
                    let rect = CGRect(x: x - p.size / 2, y: y - p.size / 2, width: p.size, height: p.size)
                    var ctx = context
                    ctx.opacity = alpha
                    ctx.translateBy(x: x, y: y)
                    ctx.rotate(by: .radians(p.spin * life))
                    ctx.translateBy(x: -x, y: -y)
                    ctx.fill(RoundedRectangle(cornerRadius: 1.5).path(in: rect), with: .color(tint))
                }
            }
        }
        .frame(width: 360, height: 320)
        .transition(.opacity)
    }
}

/// The machine hum, scan milestones and materialization chime share a playback
/// session with avatar narration, so the silent switch cannot mute the forge.
/// The onboarding owner stops every player when leaving or backgrounding.
@MainActor
final class ForgeAudio {
    static let shared = ForgeAudio()
    private var hum: AVAudioPlayer?
    private var cues: [AVAudioPlayer] = []

    var isHumming: Bool { hum?.isPlaying == true }
    var isPlayingCue: Bool { cues.contains(where: \.isPlaying) }

    @discardableResult
    func startHum() -> Bool {
        if isHumming { return true }
        guard let player = player("sfx_forge_hum") else { return false }
        player.numberOfLoops = -1
        player.volume = 0
        guard player.play() else { return false }
        player.setVolume(0.32, fadeDuration: 0.5)
        hum = player
        return true
    }

    @discardableResult
    func charge(_ quarter: Int) -> Bool {
        playCue("sfx_forge_charge_\(min(4, max(1, quarter)))", volume: 0.65)
    }

    @discardableResult
    func auraMax() -> Bool {
        hum?.stop()
        hum = nil
        return playCue("sfx_aura_max", volume: 0.75)
    }

    func stop() {
        hum?.stop()
        hum = nil
        cues.forEach { $0.stop() }
        cues.removeAll()
    }

    private func player(_ name: String) -> AVAudioPlayer? {
        guard let data = NSDataAsset(name: name)?.data,
              let player = try? AVAudioPlayer(data: data, fileTypeHint: "wav") else { return nil }
        try? AVAudioSession.sharedInstance().setCategory(.playback, mode: .default, options: [.mixWithOthers])
        try? AVAudioSession.sharedInstance().setActive(true)
        player.prepareToPlay()
        return player
    }

    private func playCue(_ name: String, volume: Float) -> Bool {
        guard let player = player(name) else { return false }
        player.volume = volume
        guard player.play() else { return false }
        cues.removeAll { !$0.isPlaying }
        cues.append(player)
        return true
    }
}
