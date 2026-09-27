// Bobby Pro on iOS: one App Store auto-renewable subscription, sold through RevenueCat, for
// analysis only — the app has no wallet, no swaps and no trading (Nucleo/ARCHITECTURE.md §8.4).
//   · RevenueCat's app user id IS the Supabase auth user id (the server maps it to
//     bobby_identities.auth_user_id): configured with it at launch, logIn on sign in, logOut on sign out.
//   · Entitlement `pro`; the current offering's monthly package (xyz.bobbyprotocol.bobby.pro.monthly).
//   · After a purchase or a restore with `pro` active, the app asks Bobby's server to re-read the
//     account's entitlements (`/api/bobby-access` `revenuecat-sync`); the page re-asks only after that.
//   · No key, or a Test Store key (`test_…`) in a Release build: RevenueCat is never configured and the
//     Bobby Pro sheet says it opens soon.
import Combine
import Foundation
import RevenueCat

@MainActor
final class BobbyStore: NSObject, ObservableObject {
    static let shared = BobbyStore()
    /// App Store Connect: subscription group "Bobby Pro", price tier $4.99 / month.
    nonisolated static let proMonthlyID = "xyz.bobbyprotocol.bobby.pro.monthly"
    /// RevenueCat entitlement that unlocks unlimited reads.
    nonisolated static let entitlementID = "pro"
    /// Info.plist key fed by the REVENUECAT_IOS_API_KEY build setting (project.yml).
    nonisolated static let apiKeyInfoKey = "REVENUECAT_IOS_API_KEY"

    enum ProductState: Equatable { case idle, loading, loaded, missing, failed, notConfigured }

    enum Outcome: Equatable {
        /// Bobby's server confirmed the account is Pro.
        case subscribed
        /// Ask to Buy or a bank check: nothing to unlock yet.
        case pending
        case cancelled
        /// Restore found no active Bobby Pro on this Apple Account.
        case nothingToRestore
        /// A purchase needs the Bobby account it will belong to.
        case needsSignIn
        case failed(String)
    }

    @Published private(set) var package: Package?
    @Published private(set) var productState: ProductState = .idle
    @Published private(set) var busy = false
    /// What the last offerings call returned, for the dev line (DEBUG builds show it).
    @Published private(set) var diagnostics: String?

    private(set) var configured = false
    private var cancellables = Set<AnyCancellable>()
    /// The last entitlement expiry the server was told about (renewals and purchases made elsewhere).
    private var syncedExpiry: Date??

    var access: BobbyAccessCenter { BobbyAccessCenter.shared }

    /// The key this build may use: none when empty or unexpanded, and never a Test Store key outside DEBUG.
    nonisolated static func usableKey(_ raw: String?, debugBuild: Bool) -> String? {
        guard let key = raw?.trimmingCharacters(in: .whitespacesAndNewlines), !key.isEmpty, !key.hasPrefix("$(") else { return nil }
        if key.hasPrefix("test_") && !debugBuild { return nil }
        return key
    }

    /// The risk notice was accepted (R11: nothing reaches the network before consent).
    nonisolated static var consented: Bool {
        UserDefaults.standard.integer(forKey: "agent.riskNoticeVersion") >= RiskNotice.currentVersion
    }

    /// Unit-test hosts and fixture mode never reach RevenueCat.
    nonisolated static var allowedHere: Bool {
#if DEBUG
        ProcessInfo.processInfo.environment["XCTestConfigurationFilePath"] == nil && !NucleoFixtures.isActive
#else
        true
#endif
    }

    /// Configures RevenueCat once, after consent, with the signed-in account as its app user id.
    /// Called at launch, after the risk notice is accepted, and before the paywall opens.
    func start() {
        guard Self.consented, Self.allowedHere else { return }
        configure(appUserID: AccountSession.shared.session?.userId)
    }

    private func configure(appUserID: String?) {
        guard !configured,
              let key = Self.usableKey(Bundle.main.object(forInfoDictionaryKey: Self.apiKeyInfoKey) as? String,
                                       debugBuild: SignInMethods.isDebugBuild) else { return }
#if DEBUG
        Purchases.logLevel = .info
#else
        Purchases.logLevel = .warn
#endif
        Purchases.configure(withAPIKey: key, appUserID: appUserID)
        Purchases.shared.delegate = self
        configured = true
        AccountSession.shared.$session
            .map { $0?.userId }
            .removeDuplicates()
            .dropFirst()
            .receive(on: DispatchQueue.main)
            .sink { [weak self] userId in
                Task { await self?.identify(userId) }
            }
            .store(in: &cancellables)
    }

    /// Sign in → logIn(Supabase user id); sign out → logOut (an anonymous RevenueCat user stays as it is).
    func identify(_ userId: String?) async {
        guard configured else { return }
        syncedExpiry = nil
        if let userId {
            guard Purchases.shared.appUserID != userId else { return }
            _ = try? await Purchases.shared.logIn(userId)
        } else if !Purchases.shared.isAnonymous {
            _ = try? await Purchases.shared.logOut()
        }
    }

    func loadProduct() async {
        guard configured else { productState = .notConfigured; return }
        if package != nil { productState = .loaded; return }
        productState = .loading
        do {
            let offerings = try await Purchases.shared.offerings()
            let current = offerings.current
            // The current offering's monthly package; else any package that sells the monthly product.
            package = current?.monthly
                ?? current?.availablePackages.first { $0.storeProduct.productIdentifier == Self.proMonthlyID }
                ?? offerings.all.values.flatMap(\.availablePackages).first { $0.storeProduct.productIdentifier == Self.proMonthlyID }
            productState = package == nil ? .missing : .loaded
            diagnostics = Self.describe(offerings)
        } catch {
            productState = .failed
            diagnostics = "offerings failed: \((error as NSError).localizedDescription)"
        }
    }

    nonisolated static func describe(_ offerings: Offerings) -> String {
        let current = offerings.current.map { offering in
            "\(offering.identifier) [" + offering.availablePackages.map { "\($0.identifier)=\($0.storeProduct.productIdentifier) \($0.localizedPriceString)" }
                .joined(separator: ", ") + "]"
        } ?? "none"
        return "offerings: \(offerings.all.count) · current: \(current)"
    }

    func purchase() async -> Outcome {
        guard configured, let package else { return .failed(Copy.unavailable) }
        guard let userId = AccountSession.shared.session?.userId else { return .needsSignIn }
        busy = true
        defer { busy = false }
        guard await ensureIdentity(userId) else { return .failed(Copy.purchaseFailed) }
        do {
            let result = try await Purchases.shared.purchase(package: package)
            if result.userCancelled { return .cancelled }
            guard Self.isPro(result.customerInfo) else { return .failed(Copy.notLinked) }
            return await confirmWithServer(result.customerInfo)
        } catch {
            return Self.outcome(error)
        }
    }

    /// Restore Purchases: RevenueCat re-reads the Apple Account's purchases for this Bobby account.
    func restore() async -> Outcome {
        guard configured else { return .failed(Copy.unavailable) }
        guard let userId = AccountSession.shared.session?.userId else { return .needsSignIn }
        busy = true
        defer { busy = false }
        guard await ensureIdentity(userId) else { return .failed(Copy.purchaseFailed) }
        do {
            let info = try await Purchases.shared.restorePurchases()
            guard Self.isPro(info) else { return .nothingToRestore }
            return await confirmWithServer(info)
        } catch {
            return Self.outcome(error)
        }
    }

    /// A purchase belongs to the signed-in Bobby account: RevenueCat must know it before paying.
    private func ensureIdentity(_ userId: String) async -> Bool {
        if Purchases.shared.appUserID == userId { return true }
        return (try? await Purchases.shared.logIn(userId)) != nil
    }

    nonisolated static func isPro(_ info: CustomerInfo) -> Bool { info.entitlements[entitlementID]?.isActive == true }

    nonisolated static func outcome(_ error: Error) -> Outcome {
        switch error as? ErrorCode {
        case .purchaseCancelledError?: return .cancelled
        case .paymentPendingError?: return .pending
        default: return .failed(Copy.purchaseFailed)
        }
    }

    /// Bobby's server re-reads RevenueCat for this account; only its word makes the page re-ask.
    private func confirmWithServer(_ info: CustomerInfo) async -> Outcome {
        switch await access.syncRevenueCat() {
        case let .accepted(access):
            syncedExpiry = .some(info.entitlements[Self.entitlementID]?.expirationDate)
            // A server that has not seen the entitlement yet reports another tier: say so, retry later.
            if let access, !access.isPro { return .failed(Copy.notLinked) }
            return .subscribed
        case let .rejected(message):
            return .failed(message ?? Copy.notLinked)
        case .signedOut:
            return .needsSignIn
        case .unreachable:
            return .failed(Copy.unreachable)
        }
    }

    /// Renewals, Ask to Buy approvals and purchases made on another device reach the app as a new
    /// CustomerInfo: when `pro` is active with a new expiry, tell Bobby's server once.
    fileprivate func customerInfoChanged(pro: Bool, expiry: Date?, appUserID: String) {
        guard pro, !busy, let userId = AccountSession.shared.session?.userId, userId == appUserID else { return }
        if let synced = syncedExpiry, synced == expiry { return }
        syncedExpiry = .some(expiry)
        Task { _ = await access.syncRevenueCat() }
    }

    /// The price line: the package's localized price and its period ("$4.99 / month").
    func priceLine(spanish: Bool = L.isSpanish) -> String? {
        guard let package else { return nil }
        guard let period = periodName(spanish: spanish) else { return package.localizedPriceString }
        return package.localizedPriceString + " / " + period
    }

    /// "month" / "mes" for the renewal terms (nil when the product has no period).
    func periodName(spanish: Bool = L.isSpanish) -> String? {
        guard let period = package?.storeProduct.subscriptionPeriod else { return nil }
        return Self.periodName(value: period.value, unit: period.unit, spanish: spanish)
    }

    nonisolated static func periodName(value n: Int, unit: SubscriptionPeriod.Unit, spanish: Bool) -> String {
        switch unit {
        case .day: return n == 1 ? L.t("day", "día", spanish: spanish) : L.t("\(n) days", "\(n) días", spanish: spanish)
        case .week: return n == 1 ? L.t("week", "semana", spanish: spanish) : L.t("\(n) weeks", "\(n) semanas", spanish: spanish)
        case .month: return n == 1 ? L.t("month", "mes", spanish: spanish) : L.t("\(n) months", "\(n) meses", spanish: spanish)
        case .year: return n == 1 ? L.t("year", "año", spanish: spanish) : L.t("\(n) years", "\(n) años", spanish: spanish)
        @unknown default: return ""
        }
    }

    enum Copy {
        static var unavailable: String { L.t("Bobby Pro isn’t available right now. Try again later.", "Bobby Pro no está disponible ahora. Inténtalo más tarde.") }
        static var comingSoon: String { L.t("Bobby Pro opens very soon.", "Bobby Pro abre muy pronto.") }
        static var purchaseFailed: String { L.t("The App Store didn’t finish the purchase. Nothing was charged.", "La App Store no terminó la compra. No se hizo ningún cargo.") }
        static var notLinked: String {
            L.t("Your subscription is active, but Bobby couldn’t link it to your account yet. Tap Restore Purchases in a moment.",
                "Tu suscripción está activa, pero Bobby aún no pudo vincularla a tu cuenta. Toca Restaurar compras en un momento.")
        }
        static var unreachable: String {
            L.t("Bobby couldn’t confirm your subscription right now. Tap Restore Purchases in a moment.",
                "Bobby no pudo confirmar tu suscripción ahora. Toca Restaurar compras en un momento.")
        }
    }

#if DEBUG
    /// `-revenuecat-probe [appUserId]` (DEBUG): configure, log in with a test id, fetch the offerings once
    /// and print what came back, so RevenueCat's dashboard sees the SDK. Never runs in Release.
    func probe(appUserID: String) async {
        // Anonymous first, then logIn: never the simulator's own signed-in account.
        configure(appUserID: nil)
        guard configured else { print("[RevenueCatProbe] not configured: REVENUECAT_IOS_API_KEY is empty"); return }
        print("[RevenueCatProbe] configured · anonymous \(Purchases.shared.appUserID)")
        do {
            let login = try await Purchases.shared.logIn(appUserID)
            print("[RevenueCatProbe] logIn \(appUserID) created=\(login.created) entitlements=\(login.customerInfo.entitlements.all.keys.sorted())")
        } catch {
            print("[RevenueCatProbe] logIn failed: \((error as NSError).localizedDescription)")
        }
        await loadProduct()
        print("[RevenueCatProbe] \(diagnostics ?? "no diagnostics") · state=\(productState) · price=\(priceLine(spanish: false) ?? "none")")
    }
#endif
}

extension BobbyStore: PurchasesDelegate {
    nonisolated func purchases(_ purchases: Purchases, receivedUpdated customerInfo: CustomerInfo) {
        let pro = Self.isPro(customerInfo)
        let expiry = customerInfo.entitlements[Self.entitlementID]?.expirationDate
        let appUserID = purchases.appUserID
        Task { @MainActor in BobbyStore.shared.customerInfoChanged(pro: pro, expiry: expiry, appUserID: appUserID) }
    }
}
