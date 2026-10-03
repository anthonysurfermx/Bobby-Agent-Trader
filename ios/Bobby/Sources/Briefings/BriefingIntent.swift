// Bobby Pro market briefings — the pending notification tap (build 53).
// A tap can arrive at cold launch, before the Núcleo page is ready, before the account loaded, or while
// a sheet/mic/narration is busy; `emit` drops events before `pageStarted`. So the tap is only STORED here
// and the experience drains it once when it can honour it (NucleoSession pageStarted / app active).
// Invariants: in-memory only (a tap is never replayed on a later launch or foreground), consumed once,
// newest wins, malformed ids are ignored, and an account change clears it (the report fetch re-authorizes
// anyway: a tap for another account can never reveal its report).
import Combine
import Foundation

@MainActor
final class BriefingIntent: ObservableObject {
    static let shared = BriefingIntent()

    /// The briefing id waiting to be opened (lowercase UUID), or nil.
    @Published private(set) var pending: String?
    /// The briefing currently on screen: a foreground push for it is not shown again.
    @Published private(set) var openBriefId: String?

    private var cancellables = Set<AnyCancellable>()

    init(observeAccount: Bool = true) {
        guard observeAccount else { return }
        NotificationCenter.default.publisher(for: AccountSession.didChange, object: AccountSession.shared)
            .receive(on: DispatchQueue.main)
            .sink { [weak self] _ in self?.clear() }
            .store(in: &cancellables)
    }

    /// Store a tapped briefing id. False (and the previous intent kept) when it is not a UUID.
    @discardableResult
    func store(_ raw: Any?) -> Bool {
        guard let id = BriefingJSON.uuid(raw) else { return false }
        pending = id
        return true
    }

    /// The pending id, consumed: a second call returns nil until another tap arrives.
    func take() -> String? {
        defer { pending = nil }
        return pending
    }

    func clear() {
        pending = nil
    }

    /// The report screen says which briefing it shows (nil when it closes).
    func markOpen(_ id: String?) {
        openBriefId = id.flatMap { BriefingJSON.uuid($0) }
    }

    /// The `briefId` of a briefing push payload (`apnsPayload`: generic copy + {briefId} only).
    nonisolated static func briefId(from userInfo: [AnyHashable: Any]) -> String? {
        BriefingJSON.uuid(userInfo["briefId"])
    }
}
