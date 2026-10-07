import Combine
import Foundation

struct NewsPushTap: Equatable, Sendable {
    let campaignId: String
    let language: String
}

/// Only an allowlisted native destination is accepted. Payload language is context, never an instruction
/// to change the person's persisted choice. An arbitrary link or screen in a payload cannot be opened.
@MainActor
final class NewsPushIntent: ObservableObject {
    static let shared = NewsPushIntent()
    @Published private(set) var pending: NewsPushTap?
    private var cancellables = Set<AnyCancellable>()

    init(observeAccount: Bool = true) {
        guard observeAccount else { return }
        NotificationCenter.default.publisher(for: AccountSession.didChange, object: AccountSession.shared)
            .sink { [weak self] _ in MainActor.assumeIsolated { self?.pending = nil } }
            .store(in: &cancellables)
    }

    nonisolated static func tap(from info: [AnyHashable: Any]) -> NewsPushTap? {
        guard info["screen"] as? String == "language", let id = info["newsCampaignId"] as? String,
              id.range(of: "^[a-z0-9][a-z0-9-]{0,79}$", options: .regularExpression) != nil,
              let language = info["language"] as? String,
              ["en", "es", "fr", "it", "de", "pt", "pt-BR"].contains(language) else { return nil }
        return NewsPushTap(campaignId: id, language: language)
    }

    @discardableResult
    func store(_ info: [AnyHashable: Any]) -> Bool {
        guard let tap = Self.tap(from: info) else { return false }
        pending = tap
        return true
    }

    func take() -> NewsPushTap? { defer { pending = nil }; return pending }
}
