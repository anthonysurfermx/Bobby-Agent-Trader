import Combine
import Foundation

/// Gifted uses are distinct from plan allowance and never grant a subscription.
struct CouponCredits: Equatable, Sendable {
    let reads: Int
    let profundo: Int
    let maximo: Int

    var total: Int { reads + profundo + maximo }

    init?(json: Any?) {
        guard let body = json as? [String: Any],
              let reads = Self.count(body["reads"]),
              let profundo = Self.count(body["profundo"]),
              let maximo = Self.count(body["maximo"]) else { return nil }
        self.reads = reads
        self.profundo = profundo
        self.maximo = maximo
    }

    /// JSON booleans, fractions, strings and negative/overflow counts are not credits.
    static func count(_ value: Any?) -> Int? {
        guard let number = value as? NSNumber, CFGetTypeID(number) != CFBooleanGetTypeID() else { return nil }
        let value = number.doubleValue
        guard value.isFinite, value >= 0, value < 1e9, value.rounded(.towardZero) == value else { return nil }
        return Int(value)
    }
}

struct CouponRedemptionReceipt: Equatable, Sendable {
    /// Present only when this request confirmed a new redemption; never added to a cached balance.
    let granted: CouponCredits?
    /// The RPC balance, or all three validated quota gift balances; separate from plan `remaining`.
    let bonus: CouponCredits?
    var balanceVerified: Bool { bonus != nil }
}

enum CouponRedemptionFailure: Equatable, Sendable {
    case accountRequired, invalidCode, expired, exhausted, rateLimited, unavailable, invalidResponse
}

enum CouponRedemptionOutcome: Equatable, Sendable {
    case redeemed(CouponRedemptionReceipt)
    case alreadyRedeemed(CouponRedemptionReceipt)
    case failed(CouponRedemptionFailure)
}

/// Account-bound coupon redemption. It never calls a store or RevenueCat restore/sync.
@MainActor
final class CouponRedemptionCenter: ObservableObject {
    struct Reply {
        let json: Any?
        let status: Int
    }
    typealias Sender = @MainActor (String, String, [String: Any], BobbyMeterAuth, UUID) async throws -> Reply
    typealias ApplySnapshot = @MainActor ([String: Any], String, UUID) -> Void

    @Published private(set) var isRedeeming = false
    @Published private(set) var isCheckingBalance = false
    @Published private(set) var outcome: CouponRedemptionOutcome?

    private let auth: BobbyMeterAuth
    private let currentUser: @MainActor () -> String?
    private let currentGeneration: @MainActor () -> UUID
    private let send: Sender
    private let applySnapshot: ApplySnapshot
    private var owner: String?
    private var ownerGeneration: UUID
    private var requestGeneration = UUID()
    private var request: Task<Reply, Error>?
    private var cancellables = Set<AnyCancellable>()

    init(auth: BobbyMeterAuth = .account,
         currentUser: @escaping @MainActor () -> String? = { AccountSession.shared.session?.userId },
         currentGeneration: @escaping @MainActor () -> UUID = { AccountSession.shared.generation },
         observeAccount: Bool = true,
         send: @escaping Sender = { path, method, body, auth, generation in
             let reply = try await BobbyAccessAPI.send(path, method: method, body: method == "GET" ? nil : body, auth: auth, expectedOwner: generation)
             return Reply(json: reply.json, status: reply.status)
         },
         applySnapshot: @escaping ApplySnapshot = { body, userID, generation in
             BobbyAccessCenter.shared.recordCouponAccess(BobbyReadAccess(json: body["access"]), userID: userID, generation: generation)
             NucleoLevelCenter.shared.applyCouponSnapshot(body, userID: userID, generation: generation)
         }) {
        self.auth = auth
        self.currentUser = currentUser
        self.currentGeneration = currentGeneration
        self.send = send
        self.applySnapshot = applySnapshot
        owner = currentUser()
        ownerGeneration = currentGeneration()
        if observeAccount {
            NotificationCenter.default.publisher(for: AccountSession.didChange)
                .receive(on: DispatchQueue.main)
                .sink { [weak self] _ in self?.accountChanged() }
                .store(in: &cancellables)
        }
    }

    func dismissOutcome() { outcome = nil }

    /// Closing the sheet invalidates its result even if the transport ignores cancellation.
    func cancel() {
        requestGeneration = UUID()
        request?.cancel()
        request = nil
        isRedeeming = false
        isCheckingBalance = false
        outcome = nil
    }

    func accountChanged() {
        guard owner != currentUser() || ownerGeneration != currentGeneration() else { return }
        cancel()
        owner = currentUser()
        ownerGeneration = currentGeneration()
    }

    /// A second tap while in flight sends nothing. A lost response is retried by the user against
    /// the server's once-per-account redemption; the app never optimistically adds credits.
    @discardableResult
    func redeem(code: String, expectedUserID: String? = nil, expectedGeneration: UUID? = nil) async -> CouponRedemptionOutcome? {
        // The button captures intent synchronously, before its outer Task can start for another
        // account. Do not rebind that intent or send a code using a later account's credentials.
        if let expectedGeneration {
            guard currentUser() == expectedUserID, currentGeneration() == expectedGeneration else { return nil }
        } else if let expectedUserID {
            guard currentUser() == expectedUserID else { return nil }
        }
        accountChanged()
        guard !isRedeeming, !isCheckingBalance else { return nil }
        guard let userID = currentUser(), !userID.isEmpty else { return finish(.failed(.accountRequired)) }
        guard let normalized = Self.normalizedCode(code) else { return finish(.failed(.invalidCode)) }
        guard !Task.isCancelled else { return nil }
        let generation = currentGeneration()
        let revision = UUID()
        requestGeneration = revision
        isRedeeming = true
        outcome = nil
        let send = self.send
        let auth = self.auth
        let task = Task { @MainActor in
            guard self.current(userID, generation, revision), !Task.isCancelled else { throw CancellationError() }
            return try await send(BobbyAccessAPI.accessPath, "POST", ["action": "redeem-coupon", "code": normalized], auth, generation)
        }
        request = task
        defer {
            if requestGeneration == revision {
                request = nil
                isRedeeming = false
            }
        }
        let reply: Reply
        do {
            reply = try await withTaskCancellationHandler {
                try await task.value
            } onCancel: {
                task.cancel()
            }
        } catch {
            guard current(userID, generation, revision), !Task.isCancelled, !task.isCancelled else { return nil }
            if error is CancellationError { return nil }
            return finish(.failed(.unavailable))
        }
        guard current(userID, generation, revision), !Task.isCancelled, !task.isCancelled else { return nil }
        let parsed = Self.parse(reply)
        if let snapshot = parsed.snapshot {
            // No suspension between the owner check, applying both centers and publishing the receipt.
            applySnapshot(snapshot, userID, generation)
        }
        // Publishing either center may synchronously notify a subscriber that changes accounts.
        guard current(userID, generation, revision), !Task.isCancelled else { return nil }
        return finish(parsed.outcome)
    }

    /// A fresh, complete gift balance from this GET only. Cached/legacy models cannot turn a
    /// missing meter into a successful zero balance. Redemption and balance checks share one flight.
    func checkBalance(expectedUserID: String? = nil, expectedGeneration: UUID? = nil) async -> CouponCredits? {
        if let expectedGeneration {
            guard currentUser() == expectedUserID, currentGeneration() == expectedGeneration else { return nil }
        } else if let expectedUserID {
            guard currentUser() == expectedUserID else { return nil }
        }
        accountChanged()
        guard !isRedeeming, !isCheckingBalance, let userID = currentUser(), !userID.isEmpty, !Task.isCancelled else { return nil }
        let generation = currentGeneration()
        let revision = UUID()
        requestGeneration = revision
        isCheckingBalance = true
        let send = self.send
        let auth = self.auth
        let task = Task { @MainActor in
            guard self.current(userID, generation, revision), !Task.isCancelled else { throw CancellationError() }
            return try await send(BobbyAccessAPI.accessPath, "GET", [:], auth, generation)
        }
        request = task
        defer {
            if requestGeneration == revision {
                request = nil
                isCheckingBalance = false
            }
        }
        let reply: Reply
        do {
            reply = try await withTaskCancellationHandler {
                try await task.value
            } onCancel: {
                task.cancel()
            }
        } catch { return nil }
        guard current(userID, generation, revision), !Task.isCancelled, !task.isCancelled,
              (200..<300).contains(reply.status), let body = reply.json as? [String: Any] else { return nil }
        let snapshot = Self.validatedSnapshot(body)
        guard let balance = Self.giftBalance(snapshot), let snapshot else { return nil }
        applySnapshot(snapshot, userID, generation)
        guard current(userID, generation, revision), !Task.isCancelled else { return nil }
        return balance
    }

    private func current(_ userID: String, _ generation: UUID, _ revision: UUID) -> Bool {
        currentUser() == userID && currentGeneration() == generation && requestGeneration == revision
    }

    private func finish(_ result: CouponRedemptionOutcome) -> CouponRedemptionOutcome {
        outcome = result
        return result
    }

    nonisolated static func normalizedCode(_ code: String) -> String? {
        guard code.utf8.count <= 512 else { return nil }
        let normalized = String(String.UnicodeScalarView(code.uppercased().unicodeScalars.filter {
            !CharacterSet.whitespacesAndNewlines.contains($0)
        }))
        return normalized.range(of: #"^[A-Z0-9][A-Z0-9-]{3,31}$"#, options: .regularExpression) != nil ? normalized : nil
    }

    private static func parse(_ reply: Reply) -> (outcome: CouponRedemptionOutcome, snapshot: [String: Any]?) {
        guard let body = reply.json as? [String: Any], let result = body["result"] as? String else {
            return (.failed(reply.status == 401 ? .accountRequired : reply.status == 429 ? .rateLimited :
                            (500...599).contains(reply.status) ? .unavailable : .invalidResponse), nil)
        }
        guard (200..<300).contains(reply.status) else {
            let error: CouponRedemptionFailure
            if reply.status == 401 { error = .accountRequired }
            else if reply.status == 429 { error = .rateLimited }
            else if (500...599).contains(reply.status) { error = .unavailable }
            else { error = failure(result) ?? .invalidResponse }
            return (.failed(error), nil)
        }
        guard result == "redeemed" || result == "already_redeemed" else {
            return (.failed(failure(result) ?? .invalidResponse), nil)
        }
        let granted = result == "redeemed" ? CouponCredits(json: body["granted"]) : nil
        guard result != "redeemed" || (granted?.total ?? 0) > 0 else { return (.failed(.invalidResponse), nil) }
        let rawBonus = body["bonus"]
        let bonus = CouponCredits(json: rawBonus)
        guard rawBonus == nil || rawBonus is NSNull || bonus != nil else { return (.failed(.invalidResponse), nil) }
        let snapshot = validatedSnapshot(body)
        let receipt = CouponRedemptionReceipt(granted: granted, bonus: bonus ?? giftBalance(snapshot))
        let outcome: CouponRedemptionOutcome = result == "redeemed" ? .redeemed(receipt) : .alreadyRedeemed(receipt)
        return (outcome, snapshot)
    }

    /// Already-redeemed RPCs may omit `bonus`. Read all three server balances, never the grant or
    /// a cached balance; an incomplete quota snapshot stays unverified.
    private static func giftBalance(_ snapshot: [String: Any]?) -> CouponCredits? {
        guard let access = snapshot?["access"] as? [String: Any],
              let levels = snapshot?["levels"] as? [String: Any],
              let meters = levels["levels"] as? [String: Any],
              let deep = meters["profundo"] as? [String: Any], let max = meters["maximo"] as? [String: Any] else { return nil }
        return CouponCredits(json: ["reads": access["bonus"] ?? NSNull(), "profundo": deep["bonus"] ?? NSNull(), "maximo": max["bonus"] ?? NSNull()])
    }

    private static func failure(_ result: String) -> CouponRedemptionFailure? {
        switch result {
        case "account_required": return .accountRequired
        case "invalid_code": return .invalidCode
        case "expired": return .expired
        case "exhausted": return .exhausted
        case "rate_limited": return .rateLimited
        default: return nil
        }
    }

    /// Post-redemption quota reads may independently fail. Keep the confirmed gift receipt, but
    /// only forward explicit account tiers and whole, non-negative quota fields to the shared UI.
    private static func validatedSnapshot(_ body: [String: Any]) -> [String: Any]? {
        var snapshot: [String: Any] = [:]
        if let access = body["access"] as? [String: Any], validTier(access["tier"]),
           validUsed(access), CouponCredits.count(access["bonus"]) != nil,
           validNullableCount(access["limit"]), validNullableCount(access["remaining"]),
           let paywall = access["paywall"] as? NSNumber, CFGetTypeID(paywall) == CFBooleanGetTypeID(),
           validReset(access["resetsAt"]) {
            snapshot["access"] = access
        }
        if let levels = body["levels"] as? [String: Any], validTier(levels["tier"]),
           let meters = levels["levels"] as? [String: Any],
           ["profundo", "maximo"].allSatisfy({ name in
               guard let meter = meters[name] as? [String: Any] else { return false }
               return ["used", "limit", "remaining", "bonus", "windowDays"].allSatisfy {
                   CouponCredits.count(meter[$0]) != nil
               } && validReset(meter["resetsAt"])
           }), snapshot["access"] == nil || (snapshot["access"] as? [String: Any])?["tier"] as? String == levels["tier"] as? String {
            snapshot["levels"] = levels
        }
        return snapshot
    }

    private static func validUsed(_ access: [String: Any]) -> Bool {
        if CouponCredits.count(access["used"]) != nil { return true }
        // Pro has no general read meter: the backend deliberately returns all three as null.
        return access["tier"] as? String == "pro" && access["used"] is NSNull &&
            access["limit"] is NSNull && access["remaining"] is NSNull
    }

    private static func validTier(_ value: Any?) -> Bool { (value as? String).map { ["free", "pro"].contains($0) } ?? false }
    private static func validNullableCount(_ value: Any?) -> Bool { value is NSNull || CouponCredits.count(value) != nil }
    private static func validReset(_ value: Any?) -> Bool {
        if value == nil || value is NSNull { return true }
        guard let value = value as? String else { return false }
        return BobbyAccessAPI.date(value) != nil
    }
}
