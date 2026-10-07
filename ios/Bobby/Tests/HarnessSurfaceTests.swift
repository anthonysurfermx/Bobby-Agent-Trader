import Foundation
import UserNotifications
import XCTest
@testable import Bobby

/// The harness (1.8), what the person sees and what stays on the phone: what is written in each of
/// the three states, the number on the glass and when there is none, the lock screen, "Stop", the
/// wall Bobby never walks anyone into, the notes on the Memory screen, and a gate on every word.
@MainActor
final class HarnessSurfaceTests: XCTestCase {
    private final class Recorder: NucleoEmitting {
        var events: [(name: String, payload: [String: Any])] = []
        func emit(_ name: String, _ payload: [String: Any]) { events.append((name, payload)) }
        func pageReady() {}
        func named(_ name: String) -> [[String: Any]] { events.filter { $0.name == name }.map(\.payload) }
    }

    private static let languages = ["en", "es", "fr", "pt", "it", "de"]
    private static let profileKeys = ["agent.riskNoticeVersion", "agent.onboarded", "agent.voice", "agent.auraText"]
    private static let offered = "What would have to change in NVDA for this read to change?"

    private var previousLanguage = "system"
    private var savedProfile: [String: Any] = [:]
    private var suiteName = ""
    private var defaults: UserDefaults!
    private var fake: FakeHarnessNotifier!
    private var calendar: Calendar = {
        var c = Calendar(identifier: .gregorian)
        c.timeZone = TimeZone(identifier: "America/Mexico_City")!
        return c
    }()
    private var clock = Date()
    private var consent: ReminderConsent = .accepted
    private var user: String?
    private var generation = UUID()
    private var prices: [String: Double] = [:]
    /// What the phone knows about the person's reads, and what the server would say if asked.
    private var reads: BobbyReadAccess?
    private var serverSays: BobbyReadAccess?
    private var asked = 0

    override func setUp() async throws {
        try await super.setUp()
        previousLanguage = L.selection
        L.select("en")
        suiteName = "harness.surface.tests.\(UUID().uuidString)"
        defaults = UserDefaults(suiteName: suiteName)
        savedProfile = [:]
        for key in Self.profileKeys { if let v = UserDefaults.standard.object(forKey: key) { savedProfile[key] = v } }
        fake = FakeHarnessNotifier()
        clock = at(7, 16, 40)
        consent = .accepted
        user = nil
        generation = UUID()
        prices = [:]
        reads = Self.free(left: 5)
        serverSays = nil
        asked = 0
        NucleoFixtures.activate(scenario: "levels", timeScale: 0.01)
        NucleoFixtures.clearLog()
    }

    override func tearDown() async throws {
        NucleoFixtures.deactivate()
        for key in Self.profileKeys {
            if let v = savedProfile[key] { UserDefaults.standard.set(v, forKey: key) } else { UserDefaults.standard.removeObject(forKey: key) }
        }
        defaults.removePersistentDomain(forName: suiteName)
        L.select(previousLanguage)
        try await super.tearDown()
    }

    // MARK: Scaffolding

    /// October 2026, local time. The 7th is a Wednesday.
    private func at(_ day: Int, _ hour: Int, _ minute: Int = 0, month: Int = 10) -> Date {
        calendar.date(from: DateComponents(year: 2026, month: month, day: day, hour: hour, minute: minute))!
    }

    private static func free(left: Int, bonus: Int = 0, paywall: Bool = true) -> BobbyReadAccess {
        BobbyReadAccess(tier: "free", used: 20 - left, limit: 20, remaining: left, resetsAt: nil, paywall: paywall, bonus: bonus)
    }

    private static func guest(left: Int) -> BobbyReadAccess {
        BobbyReadAccess(tier: "anon", used: 6 - left, limit: 6, remaining: left, resetsAt: nil, paywall: true)
    }

    private static let pro = BobbyReadAccess(tier: "pro", used: 40, limit: nil, remaining: nil, resetsAt: nil, paywall: false)
    /// What the server sends when it could not read the meter: a guest with no limit.
    private static let unread = BobbyReadAccess(tier: "anon", used: 0, limit: nil, remaining: nil, resetsAt: nil, paywall: false)

    private func make() -> HarnessCenter {
        let center = HarnessCenter(notifier: fake, defaults: defaults)
        center.now = { [unowned self] in self.clock }
        center.calendar = { [unowned self] in self.calendar }
        center.consent = { [unowned self] in self.consent }
        center.currentUser = { [unowned self] in self.user }
        center.currentGeneration = { [unowned self] in self.generation }
        center.weeklyCovered = { false }
        center.quote = { [unowned self] symbol in await MainActor.run { self.prices[symbol] } }
        center.access = { [unowned self] in self.reads }
        center.refreshAccess = { [unowned self] in
            await MainActor.run {
                self.asked += 1
                if let answer = self.serverSays { self.reads = answer }
            }
        }
        center.load(owner: user)
        return center
    }

    private func settle() async {
        for _ in 0..<12 { await withCheckedContinuation { c in DispatchQueue.main.async { c.resume() } } }
    }

    private func ask(_ center: HarnessCenter, _ symbol: String, price: Double? = 100, equity: Bool = true) async {
        center.noteAsk(symbol: symbol, name: symbol, isEquity: equity, price: price)
        await settle()
    }

    /// The ledger as it sits in the phone's store: every event, with exactly the keys that were written.
    private func storedEvents() throws -> [[String: Any]] {
        guard let data = defaults.data(forKey: HarnessStore.key(HarnessStore.prefix, owner: user)) else { return [] }
        let object = try XCTUnwrap(try JSONSerialization.jsonObject(with: data) as? [String: Any])
        return try XCTUnwrap(object["events"] as? [[String: Any]])
    }

    /// Every key the harness and the glass keep in the store for this suite.
    private func storedKeys() -> [String] {
        defaults.dictionaryRepresentation().keys.filter { $0.hasPrefix("v18.harness.") || $0.hasPrefix(NudgeCenter.storePrefix) }.sorted()
    }

    private func makeSession(harness: HarnessCenter, intent: HarnessIntent) -> (NucleoSession, NucleoBridge, Recorder) {
        let profile = AgentProfile()
        profile.riskNoticeVersion = RiskNotice.currentVersion
        let session = NucleoSession(fixtures: true, profile: profile, companions: CompanionStore(defaults: defaults),
                                    ledger: NucleoLedger(defaults: defaults), defaults: defaults,
                                    briefingIntent: BriefingIntent(observeAccount: false), reminderIntent: ReminderIntent(observeAccount: false),
                                    harnessIntent: intent, harness: harness)
        profile.onboarded = true
        session.companions.companionId = "orb"
        session.briefingSheetDelay = 0
        session.briefingGate = BriefingTapGate(appActive: { true }, signedIn: { false }, deskBusy: { false }, listening: { false }, narrating: { false })
        session.desk.meterChanged = { _, _ in }
        session.desk.clock = NucleoDesk.Clock(now: { NucleoFixtures.recordedAt(symbol: $0, kind: "candles") ?? Date() },
                                              receivedAt: { NucleoFixtures.recordedAt(symbol: $0, kind: "debate") ?? Date() })
        session.desk.generation = { [unowned self] in self.generation }
        session.desk.recordQuery = { _, _ in }
        let recorder = Recorder()
        session.emitter = recorder
        return (session, NucleoBridge(session: session), recorder)
    }

    private func call(_ bridge: NucleoBridge, _ method: String, _ params: [String: Any], file: StaticString = #filePath, line: UInt = #line) async -> [String: Any] {
        let (reply, error) = await bridge.handle(body: ["v": 1, "method": method, "params": params], trusted: true)
        XCTAssertNil(error, file: file, line: line)
        let envelope = reply as? [String: Any] ?? [:]
        XCTAssertEqual(envelope["ok"] as? Bool, true, "\(method) faulted: \(envelope)", file: file, line: line)
        return envelope["result"] as? [String: Any] ?? [:]
    }

    private func inEveryLanguage(_ body: (String) -> Void) {
        for language in Self.languages {
            L.select(language)
            body(language)
        }
        L.select("en")
    }

    // MARK: C1 — what the phone writes, state by state

    func testUndecidedThePhoneKeepsTheQuestionAndNothingElse() async throws {
        let center = make()
        center.theses = { [unowned self] _ in [("NVDA", .long, self.at(1, 9))] }
        // Everything a person can do before they say yes or no.
        center.noteAsk(symbol: "NVDA", name: "NVIDIA", isEquity: true, price: 187.42, horizon: .week)
        clock = at(7, 16, 42)
        center.noteAsk(symbol: "NVDA", name: "NVIDIA", isEquity: true, price: 187.5, thread: true, horizon: .month)
        clock = at(7, 16, 44)
        center.noteAsk(symbol: "NVDA", name: "NVIDIA", isEquity: true, price: 187.6, origin: .followUp)
        center.noteSaved(symbol: "NVDA", horizonHours: 168)
        center.notePicked(symbol: "NVDA")
        clock = at(7, 18)
        await center.appActive()
        await center.opened(HarnessTap(step: .asset, symbol: "NVDA", sector: nil))
        await center.firedInForeground(HarnessTap(step: .asset, symbol: "NVDA", sector: nil))
        await center.replan()
        await settle()

        XCTAssertEqual(center.mode, .undecided)
        let events = try storedEvents()
        XCTAssertEqual(events.count, 2, "the two questions they asked by themselves; not the read Bobby started")
        for event in events {
            XCTAssertEqual(event["kind"] as? String, "ask")
            XCTAssertEqual(Set(event.keys), ["kind", "at", "symbol", "name", "isEquity", "price"],
                           "the asset, its price and the moment: no horizon, no second-question mark, no origin")
        }
        XCTAssertEqual(events.compactMap { $0["price"] as? Double }, [187.42, 187.5])
        XCTAssertEqual(center.ledger.events.map(\.kind), [.ask, .ask], "no app opening, no save, no tap, no thesis pointer")
        XCTAssertEqual(storedKeys(), [HarnessStore.key(HarnessStore.prefix, owner: nil)], "one key: no switch, no plan")
        XCTAssertEqual(fake.added, [])
        XCTAssertEqual(fake.permissionRequests, 0)
        XCTAssertEqual(center.upcoming, [])
    }

    func testUndecidedTheGlassStillSaysHowItMovedAndThatWritesNothing() async throws {
        let center = make()
        await ask(center, "NVDA", price: 100)
        clock = at(8, 17)
        prices["NVDA"] = 102.3
        await center.appActive()
        XCTAssertEqual(center.move?.pct ?? 0, 2.3, accuracy: 0.001, "what the question alone is kept for")
        XCTAssertEqual(try storedEvents().count, 1, "coming back wrote nothing")
        XCTAssertEqual(center.ledger.events(.appOpen), [])
    }

    func testWithFollowUpsOnThePhoneWritesWhatThePlannerReads() async throws {
        let center = make()
        center.theses = { [unowned self] _ in [("TSLA", .month, self.at(1, 9))] }
        await ask(center, "NVDA")
        _ = await center.accept()
        clock = at(7, 16, 50)
        center.noteAsk(symbol: "NVDA", name: "NVIDIA", isEquity: true, price: 101, thread: true, horizon: .intraday)
        center.noteAsk(symbol: "NVDA", name: "NVIDIA", isEquity: true, price: 101, origin: .followUp)
        center.noteSaved(symbol: "NVDA", horizonHours: 24)
        center.notePicked(symbol: "NVDA")
        await settle()
        clock = at(8, 18)                              // the asset follow-up fired at 16:50, a day after their last question
        fake.deliver(before: clock)
        await center.appActive()
        await center.opened(HarnessTap(step: .asset, symbol: "NVDA", sector: nil, owner: "local", stamp: at(8, 16, 50)))
        center.noteAsk(symbol: "NVDA", name: "NVIDIA", isEquity: true, price: 103)
        await settle()

        let kinds = Set(center.ledger.events.map(\.kind))
        XCTAssertEqual(kinds, [.ask, .saved, .picked, .appOpen, .sent, .opened, .returned, .thesis], "every kind of event, from the yes on")
        let asks = center.ledger.events(.ask)
        XCTAssertEqual(asks.map(\.thread), [nil, true, nil, nil])
        XCTAssertEqual(asks.map(\.origin), [nil, nil, .followUp, nil])
        XCTAssertEqual(asks[1].horizon, .intraday)
        XCTAssertEqual(center.ledger.events(.saved).first?.horizonHours, 24)
        XCTAssertEqual(center.ledger.events(.thesis).first?.horizon, .month)
        XCTAssertEqual(Set(storedKeys()), [HarnessStore.key(HarnessStore.prefix, owner: nil), HarnessStore.key(HarnessStore.modePrefix, owner: nil),
                                           HarnessStore.key(HarnessStore.planPrefix, owner: nil)])
    }

    func testOffThePhoneWritesNothingAndWhatWasThereIsErased() async throws {
        let center = make()
        await ask(center, "NVDA")
        _ = await center.accept()
        center.noteSaved(symbol: "NVDA", horizonHours: 168)
        // The glass kept a record of the line it drew about NVDA.
        let nudges = NudgeCenter(defaults: defaults)
        nudges.register(NudgeSource(key: "move", priority: 1, candidate: { _ in NucleoNudge(id: "harness.move.nvda.20261007", text: "x", cta: "y") },
                                    act: { _, _ in }))
        _ = nudges.current(nudges.moment(signedIn: false))
        nudges.seen("harness.move.nvda.20261007")
        XCTAssertEqual(nudges.showings("harness.move.nvda.20261007"), 1)

        await center.turnOff()
        XCTAssertEqual(center.mode, .off)
        XCTAssertTrue(center.ledger.isEmpty)
        XCTAssertEqual(try storedEvents().count, 0)
        XCTAssertEqual(fake.requests.count, 0)
        XCTAssertEqual(nudges.showings("harness.move.nvda.20261007"), 0, "what the glass kept about its lines goes too")
        XCTAssertEqual(storedKeys(), [HarnessStore.key(HarnessStore.modePrefix, owner: nil)], "all that is left is the no itself")

        // And from here on nothing is written, whatever they do.
        clock = at(8, 10)
        center.noteAsk(symbol: "TSLA", name: "Tesla", isEquity: true, price: 300, thread: true, horizon: .week)
        center.noteSaved(symbol: "TSLA", horizonHours: 72)
        center.notePicked(symbol: "TSLA")
        await center.appActive()
        await center.opened(HarnessTap(step: .asset, symbol: "TSLA", sector: nil))
        await center.replan()
        await settle()
        XCTAssertTrue(center.ledger.isEmpty)
        XCTAssertEqual(storedKeys(), [HarnessStore.key(HarnessStore.modePrefix, owner: nil)])
        XCTAssertNil(center.dueAsset(), "and nothing is said on the glass")
        XCTAssertNil(center.move)
        // Saying yes after a no starts from nothing: what they did while it was off was never held.
        _ = await center.accept()
        XCTAssertTrue(center.ledger.isEmpty)
        XCTAssertEqual(center.upcoming, [])
    }

    // MARK: C2 — the number can be wrong; then there is no number

    func testASplitARenamedTickerOrABadPriceShowsNoNumber() {
        // A stock.
        XCTAssertEqual(HarnessCopy.move(from: 100, to: 103.2, isEquity: true) ?? 0, 3.2, accuracy: 0.0001)
        XCTAssertEqual(HarnessCopy.move(from: 100, to: 72, isEquity: true) ?? 0, -28, accuracy: 0.0001, "a very bad earnings day is still a number")
        XCTAssertEqual(HarnessCopy.move(from: 100, to: 135, isEquity: true) ?? 0, 35, accuracy: 0.0001)
        for (split, ratio) in [("2-for-1", 0.5), ("3-for-1", 1.0 / 3), ("4-for-1", 0.25), ("10-for-1", 0.1), ("20-for-1", 0.05),
                               ("1-for-2 reverse", 2.0), ("1-for-10 reverse", 10.0)] {
            XCTAssertNil(HarnessCopy.move(from: 480, to: 480 * ratio, isEquity: true), "a \(split) split is not a move")
            // The same split with an ordinary day on top of it, either way.
            XCTAssertNil(HarnessCopy.move(from: 480, to: 480 * ratio * 1.08, isEquity: true), split)
            XCTAssertNil(HarnessCopy.move(from: 480, to: 480 * ratio * 0.92, isEquity: true), split)
        }
        XCTAssertNil(HarnessCopy.move(from: 100, to: 60, isEquity: true), "the bound itself is outside")
        XCTAssertNil(HarnessCopy.move(from: 100, to: 160, isEquity: true))
        XCTAssertNotNil(HarnessCopy.move(from: 100, to: 60.5, isEquity: true))
        // Crypto: wide, and still not anything.
        XCTAssertEqual(HarnessCopy.move(from: 1, to: 3.4, isEquity: false) ?? 0, 240, accuracy: 0.0001, "a small coin's wild week")
        XCTAssertEqual(HarnessCopy.move(from: 1, to: 0.3, isEquity: false) ?? 0, -70, accuracy: 0.0001)
        XCTAssertNil(HarnessCopy.move(from: 1, to: 0.001, isEquity: false), "a redenomination, or another coin under the same ticker")
        XCTAssertNil(HarnessCopy.move(from: 0.002, to: 61_000, isEquity: false))
        XCTAssertNil(HarnessCopy.move(from: 1, to: 5, isEquity: false))
        XCTAssertNil(HarnessCopy.move(from: 1, to: 0.2, isEquity: false))
        // Prices the phone cannot use.
        for isEquity in [true, false] {
            for (then, now) in [(nil, 100.0), (100.0, nil), (0.0, 100.0), (100.0, 0.0), (-5.0, 100.0), (100.0, -5.0),
                                (Double.nan, 100.0), (100.0, .nan), (.infinity, 100.0), (100.0, .infinity)] as [(Double?, Double?)] {
                XCTAssertNil(HarnessCopy.move(from: then, to: now, isEquity: isEquity), "\(String(describing: then)) → \(String(describing: now))")
            }
        }
        // The bounds hold whatever the age of the question: they do not grow with the days.
        XCTAssertLessThan(HarnessCopy.stockMove.upperBound, 2)
        XCTAssertGreaterThan(HarnessCopy.stockMove.lowerBound, 0.5, "a 2-for-1 split is outside on every day of the two weeks")
    }

    func testOutsideTheBoundTheGlassAndTheBoardSayNoNumber() async throws {
        let center = make()
        await ask(center, "NVDA", price: 480)
        clock = at(9, 17)
        prices["NVDA"] = 48.6                          // 10 for 1, and up a little
        await center.appActive()
        let move = try XCTUnwrap(center.move)
        XCTAssertNil(move.pct)
        XCTAssertEqual(HarnessNudges.nudge(move).text, "NVDA, 2 days later", "never “NVDA -90% since you asked”")
        L.select("es")
        XCTAssertEqual(HarnessNudges.nudge(move).text, "NVDA, 2 días después")
        L.select("en")
        // The same asset the day it only moved.
        prices["NVDA"] = 495.4
        clock = at(9, 17, 30)
        await center.refreshMove()
        XCTAssertEqual(HarnessNudges.nudge(try XCTUnwrap(center.move)).text, "NVDA +3.2% since you asked")
        // Crypto is judged as crypto.
        XCTAssertNotNil(HarnessMove(symbol: "PEPE", name: "Pepe", isEquity: false, askedAt: clock, priceThen: 1, priceNow: 3, days: 2).pct)
        XCTAssertNil(HarnessMove(symbol: "ACME", name: "Acme", isEquity: true, askedAt: clock, priceThen: 1, priceNow: 3, days: 2).pct)
        // The week's board compares with the price at the question the same way.
        let board = HarnessBoard(kind: .week, title: "", basis: "", rows: [
            .init(symbol: "NVDA", name: "NVIDIA", isEquity: true, priceThen: 480),
            .init(symbol: "PEPE", name: "Pepe", isEquity: false, priceThen: 1),
        ])
        XCTAssertNil(board.change(for: board.rows[0], price: 48.6, changePct: 1.2), "a row whose number would be a split shows none")
        XCTAssertEqual(board.change(for: board.rows[0], price: 495.4, changePct: 1.2) ?? 0, 3.2, accuracy: 0.05)
        XCTAssertEqual(board.change(for: board.rows[1], price: 3, changePct: 1.2) ?? 0, 200, accuracy: 0.0001)
    }

    func testTheNumberIsSaidTheSameWayUpAndDown() {
        inEveryLanguage { language in
            let up = HarnessCopy.moveLine(symbol: "NVDA", pct: 3.2, days: 1), down = HarnessCopy.moveLine(symbol: "NVDA", pct: -3.2, days: 1)
            // One sentence for both: all that differs is the sign in front of the number.
            let plain: (String) -> String = { $0.replacingOccurrences(of: "+", with: "").replacingOccurrences(of: "-", with: "").replacingOccurrences(of: "\u{2212}", with: "") }
            XCTAssertEqual(plain(up), plain(down), language)
            for line in [up, down] {
                for scalar in line.unicodeScalars {
                    XCTAssertFalse((0x2190...0x21FF).contains(scalar.value) || (0x25A0...0x25FF).contains(scalar.value)
                                   || (0x2B00...0x2BFF).contains(scalar.value) || scalar.value >= 0x1F000, "\(language): no arrow, no triangle, no emoji in “\(line)”")
                }
            }
        }
        // The page gets a line and a button, and nothing that could colour them.
        let move = HarnessMove(symbol: "NVDA", name: "NVIDIA", isEquity: true, askedAt: at(6, 10), priceThen: 100, priceNow: 97, days: 1)
        XCTAssertEqual(Set(HarnessNudges.nudge(move).json.keys), ["id", "text", "cta"])
    }

    // MARK: C3 — the lock screen says where it came from and nothing else

    func testTheLockScreenSaysWhereItCameFromAndNothingElse() {
        let asset = HarnessFollowUp(step: .asset, fireAt: clock, symbol: "NVDA", days: 3)
        let week = HarnessFollowUp(step: .week, fireAt: clock, symbol: "NVDA", others: 2)
        let alone = HarnessFollowUp(step: .week, fireAt: clock, symbol: "NVDA", others: 0)
        XCTAssertEqual(HarnessCopy.body(asset), "NVDA: back to your question.")
        XCTAssertEqual(HarnessCopy.body(week), "Your week: NVDA and 2 more.")
        XCTAssertEqual(HarnessCopy.body(alone), "Your week with NVDA.")
        XCTAssertEqual(HarnessCopy.notificationTitle, "Bobby")
        L.select("es")
        XCTAssertEqual(HarnessCopy.body(asset), "NVDA: de vuelta a tu pregunta.")
        XCTAssertEqual(HarnessCopy.body(week), "Tu semana: NVDA y 2 más.")
        XCTAssertEqual(HarnessCopy.body(alone), "Tu semana con NVDA.")
        var bodies = Set<String>()
        inEveryLanguage { language in
            let body = HarnessCopy.body(asset)
            bodies.insert(body)
            XCTAssertTrue(body.hasPrefix("NVDA"), language)
            XCTAssertNil(body.rangeOfCharacter(from: .decimalDigits), "\(language): no day count and no figure in “\(body)”")
            XCTAssertFalse(body.contains("%") || body.contains("{") || body.contains("!") || body.contains("?"), "\(language): \(body)")
            XCTAssertEqual(body.filter { $0 == "." }.count, 1, "\(language): one sentence, no second one telling them to look")
            // The day count of the plan never changes what is said.
            XCTAssertEqual(HarnessCopy.body(HarnessFollowUp(step: .asset, fireAt: clock, symbol: "NVDA", days: 1)), body, language)
        }
        XCTAssertEqual(bodies.count, Self.languages.count, "six languages, six sentences")
    }

    func testALockedPhoneThatHidesPreviewsNeverShowsTheAsset() async throws {
        XCTAssertEqual(HarnessCopy.hiddenBody(.asset), "Back to your question.")
        XCTAssertEqual(HarnessCopy.hiddenBody(.week), "Your week.")
        L.select("es")
        XCTAssertEqual(HarnessCopy.hiddenBody(.asset), "De vuelta a tu pregunta.")
        XCTAssertEqual(HarnessCopy.hiddenBody(.week), "Tu semana.")
        inEveryLanguage { language in
            for step in HarnessStep.allCases {
                let shown = HarnessCopy.body(HarnessFollowUp(step: step, fireAt: clock, symbol: "NVDA", sector: "semis", others: 2))
                let hidden = HarnessCopy.hiddenBody(step)
                XCTAssertTrue(shown.contains("NVDA"), language)
                XCTAssertFalse(hidden.contains("NVDA"), "\(language): \(hidden)")
                XCTAssertNil(hidden.rangeOfCharacter(from: .decimalDigits), "\(language): \(hidden)")
                XCTAssertFalse(hidden.contains("%"), "iOS reads the placeholder as a format: \(hidden)")
            }
            // The asset's is the same sentence without the asset.
            let asset = HarnessCopy.body(HarnessFollowUp(step: .asset, fireAt: clock, symbol: "NVDA"))
            let rest = asset.drop { $0 != ":" }.dropFirst().trimmingCharacters(in: .whitespaces)
            XCTAssertEqual(HarnessCopy.hiddenBody(.asset).lowercased(), rest.lowercased(), language)
        }
        // Every follow-up iOS is handed is filed under a category that has that sentence and "Stop".
        let center = make()
        await ask(center, "NVDA")
        _ = await center.accept()
        XCTAssertEqual(fake.requests.count, 2)
        let known = Dictionary(uniqueKeysWithValues: fake.categories.map { ($0.id, $0) })
        for notice in fake.requests.values {
            let request = notice.request()
            XCTAssertEqual(request.content.categoryIdentifier, HarnessCategory.id(for: notice.step))
            let category = try XCTUnwrap(known[request.content.categoryIdentifier], "registered before it was scheduled")
            XCTAssertEqual(category.hiddenBody, HarnessCopy.hiddenBody(notice.step))
            let system = category.system
            XCTAssertEqual(system.hiddenPreviewsBodyPlaceholder, category.hiddenBody)
            XCTAssertFalse(system.options.contains(.hiddenPreviewsShowTitle), "nothing of the notification shows through")
            XCTAssertFalse(system.options.contains(.hiddenPreviewsShowSubtitle))
            XCTAssertEqual(system.actions.map(\.identifier), [HarnessCategory.stopAction], "one action")
            XCTAssertEqual(system.actions.first?.title, "Stop")
            XCTAssertEqual(request.content.title, "Bobby")
            XCTAssertEqual(request.content.subtitle, "")
        }
        XCTAssertEqual(Set(fake.categories.map(\.id)).count, 2, "the question and the week")
    }

    func testTheCategoriesAreToldToIOSAtTheYesAndAgainInAnotherLanguage() async {
        let center = make()
        await ask(center, "NVDA")
        XCTAssertEqual(fake.registrations, 0, "nothing is told to iOS before the yes")
        _ = await center.accept()
        XCTAssertEqual(fake.registrations, 1)
        XCTAssertEqual(fake.categories.first { $0.id == HarnessCategory.id(for: .asset) }?.stopTitle, "Stop")
        XCTAssertEqual(fake.permissionRequests, 1, "categories are not a permission: iOS was asked once, by the yes")
        L.select("es")
        await center.registerCategories()
        XCTAssertEqual(fake.categories.first { $0.id == HarnessCategory.id(for: .asset) }?.hiddenBody, "De vuelta a tu pregunta.")
        XCTAssertEqual(fake.categories.first { $0.id == HarnessCategory.id(for: .week) }?.stopTitle, "Ya no")
        inEveryLanguage { language in
            XCTAssertLessThanOrEqual(HarnessCopy.stopAction.count, 12, "\(language): short enough for a button")
            XCTAssertFalse(HarnessCopy.stopAction.isEmpty, language)
        }
    }

    // MARK: C4 — stopping is one tap

    func testStopOnTheNotificationTurnsFollowUpsOffWithoutOpeningTheApp() async throws {
        let center = make()
        await ask(center, "NVDA")
        _ = await center.accept()
        center.noteSaved(symbol: "NVDA", horizonHours: 72)
        let notice = try XCTUnwrap(fake.requests["v18.follow.asset"])
        clock = at(10, 17)                             // three days later: it is on the lock screen
        fake.deliver(before: clock)
        XCTAssertEqual(fake.delivered.count, 1)
        let intent = HarnessIntent(observeAccount: false)
        // The delegate's own path, with what the delivered notification carries.
        let tap = HarnessTap.tap(from: notice.request().content.userInfo)
        await BobbyAppDelegate.followUpResponse(action: HarnessCategory.stopAction, tap: tap, intent: intent, harness: center)

        XCTAssertEqual(center.mode, .off, "what the switch in Reminders does")
        XCTAssertTrue(center.ledger.isEmpty, "the ledger is erased")
        XCTAssertEqual(try storedEvents().count, 0)
        XCTAssertEqual(fake.requests.count, 0, "what was still to come is removed")
        XCTAssertEqual(fake.delivered.count, 0, "and what was on the lock screen")
        XCTAssertEqual(center.upcoming, [])
        XCTAssertNil(intent.pending, "nothing waits to be opened: the app was not brought up")
        XCTAssertEqual(HarnessStore(defaults: defaults).mode(owner: nil), .off, "it survives a relaunch")
        // It is never asked again by itself: the offer is only for someone who has not decided.
        let read = NudgeRead(requestId: "r", symbol: "NVDA", name: "NVIDIA", isEquity: true, verdict: "wait", saved: false, at: clock, memory: nil)
        let moment = NudgeMoment(signedIn: false, now: clock, lastRead: read, readsThisLaunch: 1)
        XCTAssertNil(HarnessNudges.offer(moment, mode: center.mode))
        XCTAssertNotNil(HarnessNudges.offer(moment, mode: .undecided), "the same moment would be offered to someone undecided")
        // And the same state as turning the switch off.
        let other = UserDefaults(suiteName: suiteName + ".switch")!
        defer { other.removePersistentDomain(forName: suiteName + ".switch") }
        let switched = HarnessCenter(notifier: FakeHarnessNotifier(), defaults: other)
        switched.consent = { .accepted }
        switched.currentUser = { nil }
        switched.weeklyCovered = { false }
        switched.quote = { _ in nil }
        switched.load(owner: nil)
        switched.noteAsk(symbol: "NVDA", name: "NVDA", isEquity: true, price: 100)
        _ = await switched.accept()
        await switched.turnOff()
        XCTAssertEqual(switched.mode, center.mode)
        XCTAssertEqual(switched.ledger, center.ledger)
        XCTAssertEqual(switched.upcoming, center.upcoming)
        XCTAssertEqual(HarnessStore(defaults: other).mode(owner: nil), HarnessStore(defaults: defaults).mode(owner: nil))
    }

    func testStopWorksWhenIOSWokeTheAppForItAlone() async throws {
        let first = make()
        await ask(first, "NVDA")
        _ = await first.accept()
        let userInfo = try XCTUnwrap(fake.requests["v18.follow.asset"]).request().content.userInfo
        // Another launch: nothing was loaded, no screen exists, iOS hands over the action.
        let woken = HarnessCenter(notifier: fake, defaults: defaults)
        woken.consent = { .accepted }
        woken.currentUser = { nil }
        XCTAssertEqual(woken.mode, .undecided, "nothing read from the phone yet")
        await BobbyAppDelegate.followUpResponse(action: HarnessCategory.stopAction, tap: HarnessTap.tap(from: userInfo),
                                                intent: HarnessIntent(observeAccount: false), harness: woken)
        XCTAssertEqual(HarnessStore(defaults: defaults).mode(owner: nil), .off)
        XCTAssertTrue(HarnessStore(defaults: defaults).ledger(owner: nil).isEmpty)
        XCTAssertEqual(HarnessStore(defaults: defaults).plan(owner: nil), [])
        XCTAssertEqual(fake.requests.count, 0)
    }

    func testOnlyStopStopsAndOnlyForTheReaderItWasPlannedFor() async throws {
        let center = make()
        await ask(center, "NVDA")
        _ = await center.accept()
        let userInfo = try XCTUnwrap(fake.requests["v18.follow.asset"]).request().content.userInfo
        let tap = try XCTUnwrap(HarnessTap.tap(from: userInfo))
        let intent = HarnessIntent(observeAccount: false)
        // Swiped away, or an action this app does not know: nothing.
        for action in [UNNotificationDismissActionIdentifier, "something.else"] {
            await BobbyAppDelegate.followUpResponse(action: action, tap: tap, intent: intent, harness: center)
            XCTAssertEqual(center.mode, .on)
            XCTAssertNil(intent.pending)
        }
        // Tapped: stored for the Núcleo, and follow-ups stay on.
        await BobbyAppDelegate.followUpResponse(action: UNNotificationDefaultActionIdentifier, tap: tap, intent: intent, harness: center)
        XCTAssertEqual(intent.pending, tap)
        XCTAssertEqual(center.mode, .on)
        // Not a follow-up of this app at all.
        await BobbyAppDelegate.followUpResponse(action: HarnessCategory.stopAction, tap: HarnessTap.tap(from: ["kind": "reminder"]), intent: intent, harness: center)
        XCTAssertEqual(center.mode, .on)
        // Planned for another reader of this phone: their "Stop" does not stop this one.
        var foreign = userInfo
        foreign["owner"] = HarnessCenter.ownerTag("someone-else")
        await BobbyAppDelegate.followUpResponse(action: HarnessCategory.stopAction, tap: HarnessTap.tap(from: foreign), intent: intent, harness: center)
        XCTAssertEqual(center.mode, .on)
        XCTAssertFalse(center.ledger.isEmpty)
        XCTAssertEqual(fake.requests.count, 2)
        // "Stop" after a tap that was waiting: the tap no longer opens anything.
        await BobbyAppDelegate.followUpResponse(action: HarnessCategory.stopAction, tap: tap, intent: intent, harness: center)
        XCTAssertEqual(center.mode, .off)
        XCTAssertNil(intent.pending)
    }

    // MARK: C5 — Bobby never invites someone into a wall

    func testTheNextReadIsKnownFromTheReceipt() {
        XCTAssertFalse(HarnessWall.open(nil), "not knowing is a no")
        XCTAssertFalse(HarnessWall.open(Self.unread), "neither is a server that could not read the meter")
        XCTAssertTrue(HarnessWall.open(Self.pro))
        XCTAssertTrue(HarnessWall.open(Self.guest(left: 6)))
        XCTAssertTrue(HarnessWall.open(Self.guest(left: 1)), "the last free read is still a read")
        XCTAssertFalse(HarnessWall.open(Self.guest(left: 0)), "the next one is the sign-in")
        XCTAssertTrue(HarnessWall.open(Self.free(left: 1)))
        XCTAssertFalse(HarnessWall.open(Self.free(left: 0)), "the next one is the paywall")
        XCTAssertTrue(HarnessWall.open(Self.free(left: 0, bonus: 2)), "gifted reads are spent after the week's")
        XCTAssertTrue(HarnessWall.open(Self.free(left: 0, paywall: false)), "no paywall behind the limit: the read is answered")
        // A receipt that leaves `remaining` out is read from what it does say.
        XCTAssertFalse(HarnessWall.open(BobbyReadAccess(tier: "free", used: 20, limit: 20, remaining: nil, resetsAt: nil, paywall: true)))
        XCTAssertTrue(HarnessWall.open(BobbyReadAccess(tier: "free", used: 19, limit: 20, remaining: nil, resetsAt: nil, paywall: true)))
        // A server receipt, as it arrives.
        XCTAssertFalse(HarnessWall.open(BobbyReadAccess(json: ["tier": "anon", "used": 6, "limit": 6, "remaining": 0, "paywall": true, "bonus": 0])))
        XCTAssertTrue(HarnessWall.open(BobbyReadAccess(json: ["tier": "pro", "used": 3, "paywall": false])))
        // The receipt the phone goes by: the latest reply's, else the one read at launch; never one whose week has ended.
        let now = at(7, 12)
        func receipt(left: Int, resets: Date?) -> BobbyReadAccess {
            BobbyReadAccess(tier: "free", used: 20 - left, limit: 20, remaining: left,
                            resetsAt: resets.map { ISO8601DateFormatter().string(from: $0) }, paywall: true)
        }
        let spent = receipt(left: 0, resets: at(9, 9)), fresh = receipt(left: 20, resets: at(14, 9)), ended = receipt(left: 0, resets: at(6, 9))
        XCTAssertEqual(HarnessWall.current([spent, fresh], now: now), spent, "the latest reply comes first")
        XCTAssertEqual(HarnessWall.current([nil, fresh], now: now), fresh)
        XCTAssertEqual(HarnessWall.current([ended, fresh], now: now), fresh, "a week that ended says nothing about this one")
        XCTAssertNil(HarnessWall.current([ended, nil], now: now), "so the phone asks again instead of keeping the button away")
        XCTAssertNil(HarnessWall.current([nil, nil], now: now))
        XCTAssertEqual(HarnessWall.current([Self.guest(left: 0)], now: now), Self.guest(left: 0), "a guest's reads do not come back by themselves")
    }

    func testWhenTheNextReadWouldBeRefusedTheLineStaysAndAsksNothing() async throws {
        reads = Self.free(left: 0)
        let center = make()
        await ask(center, "NVDA", price: 100)
        clock = at(8, 17)
        prices["NVDA"] = 102.3
        await center.appActive()
        let source = HarnessNudges.moveSource(center)
        let moment = NudgeMoment(signedIn: false, now: clock, lastRead: nil, readsThisLaunch: 0)
        let walled = try XCTUnwrap(source.candidate(moment))
        XCTAssertEqual(walled.text, "NVDA +2.3% since you asked", "the line needs no read: they still see it")
        XCTAssertEqual(walled.cta, "Got it", "and its button asks nothing")
        XCTAssertNotEqual(walled.cta, HarnessCopy.moveButton)
        L.select("es")
        XCTAssertEqual(try XCTUnwrap(source.candidate(moment)).cta, "Entendido")
        L.select("en")
        inEveryLanguage { language in
            XCTAssertLessThanOrEqual(HarnessCopy.moveSeen.count, NucleoNudge.ctaLimit, language)
            XCTAssertNil(HarnessCopy.moveSeen.rangeOfCharacter(from: CharacterSet(charactersIn: "?¿")), "\(language): not a question")
        }
        // A read comes back with reads left (a new week, a gift, Bobby Pro): the button asks again.
        reads = Self.free(left: 3)
        let open = try XCTUnwrap(source.candidate(moment))
        XCTAssertEqual(open.id, walled.id, "the same line")
        XCTAssertEqual(open.cta, "What changed?")
    }

    func testNotKnowingIsANoUntilThePhoneFindsOut() async throws {
        reads = nil
        serverSays = Self.guest(left: 4)
        let center = make()
        let source = HarnessNudges.moveSource(center)
        await ask(center, "NVDA", price: 100)
        XCTAssertEqual(asked, 0, "nothing is asked of the server for a line that is not there")
        clock = at(8, 17)
        prices["NVDA"] = 101
        XCTAssertFalse(center.readsOpen)
        await center.appActive()
        XCTAssertEqual(asked, 1, "with a line to draw, the phone finds out (it costs no read)")
        XCTAssertTrue(center.readsOpen)
        let moment = NudgeMoment(signedIn: false, now: clock, lastRead: nil, readsThisLaunch: 0)
        XCTAssertEqual(try XCTUnwrap(source.candidate(moment)).cta, "What changed?")
        // Known now: it is not asked again.
        await center.refreshMove()
        XCTAssertEqual(asked, 1)
        // The server cannot be reached: the line is there, the button asks nothing.
        reads = nil
        serverSays = nil
        await center.refreshMove()
        XCTAssertEqual(asked, 2)
        XCTAssertEqual(try XCTUnwrap(source.candidate(moment)).cta, "Got it")
    }

    func testAFollowUpPathNeverEndsOnASignInOrAPaywallSheet() async throws {
        let walls: [(String, BobbyReadAccess?)] = [("a guest at the sign-in", Self.guest(left: 0)), ("a free account at the paywall", Self.free(left: 0)),
                                                   ("a phone that does not know", nil), ("a server that could not say", Self.unread)]
        for (who, wall) in walls {
            defaults.removePersistentDomain(forName: suiteName)
            fake = FakeHarnessNotifier()
            clock = at(7, 16, 40)
            reads = Self.free(left: 5)
            let center = make()
            await ask(center, "NVDA", price: 100)
            _ = await center.accept()
            let assetInfo = try XCTUnwrap(fake.requests["v18.follow.asset"]).request().content.userInfo
            let weekInfo = try XCTUnwrap(fake.requests["v18.follow.week"]).request().content.userInfo
            let intent = HarnessIntent(observeAccount: false)
            let (session, bridge, recorder) = makeSession(harness: center, intent: intent)
            defer { session.teardown() }
            _ = await call(bridge, "session", ["page": "app"])
            await settle()
            // The reads ran out, the follow-up arrives the next day and is tapped.
            reads = wall
            clock = at(8, 18)
            fake.deliver(before: clock)
            prices["NVDA"] = 104
            await BobbyAppDelegate.followUpResponse(action: UNNotificationDefaultActionIdentifier, tap: HarnessTap.tap(from: assetInfo),
                                                    intent: intent, harness: center)
            await settle()
            await center.refreshMove()
            XCTAssertNil(session.sheet, "\(who): the asset's follow-up lands on the glass")
            XCTAssertEqual(center.ledger.events(.opened).count, 1, who)
            // Its line is there, and its button starts nothing.
            let source = HarnessNudges.moveSource(center)
            let nudge = try XCTUnwrap(source.candidate(NudgeMoment(signedIn: false, now: clock, lastRead: nil, readsThisLaunch: 0)), who)
            XCTAssertEqual(nudge.text, "NVDA +4% since you asked", who)
            XCTAssertEqual(nudge.cta, "Got it", who)
            await source.act(nudge, session)
            await settle()
            XCTAssertTrue(recorder.named("ask.start").isEmpty, "\(who): no read is launched")
            XCTAssertNil(session.sheet, who)
            XCTAssertEqual(center.ledger.events(.picked).count, 0, "\(who): and nothing is counted as acted on")
            // Even a tap on a button drawn before the reads ran out starts nothing.
            await source.act(NucleoNudge(id: nudge.id, text: nudge.text, cta: HarnessCopy.moveButton), session)
            await settle()
            XCTAssertTrue(recorder.named("ask.start").isEmpty, who)
            // The week's follow-up opens its board, which needs no read, and never a wall.
            await BobbyAppDelegate.followUpResponse(action: UNNotificationDefaultActionIdentifier, tap: HarnessTap.tap(from: weekInfo),
                                                    intent: intent, harness: center)
            await settle()
            XCTAssertEqual(session.sheet, .followUp, who)
            XCTAssertFalse(center.readsOpen, "\(who): the board's rows are not buttons (HarnessBoardContent.asks)")
            let opened = recorder.named("native.sheet").compactMap { $0["route"] as? String }
            XCTAssertEqual(Set(opened), ["followUp"], "\(who): the only sheet this path ever opened")
            XCTAssertFalse(opened.contains(NucleoRoute.paywall.rawValue) || opened.contains(NucleoRoute.account.rawValue)
                           || opened.contains(NucleoRoute.invite.rawValue), who)
            XCTAssertTrue(recorder.named("ask.start").isEmpty, who)
            HarnessBoardFocus.pending = nil
        }
    }

    func testAReadBobbyStartsRunsAtQuickWhateverLevelIsSaved() async throws {
        let center = make()
        await ask(center, "NVDA", price: 100)
        _ = await center.accept()
        let (session, bridge, recorder) = makeSession(harness: center, intent: HarnessIntent(observeAccount: false))
        defer { session.teardown() }
        var ran: [NucleoAnalysisLevel] = [], savedLevels: [NucleoAnalysisLevel] = []
        session.desk.currentLevel = { .profundo }
        session.desk.setLevel = { savedLevels.append($0) }
        session.desk.debateStarted = { ran.append($0) }
        _ = await call(bridge, "session", ["page": "app"])

        // 1. The button of the line on the glass.
        clock = at(8, 17)
        prices["NVDA"] = 102
        await center.appActive()
        let source = HarnessNudges.moveSource(center)
        let nudge = try XCTUnwrap(source.candidate(NudgeMoment(signedIn: false, now: clock, lastRead: nil, readsThisLaunch: 0)))
        XCTAssertEqual(nudge.cta, "What changed?")
        await source.act(nudge, session)
        let start = try XCTUnwrap(recorder.named("ask.start").last)
        XCTAssertEqual(Set(start.keys), ["token", "question"], "the page is handed a token and the words; nothing else")
        XCTAssertEqual(start["question"] as? String, "What changed in NVDA since I asked?")
        let fromLine = await call(bridge, "ask", ["token": try XCTUnwrap(start["token"] as? String)])
        XCTAssertEqual(fromLine["status"] as? String, "ok")
        XCTAssertEqual(ran, [.rapido], "Quick, though Deep is the saved level")

        // 2. A row of a board (the same native start).
        XCTAssertTrue(session.startRead(symbol: "NVDA", name: "NVIDIA", isEquity: true, question: HarnessCopy.lookQuestion(symbol: "NVDA")))
        let fromRow = await call(bridge, "ask", ["token": try XCTUnwrap(recorder.named("ask.start").last?["token"] as? String)])
        XCTAssertEqual(fromRow["status"] as? String, "ok")
        XCTAssertEqual(ran, [.rapido, .rapido])

        // 3. Their own question runs at their level, and the question Bobby wrote for it at Quick.
        let own = await call(bridge, "ask", ["question": "Should I buy NVIDIA right now?"])
        let id = try XCTUnwrap(own["requestId"] as? String)
        XCTAssertEqual(ran.last, .profundo)
        XCTAssertEqual((own["synthesis"] as? [String: Any])?["followUp"] as? String, Self.offered)
        let picked = await call(bridge, "ask", ["followUpOf": id, "question": Self.offered])
        XCTAssertEqual(picked["status"] as? String, "ok")
        XCTAssertEqual(ran.last, .rapido, "Bobby's question never spends a level the person rations")
        let typed = await call(bridge, "ask", ["followUpOf": id, "question": "And what does the volume say?"])
        XCTAssertEqual(typed["status"] as? String, "ok")
        XCTAssertEqual(ran.last, .profundo, "their own words about the same read keep their level")
        XCTAssertEqual(savedLevels, [], "the saved level was never touched")
    }

    func testBobbysOwnQuestionIsOfferedOnlyWhenTheNextReadIsAnswered() async throws {
        // The app's own wiring: what a real (not fixture) session does with the receipt of a read.
        let profile = AgentProfile()
        let session = NucleoSession(fixtures: false, profile: profile, companions: CompanionStore(defaults: defaults),
                                    ledger: NucleoLedger(defaults: defaults), defaults: defaults,
                                    briefingIntent: BriefingIntent(observeAccount: false), reminderIntent: ReminderIntent(observeAccount: false),
                                    harnessIntent: HarnessIntent(observeAccount: false))
        defer { session.teardown() }
        XCTAssertTrue(session.desk.offersNextQuestion(Self.free(left: 4)))
        XCTAssertTrue(session.desk.offersNextQuestion(Self.pro))
        XCTAssertFalse(session.desk.offersNextQuestion(Self.free(left: 0)), "this read was the last: the chip would lead to the paywall")
        XCTAssertFalse(session.desk.offersNextQuestion(Self.guest(left: 0)), "or to the sign-in")
        XCTAssertFalse(session.desk.offersNextQuestion(nil), "a reply without a receipt: not known, not offered")
        // And a question that was withheld never reaches the page, so it cannot be tapped (NextQuestionTests
        // covers the page side). Here: the desk asked with the receipt of that very read.
        let (fixture, bridge, _) = makeSession(harness: make(), intent: HarnessIntent(observeAccount: false))
        defer { fixture.teardown() }
        fixture.desk.currentLevel = { .profundo }
        fixture.desk.setLevel = { _ in }
        var receipts: [BobbyReadAccess?] = []
        fixture.desk.offersNextQuestion = { receipts.append($0); return HarnessWall.open(Self.free(left: 0)) }
        _ = await call(bridge, "session", ["page": "app"])
        let read = await call(bridge, "ask", ["question": "Should I buy NVIDIA right now?"])
        XCTAssertEqual(read["status"] as? String, "ok", "the read itself is delivered")
        XCTAssertEqual(receipts.count, 1)
        XCTAssertNil((read["synthesis"] as? [String: Any])?["followUp"] as? String, "without the question that would lead into the wall")
    }

    // MARK: C6 — what Bobby keeps is on the Memory screen, in sentences

    func testTheNotesHeaderStatesHowTheAppIsBuiltInTwentyWordsOrFewer() {
        XCTAssertEqual(HarnessNotes.header, "Notes Bobby keeps on this iPhone to choose when to come back. They are not sent to the AI.")
        L.select("es")
        XCTAssertEqual(HarnessNotes.header, "Notas que Bobby guarda en este iPhone para elegir cuándo volver. No se envían a la IA.")
        inEveryLanguage { language in
            let header = HarnessNotes.header
            XCTAssertLessThanOrEqual(header.split(whereSeparator: { $0 == " " || $0 == "\u{00A0}" }).filter { $0 != ":" }.count, 20, "\(language): \(header)")
            XCTAssertTrue(header.contains("iPhone"), language)
            // A fact about how the app is built. Nothing about what a verdict will or will not do.
            for promise in ["verdict", "veredict", "verdetto", "urteil", "never", "nunca", "jamais", "mai ", "niemals"] {
                XCTAssertFalse(header.lowercased().contains(promise), "\(language): “\(header)” promises (\(promise))")
            }
        }
    }

    /// A ledger with every kind of note, on Wednesday 7 October 2026.
    private func sample(full: Bool) -> (ledger: HarnessLedger, upcoming: [HarnessFollowUp]) {
        var ledger = HarnessLedger()
        for day in [1, 3, 5] {
            ledger.note(HarnessEvent(kind: .ask, at: at(day, 14, 10), symbol: "NVDA", name: "NVIDIA", isEquity: true, price: 187.4213,
                                     horizon: day == 5 ? .week : nil))
        }
        ledger.note(HarnessEvent(kind: .saved, at: at(5, 14, 12), symbol: "NVDA", horizonHours: 168))
        ledger.note(HarnessEvent(kind: .picked, at: at(5, 14, 13), symbol: "NVDA"))
        ledger.note(HarnessEvent(kind: .ask, at: at(3, 9, 30), symbol: "BTC", name: "Bitcoin", isEquity: false, price: 61_234.5))
        ledger.note(HarnessEvent(kind: .ask, at: at(28, 18, 45, month: 9), symbol: "TSLA", name: "Tesla", isEquity: true, price: 300))
        ledger.note(HarnessEvent(kind: .ask, at: at(30, 18, 45, month: 9), symbol: "TSLA", name: "Tesla", isEquity: true, price: 300))
        ledger.note(HarnessEvent(kind: .thesis, at: at(30, 18, 50, month: 9), symbol: "TSLA", horizon: .month))
        var upcoming = [HarnessFollowUp(step: .asset, fireAt: at(12, 14, 10), symbol: "NVDA", name: "NVIDIA", isEquity: true, days: 7)]
        if full {
            for (month, day) in [(9, 29), (10, 1), (10, 4)] {
                let shown = at(day, 19, month: month)
                ledger.note(HarnessEvent(kind: .sent, at: shown, symbol: "TSLA", step: .asset))
                ledger.note(HarnessEvent(kind: .opened, at: shown.addingTimeInterval(600), symbol: "TSLA", step: .asset, ref: shown))
                ledger.note(HarnessEvent(kind: .returned, at: shown.addingTimeInterval(900), symbol: "TSLA", step: .asset, ref: shown))
            }
            for day in 1...6 { ledger.note(HarnessEvent(kind: .appOpen, at: at(day, 8))) }
            upcoming.append(HarnessFollowUp(step: .week, fireAt: at(19, 14, 10), symbol: "NVDA", others: 1))
        }
        return (ledger, upcoming)
    }

    func testTheNotesSayWhatIsKeptInSentences() {
        let now = at(7, 12)
        let three = sample(full: false)
        var notes = HarnessNotes.make(ledger: three.ledger, mode: .on, upcoming: three.upcoming, now: now, calendar: calendar)
        XCTAssertEqual(notes.assets.map(\.symbol), ["NVDA", "BTC", "TSLA"], "most recently asked about first")
        XCTAssertEqual(notes.assets[0].lines, ["Asked 3 times, last on Oct 5.", "Your question was about this week.",
                                               "You saved a read, to review in a week.", "Bobby comes back on Oct 12."])
        XCTAssertEqual(notes.assets[1].lines, ["Asked once, on Oct 3."])
        XCTAssertEqual(notes.assets[2].lines, ["Asked 2 times, last on Sep 30.", "Your thesis looks weeks ahead."])
        XCTAssertEqual(notes.general, [], "nothing to say about what Bobby does yet")
        XCTAssertTrue(notes.assets.allSatisfy(\.erasable))
        XCTAssertFalse(notes.isEmpty)
        // After a few weeks of follow-ups.
        let full = sample(full: true)
        notes = HarnessNotes.make(ledger: full.ledger, mode: .on, upcoming: full.upcoming, now: now, calendar: calendar)
        // iOS writes the hour with its own spacing: "7:00 PM", with a narrow space.
        let seven = HarnessCopy.hour(19, calendar: calendar)
        XCTAssertTrue(seven.hasPrefix("7:00") && seven.hasSuffix("PM"), seven)
        XCTAssertEqual(notes.general, ["Your week arrives on Oct 19.", "Follow-ups arrive around \(seven).",
                                       "Follow-ups: 3 shown, 3 tapped, 3 answered.", "Times you opened the app: 6."])
        L.select("es")
        notes = HarnessNotes.make(ledger: full.ledger, mode: .on, upcoming: full.upcoming, now: now, calendar: calendar)
        XCTAssertEqual(notes.assets[0].lines.first, "Preguntaste 3 veces, la última el \(HarnessCopy.day(at(5, 14, 10), calendar: calendar)).")
        XCTAssertEqual(Array(notes.assets[0].lines.dropFirst().prefix(2)), ["Tu pregunta era sobre esta semana.", "Guardaste una lectura, para revisar en una semana."])
        XCTAssertEqual(notes.assets[1].lines, ["Preguntaste una vez, el \(HarnessCopy.day(at(3, 9, 30), calendar: calendar))."])
        XCTAssertEqual(notes.assets[2].lines.last, "Tu tesis mira a semanas.")
        XCTAssertEqual(notes.general[1], "El seguimiento llega hacia las \(HarnessCopy.hour(19, calendar: calendar)).")
        XCTAssertEqual(notes.general[2], "Seguimientos: 3 mostrados, 3 tocados, 3 respondidos.")
        XCTAssertEqual(notes.general[3], "Veces que abriste la app: 6.")
        // Six languages: a sentence of its own in each, and no placeholder left in any.
        var firsts = Set<String>()
        inEveryLanguage { language in
            let said = HarnessNotes.make(ledger: full.ledger, mode: .on, upcoming: full.upcoming, now: now, calendar: calendar)
            firsts.insert(said.assets[0].text + said.general.joined())
            for line in said.assets.flatMap(\.lines) + said.general {
                XCTAssertFalse(line.contains("{") || line.isEmpty, "\(language): \(line)")
                XCTAssertTrue(line.hasSuffix("."), "\(language): a sentence: \(line)")
            }
        }
        XCTAssertEqual(firsts.count, Self.languages.count)
        // A price is a fact about the market, kept to say how far it moved; it is not said here, and no text ever is.
        let everything = notes.assets.map(\.text).joined() + notes.general.joined()
        XCTAssertFalse(everything.contains("187") || everything.contains("61"))
    }

    func testEveryFieldOfTheProfileIsSaidOrMarkedInternal() {
        let profile = HarnessProfile.make(sample(full: true).ledger, now: at(7, 12), calendar: calendar)
        // The compiler's hook rebuilds the profile field by field: it stops compiling when a field is added.
        XCTAssertEqual(profile.fieldByField(), profile)
        // And the list the Memory screen switches over is the list of the profile's stored fields.
        let stored = Mirror(reflecting: profile).children.compactMap(\.label).sorted()
        XCTAssertEqual(stored, HarnessProfile.Field.allCases.map { "\($0)" }.sorted())
        XCTAssertEqual(profile.hour, 19, "three answers at seven: the planner uses that hour, and the notes say so")
    }

    func testWhatBobbyDoesIsSaidOnlyWhenThePlannerDoesIt() {
        let now = at(7, 12)
        func notes(_ ledger: HarnessLedger, mode: HarnessMode = .on, upcoming: [HarnessFollowUp] = []) -> HarnessNotes {
            HarnessNotes.make(ledger: ledger, mode: mode, upcoming: upcoming, now: now, calendar: calendar)
        }
        // Two answers: the hour is not learned, and nothing is said about one.
        var ledger = HarnessLedger()
        ledger.note(HarnessEvent(kind: .ask, at: at(1, 10), symbol: "NVDA", name: "NVIDIA", isEquity: true, price: 100))
        for day in [2, 3] {
            ledger.note(HarnessEvent(kind: .sent, at: at(day, 19), symbol: "NVDA", step: .asset))
            ledger.note(HarnessEvent(kind: .returned, at: at(day, 19, 20), symbol: "NVDA", step: .asset, ref: at(day, 19)))
        }
        XCTAssertNil(HarnessProfile.make(ledger, now: now, calendar: calendar).hour)
        XCTAssertFalse(notes(ledger).general.contains { $0.contains("arrive") })
        // An hour learned outside the hours follow-ups arrive in is said as the planner uses it.
        var night = HarnessLedger()
        night.note(HarnessEvent(kind: .ask, at: at(1, 10), symbol: "NVDA", name: "NVIDIA", isEquity: true, price: 100))
        for day in [2, 3, 4] {
            night.note(HarnessEvent(kind: .sent, at: at(day, 20), symbol: "NVDA", step: .asset))
            night.note(HarnessEvent(kind: .returned, at: at(day, 23, 30), symbol: "NVDA", step: .asset, ref: at(day, 20)))
        }
        XCTAssertEqual(HarnessProfile.make(night, now: now, calendar: calendar).hour, 23)
        XCTAssertTrue(notes(night).general.contains("Follow-ups arrive around \(HarnessCopy.hour(21, calendar: calendar))."), "\(notes(night).general)")
        XCTAssertTrue(HarnessCopy.hour(21, calendar: calendar).hasPrefix("9:00"), "nine in the evening, the latest hour a follow-up arrives")
        // Three in a row that nobody answered: Bobby is quiet for two weeks from the last, and says until when.
        var ignored = HarnessLedger()
        ignored.note(HarnessEvent(kind: .ask, at: at(1, 10), symbol: "NVDA", name: "NVIDIA", isEquity: true, price: 100))
        for day in [2, 5, 6] { ignored.note(HarnessEvent(kind: .sent, at: at(day, 10), symbol: "NVDA", step: day == 5 ? .week : .asset)) }
        XCTAssertTrue(notes(ignored).general.contains("Quiet until Oct 20."), "\(notes(ignored).general)")
        XCTAssertEqual(HarnessPlanner.plan(ledger: ignored, now: now, calendar: calendar), [], "which is what the planner does")
        // Two of a kind unanswered, not yet three in a row: fewer, with no date to promise.
        var resting = HarnessLedger()
        resting.note(HarnessEvent(kind: .ask, at: at(1, 10), symbol: "NVDA", name: "NVIDIA", isEquity: true, price: 100))
        for day in [2, 6] { resting.note(HarnessEvent(kind: .sent, at: at(day, 10), symbol: "NVDA", step: .asset)) }
        XCTAssertTrue(HarnessProfile.make(resting, now: now, calendar: calendar).rests(.asset))
        XCTAssertTrue(notes(resting).general.contains("Fewer follow-ups for now."), "\(notes(resting).general)")
        XCTAssertFalse(notes(resting).general.contains { $0.hasPrefix("Quiet") })
        // Undecided: the question is all there is, and nothing is said about follow-ups that do not exist.
        let undecided = notes(ignored, mode: .undecided)
        XCTAssertEqual(undecided.assets.map(\.lines), [["Asked once, on Oct 1."]])
        XCTAssertFalse(undecided.general.contains { $0.hasPrefix("Quiet") || $0.contains("arrive") })
        // Nothing kept: one quiet line, and it says when follow-ups are off.
        XCTAssertTrue(notes(HarnessLedger(), mode: .undecided).isEmpty)
        XCTAssertEqual(notes(HarnessLedger(), mode: .undecided).quietLine, "No follow-up notes.")
        XCTAssertEqual(notes(HarnessLedger(), mode: .on).quietLine, "No follow-up notes.")
        XCTAssertEqual(notes(HarnessLedger(), mode: .off).quietLine, "Follow-ups are off.")
        L.select("es")
        XCTAssertEqual(notes(HarnessLedger(), mode: .off).quietLine, "El seguimiento está apagado.")
        XCTAssertEqual(notes(HarnessLedger(), mode: .undecided).quietLine, "Sin notas de seguimiento.")
        XCTAssertEqual(HarnessNotes.eraseAll, "Borrar notas")
        XCTAssertEqual(HarnessNotes.eraseOne, "Borrar")
        XCTAssertEqual(HarnessNotes.eraseLabel(symbol: "NVDA"), "Borrar las notas de NVDA")
        L.select("en")
        XCTAssertEqual(HarnessNotes.eraseAll, "Erase notes")
        XCTAssertEqual(HarnessNotes.eraseOne, "Erase")
        XCTAssertEqual(HarnessNotes.eraseLabel(symbol: "NVDA"), "Erase the notes about NVDA")
    }

    func testTheCentreSaysItsOwnNotesAndTheyFollowWhatThePersonDoes() async {
        let center = make()
        XCTAssertTrue(center.notes.isEmpty)
        await ask(center, "NVDA")
        XCTAssertEqual(center.notes.assets.map(\.lines), [["Asked once, on Oct 7."]], "undecided: the question")
        _ = await center.accept()
        XCTAssertEqual(center.notes.assets.first?.lines, ["Asked once, on Oct 7.", "Bobby comes back on Oct 8."])
        XCTAssertEqual(center.notes.general, ["Your week arrives on Oct 12."])
        await center.turnOff()
        XCTAssertTrue(center.notes.isEmpty)
        XCTAssertEqual(center.notes.quietLine, "Follow-ups are off.")
    }

    func testErasingOneAssetsNotesRemovesItsFollowUpAndNeverMakesBobbyLouder() async throws {
        let center = make()
        await ask(center, "TSLA", price: 300)
        _ = await center.accept()
        clock = at(8, 18)                              // TSLA's follow-up fired at 16:40 and was tapped
        fake.deliver(before: clock)
        await center.appActive()
        await center.opened(HarnessTap(step: .asset, symbol: "TSLA", sector: nil, owner: "local", stamp: at(8, 16, 40)))
        clock = at(8, 19)
        await ask(center, "NVDA", price: 100)
        center.noteSaved(symbol: "NVDA", horizonHours: 72)
        center.notePicked(symbol: "NVDA")
        await settle()
        XCTAssertEqual(fake.requests["v18.follow.asset"]?.symbol, "NVDA")
        // The glass kept a record of a line about each.
        let nudges = NudgeCenter(defaults: defaults)
        for id in ["harness.move.nvda.20261008", "harness.move.tsla.20261007"] {
            nudges.register(NudgeSource(key: "move", priority: 1, candidate: { _ in NucleoNudge(id: id, text: "x", cta: "y") }, act: { _, _ in }))
            _ = nudges.current(nudges.moment(signedIn: false))
            nudges.seen(id)
        }
        let shownBefore = center.ledger.events(.sent).count, streakBefore = center.ledger.unansweredStreak(before: clock).count
        let plannedBefore = center.upcoming.count
        XCTAssertEqual(center.notes.assets.map(\.symbol), ["NVDA", "TSLA"])

        await center.forget(symbol: "nvda")

        XCTAssertEqual(center.notes.assets.map(\.symbol), ["TSLA"])
        XCTAssertFalse(center.ledger.events.contains { $0.symbol == "NVDA" }, "what was asked, saved and tapped about it is gone")
        XCTAssertFalse(try storedEvents().contains { $0["symbol"] as? String == "NVDA" }, "from the phone's store too")
        XCTAssertNil(fake.requests["v18.follow.asset"], "and the follow-up that was coming about it")
        XCTAssertFalse(center.upcoming.contains { $0.symbol == "NVDA" })
        XCTAssertEqual(nudges.showings("harness.move.nvda.20261008"), 0, "and what the glass kept about its line")
        XCTAssertEqual(nudges.showings("harness.move.tsla.20261007"), 1, "the other asset's is untouched")
        XCTAssertEqual(center.ledger.events(.ask).compactMap(\.symbol), ["TSLA"])
        XCTAssertLessThanOrEqual(center.upcoming.count, plannedBefore)

        // Forgetting the asset a follow-up was about keeps that follow-up counted, without the asset.
        await center.forget(symbol: "TSLA")
        XCTAssertEqual(center.notes.assets, [])
        XCTAssertEqual(center.ledger.events(.sent).count, shownBefore, "what was shown stays counted")
        XCTAssertEqual(center.ledger.unansweredStreak(before: clock).count, streakBefore, "so Bobby is exactly as quiet as before")
        XCTAssertTrue(center.ledger.events.allSatisfy { $0.symbol == nil }, "and names no asset")
        XCTAssertEqual(center.upcoming, [], "with no question left, nothing is planned")
        XCTAssertEqual(fake.requests.count, 0)
        XCTAssertEqual(fake.delivered.count, 0, "nothing on the lock screen names it either")
        XCTAssertEqual(center.notes.general, ["Follow-ups: 1 shown, 1 tapped, 0 answered.", "Times you opened the app: 1."])
        XCTAssertEqual(center.mode, .on, "follow-ups stay on: only the notes went")
        // Erasing all of them leaves nothing, and keeps the yes.
        await center.forgetLedger()
        XCTAssertTrue(center.notes.isEmpty)
        XCTAssertEqual(center.mode, .on)
    }

    func testAThesisIsErasedWhereItWasWrittenNotFromTheNotes() async {
        var active: [(symbol: String, horizon: HarnessHorizon?, since: Date)] = [("NVDA", .long, at(1, 9))]
        let center = make()
        center.theses = { _ in active }
        await ask(center, "NVDA")
        _ = await center.accept()
        XCTAssertEqual(center.notes.assets.first?.lines.contains("Your thesis looks months or more ahead."), true)
        await center.forget(symbol: "NVDA")
        let left = center.notes.assets
        XCTAssertEqual(left.map(\.symbol), ["NVDA"], "the thesis is still theirs, and still times what Bobby does")
        XCTAssertEqual(left.first?.lines, ["Your thesis looks months or more ahead."])
        XCTAssertEqual(left.first?.erasable, false, "so the notes offer no button that would not erase it")
        active = []
        await center.replan()
        XCTAssertEqual(center.notes.assets, [], "archived in My theses, its pointer goes")
    }

    func testOnlyTheSymbolLeavesThePhoneAndOnlyInsideAQuestionThePersonSends() async throws {
        // 1. The two questions native writes say the asset and nothing else the ledger holds: no price,
        //    no count, no date, no hour. (A date would be allowed; today there is none.)
        inEveryLanguage { language in
            for question in [HarnessCopy.changedQuestion(symbol: "NVDA"), HarnessCopy.lookQuestion(symbol: "NVDA")] {
                XCTAssertTrue(question.contains("NVDA"), language)
                XCTAssertNil(question.replacingOccurrences(of: "NVDA", with: "").rangeOfCharacter(from: .decimalDigits), "\(language): \(question)")
            }
        }
        // 2. What a read Bobby starts hands to the page, with a ledger full of distinctive values.
        let center = make()
        center.noteAsk(symbol: "NVDA", name: "NVIDIA", isEquity: true, price: 187.4213, horizon: .month)
        _ = await center.accept()
        center.noteSaved(symbol: "NVDA", horizonHours: 168)
        clock = at(9, 19, 23)
        prices["NVDA"] = 191.7754
        await center.appActive()
        let (session, bridge, recorder) = makeSession(harness: center, intent: HarnessIntent(observeAccount: false))
        defer { session.teardown() }
        _ = await call(bridge, "session", ["page": "app"])
        let source = HarnessNudges.moveSource(center)
        let nudge = try XCTUnwrap(source.candidate(NudgeMoment(signedIn: false, now: clock, lastRead: nil, readsThisLaunch: 0)))
        await source.act(nudge, session)
        let start = try XCTUnwrap(recorder.named("ask.start").last)
        XCTAssertEqual(Set(start.keys), ["token", "question"])
        let question = try XCTUnwrap(start["question"] as? String)
        XCTAssertEqual(question, "What changed in NVDA since I asked?", "the words the person sees on the glass when it is asked")
        for kept in ["187", "4213", "191", "7754", "168", "month", "19:23"] {
            XCTAssertFalse(question.contains(kept), "“\(kept)” is in the ledger and must not be in a question")
        }
        XCTAssertEqual((start["token"] as? String)?.count, 36, "an opaque token: the asset it stands for stays in native")
        // 3. In the source: outside its own folder the ledger is read by the two screens that show it
        //    and by the two places that erase it, and by nothing that talks to a server.
        // Resolved, so the relative paths below come out right when the checkout sits behind a symbolic link.
        let sources = URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent().appendingPathComponent("Sources")
            .resolvingSymlinksInPath()
        let marks = ["HarnessLedger", "HarnessStore", "HarnessProfile", "HarnessNotes", "harness.ledger", "harness?.ledger", "harness.profile",
                     "harness.notes", "HarnessCenter.shared.ledger", "HarnessCenter.shared.profile", "HarnessCenter.shared.notes"]
        var readers = Set<String>()
        let files = try XCTUnwrap(FileManager.default.enumerator(at: sources, includingPropertiesForKeys: nil))
        for case let file as URL in files where file.pathExtension == "swift" {
            let path = file.resolvingSymlinksInPath().path.replacingOccurrences(of: sources.path + "/", with: "")
            guard !path.hasPrefix("V18/Harness/") else { continue }
            let text = try String(contentsOf: file, encoding: .utf8)
            if marks.contains(where: { text.contains($0) }) { readers.insert(path) }
        }
        XCTAssertGreaterThan(readers.count, 0, "the sources were found")
        XCTAssertEqual(readers, ["AccountSession.swift", "Briefings/MemoryCenter.swift", "Briefings/MemoryView.swift", "V18/Reminders/RemindersSheet.swift"],
                       "a new reader of the ledger has to be looked at: does anything it reads leave the phone?")
    }

    // MARK: C7 — a gate on words

    /// Words Bobby never says, even negated, and claims of having watched, per language. Matched at
    /// the start of a word, so "notes" is not "notice" and "retour" is not "rendement".
    private static let forbidden: [String: [String]] = [
        "en": ["buy", "bought", "sell", "sold", "profit", "guarantee", "return", "advice", "advis", "signal", "alert",
               "watch", "monitor", "notic", "detect", "track", "spott"],
        "es": ["compr", "vend", "venta", "gananc", "garant", "rendimiento", "retorno", "consej", "asesor", "señal", "alert",
               "vigil", "monitor", "notó", "notar", "noté", "advert", "detect", "observ", "rastre"],
        "fr": ["achet", "achat", "vend", "vente", "profit", "bénéfice", "gain", "garanti", "rendement", "conseil", "signal", "alert",
               "surveill", "détect", "remarqu", "observ", "repér", "constat"],
        "pt": ["compr", "vend", "lucro", "ganho", "garant", "rendimento", "retorno", "conselh", "sinal", "alert",
               "vigi", "monitor", "detet", "detect", "repar", "observ", "not"],
        "it": ["compr", "acquist", "vend", "profitt", "guadagn", "garant", "rendiment", "ritorn", "consigli", "segnal", "allert", "allarm", "avvis",
               "sorvegli", "monitor", "rilev", "notat", "osserv"],
        "de": ["kauf", "verkauf", "gewinn", "profit", "garant", "rendite", "ertrag", "ratschlag", "beratung", "empfehl", "signal", "alarm", "warn", "alert",
               "beobacht", "überwach", "bemerk", "entdeck", "erkann", "festgestell"],
    ]

    /// Portuguese "not-" is a claim ("notou", "notei") except in the word for the notes themselves.
    private static let allowed: [String: [String]] = ["pt": ["notas", "nota"]]

    private static func hits(_ line: String, language: String) -> [String] {
        let words = line.lowercased().components(separatedBy: CharacterSet.letters.inverted).filter { !$0.isEmpty }
        let fine = allowed[language] ?? []
        return (forbidden[language] ?? []).filter { stem in words.contains { $0.hasPrefix(stem) && !fine.contains($0) } }
    }

    /// Everything the harness can say in the language selected now, each line with where it is said.
    private func everythingSaid() -> [(place: String, line: String)] {
        var said: [(place: String, line: String)] = []
        func add(_ place: String, _ lines: [String]) { for line in lines { said.append((place: place, line: line)) } }
        let now = at(7, 12)
        // The lock screen, its hidden form and its action.
        add("lock screen", [HarnessFollowUp(step: .asset, fireAt: now, symbol: "NVDA", days: 3), HarnessFollowUp(step: .sector, fireAt: now, symbol: "NVDA", sector: "semis"),
                            HarnessFollowUp(step: .week, fireAt: now, symbol: "NVDA", others: 2), HarnessFollowUp(step: .week, fireAt: now, symbol: "NVDA", others: 0)]
            .map(HarnessCopy.body))
        add("locked, previews hidden", HarnessStep.allCases.map(HarnessCopy.hiddenBody))
        add("lock screen title", [HarnessCopy.notificationTitle])
        add("the Stop action", [HarnessCopy.stopAction])
        // The glass.
        add("glass", [HarnessCopy.offerLine(symbol: "NVDA"), HarnessCopy.offerLine(symbol: "ABCDEFGHIJKLMNOPQRST")])
        add("glass button", [HarnessCopy.offerButton, HarnessCopy.moveButton, HarnessCopy.moveSeen])
        for pct in [nil, 0.0, 3.2, -3.2] as [Double?] {
            add("glass", [1, 3].map { HarnessCopy.moveLine(symbol: "NVDA", pct: pct, days: $0) })
        }
        // The questions Bobby is asked on a tap.
        add("question", [HarnessCopy.changedQuestion(symbol: "NVDA"), HarnessCopy.lookQuestion(symbol: "NVDA")])
        // The board and the switch.
        add("board", [HarnessCopy.weekTitle, HarnessCopy.sinceAsked, HarnessCopy.last24h, HarnessCopy.boardEmpty, HarnessCopy.boardFoot])
        add("board", HarnessSectors.all.map(\.title))
        add("switch", [HarnessCopy.switchLabel, HarnessCopy.switchDetail])
        // The Memory screen: the header, the quiet lines, the erase buttons and every sentence a ledger can produce.
        add("memory", [HarnessNotes.header, HarnessNotes.eraseAll, HarnessNotes.eraseOne, HarnessNotes.eraseLabel(symbol: "NVDA"),
                       HarnessNotes(mode: .off).quietLine, HarnessNotes(mode: .undecided).quietLine])
        var ledgers: [(HarnessLedger, [HarnessFollowUp])] = [sample(full: true), sample(full: false)]
        let saves: [Int?] = [24, 72, 168, nil, nil]
        let theses: [HarnessHorizon?] = [.month, .long, nil, nil, nil]
        for (index, horizon) in [HarnessHorizon.intraday, .week, .month, .long, .unspecified].enumerated() {
            var ledger = HarnessLedger()
            ledger.note(HarnessEvent(kind: .ask, at: at(1, 10), symbol: "NVDA", name: "NVIDIA", isEquity: true, price: 100, horizon: horizon))
            ledger.note(HarnessEvent(kind: .saved, at: at(1, 11), symbol: "NVDA", horizonHours: saves[index]))
            ledger.note(HarnessEvent(kind: .thesis, at: at(1, 12), symbol: "NVDA", horizon: theses[index]))
            // Unanswered: once enough for "fewer", once enough for "quiet until".
            for day in (index == 0 ? [2, 6] : index == 1 ? [2, 5, 6] : []) { ledger.note(HarnessEvent(kind: .sent, at: at(day, 10), symbol: "NVDA", step: .asset)) }
            ledgers.append((ledger, []))
        }
        var sentences = Set<String>()
        for (ledger, upcoming) in ledgers {
            let notes = HarnessNotes.make(ledger: ledger, mode: .on, upcoming: upcoming, now: now, calendar: calendar)
            sentences.formUnion(notes.assets.flatMap(\.lines) + notes.general)
        }
        add("memory", sentences.sorted())
        return said
    }

    func testNoHarnessStringSaysAForbiddenWordInAnyLanguage() {
        var perLanguage: [String: Int] = [:]
        inEveryLanguage { language in
            let said = everythingSaid()
            perLanguage[language] = Set(said.map(\.line)).count
            for (place, line) in said {
                XCTAssertEqual(Self.hits(line, language: language), [], "\(language), \(place): “\(line)”")
                XCTAssertFalse(line.contains("!") || line.contains("¡"), "\(language), \(place): “\(line)”")
                XCTAssertFalse(line.contains("{"), "\(language), \(place): a placeholder was left in “\(line)”")
                XCTAssertFalse(line.isEmpty, "\(language), \(place)")
                for name in ["OKX", "OKB", "X Layer"] { XCTAssertFalse(line.contains(name), "\(language), \(place): “\(line)”") }
            }
        }
        // Every sentence the notes can say was in the sweep: 2 + 4 + 4 + 3 + 1 about an asset, 6 about what Bobby does.
        let english = everythingSaid()
        let memory = Set(english.filter { $0.place == "memory" }.map(\.line))
        for needle in ["Asked once", "Asked 3 times", "about today", "about this week", "about this month", "about months or years",
                       "You saved a read.", "review in a day", "review in 3 days", "review in a week", "You wrote a thesis", "weeks ahead",
                       "months or more ahead", "Bobby comes back on", "Your week arrives on", "Follow-ups arrive around", "Quiet until",
                       "Fewer follow-ups", "Follow-ups: 3 shown", "Times you opened the app"] {
            XCTAssertTrue(memory.contains { $0.contains(needle) }, "the sweep never produced “\(needle)”")
        }
        XCTAssertGreaterThanOrEqual(perLanguage.values.min() ?? 0, 55, "the sweep is as long in every language: \(perLanguage)")
        XCTAssertEqual(Set(perLanguage.values).count, 1, "\(perLanguage)")
        // The catalog itself: every row of the harness table, whether or not a code path reaches it today.
        for (key, row) in NativeTranslations18.harness {
            XCTAssertEqual(Self.hits(key, language: "en"), [], "en catalog: “\(key)”")
            for (language, text) in row { XCTAssertEqual(Self.hits(text, language: language), [], "\(language) catalog: “\(text)”") }
        }
        // The gate catches what it is there for.
        XCTAssertEqual(Self.hits("Bobby noticed NVDA: buy the alert.", language: "en"), ["buy", "alert", "notic"])
        XCTAssertEqual(Self.hits("Bobby detectó una señal de compra.", language: "es"), ["compr", "señal", "detect"])
        XCTAssertEqual(Self.hits("Bobby a remarqué un signal.", language: "fr"), ["signal", "remarqu"])
        XCTAssertEqual(Self.hits("O Bobby notou um sinal.", language: "pt"), ["sinal", "not"])
        XCTAssertEqual(Self.hits("Bobby ha rilevato un segnale.", language: "it"), ["segnal", "rilev"])
        XCTAssertEqual(Self.hits("Bobby hat ein Signal bemerkt.", language: "de"), ["signal", "bemerk"])
        XCTAssertEqual(Self.hits("Notes Bobby keeps. Back to your question.", language: "en"), [])
    }
}
