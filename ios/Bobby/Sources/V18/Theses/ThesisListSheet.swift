// My theses (1.8). The active ones first (three at most), each with its two actions: review it
// with Bobby, or edit the words. Archived ones wait folded underneath and can be reopened or
// deleted. Two quiet rows may sit on top: theses written before signing in ("Keep them" /
// "Not mine"), and a way to write a thesis from the read the person last saved, so the offer on
// the glass is not the only door. Everything on this screen is read from the thesis book on this
// phone; nothing here touches the network.
import Combine
import SwiftUI

@MainActor
final class ThesisListModel: ObservableObject {
    /// Why a reopen did not happen.
    enum Problem: Equatable {
        case limitReached
        case alreadyActive(symbol: String)
    }

    @Published private(set) var active: [SavedThesis] = []
    @Published private(set) var archived: [SavedThesis] = []
    @Published private(set) var problem: Problem?
    /// The thesis a reminder or a row handed over: the list scrolls to it and marks it.
    @Published private(set) var highlight: String?
    /// Theses written before signing in that this account has not answered for yet (0: no row).
    @Published private(set) var guestCount = 0
    /// The read the person last saved, when the desk still holds it and its asset has no active thesis.
    @Published private(set) var writable: NucleoReadSummary?

    private let book: ThesisBook
    private let guests: ThesisGuestBook
    private let owner: @MainActor () -> String?
    private let lastSavedRead: @MainActor () -> NucleoReadSummary?
    private let now: () -> Date
    private var cancellables = Set<AnyCancellable>()

    init(book: ThesisBook = .shared, guests: ThesisGuestBook? = nil,
         owner: @escaping @MainActor () -> String? = { AccountSession.shared.session?.userId },
         highlight: String? = nil, lastSavedRead: @escaping @MainActor () -> NucleoReadSummary? = { nil },
         now: @escaping () -> Date = { Date() }, observe: Bool = true) {
        self.book = book
        self.guests = guests ?? ThesisGuestBook(book: book)
        self.owner = owner
        self.lastSavedRead = lastSavedRead
        self.now = now
        self.highlight = highlight
        reload()
        guard observe else { return }
        // The book changed (a save, a review, another screen) or the account did: read it again.
        NotificationCenter.default.publisher(for: ThesisBook.didChange)
            .merge(with: NotificationCenter.default.publisher(for: AccountSession.didChange))
            .receive(on: DispatchQueue.main)
            .sink { [weak self] _ in self?.reload() }
            .store(in: &cancellables)
    }

    var isEmpty: Bool { active.isEmpty && archived.isEmpty }
    var counter: String {
        L.t("\(active.count) of \(ThesisBook.activeLimit) active", "\(active.count) de \(ThesisBook.activeLimit) activas")
    }

    func reload() {
        let owner = owner()
        active = book.active(owner: owner)
        archived = book.archived(owner: owner)
        if let highlight, book.thesis(id: highlight, owner: owner) == nil { self.highlight = nil }
        guestCount = owner.map { guests.pendingLocalCount(for: $0) } ?? 0
        writable = lastSavedRead().flatMap { read in book.activeThesis(symbol: read.symbol, owner: owner) == nil ? read : nil }
    }

    // MARK: Theses written before signing in

    /// "You wrote 2 theses before signing in. Keep them in this account?"
    var guestQuestion: String? {
        guard guestCount > 0 else { return nil }
        return guestCount == 1
            ? L.t("You wrote 1 thesis before signing in. Keep it in this account?",
                  "Escribiste 1 tesis antes de iniciar sesión. ¿La conservas en esta cuenta?")
            : L.t("You wrote \(guestCount) theses before signing in. Keep them in this account?",
                  "Escribiste \(guestCount) tesis antes de iniciar sesión. ¿Las conservas en esta cuenta?")
    }

    /// "Keep them": the guest theses move into this account's book. Signed out there is no account to move them to.
    @discardableResult
    func keepGuestTheses() -> Int {
        guard let owner = owner() else { return 0 }
        let moved = guests.adoptLocal(into: owner)
        reload()
        return moved
    }

    /// "Not mine": they stay in the guest book, and this account is not asked again.
    func declineGuestTheses() {
        guard let owner = owner() else { return }
        guests.declineLocal(for: owner)
        reload()
    }

    /// The highlighted thesis sits in the folded section: the section opens for it.
    var highlightIsArchived: Bool { highlight.map { id in archived.contains { $0.id == id } } ?? false }

    func isOverdue(_ thesis: SavedThesis) -> Bool {
        ThesisCopy.days(from: thesis.lastReviewedAt ?? thesis.createdAt, to: now()) >= ThesisNudges.dueAfterDays
    }

    @discardableResult
    func reopen(_ id: String) -> Bool {
        let owner = owner()
        do {
            try book.reactivate(id: id, owner: owner, now: now())
            problem = nil
            highlight = id
            reload()
            return true
        } catch ThesisBook.BookError.limitReached {
            problem = .limitReached
        } catch let ThesisBook.BookError.alreadyActive(existing) {
            problem = .alreadyActive(symbol: book.thesis(id: existing, owner: owner)?.symbol ?? "")
        } catch {
            problem = nil
            reload()
        }
        return false
    }

    func archive(_ id: String) {
        _ = try? book.archive(id: id, owner: owner(), now: now())
        problem = nil
        reload()
    }

    /// For good, from this phone. The screen asks once before calling this.
    func delete(_ id: String) {
        book.delete(id: id, owner: owner())
        problem = nil
        reload()
    }

    func problemText() -> String? {
        switch problem {
        case .limitReached?:
            return L.t("Three theses are active already. Archive one first.", "Ya hay tres tesis activas. Archiva una primero.")
        case let .alreadyActive(symbol)?:
            return L.t("You already have a thesis on \(symbol).", "Ya tienes una tesis sobre \(symbol).")
        case nil:
            return nil
        }
    }
}

struct ThesisListSheet: View {
    @ObservedObject var session: NucleoSession
    let onClose: () -> Void
    @StateObject private var model: ThesisListModel

    init(session: NucleoSession, onClose: @escaping () -> Void) {
        self.session = session
        self.onClose = onClose
        // Evaluated once, when the sheet appears: a reminder tap's thesis is consumed here.
        _model = StateObject(wrappedValue: ThesisListModel(owner: { [weak session] in session?.desk.thesisOwner },
                                                           highlight: V18Focus.takeThesisId(),
                                                           lastSavedRead: { [weak session] in Self.lastSavedRead(session) }))
    }

    /// The read the person last saved in this launch, while the desk still holds it for this account.
    @MainActor
    static func lastSavedRead(_ session: NucleoSession?, center: NudgeCenter? = nil) -> NucleoReadSummary? {
        guard let session, let read = (center ?? .shared).lastRead, read.saved else { return nil }
        return session.desk.readSummary(requestId: read.requestId)
    }

    var body: some View {
        ThesisListView(model: model,
                       onReview: { id in
                           V18Focus.thesisId = id
                           session.switchSheet(to: .thesisReview)
                       },
                       onEdit: { id in
                           V18Focus.thesisId = id
                           session.switchSheet(to: .thesisEditor)
                       },
                       onWrite: { requestId in
                           V18Focus.clear()
                           V18Focus.draftRequestId = requestId
                           session.switchSheet(to: .thesisEditor)
                       },
                       onClose: onClose)
    }
}

/// The list itself, on a model: the sheet above and the review fixtures both show this.
/// V18-DESIGN.md, "My theses": a row is an asset and where its review stands. A tap opens the
/// review (which sends nothing by itself); edit and archive are in the row's menu.
struct ThesisListView: View {
    @ObservedObject var model: ThesisListModel
    let onReview: (String) -> Void
    let onEdit: (String) -> Void
    /// Opens the editor on a draft from the read with this request id.
    var onWrite: (String) -> Void = { _ in }
    let onClose: () -> Void
    @State private var deleting: SavedThesis?
    @State private var showsDetails = false

    var body: some View {
        ScrollViewReader { proxy in
            QuietSheet(title: L.t("My theses", "Mis tesis"), closeId: "theses-close", onClose: onClose,
                       onInfo: { showsDetails = true }) {
                VStack(alignment: .leading, spacing: 0) {
                    if model.guestCount > 0 {
                        guestRow
                    } else if model.isEmpty {
                        empty
                    }
                    if let read = model.writable { writeDoor(read) }
                    ForEach(model.active) { thesis in activeRow(thesis).id(thesis.id) }
                    if !model.archived.isEmpty { archivedSection }
                }
                .padding(.top, 14)
            }
            .onAppear {
                guard let id = model.highlight else { return }
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.35) { withAnimation(.easeOut(duration: 0.3)) { proxy.scrollTo(id, anchor: .top) } }
            }
        }
        .confirmationDialog(L.t("Delete this thesis? It is removed from this iPhone for good.",
                                "¿Eliminar esta tesis? Se borra de este iPhone para siempre."),
                            isPresented: Binding(get: { deleting != nil }, set: { if !$0 { deleting = nil } }),
                            titleVisibility: .visible) {
            Button(L.t("Delete", "Eliminar"), role: .destructive) {
                if let thesis = deleting { model.delete(thesis.id) }
                deleting = nil
            }
            Button(L.t("Cancel", "Cancelar"), role: .cancel) { deleting = nil }
        }
        .sheet(isPresented: $showsDetails) {
            QuietSheet(title: L.t("Details", "Detalles"), closeId: "theses-details-close", onClose: { showsDetails = false }) {
                QuietNote(text: ThesisCopy.localOnly, id: "theses-local-only").padding(.top, 16)
            }
            .presentationDetents([.medium])
            .presentationDragIndicator(.visible)
            .presentationBackground(Theme.nucleoSurface)
        }
    }

    // MARK: Empty

    private var empty: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(L.t("No theses yet.", "Aún no hay tesis.")).quietFont(16).foregroundStyle(Theme.cream)
            QuietNote(text: L.t("Start with a saved read.", "Empieza con una lectura guardada."))
        }
        .padding(.top, 8).padding(.bottom, 10)
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier("theses-empty")
    }

    // MARK: The two quiet rows

    /// Theses written before signing in: asked once, answered by the person. Two choices of equal weight.
    private var guestRow: some View {
        let one = model.guestCount == 1
        return VStack(alignment: .leading, spacing: 6) {
            Text(one ? L.t("1 guest thesis", "1 tesis sin cuenta")
                     : L.t("\(model.guestCount) guest theses", "\(model.guestCount) tesis sin cuenta"))
                .quietFont(16).foregroundStyle(Theme.cream)
            QuietNote(text: one ? L.t("Keep it in this account?", "¿Conservarla en esta cuenta?")
                                : L.t("Keep them in this account?", "¿Conservarlas en esta cuenta?"),
                      id: "theses-guest-question")
            HStack(spacing: 10) {
                QuietChip(title: one ? L.t("Keep it", "Conservarla") : L.t("Keep them", "Conservarlas"), wide: true, id: "theses-guest-keep") {
                    withAnimation(.easeOut(duration: 0.2)) { _ = model.keepGuestTheses() }
                }
                QuietChip(title: one ? L.t("Not mine", "No es mía") : L.t("Not mine", "No son mías"), wide: true, id: "theses-guest-decline") {
                    withAnimation(.easeOut(duration: 0.2)) { model.declineGuestTheses() }
                }
            }
            .padding(.top, 6)
        }
        .padding(.top, 8).padding(.bottom, 14)
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("theses-guest")
    }

    /// The read the person last saved has no thesis yet: the editor opens on a draft from it.
    @ViewBuilder private func writeDoor(_ read: NucleoReadSummary) -> some View {
        let title = L.t("Write thesis", "Escribir tesis") + " · " + read.symbol
        if model.isEmpty {
            QuietPrimary(title: title, id: "theses-write") { onWrite(read.requestId) }.padding(.top, 8).padding(.bottom, 6)
        } else {
            QuietLink(title: title, systemImage: "square.and.pencil", id: "theses-write") { onWrite(read.requestId) }
        }
    }

    // MARK: Active

    /// "Review · Sep 23" once reviewed (the verdict is history here: plain ink), "Not reviewed · Oct 4" before.
    private func state(_ thesis: SavedThesis) -> String {
        if let last = thesis.lastReviewedAt {
            return [ThesisCopy.verdictWord(thesis.lastReview?.verdict), ThesisCopy.day(last)].compactMap { $0 }.joined(separator: " · ")
        }
        return L.t("Not reviewed", "Sin revisar") + " · " + ThesisCopy.day(thesis.createdAt)
    }

    private func activeRow(_ thesis: SavedThesis) -> some View {
        let highlighted = model.highlight == thesis.id
        return VStack(spacing: 0) {
            HStack(spacing: 4) {
                Button { onReview(thesis.id) } label: {
                    HStack(alignment: .firstTextBaseline, spacing: 10) {
                        Text(thesis.symbol).quietFont(17, highlighted ? .medium : .regular).foregroundStyle(Theme.cream)
                        Spacer(minLength: 12)
                        Text(state(thesis)).quietFont(14, relativeTo: .callout).monospacedDigit()
                            .foregroundStyle(model.isOverdue(thesis) ? Theme.cream : Theme.warmMuted)
                            .multilineTextAlignment(.trailing)
                    }
                    .frame(minHeight: 56)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel(L.t("Review \(thesis.symbol)", "Revisar \(thesis.symbol)") + ". " + state(thesis))
                .accessibilityIdentifier("theses-review-\(thesis.symbol)")
                Menu {
                    Button(L.t("Edit", "Editar")) { onEdit(thesis.id) }
                    Button(L.t("Archive", "Archivar")) { withAnimation(.easeOut(duration: 0.2)) { model.archive(thesis.id) } }
                } label: {
                    QuietGlyph(systemImage: "ellipsis")
                }
                .accessibilityLabel(L.t("More options", "Más opciones") + ", " + thesis.symbol)
                .accessibilityIdentifier("theses-menu-\(thesis.symbol)")
            }
            Rectangle().fill(Theme.warmHair).frame(height: 1)
        }
        .padding(.trailing, -7)
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("theses-active-\(thesis.symbol)")
    }

    // MARK: Archived

    private var archivedSection: some View {
        QuietDisclosure(label: L.t("Archived", "Archivadas"), count: model.archived.count, open: model.highlightIsArchived,
                        id: "theses-archived-toggle") {
            VStack(alignment: .leading, spacing: 0) {
                if let problem = model.problemText() {
                    QuietNote(text: problem, id: "theses-reopen-problem").padding(.bottom, 6)
                }
                ForEach(model.archived) { thesis in archivedRow(thesis).id(thesis.id) }
            }
        }
    }

    private func archivedRow(_ thesis: SavedThesis) -> some View {
        HStack(spacing: 4) {
            Text(thesis.symbol).quietFont(16).foregroundStyle(Theme.warmMuted)
            Spacer(minLength: 12)
            Menu {
                Button(L.t("Reopen", "Reabrir")) { model.reopen(thesis.id) }
                Button(L.t("Delete", "Eliminar"), role: .destructive) { deleting = thesis }
            } label: {
                QuietGlyph(systemImage: "ellipsis")
            }
            .accessibilityLabel(L.t("More options", "Más opciones") + ", " + thesis.symbol)
            .accessibilityIdentifier("theses-menu-\(thesis.symbol)")
        }
        .frame(minHeight: 48)
        .padding(.trailing, -7)
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("theses-archived-\(thesis.symbol)")
    }
}
