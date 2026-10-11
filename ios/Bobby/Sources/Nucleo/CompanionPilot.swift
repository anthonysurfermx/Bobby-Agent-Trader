import Foundation

/// Launch-scoped capability probe. A failed search is never treated as an educational question.
@MainActor
final class CompanionPilot {
    struct Capability: Equatable {
        var enabled = false
        var known = false
        var context = false
        var catalog = 0
        var notices: [String] = []
        static func parse(status: Int, json: Any?) -> Self {
            let c = (json as? [String: Any])?["companion"] as? [String: Any]
            return Self(enabled: status == 405, known: status == 405 || status == 404, context: status == 405 && c?["context"] as? Bool == true,
                        catalog: c?["catalog"] as? Int ?? 0, notices: c?["notices"] as? [String] ?? [])
        }
    }
    var capability = Capability()
    private var probeTask: Task<Capability, Never>?
    private var lastProbe: Date?
    private var probeEpoch = 0
    var responseHeaders: [String: String] = [:]
    func invalidateProbe() { probeEpoch += 1; probeTask?.cancel(); probeTask = nil; lastProbe = nil; capability = Capability() }
    var context: () -> [String: Any]? = { nil }
    var revision: () -> UUID = { UUID(uuidString: "00000000-0000-0000-0000-000000000000")! }
    var transport: (String, String, [String: Any]?) async throws -> (Any?, Int) = { path, method, body in
        let response = try await BobbyAPI.responseWithHeaders(path, method: method, body: body,
            extraHeaders: BobbyAccessAPI.headers(bearer: nil), timeout: 45)
        return (response.json, response.status)
    }

    func probe() async -> Capability {
        let epoch = probeEpoch
        if let probeTask {
            let result = await probeTask.value
            guard epoch == probeEpoch else { return Capability() }
            capability = result
            return result
        }
        if let lastProbe, Date().timeIntervalSince(lastProbe) < 5 {
            try? await Task.sleep(nanoseconds: UInt64(max(0, 5 - Date().timeIntervalSince(lastProbe)) * 1_000_000_000))
            guard !Task.isCancelled else { return Capability() }
            return await probe()
        }
        lastProbe = Date()
        let send = transport
        let task = Task { () -> Capability in
            guard let response = try? await send("api/companion-turn", "GET", nil) else { return Capability() }
            return Capability.parse(status: response.1, json: response.0)
        }
        probeTask = task
        let result = await task.value
        guard epoch == probeEpoch else { return Capability() }
        capability = result
        if !result.known { probeTask = nil }
        return result
    }

    static func shouldRoute(question: String, needsConfirmation: Bool, matchKind: String?) -> Bool {
        needsConfirmation && matchKind == "fuzzy" && question.split(whereSeparator: { $0.isWhitespace }).count >= 4
    }

    /// nil means the launch probe says off. Other failures retain a companion retry, never a market read.
    func turn(question: String, requestId: String, candidate: NucleoAsset?, speech: String?, exact: Bool = false, previous: [String: String]? = nil, language: String? = nil, locale: String? = nil) async -> [String: Any]? {
        guard await probe().enabled else {
            return ["v": 1, "status": "companion_error", "requestId": requestId, "code": "explain_off", "retryable": !capability.known]
        }
        var body: [String: Any] = ["version": 1, "requestId": requestId, "question": question,
                                  "language": language ?? L.language, "locale": locale ?? (L.language == "pt" ? "pt-BR" : L.locale.identifier)]
        if let previous { body["previous"] = previous }
        if let speech { body["speech"] = speech }
        if let candidate { body["candidate"] = ["symbol": candidate.symbol, "name": candidate.name, "exact": exact] }
        if let context = context() { body["context"] = context }
        let epoch = revision()
        let response = try? await transport("api/companion-turn", "POST", body)
#if DEBUG
        recordLiveQA(response, contextSent: body["context"] != nil, requestKind: "question")
#endif
        guard !Task.isCancelled, revision() == epoch else { return NucleoDesk.cancelledResult }
        guard let response, let json = response.0 as? [String: Any], json["version"] as? Int == 1,
              let kind = json["kind"] as? String else { return Self.failure() }
        if kind == "explanation", (200..<300).contains(response.1),
           let reply = json["reply"] as? [String: Any], let text = reply["text"] as? String, !text.isEmpty {
            var result: [String: Any] = ["v": 1, "status": "companion", "requestId": requestId, "text": text,
                "followUp": NucleoDeskIO.nextQuestion(reply["followUp"]) as Any? ?? NSNull(),
                "personalized": json["personalized"] as? Bool ?? false]
            if let gist = reply["gist"] as? String, !gist.isEmpty { result["gist"] = gist }
            if let allowance = json["allowance"] { result["allowance"] = allowance }
            if let check = json["checkIn"] as? [String: Any], let id = check["questionId"] as? String { result["checkIn"] = id }
            if let fact = json["fact"] as? [String: Any] { result["fact"] = fact }
            return result
        }
        if kind == "desk_offer", let candidate,
           let action = json["nextAction"] as? [String: Any], action["symbol"] as? String == candidate.symbol,
           action["requiresConfirmation"] as? Bool == true { return ["v": 1, "status": "companion_offer"] }
        let error = json["error"] as? [String: Any]
        if kind == "error", ["orientation_limit", "companion_paused"].contains(error?["code"] as? String ?? "") {
            if candidate != nil { return ["v": 1, "status": "companion_offer"] }
            return ["v": 1, "status": "companion_error", "message": error?["message"] as? String ?? Self.unavailable,
                    "retryable": false, "code": error?["code"] as? String == "companion_paused" ? "paused" : "limit",
                    "limitLine": ConversationCopy.limit(headers: responseHeaders), "requestId": requestId]
        }
        return Self.failure(message: error?["message"] as? String, retryable: error?["retryable"] as? Bool ?? true)
    }
    /// Free text is read once by the server; only a validated enum patch is persisted by the caller.
    func answer(questionId: String, text: String) async -> [String: Any] {
        guard await probe().context, !text.isEmpty, text.utf16.count <= 400, let context = context() else {
            return Self.answerFailure()
        }
        let body: [String: Any] = ["version": 1, "requestId": UUID().uuidString,
            "answer": ["questionId": questionId, "text": text], "context": context,
            "language": L.language, "locale": L.language == "pt" ? "pt-BR" : L.locale.identifier]
        let epoch = revision()
        let response = try? await transport("api/companion-turn", "POST", body)
#if DEBUG
        recordLiveQA(response, contextSent: true, requestKind: "answer")
#endif
        guard !Task.isCancelled, revision() == epoch else { return NucleoDesk.cancelledResult }
        guard let response, let json = response.0 as? [String: Any], json["version"] as? Int == 1 else { return Self.answerFailure() }
        if (200..<300).contains(response.1), json["kind"] as? String == "noted", let patch = json["patch"] as? [String: Any] {
            var result: [String: Any] = ["status": "noted", "patch": patch]
            if let check = json["checkIn"] as? [String: Any], let id = check["questionId"] as? String { result["checkIn"] = id }
            return result
        }
        let error = json["error"] as? [String: Any]
        return Self.answerFailure(message: error?["message"] as? String)
    }
    static func answerFailure(message: String? = nil) -> [String: Any] {
        ["message": message ?? CompanionCopy.text("answerFailed")]
    }
#if DEBUG
    private func recordLiveQA(_ response: (Any?, Int)?, contextSent: Bool, requestKind: String) {
        if ProcessInfo.processInfo.arguments.contains("-qa-companion-live"), let response,
           let directory = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first,
           let record = try? JSONSerialization.data(withJSONObject: ["language": L.language,
               "requestKind": requestKind, "status": response.1, "contextSent": contextSent,
               "response": response.0 ?? [:]], options: [.sortedKeys]) {
            let file = directory.appendingPathComponent("companion-live-replies.jsonl")
            if !FileManager.default.fileExists(atPath: file.path) { _ = FileManager.default.createFile(atPath: file.path, contents: nil) }
            if let handle = try? FileHandle(forWritingTo: file) {
                try? handle.seekToEnd(); try? handle.write(contentsOf: record + Data([10])); try? handle.close()
            }
        }
    }
#endif
    static var unavailable: String { CompanionCopy.text("unavailable") }
    static func failure(message: String? = nil, retryable: Bool = true) -> [String: Any] {
        ["v": 1, "status": "companion_error", "code": "unavailable", "message": message ?? unavailable, "retryable": retryable]
    }
}
