// The Bobby Pro sheet (Nucleo/ARCHITECTURE.md §8.4): the Núcleo's warm charcoal, one price from
// the App Store (through RevenueCat), Subscribe, Restore Purchases, the renewal terms and the two
// legal links. It opens when the server answered 402 (`paywall` bridge method), reporting how it
// ended — the page re-asks its question only after `subscribed`, i.e. after Bobby's server confirmed
// the account is Pro — and from the profile's Bobby Pro row, where nothing awaits it.
// Analysis only: nothing here buys, sells or holds an asset.
import AuthenticationServices
import SwiftUI

struct NucleoPaywallSheet: View {
    @ObservedObject var store: BobbyStore
    @ObservedObject var center: BobbyAccessCenter
    /// Runs after a Sign in with Apple from this sheet (sync the progress, tell the page).
    var afterSignIn: () async -> Void = {}
    /// `subscribed` | `pending` | `failed` as they happen; closing keeps the last one.
    let onOutcome: (String) -> Void
    let close: () -> Void

    @ObservedObject private var account = AccountSession.shared
    @State private var note: String?
    @State private var noteIsError = false
    @State private var subscribed = false
    /// The access read this sheet started has answered (until then a closed sale is only "unknown").
    @State private var accessChecked = false
    @State private var retrying = false
    @State private var restoring = false

    /// Apple's standard Licensed Application EULA: bobbyprotocol.xyz has no /terms page of its own.
    static let termsURL = URL(string: "https://www.apple.com/legal/internet-services/itunes/dev/stdeula/")!
    static var privacyURL: URL { L.site("privacy") }

    enum Ink {
        static let bg = Theme.bg
        static let ink = Theme.cream
        static let ink2 = Theme.warmMuted
        static let ink3 = Theme.warmDim
        static let line = Theme.nucleoStroke
        static let glass = Theme.nucleoGlass
        static let accent = Theme.orbCyan
        static let coral = Theme.down
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                header
                Text("Bobby Pro")
                    .font(.system(size: 40, weight: .semibold))
                    .foregroundStyle(Ink.ink)
                    .padding(.top, 28)
                    .accessibilityAddTraits(.isHeader)
                Text(BobbyStore.Copy.benefits)
                    .font(.system(size: 18))
                    .foregroundStyle(Ink.ink2)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.top, 4)
                    .accessibilityIdentifier("paywall-benefits")
                features.padding(.top, 26)
                purchaseBlock.padding(.top, 26)
                footer.padding(.top, 22)
            }
            .padding(.horizontal, 24)
            .padding(.bottom, 28)
        }
        .scrollIndicators(.hidden)
        .background(Ink.bg.ignoresSafeArea())
        .presentationDetents([.large])
        .presentationDragIndicator(.visible)
        .presentationBackground(Ink.bg)
        .preferredColorScheme(.dark)
        .task {
            store.start()
            await store.loadProduct()
            await center.refresh()
            accessChecked = true
        }
        .accessibilityIdentifier("paywall")
    }

    private var header: some View {
        HStack {
            Text(L.t("BOBBY PRO", "BOBBY PRO"))
                .font(.system(size: 11, weight: .semibold, design: .monospaced))
                .tracking(2)
                .foregroundStyle(Ink.ink3)
            Spacer()
            Button(action: close) {
                Image(systemName: "xmark")
                    .font(.system(size: 13, weight: .bold))
                    .foregroundStyle(Ink.ink2)
                    .frame(width: 44, height: 44, alignment: .trailing)
            }
            .accessibilityLabel(L.t("Close", "Cerrar"))
            .accessibilityIdentifier("paywall-close")
        }
        .padding(.top, 8)
    }

    private var features: some View {
        VStack(alignment: .leading, spacing: 14) {
            feature("person.3", L.t("The full three-agent debate on every read", "El debate completo de tres agentes en cada lectura"))
            feature("sparkles", L.t("Deep adds more data; Max adds a second round", "Profundo suma más datos; Máximo, una segunda ronda"))
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: 20).fill(Ink.glass))
        .overlay(RoundedRectangle(cornerRadius: 20).stroke(Ink.line, lineWidth: 0.5))
    }

    private func feature(_ icon: String, _ text: String) -> some View {
        HStack(spacing: 12) {
            Image(systemName: icon).font(.system(size: 15, weight: .medium)).foregroundStyle(Ink.ink2).frame(width: 22)
            Text(text).font(.system(size: 15)).foregroundStyle(Ink.ink).fixedSize(horizontal: false, vertical: true)
        }
    }

    @ViewBuilder
    private var purchaseBlock: some View {
        VStack(alignment: .leading, spacing: 12) {
            if subscribed {
                Label(L.t("You’re on Bobby Pro.", "Ya tienes Bobby Pro."), systemImage: "checkmark.circle.fill")
                    .font(.system(size: 17, weight: .semibold))
                    .foregroundStyle(Ink.accent)
                    .accessibilityIdentifier("paywall-subscribed")
            } else {
                priceRow
                if store.productState == .loaded, let renews = store.renewsLine() {
                    Text(renews)
                        .font(.system(size: 13))
                        .foregroundStyle(Ink.ink2)
                        .fixedSize(horizontal: false, vertical: true)
                        .accessibilityIdentifier("paywall-renews")
                }
                if salesClosed { unavailableRow }
                if store.productState == .notConfigured {
                    EmptyView()
                } else if account.isSignedIn {
                    subscribeButton
                } else {
                    Text(BobbyStore.Copy.signInFirst)
                        .font(.system(size: 13)).foregroundStyle(Ink.ink2)
                    SignInWithAppleButton(.signIn) { request in
                        account.prepareAppleRequest(request)
                    } onCompletion: { result in
                        Task {
                            await account.completeApple(result)
                            if account.isSignedIn { await afterSignIn() }
                        }
                    }
                    .signInWithAppleButtonStyle(.white)
                    .frame(height: 50)
                    .clipShape(Capsule())
                }
            }
            if let reset = resetLine {
                Text(reset).font(.system(size: 13)).foregroundStyle(Ink.ink2)
                    .accessibilityIdentifier("paywall-resets")
            }
            if let note {
                Text(note).font(.system(size: 13)).foregroundStyle(noteIsError ? Ink.coral : Ink.ink2)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityIdentifier("paywall-note")
            }
#if DEBUG
            if [.missing, .failed, .notConfigured].contains(store.productState) {
                // Dev builds only: say exactly what is missing (the key, the offering, or the product).
                Text(devNote)
                    .font(.system(size: 11, design: .monospaced))
                    .foregroundStyle(Ink.coral)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityIdentifier("paywall-dev-missing")
            }
#endif
        }
    }

    @ViewBuilder
    private var priceRow: some View {
        switch store.productState {
        case .loaded:
            if let price = store.priceLine() {
                Text(price)
                    .font(.system(size: 22, weight: .semibold).monospacedDigit())
                    .foregroundStyle(Ink.ink)
                    .accessibilityIdentifier("paywall-price")
            }
        case .missing, .failed:
            Text(BobbyStore.Copy.unavailable).font(.system(size: 14)).foregroundStyle(Ink.ink2)
            unavailableRow
        case .notConfigured:
            Text(BobbyStore.Copy.comingSoon)
                .font(.system(size: 17, weight: .semibold))
                .foregroundStyle(Ink.ink)
                .accessibilityIdentifier("paywall-soon")
        case .idle, .loading:
            ProgressView().tint(Ink.ink2).frame(height: 26)
        }
    }

    private var salesOpen: Bool { center.applePayments == true }

    /// The price is here but Bobby's server isn't taking App Store payments (or couldn't be read):
    /// say so under the price instead of a silent grey button.
    private var salesClosed: Bool { store.productState == .loaded && accessChecked && !salesOpen }

    /// The unavailable line and a way to ask again (the product, then the server's payment readiness).
    private var unavailableRow: some View {
        VStack(alignment: .leading, spacing: 8) {
            if store.productState == .loaded {
                Text(BobbyStore.Copy.unavailable).font(.system(size: 14)).foregroundStyle(Ink.ink2)
                    .fixedSize(horizontal: false, vertical: true)
            }
            Button(action: retry) {
                HStack(spacing: 6) {
                    if retrying { ProgressView().tint(Ink.ink).controlSize(.small) }
                    Text(L.t("Try again", "Reintentar")).font(.system(size: 15, weight: .medium))
                }
                .foregroundStyle(Ink.ink)
                .padding(.horizontal, 16)
                .frame(minHeight: 44)
                .background(Capsule().stroke(Ink.line, lineWidth: 1))
            }
            .buttonStyle(.plain)
            .disabled(retrying)
            .accessibilityIdentifier("paywall-retry")
        }
        .accessibilityIdentifier("paywall-unavailable")
    }

    private func retry() {
        retrying = true
        note = nil
        Task {
            store.start()
            await store.loadProduct()
            await center.refresh()
            accessChecked = true
            retrying = false
        }
    }

    private var subscribeButton: some View {
        Button(action: subscribe) {
            ZStack {
                if store.busy { ProgressView().tint(Ink.bg) }
                else { Text(L.t("Subscribe", "Suscribirme")).font(.system(size: 17, weight: .semibold)) }
            }
            .frame(maxWidth: .infinity)
            .frame(height: 50)
            .foregroundStyle(Ink.bg)
            .background(Capsule().fill(Ink.ink))
        }
        .buttonStyle(.plain)
        .disabled(store.busy || store.package == nil || !salesOpen)
        .opacity(store.package == nil || !salesOpen ? 0.4 : 1)
        .accessibilityIdentifier("paywall-subscribe")
    }

    private var footer: some View {
        VStack(alignment: .leading, spacing: 14) {
            // Always offered (App Review 3.1.1): signed out, it signs in with Apple first.
            Button(action: restore) {
                HStack(spacing: 8) {
                    Text(L.t("Restore Purchases", "Restaurar compras"))
                        .font(.system(size: 15, weight: .medium))
                        .foregroundStyle(Ink.ink)
                    if restoring { ProgressView().tint(Ink.ink2).controlSize(.small) }
                }
                .frame(minHeight: 44)
            }
            .buttonStyle(.plain)
            .disabled(store.busy || restoring)
            .accessibilityIdentifier("paywall-restore")
            if store.configured {
                Text(renewalTerms)
                    .font(.system(size: 11))
                    .foregroundStyle(Ink.ink3)
                    .fixedSize(horizontal: false, vertical: true)
            }
            HStack(spacing: 18) {
                Link(L.t("Terms of Use (EULA)", "Términos de uso (EULA)"), destination: Self.termsURL)
                    .accessibilityIdentifier("paywall-terms")
                Link(L.t("Privacy Policy", "Aviso de privacidad"), destination: Self.privacyURL)
                    .accessibilityIdentifier("paywall-privacy")
            }
            .font(.system(size: 13, weight: .medium))
            .foregroundStyle(Ink.ink2)
        }
    }

    /// Guideline 3.1.2: the length, the price and how the renewal works, next to the button.
    private var renewalTerms: String {
        let price = store.package?.localizedPriceString ?? L.t("the price shown", "el precio mostrado")
        let period = store.periodName() ?? L.t("month", "mes")
        return L.t("Bobby Pro renews every \(period) at \(price) until you cancel. Payment is charged to your Apple Account at confirmation. It renews unless you cancel at least 24 hours before the period ends; manage or cancel it in Settings › Apple Account › Subscriptions. Educational reads, not financial advice.",
                   "Bobby Pro se renueva cada \(period) a \(price) hasta que la canceles. El cargo se hace a tu cuenta de Apple al confirmar. Se renueva salvo que la canceles al menos 24 horas antes de que termine el periodo; adminístrala o cancélala en Configuración › Cuenta de Apple › Suscripciones. Lecturas educativas, no es asesoría financiera.")
    }

#if DEBUG
    private var devNote: String {
        switch store.productState {
        case .notConfigured:
            return "DEV · RevenueCat is not configured: REVENUECAT_IOS_API_KEY is empty for this configuration (a test_ key never configures Release)."
        default:
            return "DEV · no monthly package for \(BobbyStore.proMonthlyID). RevenueCat: entitlement “pro”, current offering with a monthly package. \(store.diagnostics ?? "")"
        }
    }
#endif

    private var resetLine: String? {
        guard let access = center.access, !access.isPro, let date = access.resetsDate else { return nil }
        return L.t("Your free reads reset \(BobbyAccessAPI.day(date)).", "Tus lecturas gratis se renuevan el \(BobbyAccessAPI.day(date)).")
    }

    private func subscribe() {
        note = nil
        Task {
            let outcome = await store.purchase()
            show(outcome)
        }
    }

    private func restore() {
        guard !restoring else { return }
        note = nil
        restoring = true
        Task {
            let outcome = await BobbyProRestore.run(afterSignIn: afterSignIn)
            restoring = false
            if outcome == .nothingToRestore {
                note = BobbyStore.Copy.nothingToRestore
                noteIsError = false
                return
            }
            show(outcome)
        }
    }

    private func show(_ outcome: BobbyStore.Outcome) {
        switch outcome {
        case .subscribed:
            onOutcome("subscribed")
            withAnimation(.easeOut(duration: 0.25)) { subscribed = true }
            Task {
                try? await Task.sleep(nanoseconds: 900_000_000)
                close()
            }
        case .pending:
            onOutcome("pending")
            note = BobbyStore.Copy.pending
            noteIsError = false
        case .cancelled, .nothingToRestore:
            break
        case .needsSignIn:
            note = BobbyStore.Copy.signInFirst
            noteIsError = false
        case let .failed(message):
            onOutcome("failed")
            note = message
            noteIsError = true
        }
    }
}

/// Restore Purchases from the paywall or the profile. A purchase belongs to a Bobby account, so with
/// nobody signed in it runs the same Sign in with Apple sheet the Núcleo uses (`NucleoAppleSignIn`)
/// first, then asks RevenueCat to re-read this Apple Account's purchases. Never before consent (R11).
@MainActor
enum BobbyProRestore {
    static func run(afterSignIn: () async -> Void) async -> BobbyStore.Outcome {
        let store = BobbyStore.shared
        store.start()
        guard store.configured else { return .failed(BobbyStore.Copy.unavailable) }
        let account = AccountSession.shared
        if !account.isSignedIn {
            let result = await NucleoAppleSignIn().run()
            await account.completeApple(result)
            guard account.isSignedIn else {
                if case let .failure(error) = result, (error as? ASAuthorizationError)?.code == .canceled {
                    account.lastError = nil
                    return .cancelled
                }
                return .needsSignIn
            }
            await afterSignIn()
        }
        return await store.restore()
    }
}
