// The notch HUD: while Bobby reads an asset, a black pill grows out of the top of the
// screen and narrates the read — the step that just finished, dim, above the step
// running now, with a breathing glyph. Every line comes from the desk's real stages
// (`ask.stage`, the debate request, the ask's result); nothing here is scripted.
import SwiftUI

@MainActor
final class NucleoNotch: ObservableObject {
    struct Line: Equatable, Identifiable {
        let id = UUID()
        let text: String
    }

    enum Mood: Equatable { case working, done, failed }

    @Published private(set) var visible = false
    @Published private(set) var previous: Line?
    @Published private(set) var current: Line?
    @Published private(set) var mood: Mood = .working
    /// Debate level's ink, so Deep and Max glow in their own colour.
    @Published private(set) var tint: Color = Theme.cream

    private var symbol: String?
    private var level: NucleoAnalysisLevel = .rapido
    /// Live desk lines that beat the "debating" line here (the debate starts beside the market read).
    private var pending: [[String: Any]] = []
    private var debateOpen = false
    private var hideTask: Task<Void, Never>?

    func stage(_ payload: [String: Any]) {
        guard let stage = payload["stage"] as? String else { return }
        switch stage {
        case "resolving":
            hideTask?.cancel()
            symbol = nil
            pending = []
            debateOpen = false
            previous = nil
            mood = .working
            tint = Theme.cream
            visible = true
            push(L.t("Finding the asset", "Buscando el activo"))
        case "accepted":
            let asset = payload["asset"] as? [String: Any]
            symbol = asset?["symbol"] as? String
            push(L.t("Reading \(symbol ?? "the asset")", "Leyendo \(symbol ?? "el activo")"))
        case "market":
            let market = payload["market"] as? [String: Any]
            if let price = market?["price"] as? Double {
                var text = "\(symbol ?? "") \(Self.price(price))"
                if let change = market?["changePct"] as? Double { text += String(format: " · %+.1f%%", change) }
                push(text.trimmingCharacters(in: .whitespaces))
            }
        case "candles":
            let count = (payload["candles"] as? [Any])?.count ?? 0
            if count > 0 { push(L.t("\(count) candles loaded", "\(count) velas cargadas")) }
        default:
            break
        }
    }

    func debating(_ level: NucleoAnalysisLevel) {
        guard visible else { return }
        self.level = level
        defer {
            debateOpen = true
            let queued = pending
            pending = []
            queued.forEach(live)
        }
        switch level {
        case .rapido: tint = Theme.cream
        case .profundo: tint = Theme.orbBlue
        case .maximo: tint = Theme.orbViolet
        }
        push(L.t("Alpha Hunter, Red Team and CIO debating", "Alpha Hunter, Red Team y CIO debaten"))
    }

    /// One line of the live desk stream (api/desk-debate NDJSON): evidence, then each argument as it lands.
    func live(_ event: [String: Any]) {
        guard visible else { return }
        guard debateOpen else { pending.append(event); return }
        switch event["type"] as? String {
        case "evidence":
            let frames = (event["timeframes"] as? [Any])?.compactMap { $0 as? String } ?? []
            if !frames.isEmpty { push(L.t("Evidence · \(frames.joined(separator: " · "))", "Evidencia · \(frames.joined(separator: " · "))")) }
        case "agent":
            guard let text = event["text"] as? String else { return }
            let snippet = text.split(whereSeparator: \.isNewline).first.map(String.init) ?? text
            switch event["role"] as? String {
            case "alpha": push("Alpha Hunter · \(snippet)")
            case "red":
                push("Red Team · \(snippet)")
                if level != .maximo { push(L.t("CIO deciding", "El CIO decide")) }
            case "rebuttal":
                push(L.t("Second round · \(snippet)", "Segunda ronda · \(snippet)"))
                push(L.t("CIO deciding", "El CIO decide"))
            default: break
            }
        default: break
        }
    }

    func finished(_ result: [String: Any]) {
        guard visible else { return }
        let status = result["status"] as? String
        switch status {
        case "ok":
            mood = .done
            let agents = result["agents"] as? [String: Any]
            let direction = agents?["direction"] as? String
            let lean: String
            switch direction {
            case "long": lean = L.t("leans long", "se inclina al alza")
            case "short": lean = L.t("leans short", "se inclina a la baja")
            default: lean = L.t("no clear side", "sin lado claro")
            }
            push(L.t("Read ready · \(lean)", "Lectura lista · \(lean)"))
            hide(after: 2.4)
        case "cancelled":
            hide(after: 0)
        case "error":
            mood = .failed
            push(L.t("The read did not finish", "La lectura no terminó"))
            hide(after: 2.0)
        default:
            // confirm, gates, quota, unsupported…: the page answers with its own prompt; the HUD steps aside.
            hide(after: 0)
        }
    }

    private func push(_ text: String) {
        guard text != current?.text else { return }
        withAnimation(.spring(response: 0.5, dampingFraction: 0.78)) {
            previous = current
            current = Line(text: text)
        }
    }

    private func hide(after seconds: Double) {
        hideTask?.cancel()
        hideTask = Task { [weak self] in
            if seconds > 0 { try? await Task.sleep(for: .seconds(seconds)) }
            guard !Task.isCancelled, let self else { return }
            withAnimation(.spring(response: 0.45, dampingFraction: 0.85)) { self.visible = false }
            self.previous = nil
            self.current = nil
        }
    }

    private static func price(_ value: Double) -> String {
        let f = NumberFormatter()
        f.numberStyle = .currency
        f.currencyCode = "USD"
        f.maximumFractionDigits = value >= 100 ? 0 : (value >= 1 ? 2 : 4)
        return f.string(from: NSNumber(value: value)) ?? String(value)
    }
}

/// The pill itself. Anchored to the top edge so on Dynamic Island phones it reads as the island growing.
struct NucleoNotchView: View {
    @ObservedObject var notch: NucleoNotch
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        VStack(spacing: 0) {
            if notch.visible, let current = notch.current {
                VStack(spacing: 4) {
                    if let previous = notch.previous {
                        Text(previous.text)
                            .font(.system(size: 13, weight: .regular))
                            .foregroundStyle(Theme.cream.opacity(0.38))
                            .lineLimit(1)
                            .id(previous.id)
                            .transition(.asymmetric(insertion: .push(from: .bottom), removal: .opacity))
                    }
                    HStack(spacing: 8) {
                        NotchGlyph(tint: notch.tint, mood: notch.mood, still: reduceMotion)
                        Text(current.text)
                            .font(.system(size: 15, weight: .medium))
                            .foregroundStyle(Theme.cream)
                            .lineLimit(1)
                    }
                    .id(current.id)
                    .transition(.asymmetric(insertion: .push(from: .bottom), removal: .opacity))
                }
                .padding(.horizontal, 22)
                .padding(.top, 44)
                .padding(.bottom, 14)
                .frame(minWidth: 200, maxWidth: 290)
                .background(
                    UnevenRoundedRectangle(bottomLeadingRadius: 26, bottomTrailingRadius: 26, style: .continuous)
                        .fill(Color.black)
                        .shadow(color: notch.tint.opacity(0.18), radius: 18, y: 6)
                )
                .transition(.scale(scale: 0.4, anchor: .top).combined(with: .opacity))
                .accessibilityElement(children: .combine)
                .accessibilityAddTraits(.updatesFrequently)
            }
            Spacer(minLength: 0)
        }
        .frame(maxWidth: .infinity)
        .ignoresSafeArea(edges: .top)
        .animation(.spring(response: 0.5, dampingFraction: 0.78), value: notch.visible)
        .animation(.spring(response: 0.5, dampingFraction: 0.78), value: notch.current)
        .allowsHitTesting(false)
    }
}

/// A 3×3 pixel glyph whose cells breathe out of phase — the hypnotic part.
private struct NotchGlyph: View {
    let tint: Color
    let mood: NucleoNotch.Mood
    let still: Bool

    var body: some View {
        TimelineView(.animation(paused: still || mood != .working)) { context in
            let t = context.date.timeIntervalSinceReferenceDate
            Canvas { ctx, size in
                let cell = size.width / 3
                for row in 0..<3 {
                    for col in 0..<3 {
                        let phase = Double(row + col) * 0.55
                        let pulse = mood == .working ? 0.35 + 0.65 * (0.5 + 0.5 * sin(t * 3.2 - phase)) : 1
                        let rect = CGRect(x: CGFloat(col) * cell + 0.6, y: CGFloat(row) * cell + 0.6, width: cell - 1.2, height: cell - 1.2)
                        ctx.fill(Path(roundedRect: rect, cornerRadius: 1), with: .color(color.opacity(pulse)))
                    }
                }
            }
        }
        .frame(width: 13, height: 13)
        .shadow(color: color.opacity(0.9), radius: 4)
        .shadow(color: color.opacity(0.5), radius: 9)
    }

    private var color: Color {
        switch mood {
        case .working: return tint
        case .done: return Theme.up
        case .failed: return Theme.down
        }
    }
}
