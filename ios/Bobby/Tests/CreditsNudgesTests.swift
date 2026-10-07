import Foundation
import XCTest
@testable import Bobby

/// Credits on the glass (1.8): a line when this week's reads are about to run out, and a line
/// when gifted reads arrive. These pin when each speaks, what its id is (so it can come back next
/// week but not after every spent read), and that the copy fits the page in six languages.
@MainActor
final class CreditsNudgesTests: XCTestCase {
    private let now = BobbyAccessAPI.date("2026-10-07T12:00:00Z")!
    private var suiteName = ""
    private var defaults: UserDefaults!

    override func setUp() async throws {
        try await super.setUp()
        suiteName = "credits.nudges.tests.\(UUID().uuidString)"
        defaults = UserDefaults(suiteName: suiteName)
    }

    override func tearDown() async throws {
        defaults.removePersistentDomain(forName: suiteName)
        try await super.tearDown()
    }

    private func moment(signedIn: Bool = true) -> NudgeMoment {
        NudgeMoment(signedIn: signedIn, now: now, lastRead: nil, readsThisLaunch: 0)
    }

    private func free(remaining: Int?, used: Int = 0, resetsAt: String? = "2026-10-09T12:00:00Z", paywall: Bool = true, bonus: Int = 0) -> BobbyReadAccess {
        BobbyReadAccess(tier: "free", used: used, limit: 10, remaining: remaining, resetsAt: resetsAt, paywall: paywall, bonus: bonus)
    }

    private func valid(_ nudge: NucleoNudge?) -> Bool {
        guard let nudge else { return false }
        return nudge.id.range(of: NucleoNudge.idPattern, options: .regularExpression) != nil
    }

    // MARK: Running low

    func testAFreeAccountWithTwoOrFewerReadsLeftIsToldOncePerWeek() throws {
        let two = try XCTUnwrap(CreditsNudges.low(moment: moment(), access: free(remaining: 2), spanish: false))
        XCTAssertEqual(two.id, "credits.low.20261009", "the id is the day this window resets")
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

        let nextWeek = try XCTUnwrap(CreditsNudges.low(moment: moment(), access: free(remaining: 2, resetsAt: "2026-10-13T08:00:00Z"), spanish: false))
        XCTAssertEqual(nextWeek.id, "credits.low.20261013", "another window is another nudge: it can come back")
        let noReset = try XCTUnwrap(CreditsNudges.low(moment: moment(), access: free(remaining: 2, resetsAt: nil), spanish: false))
        XCTAssertEqual(noReset.id, "credits.low.20261007", "without a reset day the id is today's")
        let staleReset = try XCTUnwrap(CreditsNudges.low(moment: moment(), access: free(remaining: 2, resetsAt: "2026-10-01T00:00:00Z"), spanish: false))
        XCTAssertEqual(staleReset.id, "credits.low.20261007")
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
        XCTAssertEqual(afterOne.text, "Bobby gave you 4 reads", "the line says what the account holds now")

        ledger.acknowledge()
        XCTAssertNil(CreditsNudges.gift(moment: moment(), ledger: ledger, owner: "u1"), "shown on the Credits screen: nothing left to announce")
        ledger.observe(total: 4, owner: "u1")
        ledger.observe(total: 3, owner: "u1")
        XCTAssertNil(CreditsNudges.gift(moment: moment(), ledger: ledger, owner: "u1"), "spending is never news")

        ledger.observe(total: 13, owner: "u1")
        XCTAssertEqual(CreditsNudges.gift(moment: moment(), ledger: ledger, owner: "u1", spanish: false)?.id, "credits.gift.13", "a new gift is a new nudge")

        ledger.observe(total: 0, owner: "u1")
        XCTAssertNil(CreditsNudges.gift(moment: moment(), ledger: ledger, owner: "u1"), "nothing left, nothing to say")

        var single = CreditsGiftLedger()
        single.observe(total: 1, owner: "u1")
        XCTAssertEqual(CreditsNudges.gift(moment: moment(), ledger: single, owner: "u1", spanish: false)?.text, "Bobby gave you 1 read")
        XCTAssertEqual(CreditsNudges.gift(moment: moment(), ledger: single, owner: "u1", spanish: true)?.text, "Bobby te regaló 1 lectura")
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
        ledger.observe(total: 0, owner: "u3")
        XCTAssertEqual(ledger, CreditsGiftLedger(owner: "u3", last: 0, announce: nil), "an account with no gifts announces nothing")
    }

    func testTheLedgerSurvivesARelaunchAndIsErasedWithItsAccount() {
        var ledger = CreditsGiftLedger()
        ledger.observe(total: 7, owner: "u1")
        ledger.save(defaults)
        XCTAssertEqual(CreditsGiftLedger.load(defaults), ledger)
        CreditsGiftLedger().save(defaults)
        XCTAssertNil(defaults.object(forKey: CreditsGiftLedger.storeKey), "no owner, nothing kept")
        XCTAssertEqual(CreditsGiftLedger.load(defaults), CreditsGiftLedger())
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

    // MARK: On the glass

    func testTheCentreServesItWithTheCreditsPriorityAndRetiresItOnATap() async throws {
        let center = NudgeCenter(defaults: defaults)
        center.now = { [now] in now }
        let access = free(remaining: 1)
        var opened = 0
        center.register(NudgeSource(key: CreditsNudges.key, priority: NudgePriority.credits,
                                    candidate: { CreditsNudges.low(moment: $0, access: access, spanish: false) },
                                    act: { _, _ in opened += 1 }))
        center.register(NudgeSource(key: "theses", priority: NudgePriority.theses, candidate: { _ in nil }, act: { _, _ in }))
        let served = try XCTUnwrap(center.current(center.moment(signedIn: true)))
        XCTAssertEqual(served.id, "credits.low.20261009")
        XCTAssertNil(center.current(center.moment(signedIn: false)), "nothing for a signed-out reader")
        center.retire(served.id)
        XCTAssertNil(center.current(center.moment(signedIn: true)), "once acted on, this week's line is gone for good")
        XCTAssertEqual(opened, 0)
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
}
