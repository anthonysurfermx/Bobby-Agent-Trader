// Thesis reminders (1.8): the tapped notification. Like a briefing tap (Briefings/BriefingIntent.swift)
// it can arrive at cold launch, before the page is ready or while the mic or a read is busy, so the
// tap is only STORED here and the Núcleo drains it once when it can honour it.
// Invariants: in memory only (never replayed on a later launch), consumed once, newest wins, a
// payload that is not a thesis reminder is ignored, and an account change clears it.
import Combine
import Foundation
import UserNotifications

/// What a tapped reminder carries: the thesis it was filed under and every thesis due that day.
struct ReminderTap: Equatable {
    let thesisId: String
    /// `thesisId` first, then the theses that shared the day's notification. Never empty.
    let thesisIds: [String]
}

@MainActor
final class ReminderIntent: ObservableObject {
    static let shared = ReminderIntent()

    /// The tap waiting to be opened, or nil.
    @Published private(set) var pending: ReminderTap?
    /// The thesis whose review is on screen: a reminder for it that fires now is not shown on top of it.
    @Published private(set) var openThesisId: String?

    private var cancellables = Set<AnyCancellable>()

    init(observeAccount: Bool = true, account: AccountSession? = nil) {
        guard observeAccount else { return }
        NotificationCenter.default.publisher(for: AccountSession.didChange, object: account ?? .shared)
            .receive(on: DispatchQueue.main)
            .sink { [weak self] _ in self?.clear() }
            .store(in: &cancellables)
    }

    /// Stores a tapped notification's payload. False (and the previous tap kept) when it is not a
    /// thesis reminder with a valid thesis id.
    @discardableResult
    func store(_ userInfo: [AnyHashable: Any]) -> Bool {
        guard let tap = Self.tap(from: userInfo) else { return false }
        store(tap)
        return true
    }

    /// A tap the app delegate already read from the payload.
    func store(_ tap: ReminderTap) {
        pending = tap
    }

    /// The pending tap, consumed: a second call returns nil until another tap arrives.
    func take() -> ReminderTap? {
        defer { pending = nil }
        return pending
    }

    func clear() {
        pending = nil
    }

    /// The review screen says which thesis it shows (nil when it closes).
    func markOpen(_ thesisId: String?) {
        openThesisId = thesisId.flatMap(Self.thesisId)
    }

    // MARK: The payload

    /// A thesis id as the book writes it (an uppercase UUID string), or nil.
    nonisolated static func thesisId(_ raw: Any?) -> String? {
        guard let text = raw as? String, text.count == 36, let uuid = UUID(uuidString: text) else { return nil }
        return uuid.uuidString
    }

    /// Reads `["kind": "thesis-review", "thesisId": …]`. Anything else (a briefing push, a foreign
    /// payload, a malformed id) is not a reminder.
    nonisolated static func tap(from userInfo: [AnyHashable: Any]) -> ReminderTap? {
        guard userInfo["kind"] as? String == ReminderCenter.kind, let id = thesisId(userInfo["thesisId"]) else { return nil }
        var all = [id]
        for other in (userInfo["thesisIds"] as? [Any] ?? []).prefix(ThesisBook.activeLimit + 1) {
            if let other = thesisId(other), !all.contains(other) { all.append(other) }
        }
        return ReminderTap(thesisId: id, thesisIds: all)
    }

    /// A reminder that fires while the app is open shows as a banner, unless that thesis's review is
    /// already on screen. Quiet: the person is looking at the app.
    nonisolated static func presentation(thesisId: String, openThesisId: String?) -> UNNotificationPresentationOptions {
        if let openThesisId, openThesisId.caseInsensitiveCompare(thesisId) == .orderedSame { return [] }
        return [.banner, .list]
    }

    /// The app delegate's foreground question for a reminder that just fired.
    static func foregroundPresentation(_ tap: ReminderTap) -> UNNotificationPresentationOptions {
        // It was delivered: it is no longer pending.
        ReminderCenter.shared.reconcile()
        return presentation(thesisId: tap.thesisId, openThesisId: shared.openThesisId)
    }

    // MARK: Where a tap leads

    enum Destination: Equatable {
        /// The review of this thesis (the id as the book holds it).
        case review(String)
        /// The list: the thesis is gone, or more than one was due that day.
        case list
    }

    static func destination(for tap: ReminderTap, active: [SavedThesis]) -> Destination {
        let due = tap.thesisIds.compactMap { id in active.first { $0.id.caseInsensitiveCompare(id) == .orderedSame }?.id }
        return due.count == 1 ? .review(due[0]) : .list
    }
}
