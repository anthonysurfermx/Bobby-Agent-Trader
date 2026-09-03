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
        do {
            let pending = store.pendingAwards
            let mustPost = !pending.isEmpty || store.syncedAt == nil
            var req = URLRequest(url: BobbyAPI.base.appendingPathComponent("api/progress"))
            req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
            req.timeoutInterval = 30
            if mustPost {
                req.httpMethod = "POST"
                req.setValue("application/json", forHTTPHeaderField: "Content-Type")
                var profileBody: [String: Any] = ["companionId": store.companionId as Any, "onboarded": profile.onboarded, "riskNoticeVersion": profile.riskNoticeVersion]
                if store.syncedAt == nil, store.disciplineXP > 0 { profileBody["localXpClaim"] = store.disciplineXP }
                let events = pending.map { ["id": $0.id, "kind": $0.kind, "at": $0.at, "tzOffsetMin": $0.tzOffsetMin] as [String: Any] }
                req.httpBody = try JSONSerialization.data(withJSONObject: ["platform": platform, "events": events, "profile": profileBody])
            }
            let (data, response) = try await URLSession.shared.data(for: req)
            let code = (response as? HTTPURLResponse)?.statusCode ?? 0
            if code == 401 { AccountSession.shared.signOut(); status = .unauthenticated; return }
            guard (200..<300).contains(code), let json = try JSONSerialization.jsonObject(with: data) as? [String: Any],
                  let p = json["progress"] as? [String: Any] else { status = .error; return }
            let acked = ((json["results"] as? [[String: Any]]) ?? []).compactMap { $0["id"] as? String }
            let server = ServerProgress(xp: p["xp"] as? Int ?? 0, streak: p["streak"] as? Int ?? 0, aura: p["aura"] as? Int ?? 0, routeIndex: p["routeIndex"] as? Int ?? 0,
                                        lastDay: p["lastDay"] as? String, dailyAwards: p["dailyAwards"] as? Int ?? 0, dailyAwardsDay: p["dailyAwardsDay"] as? String, companionId: p["companionId"] as? String)
            store.applyServer(server, acknowledged: acked)
            status = .synced
        } catch {
            status = .error
        }
    }
}
