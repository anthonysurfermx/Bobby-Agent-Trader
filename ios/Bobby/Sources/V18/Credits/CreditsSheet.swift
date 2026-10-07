// Credits (1.8): the one place that says what you have, how to get more, and what "Restore" is for.
// It opens from the Núcleo (`NucleoRoute.credits`, a nudge tap) and from the profile's Credits row.
//   WHAT YOU HAVE   the server's balances, line by line (CreditsBalance)
//   GET MORE        invite friends · redeem a code · Bobby Pro, each with one honest sentence
//   ALREADY PAID?   Restore Purchases, explained before the tap, answered under the row
// Restore Purchases is here signed in or signed out (App Review 3.1.1). Nothing is fetched before
// the risk notice is accepted (R11): `CreditsFlow` holds that rule and the restore steps. The
// invite, coupon and Bobby Pro sheets open over this one.
import AuthenticationServices
import StoreKit
import SwiftUI

struct CreditsSheet: View {
    @ObservedObject private var profile: AgentProfile
    private let proPurchasable: @MainActor () -> Bool
    private let afterSignIn: () async -> Void
    private let onRead: () -> Void
    /// Leaves Credits for the place where the risk notice can be accepted; nil where there is none.
    private let onRiskNotice: (() -> Void)?
    private let onClose: () -> Void

    @ObservedObject private var account = AccountSession.shared
    @ObservedObject private var reads = BobbyAccessCenter.shared
    @ObservedObject private var levels = NucleoLevelCenter.shared
    /// Its package arriving changes what the invite row may promise.
    @ObservedObject private var store = BobbyStore.shared
    @StateObject private var flow: CreditsFlow
    @State private var inner: Inner?
    @State private var manageSubscription = false

    /// The sheets this screen opens over itself.
    private enum Inner: String, Identifiable {
        case invite, coupon, pro
        var id: String { rawValue }
    }

    /// From the Núcleo (`NucleoRoute.credits`).
    @MainActor init(session: NucleoSession, onClose: @escaping () -> Void) {
        self.init(profile: session.profile,
                  proPurchasable: { session.proPurchasable },
                  afterSignIn: { await session.signedInFromSheet() },
                  onRead: onClose,
                  onRiskNotice: { session.switchSheet(to: .riskNotice) },
                  onClose: onClose)
    }

    /// From the profile. `onRead` closes everything so the person lands where they ask (the coupon's "Make a read").
    @MainActor init(profile: AgentProfile, proPurchasable: @escaping @MainActor () -> Bool = { BobbyStore.shared.proPurchasable },
         afterSignIn: @escaping () async -> Void, onRead: @escaping () -> Void, onRiskNotice: (() -> Void)? = nil,
         onClose: @escaping () -> Void) {
        self.profile = profile
        self.proPurchasable = proPurchasable
        self.afterSignIn = afterSignIn
        self.onRead = onRead
        self.onRiskNotice = onRiskNotice
        self.onClose = onClose
        _flow = StateObject(wrappedValue: CreditsFlow(.live(profile: profile, afterSignIn: afterSignIn)))
    }

    private var snapshot: CreditsSnapshot {
        CreditsSnapshot(access: reads.access ?? levels.quickAccess, meters: levels.meters, referral: levels.referral,
                        subscription: reads.subscription, proPurchasable: proPurchasable(), signedIn: account.isSignedIn,
                        freeReadsPerWeek: CreditsPlans.freeReadsPerWeek, rewardDays: levels.rewardDays, maxFriends: levels.maxFriends)
    }

    var body: some View {
        let snapshot = self.snapshot
        CreditsScreen(riskAccepted: profile.acceptedRiskNotice, snapshot: snapshot, loading: flow.loading, loadFailed: flow.loadFailed,
                      restore: flow.restore, accountError: account.lastError,
                      actions: CreditsScreen.Actions(
                        close: onClose,
                        invite: { inner = .invite },
                        coupon: { inner = .coupon },
                        pro: { inner = .pro },
                        restore: { Task { await flow.tapRestore() } },
                        reload: { Task { await flow.refresh() } },
                        manage: { manageSubscription = true },
                        riskNotice: onRiskNotice,
                        prepareApple: { account.prepareAppleRequest($0) },
                        completeApple: { result, thenRestore in
                            Task { await flow.signIn(thenRestore: thenRestore) { await account.completeApple(result) } }
                        }))
            .manageSubscriptionsSheet(isPresented: $manageSubscription)
            .task { await flow.refresh() }
            .onAppear { acknowledge(snapshot) }
            .onChange(of: CreditsNudges.giftTotal(access: snapshot.access, meters: snapshot.meters)) { _, _ in acknowledge(self.snapshot) }
            .onReceive(account.$session.map { $0?.userId }.removeDuplicates().dropFirst()) { _ in flow.accountChanged() }
            .sheet(item: $inner, onDismiss: { Task { await flow.refresh() } }) { destination in
                switch destination {
                case .invite:
                    NucleoInviteSheet(center: NucleoLevelCenter.shared, proPurchasable: proPurchasable(), reason: nil,
                                      onPro: {
                                          // The invite sheet's Bobby Pro card: the paywall follows once it is gone.
                                          inner = nil
                                          DispatchQueue.main.asyncAfter(deadline: .now() + 0.35) { inner = .pro }
                                      }) { inner = nil }
                        .presentationDetents([.medium, .large])
                        .presentationDragIndicator(.visible)
                        .presentationBackground(Theme.nucleoSurface)
                case .coupon:
                    CouponRedemptionSheet(afterSignIn: afterSignIn,
                                          onRead: { inner = nil; onRead() }) { inner = nil }
                        .presentationDetents([.large])
                        .presentationDragIndicator(.visible)
                        .presentationBackground(Theme.nucleoSurface)
                case .pro:
                    NucleoPaywallSheet(store: BobbyStore.shared, center: BobbyAccessCenter.shared,
                                       afterSignIn: afterSignIn, onOutcome: { _ in }) { inner = nil }
                }
            }
    }

    /// The gifted balance is on screen: the glass has no reason to announce it again.
    private func acknowledge(_ snapshot: CreditsSnapshot) {
        guard profile.acceptedRiskNotice, snapshot.access != nil else { return }
        CreditsNudges.acknowledgeGifts()
    }

}

/// `plans.freeReadsPerWeek` (what a free account gets every week), for the guest's line. The level
/// centre already reads `/api/bobby-access` and drops this one field, so the Credits screen listens
/// to that same reply instead of asking the server again. A plan constant: the same for everyone.
@MainActor
enum CreditsPlans {
    private(set) static var freeReadsPerWeek: Int?
    private static var attached = false

    static func attach() {
        guard !attached else { return }
        attached = true
        let center = NucleoLevelCenter.shared
        let load = center.load
        center.load = { auth in
            let body = try await load(auth)
            note(body)
            return body
        }
    }

    /// `null` means there is no weekly cap right now; a reply without `plans` says nothing.
    static func note(_ body: [String: Any]?) {
        guard let plans = body?["plans"] as? [String: Any] else { return }
        freeReadsPerWeek = BobbyReadAccess.count(plans["freeReadsPerWeek"]).flatMap { $0 > 0 ? $0 : nil }
    }
}

// MARK: - The screen (pure: the live sheet and the review fixtures draw the same view)

struct CreditsScreen: View {
    struct Actions {
        var close: () -> Void = {}
        var invite: () -> Void = {}
        var coupon: () -> Void = {}
        var pro: () -> Void = {}
        var restore: () -> Void = {}
        var reload: () -> Void = {}
        var manage: () -> Void = {}
        /// Leaves Credits for the place where the risk notice can be accepted; nil hides the button.
        var riskNotice: (() -> Void)? = nil
        var prepareApple: (ASAuthorizationAppleIDRequest) -> Void = { _ in }
        /// The Apple sheet answered; `thenRestore` when it was asked for from the restore row.
        var completeApple: (Result<ASAuthorization, Error>, _ thenRestore: Bool) -> Void = { _, _ in }
    }

    let riskAccepted: Bool
    let snapshot: CreditsSnapshot
    var loading = false
    var loadFailed = false
    var restore: CreditsRestoreState = .idle
    /// `AccountSession.lastError` after a sign in that did not finish.
    var accountError: String? = nil
    var now = Date()
    var actions = Actions()

    private var balance: CreditsBalance { CreditsBalance.make(snapshot, now: now) }

    var body: some View {
        let balance = self.balance
        ScrollViewReader { proxy in
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                topBar
                Text(L.t("Your credits", "Tus créditos"))
                    .font(.system(size: 26, weight: .light, design: .rounded)).foregroundStyle(Theme.cream)
                    .padding(.top, 14)
                    .accessibilityAddTraits(.isHeader)
                Text(L.t("A credit is one read: Bobby's three agents debate your question.",
                         "Un crédito es una lectura: los tres agentes de Bobby debaten tu pregunta."))
                    .font(.system(size: 13)).foregroundStyle(Theme.warmMuted)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.top, 8)
                    .accessibilityIdentifier("credits-intro")

                label(L.t("What you have", "Lo que tienes"))
                have(balance)

                if riskAccepted {
                    label(L.t("Get more", "Consigue más"))
                    more(balance)
                }

                label(L.t("Already paid?", "¿Ya pagaste?"))
                restoreBlock(balance)

                if balance.manage {
                    Button(action: actions.manage) {
                        Text(L.t("Manage subscription", "Administrar suscripción"))
                            .font(.system(size: 13, weight: .medium)).foregroundStyle(Theme.warmMuted)
                            .frame(minHeight: 44)
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .padding(.top, 14)
                    .accessibilityIdentifier("credits-manage-subscription")
                }
            }
            .padding(.horizontal, 22)
            .padding(.top, 16)
            .padding(.bottom, 32)
        }
        .scrollIndicators(.hidden)
        // The answer to a restore lands under the row: bring it into view, never below the fold.
        .onAppear { reveal(proxy, animated: false) }
        .onChange(of: restore) { _, _ in reveal(proxy, animated: true) }
        }
        .background(Theme.nucleoSurface.ignoresSafeArea())
        .environment(\.colorScheme, .dark)
        .accessibilityIdentifier("credits")
    }

    private static let noticeID = "credits-restore-notice"

    private func reveal(_ proxy: ScrollViewProxy, animated: Bool) {
        guard restoreNotice(balance) != nil else { return }
        // After the notice is laid out.
        DispatchQueue.main.async {
            if animated { withAnimation(.easeOut(duration: 0.25)) { proxy.scrollTo(Self.noticeID, anchor: .bottom) } }
            else { proxy.scrollTo(Self.noticeID, anchor: .bottom) }
        }
    }

    // MARK: Frame

    private var topBar: some View {
        HStack {
            Text(L.t("Credits", "Créditos").uppercased()).font(.mono(11, .medium)).tracking(1.6).foregroundStyle(Theme.warmDim)
            Spacer()
            Button(action: actions.close) {
                // 30 pt to the eye, 44 pt to the finger (the bar keeps its 30 pt height).
                Image(systemName: "xmark").font(.system(size: 12, weight: .semibold)).foregroundStyle(Theme.warmMuted)
                    .frame(width: 30, height: 30).background(Circle().fill(Theme.warmFill))
                    .frame(width: 44, height: 44, alignment: .trailing)
                    .contentShape(Rectangle())
            }
            .padding(.vertical, -7)
            .accessibilityLabel(L.t("Close", "Cerrar"))
            .accessibilityIdentifier("credits-close")
        }
        .frame(minHeight: 30)
    }

    private func label(_ text: String) -> some View {
        Text(text.uppercased()).font(.mono(11, .medium)).tracking(1.6).foregroundStyle(Theme.warmDim)
            .padding(.top, 28).padding(.bottom, 8)
            .accessibilityAddTraits(.isHeader)
    }

    private func note(_ text: String) -> some View {
        Text(text).font(.system(size: 13)).foregroundStyle(Theme.warmMuted)
            .fixedSize(horizontal: false, vertical: true)
            .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
            .padding(.vertical, 8)
            .overlay(alignment: .top) { CreditsHairline() }
    }

    // MARK: What you have

    @ViewBuilder private func have(_ balance: CreditsBalance) -> some View {
        if !riskAccepted {
            VStack(alignment: .leading, spacing: 10) {
                Text(L.t("Accept the risk notice to see your credits.", "Acepta el aviso de riesgo para ver tus créditos."))
                    .font(.system(size: 13)).foregroundStyle(Theme.warmMuted)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityIdentifier("credits-risk-required")
                if let open = actions.riskNotice {
                    CreditsPill(title: L.t("Risk notice", "Aviso de riesgo"), action: open)
                        .accessibilityIdentifier("credits-risk-open")
                }
            }
            .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
            .padding(.vertical, 8)
            .overlay(alignment: .top) { CreditsHairline() }
        } else if balance.isKnown {
            let lines = balance.lines
            ForEach(Array(lines.enumerated()), id: \.element.id) { index, line in
                // Gifted lines that share a sentence say it once, under the last of them.
                let repeats = line.isGift && index + 1 < lines.count && lines[index + 1].isGift && lines[index + 1].detail == line.detail
                CreditsLineRow(line: line, showsDetail: !repeats)
            }
            if !snapshot.signedIn {
                signInButton(thenRestore: false)
                    .padding(.top, 12)
                    .accessibilityIdentifier("credits-apple-sign-in")
                if let accountError, restoreNotice(balance)?.action != .signIn { errorLine(accountError) }
            }
        } else if loading {
            ProgressView().tint(Theme.warmMuted)
                .frame(maxWidth: .infinity, minHeight: 60)
                .accessibilityIdentifier("credits-loading")
        } else if loadFailed {
            VStack(alignment: .leading, spacing: 10) {
                Text(L.t("Bobby could not read your credits right now.", "Bobby no pudo leer tus créditos en este momento."))
                    .font(.system(size: 13)).foregroundStyle(Theme.warmMuted)
                    .fixedSize(horizontal: false, vertical: true)
                CreditsPill(title: L.t("Try again", "Reintentar"), action: actions.reload)
                    .accessibilityIdentifier("credits-retry")
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.vertical, 8)
            .overlay(alignment: .top) { CreditsHairline() }
            .accessibilityIdentifier("credits-unavailable")
        } else {
            // Nothing asked yet (the first read is about to start): keep the place, show no number.
            Color.clear.frame(height: 60)
        }
    }

    // MARK: Get more

    @ViewBuilder private func more(_ balance: CreditsBalance) -> some View {
        CreditsActionRow(symbol: "person.2", label: L.t("Invite friends", "Invita amigos"),
                         detail: CreditsBalance.inviteDetail(snapshot), action: actions.invite)
            .accessibilityIdentifier("credits-invite")
        CreditsActionRow(symbol: "gift", label: CouponCopy.text("title"),
                         detail: L.t("Got a code from Bobby? Your reads are added to your account at once.",
                                     "¿Tienes un código de Bobby? Tus lecturas se agregan a tu cuenta al instante."),
                         action: actions.coupon)
            .accessibilityIdentifier("credits-coupon")
        // An account on Bobby Pro has nothing to be offered, whether or not the reason has reached the
        // app yet; gifted days can still become a plan.
        if balance.pro.offersPro {
            CreditsActionRow(symbol: "infinity", label: "Bobby Pro", detail: BobbyStore.Copy.benefits, action: actions.pro)
                .accessibilityIdentifier("credits-pro")
        }
    }

    // MARK: Already paid?

    @ViewBuilder private func restoreBlock(_ balance: CreditsBalance) -> some View {
        CreditsActionRow(symbol: "arrow.clockwise", label: L.t("Restore Purchases", "Restaurar compras"),
                         detail: L.t("Use this if you paid for Bobby Pro with your Apple Account on another iPhone or after reinstalling. Codes and gifts never need restoring.",
                                     "Úsalo si pagaste Bobby Pro con tu cuenta de Apple en otro iPhone o después de reinstalar. Los códigos y regalos nunca necesitan restaurarse."),
                         trailing: restore == .running ? .working(L.t("Restoring…", "Restaurando…")) : .none,
                         action: actions.restore)
            .disabled(restore == .running || !riskAccepted)
            .accessibilityIdentifier("account-restore")
        if !riskAccepted {
            // The reason is on the screen from the start, not behind a tap (the store starts after the notice).
            Text(CreditsRestoreNotice.beforeRiskNotice())
                .font(.system(size: 13)).foregroundStyle(Theme.cream)
                .fixedSize(horizontal: false, vertical: true)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.leading, 44).padding(.top, 2).padding(.bottom, 8)
                .accessibilityIdentifier("credits-restore-risk")
        } else if let notice = restoreNotice(balance) {
            VStack(alignment: .leading, spacing: 12) {
                Text(notice.text).font(.system(size: 13)).foregroundStyle(Theme.cream)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityIdentifier("credits-restore-text")
                switch notice.action {
                case .signIn:
                    signInButton(thenRestore: true).accessibilityIdentifier("credits-restore-sign-in")
                    if let accountError { errorLine(accountError) }
                case .tryAgain:
                    CreditsPill(title: L.t("Try again", "Reintentar"), action: actions.restore)
                        .accessibilityIdentifier("credits-restore-retry")
                case .seePro:
                    CreditsPill(title: L.t("See Bobby Pro", "Ver Bobby Pro"), action: actions.pro)
                        .accessibilityIdentifier("credits-restore-pro")
                case nil:
                    EmptyView()
                }
            }
            .padding(14)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(RoundedRectangle(cornerRadius: 16, style: .continuous).fill(Theme.nucleoGlass))
            .padding(.top, 4)
            .id(Self.noticeID)
            .accessibilityElement(children: .contain)
            .accessibilityIdentifier(Self.noticeID)
            .onAppear { announce(notice.text) }
            .onChange(of: notice.text) { _, text in announce(text) }
        }
    }

    private func restoreNotice(_ balance: CreditsBalance) -> CreditsRestoreNotice? {
        guard riskAccepted else { return nil }
        return CreditsRestoreNotice.make(restore, pro: balance.pro, proPurchasable: snapshot.proPurchasable, now: now)
    }

    private func announce(_ text: String) {
        if UIAccessibility.isVoiceOverRunning { UIAccessibility.post(notification: .announcement, argument: text) }
    }

    // MARK: Sign in

    private func signInButton(thenRestore: Bool) -> some View {
        SignInWithAppleButton(.signIn) { request in
            actions.prepareApple(request)
        } onCompletion: { result in
            actions.completeApple(result, thenRestore)
        }
        .signInWithAppleButtonStyle(.white)
        .frame(height: 48)
        .clipShape(Capsule())
    }

    private func errorLine(_ text: String) -> some View {
        Text(text).font(.footnote).foregroundStyle(Theme.cream)
            .fixedSize(horizontal: false, vertical: true)
            .padding(.top, 8)
            .accessibilityIdentifier("credits-error")
    }
}

// MARK: - Row kit (the profile's `n-row`, with a value column)

private struct CreditsHairline: View {
    var body: some View { Rectangle().fill(Theme.warmHair).frame(height: 1) }
}

/// One balance: its name, what is left, and when that changes. Not a control.
private struct CreditsLineRow: View {
    let line: CreditsBalance.Line
    let showsDetail: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 3) {
            // Side by side when it fits; the value drops under its name in a long language.
            ViewThatFits(in: .horizontal) {
                HStack(alignment: .firstTextBaseline, spacing: 12) {
                    title.lineLimit(1)
                    Spacer(minLength: 8)
                    value.lineLimit(1)
                }
                VStack(alignment: .leading, spacing: 2) {
                    title
                    value
                }
            }
            if showsDetail, let detail = line.detail {
                Text(detail).font(.system(size: 12)).foregroundStyle(Theme.warmDim)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        // Not a control: a reading line, kept compact so the whole balance fits on one screen.
        .frame(maxWidth: .infinity, minHeight: 34, alignment: .leading)
        .padding(.vertical, 8)
        .overlay(alignment: .top) { CreditsHairline() }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(line.spoken)
        .accessibilityIdentifier("credits-line-\(line.kind.rawValue)")
    }

    private var title: some View {
        Text(line.title).font(.system(size: 15)).foregroundStyle(Theme.warmMuted)
            .fixedSize(horizontal: false, vertical: true)
    }

    private var value: some View {
        Text(line.value).font(.system(size: 15, weight: .medium, design: .rounded)).monospacedDigit().foregroundStyle(Theme.cream)
            .fixedSize(horizontal: false, vertical: true)
    }
}

/// A way to get more (or to restore): icon well, label, one sentence, and where the tap leads.
private struct CreditsActionRow: View {
    enum Trailing: Equatable {
        case chevron
        case none
        /// A spinner, read aloud as this.
        case working(String)
    }

    let symbol: String
    let label: String
    let detail: String
    var trailing: Trailing = .chevron
    let action: () -> Void

    var body: some View {
        Button {
            UIImpactFeedbackGenerator(style: .light).impactOccurred()
            action()
        } label: {
            HStack(alignment: .top, spacing: 12) {
                Image(systemName: symbol)
                    .font(.system(size: 14, weight: .medium)).foregroundStyle(Theme.warmMuted)
                    .frame(width: 32, height: 32).background(Theme.warmFill)
                    .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
                VStack(alignment: .leading, spacing: 3) {
                    Text(label).font(.system(size: 15)).foregroundStyle(Theme.cream)
                        .fixedSize(horizontal: false, vertical: true)
                    Text(detail).font(.system(size: 12)).foregroundStyle(Theme.warmDim)
                        .multilineTextAlignment(.leading)
                        .fixedSize(horizontal: false, vertical: true)
                }
                Spacer(minLength: 8)
                switch trailing {
                case .chevron:
                    Image(systemName: "chevron.right").font(.system(size: 12, weight: .semibold)).foregroundStyle(Theme.warmDim)
                        .frame(height: 32)
                case .working:
                    ProgressView().controlSize(.small).tint(Theme.warmMuted).frame(height: 32)
                case .none:
                    EmptyView()
                }
            }
            .frame(maxWidth: .infinity, minHeight: 52, alignment: .leading)
            .padding(.vertical, 8)
            .overlay(alignment: .top) { CreditsHairline() }
            .contentShape(Rectangle())
        }
        .buttonStyle(CreditsRowButtonStyle())
        // The button stays the element (its tap is VoiceOver's activation): name, state, then the sentence.
        .accessibilityLabel(label)
        .accessibilityValue(working ?? "")
        .accessibilityHint(detail)
    }

    private var working: String? {
        if case let .working(text) = trailing { return text }
        return nil
    }
}

private struct CreditsRowButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label.background(Theme.cream.opacity(configuration.isPressed ? 0.04 : 0))
    }
}

/// A capsule button: 34 pt to the eye, 44 pt to the finger.
private struct CreditsPill: View {
    let title: String
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Text(title).font(.system(size: 13, weight: .medium)).foregroundStyle(Theme.cream)
                .padding(.horizontal, 14).frame(minHeight: 34)
                .background(Capsule().fill(Theme.warmFill))
                .overlay(Capsule().stroke(Theme.nucleoStroke, lineWidth: 1))
                .frame(minHeight: 44)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}
