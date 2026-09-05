// Companion tools — the loot. Every companion owns three pieces of gear that
// unlock with discipline XP: the first after the very first read, then one
// every 100 XP, the last one golden. Same rule as everything else in the
// squad: XP comes from reading well and coming back, never from volume.
// Art: Higgsfield-generated item icons in Assets.xcassets as `tool_<id>_<tier>`;
// a missing asset falls back to the tool's SF Symbol so nothing ever breaks.
import SwiftUI
import AudioToolbox

/// Where a piece of gear sits on the body. Positions are relative to the
/// model's normalized bounding-box unit so every companion wears it in the same place.
enum BodySlot: String {
    case face, headset, head, hand, hip, shoulder, chest
    /// Where it sits, for previews: "ON THE FACE" / "EN LA CARA".
    var label: String {
        switch self {
        case .face: return L.t("ON THE FACE", "EN LA CARA")
        case .headset: return L.t("ON THE EARS", "EN LAS OREJAS")
        case .head: return L.t("ABOVE THE HEAD", "SOBRE LA CABEZA")
        case .hand: return L.t("IN THE HAND", "EN LA MANO")
        case .hip: return L.t("ON THE HIP", "EN LA CADERA")
        case .shoulder: return L.t("ON THE SHOULDER", "EN EL HOMBRO")
        case .chest: return L.t("ON THE CHEST", "EN EL PECHO")
        }
    }
}

struct CompanionTool: Identifiable, Equatable {
    let companionId: String
    let tier: Int          // 1, 2, 3
    let name: String
    let lore: String
    let symbol: String     // SF Symbol fallback
    var slot: BodySlot = .hand

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
            CompanionTool(companionId: companionId, tier: tier, name: L.t(en, es), lore: L.t(loreEn, loreEs), symbol: symbol,
                          slot: slots["\(companionId)-\(tier)"] ?? .hand)
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

    /// Body slot per tool — the Fortnite part: goggles on the face, a radio on
    /// the hip, a codex in the hand, a halo above the head.
    static let slots: [String: BodySlot] = [
        "orb-1": .hand, "orb-2": .chest, "orb-3": .head,
        "byte-1": .hip, "byte-2": .face, "byte-3": .hand,
        "kora-1": .headset, "kora-2": .shoulder, "kora-3": .hand,
        "zip-1": .hand, "zip-2": .shoulder, "zip-3": .head,
        "glitch-1": .hand, "glitch-2": .hand, "glitch-3": .chest,
        "momo-1": .hand, "momo-2": .face, "momo-3": .head,
        "flux-1": .hand, "flux-2": .chest, "flux-3": .head,
        "rook-1": .chest, "rook-2": .head, "rook-3": .hand,
        "halo-1": .chest, "halo-2": .shoulder, "halo-3": .head,
        "axiom-1": .hand, "axiom-2": .chest, "axiom-3": .head,
    ]

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
    var onPet: (() -> Void)? = nil
    var onPlus: (() -> Void)? = nil
    var onWorld: (() -> Void)? = nil
    @State private var worldPulse = false

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
            // The pet slot: the companion's own animal, at 300 XP.
            if let pet = CompanionToolkit.pet(for: companion.id) {
                let has = CompanionToolkit.petUnlocked(companionId: companion.id, xp: xp)
                Button { onPet?() } label: {
                    ZStack {
                        Circle().fill(has ? companion.tint.opacity(0.12) : Theme.card)
                        Circle().stroke(has ? companion.tint.opacity(0.6) : Theme.stroke, lineWidth: 1)
                        if has, pet.hasArt { Image(pet.assetName).resizable().scaledToFit().frame(width: 30, height: 30) }
                        else if has { Text(pet.emoji).font(.system(size: 18)) } else {
                            Image(systemName: "pawprint.fill").font(.system(size: 12, weight: .bold)).foregroundStyle(Theme.muted.opacity(0.6))
                        }
                    }
                    .frame(width: 38, height: 38)
                }
                .buttonStyle(.plain)
                .accessibilityLabel(has ? pet.name : L.t("Pet, unlocks at \(CompanionPet.unlockXP) XP", "Mascota, se desbloquea con \(CompanionPet.unlockXP) XP"))
            }
            // "+": everything still out there, priced in XP.
            Button { onPlus?() } label: {
                ZStack {
                    Circle().stroke(Theme.stroke, style: StrokeStyle(lineWidth: 1, dash: [3, 3]))
                    Image(systemName: "plus").font(.system(size: 13, weight: .bold)).foregroundStyle(Theme.muted)
                }
                .frame(width: 38, height: 38)
            }
            .buttonStyle(.plain)
            .accessibilityLabel(L.t("What else you can earn", "Qué más puedes conseguir"))
            // The world: the map we build next (Focus-Tree style), fog of war and all.
            Button { onWorld?() } label: {
                ZStack {
                    Image("world_map").resizable().scaledToFill().frame(width: 38, height: 38).clipShape(Circle())
                    Circle().fill(Color.black.opacity(0.38))
                    Circle().stroke(WorldMapSheet.gold.opacity(0.75), lineWidth: 1)
                    Circle().stroke(WorldMapSheet.gold.opacity(0.7), lineWidth: 1)
                        .scaleEffect(worldPulse ? 1.5 : 1)
                        .opacity(worldPulse ? 0 : 0.8)
                    Image(systemName: "map.fill").font(.system(size: 12, weight: .bold)).foregroundStyle(WorldMapSheet.gold)
                }
                .frame(width: 38, height: 38)
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Trader Land")
        }
        .onAppear {
            withAnimation(.easeOut(duration: 1.7).repeatForever(autoreverses: false)) { worldPulse = true }
        }
    }
}

/// "Trader Land" — the Focus-Tree-style world we build next. A teaser: the
/// map under fog of war, SOON, and the promise that discipline XP carries over.
struct WorldMapSheet: View {
    let xp: Int
    let level: Int
    @Environment(\.dismiss) private var dismiss
    @State private var breathe = false
    static let gold = Color(red: 0.96, green: 0.77, blue: 0.26)
    static let regions = ["CRYPTO BAY", "GOLD MINES", "WALL STREET CITADEL", "RISK REEF"]

    var body: some View {
        ScrollView {
            VStack(spacing: 14) {
                Capsule().fill(Theme.stroke).frame(width: 36, height: 4).padding(.top, 8)
                map
                    .padding(.horizontal, 16)
                HStack {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(L.t("ALREADY COUNTED", "YA CUENTA")).font(.mono(10, .bold)).kerning(2).foregroundStyle(Theme.muted)
                        Text("\(xp) XP · \(L.t("level", "nivel")) \(level)").font(.rounded(16, .bold)).foregroundStyle(Theme.text)
                    }
                    Spacer()
                    Text(L.t("CARRIES OVER", "SE CONSERVA")).font(.mono(10, .bold)).kerning(1.5).foregroundStyle(Self.gold)
                }
                .padding(14)
                .background(RoundedRectangle(cornerRadius: 14).fill(Theme.card))
                .overlay(RoundedRectangle(cornerRadius: 14).stroke(Theme.stroke, lineWidth: 1))
                .padding(.horizontal, 16)
                LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 8) {
                    ForEach(Self.regions, id: \.self) { name in
                        HStack(spacing: 6) {
                            Image(systemName: "lock.fill").font(.system(size: 9, weight: .bold))
                            Text(name).font(.mono(9, .bold)).kerning(1.2)
                            Spacer(minLength: 0)
                        }
                        .foregroundStyle(Theme.muted)
                        .padding(.horizontal, 10).padding(.vertical, 9)
                        .background(RoundedRectangle(cornerRadius: 10).fill(Theme.card))
                        .overlay(RoundedRectangle(cornerRadius: 10).stroke(Theme.stroke, lineWidth: 1))
                    }
                }
                .padding(.horizontal, 16)
                Button { dismiss() } label: {
                    Text(L.t("BACK TO THE DESK", "VOLVER AL DESK")).font(.mono(12, .bold)).kerning(2)
                        .foregroundStyle(.black).frame(maxWidth: .infinity).padding(.vertical, 14)
                        .background(Capsule().fill(Self.gold))
                }
                .buttonStyle(.plain)
                .padding(.horizontal, 16).padding(.bottom, 24)
            }
        }
        .background(Theme.bg)
        .onAppear { breathe = true }
    }

    private var map: some View {
        ZStack(alignment: .bottomLeading) {
            GeometryReader { geo in
                Image("world_map").resizable().scaledToFill()
                    .frame(width: geo.size.width, height: geo.size.height)
                    .scaleEffect(breathe ? 1.0 : 1.08)
                    .animation(.easeInOut(duration: 16).repeatForever(autoreverses: true), value: breathe)
                    .clipped()
            }
            LinearGradient(colors: [.clear, Theme.bg.opacity(0.88), Theme.bg], startPoint: .center, endPoint: .bottom)
            VStack(alignment: .leading, spacing: 8) {
                HStack(spacing: 6) {
                    Image(systemName: "lock.fill").font(.system(size: 10, weight: .bold))
                    Text(L.t("SOON", "PRONTO")).font(.mono(11, .bold)).kerning(3)
                }
                .foregroundStyle(.black)
                .padding(.horizontal, 12).padding(.vertical, 6)
                .background(Capsule().fill(Self.gold))
                .shadow(color: Self.gold.opacity(0.6), radius: 12)
                .scaleEffect(breathe ? 1.06 : 1.0)
                .animation(.easeInOut(duration: 0.85).repeatForever(autoreverses: true), value: breathe)
                Text(L.t("Your world is built with discipline.", "Tu mundo se construye con disciplina."))
                    .font(.rounded(24, .bold)).foregroundStyle(Theme.text)
                Text(L.t("Every full read and every NO TRADE raises your base camp. Regions open with XP, never with volume.",
                         "Cada lectura completa y cada NO TRADE levanta tu campamento. Las regiones se abren con XP, nunca con volumen."))
                    .font(.rounded(13.5, .medium)).foregroundStyle(Theme.text.opacity(0.75))
                    .fixedSize(horizontal: false, vertical: true)
            }
            .padding(18)
        }
        .aspectRatio(3/4, contentMode: .fit)
        .overlay(alignment: .topLeading) {
            Text(L.t("TRADER LAND", "TRADER LAND")).font(.mono(10, .bold)).kerning(3).foregroundStyle(Theme.text)
                .padding(.horizontal, 10).padding(.vertical, 5)
                .background(Capsule().fill(Color.black.opacity(0.5)))
                .padding(14)
        }
        .clipShape(RoundedRectangle(cornerRadius: 24, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 24, style: .continuous).stroke(Self.gold.opacity(0.3), lineWidth: 1))
        .shadow(color: Self.gold.opacity(0.15), radius: 30)
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
                HStack(spacing: 8) {
                    CompanionThumb(companion: companion).frame(width: 26, height: 26).clipShape(Circle())
                    Text(L.t("equipped on \(companion.name(at: 1))", "equipado en \(companion.name(at: 1))"))
                        .font(.rounded(13, .medium)).foregroundStyle(Theme.text.opacity(0.8))
                }
                Text("\(tool.tierLabel) · \(tool.unlockXP) XP")
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


// MARK: - Pets (the next level: one per companion, the panda spins)

struct CompanionPet: Identifiable, Equatable {
    let companionId: String
    let name: String
    let emoji: String
    let spins: Bool
    var id: String { "pet-\(companionId)" }
    static let unlockXP = 500
    var assetName: String { "pet_\(companionId)" }
    var hasArt: Bool { UIImage(named: assetName) != nil }
}

extension CompanionToolkit {
    static func pet(for companionId: String) -> CompanionPet? {
        switch companionId {
        case "orb": return CompanionPet(companionId: companionId, name: L.t("Spin the panda", "Panda giratorio"), emoji: "🐼", spins: true)
        case "byte": return CompanionPet(companionId: companionId, name: L.t("Bit the dog", "Bit el perro"), emoji: "🐶", spins: false)
        case "kora": return CompanionPet(companionId: companionId, name: L.t("Nova the cat", "Nova la gata"), emoji: "🐱", spins: false)
        case "zip": return CompanionPet(companionId: companionId, name: L.t("Turbo the monkey", "Turbo el mono"), emoji: "🐵", spins: false)
        case "glitch": return CompanionPet(companionId: companionId, name: L.t("Bug the gecko", "Bug el geco"), emoji: "🦎", spins: false)
        case "momo": return CompanionPet(companionId: companionId, name: L.t("Ink the octopus", "Ink el pulpo"), emoji: "🐙", spins: false)
        case "flux": return CompanionPet(companionId: companionId, name: L.t("Echo the parrot", "Echo el loro"), emoji: "🦜", spins: false)
        case "rook": return CompanionPet(companionId: companionId, name: L.t("Sage the owl", "Sage el búho"), emoji: "🦉", spins: false)
        case "halo": return CompanionPet(companionId: companionId, name: L.t("Peace the dove", "Paz la paloma"), emoji: "🕊️", spins: false)
        case "axiom": return CompanionPet(companionId: companionId, name: L.t("Ledger the turtle", "Ledger la tortuga"), emoji: "🐢", spins: false)
        default: return nil
        }
    }
    static func petUnlocked(companionId: String, xp: Int) -> Bool { xp >= CompanionPet.unlockXP }
    static func wornGear(companionId: String, xp: Int) -> [CompanionTool] {
        tools(for: companionId).filter { unlocked($0, xp: xp) }
    }
}

/// The "+" slot: what is still out there — your pet and the other companions'
/// gear — with the exact points it takes. Aspiration, priced honestly.
/// One thing you can still earn, with the companion that wears it.
enum CatalogItem: Identifiable {
    case tool(CompanionTool, Companion)
    case pet(CompanionPet, Companion)
    var id: String {
        switch self {
        case .tool(let t, _): return t.id
        case .pet(let p, _): return "pet-\(p.companionId)"
        }
    }
}

struct GearCatalogSheet: View {
    let current: Companion
    let xp: Int
    let level: Int
    @State private var preview: CatalogItem?

    private var gold: Color { Color(red: 0.96, green: 0.77, blue: 0.26) }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                Capsule().fill(Theme.stroke).frame(width: 36, height: 4).frame(maxWidth: .infinity).padding(.top, 8)
                Text(L.t("STILL TO EARN", "POR CONSEGUIR"))
                    .font(.mono(11, .bold)).kerning(1.8).foregroundStyle(Theme.muted)
                Text(L.t("Discipline XP only. Reads and coming back — never volume.", "Solo XP de disciplina. Lecturas y volver — nunca volumen."))
                    .font(.rounded(13, .medium)).foregroundStyle(Theme.text.opacity(0.7))
                Label(L.t("Hold any item to see it worn.", "Mantén presionado un item para verlo puesto."), systemImage: "hand.tap")
                    .font(.mono(10, .medium)).kerning(0.6).foregroundStyle(Theme.muted)

                if let pet = CompanionToolkit.pet(for: current.id) {
                    section(L.t("YOUR PET", "TU MASCOTA"))
                    row(glyph: pet.hasArt ? nil : pet.emoji, art: pet.hasArt ? pet.assetName : nil, title: pet.name,
                        subtitle: pet.spins ? L.t("Spins next to you on the desk.", "Gira a tu lado en el desk.") : L.t("Lives at your companion's feet.", "Vive a los pies de tu companion."),
                        needXP: CompanionPet.unlockXP, needLevel: nil, tint: current.tint, item: .pet(pet, current))
                }

                section(L.t("OTHER COMPANIONS' GEAR", "EQUIPO DE OTROS COMPAÑEROS"))
                ForEach(bobbyCompanions.filter { $0.id != current.id }) { comp in
                    VStack(alignment: .leading, spacing: 8) {
                        HStack(spacing: 8) {
                            CompanionThumb(companion: comp).frame(width: 28, height: 28).clipShape(Circle())
                            Text(comp.label).font(.mono(11, .bold)).kerning(1.2).foregroundStyle(comp.tint)
                            if level < comp.requiredLevel {
                                Text(L.t("LEVEL \(comp.requiredLevel) TO UNLOCK", "NIVEL \(comp.requiredLevel) PARA DESBLOQUEAR"))
                                    .font(.mono(9, .bold)).kerning(1).foregroundStyle(Theme.muted)
                            }
                        }
                        ForEach(CompanionToolkit.tools(for: comp.id)) { tool in
                            row(glyph: nil, symbol: tool.symbol, art: tool.hasArt ? tool.assetName : nil, title: tool.name, subtitle: tool.lore,
                                needXP: tool.unlockXP, needLevel: level < comp.requiredLevel ? comp.requiredLevel : nil, tint: tool.isGolden ? gold : comp.tint,
                                item: .tool(tool, comp))
                        }
                        if let pet = CompanionToolkit.pet(for: comp.id) {
                            row(glyph: pet.hasArt ? nil : pet.emoji, art: pet.hasArt ? pet.assetName : nil, title: pet.name, subtitle: L.t("Pet", "Mascota"), needXP: CompanionPet.unlockXP,
                                needLevel: level < comp.requiredLevel ? comp.requiredLevel : nil, tint: comp.tint, item: .pet(pet, comp))
                        }
                    }
                    .padding(12)
                    .background(Theme.card)
                    .clipShape(RoundedRectangle(cornerRadius: 12))
                }
            }
            .padding(.horizontal, 18)
            .padding(.bottom, 24)
        }
        .sheet(item: $preview) { item in
            ItemPreviewSheet(item: item, xp: xp, level: level)
                .presentationDetents([.large])
                .presentationDragIndicator(.visible)
                .presentationBackground(Theme.bg)
        }
    }

    private func section(_ title: String) -> some View {
        Text(title).font(.mono(10, .bold)).kerning(1.6).foregroundStyle(Theme.muted)
    }

    private func row(glyph: String?, symbol: String? = nil, art: String? = nil, title: String, subtitle: String, needXP: Int, needLevel: Int?, tint: Color, item: CatalogItem) -> some View {
        let have = xp >= needXP && needLevel == nil
        let missing = max(0, needXP - xp)
        return HStack(spacing: 12) {
            ZStack {
                Circle().fill(tint.opacity(have ? 0.16 : 0.06)).frame(width: 40, height: 40)
                Circle().stroke(tint.opacity(have ? 0.7 : 0.25), lineWidth: 1).frame(width: 40, height: 40)
                if let art {
                    Image(art).resizable().scaledToFit().frame(width: 34, height: 34).clipShape(Circle()).saturation(have ? 1 : 0.2)
                } else if let glyph {
                    Text(glyph).font(.system(size: 20)).saturation(have ? 1 : 0.2)
                } else if let symbol {
                    Image(systemName: symbol).font(.system(size: 14, weight: .bold)).foregroundStyle(have ? tint : Theme.muted)
                }
            }
            VStack(alignment: .leading, spacing: 2) {
                Text(title).font(.rounded(13, .bold)).foregroundStyle(Theme.text)
                Text(subtitle).font(.rounded(11, .medium)).foregroundStyle(Theme.text.opacity(0.6)).lineLimit(2)
            }
            Spacer()
            VStack(alignment: .trailing, spacing: 2) {
                if have {
                    Text(L.t("YOURS", "TUYO")).font(.mono(9, .bold)).kerning(1).foregroundStyle(Theme.up)
                } else {
                    Text("+\(missing) XP").font(.mono(11, .bold)).foregroundStyle(tint)
                    if let needLevel { Text(L.t("LVL \(needLevel)", "NVL \(needLevel)")).font(.mono(9, .bold)).foregroundStyle(Theme.muted) }
                }
            }
        }
        .padding(.vertical, 4)
        .contentShape(Rectangle())
        // Hold (or tap) to see it worn by its companion — the preview that sells the grind.
        .onTapGesture {
            UIImpactFeedbackGenerator(style: .light).impactOccurred()
            preview = item
        }
        .onLongPressGesture(minimumDuration: 0.35) {
            UIImpactFeedbackGenerator(style: .medium).impactOccurred()
            preview = item
        }
        .accessibilityAddTraits(.isButton)
        .accessibilityHint(L.t("Shows the item worn by its companion", "Muestra el item puesto en su companion"))
    }
}

/// The preview: the companion wearing the item in 3D, what it is, where it
/// sits and what it takes. Works for every companion, art or glyph.
struct ItemPreviewSheet: View {
    let item: CatalogItem
    let xp: Int
    let level: Int
    @Environment(\.dismiss) private var dismiss
    @State private var loading = true

    private var gold: Color { Color(red: 0.96, green: 0.77, blue: 0.26) }
    private var companion: Companion {
        switch item {
        case .tool(_, let c), .pet(_, let c): return c
        }
    }
    private var tint: Color {
        if case .tool(let t, _) = item, t.isGolden { return gold }
        return companion.tint
    }
    private var title: String {
        switch item {
        case .tool(let t, _): return t.name
        case .pet(let p, _): return p.name
        }
    }
    private var subtitle: String {
        switch item {
        case .tool(let t, _): return "\(t.tierLabel) · \(t.slot.label)"
        case .pet(let p, _): return p.spins ? L.t("PET · SPINS NEXT TO YOU", "MASCOTA · GIRA A TU LADO") : L.t("PET · AT THE FEET", "MASCOTA · A LOS PIES")
        }
    }
    private var lore: String {
        switch item {
        case .tool(let t, _): return t.lore
        case .pet(let p, _): return p.spins ? L.t("Spins next to you on the desk.", "Gira a tu lado en el desk.") : L.t("Lives at your companion's feet.", "Vive a los pies de tu companion.")
        }
    }
    private var needXP: Int {
        switch item {
        case .tool(let t, _): return t.unlockXP
        case .pet: return CompanionPet.unlockXP
        }
    }
    private var needLevel: Int? { level < companion.requiredLevel ? companion.requiredLevel : nil }
    private var have: Bool { xp >= needXP && needLevel == nil }

    var body: some View {
        VStack(spacing: 14) {
            Capsule().fill(Theme.stroke).frame(width: 36, height: 4).padding(.top, 8)
            HStack(spacing: 8) {
                CompanionThumb(companion: companion).frame(width: 26, height: 26).clipShape(Circle())
                Text(L.t("WORN BY \(companion.label)", "LO LLEVA \(companion.label)")).font(.mono(10, .bold)).kerning(1.4).foregroundStyle(companion.tint)
                Spacer()
                Text("PREVIEW").font(.mono(10, .bold)).kerning(1.4).foregroundStyle(Theme.muted)
                Button {
                    dismiss()
                } label: {
                    Image(systemName: "xmark")
                        .font(.system(size: 11, weight: .bold))
                        .foregroundStyle(Theme.text.opacity(0.8))
                        .frame(width: 32, height: 32)
                        .background(Circle().fill(Theme.card))
                        .overlay(Circle().stroke(Theme.stroke, lineWidth: 1))
                }
                .buttonStyle(.plain)
                .accessibilityLabel(L.t("Close preview", "Cerrar preview"))
            }
            .padding(.horizontal, 18)

            ZStack {
                RadialGradient(colors: [tint.opacity(0.22), .clear], center: .center, startRadius: 20, endRadius: 220)
                Group {
                    switch item {
                    case .tool(let t, let c):
                        MascotSceneView(assetName: c.id, interactive: true, onLoading: { l, _ in loading = l }, gear: [t])
                    case .pet(let p, let c):
                        MascotSceneView(assetName: c.id, interactive: true, onLoading: { l, _ in loading = l }, pet: p)
                    }
                }
                .id(item.id)
                if loading { ProgressView().tint(tint) }
                if !have {
                    VStack {
                        Spacer()
                        HStack(spacing: 6) {
                            Image(systemName: "lock.fill").font(.system(size: 10, weight: .bold))
                            Text(needLevel.map { L.t("LEVEL \($0) · +\(max(0, needXP - xp)) XP", "NIVEL \($0) · +\(max(0, needXP - xp)) XP") }
                                 ?? L.t("+\(max(0, needXP - xp)) XP TO GO", "FALTAN \(max(0, needXP - xp)) XP"))
                                .font(.mono(10, .bold)).kerning(1.2)
                        }
                        .foregroundStyle(Theme.text)
                        .padding(.horizontal, 12).padding(.vertical, 7)
                        .background(Capsule().fill(Theme.bg.opacity(0.85)))
                        .overlay(Capsule().stroke(tint.opacity(0.5), lineWidth: 1))
                        .padding(.bottom, 10)
                    }
                }
            }
            .frame(height: 340)
            .background(Theme.card)
            .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 22, style: .continuous).stroke(tint.opacity(0.35), lineWidth: 1))
            .padding(.horizontal, 18)

            VStack(spacing: 6) {
                Text(title).font(.rounded(22, .bold)).foregroundStyle(Theme.text)
                Text(subtitle).font(.mono(10, .bold)).kerning(1.4).foregroundStyle(tint)
                Text(lore).font(.rounded(14, .medium)).foregroundStyle(Theme.text.opacity(0.75)).multilineTextAlignment(.center).padding(.horizontal, 28)
                Text(have ? L.t("YOURS", "TUYO") : L.t("Discipline only: full reads and coming back. Never volume.", "Solo disciplina: lecturas completas y volver. Nunca volumen."))
                    .font(.mono(10, .medium)).kerning(0.6).foregroundStyle(have ? Theme.up : Theme.muted).multilineTextAlignment(.center).padding(.top, 4)
            }
            Spacer()
        }
    }
}

// MARK: - Share my skin

enum SkinCard {
    /// Composes the share card: the live scene snapshot, the companion's name,
    /// level, worn gear and pet. 1080×1350 (Instagram portrait).
    static func render(snapshot: UIImage, companion: Companion, level: CompanionLevel, gear: [CompanionTool], pet: CompanionPet?, xp: Int) -> UIImage {
        let size = CGSize(width: 1080, height: 1350)
        return UIGraphicsImageRenderer(size: size).image { ctx in
            let c = ctx.cgContext
            UIColor(red: 0.01, green: 0.012, blue: 0.019, alpha: 1).setFill()
            c.fill(CGRect(origin: .zero, size: size))
            let tint = UIColor(hue: companion.hue, saturation: 0.7, brightness: 0.95, alpha: 1)
            let glowColors = [tint.withAlphaComponent(0.35).cgColor, tint.withAlphaComponent(0).cgColor] as CFArray
            if let gradient = CGGradient(colorsSpace: CGColorSpaceCreateDeviceRGB(), colors: glowColors, locations: [0, 1]) {
                c.drawRadialGradient(gradient, startCenter: CGPoint(x: 540, y: 560), startRadius: 0, endCenter: CGPoint(x: 540, y: 560), endRadius: 620, options: [])
            }
            let mono = UIFont.monospacedSystemFont(ofSize: 30, weight: .bold)
            let head = NSAttributedString(string: "BOBBY // \(L.t("MY SKIN", "MI SKIN"))", attributes: [.font: mono, .foregroundColor: UIColor.white.withAlphaComponent(0.75), .kern: 6])
            head.draw(at: CGPoint(x: 72, y: 72))
            let aspect = snapshot.size.width / max(snapshot.size.height, 1)
            let shotH: CGFloat = 760
            let shotW = shotH * aspect
            snapshot.draw(in: CGRect(x: (size.width - shotW) / 2, y: 150, width: shotW, height: shotH))
            let name = NSAttributedString(string: companion.name(at: level.number), attributes: [.font: UIFont.systemFont(ofSize: 76, weight: .bold), .foregroundColor: UIColor.white, .kern: 4])
            let nameW = name.size().width
            name.draw(at: CGPoint(x: (size.width - nameW) / 2, y: 930))
            let sub = NSAttributedString(string: "\(L.t("LEVEL", "NIVEL")) \(level.number) · \(level.name) · \(xp) XP", attributes: [.font: UIFont.monospacedSystemFont(ofSize: 26, weight: .bold), .foregroundColor: tint, .kern: 4])
            sub.draw(at: CGPoint(x: (size.width - sub.size().width) / 2, y: 1024))
            var line = gear.map { $0.name }
            if let pet { line.append(pet.name) }
            let gearText = line.isEmpty ? L.t("No gear yet — first read drops the first tool.", "Sin equipo aún — la primera lectura suelta la primera herramienta.") : line.joined(separator: " · ")
            let gearAttr = NSAttributedString(string: gearText, attributes: [.font: UIFont.systemFont(ofSize: 28, weight: .medium), .foregroundColor: UIColor.white.withAlphaComponent(0.8)])
            let gearRect = CGRect(x: 90, y: 1090, width: size.width - 180, height: 120)
            gearAttr.draw(with: gearRect, options: [.usesLineFragmentOrigin], context: nil)
            let foot = NSAttributedString(string: "bobbyprotocol.xyz · \(L.t("earned with discipline, never volume", "ganado con disciplina, nunca volumen"))", attributes: [.font: UIFont.monospacedSystemFont(ofSize: 22, weight: .medium), .foregroundColor: UIColor.white.withAlphaComponent(0.4), .kern: 2])
            foot.draw(at: CGPoint(x: (size.width - foot.size().width) / 2, y: 1270))
        }
    }
}

struct ShareSheet: UIViewControllerRepresentable {
    let items: [Any]
    func makeUIViewController(context: Context) -> UIActivityViewController {
        UIActivityViewController(activityItems: items, applicationActivities: nil)
    }
    func updateUIViewController(_ uiViewController: UIActivityViewController, context: Context) {}
}


/// The pet slot, tapped: what it is, or what it takes.
struct PetDetailSheet: View {
    let companion: Companion
    let xp: Int
    var body: some View {
        let pet = CompanionToolkit.pet(for: companion.id)
        let has = CompanionToolkit.petUnlocked(companionId: companion.id, xp: xp)
        VStack(spacing: 12) {
            Capsule().fill(Theme.stroke).frame(width: 36, height: 4).padding(.top, 8)
            if let pet, pet.hasArt {
                Image(pet.assetName).resizable().scaledToFit().frame(width: 150, height: 150).saturation(has ? 1 : 0.15)
            } else {
                Text(pet?.emoji ?? "🐾").font(.system(size: 96)).saturation(has ? 1 : 0.15)
            }
            Text(pet?.name ?? "").font(.rounded(22, .bold)).foregroundStyle(Theme.text)
            Text(has
                 ? ((pet?.spins ?? false) ? L.t("Spins next to you on the desk.", "Gira a tu lado en el desk.") : L.t("Lives at your companion's feet.", "Vive a los pies de tu companion."))
                 : L.t("Unlocks at \(CompanionPet.unlockXP) XP · you have \(xp). Discipline only.", "Se desbloquea a \(CompanionPet.unlockXP) XP · llevas \(xp). Solo disciplina."))
                .font(.rounded(14, .medium)).foregroundStyle(Theme.text.opacity(0.75)).multilineTextAlignment(.center).padding(.horizontal, 28)
            Spacer()
        }
    }
}
