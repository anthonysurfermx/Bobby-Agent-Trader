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
struct ThesisListView: View {
    @ObservedObject var model: ThesisListModel
    let onReview: (String) -> Void
    let onEdit: (String) -> Void
    /// Opens the editor on a draft from the read with this request id.
    var onWrite: (String) -> Void = { _ in }
    let onClose: () -> Void
    @State private var showsArchived = false
    @State private var deleting: SavedThesis?

    var body: some View {
        ScrollViewReader { proxy in
            ThesisScreen(title: L.t("Theses", "Tesis"), closeId: "theses-close", onClose: onClose) {
                ThesisTitle(text: L.t("My theses", "Mis tesis"))
                if let question = model.guestQuestion { guestRow(question) }
                if model.isEmpty {
                    empty
                    if let read = model.writable { writeRow(read) }
                } else {
                    Text(model.counter).thesisFont(13, relativeTo: .footnote).foregroundStyle(Theme.warmMuted)
                        .padding(.top, 6)
                        .accessibilityIdentifier("theses-counter")
                    if let read = model.writable { writeRow(read) }
                    ForEach(model.active) { thesis in activeBlock(thesis).id(thesis.id) }
                    if !model.archived.isEmpty { archivedSection }
                    Text(ThesisCopy.localOnly).thesisFont(12, relativeTo: .caption).foregroundStyle(Theme.warmDim).thesisWraps()
                        .padding(.top, 26)
                        .accessibilityIdentifier("theses-local-only")
                }
            }
            .onAppear {
                if model.highlightIsArchived { showsArchived = true }
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
    }

    // MARK: Empty

    private var empty: some View {
        Text(L.t("Nothing here yet. Ask Bobby about an asset, save the read, and write down why you are looking at it. Next time, Bobby reviews it with you.",
                 "Todavía no hay nada. Pregúntale a Bobby por un activo, guarda la lectura y escribe por qué lo estás mirando. La próxima vez, Bobby la revisa contigo."))
            .thesisFont(15).foregroundStyle(Theme.warmMuted).lineSpacing(4).thesisWraps()
            .padding(.top, 16)
            .accessibilityIdentifier("theses-empty")
    }

    // MARK: The two quiet rows

    /// Theses written before signing in: asked once, answered by the person.
    private func guestRow(_ question: String) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(question).thesisFont(14, relativeTo: .callout).foregroundStyle(Theme.cream).lineSpacing(3).thesisWraps()
                .accessibilityIdentifier("theses-guest-question")
            ViewThatFits(in: .horizontal) {
                HStack(spacing: 8) { guestActions; Spacer(minLength: 0) }
                VStack(alignment: .leading, spacing: 4) { guestActions }
            }
        }
        .padding(.horizontal, 14).padding(.top, 14).padding(.bottom, 8)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: 16, style: .continuous).fill(Theme.nucleoGlass))
        .padding(.top, 14)
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("theses-guest")
    }

    @ViewBuilder private var guestActions: some View {
        ThesisButton(title: model.guestCount == 1 ? L.t("Keep it", "Mantenerla") : L.t("Keep them", "Conservarlas"), id: "theses-guest-keep") {
            withAnimation(.easeOut(duration: 0.2)) { _ = model.keepGuestTheses() }
        }
        ThesisLink(title: model.guestCount == 1 ? L.t("Not mine", "No es mía") : L.t("Not mine", "No son mías"), id: "theses-guest-decline") {
            withAnimation(.easeOut(duration: 0.2)) { model.declineGuestTheses() }
        }
    }

    /// The read the person last saved has no thesis yet: the editor opens on a draft from it.
    private func writeRow(_ read: NucleoReadSummary) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(L.t("You saved a read on \(read.symbol). Write down why you are looking at it.",
                     "Guardaste una lectura de \(read.symbol). Escribe por qué lo estás mirando."))
                .thesisFont(14, relativeTo: .callout).foregroundStyle(Theme.warmMuted).lineSpacing(3).thesisWraps()
            ThesisButton(title: L.t("Write my \(read.symbol) thesis", "Escribir mi tesis de \(read.symbol)"),
                         prominent: model.isEmpty, id: "theses-write") { onWrite(read.requestId) }
        }
        .padding(.top, 16).padding(.bottom, model.isEmpty ? 0 : 12)
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("theses-write-row")
    }

    // MARK: Active

    private func activeBlock(_ thesis: SavedThesis) -> some View {
        let highlighted = model.highlight == thesis.id
        return VStack(alignment: .leading, spacing: 0) {
            Text(ThesisCopy.title(thesis)).thesisFont(14, .medium, design: .monospaced).foregroundStyle(Theme.cream).thesisWraps()
            Text(thesis.hypothesis).thesisFont(15).foregroundStyle(Theme.cream).lineSpacing(3).lineLimit(2)
                .padding(.top, 6)
            Text(ThesisCopy.sinceLine(thesis)).thesisFont(12.5, relativeTo: .footnote).foregroundStyle(Theme.warmMuted).thesisWraps()
                .padding(.top, 8)
            Text(ThesisCopy.reviewedLine(thesis)).thesisFont(12.5, relativeTo: .footnote)
                .foregroundStyle(model.isOverdue(thesis) ? Theme.cream : Theme.warmDim).thesisWraps()
                .padding(.top, 2)
            // Side by side when they fit; stacked at large text sizes, so no label is ever cut.
            ViewThatFits(in: .horizontal) {
                HStack(spacing: 8) { actions(thesis); Spacer(minLength: 0) }
                VStack(alignment: .leading, spacing: 4) { actions(thesis) }
            }
            .padding(.top, 12)
        }
        .padding(.vertical, 16)
        .padding(.horizontal, highlighted ? 14 : 0)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: 16, style: .continuous).fill(highlighted ? Theme.nucleoGlass : Color.clear))
        .overlay(alignment: .top) { if !highlighted { Rectangle().fill(Theme.warmHair).frame(height: 1) } }
        .padding(.top, highlighted ? 12 : 0)
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("theses-active-\(thesis.symbol)")
    }

    /// Review and Edit are the two actions; Archive is the quiet way out that costs no read
    /// (an archived thesis can then be deleted, so nothing kept here is ever stuck).
    @ViewBuilder private func actions(_ thesis: SavedThesis) -> some View {
        ThesisButton(title: L.t("Review", "Revisar"), prominent: true, id: "theses-review-\(thesis.symbol)") { onReview(thesis.id) }
            .accessibilityLabel(L.t("Review \(thesis.symbol)", "Revisar \(thesis.symbol)"))
        ThesisButton(title: L.t("Edit", "Editar"), id: "theses-edit-\(thesis.symbol)") { onEdit(thesis.id) }
            .accessibilityLabel(L.t("Edit \(thesis.symbol)", "Editar \(thesis.symbol)"))
        ThesisLink(title: L.t("Archive", "Archivar"), id: "theses-archive-\(thesis.symbol)") {
            withAnimation(.easeOut(duration: 0.2)) { model.archive(thesis.id) }
        }
        .accessibilityLabel(L.t("Archive \(thesis.symbol)", "Archivar \(thesis.symbol)"))
    }

    // MARK: Archived

    @ViewBuilder private var archivedSection: some View {
        Button {
            withAnimation(.easeOut(duration: 0.2)) { showsArchived.toggle() }
        } label: {
            HStack(spacing: 8) {
                Text((L.t("Archived", "Archivadas") + " · \(model.archived.count)").uppercased())
                    .thesisFont(11, .medium, design: .monospaced, relativeTo: .caption).tracking(1.4).foregroundStyle(Theme.warmDim)
                Image(systemName: showsArchived ? "chevron.up" : "chevron.down").font(.system(size: 10, weight: .semibold)).foregroundStyle(Theme.warmDim)
                Spacer(minLength: 0)
            }
            .frame(minHeight: 44)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .padding(.top, 18)
        .accessibilityLabel(L.t("Archived", "Archivadas") + ", \(model.archived.count)")
        .accessibilityValue(showsArchived ? L.t("Expanded", "Desplegado") : L.t("Collapsed", "Plegado"))
        .accessibilityIdentifier("theses-archived-toggle")
        if showsArchived {
            if let problem = model.problemText() {
                Text(problem).thesisFont(13, .medium, relativeTo: .footnote).foregroundStyle(Theme.cream).thesisWraps()
                    .padding(.bottom, 8)
                    .accessibilityIdentifier("theses-reopen-problem")
            }
            ForEach(model.archived) { thesis in archivedRow(thesis).id(thesis.id) }
        }
    }

    private func archivedRow(_ thesis: SavedThesis) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(ThesisCopy.title(thesis)).thesisFont(14, .medium, design: .monospaced).foregroundStyle(Theme.warmMuted).thesisWraps()
            Text(thesis.hypothesis).thesisFont(13.5, relativeTo: .footnote).foregroundStyle(Theme.warmMuted).lineSpacing(2).lineLimit(2)
                .padding(.top, 4)
            HStack(spacing: 8) {
                ThesisLink(title: L.t("Reopen", "Reabrir"), tint: Theme.cream, id: "theses-reopen-\(thesis.symbol)") { model.reopen(thesis.id) }
                    .accessibilityLabel(L.t("Reopen \(thesis.symbol)", "Reabrir \(thesis.symbol)"))
                ThesisLink(title: L.t("Delete", "Eliminar"), id: "theses-delete-\(thesis.symbol)") { deleting = thesis }
                    .accessibilityLabel(L.t("Delete \(thesis.symbol)", "Eliminar \(thesis.symbol)"))
                Spacer(minLength: 0)
            }
            .padding(.top, 4)
        }
        .padding(.vertical, 10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .overlay(alignment: .top) { Rectangle().fill(Theme.warmHair).frame(height: 1) }
        .background(RoundedRectangle(cornerRadius: 12, style: .continuous).fill(model.highlight == thesis.id ? Theme.nucleoGlass : Color.clear))
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("theses-archived-\(thesis.symbol)")
    }
}
