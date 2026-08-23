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

    var tint: Color { Color(hue: hue, saturation: 0.70, brightness: 0.95) }
    var tintSoft: Color { Color(hue: hue, saturation: 0.40, brightness: 1.0) }
}

let bobbyCompanions: [Companion] = [
    .init(id: "orb", label: "BOBBY", role: "ORB · NÚCLEO",
          personality: "el núcleo que orquesta al squad",
          selectLine: "Listo. Leemos el mercado juntos, con calma.",
          secretPhrase: "El mercado premia al que espera mejor, no al que corre más.",
          hue: 0.415, requiredLevel: 1),
    .init(id: "byte", label: "BYTE", role: "VOZ SIMPLE",
          personality: "te lo explica sin tecnicismos",
          selectLine: "Hola. Yo te lo digo fácil, sin rollos.",
          secretPhrase: "Si no lo puedes explicar simple, no lo operes.",
          hue: 0.415, requiredLevel: 1),
    .init(id: "kora", label: "KORA", role: "CONVERSACIÓN",
          personality: "platica del mercado como tu bestie",
          selectLine: "Aquí andamos. Cuéntame qué traes en mente.",
          secretPhrase: "Las mejores decisiones salen de las buenas preguntas.",
          hue: 0.415, requiredLevel: 1),
    .init(id: "zip", label: "ZIP", role: "ALERTAS",
          personality: "rápido para avisarte, nunca para apurarte",
          selectLine: "Al tiro. Si algo se mueve, te aviso yo.",
          secretPhrase: "La velocidad sirve para avisar, no para decidir.",
          hue: 0.415, requiredLevel: 1),
    .init(id: "glitch", label: "GLITCH", role: "RED TEAM",
          personality: "te cuestiona antes de que te emociones",
          selectLine: "¿Seguro? Déjame romper tu tesis primero.",
          secretPhrase: "Toda tesis merece un enemigo antes que tu dinero.",
          hue: 0.745, requiredLevel: 2),
    .init(id: "momo", label: "MOMO", role: "EXPLORACIÓN",
          personality: "curiosea contigo sin miedo a preguntar",
          selectLine: "¿Y si exploramos algo nuevo hoy?",
          secretPhrase: "Explorar no cuesta capital. Ejecutar sí.",
          hue: 0.745, requiredLevel: 2),
    .init(id: "flux", label: "FLUX", role: "SEÑALES",
          personality: "detecta el contexto antes que el ruido",
          selectLine: "Señal detectada. Contexto primero, ruido después.",
          secretPhrase: "Una señal sin contexto es solo ruido bonito.",
          hue: 0.505, requiredLevel: 3),
    .init(id: "rook", label: "ROOK", role: "TESIS",
          personality: "arma el plan: entrada, stop, invalidación",
          selectLine: "Tesis en construcción. Entrada, stop, invalidación.",
          secretPhrase: "Sin invalidación escrita no es tesis: es esperanza.",
          hue: 0.415, requiredLevel: 3),
    .init(id: "halo", label: "HALO", role: "RISK GATE",
          personality: "celebra contigo el no operar",
          selectLine: "Hoy proteger capital también cuenta como ganar.",
          secretPhrase: "No setup yet. Capital protected.",
          hue: 0.560, requiredLevel: 4),
    .init(id: "axiom", label: "AXIOM", role: "TRACK RECORD",
          personality: "recuerda todo para que compruebes",
          selectLine: "Todo queda registrado. Comprobar es la ventaja.",
          secretPhrase: "La memoria on-chain no discute: comprueba.",
          hue: 0.115, requiredLevel: 5),
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

let companionLevels: [CompanionLevel] = [
    .init(number: 1, name: "SPAWNED", minXP: 0),
    .init(number: 2, name: "LOCKED IN", minXP: 50),
    .init(number: 3, name: "MARKET READER", minXP: 150),
    .init(number: 4, name: "RISK GUARDIAN", minXP: 400),
    .init(number: 5, name: "ON-CHAIN LEGEND", minXP: 1000),
]

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

    init() {
        companionId = defaults.string(forKey: Key.companion)
        disciplineXP = defaults.integer(forKey: Key.xp)
        disciplineStreak = defaults.integer(forKey: Key.streak)
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

    @discardableResult
    func awardDiscipline(_ points: Int, now: Date = Date()) -> Bool {
        let cal = Calendar.current

        // Daily cap
        var dailyCount = defaults.integer(forKey: Key.dailyAwards)
        if let day = defaults.object(forKey: Key.dailyAwardsDay) as? Date,
           cal.isDate(day, inSameDayAs: now) {
            guard dailyCount < maxDailyAwards else { return false }
            dailyCount += 1
        } else {
            dailyCount = 1
        }
        defaults.set(dailyCount, forKey: Key.dailyAwards)
        defaults.set(now, forKey: Key.dailyAwardsDay)

        disciplineXP += points

        // Discipline streak with one grace day
        if let last = defaults.object(forKey: Key.lastDay) as? Date {
            if cal.isDate(last, inSameDayAs: now) {
                // same day — streak unchanged
            } else {
                let days = cal.dateComponents([.day], from: cal.startOfDay(for: last), to: cal.startOfDay(for: now)).day ?? 99
                disciplineStreak = days <= 2 ? disciplineStreak + 1 : 1
            }
        } else {
            disciplineStreak = 1
        }
        defaults.set(now, forKey: Key.lastDay)
        return true
    }
}
