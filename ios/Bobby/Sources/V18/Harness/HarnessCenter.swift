// The harness (1.8): the phone's side. It writes what the person does into the ledger, asks
// HarnessPlanner what comes next, and hands that to iOS as local notifications. No server, no push
// token, no account needed: a person who asked one question signed out is followed up exactly
// like anyone else, and nothing about them leaves the phone.
// Invariants:
//  - iOS permission is asked ONLY inside `accept`, which only the person's own "Yes, tell me" (the
//    offer on the glass) or the Follow-ups switch calls. Never at launch, never from housekeeping.
//  - Nothing is recorded or scheduled before the risk notice is accepted; withdrawing it erases
//    the ledger and cancels everything. Turning follow-ups off does the same.
//  - What iOS holds is always the plan of whoever uses the phone now: another account, or none,
//    cancels the previous reader's follow-ups before anything else.
//  - A follow-up names the asset the person asked about and nothing else: no price, no figure, no
//    direction. The number is read when they open it.
//  - A follow-up whose moment has passed is written to the ledger as `sent` exactly once; whether
//    it was opened is what the next plan learns from.
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

    var userInfo: [String: Any] {
        var info: [String: Any] = ["kind": HarnessCenter.kind, "step": step.rawValue, "owner": owner,
                                   "at": fireAt.timeIntervalSince1970.rounded()]
        if let symbol { info["symbol"] = symbol }
        if let sector { info["sector"] = sector }
        return info
    }

    /// One line, the default sound, no badge, once, at that moment wherever the phone is that day.
    func request() -> UNNotificationRequest {
        let content = UNMutableNotificationContent()
        content.title = title
        content.body = body
        content.sound = .default
        content.threadIdentifier = Self.thread
        content.userInfo = userInfo
        var parts = calendar.dateComponents([.year, .month, .day, .hour, .minute, .second], from: fireAt)
        parts.calendar = calendar
        parts.timeZone = calendar.timeZone
        return UNNotificationRequest(identifier: id, content: content,
                                     trigger: UNCalendarNotificationTrigger(dateMatching: parts, repeats: false))
    }
}

/// The phone's notification centre, as little of it as follow-ups need. Tests use a fake.
@MainActor
protocol HarnessNotifying: AnyObject {
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

    var pct: Double? {
        guard let priceThen, let priceNow, priceThen > 0, priceNow > 0 else { return nil }
        let pct = (priceNow / priceThen - 1) * 100
        return pct.isFinite && abs(pct) < 1_000 ? pct : nil
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
    /// Back in the app this soon after a follow-up counts as having come back for it.
    static let returnWindow: TimeInterval = 6 * 3_600
    /// A tapped follow-up keeps the glass on its asset this long.
    static let focusWindow: TimeInterval = 30 * 60
    static let quoteLifetime: TimeInterval = 10 * 60
    static let quoteTimeout: Double = 8
    /// One `appOpen` per this long.
    static let openGap: TimeInterval = 30 * 60

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
    /// The glass has something new to draw (the session listens).
    var changed: () -> Void = {}

    private let notifier: HarnessNotifying
    private let store: HarnessStore
    private(set) var owner: String?
    private(set) var ledger = HarnessLedger()
    private var planned: [HarnessPlanned] = []
    /// What this launch handed to iOS (id → what it said and when), so nothing is written twice.
    private var issued: [String: HarnessNotice] = [:]
    private var focus: (symbol: String, at: Date)?
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
    }

    // MARK: Reading

    var profile: HarnessProfile { .make(ledger, now: now(), calendar: calendar()) }

    /// Follow-ups are wanted and nothing stands in their way but, possibly, iOS.
    var isOn: Bool { mode == .on }

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
        // Another language: what iOS holds is rewritten in it.
        NotificationCenter.default.publisher(for: L.didChange)
            .receive(on: DispatchQueue.main)
            .sink { [weak self] _ in Task { @MainActor in await self?.replan() } }
            .store(in: &cancellables)
        NotificationCenter.default.publisher(for: Self.erased)
            .receive(on: DispatchQueue.main)
            .sink { [weak self] _ in Task { @MainActor in await self?.reloadAfterErase() } }
            .store(in: &cancellables)
        Task { await appActive() }
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
        quotes = [:]
        move = nil
    }

    // MARK: What the person does

    /// A read was delivered. The first one starts everything.
    func noteAsk(symbol: String, name: String, isEquity: Bool, price: Double?) {
        guard recording else { return }
        note(HarnessEvent(kind: .ask, at: now(), symbol: symbol, name: name, isEquity: isEquity, price: price))
        // They are looking at it now: the line about "since you asked" has nothing to say yet.
        if move?.symbol == symbol.uppercased() { move = nil }
        Task { await replan() }
    }

    func noteSaved(symbol: String) {
        guard recording else { return }
        note(HarnessEvent(kind: .saved, at: now(), symbol: symbol))
    }

    /// They acted on a follow-up inside the app.
    func notePicked(symbol: String) {
        guard recording else { return }
        note(HarnessEvent(kind: .picked, at: now(), symbol: symbol))
        if focus?.symbol == symbol.uppercased() { focus = nil }
        if move?.symbol == symbol.uppercased() { move = nil }
    }

    /// The offer's "Yes, tell me", or the switch turned on. The ONLY place iOS is asked.
    @discardableResult
    func accept() async -> Outcome {
        guard consent() == .accepted else { return .consentRequired }
        guard !saving else { return .failed }
        let user = currentUser(), generation = currentGeneration()
        saving = true
        defer { saving = false }
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
        await replan()
        return permission == .allowed ? .on : .denied
    }

    /// The switch turned off: nothing is kept and nothing is scheduled.
    func turnOff() async {
        await erase(keeping: .off)
    }

    /// A follow-up notification was tapped.
    func opened(_ tap: HarnessTap) async {
        guard recording, accepts(tap) else { return }
        // A tapped notification was shown: iOS lets Bobby show them.
        status = .allowed
        settle()
        let clock = now()
        let ref = tap.stamp ?? ledger.events(.sent).last { $0.step == tap.step }?.at
        // Coming back and tapping are one answer, not two, however long the tap waited to be honoured.
        ledger.remove { event in
            guard event.kind == .returned, event.step == tap.step else { return false }
            if let ref, let answered = event.ref { return answered == ref }
            return clock.timeIntervalSince(event.at) < 600
        }
        guard !ledger.events.contains(where: { $0.kind == .opened && $0.step == tap.step && $0.ref != nil && $0.ref == ref }) else { return }
        note(HarnessEvent(kind: .opened, at: clock, symbol: tap.symbol, step: tap.step, sector: tap.sector, ref: ref))
        if tap.step == .asset, let symbol = tap.symbol { focus = (symbol, clock) }
        await replan()
        await refreshMove()
    }

    /// A follow-up fired while the person was in the app: it counts as answered, without a banner.
    func firedInForeground(_ tap: HarnessTap) async {
        guard recording, accepts(tap) else { return }
        settle()
        let clock = now()
        note(HarnessEvent(kind: .returned, at: clock, symbol: tap.symbol, step: tap.step, sector: tap.sector, ref: tap.stamp))
        if tap.step == .asset, let symbol = tap.symbol { focus = (symbol, clock) }
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
        guard recording else { await sync(); return }
        settle()
        let clock = now()
        // Back soon after a follow-up they did not tap: they came back for it.
        if let last = ledger.events(.sent).last, clock.timeIntervalSince(last.at) <= Self.returnWindow,
           !ledger.events.contains(where: { $0.isEngagement && ($0.ref == last.at || $0.at >= last.at) }) {
            note(HarnessEvent(kind: .returned, at: clock, symbol: last.symbol, step: last.step, sector: last.sector, ref: last.at))
        }
        let lastOpen = ledger.events(.appOpen).last?.at
        if lastOpen.map({ clock.timeIntervalSince($0) >= Self.openGap }) ?? true { note(HarnessEvent(kind: .appOpen, at: clock)) }
        await replan()
        await refreshMove()
    }

    /// Another account, or none. A signed-out reader who signs in keeps what the phone learned.
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
            var theirs = store.ledger(owner: user)
            theirs.merge(local)
            store.write(theirs, owner: user)
            if store.mode(owner: user) == .undecided, localMode != .undecided { store.write(localMode, owner: user) }
            store.forget(owner: nil)
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
        var price = quotes[asset.symbol].flatMap { now().timeIntervalSince($0.at) <= Self.quoteLifetime ? $0.price : nil }
        if price == nil {
            price = await quote(asset.symbol)
            guard owner == user, currentGeneration() == generation, consent() == .accepted else { return }
            if let price, price.isFinite, price > 0 { quotes[asset.symbol] = (price, now()) } else { price = nil }
        }
        guard let still = dueAsset(), still.symbol == asset.symbol else { return }
        let days = max(1, Int(now().timeIntervalSince(asset.lastAskedAt) / 86_400))
        let next = HarnessMove(symbol: asset.symbol, name: asset.name, isEquity: asset.isEquity, askedAt: asset.lastAskedAt,
                               priceThen: asset.lastPrice, priceNow: price, days: days)
        if next != move { move = next; changed() }
    }

    // MARK: The plan

    private var recording: Bool { mode != .off && consent() == .accepted }

    private func note(_ event: HarnessEvent) {
        ledger.note(event)
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
        quotes = [:]
        if move != nil { move = nil }
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
