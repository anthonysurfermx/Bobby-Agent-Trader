// The memory consent (1.8): what the person answered when Bobby asked "Should I remember what you
// ask about?", and the steps that turn memory on when they say yes.
//
// The answer is a record per account and per device: {version, decidedAt, accepted}. It lives in
// UserDefaults under the SHA-256 of the user id (as MemoryCenter keys its opt-in), so signing out
// never carries one account's answer to another, and a deleted account's key can never be asked
// for again. A decline is remembered so the offer does not nag; a new consent version asks again.
//
// The record is not what sends the header. `MemoryCenter.allowsNativeCapture` still decides that on
// every desk request: "Remember" only reaches it through `setNativeCapture(true)`, after the
// server confirmed that account memory is on.
import Combine
import CryptoKit
import Foundation

struct MemoryConsentRecord: Codable, Equatable, Sendable {
    let version: Int
    let decidedAt: Date
    let accepted: Bool
}

struct MemoryConsent {
    /// Bump when what the consent sheet says changes: everyone is asked again.
    static let currentVersion = 1
    static let keyPrefix = "v18.memoryConsent."

    let defaults: UserDefaults

    init(defaults: UserDefaults = .standard) { self.defaults = defaults }

    static func key(user: String) -> String {
        keyPrefix + SHA256.hash(data: Data(user.utf8)).map { String(format: "%02x", $0) }.joined()
    }

    /// The last answer this account gave on this device, whatever its version.
    func record(user: String) -> MemoryConsentRecord? {
        guard let data = defaults.data(forKey: Self.key(user: user)) else { return nil }
        return try? Self.decoder.decode(MemoryConsentRecord.self, from: data)
    }

    /// True once the account answered the consent as it reads today (yes or no).
    func hasDecided(user: String, version: Int = currentVersion) -> Bool {
        record(user: user)?.version == version
    }

    func hasAccepted(user: String, version: Int = currentVersion) -> Bool {
        guard let record = record(user: user) else { return false }
        return record.version == version && record.accepted
    }

    func set(accepted: Bool, user: String, at date: Date = Date(), version: Int = currentVersion) {
        let record = MemoryConsentRecord(version: version, decidedAt: date, accepted: accepted)
        if let data = try? Self.encoder.encode(record) { defaults.set(data, forKey: Self.key(user: user)) }
    }

    func clear(user: String) { defaults.removeObject(forKey: Self.key(user: user)) }

    private static let encoder: JSONEncoder = { let e = JSONEncoder(); e.dateEncodingStrategy = .millisecondsSince1970; return e }()
    private static let decoder: JSONDecoder = { let d = JSONDecoder(); d.dateDecodingStrategy = .millisecondsSince1970; return d }()
}

/// The consent sheet's two answers. Every step is fenced to the account that tapped: a reply that
/// arrives after the account changed turns nothing on and records nothing.
@MainActor
final class MemoryConsentModel: ObservableObject {
    enum Phase: Equatable {
        case asking
        case working
        /// A step failed; nothing was turned on. The sheet says so and the person may try again.
        case failed
        /// Memory is on for this account on this iPhone.
        case done
    }

    @Published private(set) var phase: Phase = .asking

    let center: MemoryCenter
    let consent: MemoryConsent
    var now: () -> Date = { Date() }

    init(center: MemoryCenter = .shared, consent: MemoryConsent = MemoryConsent()) {
        self.center = center
        self.consent = consent
    }

    var signedIn: Bool { center.currentUser() != nil }
    /// The server's own number when the memory screen already loaded it; its documented default otherwise.
    var retentionDays: Int { center.snapshot?.retentionDays ?? 90 }

    /// The account under the sheet changed: whatever it showed belonged to the previous one.
    func accountChanged() {
        center.accountChanged()
        phase = .asking
    }

    /// "Remember", in order, stopping at the first step that fails:
    /// read the account's memory, resume it if it is paused, opt this iPhone in, record the answer.
    @discardableResult
    func remember() async -> Bool {
        guard phase != .working, phase != .done else { return false }
        guard let user = center.currentUser() else { phase = .failed; return false }
        let generation = center.currentGeneration()
        let sameAccount = { [center] in center.currentUser() == user && center.currentGeneration() == generation }
        phase = .working
        guard await center.refresh(), sameAccount() else { return stop(sameAccount()) }
        if center.snapshot?.enabled != true {
            guard await center.setEnabled(true), sameAccount(), center.snapshot?.enabled == true else { return stop(sameAccount()) }
        }
        guard center.setNativeCapture(true), sameAccount() else { return stop(sameAccount()) }
        consent.set(accepted: true, user: user, at: now())
        phase = .done
        return true
    }

    /// "Not now": remembered so the offer does not come back, and this iPhone stays out of memory.
    func decline() {
        guard phase != .working, let user = center.currentUser() else { return }
        _ = center.setNativeCapture(false)
        consent.set(accepted: false, user: user, at: now())
    }

    private func stop(_ sameAccount: Bool) -> Bool {
        // A different account is now under the sheet: it sees the question, not the other's failure.
        phase = sameAccount ? .failed : .asking
        return false
    }
}
