// Credits on the glass (1.8). Two things are worth one line on the main screen:
//   · a free account that is about to run out of this week's Quick reads, and
//   · gifted reads the person has not been shown on this phone.
// Both read only what `BobbyAccessCenter` and `NucleoLevelCenter` already hold. Nothing here
// touches the network, and the tap opens the Credits screen.
import Combine
import Foundation

/// What this phone has already said about the gifted balance, so a gift is announced when it
/// arrives and not again every time one of its reads is spent. It holds two counts and the
/// account they belong to; it is erased when that account signs out or is deleted.
struct CreditsGiftLedger: Codable, Equatable {
    static let storeKey = "credits.giftLedger.v1"

    var owner: String?
    /// The gifted total last seen for `owner`.
    var last = 0
    /// The total when a gift arrived that the person has not been shown yet.
    var announce: Int?

    /// The server's gifted total for `owner`, as the centres just published it.
    mutating func observe(total: Int, owner: String) {
        let total = max(0, total)
        guard self.owner == owner else {
            // First word about this account on this phone: whatever it holds is news here.
            self = CreditsGiftLedger(owner: owner, last: total, announce: total > 0 ? total : nil)
            return
        }
        if total > last { announce = total }
        if total == 0 { announce = nil }
        last = total
    }

    /// The person saw the balance (the Credits screen showed it, or they tapped the nudge).
    mutating func acknowledge() { announce = nil }

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

@MainActor
enum CreditsNudges {
    static let key = "credits"
    /// At this many Quick reads or fewer, the week is about to run out.
    static let lowThreshold = 2

    static func register(_ center: NudgeCenter) {
        center.register(NudgeSource(key: key, priority: NudgePriority.credits,
            candidate: { [weak center] moment in
                // The freshest word on Quick reads is the one every metered reply carries.
                let access = BobbyAccessCenter.shared.access ?? NucleoLevelCenter.shared.quickAccess
                let owner = AccountSession.shared.session?.userId
                let options = [low(moment: moment, access: access), gift(moment: moment, ledger: ledger, owner: owner)].compactMap { $0 }
                // A line that is resting must not keep the other one from speaking.
                return options.first { center?.eligible($0.id, at: moment.now) ?? true } ?? options.first
            },
            act: { nudge, session in
                if nudge.id.hasPrefix(giftPrefix) { acknowledgeGifts() }
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
        let left = access.remaining ?? max(0, limit - access.used)
        guard left <= lowThreshold else { return nil }
        let text: String
        switch left {
        case 0: text = L.t("No reads left this week", "Sin lecturas esta semana", spanish: spanish)
        case 1: text = L.t("1 read left this week", "Te queda 1 lectura esta semana", spanish: spanish)
        default: text = L.t("\(left) reads left this week", "Te quedan \(left) lecturas esta semana", spanish: spanish)
        }
        // One nudge per weekly window: it can come back when the next window runs low.
        let window = access.resetsDate.flatMap { $0 > moment.now ? $0 : nil } ?? moment.now
        return NucleoNudge(id: lowPrefix + stamp(window), text: text, cta: seeCredits(spanish: spanish))
    }

    /// Gifted reads that arrived and were not shown yet. The id carries the total at arrival, so
    /// spending one of them does not make it a new nudge.
    static func gift(moment: NudgeMoment, ledger: CreditsGiftLedger, owner: String?, spanish: Bool? = nil) -> NucleoNudge? {
        guard moment.signedIn, let owner, ledger.owner == owner, let announced = ledger.announce, announced > 0, ledger.last > 0 else { return nil }
        let reads = ledger.last
        let text = reads == 1 ? L.t("Bobby gave you 1 read", "Bobby te regaló 1 lectura", spanish: spanish)
                              : L.t("Bobby gave you \(reads) reads", "Bobby te regaló \(reads) lecturas", spanish: spanish)
        return NucleoNudge(id: giftPrefix + "\(announced)", text: text, cta: seeCredits(spanish: spanish))
    }

    static func seeCredits(spanish: Bool? = nil) -> String { L.t("See credits", "Ver créditos", spanish: spanish) }

    /// `yyyymmdd` in UTC: the same instant names the same nudge on every phone.
    static func stamp(_ date: Date) -> String {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "UTC") ?? .gmt
        let parts = calendar.dateComponents([.year, .month, .day], from: date)
        return String(format: "%04d%02d%02d", parts.year ?? 0, parts.month ?? 0, parts.day ?? 0)
    }

    // MARK: - Gift bookkeeping (stored state only)

    private(set) static var ledger = CreditsGiftLedger()
    private static var cancellables = Set<AnyCancellable>()
    private static var sessionObserver: NSObjectProtocol?
    private static var recordScheduled = false
    /// After the account changes, the level centre still holds the previous account's numbers
    /// until its next read: nothing is recorded from it until it has let go of them.
    private static var levelsStale = false

    /// The Credits screen showed the gifted balance, or the nudge was tapped.
    static func acknowledgeGifts() {
        guard ledger.announce != nil else { return }
        ledger.acknowledge()
        ledger.save()
    }

    private static func observe() {
        guard cancellables.isEmpty else { return }
        ledger = CreditsGiftLedger.load()
        // The centre publishes its fields one by one while it applies a reply: look once it has
        // settled, on the next turn of the main actor, never at a half-applied balance.
        NucleoLevelCenter.shared.objectWillChange
            .sink { _ in Task { @MainActor in scheduleRecord() } }
            .store(in: &cancellables)
        sessionObserver = NotificationCenter.default.addObserver(forName: AccountSession.didChange, object: nil, queue: .main) { _ in
            Task { @MainActor in accountChanged() }
        }
    }

    private static func scheduleRecord() {
        guard !recordScheduled else { return }
        recordScheduled = true
        Task { @MainActor in
            recordScheduled = false
            record(levels: NucleoLevelCenter.shared, owner: AccountSession.shared.session?.userId)
        }
    }

    private static func record(levels: NucleoLevelCenter, owner: String?) {
        guard levels.loaded else { levelsStale = false; return }
        guard !levelsStale, let access = levels.quickAccess, let owner else { return }
        let before = ledger
        ledger.observe(total: giftTotal(access: access, meters: levels.meters), owner: owner)
        if ledger != before { ledger.save() }
    }

    private static func accountChanged() {
        levelsStale = NucleoLevelCenter.shared.loaded
        guard ledger.owner != AccountSession.shared.session?.userId else { return }
        // Signed out, deleted, or another account: nothing about the previous one stays on the phone.
        ledger = CreditsGiftLedger()
        ledger.save()
    }

    static func giftTotal(access: BobbyReadAccess?, meters: [NucleoAnalysisLevel: NucleoLevelMeter]) -> Int {
        (access?.bonus ?? 0) + (meters[.profundo]?.bonus ?? 0) + (meters[.maximo]?.bonus ?? 0)
    }
}
