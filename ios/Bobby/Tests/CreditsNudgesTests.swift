import Foundation
import XCTest
@testable import Bobby

/// Credits on the glass (1.8): a line when this week's reads are about to run out, and a line
/// when gifted reads arrive. These pin when each speaks, what its id is (so it can come back next
/// week but not after every spent read), that one account's gifts are never written under
/// another, and that the copy fits the page in six languages.
@MainActor
final class CreditsNudgesTests: XCTestCase {
    /// Wednesday 7 October 2026, noon UTC: ISO week 41.
    private let now = BobbyAccessAPI.date("2026-10-07T12:00:00Z")!
    private var suiteName = ""
    private var defaults: UserDefaults!
    /// What the registered source is handed in these suites.
    private var clock = Date()
    private var access: BobbyReadAccess?
    private var owner: String?
    /// Who the level centre believes is signed in.
    private var user: String?
    private var generation = UUID()

    override func setUp() async throws {
        try await super.setUp()
        suiteName = "credits.nudges.tests.\(UUID().uuidString)"
        defaults = UserDefaults(suiteName: suiteName)
        clock = now
        access = nil
        owner = nil
        user = nil
        generation = UUID()
    }

    override func tearDown() async throws {
        defaults.removePersistentDomain(forName: suiteName)
        try await super.tearDown()
    }

    private func moment(signedIn: Bool = true, at date: Date? = nil) -> NudgeMoment {
        NudgeMoment(signedIn: signedIn, now: date ?? now, lastRead: nil, readsThisLaunch: 0)
    }

    private func free(remaining: Int?, used: Int = 0, resetsAt: String? = "2026-10-09T12:00:00Z", paywall: Bool = true, bonus: Int = 0) -> BobbyReadAccess {
        BobbyReadAccess(tier: "free", used: used, limit: 10, remaining: remaining, resetsAt: resetsAt, paywall: paywall, bonus: bonus)
    }

    private func valid(_ nudge: NucleoNudge?) -> Bool {
        guard let nudge else { return false }
        return nudge.id.range(of: NucleoNudge.idPattern, options: .regularExpression) != nil
    }

    /// A level centre of this suite's own, signed in as `user`.
    private func levelCentre() -> NucleoLevelCenter {
        let levels = NucleoLevelCenter(defaults: defaults)
        levels.currentUser = { [unowned self] in self.user }
        levels.currentGeneration = { [unowned self] in self.generation }
        levels.accountChanged(force: true)
        return levels
    }

    private func signIn(_ id: String?) {
        user = id
        generation = UUID()
    }

    /// `/api/bobby-access`, as far as the gifted balance goes.
    private func reply(quick: Int = 0, deep: Int = 0, max: Int = 0) -> [String: Any] {
        ["access": ["tier": "free", "used": 0, "limit": 10, "remaining": 10, "paywall": true, "bonus": quick],
         "levels": ["tier": "free", "levels": ["profundo": ["limit": 3, "bonus": deep], "maximo": ["limit": 1, "bonus": max]]]]
    }

    /// Lets the book's coalesced record run.
    private func settle() async {
        for _ in 0..<8 { await Task.yield() }
    }

    // MARK: Running low

    func testAFreeAccountWithTwoOrFewerReadsLeftIsToldOncePerWeek() throws {
        let two = try XCTUnwrap(CreditsNudges.low(moment: moment(), access: free(remaining: 2), spanish: false))
        XCTAssertEqual(two.id, "credits.low.2026-w41", "the id is this calendar week")
        XCTAssertEqual(two.text, "2 reads left this week")
        XCTAssertEqual(two.cta, "See credits")
        XCTAssertTrue(valid(two))
        XCTAssertEqual(CreditsNudges.low(moment: moment(), access: free(remaining: 2), spanish: true)?.text, "Te quedan 2 lecturas esta semana")
        XCTAssertEqual(CreditsNudges.low(moment: moment(), access: free(remaining: 2), spanish: true)?.cta, "Ver créditos")

        let one = try XCTUnwrap(CreditsNudges.low(moment: moment(), access: free(remaining: 1), spanish: false))
        XCTAssertEqual(one.text, "1 read left this week")
        XCTAssertEqual(one.id, two.id, "the same week is the same nudge")
        XCTAssertEqual(CreditsNudges.low(moment: moment(), access: free(remaining: 1), spanish: true)?.text, "Te queda 1 lectura esta semana")

        let none = try XCTUnwrap(CreditsNudges.low(moment: moment(), access: free(remaining: 0), spanish: false))
        XCTAssertEqual(none.text, "No reads left this week")
        XCTAssertEqual(CreditsNudges.low(moment: moment(), access: free(remaining: 0), spanish: true)?.text, "Sin lecturas esta semana")

        let fallback = try XCTUnwrap(CreditsNudges.low(moment: moment(), access: free(remaining: nil, used: 9), spanish: false))
        XCTAssertEqual(fallback.text, "1 read left this week", "remaining falls back to limit − used")

        let noReset = try XCTUnwrap(CreditsNudges.low(moment: moment(), access: free(remaining: 2, resetsAt: nil), spanish: false))
        XCTAssertEqual(noReset.id, two.id, "without a reset moment the week still names it")
    }

    /// The server's `resetsAt` is the oldest read in the last seven days plus seven days, so it
    /// moves forward every time a read leaves the window. It must not make a new nudge each time.
    func testAResetMomentThatMovesDuringTheWeekIsStillTheSameNudge() throws {
        let monday = BobbyAccessAPI.date("2026-10-05T09:00:00Z")!
        let mondayLine = try XCTUnwrap(CreditsNudges.low(moment: moment(at: monday), access: free(remaining: 1, resetsAt: "2026-10-06T08:00:00Z")))
        let tuesday = BobbyAccessAPI.date("2026-10-06T09:00:00Z")!
        let tuesdayLine = try XCTUnwrap(CreditsNudges.low(moment: moment(at: tuesday), access: free(remaining: 2, resetsAt: "2026-10-07T08:00:00Z")))
        let sunday = BobbyAccessAPI.date("2026-10-11T23:59:59Z")!
        let sundayLine = try XCTUnwrap(CreditsNudges.low(moment: moment(at: sunday), access: free(remaining: 0, resetsAt: "2026-10-13T08:00:00Z")))
        XCTAssertEqual(mondayLine.id, "credits.low.2026-w41")
        XCTAssertEqual(tuesdayLine.id, mondayLine.id, "one day later, another reset moment: the same nudge")
        XCTAssertEqual(sundayLine.id, mondayLine.id)

        // Retired on Monday, it stays retired on Tuesday.
        let center = NudgeCenter(defaults: defaults)
        center.now = { monday }
        center.retire(mondayLine.id)
        XCTAssertFalse(center.eligible(tuesdayLine.id, at: tuesday), "a tap on Monday is not undone by Tuesday's reset moment")

        let nextMonday = BobbyAccessAPI.date("2026-10-12T00:00:00Z")!
        let nextWeek = try XCTUnwrap(CreditsNudges.low(moment: moment(at: nextMonday), access: free(remaining: 2, resetsAt: "2026-10-13T08:00:00Z")))
        XCTAssertEqual(nextWeek.id, "credits.low.2026-w42", "another week is another nudge: it can come back")
        XCTAssertTrue(center.eligible(nextWeek.id, at: nextMonday))
    }

    func testTheWeekIsTheIsoWeekInUtcAndAlwaysAValidId() {
        XCTAssertEqual(CreditsNudges.week(now), "2026-w41")
        XCTAssertEqual(CreditsNudges.week(BobbyAccessAPI.date("2027-01-01T12:00:00Z")!), "2026-w53", "the first days of January can belong to the old year's last week")
        XCTAssertEqual(CreditsNudges.week(BobbyAccessAPI.date("2027-01-04T00:00:00Z")!), "2027-w01")
        XCTAssertEqual(CreditsNudges.week(BobbyAccessAPI.date("2026-03-01T23:59:59Z")!), "2026-w09", "single digits are padded")
        // Every week of three years, and every gifted total the server can send, is an id the page accepts.
        var day = BobbyAccessAPI.date("2026-01-01T00:00:00Z")!
        for _ in 0..<160 {
            let id = CreditsNudges.lowPrefix + CreditsNudges.week(day)
            XCTAssertNotNil(id.range(of: NucleoNudge.idPattern, options: .regularExpression), id)
            day.addTimeInterval(7 * 86_400)
        }
        for total in [1, 9, 10, 1300, 999_999_999] {
            var ledger = CreditsGiftLedger()
            ledger.observe(total: total, owner: "u1")
            XCTAssertTrue(valid(CreditsNudges.gift(moment: moment(), ledger: ledger, owner: "u1")), "\(total)")
        }
    }

    func testTheLowLineStaysQuietWhenItWouldNotBeTrueOrUseful() {
        XCTAssertNil(CreditsNudges.low(moment: moment(), access: free(remaining: 3)), "three left is not low")
        XCTAssertNil(CreditsNudges.low(moment: moment(signedIn: false), access: free(remaining: 1)), "signed out")
        XCTAssertNil(CreditsNudges.low(moment: moment(), access: free(remaining: 1, paywall: false)), "no weekly cap, nothing runs out")
        XCTAssertNil(CreditsNudges.low(moment: moment(), access: free(remaining: 0, bonus: 4)), "gifted reads cover the next read")
        XCTAssertNil(CreditsNudges.low(moment: moment(), access: nil), "nothing known")
        let pro = BobbyReadAccess(tier: "pro", used: 40, limit: nil, remaining: nil, resetsAt: nil, paywall: true)
        XCTAssertNil(CreditsNudges.low(moment: moment(), access: pro))
        let anon = BobbyReadAccess(tier: "anon", used: 2, limit: 3, remaining: 1, resetsAt: nil, paywall: true)
        XCTAssertNil(CreditsNudges.low(moment: moment(), access: anon), "a guest is asked to sign in by the page, not nudged about a week")
        let noLimit = BobbyReadAccess(tier: "free", used: 2, limit: nil, remaining: nil, resetsAt: nil, paywall: true)
        XCTAssertNil(CreditsNudges.low(moment: moment(), access: noLimit), "an unknown limit is not zero left")
    }

    /// The app stayed in memory past the reset moment: at least one read is back on the server,
    /// and the count this phone holds is from before. It is not repeated as if it were today's.
    func testNumbersFromBeforeTheResetMomentAreNotRepeated() {
        let thursday = free(remaining: 0, used: 10, resetsAt: "2026-10-09T12:00:00Z")
        XCTAssertNotNil(CreditsNudges.low(moment: moment(at: BobbyAccessAPI.date("2026-10-09T11:59:59Z")!), access: thursday), "still true a second before")
        XCTAssertNil(CreditsNudges.low(moment: moment(at: BobbyAccessAPI.date("2026-10-09T12:00:00Z")!), access: thursday), "the window moved on")
        XCTAssertNil(CreditsNudges.low(moment: moment(at: BobbyAccessAPI.date("2026-10-10T09:00:00Z")!), access: thursday), "and it stays quiet the day after")
        XCTAssertNil(CreditsNudges.low(moment: moment(), access: free(remaining: 2, resetsAt: "2026-10-01T00:00:00Z")))
    }

    // MARK: Gifted reads

    func testAGiftIsAnnouncedWhenItArrivesAndNotAgainForEveryReadSpent() throws {
        var ledger = CreditsGiftLedger()
        XCTAssertNil(CreditsNudges.gift(moment: moment(), ledger: ledger, owner: "u1"))
        ledger.observe(total: 5, owner: "u1")
        let arrived = try XCTUnwrap(CreditsNudges.gift(moment: moment(), ledger: ledger, owner: "u1", spanish: false))
        XCTAssertEqual(arrived.id, "credits.gift.5")
        XCTAssertEqual(arrived.text, "Bobby gave you 5 reads")
        XCTAssertEqual(arrived.cta, "See credits")
        XCTAssertTrue(valid(arrived))
        XCTAssertEqual(CreditsNudges.gift(moment: moment(), ledger: ledger, owner: "u1", spanish: true)?.text, "Bobby te regaló 5 lecturas")

        ledger.observe(total: 4, owner: "u1")
        let afterOne = try XCTUnwrap(CreditsNudges.gift(moment: moment(), ledger: ledger, owner: "u1", spanish: false))
        XCTAssertEqual(afterOne.id, "credits.gift.5", "a spent read does not make a new nudge")
        XCTAssertEqual(afterOne.text, "Bobby gave you 5 reads", "the line says what was given, not what is left of it")

        ledger.acknowledge()
        XCTAssertNil(CreditsNudges.gift(moment: moment(), ledger: ledger, owner: "u1"), "shown on the Credits screen: nothing left to announce")
        ledger.observe(total: 4, owner: "u1")
        ledger.observe(total: 3, owner: "u1")
        XCTAssertNil(CreditsNudges.gift(moment: moment(), ledger: ledger, owner: "u1"), "spending is never news")

        ledger.observe(total: 13, owner: "u1")
        let second = try XCTUnwrap(CreditsNudges.gift(moment: moment(), ledger: ledger, owner: "u1", spanish: false))
        XCTAssertEqual(second.id, "credits.gift.13", "a new gift is a new nudge")
        XCTAssertEqual(second.text, "Bobby gave you 10 reads", "ten arrived; the three the account already held were not given again")

        ledger.observe(total: 0, owner: "u1")
        XCTAssertNil(CreditsNudges.gift(moment: moment(), ledger: ledger, owner: "u1"), "nothing left, nothing to say")

        var single = CreditsGiftLedger()
        single.observe(total: 1, owner: "u1")
        XCTAssertEqual(CreditsNudges.gift(moment: moment(), ledger: single, owner: "u1", spanish: false)?.text, "Bobby gave you 1 read")
        XCTAssertEqual(CreditsNudges.gift(moment: moment(), ledger: single, owner: "u1", spanish: true)?.text, "Bobby te regaló 1 lectura")
    }

    func testTheLineSaysHowManyArrivedNotTheWholeBalance() throws {
        // Three gifted reads the person has already seen, then a code for five.
        var ledger = CreditsGiftLedger()
        ledger.observe(total: 3, owner: "u1")
        ledger.acknowledge()
        ledger.observe(total: 8, owner: "u1")
        let line = try XCTUnwrap(CreditsNudges.gift(moment: moment(), ledger: ledger, owner: "u1", spanish: false))
        XCTAssertEqual(line.text, "Bobby gave you 5 reads")
        XCTAssertEqual(line.id, "credits.gift.8")

        // Two gifts before the person looked: both are news, together.
        ledger.observe(total: 10, owner: "u1")
        let both = try XCTUnwrap(CreditsNudges.gift(moment: moment(), ledger: ledger, owner: "u1", spanish: false))
        XCTAssertEqual(both.text, "Bobby gave you 7 reads")
        XCTAssertEqual(both.id, "credits.gift.10")
    }

    func testAReadTheServerHandsBackIsNotAGift() throws {
        var ledger = CreditsGiftLedger()
        ledger.observe(total: 5, owner: "u1")
        ledger.acknowledge()
        // A gifted read is spent, the read is refused, the server returns it.
        ledger.observe(total: 4, owner: "u1")
        ledger.observe(total: 4, owner: "u1")
        ledger.observe(total: 5, owner: "u1")
        XCTAssertNil(CreditsNudges.gift(moment: moment(), ledger: ledger, owner: "u1"), "nothing new was given")
        XCTAssertEqual(ledger.last, 5)

        // The same while an earlier gift is still waiting to be shown: its number does not grow.
        var waiting = CreditsGiftLedger()
        waiting.observe(total: 5, owner: "u1")
        waiting.observe(total: 4, owner: "u1")
        waiting.observe(total: 5, owner: "u1")
        let line = try XCTUnwrap(CreditsNudges.gift(moment: moment(), ledger: waiting, owner: "u1", spanish: false))
        XCTAssertEqual(line.text, "Bobby gave you 5 reads")
        XCTAssertEqual(line.id, "credits.gift.5")

        // A rise of another size after a spent read is a gift.
        ledger.observe(total: 4, owner: "u1")
        ledger.observe(total: 9, owner: "u1")
        XCTAssertEqual(CreditsNudges.gift(moment: moment(), ledger: ledger, owner: "u1", spanish: false)?.text, "Bobby gave you 5 reads")
    }

    func testTheGiftLineBelongsToOneAccount() throws {
        var ledger = CreditsGiftLedger()
        ledger.observe(total: 5, owner: "u1")
        XCTAssertNil(CreditsNudges.gift(moment: moment(), ledger: ledger, owner: "u2"), "another account never hears about it")
        XCTAssertNil(CreditsNudges.gift(moment: moment(), ledger: ledger, owner: nil))
        XCTAssertNil(CreditsNudges.gift(moment: moment(signedIn: false), ledger: ledger, owner: "u1"), "signed out")

        ledger.acknowledge()
        ledger.observe(total: 2, owner: "u2")
        XCTAssertEqual(ledger.owner, "u2")
        XCTAssertEqual(ledger.announce, 2, "the first word about an account on this phone is news, whatever the previous account had")
        XCTAssertEqual(ledger.arrived, 2)
        ledger.observe(total: 0, owner: "u3")
        XCTAssertEqual(ledger, CreditsGiftLedger(owner: "u3", last: 0, announce: nil), "an account with no gifts announces nothing")
    }

    func testTheLedgerSurvivesARelaunchAndIsErasedWithItsAccount() throws {
        var ledger = CreditsGiftLedger()
        ledger.observe(total: 7, owner: "u1")
        ledger.observe(total: 6, owner: "u1")
        ledger.save(defaults)
        XCTAssertEqual(CreditsGiftLedger.load(defaults), ledger)
        CreditsGiftLedger().save(defaults)
        XCTAssertNil(defaults.object(forKey: CreditsGiftLedger.storeKey), "no owner, nothing kept")
        XCTAssertEqual(CreditsGiftLedger.load(defaults), CreditsGiftLedger())

        // A ledger written before the arrival count existed still announces what it held.
        defaults.set(Data(#"{"owner":"u1","last":4,"announce":5}"#.utf8), forKey: CreditsGiftLedger.storeKey)
        let older = CreditsGiftLedger.load(defaults)
        XCTAssertEqual(older, CreditsGiftLedger(owner: "u1", last: 4, announce: 5, arrived: 5))
        XCTAssertEqual(CreditsNudges.gift(moment: moment(), ledger: older, owner: "u1", spanish: false)?.text, "Bobby gave you 5 reads")
    }

    func testTheGiftedTotalAddsTheThreeLevels() throws {
        let access = BobbyReadAccess(tier: "free", used: 0, limit: 10, remaining: 10, resetsAt: nil, paywall: true, bonus: 3)
        let meters: [NucleoAnalysisLevel: NucleoLevelMeter] = [
            .profundo: try XCTUnwrap(NucleoLevelMeter(json: ["limit": 3, "bonus": 2])),
            .maximo: try XCTUnwrap(NucleoLevelMeter(json: ["limit": 1, "bonus": 1]))
        ]
        XCTAssertEqual(CreditsNudges.giftTotal(access: access, meters: meters), 6)
        XCTAssertEqual(CreditsNudges.giftTotal(access: nil, meters: [:]), 0)
    }

    // MARK: Whose gifts (the account fence)

    func testTheBookRecordsWhatTheLevelCentreHoldsUnderTheAccountThatIsSignedIn() {
        signIn("a")
        let levels = levelCentre()
        let book = CreditsGiftBook(defaults: defaults)
        book.record(levels: levels, owner: "a")
        XCTAssertEqual(book.ledger, CreditsGiftLedger(), "a centre that has not read yet says nothing")

        levels.apply(reply(quick: 3, deep: 2, max: 1))
        book.record(levels: levels, owner: nil)
        XCTAssertEqual(book.ledger, CreditsGiftLedger(), "nobody signed in, nothing kept")
        book.record(levels: levels, owner: "a")
        XCTAssertEqual(book.ledger, CreditsGiftLedger(owner: "a", last: 6, announce: 6, arrived: 6))
        XCTAssertEqual(CreditsGiftLedger.load(defaults), book.ledger, "kept for the next launch")

        // The next launch reads it back and a spent read is not a new gift.
        let relaunched = CreditsGiftBook(defaults: defaults)
        XCTAssertEqual(relaunched.ledger, CreditsGiftLedger(), "nothing is read from the phone until the app starts the book")
        relaunched.load()
        levels.apply(reply(quick: 2, deep: 2, max: 1))
        relaunched.record(levels: levels, owner: "a")
        XCTAssertEqual(relaunched.ledger.announce, 6)
        XCTAssertEqual(relaunched.ledger.last, 5)

        relaunched.acknowledge()
        XCTAssertNil(CreditsGiftLedger.load(defaults).announce, "seen on the Credits screen, and remembered as seen")
    }

    func testAnotherAccountNeverInheritsThePreviousAccountsGiftedTotal() {
        signIn("a")
        let levels = levelCentre()
        let book = CreditsGiftBook(defaults: defaults)
        levels.apply(reply(quick: 5, deep: 2))
        book.record(levels: levels, owner: "a")
        XCTAssertEqual(book.ledger.owner, "a")
        XCTAssertEqual(book.ledger.last, 7)

        // A signs out. The level centre keeps A's numbers until its next read.
        signIn(nil)
        book.accountChanged(levels: levels, owner: nil)
        XCTAssertEqual(book.ledger, CreditsGiftLedger(), "nothing about A stays in memory")
        XCTAssertNil(defaults.object(forKey: CreditsGiftLedger.storeKey), "or on the phone")
        XCTAssertTrue(levels.loaded, "the centre has not let go yet")
        book.record(levels: levels, owner: nil)
        XCTAssertEqual(book.ledger, CreditsGiftLedger())

        // B signs in on the same phone while the centre still holds A's seven gifted reads.
        signIn("b")
        book.accountChanged(levels: levels, owner: "b")
        XCTAssertTrue(book.levelsStale)
        book.record(levels: levels, owner: "b")
        book.record(levels: levels, owner: "b")
        XCTAssertEqual(book.ledger, CreditsGiftLedger(), "A's total is never written under B")
        XCTAssertNil(defaults.object(forKey: CreditsGiftLedger.storeKey))
        XCTAssertNil(CreditsNudges.gift(moment: moment(), ledger: book.ledger, owner: "b"), "and B is not told Bobby gave it A's reads")

        // The centre lets go of A, then reads B: an account with no gifts.
        levels.accountChanged()
        XCTAssertFalse(levels.loaded)
        book.record(levels: levels, owner: "b")
        XCTAssertFalse(book.levelsStale)
        levels.apply(reply())
        book.record(levels: levels, owner: "b")
        XCTAssertEqual(book.ledger, CreditsGiftLedger(owner: "b", last: 0, announce: nil))
    }

    func testTheSameAccountSigningBackInKeepsWhatItWasAlreadyShown() {
        signIn("a")
        let levels = levelCentre()
        let book = CreditsGiftBook(defaults: defaults)
        levels.apply(reply(quick: 5))
        book.record(levels: levels, owner: "a")
        book.acknowledge()

        // The session is renewed for the same account: the ledger stays, the centre's numbers wait.
        signIn("a")
        book.accountChanged(levels: levels, owner: "a")
        XCTAssertEqual(book.ledger, CreditsGiftLedger(owner: "a", last: 5, announce: nil))
        XCTAssertTrue(book.levelsStale)
        levels.accountChanged()
        book.record(levels: levels, owner: "a")
        levels.apply(reply(quick: 5))
        book.record(levels: levels, owner: "a")
        XCTAssertNil(book.ledger.announce, "the same five reads are not announced a second time")
    }

    func testFollowingTheCentreRecordsOnceItHasSettledAndNeverAcrossAnAccountChange() async {
        signIn("a")
        let levels = levelCentre()
        let book = CreditsGiftBook(defaults: defaults)
        book.follow(levels, owner: { [unowned self] in self.user })
        levels.apply(reply(quick: 5, deep: 2))
        XCTAssertEqual(book.ledger, CreditsGiftLedger(), "not while the reply is being applied")
        await settle()
        XCTAssertEqual(book.ledger, CreditsGiftLedger(owner: "a", last: 7, announce: 7, arrived: 7))

        // A record is waiting (the centre just published) when the account changes to B.
        levels.apply(reply(quick: 6, deep: 2))
        signIn("b")
        book.accountChanged(levels: levels, owner: "b")
        await settle()
        XCTAssertEqual(book.ledger, CreditsGiftLedger(), "the waiting record writes nothing of A's under B")

        // B's first reply clears the centre and fills it in the same turn (a coupon reply does):
        // the fence lifts with the clearing and B's own gift is recorded.
        levels.apply(reply(quick: 2))
        await settle()
        XCTAssertEqual(book.ledger, CreditsGiftLedger(owner: "b", last: 2, announce: 2, arrived: 2))
    }

    // MARK: On the glass (the source the app registers)

    /// A free account with one Quick read left this week and five gifted Deep reads not shown yet.
    private func registered() -> (center: NudgeCenter, book: CreditsGiftBook) {
        signIn("u1")
        owner = "u1"
        access = free(remaining: 1)
        let levels = levelCentre()
        levels.apply(reply(deep: 5))
        let book = CreditsGiftBook(defaults: defaults)
        book.record(levels: levels, owner: "u1")
        let center = NudgeCenter(defaults: defaults)
        center.now = { [unowned self] in self.clock }
        CreditsNudges.register(center, access: { [unowned self] in self.access }, owner: { [unowned self] in self.owner }, book: book)
        center.register(NudgeSource(key: "theses", priority: NudgePriority.theses, candidate: { _ in nil }, act: { _, _ in }))
        return (center, book)
    }

    func testTheRegisteredSourceSpeaksLowFirstAndLetsTheGiftSpeakWhileItRests() async throws {
        let (center, book) = registered()
        XCTAssertEqual(center.sourceKeys, ["theses", CreditsNudges.key], "credits speaks after the theses")
        XCTAssertNil(center.current(center.moment(signedIn: false)), "nothing for a signed-out reader")

        let low = try XCTUnwrap(center.current(center.moment(signedIn: true)))
        XCTAssertEqual(low.id, "credits.low.2026-w41", "running low comes first")

        // Shown twice and not answered: it rests, and the gift is not kept waiting behind it.
        center.seen(low.id)
        clock.addTimeInterval(700)
        center.seen(low.id)
        XCTAssertTrue(center.eligible(low.id, at: clock), "the showing in progress is not pulled from under the reader")
        clock.addTimeInterval(center.policy.showingGap + 1)
        XCTAssertFalse(center.eligible(low.id, at: clock))
        let gift = try XCTUnwrap(center.current(center.moment(signedIn: true)))
        XCTAssertEqual(gift.id, "credits.gift.5")

        // The tap: the gift is acknowledged for good and the Credits screen opens.
        let session = NucleoSession(fixtures: true, defaults: defaults)
        defer { session.teardown() }
        let status = await center.act(gift.id, session: session)
        XCTAssertEqual(status, "done")
        XCTAssertEqual(session.sheet, .credits)
        XCTAssertTrue(center.isRetired(gift.id))
        XCTAssertNil(book.ledger.announce)
        XCTAssertNil(CreditsGiftLedger.load(defaults).announce, "and it stays acknowledged after a relaunch")

        // Later, with the low line still resting and the gift acknowledged, the glass is quiet.
        clock.addTimeInterval(3600)
        XCTAssertNil(center.current(center.moment(signedIn: true)))
    }

    func testATapOnTheLowLineOpensCreditsRetiresItForTheWeekAndLeavesTheGiftToBeSaid() async throws {
        let (center, book) = registered()
        let low = try XCTUnwrap(center.current(center.moment(signedIn: true)))
        XCTAssertTrue(low.id.hasPrefix(CreditsNudges.lowPrefix))
        let session = NucleoSession(fixtures: true, defaults: defaults)
        defer { session.teardown() }
        let status = await center.act(low.id, session: session)
        XCTAssertEqual(status, "done")
        XCTAssertEqual(session.sheet, .credits)
        XCTAssertEqual(book.ledger.announce, 5, "opening Credits from the low line is not the gift's tap")

        // The reset moment moves the next day; the retired line does not come back with it.
        clock.addTimeInterval(86_400)
        access = free(remaining: 2, resetsAt: "2026-10-10T12:00:00Z")
        let next = try XCTUnwrap(center.current(center.moment(signedIn: true)))
        XCTAssertEqual(next.id, "credits.gift.5", "the low line is retired for this week; the gift may speak")

        // Another account on this phone hears neither.
        owner = "u2"
        access = nil
        XCTAssertNil(center.current(center.moment(signedIn: true)))
    }

    func testRegisteringOnATestCentreAddsTheSourceAndReadsNothingItDoesNotHave() {
        let center = NudgeCenter(defaults: defaults)
        CreditsNudges.register(center)
        XCTAssertEqual(center.sourceKeys, [CreditsNudges.key])
        // The unit host holds no access: with nothing known the source has nothing to say.
        if BobbyAccessCenter.shared.access == nil, NucleoLevelCenter.shared.quickAccess == nil {
            XCTAssertNil(center.current(center.moment(signedIn: true)))
        }
    }

    // MARK: The page's limits, in six languages

    func testEveryLineFitsThePageInSixLanguages() throws {
        // English key, Spanish text, the largest number the line can carry.
        let lines: [(key: String, es: String, sample: String)] = [
            ("{0} reads left this week", "Te quedan {0} lecturas esta semana", "2"),
            ("1 read left this week", "Te queda 1 lectura esta semana", ""),
            ("No reads left this week", "Sin lecturas esta semana", ""),
            // Gifts can reach four digits (an owner grant of 1000 reads plus 200 Deep and 100 Max).
            ("Bobby gave you {0} reads", "Bobby te regaló {0} lecturas", "1300"),
            ("Bobby gave you 1 read", "Bobby te regaló 1 lectura", ""),
        ]
        for line in lines {
            let translations = try XCTUnwrap(NativeTranslations18.credits[line.key], line.key)
            for text in [line.key, line.es] + translations.values {
                let shown = text.replacingOccurrences(of: "{0}", with: line.sample)
                XCTAssertLessThanOrEqual(shown.count, NucleoNudge.textLimit, shown)
                XCTAssertFalse(shown.contains("!"), shown)
            }
        }
        let button = try XCTUnwrap(NativeTranslations18.credits["See credits"])
        for text in ["See credits", "Ver créditos"] + button.values {
            XCTAssertLessThanOrEqual(text.count, 22, text)
        }
        // The Spanish the code speaks is the Spanish measured above.
        XCTAssertEqual(CreditsNudges.low(moment: moment(), access: free(remaining: 2), spanish: true)?.text, "Te quedan 2 lecturas esta semana")
        XCTAssertEqual(CreditsNudges.seeCredits(spanish: true), "Ver créditos")
    }

    func testTheFrenchAndGermanLinesSayWhatTheEnglishSays() throws {
        // "Plus d'analyses" reads as "more analyses": the opposite of none left.
        let none = try XCTUnwrap(NativeTranslations18.credits["No reads left this week"])
        XCTAssertEqual(none["fr"], "Plus aucune analyse cette semaine")
        // "Bleiben erhalten, bis…" says the gifted reads are kept UNTIL the moment they become usable.
        for key in ["Kept for when you are not on Bobby Pro.", "Kept for when Quick reads have a weekly limit."] {
            let german = try XCTUnwrap(NativeTranslations18.credits[key]?["de"], key)
            XCTAssertFalse(german.contains(", bis "), german)
            XCTAssertTrue(german.hasPrefix("Aufgehoben für die Zeit, in der "), german)
        }
    }

    func testTheTwoProfileTitlesTheLeadOwnsAreNotInThisTable() {
        XCTAssertNil(NativeTranslations18.credits["My theses"], "the lead adds it to the shared table at merge")
        XCTAssertNil(NativeTranslations18.credits["Reminders"], "the lead adds it to the shared table at merge")
        XCTAssertNotNil(NativeTranslations18.credits["What you are looking at, and why"])
        XCTAssertNotNil(NativeTranslations18.credits["Review reminders you set"])
    }
}
