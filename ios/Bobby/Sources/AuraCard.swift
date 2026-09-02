// "Mi aura hoy" — the locally-generated share card (Kimi red-team v3 P0-2).
// Identity + status + a real recent insight; rendered on-device with
// ImageRenderer and shared as a 1080×1350 image. No fabricated data: the
// insight line only appears when there IS a real last analysis.
import SwiftUI
import AVFoundation

struct AuraCardData {
    let agentName: String
    let auraText: String
    let tint: Color
    let tintSoft: Color
    let archetype: (name: String, motto: String)
    let streak: Int
    /// Real last analysis, if any: (symbol, one-line summary).
    let insight: (symbol: String, line: String)?
}

struct AuraCardView: View {
    let data: AuraCardData
    var scale: CGFloat = 1
    var animateOrb = false

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                HStack(spacing: 7 * scale) {
                    Circle().fill(data.tint).frame(width: 7 * scale, height: 7 * scale)
                    Text("BOBBY // AURA")
                        .font(.mono(11 * scale, .bold))
                        .kerning(2 * scale)
                        .foregroundStyle(.white.opacity(0.75))
                }
                Spacer()
                Text(Date.now.formatted(.dateTime.day().month(.abbreviated)))
                    .font(.mono(10 * scale, .bold))
                    .foregroundStyle(data.tintSoft)
            }
            .padding(.bottom, 14 * scale)

            // Everything below is budgeted to fit the fixed 360×450 (4:5)
            // card: orb + name + archetype + streak + insight + footer.
            AuraOrbPreview(data: data, size: 140 * scale, animated: animateOrb)
                .frame(height: 146 * scale)
                .padding(.bottom, 10 * scale)

            Text(data.agentName.uppercased())
                .font(.mono(26 * scale, .bold))
                .kerning(3 * scale)
                .foregroundStyle(.white)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
            Text("“\(data.auraText)”")
                .font(.rounded(14 * scale, .semibold))
                .foregroundStyle(data.tintSoft)
                .lineLimit(2)
                .minimumScaleFactor(0.8)
                .multilineTextAlignment(.center)
                .padding(.top, 4 * scale)

            HStack(spacing: 8 * scale) {
                Text(data.archetype.name)
                    .font(.mono(12 * scale, .bold))
                    .kerning(1.6 * scale)
                    .foregroundStyle(.black)
                    .padding(.horizontal, 12 * scale)
                    .padding(.vertical, 6 * scale)
                    .background(Capsule().fill(data.tint))
                Text(data.archetype.motto)
                    .font(.rounded(12 * scale, .medium))
                    .foregroundStyle(.white.opacity(0.6))
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
            }
            .padding(.top, 10 * scale)

            if data.streak >= 2 {
                Text(L.t("🔥 day \(data.streak) with \(data.agentName)", "🔥 día \(data.streak) con \(data.agentName)"))
                    .font(.mono(11 * scale, .semibold))
                    .foregroundStyle(.white.opacity(0.7))
                    .padding(.top, 8 * scale)
            }

            if let insight = data.insight {
                VStack(alignment: .leading, spacing: 6 * scale) {
                    Text(L.t("LAST READ · \(insight.symbol)", "ÚLTIMA LECTURA · \(insight.symbol)"))
                        .font(.mono(9 * scale, .bold))
                        .kerning(1.4 * scale)
                        .foregroundStyle(data.tintSoft)
                    Text(insight.line)
                        .font(.rounded(12.5 * scale, .medium))
                        .foregroundStyle(.white.opacity(0.82))
                        .lineLimit(2)
                        .multilineTextAlignment(.leading)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(11 * scale)
                .background(Color.white.opacity(0.05))
                .clipShape(RoundedRectangle(cornerRadius: 12 * scale))
                .overlay(RoundedRectangle(cornerRadius: 12 * scale).stroke(data.tint.opacity(0.3), lineWidth: 1))
                .padding(.top, 12 * scale)
            }

            Spacer(minLength: 8 * scale)

            HStack {
                Text("bobbyprotocol.xyz")
                    .font(.mono(11 * scale, .bold))
                    .kerning(1.2 * scale)
                    .foregroundStyle(.white.opacity(0.5))
                Spacer()
                Text(L.t("ANALYSIS, NOT ADVICE", "ANÁLISIS, NO CONSEJO"))
                    .font(.mono(8 * scale, .medium))
                    .kerning(1 * scale)
                    .foregroundStyle(.white.opacity(0.3))
            }
        }
        .padding(.horizontal, 24 * scale)
        .padding(.vertical, 20 * scale)
        .frame(width: 360 * scale, height: 450 * scale)
        .background(
            ZStack {
                Color(red: 0.012, green: 0.014, blue: 0.022)
                RadialGradient(colors: [data.tint.opacity(0.22), .clear], center: UnitPoint(x: 0.5, y: 0.3), startRadius: 0, endRadius: 300 * scale)
            }
        )
    }
}

/// The share preview should feel like a living aura, not a printed badge.
/// Its exported card remains centered and still so the 1080×1350 image is crisp.
private struct AuraOrbPreview: View {
    let data: AuraCardData
    let size: CGFloat
    let animated: Bool
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        if animated && !reduceMotion {
            TimelineView(.animation(minimumInterval: 1.0 / 30.0)) { timeline in
                let t = timeline.date.timeIntervalSinceReferenceDate
                let lift = CGFloat(sin(t * 1.35))
                ZStack {
                    Ellipse()
                        .fill(data.tint.opacity(0.16 + Double((lift + 1) * 0.035)))
                        .frame(width: size * 0.54, height: size * 0.11)
                        .blur(radius: size * 0.055)
                        .offset(y: size * 0.42 - lift * size * 0.018)

                    BobbyOrb(size: size, level: 0.34, tint: data.tint, tintSoft: data.tintSoft)
                        .scaleEffect(1 + lift * 0.018)
                        .offset(y: lift * size * 0.065)
                        .shadow(color: data.tint.opacity(0.36), radius: size * 0.11)
                }
            }
        } else {
            BobbyOrb(size: size, level: 0.22, tint: data.tint, tintSoft: data.tintSoft)
        }
    }
}

/// Sheet with a live preview + share button. The card renders at 3× (1080×1350).
struct AuraCardSheet: View {
    let data: AuraCardData
    var soundEnabled = true
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        VStack(spacing: 18) {
            HStack {
                Text(L.t("MY AURA TODAY", "MI AURA HOY"))
                    .font(.mono(12, .bold))
                    .kerning(2)
                    .foregroundStyle(data.tintSoft)
                Spacer()
                Button { dismiss() } label: {
                    Image(systemName: "xmark")
                        .font(.system(size: 12, weight: .bold))
                        .foregroundStyle(Theme.muted)
                        .frame(width: 30, height: 30)
                        .background(Circle().fill(Theme.card))
                }
            }
            // Preview scales to the sheet so the whole 4:5 card is visible on
            // every phone; the shared image still renders at 3× (1080×1350).
            GeometryReader { geo in
                let previewScale = min(1, geo.size.width / 360, geo.size.height / 450)
                AuraCardView(data: data, scale: previewScale, animateOrb: true)
                    .clipShape(RoundedRectangle(cornerRadius: 18 * previewScale))
                    .overlay(RoundedRectangle(cornerRadius: 18 * previewScale).stroke(Color.white.opacity(0.1), lineWidth: 1))
                    .shadow(color: data.tint.opacity(0.25), radius: 30, y: 10)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
            .aspectRatio(360.0 / 450.0, contentMode: .fit)

            if let image = renderCard() {
                ShareLink(
                    item: Image(uiImage: image),
                    preview: SharePreview("Mi aura — \(data.agentName)", image: Image(uiImage: image))
                ) {
                    HStack {
                        Image(systemName: "square.and.arrow.up")
                        Text(L.t("SHARE", "COMPARTIR"))
                            .font(.mono(12, .bold))
                            .kerning(1.7)
                    }
                    .foregroundStyle(.white)
                    .frame(maxWidth: .infinity)
                    .frame(height: 52)
                    .background(data.tint)
                    .clipShape(RoundedRectangle(cornerRadius: 12))
                }
            }
        }
        .padding(20)
        .presentationDetents([.large])
        .presentationBackground(Theme.bg)
        .onAppear {
            if soundEnabled { AuraAudio.shared.start() }
        }
        .onDisappear { AuraAudio.shared.stop() }
    }

    @MainActor
    private func renderCard() -> UIImage? {
        let renderer = ImageRenderer(content: AuraCardView(data: data, scale: 3))
        renderer.scale = 1
        return renderer.uiImage
    }
}

/// A restrained orbital engine loop for the Aura sheet. It mixes with other
/// audio, fades at both edges of the sheet lifecycle and never survives dismiss.
@MainActor
private final class AuraAudio {
    static let shared = AuraAudio()
    private var player: AVAudioPlayer?

    func start() {
        stop()
        guard let data = NSDataAsset(name: "sfx_aura_orbit")?.data,
              let next = try? AVAudioPlayer(data: data, fileTypeHint: "wav") else { return }
        try? AVAudioSession.sharedInstance().setCategory(.playback, mode: .default, options: [.mixWithOthers])
        try? AVAudioSession.sharedInstance().setActive(true)
        next.numberOfLoops = -1
        next.volume = 0
        next.prepareToPlay()
        next.play()
        next.setVolume(0.28, fadeDuration: 0.7)
        player = next
    }

    func stop() {
        guard let current = player else { return }
        player = nil
        current.setVolume(0, fadeDuration: 0.35)
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.4) { current.stop() }
    }
}
