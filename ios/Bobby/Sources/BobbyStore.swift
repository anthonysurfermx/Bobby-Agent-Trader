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

/// Tracks only confirmed server synchronization. Failed or stale attempts remain retryable.
struct BobbySubscriptionSyncState {
    struct Key: Equatable {
        let userID: String
        let generation: UUID
        let expiry: Date?
    }
    struct Attempt: Equatable {
        let id = UUID()
        let key: Key
    }
    private(set) var confirmed: Key?
    private(set) var pending: Attempt?

    mutating func begin(_ key: Key) -> Attempt? {
        guard confirmed != key, pending?.key != key else { return nil }
        let attempt = Attempt(key: key)
        pending = attempt
        return attempt
    }

    mutating func finish(_ attempt: Attempt, succeeded: Bool) {
        guard pending == attempt else { return }
        pending = nil
        if succeeded { confirmed = attempt.key }
    }

    mutating func reset() { confirmed = nil; pending = nil }
}

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
    private var syncState = BobbySubscriptionSyncState()

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
        Task { await reconcile() }
        // Preload the monthly package so the price is ready when the Bobby Pro sheet opens.
        Task { await loadProduct() }
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
        syncState.reset()
        if let userId {
            if Purchases.shared.appUserID != userId {
                _ = try? await Purchases.shared.logIn(userId)
            }
            await reconcile()
        } else if !Purchases.shared.isAnonymous {
            _ = try? await Purchases.shared.logOut()
        }
    }

    /// Recover an active entitlement after launch or login without making another purchase.
    private func reconcile() async {
        guard configured, let userID = AccountSession.shared.session?.userId,
              Purchases.shared.appUserID == userID else { return }
        let generation = AccountSession.shared.generation
        guard let info = try? await Purchases.shared.customerInfo(),
              AccountSession.shared.session?.userId == userID,
              AccountSession.shared.generation == generation else { return }
        customerInfoChanged(pro: Self.isPro(info), expiry: info.entitlements[Self.entitlementID]?.expirationDate, appUserID: userID)
    }

    func loadProduct() async {
        guard configured else { productState = .notConfigured; return }
        if package != nil { productState = .loaded; return }
        // The launch preload and the sheet's own call can overlap: one offerings request at a time.
        guard productState != .loading else { return }
        productState = .loading
        do {
            let offerings = try await Purchases.shared.offerings()
            let current = offerings.current
            // The current offering's monthly package; else any package that sells the monthly product.
            package = current?.availablePackages.first { $0.storeProduct.productIdentifier == Self.proMonthlyID }
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
        guard !busy, configured, let package,
              package.storeProduct.productIdentifier == Self.proMonthlyID else { return .failed(Copy.unavailable) }
        guard let userId = AccountSession.shared.session?.userId else { return .needsSignIn }
        busy = true
        defer { busy = false }
        let generation = AccountSession.shared.generation
        guard await access.refresh(), access.applePayments == true else { return .failed(Copy.unavailable) }
        guard await ensureIdentity(userId), AccountSession.shared.session?.userId == userId,
              AccountSession.shared.generation == generation else { return .needsSignIn }
        do {
            let result = try await Purchases.shared.purchase(package: package)
            if result.userCancelled { return .cancelled }
            guard AccountSession.shared.session?.userId == userId,
                  AccountSession.shared.generation == generation else { return .needsSignIn }
            guard Self.isPro(result.customerInfo) else { return .failed(Copy.notLinked) }
            return await confirmWithServer(result.customerInfo)
        } catch {
            return Self.outcome(error)
        }
    }

    /// Restore Purchases: RevenueCat re-reads the Apple Account's purchases for this Bobby account.
    func restore() async -> Outcome {
        guard !busy, configured else { return .failed(Copy.unavailable) }
        guard let userId = AccountSession.shared.session?.userId else { return .needsSignIn }
        busy = true
        defer { busy = false }
        let generation = AccountSession.shared.generation
        guard await ensureIdentity(userId), AccountSession.shared.session?.userId == userId,
              AccountSession.shared.generation == generation else { return .needsSignIn }
        do {
            let info = try await Purchases.shared.restorePurchases()
            guard AccountSession.shared.session?.userId == userId,
                  AccountSession.shared.generation == generation else { return .needsSignIn }
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
        guard let userID = AccountSession.shared.session?.userId else { return .needsSignIn }
        let key = BobbySubscriptionSyncState.Key(userID: userID, generation: AccountSession.shared.generation,
                                                 expiry: info.entitlements[Self.entitlementID]?.expirationDate)
        let attempt = syncState.begin(key)
        let result = await access.syncRevenueCat()
        guard AccountSession.shared.session?.userId == userID,
              AccountSession.shared.generation == key.generation else { return .needsSignIn }
        if let attempt { syncState.finish(attempt, succeeded: Self.serverConfirmedPro(result)) }
        switch result {
        case let .accepted(access):
            guard access?.isPro == true else { return .failed(Copy.notLinked) }
            return .subscribed
        case .rejected:
            // The server's refusal is logged there; the person sees Bobby's own words, in their language.
            return .failed(Copy.notLinked)
        case .signedOut:
            return .needsSignIn
        case .unreachable:
            return .failed(Copy.unreachable)
        }
    }

    /// Renewals, Ask to Buy approvals and purchases made on another device reach the app as a new
    /// CustomerInfo: when `pro` is active with a new expiry, tell Bobby's server once.
    nonisolated static func serverConfirmedPro(_ result: BobbyAccessCenter.ServerSync) -> Bool {
        guard case let .accepted(access) = result else { return false }
        return access?.isPro == true
    }

    fileprivate func customerInfoChanged(pro: Bool, expiry: Date?, appUserID: String) {
        guard pro, !busy, let userID = AccountSession.shared.session?.userId, userID == appUserID else { return }
        let key = BobbySubscriptionSyncState.Key(userID: userID, generation: AccountSession.shared.generation, expiry: expiry)
        guard let attempt = syncState.begin(key) else { return }
        Task {
            // Retry transient failures without requiring a second purchase or a new expiry callback.
            for retry in 0..<3 {
                guard AccountSession.shared.session?.userId == key.userID,
                      AccountSession.shared.generation == key.generation,
                      syncState.pending == attempt else { return }
                let result = await access.syncRevenueCat()
                guard syncState.pending == attempt else { return }
                if Self.serverConfirmedPro(result) {
                    syncState.finish(attempt, succeeded: true)
                    return
                }
                guard result == .unreachable, retry < 2 else { break }
                do { try await Task.sleep(nanoseconds: UInt64(2 + retry * 3) * 1_000_000_000) }
                catch { break }
            }
            syncState.finish(attempt, succeeded: false)
        }
    }

    /// Bobby Pro can actually be bought here: RevenueCat has the package and Bobby's server takes App
    /// Store payments. The one gate for every Pro promise (invite rewards, the invite sheet's Pro card).
    var proPurchasable: Bool { package != nil && access.applePayments == true }

    /// The price line: the package's localized price and its period ("$4.99 / month").
    func priceLine(spanish: Bool = L.isSpanish) -> String? {
        guard let package else { return nil }
        guard let period = periodName(spanish: spanish) else { return package.localizedPriceString }
        return package.localizedPriceString + " / " + period
    }

    /// Guideline 3.1.2, next to the price: how it renews and where to cancel, from the product's own period.
    func renewsLine(spanish: Bool = L.isSpanish) -> String? {
        guard let period = package?.storeProduct.subscriptionPeriod else { return nil }
        return Self.renewsLine(value: period.value, unit: period.unit, spanish: spanish)
    }

    nonisolated static func renewsLine(value: Int, unit: SubscriptionPeriod.Unit, spanish: Bool) -> String {
        let cancel = L.t("Cancel anytime in Settings › Apple Account › Subscriptions.",
                         "Cancela cuando quieras en Configuración › Cuenta de Apple › Suscripciones.", spanish: spanish)
        if value == 1, unit == .month {
            return L.t("Renews monthly until you cancel.", "La suscripción se renueva cada mes hasta que la canceles.", spanish: spanish) + " " + cancel
        }
        let period = periodName(value: value, unit: unit, spanish: spanish)
        return L.t("Renews every \(period) until you cancel.", "La suscripción se renueva cada \(period) hasta que la canceles.", spanish: spanish) + " " + cancel
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
        static var purchaseFailed: String { L.t("Bobby couldn’t verify the purchase. Check your App Store subscriptions before trying again.", "Bobby no pudo verificar la compra. Revisa tus suscripciones en la App Store antes de intentarlo de nuevo.") }
        static var notLinked: String {
            L.t("Your subscription is active, but Bobby couldn’t link it to your account yet. Tap Restore Purchases in a moment.",
                "Tu suscripción está activa, pero Bobby aún no pudo vincularla a tu cuenta. Toca Restaurar compras en un momento.")
        }
        static var unreachable: String {
            L.t("Bobby couldn’t confirm your subscription right now. Tap Restore Purchases in a moment.",
                "Bobby no pudo confirmar tu suscripción ahora. Toca Restaurar compras en un momento.")
        }
        /// The one Bobby Pro benefit statement (server LEVEL_LIMITS.pro; Quick rides the unmetered read).
        static var benefits: String { benefits(spanish: L.isSpanish) }
        static func benefits(spanish: Bool) -> String {
            L.t("Unlimited Quick reads (fair use) · 60 Deep and 10 Max every 30 days",
                "Lecturas Rápidas ilimitadas (uso justo) · 60 Profundo y 10 Máximo cada 30 días", spanish: spanish)
        }
        static var signInFirst: String { L.t("Sign in first: Bobby Pro belongs to your Bobby account.", "Primero inicia sesión: Bobby Pro queda en tu cuenta de Bobby.") }
        static var restored: String { L.t("Bobby Pro is active on your account.", "Bobby Pro está activo en tu cuenta.") }
        static var nothingToRestore: String {
            L.t("No active Bobby Pro subscription on this Apple Account.", "No hay una suscripción activa de Bobby Pro en esta cuenta de Apple.")
        }
        static var pending: String {
            L.t("Waiting for approval. Bobby Pro starts as soon as the App Store confirms it.",
                "Esperando aprobación. Bobby Pro empieza en cuanto la App Store lo confirme.")
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
