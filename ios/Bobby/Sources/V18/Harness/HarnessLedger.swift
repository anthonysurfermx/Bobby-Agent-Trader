// The harness (1.8): Bobby picks the thread back up. From the first question the phone keeps a
// small ledger of what the person did (which asset they asked about, whether they did something
// with a follow-up, what they said about how long they are looking), and everything Bobby does
// next is derived from it: which asset to come back to, when, and when to stop.
//   HarnessLedger    what happened (this file)
//   HarnessProfile   what that says about the person (this file, pure)
//   HarnessPlanner   the follow-ups that come next (pure)
//   HarnessCenter    the phone: permission, local notifications, the line on the glass
// Invariants:
//  - It lives on this phone, per reader (an account, or `local` signed out). Nothing here is sent
//    anywhere, and no text the person wrote is ever kept: a symbol, a price, a moment, and fixed
//    values (a horizon out of five, 24/72/168 hours).
//  - Bounded: `maxEvents` events and `retentionDays` days. Older ones go on every write. The one
//    exception is the pointer to a thesis, which lives exactly as long as its thesis (three at most).
//  - Erasable: `forget` removes a reader's ledger. Turning follow-ups off, withdrawing the risk
//    notice and deleting the account all call it.
//  - Only a real answer is an answer: `returned` (they asked about, saved or acted on what a
//    follow-up was about, within a day of it). A tap on a notification (`opened`) is kept and
//    answers nothing.
// The planner's rules are pinned for every platform in shared/harness/planner-golden.json.
import Foundation

/// The follow-ups Bobby can come back with. Which of them a question gets, and in what order, is
/// `HarnessChain` (HarnessPlanner.swift).
enum HarnessStep: String, Codable, CaseIterable {
    /// How the asset they asked about has moved.
    case asset
    /// The sector that asset belongs to. In the tree, and in no chain that ships.
    case sector
    /// Their week: the assets they asked about.
    case week
}

/// How long the person is looking, in the desk's own five values (`Horizon` in
/// api/_lib/desk-debate.ts, returned in every reply's `sufficiency` block).
enum HarnessHorizon: String, Codable, CaseIterable {
    case intraday, week, month, long, unspecified

    /// Whole days between a question and its first follow-up. A horizon only ever lengthens the
    /// wait: "today" is still the next day. Nil: no follow-up about the asset at all, the week only.
    var waitDays: Int? {
        switch self {
        case .intraday, .unspecified: return 1
        case .week: return 3
        case .month: return 7
        case .long: return nil
        }
    }

    /// What the desk's reply says. Anything else is no horizon.
    init?(named raw: Any?) {
        guard let raw = raw as? String, let value = HarnessHorizon(rawValue: raw) else { return nil }
        self = value
    }

    /// A thesis is at least weeks long: "weeks" waits like a month, anything longer is long.
    init(thesis: ThesisHorizon) {
        self = thesis == .weeks ? .month : .long
    }
}

/// One thing the person did, or one follow-up the phone showed them.
struct HarnessEvent: Codable, Equatable {
    enum Kind: String, Codable {
        /// A read was delivered.
        case ask
        /// They saved that read.
        case saved
        /// The app came to the front. Never written any more: the first 1.8 build kept one per half
        /// hour and nothing read them, so the ledger refuses them and drops the ones it finds.
        case appOpen
        /// A follow-up's moment passed with the notification handed to iOS.
        case sent
        /// They tapped a follow-up notification. Kept, and an answer to nothing.
        case opened
        /// They did something useful with a follow-up: within a day they asked about it, saved a
        /// read of it or acted on its line in the app. The only answer there is.
        case returned
        /// They acted on something Bobby put in front of them inside the app (the line on the glass,
        /// a row of a board, the question Bobby wrote after a read).
        case picked
        /// A thesis they wrote about this asset is active. A pointer: the words stay in the thesis book.
        case thesis
    }

    /// Who started a read. The person's own question has none.
    enum Origin: String, Codable {
        /// Bobby did: the button of a follow-up, a row of a board, the question Bobby wrote after a read.
        case followUp
    }

    var kind: Kind
    var at: Date
    var symbol: String? = nil
    var name: String? = nil
    var isEquity: Bool? = nil
    /// `ask`: the price the read was delivered with.
    var price: Double? = nil
    /// `sent`, `opened`, `returned`: which follow-up.
    var step: HarnessStep? = nil
    /// `sent`, `opened`, `returned` of a sector follow-up: the sector's id.
    var sector: String? = nil
    /// `opened`, `returned`: the moment of the follow-up they answer (its `sent` has that `at`).
    var ref: Date? = nil
    /// `ask`: who started it, when it was not the person.
    var origin: Origin? = nil
    /// `ask`: a second question of their own about the read on screen.
    var thread: Bool? = nil
    /// `ask`: the horizon the question named. `thesis`: the one they set on it.
    var horizon: HarnessHorizon? = nil
    /// `saved`: the review horizon they chose, 24, 72 or 168.
    var horizonHours: Int? = nil
    /// Explicit in-app continuity: an opaque saved-read id and its first local day. No answer text.
    var readId: String? = nil
    var availableFrom: Date? = nil

    /// The one kind that says "this person answers Bobby".
    var isAnswer: Bool { kind == .returned }
    /// A question the person asked by themselves: the only thing follow-ups start from.
    var isQuestion: Bool { kind == .ask && origin == nil }
}

/// An asset the person asked about, as the ledger knows it.
struct HarnessAsset: Equatable, Identifiable {
    let symbol: String
    let name: String
    let isEquity: Bool
    /// The first ask still in the ledger.
    let firstAskedAt: Date
    let lastAskedAt: Date
    /// The price at the last ask, when the read had one.
    let lastPrice: Double?
    /// The price at the first ask of the window `assets(since:)` was called with.
    let firstPrice: Double?
    let asks: Int
    var id: String { symbol }
}

struct HarnessLedger: Codable, Equatable {
    static let maxEvents = 300
    static let retentionDays = 60
    /// Same rule as the desk's symbols (NucleoDesk.equitySymbolPattern).
    static let symbolPattern = #"^[A-Z0-9][A-Z0-9.^=-]{0,19}$"#

    /// Oldest first.
    private(set) var events: [HarnessEvent] = []

    var isEmpty: Bool { events.isEmpty }

    static func validSymbol(_ raw: String?) -> String? {
        guard let symbol = raw?.uppercased(), symbol.range(of: symbolPattern, options: .regularExpression) != nil else { return nil }
        return symbol
    }

    static let saveHorizons: Set<Int> = [24, 72, 168]

    /// Adds one event in its place in time and drops what is too old or too much.
    mutating func note(_ event: HarnessEvent) {
        guard event.kind != .appOpen else { return }
        var event = event
        if let symbol = event.symbol {
            guard let valid = Self.validSymbol(symbol) else { return }
            event.symbol = valid
        }
        if let price = event.price, !(price.isFinite && price > 0) { event.price = nil }
        if let hours = event.horizonHours, !Self.saveHorizons.contains(hours) { event.horizonHours = nil }
        let index = events.lastIndex { $0.at <= event.at }.map { $0 + 1 } ?? 0
        events.insert(event, at: index)
        prune(now: events.last?.at ?? event.at)
    }

    /// A thesis pointer is not pruned: it goes when its thesis does (HarnessCenter keeps them in step).
    mutating func prune(now: Date) {
        let cutoff = now.addingTimeInterval(-Double(Self.retentionDays) * 86_400)
        events.removeAll { $0.kind == .appOpen || ($0.at < cutoff && $0.kind != .thesis) }
        var extra = events.count - Self.maxEvents
        if extra > 0 {
            events.removeAll { event in
                guard extra > 0, event.kind != .thesis else { return false }
                extra -= 1
                return true
            }
        }
    }

    /// Removes events matching `drop` (the pointer of a thesis that was archived, for instance).
    mutating func remove(where drop: (HarnessEvent) -> Bool) {
        events.removeAll(where: drop)
    }

    /// What was written about a read before the person said yes gains what was held back until
    /// then (the horizon the question named, the one chosen on the save). True when it was there.
    @discardableResult
    mutating func complete(_ full: HarnessEvent) -> Bool {
        guard let index = events.firstIndex(where: { $0.kind == full.kind && $0.at == full.at && $0.symbol == full.symbol?.uppercased() }) else { return false }
        events[index].thread = full.thread
        events[index].horizon = full.horizon
        events[index].horizonHours = full.horizonHours.flatMap { Self.saveHorizons.contains($0) ? $0 : nil }
        return true
    }

    /// Another ledger's events join this one (a signed-out reader signs in on the same phone).
    mutating func merge(_ other: HarnessLedger) {
        guard !other.events.isEmpty else { return }
        events = (events + other.events).sorted { $0.at < $1.at }
        prune(now: events.last?.at ?? Date())
    }

    // MARK: Reading

    /// The ledger as it was at `now`: what is dated later has not happened yet.
    func upTo(_ now: Date) -> HarnessLedger {
        guard let last = events.last, last.at > now else { return self }
        var past = HarnessLedger()
        past.events = events.filter { $0.at <= now }
        return past
    }

    func events(_ kind: HarnessEvent.Kind, since: Date? = nil) -> [HarnessEvent] {
        events.filter { event in event.kind == kind && (since.map { event.at > $0 } ?? true) }
    }

    /// Follow-ups shown since the person last answered one, and when the latest of them was.
    func unansweredStreak(before now: Date) -> (count: Int, last: Date?) {
        let lastAnswer = events.last { $0.at <= now && $0.isAnswer }?.at
        let shown = events.filter { event in event.kind == .sent && event.at <= now && (lastAnswer.map { event.at > $0 } ?? true) }
        return (shown.count, shown.last?.at)
    }

    /// The question follow-ups belong to: the latest one the person asked by themselves. A tap, an
    /// answer or a read Bobby started never takes its place.
    func question(before now: Date) -> HarnessEvent? {
        events.last { $0.at <= now && $0.isQuestion }
    }

    /// The assets asked about since `since`, most recently asked first.
    func assets(since: Date, now: Date) -> [HarnessAsset] {
        var order: [String] = []
        var bySymbol: [String: [HarnessEvent]] = [:]
        for event in events where event.kind == .ask && event.at >= since && event.at <= now {
            guard let symbol = event.symbol else { continue }
            if bySymbol[symbol] == nil { order.append(symbol) }
            bySymbol[symbol, default: []].append(event)
        }
        return order.compactMap { symbol -> HarnessAsset? in
            guard let asks = bySymbol[symbol], let first = asks.first, let last = asks.last else { return nil }
            return HarnessAsset(symbol: symbol, name: last.name ?? symbol, isEquity: last.isEquity ?? false,
                                firstAskedAt: first.at, lastAskedAt: last.at, lastPrice: last.price,
                                firstPrice: asks.first { $0.price != nil }?.price, asks: asks.count)
        }
        .sorted { $0.lastAskedAt > $1.lastAskedAt }
    }

    func asset(_ symbol: String, since: Date, now: Date) -> HarnessAsset? {
        assets(since: since, now: now).first { $0.symbol == symbol.uppercased() }
    }
}

/// What the ledger says about the person. Pure, recomputed whenever it is needed, never stored:
/// deleting the ledger deletes everything Bobby "learned".
struct HarnessProfile: Equatable {
    /// How much each asset matters to them right now (recent and repeated actions weigh more).
    var interest: [String: Double]
    /// The hour they tend to answer follow-ups at, once there is enough to tell. Local time.
    var hour: Int?
    /// Follow-ups shown in the last `statsDays`, per kind.
    var sent: [HarnessStep: Int]
    /// Of those, the ones they answered (`returned`). A tap is not one.
    var answered: [HarnessStep: Int]
    /// Per kind: how many of the latest ones in a row went unanswered.
    var ignored: [HarnessStep: Int]

    /// Interest halves every this many days.
    static let halfLifeDays = 7.0
    static let statsDays = 30.0
    /// A kind whose last showings, this many in a row, went unanswered rests until they leave the window.
    static let ignoredLimit = 2
    /// Answers needed before the hour they come at is trusted over the hour they asked at.
    static let hourSamples = 3

    /// What each thing they did says about how much the asset matters. An answered follow-up weighs
    /// as much as a question, on top of the question, save or pick that answered it. A tap alone
    /// weighs half a question: they looked, and did nothing with it.
    static let weights: [HarnessEvent.Kind: Double] = [.ask: 1, .saved: 1, .picked: 1, .opened: 0.5, .returned: 1]
    /// A second question of their own about the same read, on top of the question itself.
    static let threadWeight = 1.0
    /// A thesis they wrote and keep active. It does not fade: it counts until the thesis is archived.
    static let thesisWeight = 2.0

    static func make(_ ledger: HarnessLedger, now: Date, calendar: Calendar) -> HarnessProfile {
        var interest: [String: Double] = [:]
        var sent: [HarnessStep: Int] = [:]
        var answered: [HarnessStep: Int] = [:]
        var ignored: [HarnessStep: Int] = [:]
        var hours: [Int: (count: Int, latest: Date)] = [:]
        let statsFrom = now.addingTimeInterval(-statsDays * 86_400)
        var theses = Set<String>()
        for event in ledger.events where event.at <= now {
            if let symbol = event.symbol {
                if event.kind == .thesis {
                    if theses.insert(symbol).inserted { interest[symbol, default: 0] += thesisWeight }
                } else if let weight = weights[event.kind] {
                    let ageDays = now.timeIntervalSince(event.at) / 86_400
                    interest[symbol, default: 0] += (weight + (event.thread == true ? threadWeight : 0)) * pow(0.5, ageDays / halfLifeDays)
                }
            }
            guard event.at >= statsFrom, let step = event.step else { continue }
            if event.kind == .sent { sent[step, default: 0] += 1; ignored[step, default: 0] += 1 }
            if event.isAnswer {
                answered[step, default: 0] += 1
                ignored[step] = 0
                let hour = calendar.component(.hour, from: event.at)
                let seen = hours[hour]
                hours[hour] = ((seen?.count ?? 0) + 1, max(seen?.latest ?? event.at, event.at))
            }
        }
        let samples = hours.values.reduce(0) { $0 + $1.count }
        let best = hours.max { a, b in a.value.count == b.value.count ? a.value.latest < b.value.latest : a.value.count < b.value.count }
        return HarnessProfile(interest: interest, hour: samples >= hourSamples ? best?.key : nil, sent: sent, answered: answered, ignored: ignored)
    }

    /// Its last `ignoredLimit` showings went unanswered: Bobby stops sending that kind for now. An
    /// answer from before those showings does not count for them.
    func rests(_ step: HarnessStep) -> Bool {
        (ignored[step] ?? 0) >= Self.ignoredLimit
    }

    /// The asset that matters most among `symbols`; ties go to the order given.
    func favourite(among symbols: [String]) -> String? {
        var best: (symbol: String, score: Double)?
        for symbol in symbols {
            let score = interest[symbol] ?? 0
            if best == nil || score > best!.score { best = (symbol, score) }
        }
        return best?.symbol
    }
}

/// Where each reader's ledger is kept on the phone.
struct HarnessStore {
    static let prefix = "v18.harness.v1."
    static let modePrefix = "v18.harness.mode."
    static let planPrefix = "v18.harness.plan."

    let defaults: UserDefaults

    init(defaults: UserDefaults = .standard) { self.defaults = defaults }

    static func key(_ prefix: String, owner: String?) -> String { prefix + (owner ?? "local") }

    func ledger(owner: String?) -> HarnessLedger {
        guard let data = defaults.data(forKey: Self.key(Self.prefix, owner: owner)),
              let ledger = try? Self.decoder.decode(HarnessLedger.self, from: data) else { return HarnessLedger() }
        return ledger
    }

    func write(_ ledger: HarnessLedger, owner: String?) {
        let key = Self.key(Self.prefix, owner: owner)
        if ledger.isEmpty {
            defaults.removeObject(forKey: key)
        } else if let data = try? Self.encoder.encode(ledger) {
            defaults.set(data, forKey: key)
        }
    }

    func mode(owner: String?) -> HarnessMode {
        defaults.string(forKey: Self.key(Self.modePrefix, owner: owner)).flatMap(HarnessMode.init(rawValue:)) ?? .undecided
    }

    func write(_ mode: HarnessMode, owner: String?) {
        let key = Self.key(Self.modePrefix, owner: owner)
        if mode == .undecided { defaults.removeObject(forKey: key) } else { defaults.set(mode.rawValue, forKey: key) }
    }

    func plan(owner: String?) -> [HarnessPlanned] {
        guard let data = defaults.data(forKey: Self.key(Self.planPrefix, owner: owner)),
              let list = try? Self.decoder.decode([HarnessPlanned].self, from: data) else { return [] }
        return list
    }

    func write(_ plan: [HarnessPlanned], owner: String?) {
        let key = Self.key(Self.planPrefix, owner: owner)
        if plan.isEmpty {
            defaults.removeObject(forKey: key)
        } else if let data = try? Self.encoder.encode(plan) {
            defaults.set(data, forKey: key)
        }
    }

    /// Everything the harness keeps about one reader.
    func forget(owner: String?) {
        for prefix in [Self.prefix, Self.modePrefix, Self.planPrefix] { defaults.removeObject(forKey: Self.key(prefix, owner: owner)) }
    }

    /// What was kept and what was planned go; a no stays (the Memory screen's "Delete everything").
    /// Erasing notes is not a way to be asked again: a reader who turned follow-ups off stays off.
    /// Any other answer goes with the notes, so a yes is asked for again before anything is kept.
    func forgetNotes(owner: String?) {
        let refused = mode(owner: owner) == .off
        forget(owner: owner)
        if refused { write(.off, owner: owner) }
    }

    /// Account deletion (AccountSession): nothing of that account stays on the phone.
    static func forgetOwner(_ userId: String, defaults: UserDefaults = .standard) {
        HarnessStore(defaults: defaults).forget(owner: userId)
    }

    private static let encoder: JSONEncoder = { let e = JSONEncoder(); e.dateEncodingStrategy = .millisecondsSince1970; return e }()
    private static let decoder: JSONDecoder = { let d = JSONDecoder(); d.dateDecodingStrategy = .millisecondsSince1970; return d }()
}

/// Whether the person wants Bobby to come back to them.
enum HarnessMode: String, Codable {
    /// Never asked. The ledger is kept so the offer can be made; nothing is ever scheduled.
    case undecided
    case on
    /// The person asked to resume saved reads when opening Bobby. No external notifications.
    case inApp
    /// They said no: nothing is kept and nothing is scheduled.
    case off
}
