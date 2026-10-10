import Foundation

/// Launch-scoped capability probe. A failed search is never treated as an educational question.
@MainActor
final class CompanionPilot {
    struct Capability: Equatable {
        var enabled = false
        var context = false
        var catalog = 0
        var notices: [String] = []
        static func parse(status: Int, json: Any?) -> Self {
            let c = (json as? [String: Any])?["companion"] as? [String: Any]
            return Self(enabled: status == 405, context: status == 405 && c?["context"] as? Bool == true,
                        catalog: c?["catalog"] as? Int ?? 0, notices: c?["notices"] as? [String] ?? [])
        }
    }
    var capability = Capability()
    private var probeTask: Task<Capability, Never>?
    var context: () -> [String: Any]? = { nil }
    var revision: () -> UUID = { UUID(uuidString: "00000000-0000-0000-0000-000000000000")! }
    var transport: (String, String, [String: Any]?) async throws -> (Any?, Int) = { path, method, body in
        let response = try await BobbyAPI.responseWithHeaders(path, method: method, body: body,
            extraHeaders: BobbyAccessAPI.headers(bearer: nil), timeout: 45)
        return (response.json, response.status)
    }

    func probe() async -> Capability {
        if let probeTask {
            let result = await probeTask.value
            capability = result
            return result
        }
        let send = transport
        let task = Task { () -> Capability in
            guard let response = try? await send("api/companion-turn", "GET", nil) else { return Capability() }
            return Capability.parse(status: response.1, json: response.0)
        }
        probeTask = task
        let result = await task.value
        capability = result
        return result
    }

    static func shouldRoute(question: String, needsConfirmation: Bool, matchKind: String?) -> Bool {
        needsConfirmation && matchKind == "fuzzy" && question.split(whereSeparator: { $0.isWhitespace }).count >= 4
    }

    /// nil means the launch probe says off. Other failures retain a companion retry, never a market read.
    func turn(question: String, requestId: String, candidate: NucleoAsset?, speech: String?) async -> [String: Any]? {
        guard await probe().enabled else { return nil }
        var body: [String: Any] = ["version": 1, "requestId": requestId, "question": question,
                                  "language": L.language, "locale": L.language == "pt" ? "pt-BR" : L.locale.identifier]
        if let speech { body["speech"] = speech }
        if let candidate { body["candidate"] = ["symbol": candidate.symbol, "name": candidate.name] }
        if let context = context() { body["context"] = context }
        let epoch = revision()
        let response = try? await transport("api/companion-turn", "POST", body)
        guard !Task.isCancelled, revision() == epoch else { return NucleoDesk.cancelledResult }
        guard let response, let json = response.0 as? [String: Any], json["version"] as? Int == 1,
              let kind = json["kind"] as? String else { return Self.failure() }
        if kind == "explanation", (200..<300).contains(response.1),
           let reply = json["reply"] as? [String: Any], let text = reply["text"] as? String, !text.isEmpty {
            var result: [String: Any] = ["v": 1, "status": "companion", "requestId": requestId, "text": text,
                "followUp": NucleoDeskIO.nextQuestion(reply["followUp"]) as Any? ?? NSNull(),
                "personalized": json["personalized"] as? Bool ?? false]
            if let check = json["checkIn"] as? [String: Any], let id = check["questionId"] as? String { result["checkIn"] = id }
            if let fact = reply["fact"] as? [String: Any] ?? json["fact"] as? [String: Any] { result["fact"] = fact }
            return result
        }
        if kind == "desk_offer", let candidate,
           let action = json["nextAction"] as? [String: Any], action["symbol"] as? String == candidate.symbol,
           action["requiresConfirmation"] as? Bool == true { return ["v": 1, "status": "companion_offer"] }
        let error = json["error"] as? [String: Any]
        if kind == "error", error?["code"] as? String == "orientation_limit" {
            if candidate != nil { return ["v": 1, "status": "companion_offer"] }
            return ["v": 1, "status": "companion_error", "message": error?["message"] as? String ?? Self.unavailable,
                    "retryable": false]
        }
        return Self.failure(message: error?["message"] as? String, retryable: error?["retryable"] as? Bool ?? true)
    }
    static var unavailable: String { CompanionCopy.text("unavailable") }
    static func failure(message: String? = nil, retryable: Bool = true) -> [String: Any] {
        ["v": 1, "status": "companion_error", "message": message ?? unavailable, "retryable": retryable]
    }
}
