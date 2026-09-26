// The local thesis ledger (Nucleo/ARCHITECTURE.md R12). Every saved read lands here,
// even at the daily XP cap and signed out, because the award queue is not a record:
// a capped award queues nothing and synced awards leave the queue. It feeds the
// Theses face, the ghost satellite and `theses()`. 20 newest per owner.
import Foundation

/// One saved thesis, exactly the `Thesis` object of the bridge (§2.7).
struct NucleoThesis: Codable, Equatable {
    let id: String
    let symbol: String
    let name: String
    let isEquity: Bool
    let verdict: String
    let direction: String
    let price: Double?
    let support: Double?
    let resistance: Double?
    let entry: Double?
    let stop: Double?
    let target: Double?
    let asOf: String
    let provider: String
    let savedAt: String
    var horizonHours: Int?
    let points: Int
    /// True once its award event is no longer pending on the server.
    var synced: Bool
    /// The queued award this thesis rode on (nil at the daily cap). Native only; never sent to the page.
    var eventID: String?

    var json: [String: Any] {
        func n(_ v: Double?) -> Any { v.map { $0 as Any } ?? NSNull() }
        return ["id": id, "symbol": symbol, "name": name, "isEquity": isEquity, "verdict": verdict, "direction": direction,
                "price": n(price), "support": n(support), "resistance": n(resistance),
                "entry": n(entry), "stop": n(stop), "target": n(target),
                "asOf": asOf, "provider": provider, "savedAt": savedAt,
                "horizonHours": horizonHours.map { $0 as Any } ?? NSNull(), "points": points, "synced": synced]
    }
}

final class NucleoLedger {
    static let limit = 20
    private let defaults: UserDefaults

    init(defaults: UserDefaults = .standard) { self.defaults = defaults }

    /// `nucleo.theses.<owner>`; signed out is `local`.
    static func key(owner: String?) -> String { "nucleo.theses." + (owner ?? "local") }

    func items(owner: String?) -> [NucleoThesis] {
        guard let data = defaults.data(forKey: Self.key(owner: owner)),
              let list = try? JSONDecoder().decode([NucleoThesis].self, from: data) else { return [] }
        return list
    }

    /// Newest first; a thesis already in the ledger (same read) is replaced, never duplicated.
    func append(_ thesis: NucleoThesis, owner: String?) {
        var list = items(owner: owner).filter { $0.id != thesis.id }
        list.insert(thesis, at: 0)
        if list.count > Self.limit { list.removeLast(list.count - Self.limit) }
        write(list, owner: owner)
    }

    func update(id: String, owner: String?, _ change: (inout NucleoThesis) -> Void) {
        var list = items(owner: owner)
        guard let i = list.firstIndex(where: { $0.id == id }) else { return }
        change(&list[i])
        write(list, owner: owner)
    }

    private func write(_ list: [NucleoThesis], owner: String?) {
        if let data = try? JSONEncoder().encode(list) { defaults.set(data, forKey: Self.key(owner: owner)) }
    }
}
