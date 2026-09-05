// Progress sync — the phone keeps working offline with the same XP rules;
// when an account exists, every award is reported to /api/progress, which
// re-applies the rules server-side and answers with the authoritative state
// (XP, streak, aura, Discovery Route). Mirrors src/lib/companions/sync.ts.
import Foundation

struct PendingAward: Codable, Equatable {
    let id: String
    let kind: String      // read_complete | no_trade_respected | thesis_closed
    let at: String        // ISO-8601
    let tzOffsetMin: Int
    var thesisReadId: String? = nil

    var requestBody: [String: Any] {
        var body: [String: Any] = ["id": id, "kind": kind, "at": at, "tzOffsetMin": tzOffsetMin]
        if let thesisReadId { body["thesisReadId"] = thesisReadId }
        return body
    }
}

struct ServerProgress {
    let xp: Int, streak: Int, aura: Int, routeIndex: Int
    let lastDay: String?, dailyAwards: Int, dailyAwardsDay: String?
    let companionId: String?
}

@MainActor
final class ProgressSync {
    static let shared = ProgressSync()
    enum Status { case idle, syncing, synced, unauthenticated, error }
    private(set) var status: Status = .idle
    private var inflight = false

    /// One round trip: POST when awards are pending (or never synced), GET otherwise.
    func sync(store: CompanionStore, profile: AgentProfile, platform: String = "ios") async {
        guard !inflight else { return }
        guard let token = await AccountSession.shared.accessToken() else { status = .unauthenticated; return }
        inflight = true; status = .syncing
        defer { inflight = false }
        if let uid = AccountSession.shared.session?.userId { store.bind(to: uid) }
        // The server accepts 50 events per request: drain the queue in batches, never drop.
        var rounds = 0
        repeat {
            rounds += 1
            let pending = Array(store.pendingAwards.prefix(50))
            let mustPost = !pending.isEmpty || store.syncedAt == nil
            let ok = await round(store: store, profile: profile, platform: platform, token: token, pending: pending, mustPost: mustPost)
            if !ok { return }
        } while !store.pendingAwards.isEmpty && rounds < 20
        status = .synced
    }

    private func round(store: CompanionStore, profile: AgentProfile, platform: String, token: String, pending: [PendingAward], mustPost: Bool) async -> Bool {
        do {
            var req = URLRequest(url: BobbyAPI.base.appendingPathComponent("api/progress"))
            req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
            req.timeoutInterval = 30
            if mustPost {
                req.httpMethod = "POST"
                req.setValue("application/json", forHTTPHeaderField: "Content-Type")
                var profileBody: [String: Any] = ["companionId": store.companionId as Any, "onboarded": profile.onboarded, "riskNoticeVersion": profile.riskNoticeVersion]
                if store.syncedAt == nil, store.disciplineXP > 0 { profileBody["localXpClaim"] = store.disciplineXP }
                let events = pending.map(\.requestBody)
                req.httpBody = try JSONSerialization.data(withJSONObject: ["platform": platform, "events": events, "profile": profileBody])
            }
            let (data, response) = try await URLSession.shared.data(for: req)
            let code = (response as? HTTPURLResponse)?.statusCode ?? 0
            if code == 401 { AccountSession.shared.signOut(); status = .unauthenticated; return false }
            guard (200..<300).contains(code), let json = try JSONSerialization.jsonObject(with: data) as? [String: Any],
                  let p = json["progress"] as? [String: Any] else { status = .error; return false }
            let acked = ((json["results"] as? [[String: Any]]) ?? []).compactMap { $0["id"] as? String }
            let server = ServerProgress(xp: p["xp"] as? Int ?? 0, streak: p["streak"] as? Int ?? 0, aura: p["aura"] as? Int ?? 0, routeIndex: p["routeIndex"] as? Int ?? 0,
                                        lastDay: p["lastDay"] as? String, dailyAwards: p["dailyAwards"] as? Int ?? 0, dailyAwardsDay: p["dailyAwardsDay"] as? String, companionId: p["companionId"] as? String)
            store.applyServer(server, acknowledged: acked)
            return true
        } catch {
            status = .error
            return false
        }
    }
}
