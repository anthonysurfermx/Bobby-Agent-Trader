import Foundation
import Combine

/// Undo belongs to the notes route, not to the lifetime of a child detail view.
/// Nothing here is persisted or included by CompanionContextStore.wire.
@MainActor
final class CompanionNoteUndo: ObservableObject {
    @Published private(set) var note: CompanionContextStore.Note?
    private var staged: CompanionContextStore.Note?
    private var ownerTag: String?
    private(set) var index = 0
    private(set) var deadline: TimeInterval?
    private(set) var generation = UUID()
    private let elapsed: () -> TimeInterval
    init(elapsed: @escaping () -> TimeInterval = { ProcessInfo.processInfo.systemUptime }) { self.elapsed = elapsed }

    func stage(_ note: CompanionContextStore.Note, index: Int, ownerTag: String? = nil) {
        clear(); staged = note; self.index = index; self.ownerTag = ownerTag
    }
    func didDismiss(voiceOver: Bool) {
        guard let staged else { return }
        note = staged; self.staged = nil
        deadline = voiceOver ? nil : elapsed() + 5
        generation = UUID()
    }
    func expire(_ token: UUID) {
        guard token == generation, let deadline, elapsed() >= deadline else { return }
        clear()
    }
    @discardableResult func restore(in store: CompanionContextStore) -> Bool {
        guard ownerTag == store.state.ownerTag else { clear(); return false }
        guard let note else { return false }
        if let deadline, elapsed() >= deadline { clear(); return false }
        guard store.restore(note, at: index) else { return false }
        clear(); return true
    }
    func clear() {
        note = nil; staged = nil; ownerTag = nil; deadline = nil; generation = UUID()
    }

}
