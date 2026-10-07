// Theses written before signing in (1.8). They live in the guest book on this phone (`local`).
// Nothing moves them into an account by itself: the list asks once, in one quiet row, and the
// person answers "Keep them" (they move into this account's book, within its limits) or
// "Not mine" (they stay in the guest book and this account is not asked again).
//
// The rules and the remembered answer live in `ThesisBook` (`pendingLocalCount(for:)`,
// `adoptLocal(into:)`, `declineLocal(for:)`); this is the list's and the reviewer's view of them.
import Foundation

struct ThesisGuestBook {
    let book: ThesisBook

    init(book: ThesisBook = .shared) { self.book = book }

    /// Theses in the guest book this account may still take (0 once it answered, either way).
    func pendingLocalCount(for userId: String) -> Int { book.pendingLocalCount(for: userId) }

    /// "Keep them". Returns how many moved.
    @discardableResult
    func adoptLocal(into userId: String) -> Int { book.adoptLocal(into: userId) }

    /// "Not mine".
    func declineLocal(for userId: String) { book.declineLocal(for: userId) }
}
