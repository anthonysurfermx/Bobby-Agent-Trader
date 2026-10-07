// Theses written before signing in (1.8). They live in the guest book on this phone (`local`).
// Nothing moves them into an account by itself: the list asks once, in one quiet row, and the
// person answers "Keep them" (they move into this account's book) or "Not mine" (they stay in
// the guest book, hidden from this account, and are there again when nobody is signed in).
//
// CONTRACT (lead): the thesis model is to expose `ThesisBook.pendingLocalCount(for:)` and
// `ThesisBook.declineLocal(for:)` next to `adoptLocal(into:)`. They were not in this track's tree,
// and `ThesisBook`'s store is private to its file, so this adapter carries the same three names
// with the same signatures. When the model has them, delete this file and let `ThesisListModel`
// and `ThesisReviewer` call the book directly (their call sites already read
// `pendingLocalCount(for:)`, `adoptLocal(into:)` and `declineLocal(for:)`).
import Foundation

struct ThesisGuestBook {
    let book: ThesisBook
    /// Where "Not mine" is remembered, per account.
    let defaults: UserDefaults

    init(book: ThesisBook = .shared, defaults: UserDefaults = .standard) {
        self.book = book
        self.defaults = defaults
    }

    static func declinedKey(_ userId: String) -> String { "v18.theses.guestDeclined." + userId }

    /// Theses in the guest book that this account may still take: none once the person said
    /// "Not mine", and none when the account already has theses (books are never merged).
    func pendingLocalCount(for userId: String) -> Int {
        guard !defaults.bool(forKey: Self.declinedKey(userId)), book.all(owner: userId).isEmpty else { return 0 }
        return book.all(owner: nil).count
    }

    /// "Keep them": the guest theses move into this account's book. Returns how many moved.
    @discardableResult
    func adoptLocal(into userId: String) -> Int { book.adoptLocal(into: userId) }

    /// "Not mine": they stay in the guest book and this account is not asked again.
    func declineLocal(for userId: String) {
        defaults.set(true, forKey: Self.declinedKey(userId))
    }
}
