// Progress sync — the phone keeps working offline with the same XP rules;
// when an account exists, every award is reported to /api/progress, which
// re-applies the rules server-side and answers with the authoritative state
// (XP, streak, aura, the piece each award planted). Mirrors src/lib/companions/sync.ts.
import Foundation
import Combine

struct PendingAward: Codable, Equatable {
    let id: String
    let kind: String      // read_complete | no_trade_respected | thesis_closed
    let at: String        // ISO-8601
    let tzOffsetMin: Int
    /// The read this award came from; its seed is reviewed against it when its horizon ends.
    /// Queues persisted before build 31 have none and still decode.
    var thesis: AwardThesis? = nil
}

/// The read a Trader Land seed is reviewed against. Mirrors ThesisSchema
/// (api/_lib/thesis-rules.ts) and the web desk's ThesisSnapshot.
struct AwardThesis: Codable, Equatable {
    let symbol: String
    let isEquity: Bool
    let direction: String   // long | short | none
    let price: Double?
    let entry: Double?
    let stop: Double?
    let target: Double?

    /// nil when the symbol fails the server's pattern (it would drop the thesis anyway).
    /// Levels keep only positive finite values, like the web's `level(v)`.
    static func make(symbol: String, isEquity: Bool, direction: String?, price: Double?, entry: Double?, stop: Double?, target: Double?) -> AwardThesis? {
        let sym = symbol.trimmingCharacters(in: .whitespacesAndNewlines).uppercased()
        guard sym.range(of: #"^[A-Z0-9][A-Z0-9.-]{0,19}$"#, options: .regularExpression) != nil else { return nil }
        func level(_ v: Double?) -> Double? { v.flatMap { $0.isFinite && $0 > 0 ? $0 : nil } }
        let dir = direction?.lowercased() ?? ""
        return AwardThesis(symbol: sym, isEquity: isEquity, direction: dir == "long" || dir == "short" ? dir : "none",
                           price: level(price), entry: level(entry), stop: level(stop), target: level(target))
    }

    /// `events[i].thesis` for /api/progress; a missing level travels as null.
    var body: [String: Any] {
        func json(_ v: Double?) -> Any { v.map { $0 as Any } ?? NSNull() }
        return ["symbol": symbol, "isEquity": isEquity, "direction": direction,
                "price": json(price), "entry": json(entry), "stop": json(stop), "target": json(target)]
    }
}

/// The Trader Land piece an awarded event planted (RouteGrant in api/_lib/trader-land.ts).
struct RouteGrant: Equatable {
    struct Piece: Equatable {
        let id: String
        let world: String?
        let kind: String?
        let nameEN: String?
        let footprint: [Int]
        /// The database keeps English on both sides; Spanish comes from the bundled names.
        var displayName: String {
            L.isSpanish ? TraderLandCatalog.name(id, district: world) : (nameEN ?? TraderLandCatalog.name(id, district: world))
        }

        /// Reads a PieceSummary `{ id, world, attribution, kind, name: { en, es }, footprint: [w, h] }`,
        /// or an island catalog row, which spells its footprint `footprint_w` / `footprint_h`.
        static func parse(_ raw: Any?) -> Piece? {
            guard let i = raw as? [String: Any], let pid = i["id"] as? String else { return nil }
            let row = (i["footprint_w"] as? Int).flatMap { w in (i["footprint_h"] as? Int).map { [w, $0] } }
            return Piece(id: pid, world: i["world"] as? String, kind: i["kind"] as? String,
                         nameEN: (i["name"] as? [String: Any])?["en"] as? String,
                         footprint: i["footprint"] as? [Int] ?? row ?? [1, 1])
        }
    }

    /// A seed's horizon as the server applied it (docs/trader-land/GROWTH-v1.md §3):
    /// when its review opens and how far it may still grow. Servers before Growth v1 send none.
    struct Horizon: Equatable {
        let hours: LandHorizon
        /// seeded_at + horizon: the review opens then.
        let reviewAt: Date?
        /// False once the review opened: the horizon is set.
        let extendable: Bool
        /// The upward horizons the server accepts (⊆ 72, 168).
        let extendTo: [LandHorizon]

        /// What the builder can pick at `now`: upward only, only while extendable, and never once
        /// the review opened (§1: extend only while now < seeded_at + horizon). `extendable` is
        /// the server's word when it answered; a card left open past `reviewAt` must not trust it.
        func options(at now: Date = Date()) -> [LandHorizon] {
            guard extendable, reviewAt.map({ $0 > now }) ?? true else { return [] }
            return extendTo.filter { $0.hours > hours.hours }
        }

        /// The same horizon with its choice closed: the review opened, or the server refused.
        var closed: Horizon { Horizon(hours: hours, reviewAt: reviewAt, extendable: false, extendTo: []) }

        /// `{ hours: 24 | 72 | 168, tier, reviewAt, extendable, extendTo }`; nil when the hours are unknown.
        static func parse(_ raw: Any?) -> Horizon? {
            guard let h = raw as? [String: Any],
                  let hours = (h["hours"] as? Int).flatMap(LandHorizon.init(rawValue:)) ?? (h["tier"] as? String).flatMap(LandHorizon.init(tier:))
            else { return nil }
            return Horizon(hours: hours, reviewAt: RouteGrant.date(h["reviewAt"] as? String),
                           extendable: h["extendable"] as? Bool ?? false,
                           extendTo: (h["extendTo"] as? [Int] ?? []).compactMap(LandHorizon.init(rawValue:)))
        }
    }

    let routeIndex: Int
    /// nil once the route is complete.
    let item: Piece?
    let inventoryId: String?
    /// seed (a read, reviewable when its horizon ends) | bloomed (NO TRADE respected, buildable now) | nil
    let state: String?
    let routeComplete: Bool
    /// A seed's horizon (a read plants at 24 h). nil for a bloomed piece or an older server.
    var horizon: Horizon? = nil
    /// What a 24 h / 3 days / 7 days horizon would bloom into: the desk's horizon preview.
    var tiers: [LandHorizon: Piece] = [:]

    /// `tiers: { common, building, landmark: PieceSummary }` keyed by horizon; unknown tiers are skipped.
    static func parseTiers(_ raw: Any?) -> [LandHorizon: Piece] {
        guard let t = raw as? [String: Any] else { return [:] }
        var out: [LandHorizon: Piece] = [:]
        for (tier, summary) in t {
            guard let horizon = LandHorizon(tier: tier), let piece = Piece.parse(summary) else { continue }
            out[horizon] = piece
        }
        return out
    }

    /// The server's ISO timestamps, with or without milliseconds.
    static func date(_ iso: String?) -> Date? {
        guard let iso else { return nil }
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let date = formatter.date(from: iso) { return date }
        formatter.formatOptions = [.withInternetDateTime]
        return formatter.date(from: iso)
    }
}

/// What /api/progress did with one queued award.
struct AwardOutcome: Equatable {
    enum Grant: Equatable {
        /// No `world` key: nothing planted (daily cap, or an event already counted).
        case notPlanted
        /// `world: null`: the grant failed server-side; the island catches up later.
        case failed
        case planted(RouteGrant)
    }
    let id: String
    let awarded: Int
    let duplicate: Bool
    let grant: Grant

    /// Parses `results[]` of a POST /api/progress response.
    static func parse(results: [[String: Any]]) -> [AwardOutcome] {
        results.compactMap { r in
            guard let id = r["id"] as? String else { return nil }
            let grant: Grant
            if let raw = r["world"] {
                // null (or anything unreadable) = the grant failed on the server.
                if let w = raw as? [String: Any] {
                    // Growth v1 adds `horizon` (a seed's) and `tiers` (the horizon preview); both optional.
                    grant = .planted(RouteGrant(routeIndex: w["routeIndex"] as? Int ?? 0, item: RouteGrant.Piece.parse(w["item"]),
                                                inventoryId: w["inventoryId"] as? String, state: w["state"] as? String,
                                                routeComplete: w["routeComplete"] as? Bool ?? false,
                                                horizon: RouteGrant.Horizon.parse(w["horizon"]), tiers: RouteGrant.parseTiers(w["tiers"])))
                } else {
                    grant = .failed
                }
            } else {
                grant = .notPlanted
            }
            return AwardOutcome(id: id, awarded: r["awarded"] as? Int ?? 0, duplicate: r["duplicate"] as? Bool ?? false, grant: grant)
        }
    }
}

struct ServerProgress {
    let xp: Int, streak: Int, aura: Int, routeIndex: Int
    let lastDay: String?, dailyAwards: Int, dailyAwardsDay: String?
    let companionId: String?
}

@MainActor
final class ProgressSync: ObservableObject {
    static let shared = ProgressSync()
    enum Status { case idle, syncing, synced, unauthenticated, error }
    @Published private(set) var status: Status = .idle
    /// The server's answer per queued award id (this launch): what it awarded and planted.
    @Published private(set) var outcomes: [String: AwardOutcome] = [:]
    /// Bumps after every round that acknowledged awards: the island may hold a new piece.
    @Published private(set) var acknowledgedRounds = 0
    private var inflight = false

    /// One round trip: POST when awards are pending (or never synced), GET otherwise.
    func sync(store: CompanionStore, profile: AgentProfile, platform: String = "ios") async {
        guard !inflight else { return }
        inflight = true; status = .syncing
        defer { inflight = false }
        let generation = AccountSession.shared.generation
        guard let token = await AccountSession.shared.accessToken() else {
            status = AccountSession.shared.isSignedIn ? .error : .unauthenticated
            return
        }
        guard AccountSession.shared.generation == generation else { return }
        guard let uid = AccountSession.shared.session?.userId else { status = .unauthenticated; return }
        store.bind(to: uid)
        // The server accepts 50 events per request: drain the queue in batches, never drop.
        var rounds = 0
        repeat {
            rounds += 1
            let pending = Array(store.pendingAwards.prefix(50))
            let mustPost = !pending.isEmpty || store.syncedAt == nil || store.profileNeedsSync
            let ok = await round(store: store, profile: profile, platform: platform, token: token, pending: pending, mustPost: mustPost, uid: uid, generation: generation)
            if !ok { return }
        } while !store.pendingAwards.isEmpty && rounds < 20
        status = .synced
    }

    /// Syncs, then waits (bounded) for the server's answer about one queued award.
    /// A sync already in flight carries it in its next round. nil = no answer
    /// (offline, signed out, server error): the award stays queued for later.
    func outcome(for eventID: String, store: CompanionStore, profile: AgentProfile, timeout: TimeInterval = 45) async -> AwardOutcome? {
        await sync(store: store, profile: profile)
        let deadline = Date().addingTimeInterval(timeout)
        while outcomes[eventID] == nil, inflight, Date() < deadline {
            try? await Task.sleep(for: .milliseconds(250))
        }
        return outcomes[eventID]
    }

    private func round(store: CompanionStore, profile: AgentProfile, platform: String, token: String, pending: [PendingAward], mustPost: Bool, uid: String, generation: UUID) async -> Bool {
        do {
            var req = URLRequest(url: BobbyAPI.base.appendingPathComponent("api/progress"))
            req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
            req.timeoutInterval = 30
            if mustPost {
                req.httpMethod = "POST"
                req.setValue("application/json", forHTTPHeaderField: "Content-Type")
                var profileBody: [String: Any] = ["companionId": store.companionId.map { $0 as Any } ?? NSNull(), "onboarded": profile.onboarded, "riskNoticeVersion": profile.riskNoticeVersion,
                                                  "restore": store.syncedAt == nil, "localXpIncludesPending": false]
                if store.syncedAt == nil, store.legacyXP > 0 { profileBody["localXpClaim"] = store.legacyXP }
                let events = pending.map { award -> [String: Any] in
                    var event: [String: Any] = ["id": award.id, "kind": award.kind, "at": award.at, "tzOffsetMin": award.tzOffsetMin]
                    if let thesis = award.thesis { event["thesis"] = thesis.body }
                    return event
                }
                req.httpBody = try JSONSerialization.data(withJSONObject: ["platform": platform, "events": events, "profile": profileBody])
            }
            let (data, response) = try await URLSession.shared.data(for: req)
            guard AccountSession.shared.generation == generation,
                  AccountSession.shared.session?.userId == uid, store.ownerUserId == uid else { return false }
            let code = (response as? HTTPURLResponse)?.statusCode ?? 0
            if code == 401 { AccountSession.shared.signOut(store: store); status = .unauthenticated; return false }
            guard (200..<300).contains(code), let json = try JSONSerialization.jsonObject(with: data) as? [String: Any],
                  let p = json["progress"] as? [String: Any] else { status = .error; return false }
            let results = (json["results"] as? [[String: Any]]) ?? []
            let acked = results.compactMap { $0["id"] as? String }
            let server = ServerProgress(xp: p["xp"] as? Int ?? 0, streak: p["streak"] as? Int ?? 0, aura: p["aura"] as? Int ?? 0, routeIndex: p["routeIndex"] as? Int ?? 0,
                                        lastDay: p["lastDay"] as? String, dailyAwards: p["dailyAwards"] as? Int ?? 0, dailyAwardsDay: p["dailyAwardsDay"] as? String, companionId: p["companionId"] as? String)
            // Signed out or deleted while this request was in flight: the
            // account's numbers must not land back on the device.
            guard AccountSession.shared.session?.userId == uid, store.ownerUserId == uid else { return false }
            store.applyServer(server, acknowledged: acked)
            let answered = AwardOutcome.parse(results: results)
            for outcome in answered { outcomes[outcome.id] = outcome }
            if !acked.isEmpty { acknowledgedRounds += 1 }
            return true
        } catch {
            status = .error
            return false
        }
    }
}
