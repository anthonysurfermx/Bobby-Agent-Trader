import Foundation
import Combine
import Security

struct CompanionQuestion: Codable, Identifiable, Equatable {
    struct Option: Codable, Identifiable, Equatable { let id: String; let label: [String: String] }
    let id: String
    let day: Int
    let money: Bool
    let source: String
    let text: [String: String]
    let options: [Option]
    let spoken: [String]
    let labels: [String: [String: String]]?
    func accepts(_ value: String) -> Bool { value == "unsure" || options.contains { $0.id == value } || spoken.contains(value) }
    var title: String { text[L.language] ?? text["en"] ?? "" }
    private func catalogLabel(_ value: String) -> String? {
        let row = options.first { $0.id == value }?.label ?? labels?[value] ?? (value == "unsure" ? CompanionCatalog.bundled.unsure : nil)
        return row?[L.language] ?? row?["en"]
    }
    func label(_ value: String) -> String? { catalogLabel(value) ?? (accepts(value) ? title : nil) }
    func needsConfirmation(_ value: String) -> Bool { accepts(value) && catalogLabel(value) == nil }
    var json: [String: Any] { ["id": id, "text": title, "options": options.map { ["id": $0.id, "label": $0.label[L.language] ?? $0.label["en"] ?? ""] }] }
}

enum CompanionCatalog {
    struct Catalog: Codable { let version: Int; let unsure: [String: String]?; let questions: [CompanionQuestion] }
    static let bundled: Catalog = {
        guard let root = Bundle.main.url(forResource: "Nucleo", withExtension: nil),
              let data = try? Data(contentsOf: root.appendingPathComponent("companion-questions.json")),
              let catalog = try? JSONDecoder().decode(Catalog.self, from: data) else { return Catalog(version: 0, unsure: nil, questions: []) }
        return catalog
    }()
    static var questions: [CompanionQuestion] { bundled.questions }
    static func question(_ id: String) -> CompanionQuestion? { questions.first { $0.id == id } }
}

enum CompanionCopy {
    private static let copy: [String: Any] = {
        guard let root = Bundle.main.url(forResource: "Nucleo", withExtension: nil),
              let data = try? Data(contentsOf: root.appendingPathComponent("companion-copy.json")),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return [:] }
        return json
    }()
    static func text(_ key: String) -> String {
        let row = (copy["texts"] as? [String: [String: String]])?[key]
        return row?[L.language] ?? row?["en"] ?? ""
    }
    static var privacyURL: URL {
        var url = URLComponents(url: L.site("privacy"), resolvingAgainstBaseURL: false)!
        url.fragment = "notes"
        return url.url!
    }
    static var consent: [String] {
        let rows = copy["consent"] as? [String: [String]]
        return rows?[L.language] ?? rows?["en"] ?? []
    }
    static var json: [String: Any] {
        let keys = ["retry", "skip", "close", "personalized", "answerFailed", "answerPlaceholder", "answerSend", "exerciseExplanation", "answerThis", "answerHint"]
        return Dictionary(uniqueKeysWithValues: keys.map { ($0, text($0)) })
    }
}

/// Only enumerated notes enter the wire. Keychain is device-only and protected while locked; no sync.
@MainActor
final class CompanionContextStore: ObservableObject {
    static let shared: CompanionContextStore = {
        let store = CompanionContextStore()
        store.prepareInstall(defaults: .standard)
        return store
    }()
    static let notice = "memory-1"
    struct Note: Codable, Equatable, Identifiable {
        var id: String { field }
        let field: String, value: String, source: String
        let createdAt: Date, expiresAt: Date
        var json: [String: Any] { ["field": field, "value": value, "source": source] }
    }
    struct State: Codable, Equatable {
        var notice: String? = nil
        var accepted = false
        var decidedAt: Date? = nil
        var day = 1
        var lastOpen: Date? = nil
        var answeredOn: Date? = nil
        var asked: [String] = []
        var notes: [Note] = []
    }
    @Published private(set) var state = State()
    @Published private(set) var storageError = false
    private(set) var revision = UUID()
    var changed: () -> Void = {}
    let account: String
    private let read: () -> Data?
    private let write: (Data) -> Bool
    private let remove: () -> Bool
    private var installDefaults: UserDefaults?
    init(account: String = "companion-context-device-v1", read: (() -> Data?)? = nil, write: ((Data) -> Bool)? = nil, remove: (() -> Bool)? = nil) {
        self.account = account
        self.read = read ?? { Self.readKeychain(account) }
        self.write = write ?? { Self.writeKeychain(account, $0) }
        self.remove = remove ?? (write.map { writer in { writer(Data()) } } ?? { Self.removeKeychain(account) })
        if let data = self.read(), let saved = try? JSONDecoder().decode(State.self, from: data) { state = saved }
    }
    /// The install marker is deliberately outside Keychain, so reinstalling drops an old device record.
    func prepareInstall(defaults: UserDefaults) {
        installDefaults = defaults
        let key = "companion.context.install.v1"
        guard !defaults.bool(forKey: key) else { return }
        if reset() { defaults.set(true, forKey: key) }
    }
    @discardableResult func reset() -> Bool {
        let removed = remove()
        if !removed { installDefaults?.removeObject(forKey: "companion.context.install.v1") }
        state = State(); storageError = !removed; revision = UUID(); changed()
        return removed
    }
    private static func removeKeychain(_ account: String) -> Bool {
        let status = SecItemDelete(query(account) as CFDictionary)
        return status == errSecSuccess || status == errSecItemNotFound
    }
    var accepted: Bool { state.accepted && state.notice == Self.notice }
    var decided: Bool { state.notice == Self.notice && state.decidedAt != nil }
    func allows(_ capability: CompanionPilot.Capability) -> Bool {
        capability.context && capability.catalog == CompanionCatalog.bundled.version && capability.notices.contains(Self.notice)
    }
    @discardableResult private func save(_ proposed: State) -> Bool {
        guard let data = try? JSONEncoder().encode(proposed), write(data) else { storageError = true; return false }
        state = proposed; storageError = false; revision = UUID(); changed(); return true
    }
    func choose(_ yes: Bool, now: Date = Date(), calendar: Calendar = .current) {
        var next = yes && accepted ? state : State()
        next.notice = Self.notice; next.accepted = yes; next.decidedAt = now
        if yes && !accepted { next.lastOpen = calendar.startOfDay(for: now) }
        _ = save(next)
    }
    func opened(now: Date = Date(), calendar: Calendar = .current) {
        guard accepted else { return }
        var next = state
        let today = calendar.startOfDay(for: now)
        if let last = next.lastOpen, !calendar.isDate(last, inSameDayAs: today) {
            next.day = min(60, next.day + 1)
        }
        next.lastOpen = today
        next.notes.removeAll { $0.expiresAt <= now }
        if next != state { _ = save(next) }
    }
    func answered(now: Date = Date()) {
        guard accepted else { return }
        opened(now: now)
        var next = state
        next.answeredOn = Calendar.current.startOfDay(for: now)
        if next != state { _ = save(next) }
    }
    var mayAskToday: Bool {
        accepted && state.answeredOn.map { Calendar.current.isDateInToday($0) } == true
    }
    func next(preferred: String? = nil, afterAnswer: Bool = false, now: Date = Date()) -> CompanionQuestion? {
        guard mayAskToday else { return nil }
        let eligible = CompanionCatalog.questions.filter { question in question.day <= state.day && !state.asked.contains(question.id) && !state.notes.contains(where: { $0.field == question.id }) }
        let question = preferred.flatMap { id in eligible.first { $0.id == id } } ?? eligible.first
        // Stop the chain at money; do not jump ahead to a later question.
        return afterAnswer && question?.money == true ? nil : question
    }
    func answer(_ id: String, value: String?, source: String? = nil, now: Date = Date()) {
        guard accepted, let question = CompanionCatalog.question(id), question.day <= state.day else { return }
        var next = state
        if let value {
            guard question.options.contains(where: { $0.id == value }) else { return }
            let provenance = source == "confirmed" ? "confirmed" : question.source
            next.notes.removeAll { $0.field == id }
            next.notes.append(Note(field: id, value: value, source: provenance, createdAt: now,
                expiresAt: now.addingTimeInterval(Double(question.money || provenance == "inferred" ? 7 : 30) * 86400)))
        }
        if !next.asked.contains(id) { next.asked.append(id) }
        _ = save(next)
    }
    /// Reject malformed or unrelated patches atomically. Raw answer text never enters this store.
    @discardableResult func apply(_ patch: [String: Any], for id: String, now: Date = Date()) -> Bool {
        guard accepted, Set(patch.keys) == Set(["notes", "asked"]),
              let question = CompanionCatalog.question(id), question.day <= state.day,
              let notes = patch["notes"] as? [[String: Any]], notes.count == 1,
              let asked = patch["asked"] as? [String], asked == [id], let note = notes.first,
              Set(note.keys) == Set(["field", "value", "source"]), note["field"] as? String == id,
              let value = note["value"] as? String, question.accepts(value),
              let source = note["source"] as? String, (["said", "inferred"].contains(source) || id == "fall" && source == "shown") else { return false }
        var next = state
        next.notes.removeAll { $0.field == id }
        next.notes.append(Note(field: id, value: value, source: source, createdAt: now,
            expiresAt: now.addingTimeInterval(Double(question.money || source == "inferred" ? 7 : 30) * 86400)))
        if !next.asked.contains(id) { next.asked.append(id) }
        return save(next)
    }
    func delete(_ id: String) { var next = state; next.notes.removeAll { $0.field == id }; _ = save(next) }
    func deleteAll() { var next = state; next.notes = []; _ = save(next) }
    func wire(capability: CompanionPilot.Capability, now: Date = Date()) -> [String: Any]? {
        guard accepted, allows(capability) else { return nil }
        opened(now: now)
        return ["version": 1, "consent": ["notice": Self.notice, "memory": true, "money": true],
                "day": state.day, "asked": state.asked, "notes": state.notes.filter { $0.expiresAt > now }.map(\.json)]
    }
    private static func query(_ account: String) -> [String: Any] {
        [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: "xyz.bobbyprotocol.bobby.companion.context",
         kSecAttrAccount as String: account, kSecAttrSynchronizable as String: false]
    }
    private static func readKeychain(_ account: String) -> Data? {
        var q = query(account); q[kSecReturnData as String] = true; q[kSecMatchLimit as String] = kSecMatchLimitOne
        var value: CFTypeRef?
        return SecItemCopyMatching(q as CFDictionary, &value) == errSecSuccess ? value as? Data : nil
    }
    private static func writeKeychain(_ account: String, _ data: Data) -> Bool {
        let q = query(account)
        let attrs: [String: Any] = [kSecValueData as String: data, kSecAttrAccessible as String: kSecAttrAccessibleWhenUnlockedThisDeviceOnly]
        let status = SecItemUpdate(q as CFDictionary, attrs as CFDictionary)
        if status == errSecSuccess { return true }
        guard status == errSecItemNotFound else { return false }
        return SecItemAdd(q.merging(attrs) { _, b in b } as CFDictionary, nil) == errSecSuccess
    }
}
