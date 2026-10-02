// Memory v1 — the two retention primitives from the app plan: an implicit
// watchlist (everything the user asks about, on-device) and a daily streak.
// Plain persistence service; the view model mirrors its state into @Published.
import Foundation

struct WatchedAsset: Codable, Equatable {
    let symbol: String
    let isEquity: Bool
    var lastAskedAt: Date
    var count: Int
}

final class DeskMemory {
    private let defaults: UserDefaults
    static let ownerKey = "desk.memory.owner.v2"
    private static let migratedKey = "desk.memory.scoped.v2"
    private enum Key {
        static let streak = "desk.streak"
        static let lastActive = "desk.lastActiveAt"
        static let watchlist = "desk.watchlist"
    }

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
        Self.migrateLegacy(defaults: defaults)
    }

    private static func scoped(_ key: String, owner: String?) -> String {
        key + ".v2." + (owner ?? "local")
    }

    private func key(_ value: String) -> String {
        Self.scoped(value, owner: defaults.string(forKey: Self.ownerKey))
    }

    /// Attribute old device-wide history to its recorded progress owner, never a newly signed-in account.
    private static func migrateLegacy(defaults: UserDefaults) {
        guard !defaults.bool(forKey: migratedKey) else { return }
        let owner = defaults.string(forKey: "companion.ownerUserId")
        for key in [Key.streak, Key.lastActive, Key.watchlist] {
            // A legacy sign-out removed its owner but kept these global keys. Unattributed
            // history cannot safely be assigned to the next visitor, including a guest.
            if let owner, let value = defaults.object(forKey: key) { defaults.set(value, forKey: scoped(key, owner: owner)) }
            defaults.removeObject(forKey: key)
        }
        defaults.set(true, forKey: migratedKey)
    }

    static func setOwner(_ userId: String?, defaults: UserDefaults = .standard) {
        migrateLegacy(defaults: defaults)
        defaults.set(userId, forKey: ownerKey)
    }

    static func forgetOwner(_ userId: String, defaults: UserDefaults = .standard) {
        for key in [Key.streak, Key.lastActive, Key.watchlist] {
            defaults.removeObject(forKey: scoped(key, owner: userId))
        }
        if defaults.string(forKey: ownerKey) == userId { defaults.removeObject(forKey: ownerKey) }
    }

    // MARK: streak

    /// Call once per app session. Consecutive calendar days grow the streak;
    /// a skipped day resets it. Returns the current streak.
    @discardableResult
    func recordVisit(now: Date = Date()) -> Int {
        let calendar = Calendar.current
        var streak = defaults.integer(forKey: key(Key.streak))
        if let last = defaults.object(forKey: key(Key.lastActive)) as? Date {
            if calendar.isDate(last, inSameDayAs: now) {
                // same day — streak unchanged
            } else if let yesterday = calendar.date(byAdding: .day, value: -1, to: now),
                      calendar.isDate(last, inSameDayAs: yesterday) {
                streak += 1
            } else {
                streak = 1
            }
        } else {
            streak = 1
        }
        defaults.set(streak, forKey: key(Key.streak))
        defaults.set(now, forKey: key(Key.lastActive))
        return streak
    }

    var streak: Int { defaults.integer(forKey: key(Key.streak)) }

    // MARK: implicit watchlist

    /// Automatic suggestions follow the app's speech locale, as on the web. These are listed
    /// market identifiers, never translated labels. They only pad empty slots in personal history.
    static func defaultQuickAccess(for resolution: LanguageResolution) -> [String] {
        switch resolution.language {
        case .fr: return ["MC.PA", "TTE.PA", "BTC"]
        case .pt:
            return resolution.localeIdentifier == "pt-BR"
                ? ["PETR4.SA", "VALE3.SA", "BTC"]
                : ["EDP.LS", "GALP.LS", "BTC"]
        case .it: return ["ENI.MI", "ENEL.MI", "BTC"]
        case .de: return ["SAP.DE", "SIE.DE", "BTC"]
        case .en: return ["BTC", "NVDA", "ETH", "TSLA", "GOLD"]
        case .es: return ["BTC", "NVDA", "ETH", "TSLA", "ORO"]
        }
    }

    var watchlist: [WatchedAsset] {
        guard let data = defaults.data(forKey: key(Key.watchlist)),
              let list = try? JSONDecoder().decode([WatchedAsset].self, from: data) else { return [] }
        return list
    }

    func recordQuery(symbol: String, isEquity: Bool, now: Date = Date()) {
        var watchlist = watchlist
        let ticker = symbol.uppercased()
        if let index = watchlist.firstIndex(where: { $0.symbol == ticker }) {
            watchlist[index].lastAskedAt = now
            watchlist[index].count += 1
        } else {
            watchlist.append(WatchedAsset(symbol: ticker, isEquity: isEquity, lastAskedAt: now, count: 1))
        }
        watchlist.sort { $0.lastAskedAt > $1.lastAskedAt }
        if watchlist.count > 12 { watchlist.removeLast(watchlist.count - 12) }
        if let data = try? JSONEncoder().encode(watchlist) {
            defaults.set(data, forKey: key(Key.watchlist))
        }
    }

    /// The user's real quick-access row: most recent asks first, padded with
    /// the defaults until they have history of their own.
    func quickAccess(fallback: [String], limit: Int = 5) -> [String] {
        var row = watchlist.prefix(limit).map(\.symbol)
        for ticker in fallback where !row.contains(ticker) && row.count < limit {
            row.append(ticker)
        }
        return row
    }
}
