// The Bobby Pro sheet (Nucleo/ARCHITECTURE.md §8.4): the Núcleo's warm charcoal, one price from
// the App Store (through RevenueCat), Subscribe, Restore Purchases, the renewal terms and the two
// legal links. It opens only when the server answered 402 (`paywall` bridge method) and reports how
// it ended; the page re-asks its question only after `subscribed`, i.e. after Bobby's server confirmed
// the account is Pro. Analysis only: nothing here buys, sells or holds an asset.
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

    /// Apple's standard Licensed Application EULA: bobbyprotocol.xyz has no /terms page of its own.
    static let termsURL = URL(string: "https://www.apple.com/legal/internet-services/itunes/dev/stdeula/")!
    static let privacyURL = URL(string: "https://bobbyprotocol.xyz/privacy")!

    enum Ink {
        static let bg = Color(red: 11 / 255, green: 10 / 255, blue: 9 / 255)           // #0B0A09
        static let ink = Color(red: 242 / 255, green: 237 / 255, blue: 228 / 255)      // #F2EDE4
        static let ink2 = Color(red: 163 / 255, green: 156 / 255, blue: 145 / 255)     // #A39C91
        static let ink3 = Color(red: 138 / 255, green: 131 / 255, blue: 120 / 255)     // #8A8378
        static let line = Color(red: 242 / 255, green: 237 / 255, blue: 228 / 255).opacity(0.12)
        static let glass = Color(red: 242 / 255, green: 237 / 255, blue: 228 / 255).opacity(0.04)
        static let mint = Color(red: 63 / 255, green: 224 / 255, blue: 181 / 255)      // #3FE0B5
        static let coral = Color(red: 1, green: 90 / 255, blue: 95 / 255)              // #FF5A5F
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
                Text(L.t("Unlimited reads", "Lecturas ilimitadas"))
                    .font(.system(size: 20))
                    .foregroundStyle(Ink.ink2)
                    .padding(.top, 4)
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
            feature("infinity", L.t("Ask as often as you want", "Pregunta cuantas veces quieras"))
            feature("person.3", L.t("The full three-agent debate on every read", "El debate completo de tres agentes en cada lectura"))
            feature("calendar", L.t("Monthly, cancel anytime in Settings", "Mensual, cancela cuando quieras en Configuración"))
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
                    .foregroundStyle(Ink.mint)
                    .accessibilityIdentifier("paywall-subscribed")
            } else {
                priceRow
                if store.productState == .notConfigured {
                    EmptyView()
                } else if account.isSignedIn {
                    subscribeButton
                } else {
                    Text(L.t("Sign in first: Bobby Pro belongs to your Bobby account.", "Primero inicia sesión: Bobby Pro queda en tu cuenta de Bobby."))
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
        case .notConfigured:
            Text(BobbyStore.Copy.comingSoon)
                .font(.system(size: 17, weight: .semibold))
                .foregroundStyle(Ink.ink)
                .accessibilityIdentifier("paywall-soon")
        case .idle, .loading:
            ProgressView().tint(Ink.ink2).frame(height: 26)
        }
    }

    private var salesOpen: Bool { center.applePayments != false }

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
            Button(action: restore) {
                Text(L.t("Restore Purchases", "Restaurar compras"))
                    .font(.system(size: 15, weight: .medium))
                    .foregroundStyle(Ink.ink)
            }
            .buttonStyle(.plain)
            .disabled(store.busy || !account.isSignedIn || !store.configured)
            .accessibilityIdentifier("paywall-restore")
            Text(renewalTerms)
                .font(.system(size: 11))
                .foregroundStyle(Ink.ink3)
                .fixedSize(horizontal: false, vertical: true)
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
        note = nil
        Task {
            let outcome = await store.restore()
            if outcome == .nothingToRestore {
                note = L.t("No active Bobby Pro subscription on this Apple Account.", "No hay una suscripción activa de Bobby Pro en esta cuenta de Apple.")
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
            note = L.t("Waiting for approval. Bobby Pro starts as soon as the App Store confirms it.",
                       "Esperando aprobación. Bobby Pro empieza en cuanto la App Store lo confirme.")
            noteIsError = false
        case .cancelled, .nothingToRestore:
            break
        case .needsSignIn:
            note = L.t("Sign in first: Bobby Pro belongs to your Bobby account.", "Primero inicia sesión: Bobby Pro queda en tu cuenta de Bobby.")
            noteIsError = false
        case let .failed(message):
            onOutcome("failed")
            note = message
            noteIsError = true
        }
    }
}
