// ============================================================
// Companion — the bond system. One chosen companion that lives
// on the desk and evolves with FINANCIAL DISCIPLINE, never with
// volume, frequency or PnL. XP sources are process-quality only
// (review the full debate, respect a NO TRADE, revisit a thesis).
// Evolution changes cosmetics/expressivity — never analysis.
// ============================================================

import SwiftUI

struct Companion: Identifiable, Equatable {
    let id: String          // GLB filename in the bundle
    let label: String
    let role: String        // canonical pipeline role
    let personality: String // one line, the "why this one"
    let selectLine: String  // spoken when chosen
    let secretPhrase: String // long-press easter egg
    let hue: Double         // identity tint
    let requiredLevel: Int  // 1 = available from the start
    /// Voice persona sent to /api/bobby-voice-free — each companion sounds
    /// like itself (coral warm · ballad chill · sage calm · ash tactical).
    let voicePersona: String
    /// Evolution line: the name TRANSFORMS as discipline grows (index 0..4).
    let evolutionNames: [String]

    var tint: Color { Color(hue: hue, saturation: 0.70, brightness: 0.95) }
    var tintSoft: Color { Color(hue: hue, saturation: 0.40, brightness: 1.0) }

    /// The name at a given level — this is the identity the user sees.
    func name(at level: Int) -> String {
        let i = max(0, min(evolutionNames.count - 1, level - 1))
        return evolutionNames[i]
    }
}

let bobbyCompanions: [Companion] = [
    .init(id: "orb", label: "BOBBY", role: L.t("ORB · CORE", "ORB · NÚCLEO"),
          personality: L.t("the core that orchestrates the squad", "el núcleo que orquesta al squad"),
          selectLine: L.t("Ready. We read the market together, calmly.", "Listo. Leemos el mercado juntos, con calma."),
          secretPhrase: L.t("The market rewards who waits better, not who runs faster.", "El mercado premia al que espera mejor, no al que corre más."),
          hue: 0.415, requiredLevel: 1,
          voicePersona: "ash",
          evolutionNames: ["BOBBY", "BOBBY LINK", "BOBBY CORE", "BOBBY PRIME", "BOBBY OMEGA"]),
    .init(id: "byte", label: "BYTE", role: L.t("PLAIN SPEAK", "VOZ SIMPLE"),
          personality: L.t("explains it without the jargon", "te lo explica sin tecnicismos"),
          selectLine: L.t("Hey. I keep it simple, no jargon.", "Hola. Yo te lo digo fácil, sin rollos."),
          secretPhrase: L.t("If you cannot explain it simply, do not trade it.", "Si no lo puedes explicar simple, no lo operes."),
          hue: 0.415, requiredLevel: 1,
          voicePersona: "ballad",
          evolutionNames: ["BYTE", "KILOBYTE", "MEGABYTE", "GIGABYTE", "TERABYTE"]),
    .init(id: "kora", label: "KORA", role: L.t("CONVERSATION", "CONVERSACIÓN"),
          personality: L.t("talks markets like your best friend", "platica del mercado como tu bestie"),
          selectLine: L.t("I am here. Tell me what is on your mind.", "Aquí andamos. Cuéntame qué traes en mente."),
          secretPhrase: L.t("The best decisions come from better questions.", "Las mejores decisiones salen de las buenas preguntas."),
          hue: 0.415, requiredLevel: 1,
          voicePersona: "coral",
          evolutionNames: ["KORA", "KORA ECO", "KORA AURORA", "KORA NOVA", "KORA SUPERNOVA"]),
    .init(id: "zip", label: "ZIP", role: L.t("ALERTS", "ALERTAS"),
          personality: L.t("fast to alert you, never to rush you", "rápido para avisarte, nunca para apurarte"),
          selectLine: L.t("On it. If something moves, I will tell you.", "Al tiro. Si algo se mueve, te aviso yo."),
          secretPhrase: L.t("Speed is for alerting, not for deciding.", "La velocidad sirve para avisar, no para decidir."),
          hue: 0.415, requiredLevel: 1,
          voicePersona: "ballad",
          evolutionNames: ["ZIP", "ZIP PULSE", "ZIP STORM", "ZIP SONIC", "ZIP LIGHTSPEED"]),
    .init(id: "glitch", label: "GLITCH", role: "RED TEAM",
          personality: L.t("questions you before you get excited", "te cuestiona antes de que te emociones"),
          selectLine: L.t("Sure about that? Let me break your thesis first.", "¿Seguro? Déjame romper tu tesis primero."),
          secretPhrase: L.t("Every thesis deserves an enemy before your money.", "Toda tesis merece un enemigo antes que tu dinero."),
          hue: 0.745, requiredLevel: 2,
          voicePersona: "ash",
          evolutionNames: ["GLITCH", "GLITCH EDGE", "GLITCH PROBE", "GLITCH BREAKER", "GLITCH ZERO"]),
    .init(id: "momo", label: "MOMO", role: L.t("EXPLORATION", "EXPLORACIÓN"),
          personality: L.t("explores with you, never afraid to ask", "curiosea contigo sin miedo a preguntar"),
          selectLine: L.t("What if we explore something new today?", "¿Y si exploramos algo nuevo hoy?"),
          secretPhrase: L.t("Exploring costs no capital. Executing does.", "Explorar no cuesta capital. Ejecutar sí."),
          hue: 0.745, requiredLevel: 2,
          voicePersona: "coral",
          evolutionNames: ["MOMO", "MOMO SCOUT", "MOMO VOYAGER", "MOMO COSMOS", "MOMO INFINITE"]),
    .init(id: "flux", label: "FLUX", role: L.t("SIGNALS", "SEÑALES"),
          personality: L.t("finds the context before the noise", "detecta el contexto antes que el ruido"),
          selectLine: L.t("Signal detected. Context first, noise later.", "Señal detectada. Contexto primero, ruido después."),
          secretPhrase: L.t("A signal without context is just pretty noise.", "Una señal sin contexto es solo ruido bonito."),
          hue: 0.505, requiredLevel: 3,
          voicePersona: "sage",
          evolutionNames: ["FLUX", "FLUX WAVE", "FLUX RADAR", "FLUX QUANTUM", "FLUX SIGMA"]),
    .init(id: "rook", label: "ROOK", role: L.t("THESIS", "TESIS"),
          personality: L.t("builds the plan: entry, stop, invalidation", "arma el plan: entrada, stop, invalidación"),
          selectLine: L.t("Thesis in progress. Entry, stop, invalidation.", "Tesis en construcción. Entrada, stop, invalidación."),
          secretPhrase: L.t("With no written invalidation it is not a thesis: it is hope.", "Sin invalidación escrita no es tesis: es esperanza."),
          hue: 0.415, requiredLevel: 3,
          voicePersona: "ash",
          evolutionNames: ["ROOK", "ROOK GAMBIT", "ROOK TACTICIAN", "ROOK MASTER", "GRANDMASTER"]),
    .init(id: "halo", label: "HALO", role: "RISK GATE",
          personality: L.t("celebrates not trading with you", "celebra contigo el no operar"),
          selectLine: L.t("Protecting capital today also counts as winning.", "Hoy proteger capital también cuenta como ganar."),
          secretPhrase: "No setup yet. Capital protected.",
          hue: 0.560, requiredLevel: 4,
          voicePersona: "sage",
          evolutionNames: ["HALO", "HALO SHIELD", "HALO WARDEN", "HALO AEGIS", "HALO SANCTUM"]),
    .init(id: "axiom", label: "AXIOM", role: "TRACK RECORD",
          personality: L.t("remembers everything so you can verify", "recuerda todo para que compruebes"),
          selectLine: L.t("Everything gets recorded. Verifying is the edge.", "Todo queda registrado. Comprobar es la ventaja."),
          secretPhrase: L.t("On-chain memory does not argue: it verifies.", "La memoria on-chain no discute: comprueba."),
          hue: 0.115, requiredLevel: 5,
          voicePersona: "coral",
          evolutionNames: ["AXIOM", "AXIOM PROOF", "AXIOM LEDGER", "AXIOM ORACLE", "AXIOM ETERNAL"]),
]

// ---- Portrait (bundled PNG with tinted-initial fallback) ------

struct CompanionThumb: View {
    let companion: Companion

    var body: some View {
        if let ui = UIImage(named: "\(companion.id)_thumb") {
            Image(uiImage: ui).resizable().scaledToFill()
        } else {
            ZStack {
                companion.tint.opacity(0.18)
                Text(String(companion.label.prefix(1)))
                    .font(.mono(20, .black))
                    .foregroundStyle(companion.tint)
            }
        }
    }
}

// ---- Evolution ladder (names are user-facing) ----------------

struct CompanionLevel {
    let number: Int
    let name: String
    let minXP: Int
}

enum CompanionEmote: String, CaseIterable, Identifiable {
    case pulse
    case orbit
    case victory
    case shield
    case legend

    var id: String { rawValue }

    var label: String {
        switch self {
        case .pulse: return "PULSE"
        case .orbit: return "ORBIT"
        case .victory: return "VICTORY"
        case .shield: return "SHIELD"
        case .legend: return "LEGEND"
        }
    }

    var symbol: String {
        switch self {
        case .pulse: return "waveform.path.ecg"
        case .orbit: return "arrow.triangle.2.circlepath"
        case .victory: return "sparkles"
        case .shield: return "checkmark.shield.fill"
        case .legend: return "crown.fill"
        }
    }

    var requiredLevel: Int {
        switch self {
        case .pulse: return 1
        case .orbit: return 2
        case .victory: return 3
        case .shield: return 4
        case .legend: return 5
        }
    }
}

struct CompanionEmoteEvent: Equatable {
    let id: UUID
    let emote: CompanionEmote

    init(id: UUID = UUID(), emote: CompanionEmote) {
        self.id = id
        self.emote = emote
    }
}

let companionLevels: [CompanionLevel] = [
    .init(number: 1, name: "SPAWNED", minXP: 0),
    .init(number: 2, name: "LOCKED IN", minXP: 50),
    .init(number: 3, name: "MARKET READER", minXP: 150),
    .init(number: 4, name: "RISK GUARDIAN", minXP: 400),
    .init(number: 5, name: "ON-CHAIN LEGEND", minXP: 1000),
]

/// How the companion SPEAKS at each level — the same character, more
/// earned confidence. Appended to greetings; never changes analysis.
func levelTone(_ level: Int) -> String {
    switch level {
    case 1: return ""
    case 2: return L.t(" We are finding our rhythm.", " Ya agarramos ritmo.")
    case 3: return L.t(" After this many reads, I know your style.", " Después de tantas lecturas, ya te conozco el estilo.")
    case 4: return L.t(" And above all: we protect the risk.", " Y antes que nada: cuidamos el riesgo.")
    default: return L.t(" We have a track record now. Here we verify, we do not promise.", " Ya llevamos historial. Aquí se comprueba, no se promete.")
    }
}

// ---- Store ----------------------------------------------------

final class CompanionStore: ObservableObject {
    private let defaults = UserDefaults.standard
    private enum Key {
        static let companion = "companion.id"
        static let xp = "companion.disciplineXP"
        static let streak = "companion.disciplineStreak"
        static let lastDay = "companion.lastDisciplineDay"
        static let dailyAwards = "companion.dailyAwards"
        static let dailyAwardsDay = "companion.dailyAwardsDay"
    }

    @Published var companionId: String? {
        didSet { defaults.set(companionId, forKey: Key.companion) }
    }
    @Published private(set) var disciplineXP: Int {
        didSet { defaults.set(disciplineXP, forKey: Key.xp) }
    }
    @Published private(set) var disciplineStreak: Int {
        didSet { defaults.set(disciplineStreak, forKey: Key.streak) }
    }
    /// Set when discipline just pushed the companion into a new level —
    /// the UI consumes it to play the evolution moment, then clears it.
    @Published var pendingEvolution: CompanionLevel?

    init() {
        companionId = defaults.string(forKey: Key.companion)
        disciplineXP = defaults.integer(forKey: Key.xp)
        disciplineStreak = defaults.integer(forKey: Key.streak)
        pendingEvolution = nil
    }

    var companion: Companion? { bobbyCompanions.first { $0.id == companionId } }

    var level: CompanionLevel {
        companionLevels.last { disciplineXP >= $0.minXP } ?? companionLevels[0]
    }

    var nextLevel: CompanionLevel? {
        companionLevels.first { $0.minXP > disciplineXP }
    }

    /// 0..1 progress toward the next level (1 when maxed).
    var levelProgress: Double {
        guard let next = nextLevel else { return 1 }
        let base = level.minXP
        return Double(disciplineXP - base) / Double(next.minXP - base)
    }

    func isUnlocked(_ c: Companion) -> Bool { level.number >= c.requiredLevel }

    /// Discipline XP — capped per day so grinding the same action is
    /// pointless. Also feeds the discipline streak (1 grace day: missing
    /// a single day keeps the streak; two or more resets it).
    private let maxDailyAwards = 3

    /// Returns the points actually awarded — 0 when the daily cap already
    /// rejected the award. The UI must show THIS number, never the intent.
    @discardableResult
    func awardDiscipline(_ points: Int, now: Date = Date()) -> Int {
        let cal = Calendar.current

        // Daily cap
        var dailyCount = defaults.integer(forKey: Key.dailyAwards)
        if let day = defaults.object(forKey: Key.dailyAwardsDay) as? Date,
           cal.isDate(day, inSameDayAs: now) {
            guard dailyCount < maxDailyAwards else { return 0 }
            dailyCount += 1
        } else {
            dailyCount = 1
        }
        defaults.set(dailyCount, forKey: Key.dailyAwards)
        defaults.set(now, forKey: Key.dailyAwardsDay)

        let levelBefore = level.number
        disciplineXP += points
        // Evolution moment: name, voice tone and form change together
        if level.number > levelBefore { pendingEvolution = level }

        // Discipline streak with one grace day: consecutive day grows it,
        // a single skipped day PRESERVES it (grace, no growth), longer
        // gaps reset it.
        if let last = defaults.object(forKey: Key.lastDay) as? Date {
            if cal.isDate(last, inSameDayAs: now) {
                // same day — streak unchanged
            } else {
                let days = cal.dateComponents([.day], from: cal.startOfDay(for: last), to: cal.startOfDay(for: now)).day ?? 99
                switch days {
                case 1: disciplineStreak += 1        // consecutive day
                case 2: break                        // grace day — hold, don't grow
                default: disciplineStreak = 1        // streak broken
                }
            }
        } else {
            disciplineStreak = 1
        }
        defaults.set(now, forKey: Key.lastDay)
        return points
    }
}
