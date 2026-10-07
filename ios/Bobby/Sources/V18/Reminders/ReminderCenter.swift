// Thesis reminders (1.8). A reminder is a note the person leaves for themselves: "on that day,
// remind me to review this thesis". It is scheduled ON THIS PHONE as a local notification: no
// server, no push token, no account needed, and Bobby watches nothing in the meantime.
// Invariants:
//  - iOS permission is asked ONLY inside `schedule`, which only a reminder button calls. Never at
//    launch, never from a nudge, never from housekeeping.
//  - Nothing is scheduled before the risk notice is accepted, and withdrawing it cancels everything.
//  - One pending reminder per thesis and at most one notification per calendar day: a second
//    reminder landing on a day that already has one takes that notification's time.
//  - The lock-screen text is fixed and generic. No asset, no figure, no thesis text ever reaches it.
//  - A reminder lives exactly as long as its thesis is active for the person using the phone: an
//    archived or deleted thesis, another account, a deleted account or a withdrawn consent cancel it.
//  - What is listed as pending is what the phone will deliver: a delivered reminder leaves the list.
import Combine
import Foundation
import UIKit
import UserNotifications

/// What iOS lets Bobby show on this phone.
enum ReminderPermission: Equatable {
    case notDetermined, allowed, denied
}

/// A reminder the person set and that has not fired yet.
struct PendingReminder: Codable, Equatable, Identifiable {
    let thesisId: String
    /// The asset's symbol, for the app's own list. It never leaves the phone.
    let symbol: String
    let fireAt: Date
    var id: String { thesisId }
}

/// The three one-tap choices; "Pick a day" hands `schedule` a date instead.
enum ReminderPreset: String, CaseIterable, Identifiable {
    case threeDays, week, month
    var id: String { rawValue }
}

/// The date rules, pure: 18:00 local on the chosen day, never in the past.
enum ReminderSchedule {
    static let hour = 18
    /// A reminder closer than this is treated as already passed.
    static let minimumLead: TimeInterval = 60

    static func date(for preset: ReminderPreset, now: Date, calendar: Calendar) -> Date {
        let today = calendar.startOfDay(for: now)
        let day: Date?
        switch preset {
        case .threeDays: day = calendar.date(byAdding: .day, value: 3, to: today)
        case .week: day = calendar.date(byAdding: .day, value: 7, to: today)
        // The calendar's own month: January 31 lands on the last day of February.
        case .month: day = calendar.date(byAdding: .month, value: 1, to: today)
        }
        return evening(of: day ?? today.addingTimeInterval(3 * 86_400), calendar: calendar)
    }

    /// Where "Pick a day" starts: tomorrow at 18:00.
    static func defaultPick(now: Date, calendar: Calendar) -> Date {
        let tomorrow = calendar.date(byAdding: .day, value: 1, to: calendar.startOfDay(for: now)) ?? now.addingTimeInterval(86_400)
        return evening(of: tomorrow, calendar: calendar)
    }

    /// The earliest and latest the picker offers.
    static func pickRange(now: Date, calendar: Calendar) -> ClosedRange<Date> {
        let first = now.addingTimeInterval(minimumLead)
        let last = calendar.date(byAdding: .year, value: 1, to: now) ?? now.addingTimeInterval(365 * 86_400)
        return first...max(first, last)
    }

    /// A picked moment, to the minute and never in the past: a time that already passed is kept as a
    /// time of day and moved to today, or to tomorrow when today's has passed too.
    static func normalized(_ picked: Date, now: Date, calendar: Calendar) -> Date {
        let whole = calendar.date(from: calendar.dateComponents([.year, .month, .day, .hour, .minute], from: picked)) ?? picked
        if whole.timeIntervalSince(now) >= minimumLead { return whole }
        let time = calendar.dateComponents([.hour, .minute], from: whole)
        let today = calendar.startOfDay(for: now)
        let sameTimeToday = calendar.date(bySettingHour: time.hour ?? hour, minute: time.minute ?? 0, second: 0, of: today) ?? whole
        if sameTimeToday.timeIntervalSince(now) >= minimumLead { return sameTimeToday }
        return calendar.date(byAdding: .day, value: 1, to: sameTimeToday) ?? sameTimeToday.addingTimeInterval(86_400)
    }

    static func evening(of day: Date, calendar: Calendar) -> Date {
        calendar.date(bySettingHour: hour, minute: 0, second: 0, of: day) ?? calendar.startOfDay(for: day).addingTimeInterval(Double(hour) * 3_600)
    }
}

/// One local notification as the centre wants it: what the phone shows and what a tap carries.
struct ReminderNotice: Equatable {
    let id: String
    let title: String
    let body: String
    let fireAt: Date
    /// The thesis the notification is filed under.
    let thesisId: String
    /// Every thesis that shares this day's notification (the first is `thesisId`).
    let thesisIds: [String]
    let calendar: Calendar

    var userInfo: [String: Any] {
        ["kind": ReminderCenter.kind, "thesisId": thesisId, "thesisIds": thesisIds]
    }
}

/// The phone's notification centre, as little of it as reminders need. Tests use a fake.
@MainActor
protocol ReminderNotifying: AnyObject {
    func status() async -> ReminderPermission
    /// Shows the iOS prompt. Only `ReminderCenter.schedule` calls it.
    func requestPermission() async -> Bool
    /// Adds or replaces the request with the notice's id. False when iOS refused it.
    func add(_ notice: ReminderNotice) async -> Bool
    func remove(_ ids: [String])
    func pendingIds() async -> Set<String>
}

@MainActor
final class SystemReminderNotifier: ReminderNotifying {
    private var center: UNUserNotificationCenter { .current() }

    func status() async -> ReminderPermission {
        switch await center.notificationSettings().authorizationStatus {
        case .notDetermined: return .notDetermined
        case .denied: return .denied
        default: return .allowed
        }
    }

    func requestPermission() async -> Bool {
        // No badge: a reminder is one line on the day the person chose, nothing that accumulates.
        (try? await center.requestAuthorization(options: [.alert, .sound])) ?? false
    }

    func add(_ notice: ReminderNotice) async -> Bool {
        let content = UNMutableNotificationContent()
        content.title = notice.title
        content.body = notice.body
        content.sound = .default
        content.threadIdentifier = "bobby-thesis-reminders"
        content.userInfo = notice.userInfo
        // The instant the person saw when they chose it, wherever the phone is that day.
        var parts = notice.calendar.dateComponents([.year, .month, .day, .hour, .minute, .second], from: notice.fireAt)
        parts.calendar = notice.calendar
        parts.timeZone = notice.calendar.timeZone
        let trigger = UNCalendarNotificationTrigger(dateMatching: parts, repeats: false)
        do {
            try await center.add(UNNotificationRequest(identifier: notice.id, content: content, trigger: trigger))
            return true
        } catch {
            return false
        }
    }

    func remove(_ ids: [String]) {
        center.removePendingNotificationRequests(withIdentifiers: ids)
    }

    func pendingIds() async -> Set<String> {
        Set(await center.pendingNotificationRequests().map(\.identifier))
    }
}

/// The unit-test host never touches the phone's notifications (suites build their own fake).
@MainActor
final class SilentReminderNotifier: ReminderNotifying {
    func status() async -> ReminderPermission { .notDetermined }
    func requestPermission() async -> Bool { false }
    func add(_ notice: ReminderNotice) async -> Bool { false }
    func remove(_ ids: [String]) {}
    func pendingIds() async -> Set<String> { [] }
}

@MainActor
final class ReminderCenter: ObservableObject {
    static let shared = ReminderCenter(notifier: BobbyApp.isUnitTestHost ? SilentReminderNotifier() : SystemReminderNotifier())

    nonisolated static let storeKey = "v18.reminders.v1"
    nonisolated static let kind = "thesis-review"
    nonisolated static let identifierPrefix = "v18.thesis."
    nonisolated static func identifier(_ thesisId: String) -> String { identifierPrefix + thesisId }

    enum Outcome: Equatable {
        case scheduled(Date)
        /// iOS does not let Bobby show notifications: nothing was scheduled.
        case denied
        /// The risk notice is not accepted: nothing was asked and nothing was scheduled.
        case consentRequired
        /// The thesis is not one of this person's active theses.
        case unknownThesis
        /// The account changed while iOS was asking, or iOS refused the request.
        case failed
    }

    /// Reminders that have not fired, in the order they were set.
    @Published private(set) var pending: [PendingReminder] = []
    @Published private(set) var status: ReminderPermission = .notDetermined
    /// Theses whose reminder is being set right now (iOS may be asking for permission).
    @Published private(set) var scheduling: Set<String> = []

    var now: () -> Date = { Date() }
    var calendar: () -> Calendar = { .autoupdatingCurrent }
    /// The app's language when a notification is written.
    var language: () -> String = { L.language }
    var riskAccepted: () -> Bool = { UserDefaults.standard.integer(forKey: "agent.riskNoticeVersion") >= RiskNotice.currentVersion }
    var currentUser: () -> String? = { AccountSession.shared.session?.userId }
    var currentGeneration: () -> UUID = { AccountSession.shared.generation }
    /// The active theses of whoever uses the phone now (signed out is the local book).
    var activeTheses: (String?) -> [SavedThesis] = { ThesisBook.shared.active(owner: $0) }

    private let notifier: ReminderNotifying
    private let defaults: UserDefaults
    /// What this launch handed to iOS, so an unchanged notification is not written twice.
    private var issued: [String: ReminderNotice] = [:]
    private var syncTail: Task<Void, Never>?
    private var cancellables = Set<AnyCancellable>()
    private var started = false

    init(notifier: ReminderNotifying, defaults: UserDefaults = .standard) {
        self.notifier = notifier
        self.defaults = defaults
        if let data = defaults.data(forKey: Self.storeKey), let list = try? Self.decoder.decode([PendingReminder].self, from: data) {
            pending = list
        }
    }

    // MARK: Reading

    func reminder(for thesisId: String) -> PendingReminder? {
        pending.first { $0.thesisId.caseInsensitiveCompare(thesisId) == .orderedSame }
    }

    func hasReminder(for thesisId: String) -> Bool { reminder(for: thesisId) != nil }

    // MARK: The person's actions

    /// "In a week": the preset's day at 18:00.
    @discardableResult
    func schedule(thesisId: String, symbol: String, preset: ReminderPreset) async -> Outcome {
        await schedule(thesisId: thesisId, symbol: symbol, at: ReminderSchedule.date(for: preset, now: now(), calendar: calendar()))
    }

    /// Sets (or moves) the reminder of one thesis. The ONLY place iOS is asked for permission, and
    /// only when it never answered before.
    @discardableResult
    func schedule(thesisId: String, symbol: String, at date: Date) async -> Outcome {
        guard riskAccepted() else { return .consentRequired }
        let user = currentUser()
        let generation = currentGeneration()
        guard let thesis = activeThesis(thesisId, owner: user) else { return .unknownThesis }
        guard !scheduling.contains(thesis.id) else { return .failed }
        scheduling.insert(thesis.id)
        defer { scheduling.remove(thesis.id) }

        var permission = await notifier.status()
        if permission == .notDetermined {
            _ = await notifier.requestPermission()
            permission = await notifier.status()
        }
        status = permission
        guard permission == .allowed else { return .denied }
        // iOS may have asked for a while: the answer belongs to whoever tapped, with their consent
        // and their thesis still in place.
        guard currentUser() == user, currentGeneration() == generation, riskAccepted(),
              activeThesis(thesis.id, owner: user) != nil else { return .failed }

        let clock = now()
        let calendar = calendar()
        var fireAt = ReminderSchedule.normalized(date, now: clock, calendar: calendar)
        let before = pending
        var list = pending.filter { $0.thesisId != thesis.id && $0.fireAt > clock }
        // One notification a day: a day that already has a reminder keeps its time.
        if let sameDay = list.first(where: { calendar.isDate($0.fireAt, inSameDayAs: fireAt) }) { fireAt = sameDay.fireAt }
        list.append(PendingReminder(thesisId: thesis.id, symbol: symbol.uppercased(), fireAt: fireAt))
        write(list)
        await sync()
        guard covered(thesis.id) else {
            // iOS refused the request: what the list says must be what the phone will deliver.
            write(before)
            await sync()
            return .failed
        }
        return .scheduled(fireAt)
    }

    func cancel(thesisId: String) async {
        let list = pending.filter { $0.thesisId.caseInsensitiveCompare(thesisId) != .orderedSame }
        guard list != pending else { return }
        write(list)
        await sync()
    }

    // MARK: Housekeeping (never asks for permission)

    /// Called once when the Núcleo starts: keeps the list true from then on.
    func start() {
        guard !started else { return }
        started = true
        // A thesis archived or deleted loses its reminder.
        NotificationCenter.default.publisher(for: ThesisBook.didChange)
            .receive(on: DispatchQueue.main)
            .sink { [weak self] _ in self?.reconcile() }
            .store(in: &cancellables)
        // Another account (or none): these reminders pointed at the previous reader's theses. Runs a
        // turn later, after the session has moved a signed-out person's theses into their new account.
        NotificationCenter.default.publisher(for: AccountSession.didChange)
            .receive(on: DispatchQueue.main)
            .sink { [weak self] _ in self?.reconcile() }
            .store(in: &cancellables)
        // The risk notice was withdrawn (it is stored in the defaults).
        NotificationCenter.default.publisher(for: UserDefaults.didChangeNotification)
            .receive(on: DispatchQueue.main)
            .sink { [weak self] _ in
                guard let self, !self.pending.isEmpty, !self.riskAccepted() else { return }
                self.reconcile()
            }
            .store(in: &cancellables)
        // Back in the app: a reminder may have been delivered, or Settings changed the permission.
        NotificationCenter.default.publisher(for: UIApplication.didBecomeActiveNotification)
            .sink { [weak self] _ in Task { @MainActor in await self?.refresh() } }
            .store(in: &cancellables)
        Task { await refresh() }
    }

    /// Reads the permission (a local read, no prompt) and brings the list and the phone in line.
    func refresh() async {
        status = await notifier.status()
        prune()
        await sync()
    }

    /// Drops every reminder that should no longer fire, then tells iOS.
    func reconcile() {
        if prune() { Task { await sync() } }
    }

    /// Same as `reconcile`, awaited (tests, and callers that show the result at once).
    func reconcileNow() async {
        prune()
        await sync()
    }

    @discardableResult
    private func prune() -> Bool {
        let kept: [PendingReminder]
        if riskAccepted() {
            let clock = now()
            let active = Set(activeTheses(currentUser()).map(\.id))
            kept = pending.filter { $0.fireAt > clock && active.contains($0.thesisId) }
        } else {
            kept = []
        }
        guard kept != pending else { return false }
        write(kept)
        return true
    }

    // MARK: The phone

    /// The notifications the list asks for: one per calendar day, filed under the day's first thesis.
    static func plan(_ pending: [PendingReminder], calendar: Calendar, language: String) -> [ReminderNotice] {
        var days: [[PendingReminder]] = []
        for entry in pending {
            if let index = days.firstIndex(where: { calendar.isDate($0[0].fireAt, inSameDayAs: entry.fireAt) }) {
                days[index].append(entry)
            } else {
                days.append([entry])
            }
        }
        return days.map { group in
            ReminderNotice(id: identifier(group[0].thesisId), title: ReminderCopy.notificationTitle,
                           body: ReminderCopy.notificationBody(language: language),
                           fireAt: group.map(\.fireAt).min() ?? group[0].fireAt,
                           thesisId: group[0].thesisId, thesisIds: group.map(\.thesisId), calendar: calendar)
        }
    }

    /// One at a time, always from the newest list.
    private func sync() async {
        let previous = syncTail
        let task = Task { @MainActor [weak self] in
            await previous?.value
            await self?.apply()
        }
        syncTail = task
        await task.value
    }

    private func apply() async {
        // A moment that has passed is never handed to iOS (it would sit there and never fire).
        let clock = now()
        let wanted = Self.plan(pending.filter { $0.fireAt > clock }, calendar: calendar(), language: language())
        let wantedIds = Set(wanted.map(\.id))
        let existing = await notifier.pendingIds().filter { $0.hasPrefix(Self.identifierPrefix) }
        let stale = existing.subtracting(wantedIds)
        if !stale.isEmpty { notifier.remove(stale.sorted()) }
        for id in Array(issued.keys) where !wantedIds.contains(id) { issued[id] = nil }
        // Without permission nothing is written; the list stays and the screen says why.
        guard await notifier.status() == .allowed else { return }
        for notice in wanted {
            if let done = issued[notice.id], done.fireAt == notice.fireAt, done.thesisIds == notice.thesisIds,
               existing.contains(notice.id) { continue }
            if await notifier.add(notice) { issued[notice.id] = notice } else { issued[notice.id] = nil }
        }
    }

    /// The thesis is inside a notification iOS accepted during this launch.
    private func covered(_ thesisId: String) -> Bool {
        issued.values.contains { $0.thesisIds.contains(thesisId) }
    }

    private func activeThesis(_ thesisId: String, owner: String?) -> SavedThesis? {
        activeTheses(owner).first { $0.id.caseInsensitiveCompare(thesisId) == .orderedSame }
    }

    // MARK: Store

    private static let encoder: JSONEncoder = { let e = JSONEncoder(); e.dateEncodingStrategy = .millisecondsSince1970; return e }()
    private static let decoder: JSONDecoder = { let d = JSONDecoder(); d.dateDecodingStrategy = .millisecondsSince1970; return d }()

    private func write(_ list: [PendingReminder]) {
        pending = list
        if list.isEmpty {
            defaults.removeObject(forKey: Self.storeKey)
        } else if let data = try? Self.encoder.encode(list) {
            defaults.set(data, forKey: Self.storeKey)
        }
    }
}
