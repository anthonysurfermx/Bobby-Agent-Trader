// Review a thesis (1.8). Before: the thesis in the person's words and one button. During: a calm
// wait. After: where it started and where the evidence stands now (arithmetic done here), Bobby's
// verdict for today, what the evidence supports, challenges and leaves unknown, and, every
// time, what Bobby did not check. Then the person decides: keep it, edit it or archive it.
// The route opens it through `V18Focus.thesisId`.
import SwiftUI

extension ThesisReviewer.Environment {
    /// The app's real stores, through the session that owns the desk.
    @MainActor
    static func live(_ session: NucleoSession) -> ThesisReviewer.Environment {
        var env = ThesisReviewer.Environment()
        // Whose bearer the read carries is the desk's own rule (signed out and fixture mode included).
        let auth = session.desk.meterAuth
        env.owner = { [weak session] in session?.desk.thesisOwner }
        env.generation = { [weak session] in session?.desk.generation() ?? UUID() }
        env.riskAccepted = { [weak session] in session?.profile.acceptedRiskNotice ?? false }
        env.send = { request in
            await NucleoDeskIO.debate(symbol: request.symbol, question: request.question, isEquity: request.isEquity,
                                      level: request.level, auth: auth, requestId: request.requestId, thesis: request.thesis)
        }
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
            signIn: { await session.signIn() },
            showPro: { session.switchSheet(to: .paywall) },
            showCredits: { session.switchSheet(to: .credits) },
            showTheses: { session.switchSheet(to: .theses) },
            edit: { id in
                V18Focus.thesisId = id
                session.switchSheet(to: .thesisEditor)
            },
            close: onClose))
            // Closing the sheet cancels a review in flight; its reply, if one still comes, is ignored.
            .onDisappear { reviewer.cancel() }
    }
}

/// The review itself, on a reviewer: the sheet above and the review fixtures both show this.
struct ThesisReviewView: View {
    struct Actions {
        /// `signedIn` | `cancelled` | `failed` | `unavailable` (NucleoSession.signIn).
        var signIn: () async -> String = { "unavailable" }
        var showPro: () -> Void = {}
        var showCredits: () -> Void = {}
        var showTheses: () -> Void = {}
        var edit: (String) -> Void = { _ in }
        var close: () -> Void = {}
    }

    @ObservedObject var reviewer: ThesisReviewer
    let actions: Actions
    @State private var signingIn = false
    @State private var signInFailed = false
    @State private var showsHistory = false

    var body: some View {
        ThesisScreen(title: L.t("Thesis review", "Revisión de tesis"), closeId: "thesis-review-close", onClose: actions.close) {
            if let thesis = reviewer.thesis {
                ThesisTitle(text: L.t("Your \(thesis.symbol) thesis", "Tu tesis sobre \(thesis.symbol)"))
                if thesis.name.caseInsensitiveCompare(thesis.symbol) != .orderedSame, !thesis.name.isEmpty {
                    Text(thesis.name).thesisFont(13, relativeTo: .footnote).foregroundStyle(Theme.warmMuted).thesisWraps().padding(.top, 2)
                }
            } else {
                ThesisTitle(text: L.t("Thesis review", "Revisión de tesis"))
            }
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

    // MARK: Before

    @ViewBuilder private var before: some View {
        if let thesis = reviewer.thesis {
            ThesisWordsView(thesis: thesis)
            Text(ThesisCopy.reviewedLine(thesis)).thesisFont(12.5, relativeTo: .footnote).foregroundStyle(Theme.warmDim).thesisWraps()
                .padding(.top, 18)
                .accessibilityIdentifier("thesis-review-last")
            Text(L.t("Bobby will read today’s price evidence against your words. A review uses one read.",
                     "Bobby leerá la evidencia de precio de hoy frente a tus palabras. Una revisión usa una lectura."))
                .thesisFont(14, relativeTo: .callout).foregroundStyle(Theme.warmMuted).lineSpacing(3).thesisWraps()
                .padding(.top, 10)
                .accessibilityIdentifier("thesis-review-cost")
            ThesisButton(title: L.t("Review now", "Revisar ahora"), prominent: true, wide: true, id: "thesis-review-start") { reviewer.start() }
                .padding(.top, 16)
            Text(L.t("It runs at your current level: \(reviewer.currentLevel.name).", "Corre en tu nivel actual: \(reviewer.currentLevel.name)."))
                .thesisFont(12, relativeTo: .caption).foregroundStyle(Theme.warmDim).thesisWraps()
                .frame(maxWidth: .infinity, alignment: .center)
                .padding(.top, 8)
                .accessibilityIdentifier("thesis-review-level")
            history(excluding: nil)
        }
    }

    // MARK: During

    private var during: some View {
        VStack(spacing: 14) {
            ProgressView().tint(Theme.warmMuted)
            Text(L.t("Reading today’s evidence…", "Leyendo la evidencia de hoy…"))
                .thesisFont(15).foregroundStyle(Theme.warmMuted).multilineTextAlignment(.center).thesisWraps()
            ThesisButton(title: L.t("Cancel", "Cancelar"), id: "thesis-review-cancel") { reviewer.cancel() }
                .padding(.top, 6)
        }
        .frame(maxWidth: .infinity)
        .padding(.top, 56)
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("thesis-review-running")
    }

    // MARK: After

    @ViewBuilder private func after(_ result: ThesisReviewResult) -> some View {
        Text(result.thesis.hypothesis).thesisFont(14, relativeTo: .callout).foregroundStyle(Theme.warmMuted).lineSpacing(3).lineLimit(3)
            .padding(.top, 10)
            .accessibilityLabel(L.t("Why I am looking at this", "Por qué lo estoy mirando") + ": " + result.thesis.hypothesis)
        thenAndNow(result.thenNow)
        ThesisLabel(text: L.t("Bobby’s read today", "La lectura de Bobby hoy"))
        ThesisVerdictWord(verdict: result.verdict, size: 20)
            .accessibilityIdentifier("thesis-review-verdict")
        if let headline = result.headline {
            Text(headline).thesisFont(15).foregroundStyle(Theme.cream).lineSpacing(3).thesisWraps()
                .padding(.top, 6)
                .accessibilityIdentifier("thesis-review-headline")
        }
        if result.notes == nil {
            ThesisNote(text: L.t("Bobby could not sort today’s evidence into these three lists this time. Its read for today is above.",
                                 "Esta vez Bobby no pudo ordenar la evidencia de hoy en estas tres listas. Su lectura de hoy está arriba."))
                .padding(.top, 20)
                .accessibilityIdentifier("thesis-review-lists-unavailable")
        }
        list(L.t("Supports your thesis", "Respalda tu tesis"), result.notes?.supports, id: "thesis-review-supports")
        list(L.t("Challenges it", "La cuestiona"), result.notes?.challenges, id: "thesis-review-challenges")
        list(L.t("Still unknown", "Sigue sin saberse"), result.notes?.unknowns, id: "thesis-review-unknowns")
        notChecked(result)
        decide(result)
        history(excluding: result.thesis.lastReview)
        Text(ThesisCopy.footer.uppercased()).thesisFont(10.5, design: .monospaced, relativeTo: .caption2).tracking(0.8)
            .foregroundStyle(Theme.warmDim).multilineTextAlignment(.center).thesisWraps()
            .frame(maxWidth: .infinity, alignment: .center)
            .padding(.top, 26)
            .accessibilityIdentifier("thesis-review-footer")
    }

    @ViewBuilder private func thenAndNow(_ numbers: ThesisThenNow) -> some View {
        if !numbers.isEmpty {
            VStack(alignment: .leading, spacing: 0) {
                ThesisLabel(text: L.t("Then and now", "Antes y ahora"))
                if let price = numbers.thenPrice {
                    let day = numbers.thenDate.map { ThesisCopy.day($0) }
                    figure(day.map { L.t("Started \($0)", "Empezó el \($0)") } ?? L.t("Starting point", "Punto de partida"), ThesisCopy.price(price))
                }
                if let price = numbers.nowPrice {
                    let moment = numbers.asOfDate.map { ThesisCopy.moment($0) }
                    figure(moment.map { L.t("Evidence dated \($0)", "Evidencia con fecha \($0)") } ?? L.t("Latest evidence", "Evidencia más reciente"),
                           ThesisCopy.price(price))
                }
                // Computed on this phone from the two prices above; left out when either is missing.
                if let change = numbers.changePct {
                    figure(L.t("Change since then", "Cambio desde entonces"), ThesisCopy.percent(change))
                }
            }
            .accessibilityIdentifier("thesis-review-then-now")
        }
    }

    private func figure(_ label: String, _ value: String) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 12) {
            Text(label).thesisFont(13.5, relativeTo: .footnote).foregroundStyle(Theme.warmMuted).thesisWraps()
            Spacer(minLength: 8)
            Text(value).thesisFont(15, .medium, design: .monospaced).foregroundStyle(Theme.cream).layoutPriority(1)
        }
        .padding(.vertical, 5)
        .accessibilityElement(children: .combine)
    }

    /// One of the three lists. `nil` means the server did not sort the evidence: the list is labelled
    /// unavailable, never filled in.
    private func list(_ title: String, _ items: [String]?, id: String) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            ThesisLabel(text: title)
            if let items, !items.isEmpty {
                ForEach(Array(items.enumerated()), id: \.offset) { _, item in bullet(item, ink: Theme.cream) }
            } else {
                Text(items == nil ? L.t("Not available this time", "No disponible esta vez")
                                  : L.t("Nothing in today’s evidence.", "Nada en la evidencia de hoy."))
                    .thesisFont(14, relativeTo: .callout).foregroundStyle(Theme.warmDim).thesisWraps()
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier(id)
    }

    private func bullet(_ text: String, ink: Color) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 8) {
            Text("·").thesisFont(15, .bold).foregroundStyle(Theme.warmDim).accessibilityHidden(true)
            Text(text).thesisFont(14.5, relativeTo: .callout).foregroundStyle(ink).lineSpacing(3).thesisWraps()
        }
        .padding(.vertical, 3)
    }

    private func notChecked(_ result: ThesisReviewResult) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            ThesisLabel(text: L.t("Not checked", "No revisado"))
            ForEach(result.notChecked.compactMap { ThesisCopy.notCheckedWord($0, isEquity: result.thesis.isEquity) }, id: \.self) { word in
                bullet(word, ink: Theme.warmMuted)
            }
            Text(ThesisCopy.priceOnlyLine(isEquity: result.thesis.isEquity))
                .thesisFont(13.5, relativeTo: .footnote).foregroundStyle(Theme.cream).lineSpacing(3).thesisWraps()
                .padding(.top, 8)
                .accessibilityIdentifier("thesis-review-price-only")
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("thesis-review-not-checked")
    }

    // MARK: Decide

    private func decide(_ result: ThesisReviewResult) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            ThesisLabel(text: L.t("What do you want to do with it?", "¿Qué quieres hacer con ella?"), top: 28)
            ViewThatFits(in: .horizontal) {
                HStack(spacing: 8) { decisions(result); Spacer(minLength: 0) }
                VStack(alignment: .leading, spacing: 6) { decisions(result) }
            }
            .padding(.top, 4)
        }
    }

    @ViewBuilder private func decisions(_ result: ThesisReviewResult) -> some View {
        ThesisButton(title: L.t("Keep it", "Mantenerla"), prominent: true, id: "thesis-review-keep") {
            if reviewer.decide(.keep) { actions.close() }
        }
        ThesisButton(title: L.t("Edit it", "Editarla"), id: "thesis-review-edit") {
            if reviewer.decide(.edit) { actions.edit(result.thesis.id) }
        }
        ThesisButton(title: L.t("Archive it", "Archivarla"), id: "thesis-review-archive") {
            if reviewer.decide(.archive) { actions.close() }
        }
    }

    // MARK: Past reviews

    @ViewBuilder private func history(excluding current: ThesisRevision?) -> some View {
        let past = reviewer.pastReviews(excluding: current)
        if !past.isEmpty {
            Button {
                withAnimation(.easeOut(duration: 0.2)) { showsHistory.toggle() }
            } label: {
                HStack(spacing: 8) {
                    Text((L.t("Past reviews", "Revisiones anteriores") + " · \(past.count)").uppercased())
                        .thesisFont(11, .medium, design: .monospaced, relativeTo: .caption).tracking(1.4).foregroundStyle(Theme.warmDim)
                    Image(systemName: showsHistory ? "chevron.up" : "chevron.down").font(.system(size: 10, weight: .semibold)).foregroundStyle(Theme.warmDim)
                    Spacer(minLength: 0)
                }
                .frame(minHeight: 44)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .padding(.top, 18)
            .accessibilityLabel(L.t("Past reviews", "Revisiones anteriores") + ", \(past.count)")
            .accessibilityValue(showsHistory ? L.t("Expanded", "Desplegado") : L.t("Collapsed", "Plegado"))
            .accessibilityIdentifier("thesis-review-history-toggle")
            if showsHistory {
                ForEach(past) { revision in
                    HStack(alignment: .firstTextBaseline, spacing: 6) {
                        Text(pastLine(revision)).thesisFont(13.5, design: .monospaced, relativeTo: .footnote).foregroundStyle(Theme.warmMuted).thesisWraps()
                        if let verdict = revision.verdict { ThesisVerdictWord(verdict: verdict, size: 13.5) }
                        Spacer(minLength: 0)
                    }
                    .frame(minHeight: 36)
                    .overlay(alignment: .top) { Rectangle().fill(Theme.warmHair).frame(height: 1) }
                    .accessibilityElement(children: .combine)
                }
            }
        }
    }

    /// The date and the price; the verdict follows in its own colour.
    private func pastLine(_ revision: ThesisRevision) -> String {
        var parts = [ThesisCopy.day(revision.at)]
        if let price = revision.price, price.isFinite, price > 0 { parts.append(ThesisCopy.price(price)) }
        return parts.joined(separator: " · ") + (ThesisCopy.verdictWord(revision.verdict) == nil ? "" : " ·")
    }

    // MARK: Refused

    @ViewBuilder private func refused(_ refusal: ThesisReviewer.Refusal) -> some View {
        let copy = ThesisRefusalCopy(refusal)
        if let thesis = reviewer.thesis, refusal != .archived {
            Text(thesis.hypothesis).thesisFont(14, relativeTo: .callout).foregroundStyle(Theme.warmMuted).lineSpacing(3).lineLimit(3)
                .padding(.top, 10)
        }
        VStack(alignment: .leading, spacing: 6) {
            Text(copy.text).thesisFont(15, .medium).foregroundStyle(Theme.cream).lineSpacing(3).thesisWraps()
            if let detail = copy.detail {
                Text(detail).thesisFont(14, relativeTo: .callout).foregroundStyle(Theme.warmMuted).lineSpacing(3).thesisWraps()
            }
            if signInFailed {
                Text(L.t("Sign-in did not finish. Try again.", "El inicio de sesión no terminó. Inténtalo de nuevo."))
                    .thesisFont(13, relativeTo: .footnote).foregroundStyle(Theme.warmMuted).thesisWraps()
                    .accessibilityIdentifier("thesis-review-signin-failed")
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
            ThesisButton(title: L.t("Sign in with Apple", "Iniciar sesión con Apple"), prominent: prominent, wide: true, systemImage: "apple.logo",
                         id: "thesis-review-signin") { signIn() }
        case .pro:
            ThesisButton(title: L.t("See Bobby Pro", "Ver Bobby Pro"), prominent: prominent, wide: true, id: "thesis-review-pro", action: actions.showPro)
        case .quick:
            let quick = NucleoAnalysisLevel.rapido.name
            ThesisButton(title: L.t("Review with \(quick)", "Revisar con \(quick)"), prominent: prominent, wide: true, id: "thesis-review-quick") {
                reviewer.start(level: .rapido)
            }
        case .retry:
            ThesisButton(title: L.t("Try again", "Reintentar"), prominent: prominent, wide: true, id: "thesis-review-retry") { reviewer.start() }
        case .credits:
            ThesisButton(title: L.t("Check my credits", "Ver mis créditos"), prominent: prominent, wide: true, id: "thesis-review-credits",
                         action: actions.showCredits)
        case .myTheses:
            ThesisButton(title: L.t("My theses", "Mis tesis"), prominent: prominent, wide: true, id: "thesis-review-list", action: actions.showTheses)
        }
    }

    private func signIn() {
        guard !signingIn else { return }
        signingIn = true
        signInFailed = false
        Task {
            let status = await actions.signIn()
            signingIn = false
            // The account is new: the thesis is read again from that account's book before anything is sent.
            if status == "signedIn" { reviewer.accountChanged() } else { signInFailed = status != "cancelled" }
        }
    }
}
