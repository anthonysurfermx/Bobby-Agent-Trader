// The harness (1.8): the tapped follow-up. Like a reminder tap (Reminders/ReminderIntent.swift) it
// can arrive at cold launch, before the page is ready or while the mic or a read is busy, so the
// tap is only STORED here and the Núcleo drains it once when it can honour it.
// In memory only (never replayed on a later launch), consumed once, newest wins, and an account
// change clears it.
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
}

/// The board a tap or a row asked for, handed to the sheet once.
@MainActor
enum HarnessBoardFocus {
    static var pending: HarnessTap?
    static func take() -> HarnessTap? { defer { pending = nil }; return pending }
}
