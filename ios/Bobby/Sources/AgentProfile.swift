// The 3-step personalization — voice, vibe, name. This is the product hook:
// your Bobby, your style. Stored locally; the server only ever sees the
// voice id and the text to speak.
import SwiftUI

enum AgentVoice: String, CaseIterable, Identifiable {
    case dalia = "es-MX-DaliaNeural"
    case jorge = "es-MX-JorgeNeural"
    case paloma = "es-US-PalomaNeural"
    case alonso = "es-US-AlonsoNeural"

    var id: String { rawValue }
    var label: String {
        switch self {
        case .dalia: return "Dalia"
        case .jorge: return "Jorge"
        case .paloma: return "Paloma"
        case .alonso: return "Alonso"
        }
    }
    var flavor: String {
        switch self {
        case .dalia: return L.t("warm · MX", "cálida · MX")
        case .jorge: return L.t("deep · MX", "grave · MX")
        case .paloma: return L.t("bright · US", "fresca · US")
        case .alonso: return L.t("young · US", "joven · US")
        }
    }
}

/// The agent's aura — the energy that tints the orb, its glow and the desk
/// accents. The user DESCRIBES it in their own words; the color derives from
/// the text (known energy words map to intentional hues, anything else gets a
/// deterministic hue of its own, so every described aura is unique).
enum AuraForge {
    /// (keyword fragments, hue 0..1) — checked in order, first hit wins.
    private static let energies: [([String], Double)] = [
        (["rojo", "fuego", "sangre", "red"], 0.995),
        (["naranja", "orange", "sunset"], 0.075),
        (["dorad", "solar", "oro", "amarill", "gold"], 0.115),
        (["verde", "matrix", "hacker", "green", "neon"], 0.415),
        (["cyan", "hielo", "ice", "turquesa", "aqua"], 0.505),
        (["azul", "voltaje", "electric", "eléctric", "blue"], 0.615),
        (["violeta", "morad", "ultra", "midnight", "purple", "lila"], 0.745),
        (["rosa", "pink", "magenta"], 0.895),
    ]

    static func hue(for text: String) -> Double {
        let t = text.lowercased().folding(options: .diacriticInsensitive, locale: .current)
        guard !t.trimmingCharacters(in: .whitespaces).isEmpty else { return 0.615 }
        for (words, hue) in energies where words.contains(where: { t.contains($0) }) {
            return hue
        }
        // djb2 → a hue of its own: same words, same aura, always.
        var h: UInt64 = 5381
        for b in t.utf8 { h = (h &* 33) &+ UInt64(b) }
        return Double(h % 360) / 360
    }

    static func tint(hue: Double) -> Color { Color(hue: hue, saturation: 0.80, brightness: 1.0) }
    static func tintSoft(hue: Double) -> Color { Color(hue: hue, saturation: 0.45, brightness: 1.0) }

    /// Inspiration chips for the onboarding step.
    static let sparks = ["azul voltaje", "verde hacker", "violeta after midnight", "dorado golden hour", "rojo sin miedo"]

    /// The aura as DATA, not decoration (Kimi red-team v3): each hue band maps
    /// to a trader archetype — language the user can own and share.
    static func archetype(hue: Double) -> (name: String, motto: String) {
        switch hue {
        case ..<0.06, 0.95...: return ("CONTRARIAN", L.t("goes against the herd", "va contra la manada"))
        case ..<0.10: return ("SCALPER", L.t("fast and unattached", "rápido y sin apego"))
        case ..<0.30: return ("SWING", L.t("golden patience", "paciencia dorada"))
        case ..<0.47: return ("TREND RIDER", L.t("surfs the trend", "surfea la tendencia"))
        case ..<0.56: return ("SNIPER", L.t("waits for the exact level", "espera el nivel exacto"))
        case ..<0.68: return (L.t("SYSTEMATIC", "SISTEMÁTICO"), L.t("data over vibes", "datos sobre vibes"))
        case ..<0.82: return ("NIGHT OWL", L.t("lives the night session", "vive la sesión nocturna"))
        default: return ("SENTIMENT", L.t("reads the market mood", "lee el mood del mercado"))
        }
    }
}

enum AgentVibe: String, CaseIterable, Identifiable {
    case chill, directo, pro

    var id: String { rawValue }
    var label: String {
        switch self {
        case .chill: return "Chill"
        case .directo: return "Directo"
        case .pro: return "Pro"
        }
    }
    var desc: String {
        switch self {
        case .chill: return L.t("laid back, like a friend who actually knows", "relajado, como tu compa que sí sabe")
        case .directo: return L.t("no fluff, straight data", "cero rodeos, puro dato")
        case .pro: return L.t("trading desk, technical", "mesa de dinero, técnico")
        }
    }
    var sample: String {
        switch self {
        case .chill: return L.t("Alright — bitcoin is at sixty four thousand, quiet day.", "Va — bitcoin anda en sesenta y cuatro mil, tranquilo el día.")
        case .directo: return L.t("Bitcoin: sixty four thousand. Uptrend. Period.", "Bitcoin: sesenta y cuatro mil. Tendencia alcista. Punto.")
        case .pro: return L.t("Bitcoin trades at sixty four thousand with its bullish structure intact.", "Bitcoin cotiza en sesenta y cuatro mil con estructura alcista intacta.")
        }
    }
}

final class AgentProfile: ObservableObject {
    // @Published + manual UserDefaults, NOT @AppStorage: inside an
    // ObservableObject, @AppStorage never fires objectWillChange, so the
    // UI silently stops reacting (the onboarding "couldn't be finished").
    @Published var onboarded: Bool { didSet { UserDefaults.standard.set(onboarded, forKey: "agent.onboarded") } }
    @Published var name: String { didSet { UserDefaults.standard.set(name, forKey: "agent.name") } }
    @Published var voiceId: String { didSet { UserDefaults.standard.set(voiceId, forKey: "agent.voice") } }
    @Published var vibeId: String { didSet { UserDefaults.standard.set(vibeId, forKey: "agent.vibe") } }
    @Published var auraText: String { didSet { UserDefaults.standard.set(auraText, forKey: "agent.auraText") } }

    init() {
        let d = UserDefaults.standard
        onboarded = d.bool(forKey: "agent.onboarded")
        name = d.string(forKey: "agent.name") ?? "Bobby"
        voiceId = d.string(forKey: "agent.voice") ?? AgentVoice.dalia.rawValue
        vibeId = d.string(forKey: "agent.vibe") ?? AgentVibe.directo.rawValue
        auraText = d.string(forKey: "agent.auraText") ?? "azul voltaje"
    }

    var voice: AgentVoice { AgentVoice(rawValue: voiceId) ?? .dalia }
    var vibe: AgentVibe { AgentVibe(rawValue: vibeId) ?? .directo }
    var auraHue: Double { AuraForge.hue(for: auraText) }
    var auraTint: Color { AuraForge.tint(hue: auraHue) }
    var auraTintSoft: Color { AuraForge.tintSoft(hue: auraHue) }
    var auraArchetype: (name: String, motto: String) { AuraForge.archetype(hue: auraHue) }

    /// Vibe-flavored greeting for the first bubble.
    var greeting: String {
        switch vibe {
        case .chill: return "Hey — I am \(name). Ask me about any asset: bitcoin, NVIDIA, gold, whatever you bring."
        case .directo: return "I am \(name). Name an asset and I give you price, levels and the read. No fluff."
        case .pro: return "I am \(name), your analysis desk. Query any asset: crypto, equities, commodities."
        }
    }
}
