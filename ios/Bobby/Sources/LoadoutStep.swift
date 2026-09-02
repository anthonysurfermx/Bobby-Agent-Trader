// Onboarding beat 3 — the LOADOUT. The companion is not "an assistant with a
// pact"; it is your character, spawning into the financial world with gear.
// Each slot equips with a haptic, a sound and a pop, the way a game readies an
// avatar. The gear is the product truth in costume: live data, the NO TRADE
// shield, the lock that never touches money, the discipline core. No generic
// AI sparkle — every icon is a piece of kit.
import SwiftUI
import AudioToolbox

struct LoadoutGear: Identifiable {
    let id: String
    let icon: String
    let title: String
    let line: String
    let sound: SystemSoundID
}

enum LoadoutKit {
    static var gear: [LoadoutGear] {
        [
            .init(id: "radar", icon: "antenna.radiowaves.left.and.right",
                  title: L.t("LIVE RADAR", "RADAR EN VIVO"),
                  line: L.t("Real OKX and Yahoo candles. No delay, no smoke.",
                            "Velas reales de OKX y Yahoo. Sin retraso, sin humo."),
                  sound: 1104),
            .init(id: "shield", icon: "shield.checkered",
                  title: L.t("NO TRADE SHIELD", "ESCUDO NO TRADE"),
                  line: L.t("No clean setup? It blocks. Protecting capital also scores.",
                            "¿No hay setup limpio? Bloquea. Proteger capital también suma."),
                  sound: 1105),
            .init(id: "lock", icon: "lock.shield.fill",
                  title: L.t("VAULT LOCK", "CANDADO"),
                  line: L.t("Never touches your money or your exchange. Analysis only.",
                            "Nunca toca tu dinero ni tu exchange. Solo análisis."),
                  sound: 1103),
            .init(id: "core", icon: "bolt.circle.fill",
                  title: L.t("DISCIPLINE CORE", "NÚCLEO DE DISCIPLINA"),
                  line: L.t("Levels up with your discipline, never with your volume.",
                            "Sube de nivel con tu disciplina, nunca con tu volumen."),
                  sound: 1057),
        ]
    }

    /// Origin story per companion: two lines of lore, finance-flavored, the
    /// kind of card you read before dropping into a match.
    static func origin(for companion: Companion) -> String {
        switch companion.id {
        case "orb":
            return L.t("Born in a Base node, raised on 4H candles at 3 a.m. Never runs — waits. Today it drops with you to hunt setups that actually hold.",
                       "Nació en un nodo de Base y creció leyendo velas de 4H a las 3 a.m. No corre: espera. Hoy sale contigo a cazar setups que sí aguantan.")
        case "byte":
            return L.t("Grew up in a trading forum full of gurus and came out immune to hype. Translates the market into plain words. Mission: you never trade what you cannot explain.",
                       "Creció en un foro de trading lleno de gurús y salió inmune al humo. Traduce el mercado a español de a pie. Misión: que nunca operes lo que no puedas explicar.")
        case "kora":
            return L.t("The friend who actually read the whitepaper. Talks markets like gossip: full detail, zero fear. Your social radar on the desk.",
                       "La compa que sí leyó el whitepaper. Habla de mercados como de chisme: con detalle y sin miedo. Tu radar social en el desk.")
        case "zip":
            return L.t("Lives on the 15-minute chart. If it moved, ZIP already saw it. Fast alerts, no drama, a stop always within reach.",
                       "Vive en la gráfica de 15 minutos. Si algo se movió, ZIP ya lo vio. Alertas rápidas, cero drama y un stop siempre a la mano.")
        case "glitch":
            return L.t("The Red Team. Its job is to break your thesis before the market does. If it survives GLITCH, it survives the candle.",
                       "El Red Team. Su trabajo es romper tu tesis antes que el mercado. Si sobrevive a GLITCH, sobrevive a la vela.")
        case "momo":
            return L.t("Explores the weird corners: new tokens, tokenized stocks, whatever nobody is watching yet.",
                       "Explora los rincones raros: tokens nuevos, acciones tokenizadas, lo que nadie mira todavía.")
        case "flux":
            return L.t("Reads signals like sheet music: RSI, EMA, funding. When something is off-key, it says so.",
                       "Lee señales como partituras: RSI, EMA, funding. Cuando algo desafina, lo dice.")
        case "rook":
            return L.t("Thinks in theses, not candles. Entry, stop, invalidation. Chess, not roulette.",
                       "Piensa en tesis, no en velas. Entrada, stop, invalidación. Ajedrez, no ruleta.")
        case "halo":
            return L.t("The shield. Guards your capital when the setup is not there. Its NO TRADE also wins.",
                       "El escudo. Cuida tu capital cuando el setup no está. Su NO TRADE también gana.")
        case "axiom":
            return L.t("Keeps the track record on-chain. Every call gets written down and anyone can challenge it.",
                       "Guarda el track record on-chain. Cada llamada queda escrita y cualquiera puede retarla.")
        default:
            return L.t("Ready to drop into the desk with you.", "Listo para entrar al desk contigo.")
        }
    }
}

struct LoadoutStep: View {
    let companion: Companion
    let tint: Color
    /// Flips true once every slot is equipped; the CTA waits for it.
    @Binding var ready: Bool
    /// Every equipped piece charges the aura forge behind the companion.
    var onCharge: ((Int) -> Void)? = nil

    @State private var equipped: Set<String> = []
    @State private var popping: String?
    @State private var burst = false
    @State private var autoTask: Task<Void, Never>?

    private let gear = LoadoutKit.gear

    var body: some View {
        VStack(spacing: 10) {
            header
            Text(ready
                 ? L.t("You just built the avatar with the best aura in the market. Now go farm it.",
                       "Acabas de crear el avatar con mejor aura del mercado. Ahora a farmearla.")
                 : LoadoutKit.origin(for: companion))
                .font(.rounded(12.5, .medium))
                .foregroundStyle(Theme.text.opacity(0.82))
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.horizontal, 6)

            LazyVGrid(columns: [GridItem(.flexible(), spacing: 8), GridItem(.flexible(), spacing: 8)], spacing: 8) {
                ForEach(gear) { item in
                    slot(item)
                }
            }

            footer
        }
        .overlay(alignment: .top) {
            if burst { SpawnBurst(tint: tint).allowsHitTesting(false) }
        }
        .onAppear { startAutoEquip() }
        .onDisappear { autoTask?.cancel() }
        .accessibilityElement(children: .contain)
    }

    // MARK: header

    private var header: some View {
        HStack(alignment: .firstTextBaseline) {
            Text(ready
                 ? L.t("\(companion.name(at: 1)) · AURA READY", "\(companion.name(at: 1)) · AURA LISTA")
                 : L.t("PREPPING \(companion.name(at: 1))'S AURA…", "PREPARANDO AURA DE \(companion.name(at: 1))…"))
                .font(.mono(11, .bold))
                .kerning(1.6)
                .foregroundStyle(ready ? Theme.up : tint)
                .contentTransition(.numericText())
            Spacer()
            Text(L.t("AURA \(equipped.count)/\(gear.count)", "AURA \(equipped.count)/\(gear.count)"))
                .font(.mono(10, .medium))
                .kerning(1.2)
                .foregroundStyle(Theme.muted)
                .contentTransition(.numericText())
        }
        .animation(.spring(duration: 0.35), value: equipped.count)
    }

    // MARK: slots

    private func slot(_ item: LoadoutGear) -> some View {
        let isOn = equipped.contains(item.id)
        return Button {
            equip(item)
        } label: {
            VStack(alignment: .leading, spacing: 6) {
                HStack {
                    ZStack {
                        Circle()
                            .fill(isOn ? tint.opacity(0.18) : Theme.card)
                            .frame(width: 32, height: 32)
                        Circle()
                            .stroke(isOn ? tint.opacity(0.7) : Theme.stroke, lineWidth: 1)
                            .frame(width: 32, height: 32)
                        Image(systemName: item.icon)
                            .font(.system(size: 14, weight: .bold))
                            .foregroundStyle(isOn ? tint : Theme.muted)
                            .symbolEffect(.bounce, value: popping == item.id)
                    }
                    Spacer()
                    Text(isOn ? L.t("EQUIPPED", "EQUIPADO") : L.t("TAP", "TOCA"))
                        .font(.mono(8, .bold))
                        .kerning(1.1)
                        .foregroundStyle(isOn ? Theme.up : Theme.muted.opacity(0.7))
                }
                Text(item.title)
                    .font(.mono(10, .bold))
                    .kerning(1.0)
                    .foregroundStyle(isOn ? Theme.text : Theme.text.opacity(0.6))
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
                Text(item.line)
                    .font(.rounded(10.5, .medium))
                    .foregroundStyle(isOn ? Theme.text.opacity(0.75) : Theme.muted)
                    .fixedSize(horizontal: false, vertical: true)
                    .lineLimit(3)
            }
            .padding(10)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(isOn ? tint.opacity(0.08) : Theme.card)
            .clipShape(RoundedRectangle(cornerRadius: 12))
            .overlay(RoundedRectangle(cornerRadius: 12).stroke(isOn ? tint.opacity(0.55) : Theme.stroke, lineWidth: 1))
            .shadow(color: isOn ? tint.opacity(0.25) : .clear, radius: 10)
            .scaleEffect(popping == item.id ? 1.06 : 1)
            .animation(.spring(duration: 0.32, bounce: 0.45), value: popping == item.id)
            .animation(.easeOut(duration: 0.25), value: isOn)
        }
        .buttonStyle(.plain)
        .accessibilityLabel("\(item.title). \(item.line)")
        .accessibilityValue(isOn ? L.t("equipped", "equipado") : L.t("not equipped", "sin equipar"))
    }

    // MARK: footer (the honesty line stays — now it reads like the rulebook)

    private var footer: some View {
        VStack(spacing: 4) {
            Text(L.t("Analysis, not advice. You decide and you own the risk.",
                     "Análisis, no asesoría. Tú decides y asumes el riesgo."))
                .font(.mono(9, .medium))
                .kerning(0.8)
                .foregroundStyle(Theme.muted)
            Link(destination: URL(string: "https://bobbyprotocol.xyz/privacy")!) {
                Text(L.t("Privacy Policy", "Aviso de privacidad"))
                    .font(.mono(9, .medium))
                    .kerning(0.8)
                    .underline()
                    .foregroundStyle(Theme.muted)
            }
        }
        .padding(.top, 2)
    }

    // MARK: mechanics

    /// Slots equip themselves one by one when the screen appears — the spawn
    /// sequence — but any tap jumps ahead, so an impatient thumb is rewarded.
    private func startAutoEquip() {
        autoTask?.cancel()
        autoTask = Task { @MainActor in
            try? await Task.sleep(nanoseconds: 450_000_000)
            for item in gear {
                if Task.isCancelled { return }
                if !equipped.contains(item.id) { equip(item) }
                try? await Task.sleep(nanoseconds: 620_000_000)
            }
        }
    }

    private func equip(_ item: LoadoutGear) {
        guard !equipped.contains(item.id) else {
            // Re-tapping a slot still gives feedback — toys should answer.
            UIImpactFeedbackGenerator(style: .light).impactOccurred()
            popping = item.id
            Task { @MainActor in
                try? await Task.sleep(nanoseconds: 200_000_000)
                if popping == item.id { popping = nil }
            }
            return
        }
        UIImpactFeedbackGenerator(style: .rigid).impactOccurred(intensity: 0.9)
        AudioServicesPlaySystemSound(item.sound)
        popping = item.id
        withAnimation(.spring(duration: 0.35, bounce: 0.4)) {
            _ = equipped.insert(item.id)
        }
        onCharge?(equipped.count)
        Task { @MainActor in
            try? await Task.sleep(nanoseconds: 260_000_000)
            if popping == item.id { popping = nil }
        }
        if equipped.count == gear.count { spawn() }
    }

    private func spawn() {
        autoTask?.cancel()
        UINotificationFeedbackGenerator().notificationOccurred(.success)
        AudioServicesPlaySystemSound(1016)
        withAnimation(.spring(duration: 0.5, bounce: 0.35)) {
            burst = true
            ready = true
        }
        Task { @MainActor in
            try? await Task.sleep(nanoseconds: 1_400_000_000)
            withAnimation(.easeOut(duration: 0.3)) { burst = false }
        }
    }
}

/// A short particle burst in the companion's tint — the "spawned" moment.
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

    private let particles: [Particle] = (0..<26).map { i in
        let a = Double(i) / 26 * .pi * 2 + Double.random(in: -0.12...0.12)
        return Particle(angle: a, speed: Double.random(in: 90...170), size: Double.random(in: 3...7), spin: Double.random(in: -3...3))
    }

    var body: some View {
        TimelineView(.animation) { timeline in
            let t = timeline.date.timeIntervalSince(start)
            Canvas { context, size in
                let origin = CGPoint(x: size.width / 2, y: 12)
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
        .frame(height: 140)
        .transition(.opacity)
    }
}

/// The aura forge: the machine (Higgsfield render) with the companion standing
/// on its platform. Rings spin in perspective, a beam scans, the platform
/// charges with every piece equipped — all live SwiftUI, no video.
struct AuraForgeStage<Content: View>: View {
    let tint: Color
    let charged: Int
    let ready: Bool
    @ViewBuilder let content: () -> Content
    @State private var spin = false
    @State private var beam = false
    @State private var pulse = false

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
                // The platform charges: brighter with every piece.
                Ellipse()
                    .fill(RadialGradient(colors: [tint.opacity(0.22 + Double(charged) * 0.16), .clear],
                                         center: .center, startRadius: 0, endRadius: w * 0.38))
                    .frame(width: w * 0.76, height: h * 0.19)
                    .blur(radius: 12)
                    .scaleEffect(pulse ? 1.1 : 1)
                    .position(x: w / 2, y: h * 0.72)
                    .animation(.easeInOut(duration: 2).repeatForever(autoreverses: true), value: pulse)
                    .animation(.easeOut(duration: 0.4), value: charged)
                // Scan beam.
                Rectangle()
                    .fill(LinearGradient(colors: [.clear, tint, .clear], startPoint: .leading, endPoint: .trailing))
                    .frame(width: w * 0.53, height: 5)
                    .shadow(color: tint, radius: 10)
                    .opacity(0.9)
                    .position(x: w / 2, y: beam ? h * 0.74 : h * 0.26)
                    .animation(.easeInOut(duration: 2.2).repeatForever(autoreverses: true), value: beam)
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
                // The companion on the platform.
                content()
                    .frame(width: w * 0.82, height: h * 0.62)
                    .position(x: w / 2, y: h * 0.465)
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
        .aspectRatio(3 / 4, contentMode: .fit)
        .clipShape(RoundedRectangle(cornerRadius: 24, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 24, style: .continuous).stroke(Theme.stroke, lineWidth: 1))
        .shadow(color: tint.opacity(ready ? 0.35 : 0.15), radius: 24)
        .animation(.spring(duration: 0.5, bounce: 0.35), value: ready)
        .onAppear { spin = true; beam = true; pulse = true }
    }
}
