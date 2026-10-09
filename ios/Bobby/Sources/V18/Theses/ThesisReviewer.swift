// Review a thesis (1.8): ONE metered desk read of today's price evidence against the person's
// own words. Invariants:
//  - Nothing is sent before the risk notice is accepted, and the thesis text leaves the phone only
//    inside this request, which the person starts with a tap.
//  - A review is recorded in the thesis book only when the desk delivered an answer. A refusal, a
//    failure or a cancel records nothing and says what happens next in plain words.
//  - The reply is dropped when the account or the book's owner changed while it was in flight.
//  - One review at a time; closing the screen cancels it.
// The desk reads price evidence only (candles, indicators; for crypto also funding and open
// interest). A server that ignores the thesis answers a normal read with no lists: the review is
// still recorded, with empty lists, and the screen labels them as unavailable.
import Combine
import Foundation

/// What one review sends to the desk.
struct ThesisReviewRequest: Equatable, Sendable {
    let symbol: String
    let question: String
    let isEquity: Bool
    let level: NucleoAnalysisLevel
    let requestId: String
    let thesis: ThesisContext
}

/// What a finished review shows.
struct ThesisReviewResult: Equatable {
    /// The thesis after the review was recorded.
    let thesis: SavedThesis
    /// `wait` | `review`.
    let verdict: String
    let headline: String?
    let thenNow: ThesisThenNow
    /// Nil when the server did not sort the evidence against the thesis.
    let notes: ThesisReviewNotes?
    /// Always at least one code (the fixed list when the server sent none).
    let notChecked: [String]
    let level: NucleoAnalysisLevel
}

@MainActor
final class ThesisReviewer: ObservableObject {
    /// Why a review did not run or did not finish. Nothing was recorded in any of these.
    enum Refusal: Equatable {
        case riskNotice
        /// Deleted, or written in another account's book.
        case notFound
        /// Written before signing in: it waits in the guest book until the person keeps it in this account (My theses).
        case writtenSignedOut
        case archived
        /// 401, or a premium level refused for a guest (`level` is that level).
        case signIn(level: NucleoAnalysisLevel?)
        /// 402: the weekly free reads are used. `resets` is when the server says they come back.
        case subscription(resets: Date?)
        /// 403 upgrade_required | level_exhausted: this level is used up for now.
        case levelUsed(level: NucleoAnalysisLevel, resets: Date?)
        /// The spend guard paused this level (`quickWorks`) or every level.
        case paused(level: NucleoAnalysisLevel, quickWorks: Bool)
        case quota
        /// The server said the analysis failed (it refunds a failed analysis) or refused the request before metering.
        case failed
        /// A timeout or a lost connection: the phone cannot know whether the read counted.
        case uncertain
        /// An answer arrived and could not be read: it most likely counted.
        case unreadable
    }

    enum Phase: Equatable {
        case ready
        case running
        case done(ThesisReviewResult)
        case refused(Refusal)
    }

    typealias Send = @MainActor (ThesisReviewRequest) async -> NucleoDeskIO.DebateOutcome

    @MainActor
    struct Environment {
        var book: ThesisBook = .shared
        var owner: () -> String? = { AccountSession.shared.session?.userId }
        var generation: () -> UUID = { AccountSession.shared.generation }
        var riskAccepted: () -> Bool = { UserDefaults.standard.integer(forKey: "agent.riskNoticeVersion") >= RiskNotice.currentVersion }
        var level: () -> NucleoAnalysisLevel = { NucleoLevelCenter.shared.level }
        var now: () -> Date = { Date() }
        var requestId: () -> String = { UUID().uuidString.lowercased() }
        /// The desk request (tests inject a stub; nothing else in this file touches the network).
        var send: Send = { request in
            await NucleoDeskIO.debate(symbol: request.symbol, question: request.question, isEquity: request.isEquity,
                                      level: request.level, auth: .account, speech: SpeakingDial().value(AccountSession.shared.session?.userId), requestId: request.requestId, thesis: request.thesis)
        }
        /// Every access object the server sends updates the credits the app shows, as on the desk.
        var accessChanged: (BobbyReadAccess) -> Void = { BobbyAccessCenter.shared.record($0) }
        var meterChanged: (NucleoAnalysisLevel, NucleoLevelMeter?) -> Void = { level, meter in
            NucleoLevelCenter.shared.meterUpdated(level, meter)
            Task { await NucleoLevelCenter.shared.refresh() }
        }
    }

    let thesisId: String?
    @Published private(set) var thesis: SavedThesis?
    @Published private(set) var phase: Phase = .ready

    private var env: Environment
    private var run = UUID()
    private var task: Task<Void, Never>?
    private var taskId = UUID()
    private var cancellables = Set<AnyCancellable>()

    init(thesisId: String?, environment: Environment? = nil, observeAccount: Bool = true) {
        self.thesisId = thesisId
        env = environment ?? Environment()
        reload()
        guard observeAccount else { return }
        NotificationCenter.default.publisher(for: AccountSession.didChange)
            .receive(on: DispatchQueue.main)
            .sink { [weak self] _ in self?.accountChanged() }
            .store(in: &cancellables)
        // The book changed under the screen (theses written signed out follow the person into a new account).
        NotificationCenter.default.publisher(for: ThesisBook.didChange)
            .receive(on: DispatchQueue.main)
            .sink { [weak self] _ in self?.reload() }
            .store(in: &cancellables)
    }

    var isRunning: Bool { phase == .running }

    /// The level a tap on "Review now" would use.
    var currentLevel: NucleoAnalysisLevel { env.level() }

    // MARK: The thesis on screen

    /// Reads the thesis again from the current owner's book and says so when it cannot be reviewed.
    func reload() {
        thesis = thesisId.flatMap { env.book.thesis(id: $0, owner: env.owner()) }
        // A review in flight, a finished one and a server's refusal stay on screen as they are.
        switch phase {
        case .ready, .refused(.notFound), .refused(.writtenSignedOut), .refused(.archived), .refused(.riskNotice):
            phase = precondition().map(Phase.refused) ?? .ready
        default:
            break
        }
    }

    /// Another account (or none) now: an answer still in flight belongs to nobody on this screen.
    func accountChanged() {
        cancel()
        phase = .ready
        reload()
    }

    private func precondition() -> Refusal? {
        guard let thesis else { return waitsInGuestBook ? .writtenSignedOut : .notFound }
        if thesis.status == .archived { return .archived }
        if !env.riskAccepted() { return .riskNotice }
        return nil
    }

    /// The person signed in on this screen (or elsewhere) and the thesis is one they wrote before:
    /// it is still in the guest book, and My theses asks whether to keep it in this account.
    private var waitsInGuestBook: Bool {
        guard let thesisId, let owner = env.owner(), env.book.thesis(id: thesisId, owner: nil) != nil else { return false }
        return env.book.pendingLocalCount(for: owner) > 0
    }

    // MARK: One review

    /// Starts a review and keeps its task, so closing the screen can cancel it. A second tap while one runs sends nothing.
    func start(level: NucleoAnalysisLevel? = nil) {
        guard !isRunning, task == nil else { return }
        let id = UUID()
        taskId = id
        task = Task { [weak self] in
            await self?.review(level: level)
            if self?.taskId == id { self?.task = nil }
        }
    }

    /// `level` overrides the picked level for this one review ("Review with Quick"); the pick itself is not changed.
    func review(level: NucleoAnalysisLevel? = nil) async {
        guard !isRunning else { return }
        reload()
        if let refusal = precondition() { phase = .refused(refusal); return }
        guard let thesis else { return }
        let level = level ?? env.level()
        let token = UUID()
        run = token
        let generation = env.generation(), owner = env.owner()
        phase = .running
        var words = ThesisContext(thesis)
        // The price the thesis was written at, or none: a later review's price is never sent as its origin.
        words.priceAtSave = ThesisCopy.startingPoint(thesis)?.price
        let request = ThesisReviewRequest(symbol: thesis.symbol, question: ThesisCopy.reviewQuestion(symbol: thesis.symbol),
                                          isEquity: thesis.isEquity, level: level, requestId: env.requestId(), thesis: words)
        let outcome = await env.send(request)
        // Cancelled, superseded, or the account changed while the desk worked: the reply is dropped.
        guard run == token else { return }
        guard env.generation() == generation, env.owner() == owner else {
            phase = .ready
            reload()
            return
        }
        guard !Task.isCancelled else { phase = .ready; return }
        phase = finish(outcome, thesis: thesis, owner: owner, level: level)
    }

    /// Closing the screen or tapping Cancel: the reply, if one still comes, is ignored.
    func cancel() {
        run = UUID()
        taskId = UUID()
        task?.cancel()
        task = nil
        if isRunning { phase = .ready }
    }

    private func finish(_ outcome: NucleoDeskIO.DebateOutcome, thesis: SavedThesis, owner: String?, level: NucleoAnalysisLevel) -> Phase {
        switch outcome {
        case let .ok(debate):
            if let access = debate.access { env.accessChanged(access) }
            if level.isPremium { env.meterChanged(level, nil) }
            let notes = debate.review
            guard let recorded = try? env.book.recordReview(
                id: thesis.id, owner: owner, price: debate.technicals.price, asOf: debate.provenance.asOf, verdict: debate.verdict,
                supports: notes?.supports ?? [], challenges: notes?.challenges ?? [], unknowns: notes?.unknowns ?? [], now: env.now())
            else {
                // Deleted while the desk worked: there is no thesis to attach the review to.
                self.thesis = nil
                return .refused(.notFound)
            }
            self.thesis = recorded
            return .done(ThesisReviewResult(
                thesis: recorded, verdict: debate.verdict, headline: debate.synthesis?.headline,
                thenNow: ThesisThenNow(thesis: thesis, nowPrice: debate.technicals.price, asOf: debate.provenance.asOf),
                notes: notes, notChecked: ThesisCopy.notCheckedCodes(notes?.notChecked, isEquity: thesis.isEquity), level: level))
        case .cancelled:
            return .ready
        case let .gated(status, _, access):
            if let access { env.accessChanged(access) }
            if status == "signin_required" { return .refused(.signIn(level: nil)) }
            return .refused(.subscription(resets: access?.resetsDate))
        case let .levelRefused(code, meter):
            env.meterChanged(level, meter)
            if code == "signin_required" { return .refused(.signIn(level: level)) }
            return .refused(.levelUsed(level: level, resets: meter?.resetsDate))
        case let .budgetPaused(allLevels):
            return .refused(.paused(level: level, quickWorks: !allLevels && level.isPremium))
        case .quota:
            return .refused(.quota)
        case .failed, .tooLong:
            return .refused(.failed)
        case .timeout, .network:
            return .refused(.uncertain)
        case .badResponse:
            return .refused(.unreadable)
        }
    }

    // MARK: After the review

    enum Decision: String { case keep, edit, archive }

    /// What the person decided. `keep` and `archive` are written to the book; `edit` hands over to the editor.
    /// Returns false when the thesis is gone.
    @discardableResult
    func decide(_ decision: Decision) -> Bool {
        guard let thesis else { return false }
        let owner = env.owner()
        do {
            switch decision {
            case .keep: try env.book.keep(id: thesis.id, owner: owner, now: env.now())
            case .archive: try env.book.archive(id: thesis.id, owner: owner, now: env.now())
            case .edit: guard env.book.thesis(id: thesis.id, owner: owner) != nil else { throw ThesisBook.BookError.notFound }
            }
        } catch {
            self.thesis = nil
            phase = .refused(.notFound)
            return false
        }
        ThesisEvents.post(ThesisEvents.reviewed, thesisId: thesis.id, decision: decision.rawValue)
        return true
    }

    /// Past reviews, newest first; `excluding` leaves out the one the screen already shows in full.
    func pastReviews(excluding current: ThesisRevision? = nil) -> [ThesisRevision] {
        (thesis?.revisions ?? []).filter { $0.kind == .reviewed && $0.id != current?.id }.reversed()
    }

    /// One of the three lists a past review kept on this phone.
    struct StoredList: Equatable, Identifiable {
        enum Kind: String { case supports, challenges, unknowns }
        let kind: Kind
        let items: [String]
        var id: String { kind.rawValue }
    }

    /// What a past review kept, so everything stored can be read again. Lists that held nothing are
    /// left out; an empty result means the review kept no lists at all (the screen says so).
    static func storedLists(_ revision: ThesisRevision) -> [StoredList] {
        [StoredList(kind: .supports, items: revision.supports), StoredList(kind: .challenges, items: revision.challenges),
         StoredList(kind: .unknowns, items: revision.unknowns)].filter { !$0.items.isEmpty }
    }

#if DEBUG
    /// Review fixtures only: a recorded state, no request.
    func show(_ phase: Phase) { self.phase = phase }
#endif
}

// MARK: - Words for each refusal

/// One refusal as the screen says it: what happened, what was (not) used, and the next step.
struct ThesisRefusalCopy: Equatable {
    enum Action: Equatable { case signIn, pro, quick, retry, credits, myTheses }

    let text: String
    var detail: String? = nil
    var actions: [Action] = []

    init(_ refusal: ThesisReviewer.Refusal) {
        let quick = NucleoAnalysisLevel.rapido
        switch refusal {
        case .riskNotice:
            text = L.t("Accept the risk notice first: until then Bobby sends nothing to its servers.",
                       "Primero acepta el aviso de riesgo: hasta entonces Bobby no envía nada a sus servidores.")
        case .notFound:
            text = L.t("This thesis is not available in this account.", "Esta tesis no está disponible en esta cuenta.")
            actions = [.myTheses]
        case .writtenSignedOut:
            text = L.t("You wrote this thesis before signing in.", "Escribiste esta tesis antes de iniciar sesión.")
            detail = L.t("Open My theses to keep it in this account.", "Abre Mis tesis para conservarla en esta cuenta.")
            actions = [.myTheses]
        case .archived:
            text = L.t("This thesis is archived. Reopen it to review it.", "Esta tesis está archivada. Reábrela para revisarla.")
            actions = [.myTheses]
        case let .signIn(level):
            if let level, level != quick {
                text = L.t("\(level.name) needs a free account, so this review did not run.",
                           "\(level.name) necesita tu cuenta gratis, así que esta revisión no corrió.")
                actions = [.signIn, .quick]
            } else {
                text = L.t("You used the reads available without an account, so this review did not run.",
                           "Ya usaste las lecturas disponibles sin cuenta, así que esta revisión no corrió.")
                detail = L.t("Sign in with a free account and review it again.", "Entra con tu cuenta gratis y vuelve a revisarla.")
                actions = [.signIn]
            }
        case let .subscription(resets):
            text = L.t("You used your free reads, so this review did not run.",
                       "Ya usaste tus lecturas gratis, así que esta revisión no corrió.")
            detail = resets.map { BobbyAccessAPI.day($0) }.map { L.t("Free reads come back on \($0).", "Las lecturas gratis vuelven el \($0).") }
            actions = [.pro]
        case let .levelUsed(level, resets):
            let day = resets.map { BobbyAccessAPI.day($0) }
            text = day.map { L.t("Your \(level.name) comes back on \($0).", "Tu \(level.name) vuelve el \($0).") }
                ?? L.t("You used your \(level.name) for now.", "Ya usaste tu \(level.name) por ahora.")
            detail = L.t("This review did not run.", "Esta revisión no corrió.")
            actions = level == quick ? [] : [.quick]
        case let .paused(level, quickWorks):
            if quickWorks {
                text = L.t("\(level.name) is paused for today.", "\(level.name) está en pausa por hoy.")
                detail = L.t("Quick still works.", "Rápido sigue disponible.")
                actions = [.quick]
            } else {
                text = L.t("Analysis is paused for now.", "El análisis está en pausa por ahora.")
                detail = L.t("Please try again later.", "Inténtalo más tarde.")
            }
        case .quota:
            text = L.t("Bobby reached today’s analysis limit, so this review did not run.",
                       "Bobby llegó al límite de análisis de hoy, así que esta revisión no corrió.")
            detail = L.t("Please try again later.", "Inténtalo más tarde.")
        case .failed:
            text = L.t("The review did not finish. Nothing was used.", "La revisión no terminó. No se usó nada.")
            actions = [.retry]
        case .uncertain:
            text = L.t("The review did not finish.", "La revisión no terminó.")
            detail = L.t("It may not have counted; check your credits.", "Puede que no haya contado; revisa tus créditos.")
            actions = [.retry, .credits]
        case .unreadable:
            text = L.t("Bobby’s answer could not be read.", "No se pudo leer la respuesta de Bobby.")
            detail = L.t("It may have used a read; check your credits.", "Puede que haya usado una lectura; revisa tus créditos.")
            actions = [.retry, .credits]
        }
    }
}
