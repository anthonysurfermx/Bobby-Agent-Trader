import Foundation
import XCTest
@testable import Bobby

/// Memory on the glass (1.8): the receipt is written from the server's facts only and fits the
/// line in six languages; the offer appears only to someone signed in, after a read, who has not
/// answered yet; nobody signed in hears nothing; a tap opens the right screen.
@MainActor
final class Memory18NudgeTests: XCTestCase {
    private static let languages = ["en", "es", "fr", "pt", "it", "de"]
    private var suiteName = ""
    private var defaults: UserDefaults!
    private var previousLanguage: Any?
    private var clock = Date(timeIntervalSince1970: 1_800_000_000)

    override func setUp() async throws {
        try await super.setUp()
        suiteName = "memory18.nudge.tests.\(UUID().uuidString)"
        defaults = UserDefaults(suiteName: suiteName)
        previousLanguage = UserDefaults.standard.object(forKey: L.preferenceKey)
        UserDefaults.standard.set("en", forKey: L.preferenceKey)
        clock = Date(timeIntervalSince1970: 1_800_000_000)
        NucleoFixtures.activate(scenario: "default", timeScale: 0.01)
    }

    override func tearDown() async throws {
        NucleoFixtures.deactivate()
        if let previousLanguage { UserDefaults.standard.set(previousLanguage, forKey: L.preferenceKey) }
        else { UserDefaults.standard.removeObject(forKey: L.preferenceKey) }
        defaults.removePersistentDomain(forName: suiteName)
        try await super.tearDown()
    }

    private func read(_ symbol: String = "NVDA", memory: MemoryReceipt? = nil) -> NudgeRead {
        NudgeRead(requestId: "r-\(symbol)", symbol: symbol, name: symbol, isEquity: true, verdict: "wait", saved: false, at: clock, memory: memory)
    }

    private func moment(signedIn: Bool = true, read: NudgeRead? = nil) -> NudgeMoment {
        NudgeMoment(signedIn: signedIn, now: clock, lastRead: read, readsThisLaunch: read == nil ? 0 : 1)
    }

    private func state(user: String? = "a", captureOn: Bool = false, decided: Bool = false) -> MemoryNudges.State {
        MemoryNudges.State(user: user, captureOn: captureOn, decided: decided)
    }

    private func inEveryLanguage(_ body: (String) -> Void) {
        for language in Self.languages {
            UserDefaults.standard.set(language, forKey: L.preferenceKey)
            body(language)
        }
        UserDefaults.standard.set("en", forKey: L.preferenceKey)
    }

    // MARK: The receipt's words

    func testTheReceiptIsWrittenFromTheFactsOnly() {
        func line(_ receipt: MemoryReceipt, _ symbol: String = "NVDA") -> String { MemoryReceiptLine.text(symbol: symbol, receipt: receipt) }
        XCTAssertEqual(line(MemoryReceipt(recorded: true, asks: 1)), "Saved: NVDA is now in memory")
        XCTAssertEqual(line(MemoryReceipt(recorded: true, asks: 0)), "Saved: NVDA is now in memory", "no count sent: still only what is known")
        XCTAssertEqual(line(MemoryReceipt(recorded: true, asks: 3, lastAskedDaysAgo: 5, changeSinceLastAskPct: 4.2)),
                       "NVDA: asked 5 days ago · up 4.2% since")
        XCTAssertEqual(line(MemoryReceipt(recorded: true, asks: 3, lastAskedDaysAgo: 5, changeSinceLastAskPct: -3.1)),
                       "NVDA: asked 5 days ago · down 3.1% since")
        XCTAssertEqual(line(MemoryReceipt(recorded: true, asks: 2, lastAskedDaysAgo: 1, changeSinceLastAskPct: 4)),
                       "NVDA: asked 1 day ago · up 4% since")
        XCTAssertEqual(line(MemoryReceipt(recorded: true, asks: 2, lastAskedDaysAgo: 12, changeSinceLastAskPct: 0.02)),
                       "NVDA: asked 12 days ago · flat since")
        XCTAssertEqual(line(MemoryReceipt(recorded: true, asks: 4, lastAskedDaysAgo: 0)), "NVDA: asked less than a day ago",
                       "no price move was sent, so none is claimed")
        XCTAssertEqual(line(MemoryReceipt(recorded: true, asks: 2, lastAskedDaysAgo: 30)), "NVDA: asked 30 days ago")
        XCTAssertEqual(line(MemoryReceipt(recorded: true, asks: 3)), "NVDA: asked 3× so far", "only the count is known")
        XCTAssertEqual(line(MemoryReceipt(recorded: true, asks: 3, changeSinceLastAskPct: 9.9)), "NVDA: asked 3× so far",
                       "a move without its date is not shown")
        XCTAssertNil(MemoryReceiptLine.change(nil))
        XCTAssertNil(MemoryReceiptLine.change(.nan))
    }

    func testEveryReceiptFitsTheGlassInSixLanguages() {
        let receipts: [MemoryReceipt] = [
            MemoryReceipt(recorded: true, asks: 1),
            MemoryReceipt(recorded: true, asks: 2, lastAskedDaysAgo: 0),
            MemoryReceipt(recorded: true, asks: 2, lastAskedDaysAgo: 1),
            MemoryReceipt(recorded: true, asks: 6, lastAskedDaysAgo: 5, changeSinceLastAskPct: 4.2),
            MemoryReceipt(recorded: true, asks: 6, lastAskedDaysAgo: 5, changeSinceLastAskPct: -3.1),
            MemoryReceipt(recorded: true, asks: 9, lastAskedDaysAgo: 90, changeSinceLastAskPct: 12.3),
            MemoryReceipt(recorded: true, asks: 9, lastAskedDaysAgo: 90, changeSinceLastAskPct: -12.3),
            MemoryReceipt(recorded: true, asks: 9, lastAskedDaysAgo: 1, changeSinceLastAskPct: 0),
            MemoryReceipt(recorded: true, asks: 9, lastAskedDaysAgo: 45, changeSinceLastAskPct: 0.04),
            MemoryReceipt(recorded: true, asks: 9, lastAskedDaysAgo: 7, changeSinceLastAskPct: 250),
            MemoryReceipt(recorded: true, asks: 3),
            MemoryReceipt(recorded: true, asks: 120),
        ]
        // A crypto ticker, a US stock, regional listings from the catalogue, and the longest symbol the server accepts.
        let symbols = ["BTC", "NVDA", "BRK-B", "MC.PA", "PETR4.SA", "VALE3.SA", "ABCDEFGHIJKLMNOPQRST"]
        inEveryLanguage { language in
            for symbol in symbols {
                for receipt in receipts {
                    let text = MemoryReceiptLine.text(symbol: symbol, receipt: receipt)
                    XCTAssertLessThanOrEqual(text.count, NucleoNudge.textLimit, "\(language): \(text)")
                    XCTAssertFalse(text.isEmpty)
                    XCTAssertFalse(text.contains("{"), "\(language): an unfilled placeholder in \(text)")
                    if symbol.count <= 8 { XCTAssertTrue(text.contains(symbol), "\(language): \(text) names the asset") }
                }
            }
            // With a symbol of up to eight characters, the fullest form is the one shown: the price move is never dropped.
            for symbol in ["BTC", "NVDA", "PETR4.SA"] {
                for pct in [4.2, -3.1, 12.3, -12.3] {
                    let receipt = MemoryReceipt(recorded: true, asks: 5, lastAskedDaysAgo: 90, changeSinceLastAskPct: pct)
                    XCTAssertEqual(MemoryReceiptLine.text(symbol: symbol, receipt: receipt),
                                   MemoryReceiptLine.candidates(symbol: symbol, receipt: receipt)[0], "\(language) \(symbol) \(pct)")
                }
            }
            let offer = MemoryNudges.candidate(moment(read: read()), state: state())
            XCTAssertLessThanOrEqual(offer?.text.count ?? 99, NucleoNudge.textLimit, language)
            XCTAssertLessThanOrEqual(offer?.cta.count ?? 99, 22, language)
            let kept = MemoryNudges.candidate(moment(read: read(memory: MemoryReceipt(recorded: true, asks: 1))), state: state(captureOn: true, decided: true))
            XCTAssertLessThanOrEqual(kept?.cta.count ?? 99, 22, language)
            XCTAssertFalse(kept?.cta.isEmpty ?? true)
        }
    }

    func testThePercentageUsesTheLanguagesDecimalMark() {
        UserDefaults.standard.set("de", forKey: L.preferenceKey)
        XCTAssertEqual(MemoryReceiptLine.percent(4.2), "4,2")
        XCTAssertEqual(MemoryReceiptLine.text(symbol: "SAP.DE", receipt: MemoryReceipt(recorded: true, asks: 2, lastAskedDaysAgo: 5, changeSinceLastAskPct: -4.25)),
                       "SAP.DE: vor 5 Tagen · seitdem −4,2 %")
        UserDefaults.standard.set("fr", forKey: L.preferenceKey)
        XCTAssertEqual(MemoryReceiptLine.text(symbol: "MC.PA", receipt: MemoryReceipt(recorded: true, asks: 2, lastAskedDaysAgo: 5, changeSinceLastAskPct: 4.2)),
                       "MC.PA : il y a 5 jours · +4,2 % depuis")
        UserDefaults.standard.set("es", forKey: L.preferenceKey)
        // Spanish follows the device's region (4.2 in Mexico, 4,2 in Spain): the mark is the locale's own.
        XCTAssertEqual(MemoryReceiptLine.text(symbol: "NVDA", receipt: MemoryReceipt(recorded: true, asks: 2, lastAskedDaysAgo: 5, changeSinceLastAskPct: 4.2)),
                       "NVDA: hace 5 días · subió \(MemoryReceiptLine.percent(4.2))%")
        XCTAssertTrue(["4.2", "4,2"].contains(MemoryReceiptLine.percent(4.2)))
        UserDefaults.standard.set("en", forKey: L.preferenceKey)
        XCTAssertEqual(MemoryReceiptLine.percent(12), "12")
        XCTAssertEqual(MemoryReceiptLine.percent(1234.56), "1234.6", "no grouping mark to misread")
    }

    // MARK: When it speaks

    func testTheOfferNeedsAnAccountAReadAndNoAnswerYet() {
        let offer = MemoryNudges.candidate(moment(read: read()), state: state())
        XCTAssertEqual(offer, NucleoNudge(id: "memory.offer.v1", text: "I can pick this up next time", cta: "How it works"))
        XCTAssertNil(MemoryNudges.candidate(moment(read: nil), state: state()), "no read yet: nothing to pick up")
        XCTAssertNil(MemoryNudges.candidate(moment(signedIn: false, read: read()), state: state(user: nil)), "memory needs an account")
        XCTAssertNil(MemoryNudges.candidate(moment(signedIn: false, read: read()), state: state()), "the session says signed out")
        XCTAssertNil(MemoryNudges.candidate(moment(read: read()), state: state(user: nil)), "no account on the phone")
        XCTAssertNil(MemoryNudges.candidate(moment(read: read()), state: state(decided: true)), "answered already (yes or no): it does not nag")
        XCTAssertNil(MemoryNudges.candidate(moment(read: read()), state: state(captureOn: true)), "memory is already on")
        // The server said memory applied but nothing was recorded (paused): no receipt, and the offer still stands.
        let paused = read(memory: MemoryReceipt(recorded: false, asks: 3, lastAskedDaysAgo: 2))
        XCTAssertEqual(MemoryNudges.candidate(moment(read: paused), state: state())?.id, MemoryNudges.offerId)
        XCTAssertNil(MemoryNudges.candidate(moment(read: paused), state: state(captureOn: true, decided: true)))
    }

    func testTheReceiptComesFirstAndIsPerAsset() {
        let kept = read("PETR4.SA", memory: MemoryReceipt(recorded: true, asks: 3, lastAskedDaysAgo: 5, changeSinceLastAskPct: 4.2))
        let nudge = MemoryNudges.candidate(moment(read: kept), state: state(captureOn: true, decided: true))
        XCTAssertEqual(nudge, NucleoNudge(id: "memory.kept.petr4sa", text: "PETR4.SA: asked 5 days ago · up 4.2% since", cta: "See memory"))
        XCTAssertNotNil(nudge?.id.range(of: NucleoNudge.idPattern, options: .regularExpression))
        XCTAssertEqual(MemoryNudges.receiptId("BRK-B"), "memory.kept.brkb")
        XCTAssertEqual(MemoryNudges.receiptId("^GSPC"), "memory.kept.gspc")
        XCTAssertNil(MemoryNudges.receiptId("^="), "an id the page could not send back is never made")
        for symbol in ["ABCDEFGHIJKLMNOPQRST", "BTC", "9988.HK"] {
            let id = MemoryNudges.receiptId(symbol) ?? ""
            XCTAssertNotNil(id.range(of: NucleoNudge.idPattern, options: .regularExpression), id)
        }
        XCTAssertNil(MemoryNudges.candidate(moment(signedIn: false, read: kept), state: state(user: nil)), "signed out: not even a receipt")
        XCTAssertEqual(MemoryNudges.route(for: nudge?.id ?? ""), .memory)
        XCTAssertEqual(MemoryNudges.route(for: MemoryNudges.offerId), .memoryConsent)
    }

    func testAReceiptIsWithdrawnOnceThePersonErasedWhatItNames() {
        var s = state(captureOn: true, decided: true)
        let kept = read(memory: MemoryReceipt(recorded: true, asks: 1))
        let readAt = clock
        s.erased = { date, symbol in date == readAt && symbol == "NVDA" }
        XCTAssertNil(MemoryNudges.candidate(moment(read: kept), state: s), "\"Saved: NVDA is now in memory\" would no longer be true")
        s.erased = { _, _ in false }
        XCTAssertNotNil(MemoryNudges.candidate(moment(read: kept), state: s))
    }

    // MARK: Through the centre and the session

    func testTheRegisteredSourceFollowsTheEtiquetteAndOpensItsScreens() async {
        let center = NudgeCenter(defaults: defaults)
        center.now = { [unowned self] in self.clock }
        final class Phone { var state: MemoryNudges.State; init(_ state: MemoryNudges.State) { self.state = state } }
        let phone = Phone(state())
        MemoryNudges.register(center, state: { phone.state })
        XCTAssertEqual(center.sourceKeys, ["memory"])
        XCTAssertNil(center.current(center.moment(signedIn: true)), "before any read it is silent")
        center.noteRead(read())
        XCTAssertNil(center.current(center.moment(signedIn: false)))
        XCTAssertEqual(center.current(center.moment(signedIn: true))?.id, MemoryNudges.offerId)

        let session = NucleoSession(fixtures: true, defaults: defaults)
        defer { session.teardown() }
        let opened = await center.act(MemoryNudges.offerId, session: session)
        XCTAssertEqual(opened, "done")
        XCTAssertEqual(session.sheet, .memoryConsent, "\"How it works\" opens the consent, which turns nothing on by itself")
        XCTAssertTrue(center.isRetired(MemoryNudges.offerId))
        session.sheetDismissed()

        // The person said yes; the next read comes back with a receipt.
        phone.state = state(captureOn: true, decided: true)
        clock.addTimeInterval(20 * 60)
        center.noteRead(read("BTC", memory: MemoryReceipt(recorded: true, asks: 1)))
        let receipt = center.current(center.moment(signedIn: true))
        XCTAssertEqual(receipt?.id, "memory.kept.btc")
        XCTAssertEqual(receipt?.text, "Saved: BTC is now in memory")
        let seen = await center.act("memory.kept.btc", session: session)
        XCTAssertEqual(seen, "done")
        XCTAssertEqual(session.sheet, .memory, "\"See memory\" opens what is kept")
        session.sheetDismissed()
        clock.addTimeInterval(20 * 60)
        XCTAssertNil(center.current(center.moment(signedIn: true)), "a receipt that was opened does not repeat for that asset")
        center.noteRead(read("ETH", memory: MemoryReceipt(recorded: true, asks: 2, lastAskedDaysAgo: 3)))
        XCTAssertEqual(center.current(center.moment(signedIn: true))?.id, "memory.kept.eth", "another asset has its own")
    }

    func testTheLiveStateReadsOnlyWhatThisAccountStoredOnThisPhone() {
        // Nobody is signed in on the test host unless another test says so: the live state is silent.
        if AccountSession.shared.session == nil {
            let live = MemoryNudges.liveState(defaults: defaults)
            XCTAssertNil(live.user)
            XCTAssertNil(MemoryNudges.candidate(moment(read: read(memory: MemoryReceipt(recorded: true, asks: 1))), state: live))
        }
        XCTAssertFalse(MemoryCenter.storedNativeOptIn(user: "a", defaults: defaults))
        XCTAssertFalse(MemoryConsent(defaults: defaults).hasDecided(user: "a"))
        XCTAssertEqual(NudgePriority.memory, 60)
    }
}
