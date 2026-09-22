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
                t(1, "headphones", "Radar Headset", "Auriculares radar", "Hears the desk before the crowd does.", "Escucha la mesa antes que la multitud."),
                t(2, "antenna.radiowaves.left.and.right", "Gossip Antenna", "Antena de chisme", "Picks up what the market is whispering, with receipts.", "Capta lo que el mercado susurra, con pruebas."),
                t(3, "mic.fill", "Golden Mic", "Micrófono dorado", "When Kora speaks with this, the whole squad listens.", "Cuando Kora habla con esto, todo el equipo escucha."),
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
                t(2, "chart.xyaxis.line", "Signal Score", "Partitura de señales", "RSI, EMA and funding on one staff.", "RSI, EMA y financiamiento en un solo pentagrama."),
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
                t(1, "shield", "Capital Shield", "Escudo de capital", "Blocks the trade that was not there.", "Bloquea la operación que no estaba."),
                t(2, "shield.checkered", "Risk Gate", "Filtro de riesgo", "Only clean setups get through.", "Solo pasan las entradas limpias."),
                t(3, "shield.fill", "Golden Halo", "Halo dorado", "NO TRADE, made legendary.", "NO OPERAR, hecho leyenda."),
            ]
        case "axiom":
            return [
                t(1, "doc.text", "Ledger", "Libro mayor", "Every call written down.", "Cada veredicto queda escrito."),
                t(2, "link", "Chain Link", "Eslabón", "Anchors the record where anyone can check it.", "Ancla el historial donde cualquiera puede revisarlo."),
                t(3, "seal.fill", "Golden Seal", "Sello dorado", "Verified, not promised.", "Comprobado, no prometido."),
            ]
        case "iris":
            return [
                t(1, "gauge.with.dots.needle.33percent", "Regime Dial", "Dial de régimen", "Says calm, caution or storm before you read a single candle.", "Dice calma, cuidado o tormenta antes de que leas una sola vela."),
                t(2, "water.waves", "Horizon Band", "Banda de horizonte", "One thin line for where the whole market is leaning.", "Una línea delgada para saber hacia dónde se inclina todo el mercado."),
                t(3, "sun.max.fill", "Golden Forecast", "Pronóstico dorado", "Every regime you respected instead of fighting, kept in gold.", "Cada régimen que respetaste en vez de pelear, guardado en oro."),
            ]
        case "sol":
            return [
                t(1, "ruler", "Builder Tape", "Cinta de constructor", "Measures what you actually finished, never what you planned.", "Mide lo que sí terminaste, nunca lo que planeaste."),
                t(2, "leaf", "Sprout Pin", "Prendedor de brote", "Grows one leaf per tier. Only discipline waters it.", "Le sale una hoja por nivel. Solo la disciplina la riega."),
                t(3, "square.grid.3x3.fill", "Golden Blueprint", "Plano dorado", "The plan of a world you built one earned piece at a time.", "El plano de un mundo que construiste pieza ganada por pieza ganada."),
            ]
        case "zuri":
            return [
                t(1, "scope", "Trail Monocle", "Monóculo de rastreo", "Follows one wallet without losing it in the noise.", "Sigue una wallet sin perderla en el ruido."),
                t(2, "circle.grid.2x1", "Bead Ledger", "Cuentas de registro", "One bead per wallet worth watching. No bead is free.", "Una cuenta por cada wallet que vale la pena mirar. Ninguna es gratis."),
                t(3, "point.topleft.down.to.point.bottomright.curvepath.fill", "Golden Thread", "Hilo dorado", "Where the money went, drawn end to end.", "A dónde se fue el dinero, trazado de punta a punta."),
            ]
        case "mira":
            return [
                t(1, "timer", "Rehearsal Timer", "Cronómetro de ensayo", "Counts the reps, not the wins.", "Cuenta las repeticiones, no las victorias."),
                t(2, "square.split.diagonal", "Wireframe Half", "Mitad de malla", "The part of you still being drafted. Everyone has one.", "La parte de ti que todavía es borrador. Todos tenemos una."),
                t(3, "star.fill", "Golden Replay", "Repetición dorada", "Every move you rewound until you understood it.", "Cada jugada que rebobinaste hasta entenderla."),
            ]
        case "nalu":
            return [
                t(1, "wind", "Flow Fin", "Quilla de flujo", "Feels the current before it shows on the chart.", "Siente la corriente antes de que se vea en la gráfica."),
                t(2, "clock.arrow.circlepath", "Tide Watch", "Reloj de marea", "Tells you the wave is not yours yet.", "Te dice que la ola todavía no es tuya."),
                t(3, "surfboard.fill", "Golden Board", "Tabla dorada", "Earned by the waves you let pass.", "Se gana con las olas que dejaste pasar."),
            ]
        case "vega":
            return [
                t(1, "cone", "Probability Cone", "Cono de probabilidad", "Shows the spread, not a single confident number.", "Muestra el rango, no un solo número seguro."),
                t(2, "plusminus", "Error Bar", "Barra de error", "The part of the forecast nobody likes to publish.", "La parte del pronóstico que nadie quiere publicar."),
                t(3, "eyeglasses", "Golden Monocle", "Monóculo dorado", "Collapses the cone to one number, and shows its cost.", "Colapsa el cono a un número, y enseña lo que cuesta."),
            ]
        case "noor":
            return [
                t(1, "circle", "First Ring", "Primer anillo", "Given for showing up again, not for being right.", "Se da por volver, no por acertar."),
                t(2, "book.closed", "Review Ledger", "Libro de revisión", "The week read back to you, without flattery.", "La semana leída de vuelta, sin adulaciones."),
                t(3, "crown.fill", "Golden Crown", "Corona dorada", "The third ring. It is set above your head, never sold.", "El tercer anillo. Se pone sobre tu cabeza, no se vende."),
            ]
        case "keo":
            return [
                t(1, "number.circle", "Set Counter", "Contador de series", "Counts the waves you let go before the good one.", "Cuenta las olas que dejas ir antes de la buena."),
                t(2, "fish", "Reef Sense", "Sentido de arrecife", "Knows what is under the water before you drop in.", "Sabe qué hay bajo el agua antes de que entres."),
                t(3, "hourglass", "Golden Patience", "Paciencia dorada", "Thirty years of waiting, cast in gold.", "Treinta años de espera, fundidos en oro."),
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
        "iris-1": .hand, "iris-2": .face, "iris-3": .head,
        "sol-1": .hand, "sol-2": .head, "sol-3": .hand,
        "zuri-1": .headset, "zuri-2": .shoulder, "zuri-3": .hand,
        "mira-1": .hand, "mira-2": .chest, "mira-3": .head,
        "nalu-1": .hand, "nalu-2": .hip, "nalu-3": .shoulder,
        "vega-1": .hand, "vega-2": .chest, "vega-3": .head,
        "noor-1": .hand, "noor-2": .chest, "noor-3": .head,
        "keo-1": .hand, "keo-2": .chest, "keo-3": .shoulder,
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
    @ObservedObject var store: CompanionStore
    private var xp: Int { store.disciplineXP }
    var onTap: ((CompanionTool) -> Void)? = nil
    var onPet: (() -> Void)? = nil
    var onPlus: (() -> Void)? = nil
    var onWorld: (() -> Void)? = nil
    @State private var worldPulse = false
    @AppStorage(LockerSeen.key) private var lockerSeen: String?

    var body: some View {
        HStack(spacing: 10) {
            ForEach(CompanionToolkit.tools(for: companion.id)) { tool in
                let unlocked = CompanionToolkit.unlocked(tool, xp: xp)
                let equipped = store.isEquipped(.tool(tool, companion))
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
                    .opacity(unlocked && !equipped ? 0.5 : 1)
                    .shadow(color: unlocked && tool.isGolden ? Color(red: 0.96, green: 0.77, blue: 0.26).opacity(0.35) : .clear, radius: 8)
                }
                .buttonStyle(.plain)
                .accessibilityLabel(unlocked ? tool.name : L.t("\(tool.name), unlocks at \(tool.unlockXP) XP", "\(tool.name), se desbloquea con \(tool.unlockXP) XP"))
                .accessibilityValue(unlocked ? (equipped ? L.t("Equipped", "Equipado") : L.t("Stored", "Guardado")) : L.t("Locked", "Bloqueado"))
                .accessibilityIdentifier("belt-tool-\(tool.id)")
            }
            // The pet slot: the companion's own animal, at 500 XP.
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
                    .opacity(has && store.wornPet(for: companion.id) == nil ? 0.5 : 1)
                }
                .buttonStyle(.plain)
                .accessibilityLabel(has ? pet.name : L.t("Pet, unlocks at \(CompanionPet.unlockXP) XP", "Mascota, se desbloquea con \(CompanionPet.unlockXP) XP"))
                .accessibilityValue(has ? (store.wornPet(for: companion.id) != nil ? L.t("Equipped", "Equipado") : L.t("Stored", "Guardado")) : L.t("Locked", "Bloqueado"))
                .accessibilityIdentifier("belt-pet-\(companion.id)")
            }
            // "+": the locker — the whole squad and everything it can earn.
            let fresh = LockerSeen.unseen(ownId: companion.id, xp: xp, raw: lockerSeen).count
            Button { onPlus?() } label: {
                ZStack {
                    Circle().stroke(Theme.stroke, style: StrokeStyle(lineWidth: 1, dash: [3, 3]))
                    Image(systemName: "plus").font(.system(size: 13, weight: .bold)).foregroundStyle(Theme.muted)
                }
                .frame(width: 38, height: 38)
                .overlay(alignment: .topTrailing) {
                    if fresh > 0 { Circle().fill(companion.tint).frame(width: 7, height: 7).offset(x: -1, y: 1) }
                }
            }
            .buttonStyle(.plain)
            .accessibilityLabel(fresh > 0
                ? L.t("Locker, \(fresh) new", "Vitrina, \(fresh) \(fresh == 1 ? "nuevo" : "nuevos")")
                : L.t("Locker: everything you can earn", "Vitrina: todo lo que puedes ganar"))
            .accessibilityIdentifier("belt-plus")
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
    static let regions = [L.t("CRYPTO BAY", "BAHÍA CRIPTO"), L.t("GOLD MINES", "MINAS DE ORO"), L.t("WALL STREET CITADEL", "CIUDADELA WALL STREET"), L.t("RISK REEF", "ARRECIFE DE RIESGO")]

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
                    Text(L.t("BACK TO THE DESK", "VOLVER A LA MESA")).font(.mono(12, .bold)).kerning(2)
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
                         "Cada lectura completa y cada NO OPERAR levanta tu campamento. Las regiones se abren con XP, nunca con volumen."))
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
    let onDismiss: (Bool) -> Void

    @State private var shown = false
    private var gold: Color { Color(red: 0.96, green: 0.77, blue: 0.26) }
    private var tint: Color { tool.isGolden ? gold : companion.tint }

    var body: some View {
        ZStack {
            Color.black.opacity(0.82).ignoresSafeArea()
            RadialGradient(colors: [tint.opacity(0.28), .clear], center: .center, startRadius: 20, endRadius: 360)
                .ignoresSafeArea()
            VStack(spacing: 14) {
                Text(tool.isGolden ? L.t("GOLDEN GEAR UNLOCKED", "ACCESORIO DORADO DESBLOQUEADO") : L.t("NEW GEAR UNLOCKED", "NUEVO ACCESORIO DESBLOQUEADO"))
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
                    Text(L.t("for \(companion.name(at: 1))", "para \(companion.name(at: 1))"))
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
                    onDismiss(true)
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
                Button(L.t("KEEP FOR LATER", "GUARDAR PARA DESPUÉS")) { onDismiss(false) }
                    .font(.mono(11, .bold)).foregroundStyle(Theme.text.opacity(0.8))
                    .frame(minHeight: 44).accessibilityIdentifier("gear-unlock-store")
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
    @ObservedObject var store: CompanionStore
    var onEquip: () -> Void = {}
    private var xp: Int { store.disciplineXP }

    private var gold: Color { Color(red: 0.96, green: 0.77, blue: 0.26) }
    private var unlocked: Bool { CompanionToolkit.unlocked(tool, xp: xp) }
    private var tint: Color { tool.isGolden ? gold : companion.tint }

    var body: some View {
        ScrollView {
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
                if unlocked {
                    EquipmentControl(store: store, item: .tool(tool, companion), onEquip: onEquip)
                }
            }
            .padding(.bottom, 16)
            .frame(maxWidth: .infinity)
        }
    }
}

/// Removing a piece changes the outfit, never its ownership or XP threshold.
struct EquipmentControl: View {
    @ObservedObject var store: CompanionStore
    let item: CatalogItem
    var onEquip: () -> Void = {}
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        let equipped = store.isEquipped(item)
        VStack(spacing: 8) {
            Button {
                store.setEquipped(!equipped, item: item)
                UIImpactFeedbackGenerator(style: .light).impactOccurred()
                if !equipped { onEquip() }
                dismiss()
            } label: {
                Label(equipped ? L.t("UNEQUIP", "QUITAR") : L.t("EQUIP", "EQUIPAR"), systemImage: equipped ? "minus.circle" : "plus.circle")
                    .font(.mono(12, .bold)).frame(maxWidth: .infinity, minHeight: 48)
            }
            .buttonStyle(.borderedProminent).tint(item.companion.tint).foregroundStyle(.black)
            .accessibilityIdentifier("equipment-toggle-\(item.id)")
            .accessibilityValue(equipped ? L.t("Equipped", "Equipado") : L.t("Stored", "Guardado"))
            Text(L.t("Stays in your collection. Your XP stays the same.", "Se queda en tu colección. Conservas tu XP."))
                .font(.rounded(12, .medium)).foregroundStyle(Theme.muted).multilineTextAlignment(.center)
        }.padding(.horizontal, 24)
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
        case "glitch": return CompanionPet(companionId: companionId, name: L.t("Bug the gecko", "Bicho el geco"), emoji: "🦎", spins: false)
        case "momo": return CompanionPet(companionId: companionId, name: L.t("Ink the octopus", "Tinta el pulpo"), emoji: "🐙", spins: false)
        case "flux": return CompanionPet(companionId: companionId, name: L.t("Echo the parrot", "Eco el loro"), emoji: "🦜", spins: false)
        case "rook": return CompanionPet(companionId: companionId, name: L.t("Sage the owl", "Sabio el búho"), emoji: "🦉", spins: false)
        case "halo": return CompanionPet(companionId: companionId, name: L.t("Peace the dove", "Paz la paloma"), emoji: "🕊️", spins: false)
        case "axiom": return CompanionPet(companionId: companionId, name: L.t("Ledger the turtle", "Libreta la tortuga"), emoji: "🐢", spins: false)
        // Wave 2 — mirrors PETS in src/lib/companions/data.ts (art shipped 2026-09-07).
        case "iris": return CompanionPet(companionId: companionId, name: L.t("Cirrus the crane", "Cirrus la grulla"), emoji: "🐦", spins: false)
        case "sol": return CompanionPet(companionId: companionId, name: L.t("Root the hedgehog", "Root el erizo"), emoji: "🦔", spins: false)
        case "zuri": return CompanionPet(companionId: companionId, name: L.t("Trace the fox", "Trace el zorro"), emoji: "🦊", spins: false)
        case "mira": return CompanionPet(companionId: companionId, name: L.t("Pace the hare", "Pace la liebre"), emoji: "🐇", spins: false)
        case "nalu": return CompanionPet(companionId: companionId, name: L.t("Kai the dolphin", "Kai el delfín"), emoji: "🐬", spins: false)
        case "vega": return CompanionPet(companionId: companionId, name: L.t("Sigma the raven", "Sigma el cuervo"), emoji: "🐦‍⬛", spins: false)
        case "noor": return CompanionPet(companionId: companionId, name: L.t("Elder the tortoise", "Elder la tortuga"), emoji: "🐢", spins: false)
        case "keo": return CompanionPet(companionId: companionId, name: L.t("Sombra the sea turtle", "Sombra la tortuga marina"), emoji: "🐢", spins: false)
        default: return nil
        }
    }
    static func petUnlocked(companionId: String, xp: Int) -> Bool { xp >= CompanionPet.unlockXP }
    static func wornGear(companionId: String, xp: Int) -> [CompanionTool] {
        tools(for: companionId).filter { unlocked($0, xp: xp) }
    }
}

/// One thing you can earn, with the companion that wears it (the locker).
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

// MARK: - Share my skin

enum SkinCard {
    /// Composes the share card: the live scene snapshot, the companion's name,
    /// level, worn gear and pet. 1080×1350 (feed portrait) or, with `story`,
    /// 1080×1920 for Instagram and WhatsApp stories — content kept clear of
    /// the top and bottom bands their own UI covers.
    static func render(snapshot: UIImage, companion: Companion, level: CompanionLevel, gear: [CompanionTool], pet: CompanionPet?, xp: Int, story: Bool = false) -> UIImage {
        let size = CGSize(width: 1080, height: story ? 1920 : 1350)
        let dy: CGFloat = story ? 260 : 0          // everything below the header shifts down
        return UIGraphicsImageRenderer(size: size).image { ctx in
            let c = ctx.cgContext
            UIColor(red: 0.01, green: 0.012, blue: 0.019, alpha: 1).setFill()
            c.fill(CGRect(origin: .zero, size: size))
            let tint = UIColor(hue: companion.hue, saturation: 0.7, brightness: 0.95, alpha: 1)
            let glowColors = [tint.withAlphaComponent(0.35).cgColor, tint.withAlphaComponent(0).cgColor] as CFArray
            if let gradient = CGGradient(colorsSpace: CGColorSpaceCreateDeviceRGB(), colors: glowColors, locations: [0, 1]) {
                c.drawRadialGradient(gradient, startCenter: CGPoint(x: 540, y: 560 + dy), startRadius: 0, endCenter: CGPoint(x: 540, y: 560 + dy), endRadius: 620, options: [])
            }
            let mono = UIFont.monospacedSystemFont(ofSize: 30, weight: .bold)
            let head = NSAttributedString(string: "BOBBY // \(L.t("MY SKIN", "MI ESTILO"))", attributes: [.font: mono, .foregroundColor: UIColor.white.withAlphaComponent(0.75), .kern: 6])
            head.draw(at: CGPoint(x: 72, y: 72 + (story ? 200 : 0)))
            let aspect = snapshot.size.width / max(snapshot.size.height, 1)
            let shotH: CGFloat = 760
            let shotW = shotH * aspect
            snapshot.draw(in: CGRect(x: (size.width - shotW) / 2, y: 150 + dy, width: shotW, height: shotH))
            let name = NSAttributedString(string: companion.name(at: level.number), attributes: [.font: UIFont.systemFont(ofSize: 76, weight: .bold), .foregroundColor: UIColor.white, .kern: 4])
            let nameW = name.size().width
            name.draw(at: CGPoint(x: (size.width - nameW) / 2, y: 930 + dy))
            let sub = NSAttributedString(string: "\(L.t("LEVEL", "NIVEL")) \(level.number) · \(level.name) · \(xp) XP", attributes: [.font: UIFont.monospacedSystemFont(ofSize: 26, weight: .bold), .foregroundColor: tint, .kern: 4])
            sub.draw(at: CGPoint(x: (size.width - sub.size().width) / 2, y: 1024 + dy))
            var line = gear.map { $0.name }
            if let pet { line.append(pet.name) }
            let gearText = line.isEmpty ? L.t("No accessories equipped.", "Sin accesorios equipados.") : line.joined(separator: " · ")
            let gearAttr = NSAttributedString(string: gearText, attributes: [.font: UIFont.systemFont(ofSize: 28, weight: .medium), .foregroundColor: UIColor.white.withAlphaComponent(0.8)])
            let gearRect = CGRect(x: 90, y: 1090 + dy, width: size.width - 180, height: 120)
            gearAttr.draw(with: gearRect, options: [.usesLineFragmentOrigin], context: nil)
            let foot = NSAttributedString(string: "bobbyprotocol.xyz · \(L.t("earned with discipline, never volume", "ganado con disciplina, nunca volumen"))", attributes: [.font: UIFont.monospacedSystemFont(ofSize: 22, weight: .medium), .foregroundColor: UIColor.white.withAlphaComponent(0.4), .kern: 2])
            foot.draw(at: CGPoint(x: (size.width - foot.size().width) / 2, y: 1270 + dy))
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
    @ObservedObject var store: CompanionStore
    private var xp: Int { store.disciplineXP }
    var body: some View {
        let pet = CompanionToolkit.pet(for: companion.id)
        let has = CompanionToolkit.petUnlocked(companionId: companion.id, xp: xp)
        ScrollView {
            VStack(spacing: 12) {
                Capsule().fill(Theme.stroke).frame(width: 36, height: 4).padding(.top, 8)
                if let pet, pet.hasArt {
                    Image(pet.assetName).resizable().scaledToFit().frame(width: 150, height: 150).saturation(has ? 1 : 0.15)
                } else {
                    Text(pet?.emoji ?? "🐾").font(.system(size: 96)).saturation(has ? 1 : 0.15)
                }
                Text(pet?.name ?? "").font(.rounded(22, .bold)).foregroundStyle(Theme.text)
                Text(has
                     ? ((pet?.spins ?? false) ? L.t("Spins next to you on the desk.", "Gira a tu lado en la mesa.") : L.t("Lives at your companion's feet.", "Vive a los pies de tu amigo."))
                     : L.t("Unlocks at \(CompanionPet.unlockXP) XP · you have \(xp). Discipline only.", "Se desbloquea a \(CompanionPet.unlockXP) XP · llevas \(xp). Solo disciplina."))
                    .font(.rounded(14, .medium)).foregroundStyle(Theme.text.opacity(0.75)).multilineTextAlignment(.center).padding(.horizontal, 28)
                if has, let pet { EquipmentControl(store: store, item: .pet(pet, companion)) }
            }
            .frame(maxWidth: .infinity).padding(.bottom, 16)
        }
    }
}
