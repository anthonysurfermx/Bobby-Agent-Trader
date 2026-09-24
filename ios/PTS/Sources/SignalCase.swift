import Foundation

extension Double {
    /// Two decimals, with thousands separators once prices reach BTC's scale.
    var priceText: String {
        formatted(.number.precision(.fractionLength(2)).grouping(.automatic).locale(Locale(identifier: "en_US")))
    }
}

/// A published price. `role` is set only when the author documented it.
struct SignalLevel: Hashable {
    let price: Double
    let role: String?
    var chipTitle: String { role.map { "\($0) \(price.priceText)" } ?? price.priceText }
}

struct SignalMoment: Hashable {
    let label: String
    let url: URL
    let identifier: String
}

/// Everything the detail screen and Copiloto need for one curated signal.
struct SignalCase {
    let marketResource: String
    let chartCaption: String
    let levels: [SignalLevel]
    let focusLevel: Double
    /// Shaded reference zones: (from, to, rgba color).
    let bands: [(Double, Double, String)]
    let priceRange: ClosedRange<Double>
    let hasGuidedNarration: Bool
    let moments: [SignalMoment]
    let sourceNote: String
    let voice: PTSVoiceCase
    let suggestions: [String]
    let levelQuestion: (SignalLevel) -> String
    /// Prices tracked live after publication; roles only where documented.
    let milestones: [SignalMilestone]
    /// ASTS was published with the entry already active.
    let entryAtPublication: Bool
    /// Reviewed offline answers; nil uses the COIN answers in SignalTutor.
    let reviewedAnswer: ((String) -> String)?
    // Details sheet
    let evidenceLabel: String
    let contractTitle: String
    let contractDetail: String
    let originalImage: String
    let levelsNote: String
    let chartNote: String

    static func forSignal(_ signal: SignalListItem) -> SignalCase {
        switch signal.id {
        case SignalListItem.xly.id: return .xly
        case SignalListItem.dram.id: return .dram
        case SignalListItem.asts.id: return .asts
        case SignalListItem.btc.id: return .btc
        case SignalListItem.tlt.id: return .tlt
        default: return .coin
        }
    }

    static let coin = SignalCase(
        marketResource: "coin-market",
        chartCaption: "Acción · USD · histórico",
        levels: [160.07, 171.75, 180.95, 186.22, 190.59, 204.53].map { SignalLevel(price: $0, role: nil) },
        focusLevel: 190.59,
        bands: [(160.07, 171.75, "rgba(169, 176, 186, 0.06)"), (171.75, 180.95, "rgba(169, 176, 186, 0.04)"), (180.95, 204.53, "rgba(169, 176, 186, 0.06)")],
        priceRange: 156...207,
        hasGuidedNarration: true,
        moments: [
            SignalMoment(label: "05:27", url: SignalSource.firstMoment, identifier: "source-327"),
            SignalMoment(label: "15:29", url: SignalSource.secondMoment, identifier: "source-929"),
        ],
        sourceNote: "Solo COIN y el análisis de Daniel · Máximo 3 minutos · No es recomendación",
        voice: .coin,
        suggestions: ["¿Qué crees que pase con COIN?", "¿Qué niveles menciona Daniel?", "¿Cuál es el escenario alcista?"],
        levelQuestion: { "¿Cómo debo interpretar el nivel publicado \(String(format: "%.2f", $0.price)) sin asumir que es una entrada o un stop?" },
        milestones: [SignalMilestone(title: "Nivel 6", price: 204.53, up: true), SignalMilestone(title: "Nivel 1", price: 160.07, up: false)],
        entryAtPublication: false,
        reviewedAnswer: nil,
        evidenceLabel: "Reportado por el autor · ",
        contractTitle: "Contrato sin documentar",
        contractDetail: "Faltan tipo de opción, strike, vencimiento, primas, cantidad, multiplicador, comisiones y ejecución.",
        originalImage: "coin",
        levelsNote: "Los seis niveles se transcribieron de la publicación. Su función no está confirmada: no se les asigna entrada, stop ni objetivo.",
        chartNote: "El gráfico interactivo muestra el precio histórico de la acción, no el resultado de la opción. Usa velas diarias; la publicación original usa velas de dos horas."
    )

    // Levels use the exact values drawn on Daniel's chart; his text rounds
    // the targets to 116-118-123 and break-even to 115.
    static let xly = SignalCase(
        marketResource: "xly-market",
        chartCaption: "ETF · USD · histórico",
        levels: [
            SignalLevel(price: 109.26, role: "Stop"),
            SignalLevel(price: 112.99, role: "Entrada"),
            SignalLevel(price: 115.05, role: "BE"),
            SignalLevel(price: 116.66, role: "Obj. 1"),
            SignalLevel(price: 118.64, role: "Obj. 2"),
            SignalLevel(price: 123.73, role: "Obj. 3"),
        ],
        focusLevel: 112.99,
        bands: [(109.26, 112.99, "rgba(248, 113, 113, 0.07)"), (112.99, 123.73, "rgba(74, 222, 128, 0.05)")],
        priceRange: 107...125,
        hasGuidedNarration: false,
        moments: [],
        sourceNote: "Solo XLY y el plan de Daniel · Máximo 3 minutos · No es recomendación",
        voice: .xly,
        suggestions: ["¿Qué crees que pase con XLY?", "¿Cuál es la entrada y el stop?", "¿Qué contrato de opciones propone Daniel?"],
        levelQuestion: { level in
            "¿Qué papel tiene el nivel \(String(format: "%.2f", level.price))\(level.role.map { " (\($0))" } ?? "") en el plan de Daniel para XLY?"
        },
        milestones: [
            SignalMilestone(title: "Entrada", price: 112.99, up: true),
            SignalMilestone(title: "BE", price: 115.05, up: true, afterEntry: true),
            SignalMilestone(title: "Obj. 1", price: 116.66, up: true, afterEntry: true),
            SignalMilestone(title: "Obj. 2", price: 118.64, up: true, afterEntry: true),
            SignalMilestone(title: "Obj. 3", price: 123.73, up: true, afterEntry: true),
            SignalMilestone(title: "Stop", price: 109.26, up: false, afterEntry: true),
        ],
        entryAtPublication: false,
        reviewedAnswer: PTSVoicePolicyXLY.reviewedAnswer,
        evidenceLabel: "Plan publicado por el autor · ",
        contractTitle: "Contrato documentado",
        contractDetail: "Compra de call, strike 115, vence el 19 de marzo de 2027. Daniel estima un riesgo de unos 150 dólares por contrato y un potencial de 230 a 500 dólares. Son estimaciones del autor, no resultados.",
        originalImage: "xly",
        levelsNote: "Entrada 112.99, stop 109.26, stop a break-even al llegar a 115 y objetivos 116, 118 y 123, según el texto. Las líneas usan los valores exactos de su gráfico (115.05, 116.66, 118.64 y 123.73). Riesgo indicado: -0.7 % de la cuenta.",
        chartNote: "El gráfico interactivo muestra el precio histórico diario del ETF hasta el cierre del 21 sep 2026 (112.23, debajo de la entrada). No indica si la entrada se activó ni el resultado de la opción."
    )

    // Levels use the values drawn on Daniel's chart; his text says entry zone
    // 64.00-65.85, break-even 73 and targets 83-102.
    static let asts = SignalCase(
        marketResource: "asts-market",
        chartCaption: "Acción · USD · histórico",
        levels: [
            SignalLevel(price: 58.39, role: "Stop"),
            SignalLevel(price: 65.00, role: "Entrada"),
            SignalLevel(price: 73.52, role: "BE"),
            SignalLevel(price: 83.77, role: "Obj. 1"),
            SignalLevel(price: 102.85, role: "Obj. 2"),
        ],
        focusLevel: 65.00,
        bands: [(58.39, 65.00, "rgba(248, 113, 113, 0.07)"), (65.00, 102.85, "rgba(74, 222, 128, 0.05)")],
        priceRange: 55...106,
        hasGuidedNarration: false,
        moments: [],
        sourceNote: "Solo ASTS y el plan de Daniel · Máximo 3 minutos · No es recomendación",
        voice: .asts,
        suggestions: ["¿Qué crees que pase con ASTS?", "¿Cuál es la entrada y el stop?", "¿Por qué es de alto riesgo?"],
        levelQuestion: { level in
            "¿Qué papel tiene el nivel \(String(format: "%.2f", level.price))\(level.role.map { " (\($0))" } ?? "") en el plan de Daniel para ASTS?"
        },
        milestones: [
            SignalMilestone(title: "Entrada", price: 65.00, up: true),
            SignalMilestone(title: "BE", price: 73.52, up: true, afterEntry: true),
            SignalMilestone(title: "Obj. 1", price: 83.77, up: true, afterEntry: true),
            SignalMilestone(title: "Obj. 2", price: 102.85, up: true, afterEntry: true),
            SignalMilestone(title: "Stop", price: 58.39, up: false, afterEntry: true),
        ],
        entryAtPublication: true,
        reviewedAnswer: PTSVoicePolicyASTS.reviewedAnswer,
        evidenceLabel: "Plan publicado por el autor · ",
        contractTitle: "Contrato documentado",
        contractDetail: "Compra de call, strike 75, vence el 20 de noviembre de 2026, no más de 1 contrato. Daniel estima un riesgo de unos 250 dólares por contrato y un potencial de 950 a 2,000 dólares. Son estimaciones del autor, no resultados.",
        originalImage: "asts",
        levelsNote: "Entrada activa en 64.00–65.85, stop 58.39, stop a break-even al llegar a 73 y objetivos 83 y 102, según el texto. Las líneas usan los valores de su gráfico (65.00, 73.52, 83.77 y 102.85). Riesgo indicado: -0.7 % de la cuenta, 1 acción por cada 1,000. Daniel la califica de alto riesgo por su volatilidad.",
        chartNote: "El gráfico interactivo muestra el precio histórico diario hasta el cierre del 21 sep 2026 (61.89). La publicación es del 22 sep durante la sesión, con el precio en la zona de entrada según su gráfico. No hay datos posteriores."
    )

    // The Sep 18 and Sep 21 posts do not state which level is the entry, stop
    // or target (the entry went out on Sep 17), so levels stay neutral.
    static let dram = SignalCase(
        marketResource: "dram-market",
        chartCaption: "ETF · USD · histórico",
        levels: [52.07, 59.02, 64.96, 67.80, 73.74].map { SignalLevel(price: $0, role: nil) },
        focusLevel: 59.02,
        bands: [(52.07, 59.02, "rgba(169, 176, 186, 0.05)"), (59.02, 73.74, "rgba(169, 176, 186, 0.06)")],
        priceRange: 50...76,
        hasGuidedNarration: false,
        moments: [],
        sourceNote: "Solo DRAM y el análisis de Daniel · Máximo 3 minutos · No es recomendación",
        voice: .dram,
        suggestions: ["¿Qué crees que pase con DRAM?", "¿Qué niveles marca Daniel?", "¿Por qué le gusta el sector de memorias?"],
        levelQuestion: { "¿Cómo debo interpretar el nivel \(String(format: "%.2f", $0.price)) del gráfico de Daniel para DRAM sin asumir que es una entrada o un stop?" },
        milestones: [
            SignalMilestone(title: "Nivel 3", price: 64.96, up: true),
            SignalMilestone(title: "Nivel 4", price: 67.80, up: true),
            SignalMilestone(title: "Nivel 5", price: 73.74, up: true),
            SignalMilestone(title: "Nivel 1", price: 52.07, up: false),
        ],
        entryAtPublication: false,
        reviewedAnswer: PTSVoicePolicyDRAM.reviewedAnswer,
        evidenceLabel: "Reportado por el autor · ",
        contractTitle: "Sin contrato de opciones",
        contractDetail: "Daniel la plantea como swing trading con gestión de riesgo. En estos mensajes no publica contrato de opciones, tamaño ni cifras de ganancia.",
        originalImage: "dram",
        levelsNote: "Los cinco niveles se transcribieron de su gráfico. Los mensajes del 18 y 21 sep no indican cuál es la entrada, el stop o los objetivos (la entrada se envió el 17 sep), así que no se les asigna función.",
        chartNote: "El gráfico interactivo muestra el precio histórico diario del ETF hasta el cierre del 21 sep 2026 (61.58). El 18 sep su máximo fue 59.70. La publicación original usa velas de 4 horas."
    )

    // A market read, not a trade: Jasiel projects a correction to the two
    // blue lines of his chart (possible buying zone) and names 97k and 102k
    // as future exit levels. No entry, stop or size was published.
    static let btc = SignalCase(
        marketResource: "btc-market",
        chartCaption: "Cripto · USDT · histórico",
        levels: [
            SignalLevel(price: 76_869.85, role: "Corrección"),
            SignalLevel(price: 80_550.99, role: "Corrección"),
            SignalLevel(price: 97_014.43, role: "Obj. 1"),
            SignalLevel(price: 102_000, role: "Obj. 2"),
        ],
        focusLevel: 80_550.99,
        bands: [(76_869.85, 80_550.99, "rgba(96, 165, 250, 0.08)"), (97_014.43, 102_000, "rgba(74, 222, 128, 0.05)")],
        priceRange: 74_000...104_000,
        hasGuidedNarration: false,
        moments: [],
        sourceNote: "Solo BTC y el análisis de Jasiel · Máximo 3 minutos · No es recomendación",
        voice: .btc,
        suggestions: ["¿Qué crees que pase con Bitcoin?", "¿Por qué ve un posible retroceso?", "¿Qué es la bulltrap que menciona?"],
        levelQuestion: { level in
            "¿Qué papel tiene el nivel \(level.price.priceText)\(level.role.map { " (\($0))" } ?? "") en el análisis de Jasiel para Bitcoin?"
        },
        milestones: [
            SignalMilestone(title: "Corrección", price: 80_550.99, up: false),
            SignalMilestone(title: "Corrección", price: 76_869.85, up: false),
            SignalMilestone(title: "Obj. 1", price: 97_014.43, up: true),
            SignalMilestone(title: "Obj. 2", price: 102_000, up: true),
        ],
        entryAtPublication: false,
        reviewedAnswer: PTSVoicePolicyBTC.reviewedAnswer,
        evidenceLabel: "Análisis publicado por el autor · ",
        contractTitle: "Sin operación publicada",
        contractDetail: "Jasiel no publica entrada, stop ni tamaño, y aclara que no invita a operar en corto: si llega la corrección, la ve como posible oportunidad de compra. Dice que él opera solo futuros y no tiene nada en spot.",
        originalImage: "btc",
        levelsNote: "Corrección hacia 80,550 y 76,900 aprox., según el texto; su gráfico los marca en 80,550.99 y 76,869.85 (este junto al retroceso de Fibonacci 0.382). 97k y 102k son objetivos futuros para salir: 97,014.43 está en su gráfico y 102,000 solo en el texto. No publica entrada ni stop.",
        chartNote: "El gráfico interactivo muestra velas diarias de BTCUSDT en Binance, el mismo par que usa Jasiel; su gráfico original es de 8 horas y marcaba 85,399.02 al hacerlo, el 23 sep 2026. Muestra el precio de Bitcoin, no el resultado de una operación."
    )

    // A macro read, not a trade: if TLT holds 80.40, Jasiel sees rebounds to
    // 84.27-85.34 (Fibonacci 0.618 and 0.786 on his chart, blue labels). His
    // chart labels the support 80.47 in green; the text says 80.40.
    static let tlt = SignalCase(
        marketResource: "tlt-market",
        chartCaption: "ETF · USD · histórico",
        levels: [
            SignalLevel(price: 80.40, role: "Soporte"),
            SignalLevel(price: 84.27, role: "Rebote 1"),
            SignalLevel(price: 85.34, role: "Rebote 2"),
        ],
        focusLevel: 80.40,
        bands: [(84.27, 85.34, "rgba(96, 165, 250, 0.08)")],
        priceRange: 78...88.5,
        hasGuidedNarration: false,
        moments: [],
        sourceNote: "Solo TLT, bonos y el análisis de Jasiel · Máximo 3 minutos · No es recomendación",
        voice: .tlt,
        suggestions: ["¿Qué crees que pase con TLT?", "¿Qué dice Jasiel del bono a 10 años?", "¿Qué pasa si TLT pierde 80.40?"],
        levelQuestion: { level in
            "¿Qué papel tiene el nivel \(level.price.priceText)\(level.role.map { " (\($0))" } ?? "") en el análisis de Jasiel para TLT?"
        },
        milestones: [
            SignalMilestone(title: "Rebote 1", price: 84.27, up: true),
            SignalMilestone(title: "Rebote 2", price: 85.34, up: true),
            SignalMilestone(title: "Soporte", price: 80.40, up: false, adverse: true),
        ],
        entryAtPublication: false,
        reviewedAnswer: PTSVoicePolicyTLT.reviewedAnswer,
        evidenceLabel: "Análisis publicado por el autor · ",
        contractTitle: "Sin operación publicada",
        contractDetail: "Jasiel no publica entrada, stop ni tamaño. Es su lectura de los bonos: si TLT mantiene 80.40 ve posibles rebotes hacia 84.27–85.34, y lo considera un alivio temporal.",
        originalImage: "tlt",
        levelsNote: "Según el texto: si TLT mantiene 80.40, podría rebotar a 84.27–85.34. Su gráfico de 8 horas marca 80.47 abajo y 84.27 y 85.34 como zona de rebote (retrocesos de Fibonacci 0.618 y 0.786). En el rendimiento del bono a 10 años vigila 5.025 %: volver abajo confirmaría un techo, con retroceso posible a 4.697 %. No publica entrada ni stop.",
        chartNote: "El gráfico interactivo muestra velas diarias del ETF TLT; sin conexión, hasta el cierre del 23 sep 2026 (80.46), el mismo precio que marcaba el gráfico de Jasiel, hecho el 24 sep antes de la apertura con velas de 8 horas. Muestra el precio del ETF, no el resultado de una operación."
    )
}

extension SignalCase {
    /// One-line live status for cards: newest milestone reached, a touched
    /// stop, or what the price is waiting for.
    func trackingHeadline(_ statuses: [MilestoneStatus]) -> String? {
        guard !statuses.isEmpty else { return nil }
        let price: (Double) -> String = { $0.priceText }
        if let stop = statuses.first(where: { $0.milestone.title == "Stop" }), let day = stop.reachedOn {
            return "Tocó el stop \(price(stop.milestone.price)) · \(SignalTracking.dayLabel(day))"
        }
        let reachedUp = statuses.filter { $0.milestone.up && $0.reachedOn != nil }
        if let top = reachedUp.max(by: { $0.milestone.price < $1.milestone.price }) {
            if top.milestone.title == "Entrada" && entryAtPublication { return "Entrada activa desde la publicación" }
            let verb = top.milestone.title.hasPrefix("Nivel") ? "Superó el" : "Alcanzó"
            return "\(verb) \(top.milestone.title) \(price(top.milestone.price)) · \(SignalTracking.dayLabel(top.reachedOn!))"
        }
        // A support the author wants held (TLT's 80.40).
        if let support = statuses.first(where: { $0.milestone.adverse && $0.reachedOn != nil }) {
            return "Perforó el soporte \(price(support.milestone.price)) · \(SignalTracking.dayLabel(support.reachedOn!))"
        }
        // Downside references other than a stop (BTC's correction zone).
        if let deepest = statuses.filter({ !$0.milestone.up && $0.reachedOn != nil }).min(by: { $0.milestone.price < $1.milestone.price }) {
            return "Bajó a \(deepest.milestone.title) \(price(deepest.milestone.price)) · \(SignalTracking.dayLabel(deepest.reachedOn!))"
        }
        // Milestones are listed in the order the author expects them.
        if let next = statuses.first(where: { $0.reachedOn == nil && ($0.milestone.up || !$0.milestone.afterEntry) }) {
            return "Esperando \(next.milestone.title) \(price(next.milestone.price))"
        }
        return nil
    }
}
