// Watches (1.9.x): the phone's state. It asks the server for the list, starts and stops a watch
// on the person's tap, and holds what the screen shows. It decides nothing about the market.
// Invariants:
//  - Nothing is asked of the server before the risk notice is accepted, or without an account.
//  - iOS permission for notifications is asked ONLY inside `start`, which only the Watch button
//    calls. Never at launch, never from a refresh. A watch is not started for someone iOS will
//    not let Bobby tell: the person is told to allow notifications instead.
//  - A door that is not there (`.notOffered`) hides every entry point: `offered` is false and
//    stays false until the next launch or sign-in asks again.
//  - A retry of the same choice reuses its request id, so a lost answer never makes two watches.
//  - What is shown always belongs to whoever uses the phone now: an account change clears it
//    before anything else, and an answer that arrives for the previous account is dropped.
import Combine
import Foundation

@MainActor
final class WatchCenter: ObservableObject {
    static let shared = WatchCenter()

    enum Problem: Equatable {
        case signIn, notifications, limit(Int), unreadable, unavailable
    }

    /// nil until the server answered once for this account.
    @Published private(set) var board: WatchBoard?
    /// False once the server said the door is not there for this person.
    @Published private(set) var offered = true
    @Published private(set) var busy = false
    @Published private(set) var problem: Problem?

    struct Dependencies {
        var api: () -> WatchAPI = { WatchAPI() }
        var riskAccepted: () -> Bool = { UserDefaults.standard.integer(forKey: "agent.riskNoticeVersion") >= RiskNotice.currentVersion }
        var signedIn: () async -> Bool = { await AccountSession.shared.accessToken() != nil }
        /// Asks iOS (the system prompt the first time) and registers this phone; true when Bobby may notify.
        var allowNotifications: @MainActor () async -> Bool = {
            let permission = await PushRegistrar.shared.requestPermission()
            guard permission.allowsDelivery else { return false }
            PushRegistrar.shared.register()
            return true
        }
    }
    private let deps: Dependencies
    /// Grows with every account change: an answer that started before it is dropped.
    private var epoch = 0
    /// The choice being started and the id every attempt of it carries.
    private var pending: (key: String, id: UUID)?

    init(deps: Dependencies = Dependencies()) { self.deps = deps }

    /// Sign-in, sign-out or another account: what was shown belonged to someone else.
    func accountChanged() {
        epoch += 1
        board = nil; problem = nil; busy = false; pending = nil; offered = true
    }

    /// The list, when the person opens the screen or the app comes back.
    func refresh() async {
        guard offered, deps.riskAccepted(), await deps.signedIn() else { return }
        await run { try await $0.board() }
    }

    /// The Watch button. Returns true when the watch is looking.
    @discardableResult
    func start(symbol: String, direction: WatchDirection, percent: Int, days: Int) async -> Bool {
        guard offered, !busy, deps.riskAccepted() else { return false }
        guard await deps.signedIn() else { problem = .signIn; return false }
        if let board, !board.hasRoom { problem = .limit(board.limit); return false }
        busy = true
        let started = epoch
        guard await deps.allowNotifications() else { if started == epoch { busy = false; problem = .notifications }; return false }
        guard started == epoch else { return false }
        busy = false
        let key = "\(symbol.uppercased())|\(direction.rawValue)|\(percent)|\(days)"
        let id = pending?.key == key ? pending!.id : UUID()
        pending = (key, id)
        let done = await run { try await $0.create(symbol: symbol, direction: direction, percent: percent, days: days, requestId: id) }
        // Answered either way but "try again": the next tap of the same choice is a new request.
        if done || (problem != .unavailable && problem != nil) { pending = nil }
        return done
    }

    func stop(_ id: String) async { await run { try await $0.cancel(id) } }

    /// The person opened a met or expired watch.
    func opened(_ id: String) async {
        guard board?.watches.first(where: { $0.id == id })?.seen == false else { return }
        await run { try await $0.seen(id) }
    }

    @discardableResult
    private func run(_ work: @escaping (WatchAPI) async throws -> WatchBoard) async -> Bool {
        guard !busy else { return false }
        busy = true; problem = nil
        let started = epoch, api = deps.api()
        do {
            let next = try await work(api)
            guard started == epoch else { return false }
            board = next; busy = false
            return true
        } catch {
            guard started == epoch else { return false }
            busy = false
            switch error as? WatchError ?? .unavailable {
            case .notOffered: offered = false; board = nil
            case .signInRequired: problem = .signIn
            case .limit: problem = .limit(board?.limit ?? 0)
            case .unreadable: problem = .unreadable
            case .rateLimited, .unavailable: problem = .unavailable
            }
            return false
        }
    }
}
