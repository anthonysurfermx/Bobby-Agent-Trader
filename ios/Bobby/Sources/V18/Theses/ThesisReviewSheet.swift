// Review a thesis (1.8). Before: the thesis in the person's words and one button. During: a calm
// wait. After: where it started and where the evidence stands now (arithmetic done here), Bobby's
// verdict for today, what the evidence supports, challenges and leaves unknown, and, every
// time, what Bobby did not check. Then the person decides: keep it, edit it or archive it.
// The route opens it through `V18Focus.thesisId`.
import AuthenticationServices
import SwiftUI

extension ThesisReviewer.Environment {
    /// The desk request itself, with the bearer it carries (tests replace it and look at both).
    typealias Transport = @MainActor (ThesisReviewRequest, BobbyMeterAuth) async -> NucleoDeskIO.DebateOutcome

    /// The app's real stores, through the session that owns the desk: its consent, its account
    /// fence, its thesis book owner and the bearer its reads carry.
    @MainActor
    static func live(_ session: NucleoSession, transport: @escaping Transport = { request, auth in
        await NucleoDeskIO.debate(symbol: request.symbol, question: request.question, isEquity: request.isEquity,
                                  level: request.level, auth: auth, requestId: request.requestId, thesis: request.thesis)
    }) -> ThesisReviewer.Environment {
        var env = ThesisReviewer.Environment()
        // Whose bearer the read carries is the desk's own rule (signed out and fixture mode included).
        let auth = session.desk.meterAuth
        env.owner = { [weak session] in session?.desk.thesisOwner }
        env.generation = { [weak session] in session?.desk.generation() ?? UUID() }
        env.riskAccepted = { [weak session] in session?.profile.acceptedRiskNotice ?? false }
        env.send = { request in await transport(request, auth) }
        return env
    }
}

struct ThesisReviewSheet: View {
    @ObservedObject var session: NucleoSession
    let onClose: () -> Void
    @StateObject private var reviewer: ThesisReviewer

    init(session: NucleoSession, onClose: @escaping () -> Void) {
        self.session = session
        self.onClose = onClose
        // Evaluated once, when the sheet appears: the hand-off is consumed here and nowhere else.
        _reviewer = StateObject(wrappedValue: ThesisReviewer(thesisId: V18Focus.takeThesisId(), environment: .live(session)))
    }

    var body: some View {
        ThesisReviewView(reviewer: reviewer, actions: ThesisReviewView.Actions(
            canSignIn: !session.fixtures,
            prepareApple: { AccountSession.shared.prepareAppleRequest($0) },
            completeApple: { result in await Self.completeApple(result, session: session) },
            showPro: { session.switchSheet(to: .paywall) },
            showCredits: { session.switchSheet(to: .credits) },
            showTheses: { session.switchSheet(to: .theses) },
            edit: { id in
                V18Focus.thesisId = id
                session.switchSheet(to: .thesisEditor)
            },
            remind: { id in session.openReminders(thesisId: id) },
            close: onClose))
            // A reminder for the thesis on screen has nothing to announce while it is open.
            .onAppear { session.reminderIntent.markOpen(reviewer.thesis?.id) }
            // Closing the sheet cancels a review in flight; its reply, if one still comes, is ignored.
            .onDisappear {
                reviewer.cancel()
                session.reminderIntent.markOpen(nil)
            }
    }

    /// The system Sign in with Apple button finished: `signedIn` | `cancelled` | `failed` | `unavailable`.
    /// Same rules as `NucleoSession.signIn`: never in fixture mode, never before the risk notice.
    @MainActor
    static func completeApple(_ result: Result<ASAuthorization, Error>, session: NucleoSession) async -> String {
        guard !session.fixtures, session.profile.acceptedRiskNotice else { return "unavailable" }
        let account = AccountSession.shared
        await account.completeApple(result)
        if account.isSignedIn {
            await session.signedInFromSheet()
            return "signedIn"
        }
        if case let .failure(error) = result, (error as? ASAuthorizationError)?.code == .canceled {
            account.lastError = nil
            return "cancelled"
        }
        return "failed"
    }
}

/// The review itself, on a reviewer: the sheet above and the review fixtures both show this.
/// V18-DESIGN.md, "Review, before" and "Review, after": the person's words as a short excerpt, one
/// button, and the two lines that say where the words go pinned beside it; afterwards a verdict
/// word, two prices, what was not checked, and three lists that unfold.
struct ThesisReviewView: View {
    struct Actions {
        /// False where there is no Apple to sign in with (fixture mode, review fixtures): the button is shown disabled.
        var canSignIn = false
        /// The system button's request (the app's nonce and scopes).
        var prepareApple: (ASAuthorizationAppleIDRequest) -> Void = { _ in }
        /// `signedIn` | `cancelled` | `failed` | `unavailable`.
        var completeApple: (Result<ASAuthorization, Error>) async -> String = { _ in "unavailable" }
        var showPro: () -> Void = {}
        var showCredits: () -> Void = {}
        var showTheses: () -> Void = {}
        var edit: (String) -> Void = { _ in }
        /// Opens Reminders on this thesis (nil where there is no session: the door is not shown).
        var remind: ((String) -> Void)? = nil
        var close: () -> Void = {}
    }

    @ObservedObject var reviewer: ThesisReviewer
    let actions: Actions
    @State private var signingIn = false
    @State private var signInFailed = false
    /// The past review whose stored lists are open.
    @State private var openReview: String?

    private var result: ThesisReviewResult? {
        if case let .done(result) = reviewer.phase { return result }
        return nil
    }

    private var title: String {
        guard let thesis = reviewer.thesis else { return L.t("Thesis review", "Revisión de tesis") }
        return result == nil ? L.t("Review \(thesis.symbol)", "Revisar \(thesis.symbol)") : thesis.symbol
    }

    /// What a review costs, before it starts: the level it runs at and the one read it uses.
    private var subtitle: String? {
        guard !signingIn, reviewer.phase == .ready, reviewer.thesis != nil else { return nil }
        let level = reviewer.currentLevel.name
        return L.t("\(level) · 1 read", "\(level) · 1 lectura")
    }

    var body: some View {
        QuietSheet(title: title, subtitle: subtitle, closeId: "thesis-review-close", onClose: actions.close,
                   trailing: menu, bottom: startBar) {
            if signingIn {
                ProgressView().tint(Theme.warmMuted).frame(maxWidth: .infinity).padding(.top, 48)
            } else {
                switch reviewer.phase {
                case .ready: before
                case .running: during
                case let .done(result): after(result)
                case let .refused(refusal): refused(refusal)
                }
            }
        }
    }

    /// Everything that is not the one main action: edit, archive, the reminder.
    private var menu: AnyView? {
        guard !signingIn, let thesis = reviewer.thesis else { return nil }
        let done = result != nil
        guard done || reviewer.phase == .ready else { return nil }
        return AnyView(Menu {
            Button(L.t("Edit", "Editar")) {
                if done { if reviewer.decide(.edit) { actions.edit(thesis.id) } } else { actions.edit(thesis.id) }
            }
            if done {
                Button(L.t("Archive", "Archivar")) { if reviewer.decide(.archive) { actions.close() } }
            }
            if let remind = actions.remind {
                Button(ReminderCopy.setReminder) { remind(thesis.id) }
            }
        } label: {
            QuietGlyph(systemImage: "ellipsis")
        }
        .accessibilityLabel(L.t("More options", "Más opciones"))
        .accessibilityIdentifier("thesis-review-menu"))
    }

    // MARK: Before

    @ViewBuilder private var before: some View {
        if let thesis = reviewer.thesis {
            // The person's own words, never rewritten: two lines here, all of them one tap below.
            Text(thesis.hypothesis).quietFont(17).foregroundStyle(Theme.cream).lineSpacing(4).lineLimit(2)
                .padding(.top, 22).padding(.bottom, 10)
                .accessibilityIdentifier("thesis-review-excerpt")
            QuietDisclosure(label: L.t("Your thesis", "Tu tesis"), id: "thesis-review-words") { words(thesis) }
            history(excluding: nil)
        }
    }

    private func words(_ thesis: SavedThesis) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            wordsPart(nil, thesis.hypothesis)
            if !thesis.worry.isEmpty { wordsPart(L.t("What worries you?", "¿Qué te preocupa?"), thesis.worry) }
            if !thesis.changeMind.isEmpty { wordsPart(L.t("What changes your mind?", "¿Qué te haría cambiar?"), thesis.changeMind) }
            if let horizon = thesis.horizon { wordsPart(L.t("Time frame", "Plazo"), ThesisCopy.horizon(horizon)) }
            QuietNote(text: ThesisCopy.reviewedLine(thesis), id: "thesis-review-last")
        }
    }

    private func wordsPart(_ label: String?, _ text: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            if let label { Text(label).quietFont(13, relativeTo: .footnote).foregroundStyle(Theme.warmDim) }
            Text(text).quietFont(15).foregroundStyle(Theme.cream).lineSpacing(3).quietWraps()
        }
        .accessibilityElement(children: .combine)
    }

    /// Pinned under the scroll while the review has not started: where the person's words go,
    /// directly above the button that sends them. Never below the fold, never behind a tap.
    private var startBar: AnyView? {
        guard !signingIn, reviewer.phase == .ready, reviewer.thesis != nil else { return nil }
        return AnyView(VStack(alignment: .leading, spacing: 10) {
            QuietNote(text: ThesisCopy.sentToProviders, id: "thesis-review-providers")
            QuietPrimary(title: L.t("Review now", "Revisar ahora"), id: "thesis-review-start") { reviewer.start() }
        })
    }

    // MARK: During

    private var during: some View {
        VStack(spacing: 14) {
            ProgressView().tint(Theme.warmMuted)
            Text(L.t("Reading price evidence…", "Leyendo evidencia de precio…"))
                .quietFont(15).foregroundStyle(Theme.warmMuted).multilineTextAlignment(.center).quietWraps()
            QuietChip(title: L.t("Cancel", "Cancelar"), id: "thesis-review-cancel") { reviewer.cancel() }
                .padding(.top, 6)
        }
        .frame(maxWidth: .infinity)
        .padding(.top, 56)
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("thesis-review-running")
    }

    // MARK: After

    @ViewBuilder private func after(_ result: ThesisReviewResult) -> some View {
        ThesisVerdictWord(verdict: result.verdict, size: 22)
            .padding(.top, 18)
            .accessibilityIdentifier("thesis-review-verdict")
        if let headline = result.headline {
            Text(headline).quietFont(16).foregroundStyle(Theme.cream).lineSpacing(3).quietWraps()
                .padding(.top, 6)
                .accessibilityIdentifier("thesis-review-headline")
        }
        thenAndNow(result.thenNow).padding(.top, 20)
        // What this review is, and what it did not look at: on the face, every time, in full.
        QuietNote(text: scope(result), id: "thesis-review-not-checked")
            .padding(.top, 16).padding(.bottom, 8)
        if let notes = result.notes {
            evidence(L.t("Supports", "Respalda"), notes.supports, id: "thesis-review-supports")
            evidence(L.t("Challenges", "Cuestiona"), notes.challenges, id: "thesis-review-challenges")
            evidence(L.t("Unknown", "Sin resolver"), notes.unknowns, id: "thesis-review-unknowns")
        } else {
            QuietNote(text: L.t("Evidence lists unavailable.", "Listas de evidencia no disponibles."), id: "thesis-review-lists-unavailable")
                .padding(.vertical, 8)
        }
        history(excluding: result.thesis.lastReview)
        QuietPrimary(title: L.t("Keep thesis", "Mantener tesis"), id: "thesis-review-keep") {
            if reviewer.decide(.keep) { actions.close() }
        }
        .padding(.top, 22)
        Text(ThesisCopy.footer).quietFont(12, relativeTo: .caption).foregroundStyle(Theme.warmDim)
            .frame(maxWidth: .infinity, alignment: .center)
            .padding(.top, 14)
            .accessibilityIdentifier("thesis-review-footer")
    }

    /// "Price evidence only. Not checked: news · earnings · …" with every category, never truncated.
    private func scope(_ result: ThesisReviewResult) -> String {
        let words = result.notChecked.compactMap { ThesisCopy.notCheckedShort($0, isEquity: result.thesis.isEquity) }
        let only = L.t("Price evidence only.", "Solo evidencia de precio.")
        guard !words.isEmpty else { return only }
        return only + " " + L.t("Not checked", "No revisado") + ": " + words.joined(separator: " · ")
    }

    /// Two neutral prices with their dates; the change is arithmetic on the phone and appears only
    /// when the thesis has its own starting price.
    @ViewBuilder private func thenAndNow(_ numbers: ThesisThenNow) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            if let price = numbers.thenPrice {
                figure([L.t("Then", "Antes"), numbers.thenDate.map { ThesisCopy.day($0) }].compactMap { $0 }.joined(separator: " · "),
                       ThesisCopy.price(price), change: nil)
            }
            if let price = numbers.nowPrice {
                figure([L.t("Evidence", "Evidencia"), numbers.asOfDate.map { ThesisCopy.moment($0) }].compactMap { $0 }.joined(separator: " · "),
                       ThesisCopy.price(price), change: numbers.changePct.map { ThesisCopy.percent($0) })
            }
            if numbers.missingStart {
                QuietNote(text: ThesisCopy.noStartingPrice, id: "thesis-review-no-start").padding(.top, 4)
            }
        }
        .accessibilityIdentifier("thesis-review-then-now")
    }

    private func figure(_ label: String, _ value: String, change: String?) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 10) {
            Text(label).quietFont(14, relativeTo: .callout).foregroundStyle(Theme.warmMuted).quietWraps()
            Spacer(minLength: 8)
            if let change {
                Text(change).quietFont(14, relativeTo: .callout).monospacedDigit().foregroundStyle(Theme.warmMuted)
            }
            Text(value).quietFont(16, .medium).monospacedDigit().foregroundStyle(Theme.cream).layoutPriority(1)
        }
        .padding(.vertical, 5)
        .accessibilityElement(children: .combine)
    }

    /// One of the three lists, folded, with its real count. An empty one says so when opened.
    private func evidence(_ title: String, _ items: [String], id: String) -> some View {
        QuietDisclosure(label: title, count: items.count, id: id) {
            VStack(alignment: .leading, spacing: 8) {
                if items.isEmpty {
                    QuietNote(text: L.t("None in this evidence.", "Nada en esta evidencia."))
                }
                ForEach(Array(items.enumerated()), id: \.offset) { _, item in
                    Text(item).quietFont(15).foregroundStyle(Theme.cream).lineSpacing(3).quietWraps()
                }
            }
        }
    }

    // MARK: Past reviews

    @ViewBuilder private func history(excluding current: ThesisRevision?) -> some View {
        let past = reviewer.pastReviews(excluding: current)
        if !past.isEmpty {
            QuietDisclosure(label: L.t("History", "Historial"), count: past.count, id: "thesis-review-history-toggle") {
                VStack(alignment: .leading, spacing: 0) {
                    ForEach(past) { revision in pastRow(revision) }
                }
            }
        }
    }

    /// One past review: its date, price and verdict; a tap opens the three lists it kept, so
    /// everything stored on this phone about a review can be read again.
    @ViewBuilder private func pastRow(_ revision: ThesisRevision) -> some View {
        let open = openReview == revision.id
        Button {
            withAnimation(.easeOut(duration: 0.2)) { openReview = open ? nil : revision.id }
        } label: {
            HStack(alignment: .firstTextBaseline, spacing: 6) {
                Text(pastLine(revision)).quietFont(14, relativeTo: .callout).monospacedDigit().foregroundStyle(Theme.warmMuted).quietWraps()
                Spacer(minLength: 8)
                Image(systemName: open ? "chevron.up" : "chevron.down").font(.system(size: 10, weight: .semibold)).foregroundStyle(Theme.warmDim)
                    .accessibilityHidden(true)
            }
            .frame(minHeight: 44)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .combine)
        .accessibilityValue(open ? L.t("Expanded", "Abierto") : L.t("Collapsed", "Cerrado"))
        .accessibilityIdentifier("thesis-review-past-\(revision.id)")
        if open {
            let lists = ThesisReviewer.storedLists(revision)
            VStack(alignment: .leading, spacing: 6) {
                if lists.isEmpty {
                    QuietNote(text: L.t("No lists were kept for this review.", "No se guardaron listas de esta revisión."))
                }
                ForEach(lists) { list in
                    Text(storedTitle(list.kind)).quietFont(13, relativeTo: .footnote).foregroundStyle(Theme.warmDim).padding(.top, 4)
                    ForEach(Array(list.items.enumerated()), id: \.offset) { _, item in
                        Text(item).quietFont(14, relativeTo: .callout).foregroundStyle(Theme.warmMuted).lineSpacing(3).quietWraps()
                    }
                }
            }
            .padding(.bottom, 10)
            .accessibilityElement(children: .contain)
            .accessibilityIdentifier("thesis-review-past-lists")
        }
    }

    private func storedTitle(_ kind: ThesisReviewer.StoredList.Kind) -> String {
        switch kind {
        case .supports: return L.t("Supports", "Respalda")
        case .challenges: return L.t("Challenges", "Cuestiona")
        case .unknowns: return L.t("Unknown", "Sin resolver")
        }
    }

    /// The date, the price and the verdict of a past review, in plain ink (it is history, not today's reading).
    private func pastLine(_ revision: ThesisRevision) -> String {
        var parts = [ThesisCopy.day(revision.at)]
        if let price = revision.price, price.isFinite, price > 0 { parts.append(ThesisCopy.price(price)) }
        if let word = ThesisCopy.verdictWord(revision.verdict) { parts.append(word) }
        return parts.joined(separator: " · ")
    }

    // MARK: Refused

    @ViewBuilder private func refused(_ refusal: ThesisReviewer.Refusal) -> some View {
        let copy = ThesisRefusalCopy(refusal)
        VStack(alignment: .leading, spacing: 6) {
            Text(copy.text).quietFont(16).foregroundStyle(Theme.cream).lineSpacing(3).quietWraps()
            if let detail = copy.detail { QuietNote(text: detail) }
            if signInFailed {
                QuietNote(text: L.t("Sign-in did not finish. Try again.", "El inicio de sesión no terminó. Inténtalo de nuevo."),
                          id: "thesis-review-signin-failed")
            }
        }
        .padding(.top, 22)
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier("thesis-review-refused")
        VStack(alignment: .leading, spacing: 8) {
            ForEach(Array(copy.actions.enumerated()), id: \.offset) { index, action in
                refusalButton(action, prominent: index == 0)
            }
        }
        .padding(.top, 16)
    }

    @ViewBuilder private func refusalButton(_ action: ThesisRefusalCopy.Action, prominent: Bool) -> some View {
        switch action {
        case .signIn:
            // The system button, in one of Apple's own styles, as on every other sign-in surface of the app.
            SignInWithAppleButton(.continue) { request in
                actions.prepareApple(request)
            } onCompletion: { result in
                signedIn(result)
            }
            .signInWithAppleButtonStyle(.white)
            .frame(height: 50)
            .clipShape(Capsule())
            .disabled(!actions.canSignIn)
            .accessibilityIdentifier("thesis-review-signin")
        case .pro:
            choice(L.t("See Bobby Pro", "Ver Bobby Pro"), prominent, "thesis-review-pro", actions.showPro)
        case .quick:
            let quick = NucleoAnalysisLevel.rapido.name
            choice(L.t("Review with \(quick)", "Revisar con \(quick)"), prominent, "thesis-review-quick") { reviewer.start(level: .rapido) }
        case .retry:
            choice(L.t("Try again", "Reintentar"), prominent, "thesis-review-retry") { reviewer.start() }
        case .credits:
            choice(L.t("See credits", "Ver créditos"), prominent, "thesis-review-credits", actions.showCredits)
        case .myTheses:
            choice(L.t("My theses", "Mis tesis"), prominent, "thesis-review-list", actions.showTheses)
        }
    }

    @ViewBuilder private func choice(_ title: String, _ prominent: Bool, _ id: String, _ action: @escaping () -> Void) -> some View {
        if prominent { QuietPrimary(title: title, id: id, action: action) }
        else { QuietChip(title: title, wide: true, id: id, action: action) }
    }

    private func signedIn(_ result: Result<ASAuthorization, Error>) {
        guard !signingIn else { return }
        signingIn = true
        signInFailed = false
        Task {
            let status = await actions.completeApple(result)
            signingIn = false
            // The account is new: the thesis is read again from that account's book before anything is sent.
            if status == "signedIn" { reviewer.accountChanged() } else { signInFailed = status != "cancelled" }
        }
    }
}
