// The harness (1.8): the phone's side. It writes what the person does into the ledger, asks
// HarnessPlanner what comes next, and hands that to iOS as local notifications. No server, no push
// token, no account needed: a person who asked one question signed out is followed up exactly
// like anyone else, and nothing about them leaves the phone.
// Invariants:
//  - iOS permission is asked ONLY inside `accept`, which only the person's own "Yes, tell me" (the
//    offer on the glass) or the Follow-ups switch calls. Never at launch, never from housekeeping.
//  - Nothing is recorded or scheduled before the risk notice is accepted; withdrawing it erases
//    the ledger and cancels everything. Turning follow-ups off does the same.
//  - What the phone writes depends on what the person said about follow-ups, and on nothing else:
//      undecided  one entry per read they asked for (typed, spoken, or an asset picked on a chip):
//                 the asset, its price, the moment. It is what lets the glass say "NVDA +2.3% since
//                 you asked" when they come back, and what the yes follows. No app openings, no
//                 saves, no taps, no horizon, no thesis, no read started from a follow-up's own button.
//      on         everything the planner reads (HarnessLedger), from that moment.
//      off        nothing, and what was there is erased.
//    `HarnessCenterTests` pins each state.
//  - Bobby never invites someone into a wall. A read Bobby starts (the button of the line on the
//    glass, a board row, the question Bobby wrote after a read) is offered and launched only when
//    the phone knows the next read is answered (`HarnessWall`), and it runs at the Quick level
//    whatever level is saved. The line and the board are still shown: they need no read.
//  - What iOS holds is always the plan of whoever uses the phone now: another account, or none,
//    cancels the previous reader's follow-ups before anything else.
//  - A follow-up names the asset the person asked about and nothing else: no price, no figure, no
//    direction. The number is read when they open it. On a phone that hides previews while locked
//    the asset is not shown either (`HarnessCategory`).
//  - The number costs one request the person did not tap for: when the app comes to the front
//    with an asset asked about a day ago or more (also before the yes), the phone asks the quote
//    endpoint for that symbol (`quote` → NucleoDeskIO.market), and the week's board asks once per
//    row. The request carries the symbol and nothing else: no account, no device, nothing of the
//    ledger. These two are the only places a value read from the ledger leaves the phone without
//    being inside a question the person sends (HarnessSurfaceTests audits the folder).
//  - A follow-up is handed to iOS as an instant, not as an hour on the clock: it arrives at the
//    moment the plan chose, in the time zone the plan was made in. A person who changes time zone
//    and does not open the app gets it at that instant, which can be outside 09:00–21:00 where
//    they are now. On purpose: an hour on the clock would arrive at a moment the phone never
//    learns, and everything that keeps Bobby quiet (what was shown, 18 hours apart, one a day,
//    the two per question) counts from those moments. Opening the app plans again on the new clock.
//  - Stopping is one tap: every follow-up carries a "Stop" action that turns follow-ups off the way
//    the switch does (`stop`), without opening the app.
//  - A follow-up whose moment has passed is written to the ledger as `sent` exactly once; whether
//    the person did something with it within a day (`returned`) is what the next plan learns from.
//    A tap alone (`opened`) is written down and changes nothing.
//  - Only a question the person asked in their own words (typed, spoken) is followed up. A read
//    whose question Bobby wrote (the button of a follow-up, a board row, the question after a
//    read, a chip that asks about an asset) is written with its origin and starts nothing: one
//    tap on something Bobby put there never earns another chain. The one exception is the yes
//    itself: before it there is no chain to protect, so a chip is kept the way a question is, and
//    saying yes to "Shall I keep you posted on NVDA?" follows that read.
//  - A no stays a no. Follow-ups turned off (the switch, or "Stop" on a notification) survive a
//    sign-in, a sign-out and the Memory screen's "Delete everything": what was kept is erased,
//    the refusal is not, and the offer is not made again by itself. An account that said no takes
//    nothing from a signed-out reader either.
//  - What the person said about how long they are looking (the horizon their question named, the
//    one chosen on a save, a thesis) is written only once they said yes to follow-ups. Until then
//    it is held in memory for the last few reads, and the yes writes it for those.
//  - A notification carries a tag of the reader it was planned for and the moment it was planned
//    for. A tap whose tag is not the current reader's does nothing, and what was already delivered
//    is taken off the lock screen when the reader changes.
//  - Every change of the plan ends in `sync`, and syncs run one after another: whatever an older
//    sync was still writing, the last one leaves iOS holding exactly the newest plan.
import Combine
import CryptoKit
import Foundation
import UIKit
import UserNotifications

/// What a tapped (or just delivered) follow-up carries.
struct HarnessTap: Equatable {
    let step: HarnessStep
    let symbol: String?
    let sector: String?
    /// The tag of the reader the notification was planned for (`HarnessCenter.ownerTag`). Nil only
    /// for a tap the app builds itself.
    var owner: String? = nil
    /// The moment the notification was planned for: which follow-up this is.
    var stamp: Date? = nil

    /// Reads `["kind": "follow-up", "step": …]`. Anything else is not a follow-up.
    static func tap(from userInfo: [AnyHashable: Any]) -> HarnessTap? {
        guard userInfo["kind"] as? String == HarnessCenter.kind,
              let step = (userInfo["step"] as? String).flatMap(HarnessStep.init(rawValue:)) else { return nil }
        let symbol = HarnessLedger.validSymbol(userInfo["symbol"] as? String)
        let sector = (userInfo["sector"] as? String).flatMap { id in HarnessSectors.all.contains { $0.id == id } ? id : nil }
        if step != .week, symbol == nil { return nil }
        if step == .sector, sector == nil { return nil }
        // A notification this app planned always says whose it is and when it was for.
        guard let owner = userInfo["owner"] as? String, owner.count <= 32, !owner.isEmpty,
              let at = (userInfo["at"] as? NSNumber)?.doubleValue, at.isFinite, at > 0 else { return nil }
        return HarnessTap(step: step, symbol: symbol, sector: sector, owner: owner, stamp: Date(timeIntervalSince1970: at))
    }
}

/// One local notification as the centre wants it.
struct HarnessNotice: Equatable {
    static let thread = "bobby-follow-ups"

    let id: String
    let title: String
    let body: String
    let fireAt: Date
    let step: HarnessStep
    let symbol: String?
    let sector: String?
    /// Whose follow-up this is (a tag, never the account id).
    let owner: String
    let calendar: Calendar

    /// The category iOS files it under: what a locked phone shows instead of the body, and "Stop".
    var category: String { HarnessCategory.id(for: step) }

    var userInfo: [String: Any] {
        var info: [String: Any] = ["kind": HarnessCenter.kind, "step": step.rawValue, "owner": owner,
                                   "at": fireAt.timeIntervalSince1970.rounded()]
        if let symbol { info["symbol"] = symbol }
        if let sector { info["sector"] = sector }
        return info
    }

    /// One line, the default sound, no badge, once, at that moment wherever the phone is that day:
    /// the components carry the time zone of the plan, so the trigger is an instant (see the header).
    func request() -> UNNotificationRequest {
        let content = UNMutableNotificationContent()
        content.title = title
        content.body = body
        content.sound = .default
        content.threadIdentifier = Self.thread
        content.categoryIdentifier = category
        content.userInfo = userInfo
        var parts = calendar.dateComponents([.year, .month, .day, .hour, .minute, .second], from: fireAt)
        parts.calendar = calendar
        parts.timeZone = calendar.timeZone
        return UNNotificationRequest(identifier: id, content: content,
                                     trigger: UNCalendarNotificationTrigger(dateMatching: parts, repeats: false))
    }
}

/// What iOS is told about a kind of follow-up before any is sent: the sentence a phone that hides
/// previews while locked shows in place of the body (the default on an iPhone with Face ID), so
/// the asset is never on a locked screen there, and the one action every follow-up carries.
struct HarnessCategory: Equatable {
    /// "Stop": follow-ups off, in the background. The app is not opened and the phone need not be unlocked:
    /// saying no is as easy as it gets.
    static let stopAction = "bobby-follow-up.stop"

    let id: String
    let hiddenBody: String
    let stopTitle: String

    static func id(for step: HarnessStep) -> String {
        switch step {
        case .asset, .sector: return "bobby-follow-up.question"
        case .week: return "bobby-follow-up.week"
        }
    }

    /// Both categories, in the app's language now (they are registered again when it changes).
    static var all: [HarnessCategory] {
        [HarnessStep.asset, .week].map { HarnessCategory(id: id(for: $0), hiddenBody: HarnessCopy.hiddenBody($0), stopTitle: HarnessCopy.stopAction) }
    }

    var system: UNNotificationCategory {
        // No `.foreground`: iOS runs the action without bringing the app up.
        let stop = UNNotificationAction(identifier: Self.stopAction, title: stopTitle, options: [])
        return UNNotificationCategory(identifier: id, actions: [stop], intentIdentifiers: [],
                                      hiddenPreviewsBodyPlaceholder: hiddenBody, options: [])
    }
}

/// The phone's notification centre, as little of it as follow-ups need. Tests use a fake.
@MainActor
protocol HarnessNotifying: AnyObject {
    /// Tells iOS the categories follow-ups are filed under. Asks nothing of the person.
    func register(_ categories: [HarnessCategory]) async
    func status() async -> ReminderPermission
    /// Shows the iOS prompt. Only `HarnessCenter.accept` calls it.
    func requestPermission() async -> Bool
    func add(_ notice: HarnessNotice) async -> Bool
    func remove(_ ids: [String])
    /// Takes already delivered notifications off the lock screen and the notification centre.
    func removeDelivered(_ ids: [String])
    func pendingIds() async -> Set<String>
}

@MainActor
final class SystemHarnessNotifier: HarnessNotifying {
    private var center: UNUserNotificationCenter { .current() }

    /// The app's other categories, if it ever has any, are kept.
    func register(_ categories: [HarnessCategory]) async {
        let ours = Set(categories.map(\.id))
        let others = await center.notificationCategories().filter { !ours.contains($0.identifier) }
        center.setNotificationCategories(others.union(categories.map(\.system)))
    }

    func status() async -> ReminderPermission {
        switch await center.notificationSettings().authorizationStatus {
        case .notDetermined: return .notDetermined
        case .denied: return .denied
        default: return .allowed
        }
    }

    func requestPermission() async -> Bool {
        (try? await center.requestAuthorization(options: [.alert, .sound])) ?? false
    }

    func add(_ notice: HarnessNotice) async -> Bool {
        do {
            try await center.add(notice.request())
            return true
        } catch {
            return false
        }
    }

    func remove(_ ids: [String]) {
        center.removePendingNotificationRequests(withIdentifiers: ids)
    }

    func removeDelivered(_ ids: [String]) {
        center.removeDeliveredNotifications(withIdentifiers: ids)
    }

    func pendingIds() async -> Set<String> {
        Set(await center.pendingNotificationRequests().map(\.identifier))
    }
}

/// The unit-test host never touches the phone's notifications (suites build their own fake).
@MainActor
final class SilentHarnessNotifier: HarnessNotifying {
    func register(_ categories: [HarnessCategory]) async {}
    func status() async -> ReminderPermission { .notDetermined }
    func requestPermission() async -> Bool { false }
    func add(_ notice: HarnessNotice) async -> Bool { false }
    func remove(_ ids: [String]) {}
    func removeDelivered(_ ids: [String]) {}
    func pendingIds() async -> Set<String> { [] }
}

/// The line on the glass when the person comes back: the asset they asked about and, when the
/// phone could read both prices, how far it moved since.
struct HarnessMove: Equatable {
    let symbol: String
    let name: String
    let isEquity: Bool
    let askedAt: Date
    let priceThen: Double?
    let priceNow: Double?
    /// Whole days since they asked (at least one).
    let days: Int

    /// Nil when the phone should say no number (HarnessCopy.move): a split, a renamed ticker or
    /// a bad price would otherwise read as a crash.
    var pct: Double? { HarnessCopy.move(from: priceThen, to: priceNow, isEquity: isEquity) }
}

/// Whether the next read would be answered, from the receipt the server sends with every reply
/// (BobbyReadAccess). Bobby offers a read of its own only when this says yes.
enum HarnessWall {
    /// True only when the phone knows the next Quick read is answered. Not knowing is a no: Bobby
    /// does not offer what it might not be able to give.
    ///  - Bobby Pro: always.
    ///  - No limit in the receipt and not Pro: the server could not read the meter. Not known.
    ///  - Reads left this week, or gifted reads: yes.
    ///  - None left: only where nothing stands behind the limit (`paywall` false). For a guest that
    ///    is the sign-in, for a free account the paywall.
    static func open(_ access: BobbyReadAccess?) -> Bool {
        guard let access else { return false }
        if access.isPro { return true }
        guard let limit = access.limit else { return false }
        let left = access.remaining ?? max(0, limit - access.used)
        return left > 0 || access.bonus > 0 || !access.paywall
    }

    /// True only when the phone KNOWS the next read is refused: a receipt that says none is left,
    /// no gifted read, and a sign-in or a paywall behind the limit. Not knowing is not closed: the
    /// home keeps its chips on a first launch, without network, or when the server could not read
    /// the meter (those are `open == false` and `closed == false`).
    static func closed(_ access: BobbyReadAccess?) -> Bool {
        guard let access, !access.isPro, let limit = access.limit else { return false }
        let left = access.remaining ?? max(0, limit - access.used)
        return left <= 0 && access.bonus <= 0 && access.paywall
    }

    /// The receipt to go by, newest source first. One whose reset moment has passed says nothing
    /// about the reads there are now: it is skipped, and with none left the phone asks again.
    static func current(_ receipts: [BobbyReadAccess?], now: Date) -> BobbyReadAccess? {
        receipts.compactMap { $0 }.first { receipt in receipt.resetsDate.map { $0 > now } ?? true }
    }
}

@MainActor
final class HarnessCenter: ObservableObject {
    static let shared = HarnessCenter(notifier: BobbyApp.isUnitTestHost ? SilentHarnessNotifier() : SystemHarnessNotifier())

    nonisolated static let kind = "follow-up"
    /// The reader's ledger was erased from outside (the Memory screen's "Delete everything").
    static let erased = Notification.Name("V18.harnessErased")
    /// An asset is worth coming back to once this long has passed since they asked.
    static let dueAfter: TimeInterval = 20 * 3_600
    /// And for this long.
    static let dueDays = 14.0
    /// Asking about a follow-up's asset, or acting on its line, this soon after it answers it.
    static let usefulWindow: TimeInterval = 24 * 3_600
    /// A tapped follow-up keeps the glass on its asset this long.
    static let focusWindow: TimeInterval = 30 * 60
    static let quoteLifetime: TimeInterval = 10 * 60
    static let quoteTimeout: Double = 8
    /// One `appOpen` per this long.
    static let openGap: TimeInterval = 30 * 60
    /// What is held in memory about recent reads until the person says yes: this many, this long
    /// (the desk keeps its own reads the same way: NucleoDesk.readsKept, pendingReadWindow).
    static let heldEvents = 5
    static let heldWindow: TimeInterval = 30 * 60

    enum Outcome: Equatable {
        /// Follow-ups are on and iOS lets Bobby show them.
        case on
        /// Follow-ups are on inside the app; iOS does not let Bobby show notifications.
        case denied
        /// The risk notice is not accepted: nothing was asked and nothing changed.
        case consentRequired
        /// The account changed while iOS was asking.
        case failed
    }

    @Published private(set) var mode: HarnessMode = .undecided
    @Published private(set) var status: ReminderPermission = .notDetermined
    /// What iOS will show, earliest first.
    @Published private(set) var upcoming: [HarnessFollowUp] = []
    @Published private(set) var move: HarnessMove?
    /// The switch is being saved (iOS may be asking for permission).
    @Published private(set) var saving = false

    var now: () -> Date = { Date() }
    var calendar: () -> Calendar = { .autoupdatingCurrent }
    var consent: () -> ReminderConsent = { .stored(version: UserDefaults.standard.integer(forKey: "agent.riskNoticeVersion")) }
    var currentUser: () -> String? = { AccountSession.shared.session?.userId }
    var currentGeneration: () -> UUID = { AccountSession.shared.generation }
    /// A paying account whose Monday briefing is on gets its week from the server.
    var weeklyCovered: () -> Bool = { BriefingsCenter.shared.settings?.weeklyEnabled == true && BriefingsCenter.shared.eligiblePro == true }
    /// The latest price of an asset, read without spending a read. Nil when it could not be read.
    var quote: (String) async -> Double? = { symbol in
        (await NucleoAsync.withTimeout(HarnessCenter.quoteTimeout) { await NucleoDeskIO.market(symbol).price }) ?? nil
    }
    /// What the phone last heard about this person's reads: the receipt of the latest reply, else
    /// the one read when the app started. Nil when it does not know (and in the unit-test host,
    /// whose suites say what the phone knows).
    var access: () -> BobbyReadAccess? = {
        BobbyApp.isUnitTestHost ? nil : HarnessWall.current([BobbyAccessCenter.shared.access, NucleoLevelCenter.shared.quickAccess], now: Date())
    }
    /// Asks the server for it (quota-free). Only ever called after the risk notice.
    var refreshAccess: () async -> Void = {
        if !BobbyApp.isUnitTestHost { await NucleoLevelCenter.shared.refresh() }
    }
    /// What the glass remembers about the lines it drew for an asset (how often, whether one was
    /// tapped: NudgeCenter keeps it under an id that names the asset and the day) goes when that
    /// asset's notes go. No symbol: every line of the harness.
    var forgetLines: (_ symbol: String?, _ owner: String?) -> Void
    /// How many of those lines the glass still has a history for (said on the Memory screen).
    var linesKept: (_ owner: String?) -> Int
    /// And they are kept no longer than the ledger keeps the question they were about.
    var pruneLines: (_ owner: String?, _ before: Date) -> Void
    /// The glass has something new to draw (the session listens).
    var changed: () -> Void = {}
    /// The reader's active theses: the asset and the horizon they set, never the words.
    var theses: (_ owner: String?) -> [(symbol: String, horizon: HarnessHorizon?, since: Date)]

    private let notifier: HarnessNotifying
    private let store: HarnessStore
    private(set) var owner: String?
    private(set) var ledger = HarnessLedger()
    private var planned: [HarnessPlanned] = []
    /// What this launch handed to iOS (id → what it said and when), so nothing is written twice.
    private var issued: [String: HarnessNotice] = [:]
    private var focus: (symbol: String, at: Date)?
    /// Events written without what the person said about their horizon, kept whole here until they
    /// say yes. In memory only: it never outlives the launch or the reader.
    private var held: [HarnessEvent] = []
    private var quotes: [String: (price: Double, at: Date)] = [:]
    private var syncTail: Task<Void, Never>?
    /// Grows whenever the plan or the reader changes: a sync that started before does not finish its writes.
    private var revision = 0
    private var cancellables = Set<AnyCancellable>()
    private var started = false

    /// Every identifier the harness ever hands to iOS (one per step).
    static let identifiers = HarnessStep.allCases.map { HarnessPlanner.identifierPrefix + $0.rawValue }

    /// What a notification says about whose it is: `local` signed out, else a digest of the account id.
    nonisolated static func ownerTag(_ owner: String?) -> String {
        guard let owner else { return "local" }
        return SHA256.hash(data: Data(owner.utf8)).prefix(8).map { String(format: "%02x", $0) }.joined()
    }

    /// A tap (or a delivery) belongs to whoever uses the phone now.
    func accepts(_ tap: HarnessTap) -> Bool {
        tap.owner == nil || tap.owner == Self.ownerTag(owner)
    }

    init(notifier: HarnessNotifying, defaults: UserDefaults = .standard) {
        self.notifier = notifier
        store = HarnessStore(defaults: defaults)
        forgetLines = { symbol, owner in NudgeCenter.forget(prefix: HarnessNudges.movePrefix(symbol), owner: owner, defaults: defaults) }
        linesKept = { owner in NudgeCenter.count(prefix: HarnessNudges.movePrefix(), owner: owner, defaults: defaults) }
        pruneLines = { owner, before in NudgeCenter.prune(prefix: HarnessNudges.movePrefix(), before: before, owner: owner, defaults: defaults) }
        theses = { owner in
            ThesisBook(defaults: defaults).active(owner: owner).map { ($0.symbol, $0.horizon.map(HarnessHorizon.init(thesis:)), $0.createdAt) }
        }
    }

    // MARK: Reading

    var profile: HarnessProfile { .make(ledger, now: now(), calendar: calendar()) }

    /// Follow-ups are wanted and nothing stands in their way but, possibly, iOS.
    var isOn: Bool { mode == .on }

    /// Bobby may start a read of its own: the phone knows the next one is answered.
    var readsOpen: Bool { HarnessWall.open(access()) }

    /// What the phone keeps for follow-ups, in sentences (the Memory screen).
    var notes: HarnessNotes {
        HarnessNotes.make(ledger: ledger, mode: mode, upcoming: upcoming, now: now(), calendar: calendar(), lines: linesKept(owner))
    }

    // MARK: Start

    /// Called once when the Núcleo starts: loads the reader's ledger and keeps the plan true.
    func start() {
        guard !started else { return }
        started = true
        load(owner: currentUser())
        NotificationCenter.default.publisher(for: AccountSession.didChange)
            .receive(on: DispatchQueue.main)
            .sink { [weak self] _ in Task { @MainActor in await self?.accountChanged() } }
            .store(in: &cancellables)
        // The risk notice was withdrawn (it is stored in the defaults).
        NotificationCenter.default.publisher(for: UserDefaults.didChangeNotification)
            .receive(on: DispatchQueue.main)
            .sink { [weak self] _ in Task { @MainActor in await self?.consentChanged() } }
            .store(in: &cancellables)
        NotificationCenter.default.publisher(for: UIApplication.didBecomeActiveNotification)
            .sink { [weak self] _ in Task { @MainActor in await self?.appActive() } }
            .store(in: &cancellables)
        // Another language: what iOS holds is rewritten in it, the locked-screen sentence and "Stop" included.
        NotificationCenter.default.publisher(for: L.didChange)
            .receive(on: DispatchQueue.main)
            .sink { [weak self] _ in Task { @MainActor in await self?.registerCategories(); await self?.replan() } }
            .store(in: &cancellables)
        NotificationCenter.default.publisher(for: Self.erased)
            .receive(on: DispatchQueue.main)
            .sink { [weak self] _ in Task { @MainActor in await self?.reloadAfterErase() } }
            .store(in: &cancellables)
        // A thesis was written, changed or archived: its horizon times the next follow-up.
        NotificationCenter.default.publisher(for: ThesisBook.didChange)
            .receive(on: DispatchQueue.main)
            .sink { [weak self] _ in Task { @MainActor in await self?.replan() } }
            .store(in: &cancellables)
        Task { await registerCategories(); await appActive() }
    }

    /// iOS learns the two kinds of follow-up (HarnessCategory) in the app's language. It shows
    /// nothing and asks nothing: categories are not a permission.
    func registerCategories() async {
        await notifier.register(HarnessCategory.all)
    }

    /// A withdrawn risk notice erases what the harness kept and cancels what it planned. A notice
    /// that only has a newer version to read erases nothing.
    func consentChanged() async {
        guard consent() == .withdrawn, mode != .undecided || !ledger.isEmpty || !planned.isEmpty else { return }
        await erase(keeping: .undecided)
    }

    /// The store was emptied for this reader: what is in memory and what iOS holds follow it.
    func reloadAfterErase() async {
        load(owner: owner)
        forgetLines(nil, owner)
        purge()
        await replan()
        changed()
    }

    /// Reads one reader's ledger, switch and plan from the phone.
    func load(owner: String?) {
        revision += 1
        self.owner = owner
        ledger = store.ledger(owner: owner)
        mode = store.mode(owner: owner)
        planned = store.plan(owner: owner)
        upcoming = planned.map(\.followUp)
        focus = nil
        held = []
        quotes = [:]
        move = nil
    }

    // MARK: What the person does

    /// A read was delivered. Only one the person asked for in their own words is followed up:
    /// `origin` says when Bobby wrote the question, and then it is at most an answer to a follow-up.
    /// `chip`: Bobby wrote the words and the person picked the asset (the idle home, the row after a
    /// read). With follow-ups on that is a read Bobby started, like any other. Before the yes there
    /// is no chain to protect: it is kept the way a question is, so the glass can say how the asset
    /// moved since, and a yes to "Shall I keep you posted on NVDA?" has that read to follow.
    func noteAsk(symbol: String, name: String, isEquity: Bool, price: Double?, origin: HarnessEvent.Origin? = nil,
                 chip: Bool = false, thread: Bool = false, horizon: HarnessHorizon? = nil) {
        guard keeping else { return }
        let origin = chip && mode != .on ? nil : origin
        let clock = now()
        // The answer comes first in time: what follows starts from the question itself.
        if recording { answerIfUseful(symbol: symbol, at: clock.addingTimeInterval(-0.001)) }
        var said = HarnessEvent(kind: .ask, at: clock, symbol: symbol, name: name, isEquity: isEquity, price: price, origin: origin)
        said.thread = thread && origin == nil ? true : nil
        said.horizon = horizon
        note(said)
        // They are looking at it now: the line about "since you asked" has nothing to say yet.
        if move?.symbol == symbol.uppercased() { move = nil }
        Task { await replan() }
    }

    /// They saved a read. `horizonHours` is the review they chose on the save, when they were offered one.
    func noteSaved(symbol: String, horizonHours: Int? = nil) {
        guard keeping else { return }
        let clock = now()
        note(HarnessEvent(kind: .saved, at: clock, symbol: symbol, horizonHours: horizonHours))
        guard recording else { return }
        answerIfUseful(symbol: symbol, at: clock)
        // The horizon they chose may move the follow-up that was coming.
        Task { await replan() }
    }

    /// They acted on something Bobby put in front of them inside the app. The line they acted on
    /// leaves the glass whatever they said about follow-ups; the act is written only with them on.
    func notePicked(symbol: String) {
        guard keeping else { return }
        let clock = now()
        if focus?.symbol == symbol.uppercased() { focus = nil }
        if move?.symbol == symbol.uppercased() { move = nil }
        guard recording else { return }
        note(HarnessEvent(kind: .picked, at: clock, symbol: symbol))
        if answerIfUseful(symbol: symbol, at: clock) { Task { await replan() } }
    }

    /// The one writer of an answer. A follow-up shown in the last day that nobody answered yet is
    /// answered by something useful about it: its asset (or an asset of its sector; anything, for
    /// the week). Having tapped it does not answer it, and does not stop this from doing so. True when it was.
    @discardableResult
    private func answerIfUseful(symbol: String, at clock: Date) -> Bool {
        guard let symbol = HarnessLedger.validSymbol(symbol),
              let shown = ledger.events(.sent).last(where: { clock.timeIntervalSince($0.at) <= Self.usefulWindow && $0.at <= clock }),
              !ledger.events.contains(where: { $0.isAnswer && $0.ref == shown.at }) else { return false }
        let about: Bool
        switch shown.step {
        case .asset: about = shown.symbol == symbol
        case .sector: about = shown.symbol == symbol || (shown.sector != nil && HarnessSectors.sector(of: symbol)?.id == shown.sector)
        case .week: about = true
        case nil: about = false
        }
        guard about else { return false }
        note(HarnessEvent(kind: .returned, at: clock, symbol: shown.symbol, step: shown.step, sector: shown.sector, ref: shown.at))
        return true
    }

    /// The offer's "Yes, tell me", or the switch turned on. The ONLY place iOS is asked.
    @discardableResult
    func accept() async -> Outcome {
        guard consent() == .accepted else { return .consentRequired }
        guard !saving else { return .failed }
        let user = currentUser(), generation = currentGeneration()
        saving = true
        defer { saving = false }
        // Before the first follow-up exists, iOS knows what to show on a locked screen and how to stop.
        await notifier.register(HarnessCategory.all)
        var permission = await notifier.status()
        if permission == .notDetermined {
            _ = await notifier.requestPermission()
            permission = await notifier.status()
        }
        status = permission
        guard currentUser() == user, currentGeneration() == generation, consent() == .accepted else { return .failed }
        if owner != user { load(owner: user) }
        mode = .on
        store.write(mode, owner: owner)
        // They said yes: what the last reads carried and was only in memory is written now, the read
        // that prompted the yes first. A question gains what it named; a save, never written before
        // the yes, goes in whole.
        let clock = now()
        var completed = false
        for full in held where clock.timeIntervalSince(full.at) <= Self.heldWindow {
            if full.kind == .saved { ledger.note(full); completed = true } else if ledger.complete(full) { completed = true }
        }
        held = []
        if completed { store.write(ledger, owner: owner) }
        await replan()
        return permission == .allowed ? .on : .denied
    }

    /// The switch turned off: nothing is kept and nothing is scheduled.
    func turnOff() async {
        await erase(keeping: .off)
    }

    /// The notification's own "Stop". It does what the switch does (`turnOff`: follow-ups off, what
    /// iOS holds removed, the ledger erased) and the offer is never made again, because only an
    /// undecided reader is offered and a no is kept through a sign-in, a sign-out and "Delete
    /// everything" (`accountChanged`, `HarnessStore.forgetNotes`). iOS may have launched the app for
    /// this alone, with nothing loaded yet. A notification planned for another reader of this phone
    /// stops nothing.
    func stop(_ tap: HarnessTap) async {
        if currentUser() != owner || !started { load(owner: currentUser()) }
        guard accepts(tap) else { return }
        await turnOff()
    }

    /// One asset's notes go (the Memory screen): what was asked, saved and tapped about it, the
    /// line the glass kept for it and the follow-up that was coming about it. The follow-ups
    /// already shown stay counted, without the asset: forgetting an asset never makes Bobby come
    /// back more. A pointer to a thesis is not a note of the harness: it goes with its thesis.
    func forget(symbol raw: String) async {
        guard let symbol = HarnessLedger.validSymbol(raw) else { return }
        let shown = ledger.events.filter { $0.symbol == symbol && [.sent, .opened, .returned].contains($0.kind) }
        ledger.remove { $0.symbol == symbol && $0.kind != .thesis }
        for var event in shown {
            event.symbol = nil
            event.sector = nil
            ledger.note(event)
        }
        store.write(ledger, owner: owner)
        held.removeAll { $0.symbol?.uppercased() == symbol }
        quotes[symbol] = nil
        if focus?.symbol == symbol { focus = nil }
        if move?.symbol == symbol { move = nil }
        forgetLines(symbol, owner)
        // What is on the lock screen may name it.
        notifier.removeDelivered(Self.identifiers)
        objectWillChange.send()
        await replan()
        await refreshMove()
        changed()
    }

    /// A follow-up notification was tapped. It is written down, once, and answers nothing: only what
    /// they do next with it can (`answerIfUseful`), tapped or not.
    func opened(_ tap: HarnessTap) async {
        guard recording, accepts(tap) else { return }
        // A tapped notification was shown: iOS lets Bobby show them.
        status = .allowed
        settle()
        let clock = now()
        let ref = tap.stamp ?? ledger.events(.sent).last { $0.step == tap.step }?.at
        guard !ledger.events.contains(where: { $0.kind == .opened && $0.step == tap.step && $0.ref != nil && $0.ref == ref }) else { return }
        note(HarnessEvent(kind: .opened, at: clock, symbol: tap.symbol, step: tap.step, sector: tap.sector, ref: ref))
        if tap.step == .asset, let symbol = tap.symbol { focus = (symbol, clock) }
        await replan()
        await refreshMove()
    }

    /// A follow-up fired while the person was in the app: no banner, the glass says it. It is
    /// written as shown; whether it is answered depends on what they do with that line.
    func firedInForeground(_ tap: HarnessTap) async {
        guard recording, accepts(tap) else { return }
        settle()
        if tap.step == .asset, let symbol = tap.symbol { focus = (symbol, now()) }
        await replan()
        await refreshMove()
    }

    // MARK: Housekeeping (never asks for permission)

    /// Back in the app: follow-ups that fired are written down, the plan is brought up to date and
    /// the glass learns whether there is something to come back to.
    func appActive() async {
        status = await notifier.status()
        guard consent() != .withdrawn else { return }
        if currentUser() != owner { await accountChanged(); return }
        // What the glass remembers about its lines lasts as long as the question they were about.
        pruneLines(owner, now().addingTimeInterval(-Double(HarnessLedger.retentionDays) * 86_400))
        guard keeping else { await sync(); return }
        if recording {
            settle()
            let clock = now()
            let lastOpen = ledger.events(.appOpen).last?.at
            if lastOpen.map({ clock.timeIntervalSince($0) >= Self.openGap }) ?? true { note(HarnessEvent(kind: .appOpen, at: clock)) }
            await replan()
        } else {
            await sync()
        }
        // Undecided, the glass still says how far the asset moved since they asked: it reads the one
        // thing kept (the question) and writes nothing.
        await refreshMove()
    }

    /// Another account, or none. A signed-out reader who signs in keeps what the phone learned,
    /// unless that account said no: then nothing is taken over (off keeps nothing). A no said signed
    /// out goes with them and also stays on the phone: signed out again, it is still a no.
    /// The switch itself never waits for anything: by the time this suspends, the centre already
    /// holds the reader who is using the phone, so two changes in a row cannot cross.
    func accountChanged() async {
        let user = currentUser()
        guard user != owner else { return }
        let wasLocal = owner == nil
        // What the reader who is leaving was already shown is written into their own ledger first.
        if consent() == .accepted { settle() }
        // The previous reader's follow-ups never reach the next one: not the ones still to come,
        // and not the ones already on the lock screen.
        purge()
        if wasLocal, user != nil, consent() == .accepted {
            let local = store.ledger(owner: nil), localMode = store.mode(owner: nil)
            let theirMode = store.mode(owner: user)
            if theirMode != .off {
                var theirs = store.ledger(owner: user)
                theirs.merge(local)
                store.write(theirs, owner: user)
                if theirMode == .undecided, localMode != .undecided { store.write(localMode, owner: user) }
            }
            store.forget(owner: nil)
            if localMode == .off { store.write(.off, owner: nil) }
        }
        load(owner: user)
        // The plan stored for this reader was handed to iOS in another session: none of it is there now.
        planned = planned.map { HarnessPlanned(followUp: $0.followUp, handed: false) }
        await replan()
        await refreshMove()
        changed()
    }

    /// Nothing of the harness stays in iOS: pending or delivered.
    private func purge() {
        revision += 1
        issued = [:]
        notifier.remove(Self.identifiers)
        notifier.removeDelivered(Self.identifiers)
    }

    // MARK: The glass

    /// The asset to come back to now, if any: the tapped follow-up's, else the latest one asked
    /// about long enough ago.
    func dueAsset() -> HarnessAsset? {
        guard mode != .off, consent() == .accepted else { return nil }
        let clock = now()
        let known = ledger.assets(since: clock.addingTimeInterval(-Self.dueDays * 86_400), now: clock)
        if let focus, clock.timeIntervalSince(focus.at) <= Self.focusWindow, let asset = known.first(where: { $0.symbol == focus.symbol }) {
            return asset
        }
        return known.first { clock.timeIntervalSince($0.lastAskedAt) >= Self.dueAfter }
    }

    /// Reads the price of the asset to come back to (one quota-free request) and publishes the line.
    func refreshMove() async {
        guard let asset = dueAsset() else {
            if move != nil { move = nil; changed() }
            return
        }
        let user = owner, generation = currentGeneration()
        let couldAsk = readsOpen
        var price = quotes[asset.symbol].flatMap { now().timeIntervalSince($0.at) <= Self.quoteLifetime ? $0.price : nil }
        if price == nil {
            price = await quote(asset.symbol)
            guard owner == user, currentGeneration() == generation, consent() == .accepted else { return }
            if let price, price.isFinite, price > 0 { quotes[asset.symbol] = (price, now()) } else { price = nil }
        }
        // The line's button asks Bobby, which is a read: the phone finds out whether one is left.
        if access() == nil {
            await refreshAccess()
            guard owner == user, currentGeneration() == generation, consent() == .accepted else { return }
        }
        guard let still = dueAsset(), still.symbol == asset.symbol else { return }
        let days = max(1, Int(now().timeIntervalSince(asset.lastAskedAt) / 86_400))
        let next = HarnessMove(symbol: asset.symbol, name: asset.name, isEquity: asset.isEquity, askedAt: asset.lastAskedAt,
                               priceThen: asset.lastPrice, priceNow: price, days: days)
        if next != move || readsOpen != couldAsk { move = next; changed() }
    }

    // MARK: The plan

    /// The person said yes to follow-ups: everything the planner reads is written.
    private var recording: Bool { mode == .on && consent() == .accepted }
    /// They have not said no: a question they asked is kept, so the glass can say how it moved since.
    private var keeping: Bool { mode != .off && consent() == .accepted }

    /// Writes one event, as much of it as the person agreed to.
    ///  - Follow-ups on: the event, whole.
    ///  - Undecided: of a question they asked by themselves, the asset, its price and the moment.
    ///    Nothing of any other event, and nothing of a read Bobby started. What a question or a
    ///    save carried beyond that waits in memory, briefly, for the yes (`accept` writes it).
    private func note(_ event: HarnessEvent) {
        guard mode == .on else {
            guard mode == .undecided else { return }
            if event.isQuestion || event.kind == .saved {
                held.append(event)
                if held.count > Self.heldEvents { held.removeFirst(held.count - Self.heldEvents) }
            }
            guard event.isQuestion else { return }
            ledger.note(HarnessEvent(kind: .ask, at: event.at, symbol: event.symbol, name: event.name, isEquity: event.isEquity, price: event.price))
            store.write(ledger, owner: owner)
            return
        }
        ledger.note(event)
        store.write(ledger, owner: owner)
    }

    /// The ledger points at the theses that are active now, and at no other: one pointer per asset,
    /// with the horizon set on it. Only once follow-ups are on.
    private func syncTheses() {
        guard mode == .on, consent() == .accepted else { return }
        var wanted: [String: (horizon: HarnessHorizon?, since: Date)] = [:]
        for thesis in theses(owner) {
            guard let symbol = HarnessLedger.validSymbol(thesis.symbol) else { continue }
            wanted[symbol] = (thesis.horizon, thesis.since)
        }
        let pointers = ledger.events(.thesis)
        let current = Dictionary(grouping: pointers, by: { $0.symbol ?? "" })
        let inStep = current.count == wanted.count && wanted.allSatisfy { symbol, thesis in
            current[symbol]?.count == 1 && current[symbol]?.first?.horizon == thesis.horizon
        }
        guard !inStep else { return }
        ledger.remove { $0.kind == .thesis }
        let clock = now()
        for (symbol, thesis) in wanted {
            ledger.note(HarnessEvent(kind: .thesis, at: min(thesis.since, clock), symbol: symbol, horizon: thesis.horizon))
        }
        store.write(ledger, owner: owner)
    }

    /// Follow-ups whose moment has passed: the ones iOS held become `sent`; all of them leave the plan.
    private func settle() {
        let clock = now()
        let passed = planned.filter { $0.followUp.fireAt <= clock }
        guard !passed.isEmpty else { return }
        // iOS accepted it while it could show notifications: it counts as shown, even if the
        // permission was taken away afterwards (counting too many only makes Bobby quieter).
        for item in passed where item.handed {
            let followUp = item.followUp
            ledger.note(HarnessEvent(kind: .sent, at: followUp.fireAt, symbol: followUp.symbol, step: followUp.step, sector: followUp.sector))
        }
        planned.removeAll { $0.followUp.fireAt <= clock }
        store.write(ledger, owner: owner)
        store.write(planned, owner: owner)
    }

    /// Asks the planner what comes next and brings iOS in line with it.
    func replan() async {
        settle()
        syncTheses()
        revision += 1
        var wanted: [HarnessFollowUp] = []
        if mode == .on, consent() == .accepted {
            var options = HarnessPlanner.Options()
            options.weeklyCovered = weeklyCovered()
            wanted = HarnessPlanner.plan(ledger: ledger, now: now(), calendar: calendar(), options: options)
        }
        planned = wanted.map { followUp in
            HarnessPlanned(followUp: followUp, handed: planned.first { $0.followUp == followUp }?.handed ?? false)
        }
        store.write(planned, owner: owner)
        upcoming = wanted
        await sync()
    }

    /// One at a time, always from the newest plan.
    private func sync() async {
        let previous = syncTail
        let task = Task { @MainActor [weak self] in
            await previous?.value
            await self?.apply()
        }
        syncTail = task
        await task.value
    }

    private func notice(_ followUp: HarnessFollowUp) -> HarnessNotice {
        HarnessNotice(id: followUp.id, title: HarnessCopy.notificationTitle, body: HarnessCopy.body(followUp), fireAt: followUp.fireAt,
                      step: followUp.step, symbol: followUp.symbol, sector: followUp.sector, owner: Self.ownerTag(owner), calendar: calendar())
    }

    private func apply() async {
        // The plan as it is when this sync starts. If it changes while iOS is being asked, this
        // sync stops writing: the change queued its own sync behind this one.
        let started = revision
        let clock = now()
        let wanted = planned.map(\.followUp).filter { $0.fireAt > clock }.map(notice)
        let wantedIds = Set(wanted.map(\.id))
        let existing = await notifier.pendingIds().filter { $0.hasPrefix(HarnessPlanner.identifierPrefix) }
        guard started == revision else { return }
        let stale = existing.subtracting(wantedIds)
        if !stale.isEmpty { notifier.remove(stale.sorted()) }
        for id in Array(issued.keys) where !wantedIds.contains(id) { issued[id] = nil }
        let permission = await notifier.status()
        guard started == revision else { return }
        status = permission
        guard permission == .allowed else { return }
        var changedPlan = false
        for wantedNotice in wanted {
            if issued[wantedNotice.id] == wantedNotice, existing.contains(wantedNotice.id) { continue }
            // About to fire: whatever iOS already holds under this id stays as it is.
            guard wantedNotice.fireAt.timeIntervalSince(now()) >= ReminderSchedule.handOffMargin else { continue }
            let handed = await notifier.add(wantedNotice)
            guard started == revision else {
                // The plan moved while iOS was writing: this request may no longer be wanted. The sync
                // queued behind this one decides; here it is only forgotten, so it is written again or removed.
                issued[wantedNotice.id] = nil
                return
            }
            issued[wantedNotice.id] = handed ? wantedNotice : nil
            if let index = planned.firstIndex(where: { $0.followUp.id == wantedNotice.id }), planned[index].handed != handed {
                planned[index].handed = handed
                changedPlan = true
            }
        }
        if changedPlan { store.write(planned, owner: owner) }
    }

    /// Forgets this reader and cancels what iOS holds. `keeping` is the switch afterwards.
    private func erase(keeping next: HarnessMode) async {
        store.forget(owner: owner)
        store.write(next, owner: owner)
        ledger = HarnessLedger()
        planned = []
        upcoming = []
        mode = next
        focus = nil
        held = []
        quotes = [:]
        if move != nil { move = nil }
        forgetLines(nil, owner)
        purge()
        // Behind any sync still writing: the last word is an empty plan.
        await sync()
        changed()
    }

    /// The Memory screen's "Delete everything" and the tests: this reader's ledger goes, the switch stays.
    func forgetLedger() async {
        await erase(keeping: mode)
    }
}
