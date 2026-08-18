// "Mi aura hoy" — the locally-generated share card (Kimi red-team v3 P0-2).
// Identity + status + a real recent insight; rendered on-device with
// ImageRenderer and shared as a 1080×1350 image. No fabricated data: the
// insight line only appears when there IS a real last analysis.
import SwiftUI

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
            .padding(.bottom, 26 * scale)

            BobbyOrb(size: 190 * scale, level: 0.22, tint: data.tint, tintSoft: data.tintSoft)
                .frame(height: 196 * scale)
                .padding(.bottom, 20 * scale)

            Text(data.agentName.uppercased())
                .font(.mono(30 * scale, .bold))
                .kerning(3 * scale)
                .foregroundStyle(.white)
            Text("“\(data.auraText)”")
                .font(.rounded(15 * scale, .semibold))
                .foregroundStyle(data.tintSoft)
                .padding(.top, 5 * scale)

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
            }
            .padding(.top, 14 * scale)

            if data.streak >= 2 {
                Text("🔥 día \(data.streak) hablando con \(data.agentName)")
                    .font(.mono(11 * scale, .semibold))
                    .foregroundStyle(.white.opacity(0.7))
                    .padding(.top, 12 * scale)
            }

            if let insight = data.insight {
                VStack(alignment: .leading, spacing: 6 * scale) {
                    Text("ÚLTIMA LECTURA · \(insight.symbol)")
                        .font(.mono(9 * scale, .bold))
                        .kerning(1.4 * scale)
                        .foregroundStyle(data.tintSoft)
                    Text(insight.line)
                        .font(.rounded(13 * scale, .medium))
                        .foregroundStyle(.white.opacity(0.82))
                        .lineLimit(3)
                        .multilineTextAlignment(.leading)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(14 * scale)
                .background(Color.white.opacity(0.05))
                .clipShape(RoundedRectangle(cornerRadius: 12 * scale))
                .overlay(RoundedRectangle(cornerRadius: 12 * scale).stroke(data.tint.opacity(0.3), lineWidth: 1))
                .padding(.top, 18 * scale)
            }

            Spacer(minLength: 12 * scale)

            HStack {
                Text("bobbyprotocol.xyz")
                    .font(.mono(11 * scale, .bold))
                    .kerning(1.2 * scale)
                    .foregroundStyle(.white.opacity(0.5))
                Spacer()
                Text("ANÁLISIS, NO CONSEJO")
                    .font(.mono(8 * scale, .medium))
                    .kerning(1 * scale)
                    .foregroundStyle(.white.opacity(0.3))
            }
        }
        .padding(28 * scale)
        .frame(width: 360 * scale, height: 450 * scale)
        .background(
            ZStack {
                Color(red: 0.012, green: 0.014, blue: 0.022)
                RadialGradient(colors: [data.tint.opacity(0.22), .clear], center: UnitPoint(x: 0.5, y: 0.3), startRadius: 0, endRadius: 300 * scale)
            }
        )
    }
}

/// Sheet with a live preview + share button. The card renders at 3× (1080×1350).
struct AuraCardSheet: View {
    let data: AuraCardData
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        VStack(spacing: 18) {
            HStack {
                Text("MI AURA HOY")
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
            AuraCardView(data: data)
                .clipShape(RoundedRectangle(cornerRadius: 18))
                .overlay(RoundedRectangle(cornerRadius: 18).stroke(Color.white.opacity(0.1), lineWidth: 1))
                .shadow(color: data.tint.opacity(0.25), radius: 30, y: 10)

            if let image = renderCard() {
                ShareLink(
                    item: Image(uiImage: image),
                    preview: SharePreview("Mi aura — \(data.agentName)", image: Image(uiImage: image))
                ) {
                    HStack {
                        Image(systemName: "square.and.arrow.up")
                        Text("COMPARTIR")
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
    }

    @MainActor
    private func renderCard() -> UIImage? {
        let renderer = ImageRenderer(content: AuraCardView(data: data, scale: 3))
        renderer.scale = 1
        return renderer.uiImage
    }
}
