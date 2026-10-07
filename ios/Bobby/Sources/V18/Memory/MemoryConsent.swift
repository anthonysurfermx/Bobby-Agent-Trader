// The memory consent (1.8): what the person answered when Bobby asked "Should I remember what you
// ask about?", and the steps that turn memory on when they say yes.
//
// The answer is a record per account and per device: {version, decidedAt, accepted}. It lives in
// UserDefaults under the SHA-256 of the user id (as MemoryCenter keys its opt-in), so signing out
// never carries one account's answer to another, and a deleted account's key can never be asked
// for again. A decline is remembered so the offer does not nag; a new consent version asks again.
//
// The record gates capture. `MemoryCenter.allowsNativeCapture` decides on every desk request and
// affirms the opt-in only when this account's stored switch is on AND its record says "accepted"
// for the consent as it reads today. A switch without that record (the 1.7 switch, or an answer to
// an older version of the text) is revoked, and the person is asked again through the sheet.
// "Remember" reaches the switch through `setNativeCapture(true)`, after the server confirmed that
// account memory is on, and writes the record in the same step.
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
    /// The consent as it reads today. Tests pass a later one to stand for a reworded sheet.
    let version: Int

    init(defaults: UserDefaults = .standard, version: Int = currentVersion) {
        self.defaults = defaults
        self.version = version
    }

    static func key(user: String) -> String { keyPrefix + digest(user: user) }

    /// The SHA-256 of the user id in lowercase hex: what every per-account memory key on this phone is built from.
    static func digest(user: String) -> String {
        SHA256.hash(data: Data(user.utf8)).map { String(format: "%02x", $0) }.joined()
    }

    /// The last answer this account gave on this device, whatever its version.
    func record(user: String) -> MemoryConsentRecord? {
        guard let data = defaults.data(forKey: Self.key(user: user)) else { return nil }
        return try? Self.decoder.decode(MemoryConsentRecord.self, from: data)
    }

    /// True once the account answered the consent as it reads today (yes or no).
    func hasDecided(user: String) -> Bool {
        record(user: user)?.version == version
    }

    /// True only for a yes to the consent as it reads today. This is what capture is gated on.
    func hasAccepted(user: String) -> Bool {
        guard let record = record(user: user) else { return false }
        return record.version == version && record.accepted
    }

    func set(accepted: Bool, user: String, at date: Date = Date()) {
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
    /// The center's own store and version: the record written here is the one its gate reads.
    var consent: MemoryConsent { center.consent }
    var now: () -> Date = { Date() }

    init(center: MemoryCenter = .shared) { self.center = center }

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
