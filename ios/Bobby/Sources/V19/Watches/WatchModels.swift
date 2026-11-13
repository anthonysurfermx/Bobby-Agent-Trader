// Watches (1.9.x): "tell me if this moves that much". The phone's vocabulary and the client of
// /api/agent-watch. A watch lives on the server, tied to the account: the phone holds no copy
// beyond what the last answer listed, and decides nothing about whether one is met.
// Invariants:
//  - Every sentence about a watch (its one-line label, what Bobby wrote the day it was met, the
//    line of one that expired) is the server's, already in the watch's language. The phone adds
//    no number and no market word of its own.
//  - What can be chosen (assets, sizes, lengths) is what the server lists; nothing is hard-coded
//    here but the three directions, which are also the server's contract.
//  - A reply that is not the expected shape is `.unavailable`: never a half-shown list.
import Foundation

enum WatchDirection: String, CaseIterable, Equatable, Sendable {
    case falls, rises, moves
}

enum WatchState: String, Equatable, Sendable {
    case active, met, expired, cancelled
}

/// One watch as the server tells it.
struct BobbyWatch: Equatable, Identifiable, Sendable {
    let id: String
    let symbol: String
    let name: String
    let direction: WatchDirection
    let percent: Int
    let state: WatchState
    /// "NVIDIA · closes 5% lower · until November 14", written by the server.
    let label: String
    /// Met: the first sentence and the whole text Bobby wrote that day.
    let gist: String?
    let text: String?
    /// Expired: the one sentence that says it did not happen, or could not be followed.
    let notice: String?
    let seen: Bool

    /// What the row says under the label once the watch has ended.
    var ending: String? { state == .met ? gist : notice }

    init?(json: Any?) {
        guard let row = json as? [String: Any],
              let id = row["id"] as? String, id.hasPrefix("watch_"),
              let symbol = row["symbol"] as? String, !symbol.isEmpty,
              let direction = (row["direction"] as? String).flatMap(WatchDirection.init(rawValue:)),
              let percent = (row["percent"] as? NSNumber)?.intValue,
              let state = (row["state"] as? String).flatMap(WatchState.init(rawValue:)),
              let label = row["label"] as? String, !label.isEmpty else { return nil }
        let result = row["result"] as? [String: Any]
        self.id = id
        self.symbol = symbol
        self.name = (row["name"] as? String).flatMap { $0.isEmpty ? nil : $0 } ?? symbol
        self.direction = direction
        self.percent = percent
        self.state = state
        self.label = label
        self.gist = (result?["gist"] as? String).flatMap { $0.isEmpty ? nil : $0 }
        self.text = (result?["text"] as? String).flatMap { $0.isEmpty ? nil : $0 }
        self.notice = (row["notice"] as? String).flatMap { $0.isEmpty ? nil : $0 }
        self.seen = row["seen"] as? Bool ?? false
    }
}

/// Everything the watches screen shows: the list, how many may look at once, and what can be chosen.
struct WatchBoard: Equatable, Sendable {
    var watches: [BobbyWatch]
    var limit: Int
    var symbols: [String]
    var percents: [Int]
    var days: [Int]

    var active: [BobbyWatch] { watches.filter { $0.state == .active } }
    /// Met or expired, newest first as the server sent them.
    var ended: [BobbyWatch] { watches.filter { $0.state == .met || $0.state == .expired } }
    var hasRoom: Bool { active.count < limit }
    /// Met and not opened yet: what the dot beside the avatar counts.
    var unseen: Int { watches.filter { $0.state == .met && !$0.seen }.count }
    func canWatch(_ symbol: String) -> Bool { symbols.contains(symbol.uppercased()) }

    init?(json: Any?) {
        guard let body = json as? [String: Any], let rows = body["watches"] as? [Any],
              let limit = (body["limit"] as? NSNumber)?.intValue, limit > 0,
              let options = body["options"] as? [String: Any] else { return nil }
        let watches = rows.compactMap(BobbyWatch.init(json:))
        // One row the phone cannot read means the list is not what the server said: show none of it.
        guard watches.count == rows.count else { return nil }
        self.watches = watches
        self.limit = limit
        self.symbols = (options["symbols"] as? [String]) ?? []
        self.percents = ((options["percents"] as? [NSNumber]) ?? []).map(\.intValue)
        self.days = ((options["days"] as? [NSNumber]) ?? []).map(\.intValue)
    }
}

enum WatchError: Error, Equatable {
    /// The door is not there for this person (the feature is off, or they are not in the pilot).
    case notOffered
    case signInRequired
    /// As many active watches as the account may have.
    case limit
    /// The asset could not be read right now: nothing was started.
    case unreadable
    case rateLimited
    case unavailable
}

struct WatchAPI {
    static let path = "api/agent-watch"
    static let timeout: TimeInterval = 20

    var transport: BriefingsTransport = .live
    var auth: BobbyMeterAuth = .account

    func board() async throws -> WatchBoard { try await call(method: "GET", body: nil) }

    /// `requestId` is the caller's and is reused by a retry of the same choice: the same watch comes back.
    func create(symbol: String, direction: WatchDirection, percent: Int, days: Int, requestId: UUID) async throws -> WatchBoard {
        try await call(method: "POST", body: ["op": "create", "requestId": requestId.uuidString.lowercased(), "symbol": symbol.uppercased(),
                                              "direction": direction.rawValue, "percent": percent, "days": days,
                                              "language": L.language, "locale": L.localeIdentifier])
    }

    func cancel(_ id: String) async throws -> WatchBoard { try await call(method: "POST", body: ["op": "cancel", "watchId": id]) }
    func seen(_ id: String) async throws -> WatchBoard { try await call(method: "POST", body: ["op": "seen", "watchId": id]) }

    private func call(method: String, body: [String: Any]?) async throws -> WatchBoard {
        let reply: BriefingsReply
        do { reply = try await transport.json(Self.path, method, body, [:], auth) } catch { throw WatchError.unavailable }
        if (200..<300).contains(reply.status), let board = WatchBoard(json: reply.json) { return board }
        throw Self.error(status: reply.status, json: reply.json)
    }

    /// By status and machine code only: the server's text is never surfaced.
    static func error(status: Int, json: Any?) -> WatchError {
        let code = ((json as? [String: Any])?["error"] as? [String: Any])?["code"] as? String
        switch (status, code) {
        case (404, "not_found"): return .unavailable
        case (404, _): return .notOffered
        case (401, _): return .signInRequired
        case (409, "watch_limit"): return .limit
        case (503, "watch_unreadable"): return .unreadable
        case (429, _): return .rateLimited
        default: return .unavailable
        }
    }
}
