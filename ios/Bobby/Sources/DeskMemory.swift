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
    private let defaults = UserDefaults.standard
    private enum Key {
        static let streak = "desk.streak"
        static let lastActive = "desk.lastActiveAt"
        static let watchlist = "desk.watchlist"
    }

    // MARK: streak

    /// Call once per app session. Consecutive calendar days grow the streak;
    /// a skipped day resets it. Returns the current streak.
    @discardableResult
    func recordVisit(now: Date = Date()) -> Int {
        let calendar = Calendar.current
        var streak = defaults.integer(forKey: Key.streak)
        if let last = defaults.object(forKey: Key.lastActive) as? Date {
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
        defaults.set(streak, forKey: Key.streak)
        defaults.set(now, forKey: Key.lastActive)
        return streak
    }

    var streak: Int { defaults.integer(forKey: Key.streak) }

    // MARK: implicit watchlist

    private(set) lazy var watchlist: [WatchedAsset] = {
        guard let data = defaults.data(forKey: Key.watchlist),
              let list = try? JSONDecoder().decode([WatchedAsset].self, from: data) else { return [] }
        return list
    }()

    func recordQuery(symbol: String, isEquity: Bool, now: Date = Date()) {
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
            defaults.set(data, forKey: Key.watchlist)
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

    /// Most recent asset asked on a PREVIOUS day — the hook for the
    /// "yesterday you asked about…" recap bubble.
    func recapAsset(now: Date = Date()) -> WatchedAsset? {
        let calendar = Calendar.current
        return watchlist.first { !calendar.isDate($0.lastAskedAt, inSameDayAs: now) }
    }
}
