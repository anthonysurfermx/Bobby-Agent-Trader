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
    /// Additive server metadata; build 69 catalogs remain decodable. Not rendered in I-0.
    let why: [String: String]?
    let options: [Option]
    let spoken: [String]
    let labels: [String: [String: String]]?
    func accepts(_ value: String) -> Bool { value == "unsure" || options.contains { $0.id == value } || spoken.contains(value) }
    var correctionValues: [String] { (options.map(\.id) + spoken + ["unsure"]).reduce(into: [String]()) { values, value in if !values.contains(value) { values.append(value) } } }
    var title: String { text[L.language] ?? text["en"] ?? "" }
    private func catalogLabel(_ value: String) -> String? {
        let row = options.first { $0.id == value }?.label ?? labels?[value] ?? (value == "unsure" ? CompanionCatalog.bundled.unsure : nil)
        return row?[L.language] ?? row?["en"]
    }
    func label(_ value: String) -> String? { catalogLabel(value) ?? (accepts(value) ? title : nil) }
    func needsConfirmation(_ value: String) -> Bool { accepts(value) && catalogLabel(value) == nil }
    var json: [String: Any] {
        var result: [String: Any] = ["id": id, "text": title, "options": options.map { ["id": $0.id, "label": $0.label[L.language] ?? $0.label["en"] ?? ""] }]
        if let reason = why?[L.language] ?? why?["en"] { result["why"] = reason }
        result["questionId"] = id; result["money"] = money; result["kind"] = "question"
        return result
    }
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
        let keys = (copy["texts"] as? [String: Any]).map { Array($0.keys) } ?? []
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
        var ownerTag: String? = nil
        var rest: [String: Date]? = nil
        var rests: [String: Int]? = nil
    }
    @Published private(set) var state = State()
    @Published private(set) var storageError = false
    private(set) var revision = UUID()
    var changed: () -> Void = {}
    let account: String
    private let read: () -> Data?
    private let write: (Data) -> Bool
    private let remove: () -> Bool
    let clock: () -> Date
    private let elapsed: () -> TimeInterval
    private var expiryAnchor: Date
    private var expiryAnchorElapsed: TimeInterval
    private var expiryTask: Task<Void, Never>?
    private var expiryGeneration = UUID()
    private var installDefaults: UserDefaults?
    private(set) var undecodableRecord: Data?
    private var declineForLaunch = false
    private var ownerBlocked = false
    init(account: String = "companion-context-device-v1", read: (() -> Data?)? = nil, write: ((Data) -> Bool)? = nil, remove: (() -> Bool)? = nil, clock: @escaping () -> Date = Date.init, elapsed: @escaping () -> TimeInterval = { ProcessInfo.processInfo.systemUptime }) {
        self.clock = clock; self.elapsed = elapsed
        self.expiryAnchor = clock(); self.expiryAnchorElapsed = elapsed()
        self.account = account
        self.read = read ?? { Self.readKeychain(account) }
        self.write = write ?? { Self.writeKeychain(account, $0) }
        self.remove = remove ?? (write.map { writer in { writer(Data()) } } ?? { Self.removeKeychain(account) })
        if let data = self.read() {
            if let saved = try? JSONDecoder().decode(State.self, from: data) { state = saved }
            else { undecodableRecord = data; storageError = true }
        }
        if let last = state.lastOpen, last > expiryAnchor { expiryAnchor = last }
        expireDueNotes()
    }
    deinit { expiryTask?.cancel() }

    /// Expiry keeps advancing while this store is alive, even if the device date moves back.
    /// Creation dates stay the caller's date; reading never renews a note.
    private func expiryNow(observing date: Date? = nil) -> Date {
        let tick = elapsed()
        let progressed = expiryAnchor.addingTimeInterval(max(0, tick - expiryAnchorElapsed))
        let observed = date ?? clock()
        if observed > progressed { expiryAnchor = observed; expiryAnchorElapsed = tick; return observed }
        return progressed
    }
    private func scheduleExpiry() {
        expiryTask?.cancel(); expiryTask = nil; expiryGeneration = UUID()
        guard accepted, let due = state.notes.map(\.expiresAt).min() else { return }
        let delay = max(0.01, due.timeIntervalSince(expiryNow())), token = expiryGeneration
        expiryTask = Task { @MainActor [weak self] in
            do { try await Task.sleep(for: .seconds(delay)) } catch { return }
            guard let self, !Task.isCancelled, self.expiryGeneration == token else { return }
            self.expireDueNotes()
        }
    }
    func expireDueNotes(now: Date? = nil) {
        let now = expiryNow(observing: now); var next = state
        let expired = next.notes.filter { $0.expiresAt <= now }.map(\.field)
        guard !expired.isEmpty else { scheduleExpiry(); return }
        next.notes.removeAll { expired.contains($0.field) }; next.asked.removeAll { expired.contains($0) }
        if !save(next) {
            // A failed disk write must not keep expired personal data visible or sendable in RAM.
            state = next; revision = UUID(); changed(); scheduleExpiry()
        }
    }
    /// The install marker is deliberately outside Keychain, so reinstalling drops an old device record.
    func prepareInstall(defaults: UserDefaults) {
        installDefaults = defaults
        if let undecodableRecord { defaults.set(undecodableRecord, forKey: "companion.context.undecodable.v1") }
        let key = "companion.context.install.v1"
        guard !defaults.bool(forKey: key) else { return }
        if reset() { defaults.set(true, forKey: key) }
    }
    @discardableResult func reset() -> Bool {
        let removed = remove()
        if !removed { installDefaults?.removeObject(forKey: "companion.context.install.v1") }
        state = State(); declineForLaunch = false; ownerBlocked = false; storageError = !removed; revision = UUID(); changed(); scheduleExpiry()
        return removed
    }
    private static func removeKeychain(_ account: String) -> Bool {
        let status = SecItemDelete(query(account) as CFDictionary)
        return status == errSecSuccess || status == errSecItemNotFound
    }
    var accepted: Bool { !ownerBlocked && state.accepted && state.notice == Self.notice }
    var decided: Bool { declineForLaunch || state.notice == Self.notice && state.decidedAt != nil }
    func allows(_ capability: CompanionPilot.Capability) -> Bool {
        capability.context && capability.catalog == CompanionCatalog.bundled.version && capability.notices.contains(Self.notice)
    }
    @discardableResult private func save(_ proposed: State) -> Bool {
        guard undecodableRecord == nil || installDefaults?.data(forKey: "companion.context.undecodable.v1") == undecodableRecord,
              let data = try? JSONEncoder().encode(proposed), write(data) else { storageError = true; return false }
        state = proposed; storageError = false; revision = UUID(); changed(); scheduleExpiry(); return true
    }
    func choose(_ yes: Bool, now: Date? = nil, calendar: Calendar = .current) {
        let now = now ?? clock()
        var next = yes && accepted ? state : State()
        next.ownerTag = state.ownerTag
        next.notice = Self.notice; next.accepted = yes; next.decidedAt = now
        if yes && !accepted { next.lastOpen = calendar.startOfDay(for: now) }
        let stored = save(next)
        if !yes && !stored { declineForLaunch = true; revision = UUID(); changed() }
        if yes && stored { declineForLaunch = false }
    }
    func opened(now: Date? = nil, calendar: Calendar = .current) {
        let now = now ?? clock()
        guard accepted else { return }
        expireDueNotes(now: now)
        var next = state
        let today = calendar.startOfDay(for: now)
        if let last = next.lastOpen {
            if today > calendar.startOfDay(for: last) { next.day = min(60, next.day + 1); next.lastOpen = today }
        } else { next.lastOpen = today }
        if next != state { _ = save(next) }
    }
    func answered(now: Date? = nil, calendar: Calendar = .current) {
        let now = now ?? clock()
        guard accepted else { return }
        opened(now: now, calendar: calendar)
        var next = state
        next.answeredOn = calendar.startOfDay(for: now)
        if next != state { _ = save(next) }
    }
    var mayAskToday: Bool {
        accepted && state.answeredOn.map { Calendar.current.isDate($0, inSameDayAs: clock()) } == true
    }
    func next(preferred: String? = nil, afterAnswer: Bool = false, now: Date? = nil, calendar: Calendar = .current) -> CompanionQuestion? {
        let now = now ?? clock()
        guard accepted, state.answeredOn.map({ calendar.isDate($0, inSameDayAs: now) }) == true else { return nil }
        let eligible = CompanionCatalog.questions.filter { question in question.day <= state.day && !state.asked.contains(question.id) && !state.notes.contains(where: { $0.field == question.id }) && (state.rest?[question.id] ?? .distantPast) <= now }
        let question = preferred.flatMap { id in eligible.first { $0.id == id } } ?? eligible.first
        // Stop the chain at money; do not jump ahead to a later question.
        return afterAnswer && question?.money == true ? nil : question
    }
    func answer(_ id: String, value: String?, source: String? = nil, now: Date? = nil) {
        let now = now ?? clock()
        guard accepted, let question = CompanionCatalog.question(id), question.day <= state.day else { return }
        var next = state
        if let value {
            guard question.options.contains(where: { $0.id == value }) else { return }
            let provenance = source == "confirmed" ? "confirmed" : question.source
            next.notes.removeAll { $0.field == id }
            next.notes.append(Note(field: id, value: value, source: provenance, createdAt: now,
                expiresAt: now.addingTimeInterval(Double(question.money || provenance == "inferred" ? 7 : 30) * 86400)))
        }
        if value == nil {
            // Compatibility callers mean a retired question; the scene uses restQuestion instead.
        }
        if !next.asked.contains(id) { next.asked.append(id) }
        _ = save(next)
    }
    /// Reject malformed or unrelated patches atomically. Raw answer text never enters this store.
    @discardableResult func apply(_ patch: [String: Any], for id: String, now: Date? = nil) -> Bool {
        let now = now ?? clock()
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
    @discardableResult func restQuestion(_ id: String, now: Date? = nil, calendar: Calendar = .current) -> Bool {
        let now = now ?? clock()
        guard accepted, CompanionCatalog.question(id) != nil else { return false }
        var next = state
        var counts = next.rests ?? [:]; counts[id, default: 0] += 1; next.rests = counts
        if counts[id] == 1 {
            var rests = next.rest ?? [:]
            rests[id] = calendar.date(byAdding: .day, value: 1, to: calendar.startOfDay(for: now))!
            next.rest = rests
        } else if !next.asked.contains(id) { next.asked.append(id) }
        return save(next)
    }
    @discardableResult func delete(_ id: String) -> Bool {
        var next = state; next.notes.removeAll { $0.field == id }; return save(next)
    }
    @discardableResult func restore(_ note: Note, at index: Int? = nil) -> Bool {
        guard accepted, note.expiresAt > expiryNow(), !state.notes.contains(where: { $0.field == note.field }),
              let question = CompanionCatalog.question(note.field), question.accepts(note.value) else { return false }
        var next = state; next.notes.insert(note, at: min(max(0, index ?? next.notes.count), next.notes.count)); return save(next)
    }
    @discardableResult func confirm(_ id: String) -> Bool {
        expireDueNotes()
        guard accepted, let old = state.notes.first(where: { $0.field == id }), old.source == "inferred" else { return false }
        var next = state
        next.notes.removeAll { $0.field == id }
        next.notes.append(Note(field: old.field, value: old.value, source: "confirmed", createdAt: old.createdAt, expiresAt: old.expiresAt))
        return save(next)
    }
    @discardableResult func correct(_ id: String, value: String, now: Date? = nil) -> Bool {
        let now = now ?? clock()
        expireDueNotes(now: now)
        guard accepted, state.notes.contains(where: { $0.field == id }),
              let question = CompanionCatalog.question(id), question.accepts(value) else { return false }
        var next = state; next.notes.removeAll { $0.field == id }
        next.notes.append(Note(field: id, value: value, source: "confirmed", createdAt: now,
            expiresAt: now.addingTimeInterval(Double(question.money ? 7 : 30) * 86400)))
        return save(next)
    }
    /// Sign-out retains the last account. Guest -> first account and same-account return retain notes.
    /// A failed account reset blocks context in RAM before any request can be built.
    @discardableResult func bindOwner(_ owner: String?, defaults: UserDefaults = .standard) -> Bool {
        guard let owner else { return false }
        let tag = SpeakingDial(defaults: defaults).tag(owner)
        guard state.ownerTag != tag || ownerBlocked else { return false }
        let changedOwner = state.ownerTag != nil && state.ownerTag != tag
        var next = changedOwner ? State() : state; next.ownerTag = tag
        let stored = save(next)
        ownerBlocked = !stored
        if changedOwner && !stored { state = State(); revision = UUID(); changed() }
        return changedOwner
    }
    func deleteAll() { var next = state; next.notes = []; _ = save(next) }
    func wire(capability: CompanionPilot.Capability, now: Date? = nil) -> [String: Any]? {
        let now = now ?? clock()
        guard accepted, allows(capability) else { return nil }
        opened(now: now)
        return ["version": 1, "consent": ["notice": Self.notice, "memory": true, "money": true],
                "day": state.day, "asked": state.asked, "notes": state.notes.filter { $0.expiresAt > expiryNow(observing: now) }.map(\.json)]
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

/// Install-local invitation counters. Never included by wire(); dates use the person's calendar.
@MainActor
final class CompanionPacing {
    struct State: Codable {
        var educational = 0
        var inviteDay: Date?
        var inviteRest: Date?
        var untapped = 0
        var cycles = 0
        var declines = 0
        var retired = false
        var dialShown = false
        var day: Date?
        var chipsUntapped = 0
        var scenes = 0
        var moneyShown = false
        var suppressNextAnswer = false
    }
    private(set) var state: State
    private let defaults: UserDefaults
    private let clock: () -> Date
    private let key = "companion.pacing.v2"
    init(defaults: UserDefaults, clock: @escaping () -> Date = Date.init) {
        self.clock = clock
        self.defaults = defaults
        state = defaults.data(forKey: key).flatMap { try? JSONDecoder().decode(State.self, from: $0) } ?? State()
    }
    private func save() { if let data = try? JSONEncoder().encode(state) { defaults.set(data, forKey: key) } }
    func reset(retired: Bool = false) { state = State(); state.retired = retired; save() }
    private func today(_ now: Date, _ calendar: Calendar) {
        let day = calendar.startOfDay(for: now)
        if state.day.map({ day > $0 }) ?? true { state.day = day; state.chipsUntapped = 0; state.scenes = 0; state.moneyShown = false }
    }
    func delivered(now: Date? = nil, calendar: Calendar = .current) -> Bool {
        let now = now ?? clock()
        today(now, calendar); state.educational += 1
        let suppressed = state.suppressNextAnswer; state.suppressNextAnswer = false; save()
        return !suppressed && state.chipsUntapped < 2 && state.scenes < 2
    }
    func remembers(decided: Bool, now: Date? = nil, calendar: Calendar = .current) -> Bool {
        let now = now ?? clock()
        return !decided && !state.retired && state.educational >= 2 && state.inviteDay != calendar.startOfDay(for: now) && (state.inviteRest ?? .distantPast) <= now
    }
    func dialDue(decided: Bool, now: Date? = nil) -> Bool {
        let now = now ?? clock()
        return !state.dialShown && (decided || state.retired || (state.inviteRest ?? .distantPast) > now)
    }
    func permits(_ question: CompanionQuestion, now: Date? = nil, calendar: Calendar = .current) -> Bool {
        let now = now ?? clock()
        today(now, calendar)
        return state.scenes < 2 && state.chipsUntapped < 2 && (!question.money || !state.moneyShown)
    }
    // A showing is provisionally untapped; the explicit tap rolls it back. No timer records a decision.
    func shown(_ kind: String, now: Date? = nil, calendar: Calendar = .current) {
        let now = now ?? clock()
        today(now, calendar)
        state.chipsUntapped += 1
        if kind == "invite" { state.inviteDay = calendar.startOfDay(for: now); state.untapped += 1 }
        else if kind == "dial" { state.dialShown = true }
        save()
    }
    func shown(_ question: CompanionQuestion, now: Date? = nil, calendar: Calendar = .current) {
        let now = now ?? clock()
        shown("question", now: now, calendar: calendar)
        if question.money { state.moneyShown = true; save() }
    }
    func tapInvite() { state.untapped = max(0, state.untapped - 1); tappedChip() }
    func tappedChip() { state.chipsUntapped = max(0, state.chipsUntapped - 1); save() }
    func leftInvite(now: Date? = nil, calendar: Calendar = .current) {
        let now = now ?? clock()
        if state.untapped >= 3 {
            state.untapped = 0; state.cycles += 1
            state.inviteRest = calendar.date(byAdding: .day, value: 7, to: now)
            if state.cycles >= 3 { state.retired = true }
        }
        save()
    }
    func declined(now: Date? = nil, calendar: Calendar = .current) {
        let now = now ?? clock()
        state.declines += 1
        state.inviteRest = calendar.date(byAdding: .day, value: 30, to: now)
        if state.declines >= 3 { state.retired = true }
        save()
    }
    func scene(_ question: CompanionQuestion, now: Date? = nil, calendar: Calendar = .current) {
        let now = now ?? clock()
        today(now, calendar); state.chipsUntapped = max(0, state.chipsUntapped - 1); state.scenes += 1
        if question.money { state.moneyShown = true }
        save()
    }
    func noted() { state.suppressNextAnswer = true; save() }
}
