import Foundation
import UserNotifications
import XCTest
@testable import Bobby

/// A read native starts (1.8): a row of a board, the button of the line on the glass. The page
/// takes such a question only from its idle home and says nothing when it does not, and its own
/// clock stands still under a native sheet (pinned on the shipping page by
/// `Nucleo/tests/bridge-boot.test.mjs`, "PINNED FACTS native works around"). These tests drive the
/// real session, bridge, desk and harness against a stand-in for that page, on a clock of their own.
@MainActor
final class NucleoReadStartTests: XCTestCase {
    /// The app page, as far as this path goes. What it does here is what the shipping page does:
    ///  - BOOT until its `session` call is answered, then WAKE for 0.9 s of its OWN clock, then IDLE;
    ///  - its clock runs only in front and with no native sheet over it (`native.sheet`);
    ///  - `ask.start {token}` is taken only from IDLE and with no sheet: the page calls `ask {token}`
    ///    and is busy with that read. Anywhere else the event is dropped and nothing is remembered.
    private final class Page: NucleoEmitting {
        enum State: Equatable { case boot, wake, idle, sending, read, typing }

        private(set) var state: State = .boot
        private(set) var sheetOpen = false
        var inFront = true
        /// The shipping page: 0.9 s. A slow phone's page takes longer.
        var wakeSeconds: TimeInterval = 0.9
        private var ownClock: TimeInterval = 0
        private(set) var events: [(name: String, payload: [String: Any])] = []
        /// The tokens the page asked with, and what native answered (a result, or a fault's code).
        private(set) var asked: [String] = []
        private(set) var replies: [[String: Any]] = []
        private(set) var faults: [String] = []
        /// The state the page was in each time a sheet came up over it.
        private(set) var coveredIn: [State] = []
        var bridge: NucleoBridge!
        private var calls: [Task<Void, Never>] = []

        func pageReady() {}

        func emit(_ name: String, _ payload: [String: Any]) {
            events.append((name, payload))
            switch name {
            case "native.sheet":
                sheetOpen = payload["state"] as? String == "open"
                if sheetOpen { coveredIn.append(state) }
            case "ask.start":
                guard let token = payload["token"] as? String, !token.isEmpty, !sheetOpen, state == .idle else { return }
                state = .sending
                asked.append(token)
                ask(["token": token])
            default:
                break
            }
        }

        func named(_ name: String) -> [[String: Any]] { events.filter { $0.name == name }.map(\.payload) }

        /// The page loads and makes its first call.
        func boot() async {
            state = .boot
            sheetOpen = false
            ownClock = 0
            _ = await bridge.handle(body: ["v": 1, "method": "session", "params": ["page": "app"]], trusted: true)
            state = .wake
        }

        /// Real time passes. The page only lives it in front, with nothing over it.
        func run(_ seconds: TimeInterval) {
            guard inFront, !sheetOpen else { return }
            ownClock += seconds
            if state == .wake, ownClock >= wakeSeconds - 1e-9 { state = .idle }
        }

        /// The person opens the keyboard and starts to write: the page takes no question while it is up.
        func openKeyboard() { if state == .idle { state = .typing } }

        /// They put the keyboard away without sending.
        func closeKeyboard() { if state == .typing { state = .idle } }

        /// They send what they typed.
        func send(_ question: String) {
            guard state == .typing, !sheetOpen else { return }
            state = .sending
            ask(["question": question])
        }

        private func ask(_ params: [String: Any]) {
            calls.append(Task { [weak self] in
                guard let self, let bridge = self.bridge else { return }
                let (reply, _) = await bridge.handle(body: ["v": 1, "method": "ask", "params": params], trusted: true)
                let envelope = reply as? [String: Any] ?? [:]
                if envelope["ok"] as? Bool == true {
                    self.replies.append(envelope["result"] as? [String: Any] ?? [:])
                    self.state = .read
                } else {
                    self.faults.append((envelope["error"] as? [String: Any])?["code"] as? String ?? "?")
                    self.state = .idle
                }
            })
        }

        /// Every read the page asked for has been answered.
        func answered() async {
            let waiting = calls
            calls = []
            for call in waiting { await call.value }
        }
    }

    /// The session's clock: what it asked to be woken for runs when the test lets that much time pass.
    private final class Timeline {
        private var now: TimeInterval = 0
        private var order = 0
        private var waiting: [(at: TimeInterval, order: Int, work: () -> Void)] = []

        func after(_ delay: TimeInterval, _ work: @escaping () -> Void) {
            order += 1
            waiting.append((now + max(0, delay), order, work))
        }

        func advance(_ seconds: TimeInterval) {
            let end = now + seconds
            while let next = waiting.filter({ $0.at <= end + 1e-9 }).min(by: { ($0.at, $0.order) < ($1.at, $1.order) }) {
                waiting.removeAll { $0.order == next.order }
                now = max(now, next.at)
                next.work()
            }
            now = end
        }
    }

    private struct World {
        let session: NucleoSession
        let bridge: NucleoBridge
        let page: Page
        let time: Timeline
    }

    private static let profileKeys = ["agent.riskNoticeVersion", "agent.onboarded", "agent.voice", "agent.auraText"]
    private static let step: TimeInterval = 0.1

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
    private var generation = UUID()
    private var appActive = true
    private var listening = false
    private var prices: [String: Double] = [:]

    override func setUp() async throws {
        try await super.setUp()
        previousLanguage = L.selection
        L.select("en")
        suiteName = "nucleo.readstart.tests.\(UUID().uuidString)"
        defaults = UserDefaults(suiteName: suiteName)
        savedProfile = [:]
        for key in Self.profileKeys { if let v = UserDefaults.standard.object(forKey: key) { savedProfile[key] = v } }
        fake = FakeHarnessNotifier()
        clock = at(7, 16, 40)
        generation = UUID()
        appActive = true
        listening = false
        prices = [:]
        HarnessBoardFocus.pending = nil
        NucleoFixtures.activate(scenario: "levels", timeScale: 0.01)
        NucleoFixtures.clearLog()
    }

    override func tearDown() async throws {
        NucleoFixtures.deactivate()
        HarnessBoardFocus.pending = nil
        for key in Self.profileKeys {
            if let v = savedProfile[key] { UserDefaults.standard.set(v, forKey: key) } else { UserDefaults.standard.removeObject(forKey: key) }
        }
        defaults.removePersistentDomain(forName: suiteName)
        L.select(previousLanguage)
        try await super.tearDown()
    }

    // MARK: Scaffolding

    /// October 2026, local time. The 7th is a Wednesday, the 12th the Monday of the week follow-up.
    private func at(_ day: Int, _ hour: Int, _ minute: Int = 0) -> Date {
        calendar.date(from: DateComponents(year: 2026, month: 10, day: day, hour: hour, minute: minute))!
    }

    /// A reader with follow-ups on who has reads left.
    private func makeCenter() -> HarnessCenter {
        let center = HarnessCenter(notifier: fake, defaults: defaults)
        center.now = { [unowned self] in self.clock }
        center.calendar = { [unowned self] in self.calendar }
        center.consent = { .accepted }
        center.currentUser = { nil }
        center.currentGeneration = { [unowned self] in self.generation }
        center.weeklyCovered = { false }
        center.quote = { [unowned self] symbol in await MainActor.run { self.prices[symbol] } }
        center.access = { BobbyReadAccess(tier: "free", used: 15, limit: 20, remaining: 5, resetsAt: nil, paywall: true, bonus: 0) }
        center.refreshAccess = {}
        center.load(owner: nil)
        return center
    }

    private func makeWorld(harness: HarnessCenter, intent: HarnessIntent? = nil, reminders: ReminderIntent? = nil) -> World {
        let profile = AgentProfile()
        profile.riskNoticeVersion = RiskNotice.currentVersion
        let session = NucleoSession(fixtures: true, profile: profile, companions: CompanionStore(defaults: defaults),
                                    ledger: NucleoLedger(defaults: defaults), defaults: defaults,
                                    briefingIntent: BriefingIntent(observeAccount: false),
                                    reminderIntent: reminders ?? ReminderIntent(observeAccount: false),
                                    harnessIntent: intent ?? HarnessIntent(observeAccount: false), harness: harness)
        profile.onboarded = true
        session.companions.companionId = "orb"
        session.briefingSheetDelay = 0
        session.briefingGate = BriefingTapGate(appActive: { [unowned self] in self.appActive }, signedIn: { false },
                                               deskBusy: { [weak session] in session?.desk.isBusy ?? false },
                                               listening: { [unowned self] in self.listening }, narrating: { false })
        session.desk.meterChanged = { _, _ in }
        session.desk.clock = NucleoDesk.Clock(now: { NucleoFixtures.recordedAt(symbol: $0, kind: "candles") ?? Date() },
                                              receivedAt: { NucleoFixtures.recordedAt(symbol: $0, kind: "debate") ?? Date() })
        session.desk.generation = { [unowned self] in self.generation }
        session.desk.recordQuery = { _, _ in }
        let time = Timeline()
        session.after = { [time] delay, work in time.after(delay, work) }
        let page = Page()
        let bridge = NucleoBridge(session: session)
        page.bridge = bridge
        session.emitter = page
        return World(session: session, bridge: bridge, page: page, time: time)
    }

    private func settle() async {
        for _ in 0..<12 { await withCheckedContinuation { c in DispatchQueue.main.async { c.resume() } } }
    }

    /// Time passes for the phone and for the page, a tenth of a second at a time.
    private func pass(_ seconds: TimeInterval, in world: World, until done: (() -> Bool)? = nil) async {
        var left = seconds
        while left > 1e-9 {
            if let done, done() { return }
            world.page.run(Self.step)
            world.time.advance(Self.step)
            await settle()
            left -= Self.step
        }
    }

    /// One question about NVDA on Wednesday, a yes, and it is Monday evening: the week's follow-up
    /// was shown at 16:40. Returns what its notification carries.
    private func aWeekLater(_ center: HarnessCenter) async throws -> [AnyHashable: Any] {
        center.noteAsk(symbol: "NVDA", name: "NVIDIA", isEquity: true, price: 100)
        await settle()
        _ = await center.accept()
        let info = try XCTUnwrap(fake.requests["v18.follow.week"]).request().content.userInfo
        clock = at(12, 18)
        fake.deliver(before: clock)
        return info
    }

    /// The board on screen, as its sheet builds it.
    private func boardOnScreen(_ center: HarnessCenter) -> HarnessBoard {
        HarnessBoard.make(for: HarnessBoardFocus.take(), ledger: center.ledger, now: clock, calendar: calendar)
    }

    /// A reader who was shown the week's follow-up, an app that is running and a page at its idle home.
    private func awake() async throws -> (World, HarnessCenter) {
        let center = makeCenter()
        _ = try await aWeekLater(center)
        await center.appActive()
        XCTAssertEqual(center.ledger.events(.sent).map(\.step), [.asset, .week])
        let world = makeWorld(harness: center)
        await world.page.boot()
        await pass(2, in: world)
        XCTAssertEqual(world.page.state, .idle)
        return (world, center)
    }

    private static let nvda = HarnessBoard.Row(symbol: "NVDA", name: "NVIDIA", isEquity: true)

    /// A board (opened from the profile) whose NVDA row is tapped while the page will not take a
    /// question: the keyboard was open under it. Returns the token the question was offered with.
    private func offeredToAPageThatDoesNotListen(_ world: World, _ center: HarnessCenter) async throws -> String {
        world.page.openKeyboard()
        XCTAssertTrue(world.session.present(.followUp))
        HarnessBoardSheet.ask(Self.nvda, session: world.session, harness: center)
        XCTAssertNil(world.session.sheet)
        world.session.sheetDismissed()
        await settle()
        XCTAssertEqual(world.page.named("ask.start").count, 1)
        let token = try XCTUnwrap(world.page.named("ask.start").first?["token"] as? String)
        XCTAssertTrue(world.session.desk.holds(token))
        return token
    }

    private func offers(_ world: World) -> [String] {
        world.page.named("ask.start").compactMap { $0["token"] as? String }
    }

    /// Whatever the page does from now on, that question is gone: no offer, no read, a dead token, no pick.
    private func assertDropped(_ token: String, after offered: Int, _ world: World, _ center: HarnessCenter,
                               file: StaticString = #filePath, line: UInt = #line) async {
        XCTAssertFalse(world.session.desk.holds(token), "the token died with the offer", file: file, line: line)
        world.page.closeKeyboard()
        await pass(6, in: world)
        XCTAssertEqual(offers(world).count, offered, "nothing is offered after it was dropped", file: file, line: line)
        XCTAssertEqual(world.page.asked, [], "the page never asked with it", file: file, line: line)
        let (late, _) = await world.bridge.handle(body: ["v": 1, "method": "ask", "params": ["token": token]], trusted: true)
        XCTAssertEqual(((late as? [String: Any])?["error"] as? [String: Any])?["code"] as? String, "invalid_params",
                       "and nothing can be asked with it later", file: file, line: line)
        XCTAssertEqual(center.ledger.events(.picked), [], "a tap whose question never reached Bobby is not an act", file: file, line: line)
        XCTAssertEqual(center.ledger.events(.returned), [], "and answers no follow-up", file: file, line: line)
    }

    // MARK: Cold start from the week's notification

    func testAWeekTappedOnTheLockScreenOfAClosedAppEndsInARead() async throws {
        let center = makeCenter()
        let week = try await aWeekLater(center)
        // The app is not running: the tap is stored before there is a page.
        let intent = HarnessIntent(observeAccount: false)
        let world = makeWorld(harness: center, intent: intent)
        defer { world.session.teardown() }
        await BobbyAppDelegate.followUpResponse(action: UNNotificationDefaultActionIdentifier, tap: HarnessTap.tap(from: week),
                                                intent: intent, harness: center)
        XCTAssertNotNil(intent.pending)
        // The page loads and makes its first call.
        await world.page.boot()
        await settle()
        // The board comes up, and by then the glass under it has drawn.
        await pass(4, in: world) { world.session.sheet == .followUp }
        XCTAssertEqual(world.session.sheet, .followUp, "the week's board opens")
        XCTAssertNil(intent.pending, "consumed once")
        XCTAssertEqual(world.page.coveredIn, [.idle], "over a page that had woken, not over one that never drew")
        // The person reads the board for a while and taps NVDA.
        await pass(3, in: world)
        let row = try XCTUnwrap(boardOnScreen(center).rows.first)
        XCTAssertEqual(row.symbol, "NVDA")
        HarnessBoardSheet.ask(row, session: world.session, harness: center)
        XCTAssertNil(world.session.sheet, "the sheet goes away first")
        world.session.sheetDismissed()
        await pass(6, in: world) { !world.page.asked.isEmpty }
        // Bobby is asked, once, about NVDA.
        XCTAssertEqual(world.page.asked.count, 1, "the question reached Bobby")
        XCTAssertEqual(world.page.named("ask.start").last?["question"] as? String, HarnessCopy.lookQuestion(symbol: "NVDA"))
        await world.page.answered()
        await settle()
        XCTAssertEqual(world.page.replies.last?["status"] as? String, "ok")
        XCTAssertEqual((world.page.replies.last?["asset"] as? [String: Any])?["symbol"] as? String, "NVDA")
        XCTAssertEqual(world.page.faults, [])
        // And the harness knows the week's follow-up was answered, by that tap.
        XCTAssertEqual(center.ledger.events(.picked).map(\.symbol), ["NVDA"])
        XCTAssertEqual(center.ledger.events(.returned).map(\.step), [.week])
    }

    func testABoardWaitsForThePageFromItsFirstCallWithTheAppActive() async throws {
        XCTAssertEqual(NucleoSession.wakeTicks, 4)
        let center = makeCenter()
        let info = try await aWeekLater(center)
        let week = try XCTUnwrap(HarnessTap.tap(from: info))
        let intent = HarnessIntent(observeAccount: false)
        let world = makeWorld(harness: center, intent: intent)
        defer { world.session.teardown() }
        XCTAssertEqual(world.session.wakeTick, 0.4, "four ticks of 0.4 s: the page's 1.4 s at the most, and room")
        // The page asks for its session before the app is active (a launch from the lock screen): nothing is counted yet.
        appActive = false
        intent.store(week)
        await world.page.boot()
        world.page.inFront = false
        await pass(3, in: world)
        XCTAssertNil(world.session.sheet)
        XCTAssertNotNil(intent.pending, "the tap keeps waiting")
        // The app is in front: the page runs, and the count starts here.
        appActive = true
        world.page.inFront = true
        world.session.appBecameActive()
        await pass(1.5, in: world)
        XCTAssertNil(world.session.sheet, "not before the page has had 1.6 s")
        XCTAssertEqual(world.page.state, .idle, "the page is home by then (0.9 s of its own clock)")
        await pass(0.2, in: world)
        XCTAssertEqual(world.session.sheet, .followUp)
        XCTAssertEqual(world.page.coveredIn, [.idle])
        // The page loads again under a closed board (another language, a web process that died): the next tap waits again.
        world.session.sheet = nil
        world.session.sheetDismissed()
        await world.page.boot()
        intent.store(week)
        await pass(1.5, in: world)
        XCTAssertNil(world.session.sheet)
        await pass(0.2, in: world)
        XCTAssertEqual(world.session.sheet, .followUp)
        XCTAssertEqual(world.page.coveredIn, [.idle, .idle])
    }

    func testTimeUnderAnotherSheetIsNotTimeThePageHad() async throws {
        let center = makeCenter()
        let info = try await aWeekLater(center)
        let week = try XCTUnwrap(HarnessTap.tap(from: info))
        let intent = HarnessIntent(observeAccount: false)
        let world = makeWorld(harness: center, intent: intent)
        defer { world.session.teardown() }
        intent.store(week)
        await world.page.boot()
        // Half a second in, something else covers the page (the person opened the level sheet).
        await pass(0.5, in: world)
        XCTAssertTrue(world.session.present(.levels))
        await pass(5, in: world)
        XCTAssertEqual(world.session.sheet, .levels, "the board does not open over another sheet")
        XCTAssertEqual(world.page.state, .wake, "and the page under it has not moved")
        // It goes away: the page needs its time again, counted from here.
        world.session.sheet = nil
        world.session.sheetDismissed()
        await pass(1.5, in: world)
        XCTAssertNil(world.session.sheet)
        await pass(0.2, in: world)
        XCTAssertEqual(world.session.sheet, .followUp)
        XCTAssertEqual(world.page.coveredIn, [.wake, .idle], "the level sheet covered a waking page; the board, one that was home")
    }

    func testOnlyABoardWaits() async throws {
        // The asset's follow-up is a line the page draws itself: it is honoured on the turn after the session reply.
        let center = makeCenter()
        _ = try await aWeekLater(center)
        let intent = HarnessIntent(observeAccount: false)
        let reminders = ReminderIntent(observeAccount: false)
        let world = makeWorld(harness: center, intent: intent, reminders: reminders)
        defer { world.session.teardown() }
        intent.store(HarnessTap(step: .asset, symbol: "NVDA", sector: nil))
        await world.page.boot()
        await settle()
        XCTAssertNil(intent.pending, "consumed at once")
        XCTAssertNil(world.session.sheet)
        XCTAssertEqual(center.ledger.events(.opened).map(\.step), [.asset])
        // A thesis reminder (like a briefing and a news tap) opens its own screen at once, as before: nothing in it
        // asks the page for anything, so the worst it does is cover a glass that has not drawn yet.
        await world.page.boot()
        reminders.store(ReminderTap(thesisId: UUID().uuidString.lowercased()))
        await settle()
        XCTAssertEqual(world.session.sheet, .theses, "no wait for a reminder")
        XCTAssertEqual(world.page.coveredIn, [.wake])
    }

    // MARK: A question the page takes

    func testFromAnIdleHomeTheQuestionIsOfferedOnceAndTakenAtOnce() async throws {
        let (world, center) = try await awake()
        defer { world.session.teardown() }
        // A board opened from the profile, over an idle home.
        XCTAssertTrue(world.session.present(.followUp))
        HarnessBoardSheet.ask(Self.nvda, session: world.session, harness: center)
        world.session.sheetDismissed()
        await settle()
        let names = world.page.events.map(\.name)
        XCTAssertLessThan(try XCTUnwrap(names.lastIndex(of: "native.sheet")), try XCTUnwrap(names.lastIndex(of: "ask.start")),
                          "the page hears the sheet closed before it is asked to read")
        XCTAssertEqual(world.page.asked.count, 1, "taken on the first offer, with no wait")
        await pass(8, in: world)
        await world.page.answered()
        XCTAssertEqual(world.page.named("ask.start").count, 1, "offered once: nothing is repeated to a page that took it")
        XCTAssertEqual(world.page.asked.count, 1)
        XCTAssertEqual(world.page.replies.last?["status"] as? String, "ok")
        XCTAssertEqual(center.ledger.events(.picked).map(\.symbol), ["NVDA"])
        XCTAssertEqual(center.ledger.events(.picked).first?.at, clock, "written with the moment of the tap")
        XCTAssertEqual(center.ledger.events(.returned).map(\.step), [.week])
    }

    func testTheButtonOfTheLineOnTheGlassIsOfferedOnceToo() async throws {
        let center = makeCenter()
        center.noteAsk(symbol: "NVDA", name: "NVIDIA", isEquity: true, price: 100)
        await settle()
        _ = await center.accept()
        // Thursday: the asset's follow-up was shown, and they open the app by themselves.
        clock = at(8, 18)
        fake.deliver(before: clock)
        prices["NVDA"] = 104
        await center.appActive()
        let world = makeWorld(harness: center)
        defer { world.session.teardown() }
        await world.page.boot()
        await pass(2, in: world)
        let source = HarnessNudges.moveSource(center)
        let nudge = try XCTUnwrap(source.candidate(NudgeMoment(signedIn: false, now: clock, lastRead: nil, readsThisLaunch: 0)))
        XCTAssertEqual(nudge.cta, "What changed?")
        await source.act(nudge, world.session)
        XCTAssertNil(center.move, "the line leaves the glass at the tap")
        await settle()
        XCTAssertEqual(world.page.asked.count, 1)
        XCTAssertEqual(center.ledger.events(.picked).map(\.symbol), ["NVDA"], "written once the page took the question")
        XCTAssertEqual(center.ledger.events(.picked).first?.at, clock)
        XCTAssertEqual(center.ledger.events(.returned).map(\.step), [.asset])
        await pass(8, in: world)
        await world.page.answered()
        XCTAssertEqual(world.page.named("ask.start").count, 1)
        XCTAssertEqual(world.page.named("ask.start").first?["question"] as? String, HarnessCopy.changedQuestion(symbol: "NVDA"))
        XCTAssertEqual(world.page.replies.last?["status"] as? String, "ok")
    }

    func testAPageThatIsSlowToWakeIsOfferedTheSameQuestionUntilItTakesIt() async throws {
        let center = makeCenter()
        let info = try await aWeekLater(center)
        let week = try XCTUnwrap(HarnessTap.tap(from: info))
        let intent = HarnessIntent(observeAccount: false)
        let world = makeWorld(harness: center, intent: intent)
        defer { world.session.teardown() }
        // A phone whose page needs three seconds: the board is up before the page is home.
        world.page.wakeSeconds = 3
        intent.store(week)
        await world.page.boot()
        await pass(1.7, in: world)
        XCTAssertEqual(world.session.sheet, .followUp)
        XCTAssertEqual(world.page.coveredIn, [.wake])
        // They tap NVDA at 18:00:00. The page still has 1.4 s of waking to do once the board is gone.
        let tapped = clock
        HarnessBoardSheet.ask(try XCTUnwrap(boardOnScreen(center).rows.first), session: world.session, harness: center)
        world.session.sheetDismissed()
        await settle()
        XCTAssertEqual(offers(world).count, 1)
        XCTAssertEqual(world.page.asked, [], "the first offer reaches a page that is still waking")
        XCTAssertEqual(center.ledger.events(.picked), [], "nothing is written while the question has not reached Bobby")
        clock = tapped.addingTimeInterval(2)
        await pass(1.3, in: world)
        XCTAssertEqual(offers(world).count, 3, "offered again every half second")
        XCTAssertEqual(world.page.asked, [])
        await pass(0.3, in: world)
        // The page came home 1.4 s after the board left; the offer made at 1.5 s is the one it took.
        let all = offers(world)
        XCTAssertEqual(all.count, 4)
        XCTAssertEqual(Set(all).count, 1, "the same single-use token every time")
        XCTAssertEqual(world.page.asked, [all[0]])
        XCTAssertEqual(Set(world.page.named("ask.start").compactMap { $0["question"] as? String }), [HarnessCopy.lookQuestion(symbol: "NVDA")])
        // Taken: nothing more is offered, and one read ran.
        await pass(8, in: world)
        await world.page.answered()
        await settle()
        XCTAssertEqual(offers(world).count, 4)
        XCTAssertEqual(world.page.replies.count, 1)
        XCTAssertEqual(world.page.replies.last?["status"] as? String, "ok")
        XCTAssertEqual(world.page.faults, [])
        // The tap is written with its own moment, two seconds before the page took the question:
        // what answers a follow-up is decided as it would have been at the tap.
        XCTAssertEqual(center.ledger.events(.picked).map(\.at), [tapped])
        XCTAssertEqual(center.ledger.events(.returned).map(\.at), [tapped])
        XCTAssertEqual(center.ledger.events(.returned).map(\.step), [.week])
    }

    func testOneTokenIsOneReadHoweverOftenItIsAskedWith() async throws {
        let (world, center) = try await awake()
        defer { world.session.teardown() }
        XCTAssertTrue(world.session.startRead(symbol: "NVDA", name: "NVIDIA", isEquity: true, question: HarnessCopy.lookQuestion(symbol: "NVDA")))
        await settle()
        let token = try XCTUnwrap(world.page.asked.first)
        XCTAssertFalse(world.session.desk.holds(token), "spent by the first ask")
        // A second ask with it while the read runs, and a third after it: neither is a read.
        func askAgain() async -> String? {
            let (reply, _) = await world.bridge.handle(body: ["v": 1, "method": "ask", "params": ["token": token]], trusted: true)
            return ((reply as? [String: Any])?["error"] as? [String: Any])?["code"] as? String
        }
        let during = await askAgain()
        XCTAssertNotNil(during, "refused while the read runs")
        await world.page.answered()
        await settle()
        let afterwards = await askAgain()
        XCTAssertEqual(afterwards, "invalid_params", "the token was single use")
        XCTAssertEqual(world.page.replies.count, 1)
        XCTAssertEqual(world.page.replies.last?["status"] as? String, "ok")
        XCTAssertEqual(center.ledger.events(.ask).filter { $0.origin == .followUp }.count, 1, "one read Bobby started, not two")
        await pass(8, in: world)
        XCTAssertEqual(offers(world), [token])
    }

    func testANewerTapReplacesTheQuestionStillOnOffer() async throws {
        let (world, center) = try await awake()
        defer { world.session.teardown() }
        world.page.openKeyboard()
        var taken: [String] = []
        XCTAssertTrue(world.session.startRead(symbol: "NVDA", name: "NVIDIA", isEquity: true, question: "one", taken: { taken.append("NVDA") }))
        let first = try XCTUnwrap(offers(world).last)
        XCTAssertTrue(world.session.startRead(symbol: "BTC", name: "Bitcoin", isEquity: false, question: "two", taken: { taken.append("BTC") }))
        let second = try XCTUnwrap(offers(world).last)
        XCTAssertNotEqual(first, second)
        XCTAssertFalse(world.session.desk.holds(first), "the older question can no longer be asked")
        world.page.closeKeyboard()
        await pass(1, in: world)
        await world.page.answered()
        XCTAssertEqual(world.page.asked, [second])
        XCTAssertEqual(taken, ["BTC"], "only the question the page took counts")
        XCTAssertEqual(center.ledger.events(.picked), [], "and this caller wrote nothing by itself")
    }

    // MARK: A question the page does not take

    func testAQuestionThePageNeverTakesIsDroppedAfterEightMoreOffers() async throws {
        XCTAssertEqual(NucleoSession.readOfferRepeats, 8)
        let (world, center) = try await awake()
        defer { world.session.teardown() }
        XCTAssertEqual(world.session.readOfferSpacing, 0.5)
        let token = try await offeredToAPageThatDoesNotListen(world, center)
        XCTAssertNil(center.move)
        // Half a second apart: the eighth repeat is four seconds after the first offer.
        for repeated in 1...8 {
            await pass(0.5, in: world)
            XCTAssertEqual(offers(world).count, 1 + repeated)
            XCTAssertTrue(world.session.desk.holds(token), "still on offer after \(repeated)")
        }
        XCTAssertEqual(Set(offers(world)), [token], "always the same token")
        await pass(0.5, in: world)
        XCTAssertEqual(offers(world).count, 9, "no ninth repeat")
        XCTAssertFalse(world.session.desk.isBusy)
        await assertDropped(token, after: 9, world, center)
    }

    func testASheetThatComesUpDropsTheQuestion() async throws {
        let (world, center) = try await awake()
        defer { world.session.teardown() }
        let token = try await offeredToAPageThatDoesNotListen(world, center)
        await pass(1, in: world)
        XCTAssertEqual(offers(world).count, 3)
        // The person opens something else: Bobby does not start a read behind it, or after it.
        XCTAssertTrue(world.session.present(.levels))
        XCTAssertFalse(world.session.desk.holds(token), "dropped the moment the sheet opens, not at the next offer")
        await pass(2, in: world)
        world.session.sheet = nil
        world.session.sheetDismissed()
        await assertDropped(token, after: 3, world, center)
    }

    func testAnotherReaderNeverGetsTheQuestion() async throws {
        let (world, center) = try await awake()
        defer { world.session.teardown() }
        let token = try await offeredToAPageThatDoesNotListen(world, center)
        await pass(1, in: world)
        XCTAssertEqual(offers(world).count, 3)
        // Someone else is using the phone now.
        generation = UUID()
        XCTAssertFalse(world.session.desk.holds(token))
        await pass(0.5, in: world)
        await assertDropped(token, after: 3, world, center)
    }

    func testLeavingTheAppDropsTheQuestion() async throws {
        let (world, center) = try await awake()
        defer { world.session.teardown() }
        let token = try await offeredToAPageThatDoesNotListen(world, center)
        await pass(1, in: world)
        XCTAssertEqual(offers(world).count, 3)
        appActive = false
        world.page.inFront = false
        world.session.appWentBackground()
        XCTAssertFalse(world.session.desk.holds(token), "dropped as the app leaves")
        await pass(3, in: world)
        // Back in the app: it does not start by itself.
        appActive = true
        world.page.inFront = true
        world.session.appBecameActive()
        await assertDropped(token, after: 3, world, center)
    }

    func testLeavingBeforeTheSheetHasGoneOffersNothing() async throws {
        // The row is tapped and the app is left before the board has finished going away.
        for reachesTheBackground in [true, false] {
            let (world, center) = try await awake()
            defer { world.session.teardown() }
            XCTAssertTrue(world.session.present(.followUp))
            HarnessBoardSheet.ask(Self.nvda, session: world.session, harness: center)
            appActive = false
            world.page.inFront = false
            if reachesTheBackground { world.session.appWentBackground() }
            world.session.sheetDismissed()
            await settle()
            XCTAssertEqual(offers(world), [], "nothing is sent to a page that is behind")
            // Back in the app, at an idle home: the read does not start by itself.
            appActive = true
            world.page.inFront = true
            world.session.appBecameActive()
            await pass(6, in: world)
            XCTAssertEqual(offers(world), [])
            XCTAssertEqual(world.page.asked, [])
            XCTAssertFalse(world.session.desk.isBusy)
            XCTAssertEqual(center.ledger.events(.picked), [])
            XCTAssertEqual(center.ledger.events(.returned), [])
            defaults.removePersistentDomain(forName: suiteName)
            fake = FakeHarnessNotifier()
            clock = at(7, 16, 40)
        }
    }

    func testAnAppThatIsNotInFrontIsNotOfferedTheQuestionAgain() async throws {
        let (world, center) = try await awake()
        defer { world.session.teardown() }
        let token = try await offeredToAPageThatDoesNotListen(world, center)
        // Not active (the notification shade, the app switcher) without ever reaching the background.
        appActive = false
        await pass(0.5, in: world)
        XCTAssertEqual(offers(world).count, 1)
        appActive = true
        await assertDropped(token, after: 1, world, center)
    }

    func testAReadOfTheirOwnDropsTheQuestion() async throws {
        let (world, center) = try await awake()
        defer { world.session.teardown() }
        let token = try await offeredToAPageThatDoesNotListen(world, center)
        await pass(1, in: world)
        XCTAssertEqual(offers(world).count, 3)
        // They send what they were typing: the desk is busy with their question, not Bobby's.
        world.page.send("Should I buy NVIDIA right now?")
        await settle()
        XCTAssertFalse(world.session.desk.holds(token), "dropped as their read begins")
        await pass(8, in: world)
        await world.page.answered()
        await settle()
        XCTAssertEqual(offers(world).count, 3, "nothing is offered during their read or after it")
        XCTAssertEqual(world.page.asked, [], "Bobby's question was never asked")
        XCTAssertEqual(world.page.replies.count, 1)
        XCTAssertEqual(world.page.replies.last?["status"] as? String, "ok")
        XCTAssertEqual(center.ledger.events(.picked), [], "the row they tapped asked nothing")
        XCTAssertEqual(center.ledger.events(.ask).last?.origin, nil, "the read that ran was their own question")
    }

    func testAnOpenMicDropsTheQuestion() async throws {
        let (world, center) = try await awake()
        defer { world.session.teardown() }
        let token = try await offeredToAPageThatDoesNotListen(world, center)
        listening = true
        await pass(0.5, in: world)
        listening = false
        XCTAssertEqual(offers(world).count, 1)
        await assertDropped(token, after: 1, world, center)
    }

    func testAWithdrawnNoticeDropsTheQuestion() async throws {
        let (world, center) = try await awake()
        defer { world.session.teardown() }
        let token = try await offeredToAPageThatDoesNotListen(world, center)
        world.session.revokeRiskNoticeConsent()
        XCTAssertFalse(world.session.desk.holds(token))
        world.page.closeKeyboard()
        await pass(6, in: world)
        XCTAssertEqual(offers(world).count, 1)
        XCTAssertEqual(world.page.asked, [])
    }

    func testASessionThatEndsOffersNothingMore() async throws {
        let (world, center) = try await awake()
        let token = try await offeredToAPageThatDoesNotListen(world, center)
        world.session.teardown()
        XCTAssertFalse(world.session.desk.holds(token))
        world.page.closeKeyboard()
        await pass(6, in: world)
        XCTAssertEqual(offers(world).count, 1)
        XCTAssertEqual(world.page.asked, [])
        XCTAssertEqual(center.ledger.events(.picked), [])
    }
}
