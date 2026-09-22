import Foundation

// Reviewed text fallback for microphone/network failures. Free-form
// conversation goes through the scoped Realtime client, never general chat.
@MainActor final class SignalTutor: ObservableObject {
    @Published var answer = ""
    @Published var loading = false
    @Published var error: String?
    @Published var answerIsReviewed = true

    func ask(_ question: String, about signalCase: SignalCase = .coin) async {
        guard !question.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return }
        error = nil
        let q = question.folding(options: [.diacriticInsensitive, .caseInsensitive], locale: Locale(identifier: "es_MX"))
        // Without a model to judge, generic phrasing is answered only when it
        // is a recognizable follow-up about price movement or the result.
        let followUp = ["que crees", "que puede pasar", "que podria pasar", "que pasaria", "y si", "por que", "explica", "mas facil", "mas sencillo", "que cambio", "que falta", "como lo ves", "sube", "baja", "subir", "bajar", "precio", "ganancia", "gano", "riesgo", "accion", "conviene", "comprar", "vender"]
        let voice = signalCase.voice
        switch voice.route(question) {
        case .redirect: answer = voice.redirect; return
        case .judge where !followUp.contains(where: q.contains): answer = voice.redirect; return
        default: break
        }
        if let reviewed = signalCase.reviewedAnswer { answer = reviewed(q); return }
        if ["ganancia", "gano", "p&l", "contrato", "que falta", "reconstru", "prima", "strike", "vencimiento"].contains(where: q.contains) {
            answer = "Daniel reporta que COIN superó el segundo objetivo, pero eso no permite calcular la ganancia de la opción. Faltan tipo de opción, strike, vencimiento, primas, cantidad y ejecución. El precio histórico de la acción no equivale al rendimiento del contrato."
        } else if ["nivel", "entrada", "stop"].contains(where: q.contains) {
            answer = "El gráfico de Daniel publica 160.07, 171.75, 180.95, 186.22, 190.59 y 204.53 dólares. No está documentado cuál corresponde a entrada, stop, objetivo o extremo del rango. Por eso se muestran como referencias, sin asignarles un papel que la fuente no confirma."
        } else if ["dijo", "dice", "reporte", "publicacion", "que cambio", "05:27", "15:29"].contains(where: q.contains) {
            answer = "Daniel describe una operación rápida, distinta de un swing, y reporta que superó el segundo objetivo. En 15:29 plantea vigilar una ruptura del rango lateral para una posible continuación. Es una condición por observar, no una confirmación de que ya ocurrió. Puedes revisar los dos fragmentos originales."
        } else {
            answer = "En el caso histórico de COIN, Daniel condiciona la continuación a una ruptura del rango. Mi lectura educativa: salir y sostenerse fuera apoyaría la continuación; salir y volver dentro sería una ruptura fallida; seguir dentro no confirma continuación. No conocemos los extremos exactos de ese rango ni tenemos precio en vivo en esta sesión."
        }
    }
}
