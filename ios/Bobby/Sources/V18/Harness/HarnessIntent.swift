// The harness (1.8): the tapped follow-up. Like a reminder tap (Reminders/ReminderIntent.swift) it
// can arrive at cold launch, before the page is ready or while the mic or a read is busy, so the
// tap is only STORED here and the Núcleo drains it once when it can honour it.
// In memory only (never replayed on a later launch), consumed once, newest wins, and an account
// change clears it. The notification's "Stop" action is not a tap to open: it is acted on at once
// (`respond`) and stores nothing.
import Combine
import Foundation
import UserNotifications

@MainActor
final class HarnessIntent: ObservableObject {
    static let shared = HarnessIntent()

    /// The tap waiting to be opened, or nil.
    @Published private(set) var pending: HarnessTap?

    private var cancellables = Set<AnyCancellable>()

    init(observeAccount: Bool = true, account: AccountSession? = nil) {
        guard observeAccount else { return }
        NotificationCenter.default.publisher(for: AccountSession.didChange, object: account ?? .shared)
            .receive(on: DispatchQueue.main)
            .sink { [weak self] _ in self?.clear() }
            .store(in: &cancellables)
    }

    func store(_ tap: HarnessTap) { pending = tap }

    /// The pending tap, consumed: a second call returns nil until another tap arrives.
    func take() -> HarnessTap? {
        defer { pending = nil }
        return pending
    }

    func clear() { pending = nil }

    /// A follow-up that fires while the person is in the app shows no banner: the glass says it.
    static func foregroundPresentation(_ tap: HarnessTap) -> UNNotificationPresentationOptions {
        Task { await HarnessCenter.shared.firedInForeground(tap) }
        return []
    }

    /// What the person did with a follow-up notification, as the notification delegate hears it.
    ///  - "Stop": follow-ups go off now, as the switch does, and nothing waits to be opened: iOS
    ///    runs it without bringing the app up.
    ///  - A tap on the notification itself: stored, for the Núcleo to drain.
    ///  - Anything else (it was swiped away): nothing.
    func respond(action: String, tap: HarnessTap, center: HarnessCenter) async {
        switch action {
        case HarnessCategory.stopAction:
            clear()
            await center.stop(tap)
        case UNNotificationDefaultActionIdentifier:
            store(tap)
        default:
            break
        }
    }
}

/// The board a tap or a row asked for, handed to the sheet once.
@MainActor
enum HarnessBoardFocus {
    static var pending: HarnessTap?
    static func take() -> HarnessTap? { defer { pending = nil }; return pending }
}
