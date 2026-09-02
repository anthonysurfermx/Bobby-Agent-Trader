// Companion tools — the loot. Every companion owns three pieces of gear that
// unlock with discipline XP: the first after the very first read, then one
// every 100 XP, the last one golden. Same rule as everything else in the
// squad: XP comes from reading well and coming back, never from volume.
// Art: Higgsfield-generated item icons in Assets.xcassets as `tool_<id>_<tier>`;
// a missing asset falls back to the tool's SF Symbol so nothing ever breaks.
import SwiftUI
import AudioToolbox

struct CompanionTool: Identifiable, Equatable {
    let companionId: String
    let tier: Int          // 1, 2, 3
    let name: String
    let lore: String
    let symbol: String     // SF Symbol fallback

    var id: String { "\(companionId)-\(tier)" }
    var isGolden: Bool { tier == 3 }
    var assetName: String { "tool_\(companionId)_\(tier)" }
    /// XP needed: first read (>0), then every 100.
    var unlockXP: Int { tier == 1 ? 1 : (tier - 1) * 100 }
    var tierLabel: String {
        switch tier {
        case 1: return L.t("COMMON", "COMÚN")
        case 2: return L.t("RARE", "RARO")
        default: return L.t("GOLDEN", "DORADO")
        }
    }
    var hasArt: Bool { UIImage(named: assetName) != nil }
}

enum CompanionToolkit {
    static func tools(for companionId: String) -> [CompanionTool] {
        func t(_ tier: Int, _ symbol: String, _ en: String, _ es: String, _ loreEn: String, _ loreEs: String) -> CompanionTool {
            CompanionTool(companionId: companionId, tier: tier, name: L.t(en, es), lore: L.t(loreEn, loreEs), symbol: symbol)
        }
        switch companionId {
        case "orb":
            return [
                t(1, "clock", "Patience Chronometer", "Cronómetro de paciencia", "Counts the candles you did not chase.", "Cuenta las velas que no perseguiste."),
                t(2, "safari", "4H Trend Compass", "Brújula de tendencia 4H", "Points where the structure goes, not where the noise does.", "Apunta hacia donde va la estructura, no el ruido."),
                t(3, "circle.hexagongrid.fill", "Omega Core", "Núcleo Omega", "Bobby's own heart. You earned it by waiting better.", "El corazón del propio Bobby. Te lo ganaste esperando mejor."),
            ]
        case "byte":
            return [
                t(1, "text.bubble", "Market Translator", "Traductor de mercado", "Turns 'RSI divergence' into words you would say to a friend.", "Convierte 'divergencia de RSI' en palabras que le dirías a un amigo."),
                t(2, "eyeglasses", "Anti-Hype Goggles", "Gafas anti-humo", "Filters gurus, threads and 'trust me bro' out of the picture.", "Filtra gurús, hilos y 'confía en mí' de la escena."),
                t(3, "book.closed.fill", "Golden Codex", "Códice dorado", "Every read you ever explained simply, bound in gold.", "Cada lectura que explicaste simple, encuadernada en oro."),
            ]
        case "kora":
            return [
                t(1, "headphones", "Radar Headset", "Auriculares radar", "Hears the desk before the crowd does.", "Escucha el desk antes que la multitud."),
                t(2, "antenna.radiowaves.left.and.right", "Gossip Antenna", "Antena de chisme", "Picks up what the market is whispering, with receipts.", "Capta lo que el mercado susurra, con pruebas."),
                t(3, "mic.fill", "Golden Mic", "Micrófono dorado", "When Kora speaks with this, the whole squad listens.", "Cuando Kora habla con esto, todo el squad escucha."),
            ]
        case "zip":
            return [
                t(1, "stopwatch", "15M Stopwatch", "Cronómetro 15M", "Fifteen minutes. That is all Zip needs to notice.", "Quince minutos. Es todo lo que Zip necesita para notarlo."),
                t(2, "light.beacon.max", "Alert Beacon", "Baliza de alertas", "Lights up when something moves. Never for nothing.", "Se enciende cuando algo se mueve. Nunca en vano."),
                t(3, "bolt.fill", "Golden Bolt", "Rayo dorado", "Speed, forged. The stop is always within reach.", "Velocidad forjada. El stop siempre a la mano."),
            ]
        case "glitch":
            return [
                t(1, "hammer", "Thesis Hammer", "Martillo de tesis", "Hits every idea once before the market does.", "Golpea cada idea una vez antes que el mercado."),
                t(2, "xmark.shield", "Refutation Blade", "Hoja de refutación", "Cuts the argument that would have cost you.", "Corta el argumento que te habría costado."),
                t(3, "shield.lefthalf.filled", "Golden Counter", "Contra dorada", "Survive Glitch, survive the candle.", "Sobrevive a Glitch, sobrevive a la vela."),
            ]
        case "momo":
            return [
                t(1, "map", "Explorer's Map", "Mapa de exploración", "Marks the corners nobody is watching yet.", "Marca los rincones que nadie mira todavía."),
                t(2, "binoculars", "Long-Range Binoculars", "Binoculares de largo alcance", "Sees tokenized stocks and new listings before the crowd.", "Ve acciones tokenizadas y listados nuevos antes que la multitud."),
                t(3, "sparkle.magnifyingglass", "Golden Lens", "Lente dorado", "Finds signal in places that look like noise.", "Encuentra señal donde parece ruido."),
            ]
        case "flux":
            return [
                t(1, "waveform", "Tuning Fork", "Diapasón", "Rings when an indicator is off-key.", "Suena cuando un indicador desafina."),
                t(2, "chart.xyaxis.line", "Signal Score", "Partitura de señales", "RSI, EMA and funding on one staff.", "RSI, EMA y funding en un solo pentagrama."),
                t(3, "music.note", "Golden Note", "Nota dorada", "Perfect pitch for the market's rhythm.", "Oído absoluto para el ritmo del mercado."),
            ]
        case "rook":
            return [
                t(1, "square.grid.3x3", "Thesis Board", "Tablero de tesis", "Entry, stop, invalidation. Three squares, no roulette.", "Entrada, stop, invalidación. Tres casillas, nada de ruleta."),
                t(2, "crown", "Rook's Crown", "Corona de torre", "Thinks three candles ahead.", "Piensa tres velas adelante."),
                t(3, "checkerboard.rectangle", "Golden Board", "Tablero dorado", "The whole game, seen at once.", "Todo el juego, visto de una vez."),
            ]
        case "halo":
            return [
                t(1, "shield", "Capital Shield", "Escudo de capital", "Blocks the trade that was not there.", "Bloquea el trade que no estaba."),
                t(2, "shield.checkered", "Risk Gate", "Puerta de riesgo", "Only clean setups get through.", "Solo pasan los setups limpios."),
                t(3, "shield.fill", "Golden Halo", "Halo dorado", "NO TRADE, made legendary.", "NO TRADE, hecho leyenda."),
            ]
        case "axiom":
            return [
                t(1, "doc.text", "Ledger", "Libro mayor", "Every call written down.", "Cada llamada queda escrita."),
                t(2, "link", "Chain Link", "Eslabón", "Anchors the record where anyone can check it.", "Ancla el historial donde cualquiera puede revisarlo."),
                t(3, "seal.fill", "Golden Seal", "Sello dorado", "Verified, not promised.", "Comprobado, no prometido."),
            ]
        default:
            return []
        }
    }

    static func unlocked(_ tool: CompanionTool, xp: Int) -> Bool { xp >= tool.unlockXP }

    /// Tools that crossed their threshold between two XP values, lowest tier first.
    static func newlyUnlocked(companionId: String, from oldXP: Int, to newXP: Int) -> [CompanionTool] {
        tools(for: companionId).filter { oldXP < $0.unlockXP && newXP >= $0.unlockXP }
    }
}

// MARK: - Views

/// The three gear slots under the companion: locked, unlocked, golden.
struct ToolBelt: View {
    let companion: Companion
    let xp: Int
    var onTap: ((CompanionTool) -> Void)? = nil

    var body: some View {
        HStack(spacing: 10) {
            ForEach(CompanionToolkit.tools(for: companion.id)) { tool in
                let unlocked = CompanionToolkit.unlocked(tool, xp: xp)
                Button { onTap?(tool) } label: {
                    ZStack {
                        Circle()
                            .fill(unlocked ? (tool.isGolden ? Color(red: 0.96, green: 0.77, blue: 0.26).opacity(0.16) : companion.tint.opacity(0.12)) : Theme.card)
                        Circle()
                            .stroke(unlocked ? (tool.isGolden ? Color(red: 0.96, green: 0.77, blue: 0.26).opacity(0.8) : companion.tint.opacity(0.6)) : Theme.stroke, lineWidth: 1)
                        if unlocked, tool.hasArt {
                            Image(tool.assetName)
                                .resizable()
                                .scaledToFit()
                                .padding(5)
                                .clipShape(Circle())
                        } else {
                            Image(systemName: unlocked ? tool.symbol : "lock.fill")
                                .font(.system(size: 13, weight: .bold))
                                .foregroundStyle(unlocked ? (tool.isGolden ? Color(red: 0.96, green: 0.77, blue: 0.26) : companion.tint) : Theme.muted.opacity(0.6))
                        }
                    }
                    .frame(width: 38, height: 38)
                    .shadow(color: unlocked && tool.isGolden ? Color(red: 0.96, green: 0.77, blue: 0.26).opacity(0.35) : .clear, radius: 8)
                }
                .buttonStyle(.plain)
                .accessibilityLabel(unlocked ? tool.name : L.t("\(tool.name), unlocks at \(tool.unlockXP) XP", "\(tool.name), se desbloquea con \(tool.unlockXP) XP"))
            }
        }
    }
}

/// The unlock moment: the item drops in, the companion celebrates.
struct ToolUnlockOverlay: View {
    let companion: Companion
    let tool: CompanionTool
    let onDismiss: () -> Void

    @State private var shown = false
    private var gold: Color { Color(red: 0.96, green: 0.77, blue: 0.26) }
    private var tint: Color { tool.isGolden ? gold : companion.tint }

    var body: some View {
        ZStack {
            Color.black.opacity(0.82).ignoresSafeArea()
            RadialGradient(colors: [tint.opacity(0.28), .clear], center: .center, startRadius: 20, endRadius: 360)
                .ignoresSafeArea()
            VStack(spacing: 14) {
                Text(tool.isGolden ? L.t("GOLDEN GEAR UNLOCKED", "EQUIPO DORADO DESBLOQUEADO") : L.t("NEW GEAR UNLOCKED", "NUEVO EQUIPO DESBLOQUEADO"))
                    .font(.mono(11, .bold))
                    .kerning(2)
                    .foregroundStyle(tint)
                ZStack {
                    Circle().fill(tint.opacity(0.10)).frame(width: 220, height: 220)
                    Circle().stroke(tint.opacity(0.5), lineWidth: 1).frame(width: 220, height: 220)
                    if tool.hasArt {
                        Image(tool.assetName)
                            .resizable()
                            .scaledToFit()
                            .frame(width: 196, height: 196)
                            .clipShape(Circle())
                    } else {
                        Image(systemName: tool.symbol)
                            .font(.system(size: 72, weight: .bold))
                            .foregroundStyle(tint)
                    }
                }
                .scaleEffect(shown ? 1 : 0.6)
                .rotationEffect(.degrees(shown ? 0 : -12))
                .shadow(color: tint.opacity(0.5), radius: 30)
                Text(tool.name)
                    .font(.rounded(26, .bold))
                    .foregroundStyle(Theme.text)
                Text("\(tool.tierLabel) · \(companion.name(at: 1)) · \(tool.unlockXP) XP")
                    .font(.mono(10, .bold))
                    .kerning(1.4)
                    .foregroundStyle(Theme.muted)
                Text(tool.lore)
                    .font(.rounded(14, .medium))
                    .foregroundStyle(Theme.text.opacity(0.8))
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 32)
                Button {
                    UIImpactFeedbackGenerator(style: .medium).impactOccurred()
                    onDismiss()
                } label: {
                    Text(L.t("EQUIP IT", "EQUIPARLO"))
                        .font(.mono(12, .bold))
                        .kerning(1.7)
                        .foregroundStyle(.black)
                        .padding(.horizontal, 28)
                        .frame(height: 46)
                        .background(tint)
                        .clipShape(Capsule())
                }
                .padding(.top, 6)
            }
            .opacity(shown ? 1 : 0)
        }
        .onAppear {
            UINotificationFeedbackGenerator().notificationOccurred(.success)
            AudioServicesPlaySystemSound(tool.isGolden ? 1025 : 1016)
            withAnimation(.spring(duration: 0.55, bounce: 0.4)) { shown = true }
        }
    }
}

/// Tap a slot: what the tool is, or what it takes to earn it.
struct ToolDetailSheet: View {
    let companion: Companion
    let tool: CompanionTool
    let xp: Int

    private var gold: Color { Color(red: 0.96, green: 0.77, blue: 0.26) }
    private var unlocked: Bool { CompanionToolkit.unlocked(tool, xp: xp) }
    private var tint: Color { tool.isGolden ? gold : companion.tint }

    var body: some View {
        VStack(spacing: 14) {
            Capsule().fill(Theme.stroke).frame(width: 36, height: 4).padding(.top, 8)
            ZStack {
                Circle().fill(tint.opacity(unlocked ? 0.12 : 0.04)).frame(width: 150, height: 150)
                Circle().stroke(tint.opacity(unlocked ? 0.6 : 0.2), lineWidth: 1).frame(width: 150, height: 150)
                if unlocked, tool.hasArt {
                    Image(tool.assetName).resizable().scaledToFit().frame(width: 134, height: 134).clipShape(Circle())
                } else {
                    Image(systemName: unlocked ? tool.symbol : "lock.fill")
                        .font(.system(size: 44, weight: .bold))
                        .foregroundStyle(unlocked ? tint : Theme.muted)
                }
            }
            .saturation(unlocked ? 1 : 0)
            Text(unlocked ? tool.name : "???")
                .font(.rounded(22, .bold))
                .foregroundStyle(Theme.text)
            Text(unlocked
                 ? "\(tool.tierLabel) · \(companion.name(at: 1))"
                 : L.t("\(tool.tierLabel) · UNLOCKS AT \(tool.unlockXP) XP · YOU HAVE \(xp)", "\(tool.tierLabel) · SE DESBLOQUEA A \(tool.unlockXP) XP · LLEVAS \(xp)"))
                .font(.mono(10, .bold))
                .kerning(1.3)
                .foregroundStyle(Theme.muted)
            Text(unlocked
                 ? tool.lore
                 : (tool.tier == 1
                    ? L.t("Drops after your first full read.", "Cae después de tu primera lectura completa.")
                    : L.t("Discipline only: reads and coming back. Never volume.", "Solo disciplina: lecturas y volver. Nunca volumen.")))
                .font(.rounded(14, .medium))
                .foregroundStyle(Theme.text.opacity(0.8))
                .multilineTextAlignment(.center)
                .padding(.horizontal, 28)
            Spacer(minLength: 0)
        }
        .padding(.bottom, 16)
    }
}
