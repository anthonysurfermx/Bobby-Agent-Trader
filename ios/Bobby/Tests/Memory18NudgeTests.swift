import Foundation
import XCTest
@testable import Bobby

/// Memory on the glass (1.8): the receipt is written from the server's facts only (never from a
/// count the app filled in) and fits the line in six languages; the offer appears only to someone
/// signed in, after a read, who has not answered the consent as it reads today; nobody signed in
/// hears nothing; a tap opens the right screen; ids are per account, so one account's tap never
/// silences another on the same iPhone; an offer closed without an answer comes back once.
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

    private func state(user: String? = "a", captureOn: Bool = false, decided: Bool = false,
                       offerOpens: Int = 0, offerOpenedAt: Date? = nil) -> MemoryNudges.State {
        MemoryNudges.State(user: user, captureOn: captureOn, decided: decided, offerOpens: offerOpens, offerOpenedAt: offerOpenedAt)
    }

    /// The account fragment the ids of "a" carry.
    private var a: String { MemoryNudges.fragment(user: "a") }

    private func inEveryLanguage(_ body: (String) -> Void) {
        for language in Self.languages {
            UserDefaults.standard.set(language, forKey: L.preferenceKey)
            body(language)
        }
        UserDefaults.standard.set("en", forKey: L.preferenceKey)
    }

    // MARK: The receipt's words

    func testTheReceiptIsWrittenFromTheFactsOnly() {
        func line(_ receipt: MemoryReceipt, _ symbol: String = "NVDA") -> String? { MemoryReceiptLine.text(symbol: symbol, receipt: receipt) }
        XCTAssertEqual(line(MemoryReceipt(recorded: true, asks: 1)), "Saved: NVDA is now in memory", "the server counted exactly one")
        XCTAssertNil(line(MemoryReceipt(recorded: true, asks: 0)), "no count sent: the app does not write \"first time\" over a zero it filled in")
        XCTAssertTrue(MemoryReceiptLine.candidates(symbol: "NVDA", receipt: MemoryReceipt(recorded: true, asks: 0)).isEmpty)
        XCTAssertNil(line(MemoryReceipt(recorded: true, asks: 0, lastAskedDaysAgo: 5, changeSinceLastAskPct: 4.2)), "nor anything else")
        // The wire type refuses a recorded ask that came without its count: there is no receipt to word.
        XCTAssertNil(MemoryReceipt(json: ["recorded": true]))
        XCTAssertNil(MemoryReceipt(json: ["recorded": true, "asks": NSNull()]))
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
        // A symbol too long for the verb and the move together keeps the move and drops the verb.
        XCTAssertEqual(line(MemoryReceipt(recorded: true, asks: 3, lastAskedDaysAgo: 5, changeSinceLastAskPct: 4.2), "ABCDEFGHIJKLMN"),
                       "ABCDEFGHIJKLMN: 5 days ago · up 4.2% since")
    }

    /// The line says what happened ("asked", "preguntaste", "demandé"…) in every language, not only when.
    func testTheReceiptKeepsItsVerbInEveryLanguageWhenItFits() {
        let verbs = ["en": "asked", "es": "preguntaste", "fr": "demandé", "pt": "perguntaste", "it": "chiesto", "de": "gefragt"]
        inEveryLanguage { language in
            let verb = verbs[language] ?? ""
            for days in [0, 1, 5, 30] {
                let when = MemoryReceiptLine.when(days)
                XCTAssertTrue(when.asked.contains(verb), "\(language): \(when.asked)")
                XCTAssertFalse(when.ago.contains(verb), "\(language): the short form is the fallback, \(when.ago)")
                XCTAssertLessThan(when.ago.count, when.asked.count, language)
                // With no price move the verb always fits for a symbol of up to eight characters.
                for symbol in ["BTC", "NVDA", "PETR4.SA"] {
                    let text = MemoryReceiptLine.text(symbol: symbol, receipt: MemoryReceipt(recorded: true, asks: 2, lastAskedDaysAgo: days))
                    XCTAssertTrue(text?.contains(verb) ?? false, "\(language): \(text ?? "nil")")
                }
            }
            let moved = MemoryReceiptLine.text(symbol: "NVDA", receipt: MemoryReceipt(recorded: true, asks: 2, lastAskedDaysAgo: 5, changeSinceLastAskPct: 4.2))
            XCTAssertTrue(moved?.contains(verb) ?? false, "\(language): \(moved ?? "nil")")
        }
        UserDefaults.standard.set("de", forKey: L.preferenceKey)
        XCTAssertEqual(MemoryReceiptLine.text(symbol: "SAP.DE", receipt: MemoryReceipt(recorded: true, asks: 1)), "Gespeichert: SAP.DE ist jetzt im Gedächtnis")
        XCTAssertEqual(MemoryReceiptLine.candidates(symbol: "SAP.DE", receipt: MemoryReceipt(recorded: true, asks: 1)).last, "SAP.DE: im Gedächtnis gespeichert")
        UserDefaults.standard.set("en", forKey: L.preferenceKey)
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
                    let text = MemoryReceiptLine.text(symbol: symbol, receipt: receipt) ?? ""
                    XCTAssertLessThanOrEqual(text.count, NucleoNudge.textLimit, "\(language): \(text)")
                    XCTAssertFalse(text.isEmpty)
                    XCTAssertFalse(text.contains("{"), "\(language): an unfilled placeholder in \(text)")
                    if symbol.count <= 8 { XCTAssertTrue(text.contains(symbol), "\(language): \(text) names the asset") }
                }
            }
            // With a symbol of up to eight characters the price move is never dropped: where the verb
            // and the move do not fit together, the verb is what gives way.
            for symbol in ["BTC", "NVDA", "PETR4.SA"] {
                for pct in [4.2, -3.1, 12.3, -12.3] {
                    let receipt = MemoryReceipt(recorded: true, asks: 5, lastAskedDaysAgo: 90, changeSinceLastAskPct: pct)
                    let text = MemoryReceiptLine.text(symbol: symbol, receipt: receipt) ?? ""
                    let lines = MemoryReceiptLine.candidates(symbol: symbol, receipt: receipt)
                    XCTAssertTrue(text == lines[0] || text == lines[1], "\(language) \(symbol) \(pct): \(text)")
                    XCTAssertTrue(text.contains(MemoryReceiptLine.change(pct) ?? "?"), "\(language) \(symbol) \(pct): \(text)")
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
                       "SAP.DE: vor 5 Tagen gefragt · seitdem −4,2 %")
        UserDefaults.standard.set("fr", forKey: L.preferenceKey)
        XCTAssertEqual(MemoryReceiptLine.text(symbol: "MC.PA", receipt: MemoryReceipt(recorded: true, asks: 2, lastAskedDaysAgo: 5, changeSinceLastAskPct: 4.2)),
                       "MC.PA : demandé il y a 5 jours · +4,2 % depuis")
        UserDefaults.standard.set("es", forKey: L.preferenceKey)
        // Spanish follows the device's region (4.2 in Mexico, 4,2 in Spain): the mark is the locale's own.
        XCTAssertEqual(MemoryReceiptLine.text(symbol: "NVDA", receipt: MemoryReceipt(recorded: true, asks: 2, lastAskedDaysAgo: 5, changeSinceLastAskPct: 4.2)),
                       "NVDA: preguntaste hace 5 días · subió \(MemoryReceiptLine.percent(4.2))%")
        XCTAssertTrue(["4.2", "4,2"].contains(MemoryReceiptLine.percent(4.2)))
        UserDefaults.standard.set("en", forKey: L.preferenceKey)
        XCTAssertEqual(MemoryReceiptLine.percent(12), "12")
        XCTAssertEqual(MemoryReceiptLine.percent(1234.56), "1234.6", "no grouping mark to misread")
    }

    // MARK: When it speaks

    func testTheOfferNeedsAnAccountAReadAndNoAnswerYet() {
        let offer = MemoryNudges.candidate(moment(read: read()), state: state())
        XCTAssertEqual(offer, NucleoNudge(id: "memory.offer.v1.\(a)", text: "I can pick this up next time", cta: "How it works"))
        XCTAssertNil(MemoryNudges.candidate(moment(read: nil), state: state()), "no read yet: nothing to pick up")
        XCTAssertNil(MemoryNudges.candidate(moment(signedIn: false, read: read()), state: state(user: nil)), "memory needs an account")
        XCTAssertNil(MemoryNudges.candidate(moment(signedIn: false, read: read()), state: state()), "the session says signed out")
        XCTAssertNil(MemoryNudges.candidate(moment(read: read()), state: state(user: nil)), "no account on the phone")
        XCTAssertNil(MemoryNudges.candidate(moment(read: read()), state: state(decided: true)), "answered already (yes or no): it does not nag")
        XCTAssertNil(MemoryNudges.candidate(moment(read: read()), state: state(captureOn: true)), "memory is already on")
        // The server said memory applied but nothing was recorded (paused): no receipt, and the offer still stands.
        let paused = read(memory: MemoryReceipt(recorded: false, asks: 3, lastAskedDaysAgo: 2))
        XCTAssertEqual(MemoryNudges.candidate(moment(read: paused), state: state())?.id, "memory.offer.v1.\(a)")
        XCTAssertNil(MemoryNudges.candidate(moment(read: paused), state: state(captureOn: true, decided: true)))
    }

    /// LEAD UPDATE 1: a receipt speaks only for `recorded == true` AND `asks >= 1`.
    func testAReceiptWithoutACountFromTheServerSaysNothing() {
        for receipt in [MemoryReceipt(recorded: true, asks: 0),
                        MemoryReceipt(recorded: true, asks: 0, lastAskedDaysAgo: 3, changeSinceLastAskPct: 2),
                        MemoryReceipt(recorded: false, asks: 1), MemoryReceipt(recorded: false, asks: 0)] {
            XCTAssertNil(MemoryNudges.candidate(moment(read: read(memory: receipt)), state: state(captureOn: true, decided: true)),
                         "no receipt, and memory is on so there is nothing to offer either")
            XCTAssertEqual(MemoryNudges.candidate(moment(read: read(memory: receipt)), state: state())?.id, "memory.offer.v1.\(a)",
                           "it falls through to the offer rules, never to a made-up \"Saved\"")
        }
        XCTAssertEqual(MemoryNudges.candidate(moment(read: read(memory: MemoryReceipt(recorded: true, asks: 1))), state: state(captureOn: true, decided: true))?.text,
                       "Saved: NVDA is now in memory")
        // Straight from the wire, as the server would send a reply without its count.
        let wire = MemoryReceipt(json: ["recorded": true])
        XCTAssertNil(MemoryNudges.candidate(moment(read: read(memory: wire)), state: state(captureOn: true, decided: true)))
    }

    func testTheReceiptComesFirstAndIsPerAsset() {
        let kept = read("PETR4.SA", memory: MemoryReceipt(recorded: true, asks: 3, lastAskedDaysAgo: 5, changeSinceLastAskPct: 4.2))
        let nudge = MemoryNudges.candidate(moment(read: kept), state: state(captureOn: true, decided: true))
        XCTAssertEqual(nudge, NucleoNudge(id: "memory.kept.\(a).petr4sa", text: "PETR4.SA: asked 5 days ago · up 4.2% since", cta: "See memory"))
        XCTAssertNotNil(nudge?.id.range(of: NucleoNudge.idPattern, options: .regularExpression))
        XCTAssertEqual(MemoryNudges.receiptId("BRK-B", user: "a"), "memory.kept.\(a).brkb")
        XCTAssertEqual(MemoryNudges.receiptId("^GSPC", user: "a"), "memory.kept.\(a).gspc")
        XCTAssertNil(MemoryNudges.receiptId("^=", user: "a"), "an id the page could not send back is never made")
        XCTAssertNil(MemoryNudges.candidate(moment(signedIn: false, read: kept), state: state(user: nil)), "signed out: not even a receipt")
        XCTAssertEqual(MemoryNudges.route(for: nudge?.id ?? ""), .memory)
        XCTAssertEqual(MemoryNudges.route(for: "memory.offer.v1.\(a)"), .memoryConsent)
        XCTAssertEqual(MemoryNudges.route(for: "memory.offer.v1.\(a).2"), .memoryConsent)
    }

    /// LEAD UPDATE 1: every id this source can produce matches the bridge pattern (lowercase, 48 at most),
    /// whatever the account id looks like (Supabase ids are UUIDs; `UUID().uuidString` is uppercase).
    func testEveryIdTheSourceCanProduceMatchesTheBridgePattern() {
        let users = ["a", UUID().uuidString, UUID().uuidString.lowercased(), "Someone@Example.COM", "ÁÉÍ-ñ", String(repeating: "X", count: 200)]
        let symbols = ["BTC", "NVDA", "BRK-B", "9988.HK", "^GSPC", "PETR4.SA", "ABCDEFGHIJKLMNOPQRST"]
        func assertValid(_ id: String?, _ note: String) {
            guard let id else { return XCTFail("no id: \(note)") }
            XCTAssertNotNil(id.range(of: NucleoNudge.idPattern, options: .regularExpression), "\(id) (\(note))")
            XCTAssertEqual(id, id.lowercased(), note)
        }
        for user in users {
            let fragment = MemoryNudges.fragment(user: user)
            XCTAssertEqual(fragment.count, 8)
            XCTAssertNotNil(fragment.range(of: "^[0-9a-f]{8}$", options: .regularExpression), fragment)
            XCTAssertFalse(user.count >= 8 && fragment == user.prefix(8).lowercased(), "a hash, never a piece of the id itself")
            assertValid(MemoryNudges.offerId(user: user, now: clock), "offer")
            assertValid(MemoryNudges.offerId(user: user, opens: 1, openedAt: clock.addingTimeInterval(-MemoryNudges.reofferAfter), now: clock), "second offer")
            assertValid(MemoryNudges.offerId(user: user, version: 12, opens: 1, openedAt: .distantPast, now: clock), "a later consent version")
            for symbol in symbols { assertValid(MemoryNudges.receiptId(symbol, user: user), "receipt \(symbol)") }
            // Through the candidate, as the centre would get them.
            assertValid(MemoryNudges.candidate(moment(read: read()), state: state(user: user))?.id, "candidate offer")
            for symbol in symbols {
                let kept = read(symbol, memory: MemoryReceipt(recorded: true, asks: 2, lastAskedDaysAgo: 1))
                assertValid(MemoryNudges.candidate(moment(read: kept), state: state(user: user, captureOn: true, decided: true))?.id, "candidate receipt \(symbol)")
            }
        }
        XCTAssertEqual(MemoryNudges.receiptId("ABCDEFGHIJKLMNOPQRST", user: "a"), "memory.kept.\(a).abcdefghijklmnopqrst",
                       "the longest symbol the server accepts keeps all its letters")
    }

    /// The centre keeps its records per device. The account fragment keeps one account's taps from
    /// silencing another account on the same iPhone.
    func testOneAccountsTapNeverSilencesAnotherOnTheSameIPhone() async {
        let center = NudgeCenter(defaults: defaults)
        center.now = { [unowned self] in self.clock }
        final class Phone { var state: MemoryNudges.State; init(_ state: MemoryNudges.State) { self.state = state } }
        let phone = Phone(state(user: "a"))
        MemoryNudges.register(center, state: { phone.state }, offerOpened: { _, _ in })
        let session = NucleoSession(fixtures: true, defaults: defaults)
        defer { session.teardown() }
        let b = MemoryNudges.fragment(user: "b")
        XCTAssertNotEqual(a, b)

        // A opens the offer, then a receipt.
        center.noteRead(read())
        XCTAssertEqual(center.current(center.moment(signedIn: true))?.id, "memory.offer.v1.\(a)")
        let opened = await center.act("memory.offer.v1.\(a)", session: session)
        XCTAssertEqual(opened, "done")
        session.sheetDismissed()
        phone.state = state(user: "a", captureOn: true, decided: true)
        clock.addTimeInterval(20 * 60)
        center.noteRead(read("NVDA", memory: MemoryReceipt(recorded: true, asks: 1)))
        XCTAssertEqual(center.current(center.moment(signedIn: true))?.id, "memory.kept.\(a).nvda")
        let seen = await center.act("memory.kept.\(a).nvda", session: session)
        XCTAssertEqual(seen, "done")
        session.sheetDismissed()

        // B signs in on the same iPhone: B is offered memory, and B's NVDA receipt speaks.
        center.forgetMoment()
        phone.state = state(user: "b")
        clock.addTimeInterval(20 * 60)
        center.noteRead(read())
        XCTAssertEqual(center.current(center.moment(signedIn: true))?.id, "memory.offer.v1.\(b)", "A's tap did not retire B's offer")
        phone.state = state(user: "b", captureOn: true, decided: true)
        center.noteRead(read("NVDA", memory: MemoryReceipt(recorded: true, asks: 1)))
        XCTAssertEqual(center.current(center.moment(signedIn: true))?.id, "memory.kept.\(b).nvda", "nor B's receipt for the same asset")
        XCTAssertTrue(center.isRetired("memory.kept.\(a).nvda"))
        XCTAssertFalse(center.isRetired("memory.kept.\(b).nvda"))
    }

    /// "How it works" then the X is not an answer. The offer comes back once after a rest, under a
    /// second id (the centre retired the first on the tap), and never a third time.
    func testAnOfferClosedWithoutAnAnswerComesBackOnceAfterARest() async {
        let center = NudgeCenter(defaults: defaults)
        center.now = { [unowned self] in self.clock }
        let log = MemoryOfferLog(defaults: defaults)
        MemoryNudges.register(center, state: { [unowned self] in MemoryNudges.liveState(user: "a", defaults: self.defaults, erased: { _, _ in false }) },
                              offerOpened: { log.noteOpened(user: $0, at: $1) })
        let session = NucleoSession(fixtures: true, defaults: defaults)
        defer { session.teardown() }
        center.noteRead(read())
        let first = "memory.offer.v1.\(a)"
        XCTAssertEqual(center.current(center.moment(signedIn: true))?.id, first)
        XCTAssertNil(log.entry(user: "a"), "seeing the offer is not opening it")
        let openedAt = clock
        var result = await center.act(first, session: session)
        XCTAssertEqual(result, "done")
        XCTAssertEqual(session.sheet, .memoryConsent)
        XCTAssertEqual(log.entry(user: "a"), MemoryOfferLog.Entry(opens: 1, at: openedAt))
        XCTAssertNil(log.entry(user: "b"), "the log is this account's")
        session.sheetDismissed()   // the X: no answer recorded
        XCTAssertFalse(MemoryConsent(defaults: defaults).hasDecided(user: "a"))

        clock.addTimeInterval(6 * 86_400)
        center.noteRead(read())
        XCTAssertNil(center.current(center.moment(signedIn: true)), "it rests first")
        clock.addTimeInterval(86_400 + 60)
        center.noteRead(read())
        let second = first + ".2"
        XCTAssertEqual(center.current(center.moment(signedIn: true))?.id, second, "no answer was given, so it asks once more")
        result = await center.act(second, session: session)
        XCTAssertEqual(result, "done")
        XCTAssertEqual(log.entry(user: "a")?.opens, 2)
        session.sheetDismissed()
        clock.addTimeInterval(60 * 86_400)
        center.noteRead(read())
        XCTAssertNil(center.current(center.moment(signedIn: true)), "twice is enough: Memory › Turn on remains")

        // An answer ends it at any point: a decline after the first open means no return.
        log.clear(user: "a")
        log.noteOpened(user: "a", at: clock.addingTimeInterval(-30 * 86_400))
        XCTAssertEqual(MemoryNudges.candidate(moment(read: read()), state: MemoryNudges.liveState(user: "a", defaults: defaults))?.id, second)
        MemoryConsent(defaults: defaults).set(accepted: false, user: "a", at: clock)
        XCTAssertNil(MemoryNudges.candidate(moment(read: read()), state: MemoryNudges.liveState(user: "a", defaults: defaults)))
        // Pure rule.
        XCTAssertEqual(MemoryNudges.offerId(user: "a", now: clock), first)
        XCTAssertNil(MemoryNudges.offerId(user: "a", opens: 1, openedAt: clock.addingTimeInterval(-MemoryNudges.reofferAfter + 1), now: clock))
        XCTAssertNil(MemoryNudges.offerId(user: "a", opens: 1, openedAt: nil, now: clock))
        XCTAssertEqual(MemoryNudges.offerId(user: "a", opens: 1, openedAt: clock.addingTimeInterval(-MemoryNudges.reofferAfter), now: clock), second)
        XCTAssertNil(MemoryNudges.offerId(user: "a", opens: 2, openedAt: .distantPast, now: clock))
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
        final class Phone {
            var state: MemoryNudges.State
            var opened: [(user: String, at: Date)] = []
            init(_ state: MemoryNudges.State) { self.state = state }
        }
        let phone = Phone(state())
        MemoryNudges.register(center, state: { phone.state }, offerOpened: { phone.opened.append(($0, $1)) })
        XCTAssertEqual(center.sourceKeys, ["memory"])
        XCTAssertNil(center.current(center.moment(signedIn: true)), "before any read it is silent")
        center.noteRead(read())
        XCTAssertNil(center.current(center.moment(signedIn: false)))
        let offer = "memory.offer.v1.\(a)"
        XCTAssertEqual(center.current(center.moment(signedIn: true))?.id, offer)

        let session = NucleoSession(fixtures: true, defaults: defaults)
        defer { session.teardown() }
        let opened = await center.act(offer, session: session)
        XCTAssertEqual(opened, "done")
        XCTAssertEqual(session.sheet, .memoryConsent, "\"How it works\" opens the consent, which turns nothing on by itself")
        XCTAssertTrue(center.isRetired(offer))
        XCTAssertEqual(phone.opened.map(\.user), ["a"], "the open is noted for the account it was offered to")
        XCTAssertEqual(phone.opened.first?.at, clock)
        session.sheetDismissed()

        // The person said yes. A reply that says "recorded" without a count is not a receipt.
        phone.state = state(captureOn: true, decided: true)
        clock.addTimeInterval(20 * 60)
        center.noteRead(read("SOL", memory: MemoryReceipt(recorded: true, asks: 0)))
        XCTAssertNil(center.current(center.moment(signedIn: true)), "a zero the app filled in says nothing on the glass")
        center.noteRead(read("SOL", memory: MemoryReceipt(json: ["recorded": true, "asks": NSNull()])))
        XCTAssertNil(center.current(center.moment(signedIn: true)))
        XCTAssertEqual(center.showings("memory.kept.\(a).sol"), 0)

        // The next read comes back with a real receipt.
        center.noteRead(read("BTC", memory: MemoryReceipt(recorded: true, asks: 1)))
        let receipt = center.current(center.moment(signedIn: true))
        XCTAssertEqual(receipt?.id, "memory.kept.\(a).btc")
        XCTAssertEqual(receipt?.text, "Saved: BTC is now in memory")
        let seen = await center.act("memory.kept.\(a).btc", session: session)
        XCTAssertEqual(seen, "done")
        XCTAssertEqual(session.sheet, .memory, "\"See memory\" opens what is kept")
        XCTAssertEqual(phone.opened.count, 1, "a receipt is not an offer")
        session.sheetDismissed()
        clock.addTimeInterval(20 * 60)
        XCTAssertNil(center.current(center.moment(signedIn: true)), "a receipt that was opened does not repeat for that asset")
        center.noteRead(read("ETH", memory: MemoryReceipt(recorded: true, asks: 2, lastAskedDaysAgo: 3)))
        XCTAssertEqual(center.current(center.moment(signedIn: true))?.id, "memory.kept.\(a).eth", "another asset has its own")
    }

    // MARK: What the phone stored

    /// The live state for a signed-in account, from what this phone stored for that account only.
    func testTheLiveStateReadsTheSwitchAndTheConsentOfThatAccount() async {
        func live(_ user: String?, version: Int = MemoryConsent.currentVersion) -> MemoryNudges.State {
            MemoryNudges.liveState(user: user, defaults: defaults, version: version, erased: { _, _ in false })
        }
        func offered(_ user: String?, version: Int = MemoryConsent.currentVersion) -> String? {
            MemoryNudges.candidate(moment(read: read()), state: live(user, version: version))?.id
        }
        // Nothing stored: undecided, capture off, so the offer shows.
        var s = live("a")
        XCTAssertEqual(s.user, "a")
        XCTAssertFalse(s.captureOn)
        XCTAssertFalse(s.decided)
        XCTAssertEqual(s.offerOpens, 0)
        XCTAssertEqual(offered("a"), "memory.offer.v1.\(a)")

        // A decline record: decided, so no offer.
        MemoryConsent(defaults: defaults).set(accepted: false, user: "a", at: clock)
        s = live("a")
        XCTAssertTrue(s.decided)
        XCTAssertFalse(s.captureOn)
        XCTAssertNil(offered("a"), "a decline is remembered")
        // Another account's records are not this account's: B is still offered.
        XCTAssertFalse(live("b").decided)
        XCTAssertEqual(offered("b"), "memory.offer.v1.\(MemoryNudges.fragment(user: "b"))")

        // "Remember" through the real model: the stored switch and an accepted record → capture on, no offer.
        let c = MemoryCenter(observeAccount: false, defaults: defaults)
        let generation = UUID()
        c.currentUser = { "a" }
        c.currentGeneration = { generation }
        c.riskAccepted = { true }
        c.send = { _, _, _ in (["enabled": true, "prefs": [String: Any](), "assets": [Any](), "retentionDays": 90], 200) }
        c.accountChanged(force: true)
        let remembered = await MemoryConsentModel(center: c).remember()
        XCTAssertTrue(remembered)
        s = live("a")
        XCTAssertTrue(s.captureOn, "the stored opt-in is read")
        XCTAssertTrue(s.decided)
        XCTAssertNil(offered("a"), "memory is on: nothing to offer")
        XCTAssertFalse(live("b").captureOn, "A's switch is not B's")
        XCTAssertEqual(offered("b"), "memory.offer.v1.\(MemoryNudges.fragment(user: "b"))")

        // The switch without its record (iOS 1.7's switch) is not capture: the account is asked.
        MemoryConsent(defaults: defaults).clear(user: "a")
        XCTAssertTrue(MemoryCenter.storedNativeOptIn(user: "a", defaults: defaults))
        s = live("a")
        XCTAssertFalse(s.captureOn, "a switch nobody consented to under this text does not count")
        XCTAssertFalse(s.decided)
        XCTAssertEqual(offered("a"), "memory.offer.v1.\(a)")

        // A reworded consent (version 2): a yes to version 1 is neither capture nor a decision, and the offer has its own id.
        MemoryConsent(defaults: defaults).set(accepted: true, user: "a", at: clock)
        XCTAssertTrue(live("a").captureOn)
        s = live("a", version: 2)
        XCTAssertFalse(s.captureOn)
        XCTAssertFalse(s.decided)
        XCTAssertEqual(offered("a", version: 2), "memory.offer.v2.\(a)", "everyone is asked again, including those who said yes")

        // The offer log is read too, per account and per version.
        MemoryOfferLog(defaults: defaults).noteOpened(user: "b", at: clock)
        XCTAssertEqual(live("b").offerOpens, 1)
        XCTAssertEqual(live("b").offerOpenedAt, clock)
        XCTAssertEqual(live("a").offerOpens, 0)
        XCTAssertEqual(live("b", version: 2).offerOpens, 0)
        XCTAssertNil(offered("b"), "opened a moment ago: resting")

        // Nobody signed in: silent, whatever is stored.
        XCTAssertNil(live(nil).user)
        XCTAssertNil(offered(nil))
        XCTAssertNil(MemoryNudges.candidate(moment(read: read(memory: MemoryReceipt(recorded: true, asks: 1))), state: live(nil)))
        if AccountSession.shared.session == nil {
            XCTAssertNil(MemoryNudges.liveState(defaults: defaults).user, "the test host has nobody signed in")
        }
        XCTAssertEqual(NudgePriority.memory, 60)
    }
}
