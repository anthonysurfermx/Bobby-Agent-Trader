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
        case .dalia: return "cálida · MX"
        case .jorge: return "grave · MX"
        case .paloma: return "fresca · US"
        case .alonso: return "joven · US"
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
        case .chill: return "relajado, como tu compa que sí sabe"
        case .directo: return "cero rodeos, puro dato"
        case .pro: return "mesa de dinero, técnico"
        }
    }
    var sample: String {
        switch self {
        case .chill: return "Va — bitcoin anda en sesenta y cuatro mil, tranquilo el día."
        case .directo: return "Bitcoin: sesenta y cuatro mil. Tendencia alcista. Punto."
        case .pro: return "Bitcoin cotiza en sesenta y cuatro mil con estructura alcista intacta."
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

    init() {
        let d = UserDefaults.standard
        onboarded = d.bool(forKey: "agent.onboarded")
        name = d.string(forKey: "agent.name") ?? "Bobby"
        voiceId = d.string(forKey: "agent.voice") ?? AgentVoice.dalia.rawValue
        vibeId = d.string(forKey: "agent.vibe") ?? AgentVibe.directo.rawValue
    }

    var voice: AgentVoice { AgentVoice(rawValue: voiceId) ?? .dalia }
    var vibe: AgentVibe { AgentVibe(rawValue: vibeId) ?? .directo }

    /// Vibe-flavored greeting for the first bubble.
    var greeting: String {
        switch vibe {
        case .chill: return "Qué onda — soy \(name). Pregúntame de cualquier activo: bitcoin, NVIDIA, oro, lo que traigas."
        case .directo: return "Soy \(name). Dime un activo y te doy precio, niveles y lectura. Sin rodeos."
        case .pro: return "Soy \(name), tu mesa de análisis. Consulta cualquier activo: cripto, acciones, commodities."
        }
    }
}
