import Foundation
import CryptoKit

/// Presentation preference only. It never changes the risk or analysis profile.
struct SpeakingDial {
    let defaults: UserDefaults
    init(defaults: UserDefaults = .standard) { self.defaults = defaults }
    static let values = ["plain", "terms", "technical"]
    func tag(_ owner: String?) -> String { SHA256.hash(data: Data((owner ?? "guest").utf8)).map { String(format: "%02x", $0) }.joined() }
    func key(_ owner: String?, _ field: String) -> String { "bobby.speaking." + tag(owner) + "." + field }
    func prepare(existing: Bool) {
        if defaults.object(forKey: "bobby.speaking.fresh") == nil { defaults.set(!existing, forKey: "bobby.speaking.fresh") }
    }
    func value(_ owner: String?) -> String? { defaults.string(forKey: key(owner, "value")).flatMap { Self.values.contains($0) ? $0 : nil } }
    func choose(_ value: String, owner: String?, feedback: Bool = false) {
        guard Self.values.contains(value) else { return }
        defaults.set(value, forKey: key(owner, "value"))
        if feedback { defaults.set(true, forKey: key(owner, "refined")) }
    }
    func inheritGuest(_ owner: String) {
        guard !defaults.bool(forKey: "bobby.speaking.claimed") else { return }
        defaults.set(true, forKey: "bobby.speaking.claimed")
        if value(owner) == nil, let v = value(nil) { choose(v, owner: owner) }
    }
    func delivered(_ id: String, owner: String?) {
        var ids = defaults.stringArray(forKey: key(owner, "reads")) ?? []
        guard !ids.contains(id) else { return }
        ids.append(id); defaults.set(Array(ids.suffix(32)), forKey: key(owner, "reads"))
        defaults.set(min(3, defaults.integer(forKey: key(owner, "count")) + 1), forKey: key(owner, "count"))
    }
    func json(_ owner: String?) -> [String: Any] {
        ["owner": tag(owner), "value": value(owner) as Any? ?? NSNull(),
         "offer": defaults.bool(forKey: "bobby.speaking.fresh") && value(owner) == nil,
         "refine": defaults.integer(forKey: key(owner, "count")) >= 3 && !defaults.bool(forKey: key(owner, "refined"))]
    }
}
