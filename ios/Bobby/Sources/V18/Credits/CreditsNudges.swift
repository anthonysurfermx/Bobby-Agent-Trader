// Credits on the glass (1.8). Two things are worth one line on the main screen:
//   · a free account that is about to run out of this week's Quick reads, and
//   · gifted reads the person has not been shown on this phone.
// Both read only what `BobbyAccessCenter` and `NucleoLevelCenter` already hold. Nothing here
// touches the network, and the tap opens the Credits screen.
import Combine
import Foundation

/// What this phone has already said about the gifted balance, so a gift is announced when it
/// arrives and not again every time one of its reads is spent. It holds a few counts and the
/// account they belong to; it is erased when that account signs out or is deleted.
struct CreditsGiftLedger: Codable, Equatable {
    static let storeKey = "credits.giftLedger.v1"

    var owner: String?
    /// The gifted total last seen for `owner`.
    var last = 0
    /// The total when a gift arrived that the person has not been shown yet: it names the nudge.
    var announce: Int?
    /// How many gifted reads arrived since the person last saw the balance: what the line says.
    var arrived: Int?
    /// The size of the latest drop in the total. A rise of exactly that size is a read the server
    /// handed back (a refused read), not a gift.
    var spent = 0

    /// The server's gifted total for `owner`, as the centres just published it.
    mutating func observe(total: Int, owner: String) {
        let total = max(0, total)
        guard self.owner == owner else {
            // First word about this account on this phone: whatever it holds is news here.
            self = CreditsGiftLedger(owner: owner, last: total, announce: total > 0 ? total : nil, arrived: total > 0 ? total : nil)
            return
        }
        if total > last {
            let rise = total - last
            if rise != spent {
                arrived = (arrived ?? 0) + rise
                announce = total
            }
            spent = 0
        } else if total < last {
            spent = last - total
        }
        if total == 0 { announce = nil; arrived = nil }
        last = total
    }

    /// The person saw the balance (the Credits screen showed it, or they tapped the nudge).
    mutating func acknowledge() { announce = nil; arrived = nil }

    static func load(_ defaults: UserDefaults = .standard) -> CreditsGiftLedger {
        guard let data = defaults.data(forKey: storeKey),
              let ledger = try? JSONDecoder().decode(CreditsGiftLedger.self, from: data) else { return CreditsGiftLedger() }
        return ledger
    }

    func save(_ defaults: UserDefaults = .standard) {
        guard owner != nil else { defaults.removeObject(forKey: Self.storeKey); return }
        if let data = try? JSONEncoder().encode(self) { defaults.set(data, forKey: Self.storeKey) }
    }
}

extension CreditsGiftLedger {
    /// A ledger written before `arrived` and `spent` existed still reads: its unshown total is what arrived.
    init(from decoder: Decoder) throws {
        let box = try decoder.container(keyedBy: CodingKeys.self)
        owner = try box.decodeIfPresent(String.self, forKey: .owner)
        last = try box.decodeIfPresent(Int.self, forKey: .last) ?? 0
        announce = try box.decodeIfPresent(Int.self, forKey: .announce)
        arrived = try box.decodeIfPresent(Int.self, forKey: .arrived) ?? announce
        spent = try box.decodeIfPresent(Int.self, forKey: .spent) ?? 0
    }
}

/// Keeps the gift ledger: what the level centre publishes is written under the account it belongs
/// to, and never under the next one. After the account changes, the level centre still holds the
/// previous account's numbers until its next read, so nothing is recorded from it until it has
/// let go of them.
@MainActor
final class CreditsGiftBook {
    private(set) var ledger = CreditsGiftLedger()
    private let defaults: UserDefaults
    /// The level centre's numbers may still be the previous account's.
    private(set) var levelsStale = false
    private var recordScheduled = false
    private var cancellables = Set<AnyCancellable>()

    init(defaults: UserDefaults = .standard) { self.defaults = defaults }

    /// What an earlier launch left on this phone.
    func load() { ledger = CreditsGiftLedger.load(defaults) }

    /// The Credits screen showed the gifted balance, or the nudge was tapped.
    func acknowledge() {
        guard ledger.announce != nil || ledger.arrived != nil else { return }
        ledger.acknowledge()
        ledger.save(defaults)
    }

    /// The level centre as it stands now, for the account that is signed in now.
    func record(levels: NucleoLevelCenter, owner: String?) {
        guard levels.loaded else { levelsStale = false; return }
        guard !levelsStale, let access = levels.quickAccess, let owner else { return }
        let before = ledger
        ledger.observe(total: CreditsNudges.giftTotal(access: access, meters: levels.meters), owner: owner)
        if ledger != before { ledger.save(defaults) }
    }

    /// The session changed (sign out, deletion, another account, or the same one signing back in).
    func accountChanged(levels: NucleoLevelCenter, owner: String?) {
        levelsStale = levels.loaded
        guard ledger.owner != owner else { return }
        // Signed out, deleted, or another account: nothing about the previous one stays on the phone.
        ledger = CreditsGiftLedger()
        ledger.save(defaults)
    }

    /// Follow a level centre: record once it has settled after each change.
    func follow(_ levels: NucleoLevelCenter, owner: @escaping @MainActor () -> String?) {
        // The centre clears itself and applies the next account's reply in one turn (a coupon
        // reply does): hear the clearing as it happens, or the fence would never lift.
        levels.$loaded
            .sink { [weak self] loaded in MainActor.assumeIsolated { if !loaded { self?.levelsStale = false } } }
            .store(in: &cancellables)
        // The centre publishes its fields one by one while it applies a reply: look once it has
        // settled, on the next turn of the main actor, never at a half-applied balance.
        levels.objectWillChange
            .sink { [weak self, weak levels] _ in
                MainActor.assumeIsolated {
                    guard let self, !self.recordScheduled else { return }
                    self.recordScheduled = true
                    Task { @MainActor [weak self, weak levels] in
                        guard let self, let levels else { return }
                        self.recordScheduled = false
                        self.record(levels: levels, owner: owner())
                    }
                }
            }
            .store(in: &cancellables)
    }
}

@MainActor
enum CreditsNudges {
    static let key = "credits"
    /// At this many Quick reads or fewer, the week is about to run out.
    static let lowThreshold = 2

    /// The app's own ledger keeper. It reads the phone's store only once the shared centre starts it.
    static let book = CreditsGiftBook()

    /// `access`, `owner` and `book` are the app's own unless a suite hands its own in.
    static func register(_ center: NudgeCenter,
                         access: @escaping @MainActor () -> BobbyReadAccess? = {
                             // The freshest word on Quick reads is the one every metered reply carries.
                             BobbyAccessCenter.shared.access ?? NucleoLevelCenter.shared.quickAccess
                         },
                         owner: @escaping @MainActor () -> String? = { AccountSession.shared.session?.userId },
                         book: CreditsGiftBook? = nil) {
        let book = book ?? Self.book
        center.register(NudgeSource(key: key, priority: NudgePriority.credits,
            candidate: { [weak center] moment in
                let options = [low(moment: moment, access: access()), gift(moment: moment, ledger: book.ledger, owner: owner())].compactMap { $0 }
                // A line that is resting must not keep the other one from speaking.
                return options.first { center?.eligible($0.id, at: moment.now) ?? true } ?? options.first
            },
            act: { nudge, session in
                if nudge.id.hasPrefix(giftPrefix) { book.acknowledge() }
                session.present(.credits)
            }))
        // The shared centre is the app's; a test's own centre never starts the bookkeeping.
        if center === NudgeCenter.shared { observe() }
    }

    // MARK: - Candidates (pure)

    static let lowPrefix = "credits.low."
    static let giftPrefix = "credits.gift."

    /// A signed-in free account with the weekly cap on and two or fewer Quick reads left, and no
    /// gifted Quick reads to fall back on (with those, the next read is not refused).
    static func low(moment: NudgeMoment, access: BobbyReadAccess?, spanish: Bool? = nil) -> NucleoNudge? {
        guard moment.signedIn, let access, access.tier == "free", access.paywall, let limit = access.limit, limit > 0, access.bonus == 0 else { return nil }
        // The server's window rolls: once its reset moment has passed, at least one read is back
        // and these numbers are old. Say nothing until the server speaks again.
        if let resets = access.resetsDate, resets <= moment.now { return nil }
        let left = access.remaining ?? max(0, limit - access.used)
        guard left <= lowThreshold else { return nil }
        let text: String
        switch left {
        case 0: text = L.t("No reads left this week", "Sin lecturas esta semana", spanish: spanish)
        case 1: text = L.t("1 read left this week", "Te queda 1 lectura esta semana", spanish: spanish)
        default: text = L.t("\(left) reads left this week", "Te quedan \(left) lecturas esta semana", spanish: spanish)
        }
        // One nudge per calendar week. The server's `resetsAt` is the oldest read plus seven days,
        // so it moves every time a read leaves the window and cannot name a week.
        return NucleoNudge(id: lowPrefix + week(moment.now), text: text, cta: seeCredits(spanish: spanish))
    }

    /// Gifted reads that arrived and were not shown yet. The line says how many arrived; the id
    /// carries the total at arrival, so spending one of them does not make it a new nudge.
    static func gift(moment: NudgeMoment, ledger: CreditsGiftLedger, owner: String?, spanish: Bool? = nil) -> NucleoNudge? {
        guard moment.signedIn, let owner, ledger.owner == owner, let announced = ledger.announce, announced > 0,
              let reads = ledger.arrived, reads > 0, ledger.last > 0 else { return nil }
        let text = reads == 1 ? L.t("Bobby gave you 1 read", "Bobby te regaló 1 lectura", spanish: spanish)
                              : L.t("Bobby gave you \(reads) reads", "Bobby te regaló \(reads) lecturas", spanish: spanish)
        return NucleoNudge(id: giftPrefix + "\(announced)", text: text, cta: seeCredits(spanish: spanish))
    }

    static func seeCredits(spanish: Bool? = nil) -> String { L.t("See credits", "Ver créditos", spanish: spanish) }

    /// The ISO week in UTC, lowercase (`2026-w41`): the same instant names the same nudge on every phone.
    static func week(_ date: Date) -> String {
        var calendar = Calendar(identifier: .iso8601)
        calendar.timeZone = TimeZone(identifier: "UTC") ?? .gmt
        let parts = calendar.dateComponents([.yearForWeekOfYear, .weekOfYear], from: date)
        return String(format: "%04d-w%02d", parts.yearForWeekOfYear ?? 0, parts.weekOfYear ?? 0)
    }

    // MARK: - Gift bookkeeping (stored state only)

    private static var sessionObserver: NSObjectProtocol?

    /// The Credits screen showed the gifted balance.
    static func acknowledgeGifts() { book.acknowledge() }

    private static func observe() {
        guard sessionObserver == nil else { return }
        book.load()
        book.follow(NucleoLevelCenter.shared, owner: { AccountSession.shared.session?.userId })
        // Posted on the main actor right after the session is assigned: the fence goes up in the
        // same turn, before a record that was already waiting can run under the new account.
        sessionObserver = NotificationCenter.default.addObserver(forName: AccountSession.didChange, object: nil, queue: .main) { _ in
            MainActor.assumeIsolated {
                book.accountChanged(levels: NucleoLevelCenter.shared, owner: AccountSession.shared.session?.userId)
            }
        }
    }

    static func giftTotal(access: BobbyReadAccess?, meters: [NucleoAnalysisLevel: NucleoLevelMeter]) -> Int {
        (access?.bonus ?? 0) + (meters[.profundo]?.bonus ?? 0) + (meters[.maximo]?.bonus ?? 0)
    }
}
