import Foundation
import XCTest
@testable import Bobby

/// The harness (1.8) on the glass and on the lock screen: the words, their limits in six
/// languages, the tapped payload, the board, and the session's side of a tap.
@MainActor
final class HarnessGlassTests: XCTestCase {
    private final class Recorder: NucleoEmitting {
        var events: [(name: String, payload: [String: Any])] = []
        func emit(_ name: String, _ payload: [String: Any]) { events.append((name, payload)) }
        func pageReady() {}
        func named(_ name: String) -> [[String: Any]] { events.filter { $0.name == name }.map(\.payload) }
    }

    private static let languages = ["en", "es", "fr", "pt", "it", "de"]
    private var previousLanguage = "system"
    private var suiteName = ""
    private var defaults: UserDefaults!
    private let t0 = Date(timeIntervalSince1970: 1_800_000_000)

    override func setUp() async throws {
        try await super.setUp()
        previousLanguage = L.selection
        suiteName = "harness.glass.tests.\(UUID().uuidString)"
        defaults = UserDefaults(suiteName: suiteName)
    }

    override func tearDown() async throws {
        L.select(previousLanguage)
        defaults.removePersistentDomain(forName: suiteName)
        try await super.tearDown()
    }

    private func inEveryLanguage(_ body: (String) -> Void) {
        for language in Self.languages {
            L.select(language)
            body(language)
        }
    }

    // MARK: Words

    func testTheGlassLinesFitInEveryLanguage() {
        inEveryLanguage { language in
            for symbol in ["BTC", "NVDA", "PETR4.SA", "INTESASANPAOLO.MI", "ABCDEFGHIJKLMNOPQRST"] {
                let offer = HarnessCopy.offerLine(symbol: symbol)
                XCTAssertLessThanOrEqual(offer.count, NucleoNudge.textLimit, "\(language) offer: \(offer)")
                for pct in [nil, 0.0, 2.34, -12.3, 104.9] as [Double?] {
                    for days in [1, 3, 14] {
                        let line = HarnessCopy.moveLine(symbol: symbol, pct: pct, days: days)
                        XCTAssertLessThanOrEqual(line.count, NucleoNudge.textLimit, "\(language) move: \(line)")
                        XCTAssertTrue(line.contains(symbol))
                    }
                }
            }
            XCTAssertLessThanOrEqual(HarnessCopy.offerButton.count, NucleoNudge.ctaLimit, language)
            XCTAssertLessThanOrEqual(HarnessCopy.moveButton.count, NucleoNudge.ctaLimit, language)
        }
    }

    func testTheOfferNamesTheAssetWhenItFits() {
        inEveryLanguage { language in
            XCTAssertTrue(HarnessCopy.offerLine(symbol: "NVDA").contains("NVDA"), language)
            // A symbol too long for the line gives the plain line, never a cut one.
            let long = HarnessCopy.offerLine(symbol: "ABCDEFGHIJKLMNOPQRST")
            XCTAssertLessThanOrEqual(long.count, NucleoNudge.textLimit, language)
            XCTAssertTrue(long.contains("ABCDEFGHIJKLMNOPQRST") || !long.contains("ABCDEF"), "\(language): whole or absent")
        }
        L.select("en")
        XCTAssertEqual(HarnessCopy.offerLine(symbol: "ABCDEFGHIJKLMNOPQRST"), "Shall I keep you posted on this?")
    }

    func testTheMoveSaysWhatThePhoneRead() {
        L.select("en")
        XCTAssertEqual(HarnessCopy.moveLine(symbol: "NVDA", pct: 2.34, days: 1), "NVDA +2.3% since you asked")
        XCTAssertEqual(HarnessCopy.moveLine(symbol: "NVDA", pct: -1.06, days: 1), "NVDA -1.1% since you asked")
        XCTAssertEqual(HarnessCopy.moveLine(symbol: "NVDA", pct: 0.01, days: 1), "NVDA is where you left it")
        XCTAssertEqual(HarnessCopy.moveLine(symbol: "NVDA", pct: nil, days: 1), "NVDA, a day later", "no number the phone does not have")
        XCTAssertEqual(HarnessCopy.moveLine(symbol: "NVDA", pct: nil, days: 3), "NVDA, 3 days later")
        L.select("es")
        XCTAssertEqual(HarnessCopy.moveLine(symbol: "NVDA", pct: 2.34, days: 1), "NVDA \(HarnessCopy.signed(2.34)) desde que preguntaste",
                       "the number in the language's own notation")
        XCTAssertEqual(HarnessCopy.offerLine(symbol: "NVDA"), "¿Te voy contando cómo sigue NVDA?", "an ongoing follow-up, said as one")
    }

    func testTheLockScreenIsWrittenInTheAppsLanguage() {
        let asset = HarnessFollowUp(step: .asset, fireAt: t0, symbol: "NVDA", days: 1)
        let later = HarnessFollowUp(step: .asset, fireAt: t0, symbol: "NVDA", days: 3)
        let sector = HarnessFollowUp(step: .sector, fireAt: t0, symbol: "NVDA", sector: "semis")
        let week = HarnessFollowUp(step: .week, fireAt: t0, symbol: "NVDA", others: 2)
        let alone = HarnessFollowUp(step: .week, fireAt: t0, symbol: "NVDA", others: 0)
        L.select("en")
        XCTAssertEqual(HarnessCopy.body(asset), "NVDA: back to your question.")
        XCTAssertEqual(HarnessCopy.body(later), "NVDA: back to your question.", "the day count is not said on the lock screen")
        XCTAssertEqual(HarnessCopy.body(sector), "Semiconductors today. NVDA is part of it.")
        XCTAssertEqual(HarnessCopy.body(week), "Your week: NVDA and 2 more.")
        XCTAssertEqual(HarnessCopy.body(alone), "Your week with NVDA.")
        L.select("es")
        XCTAssertEqual(HarnessCopy.body(asset), "NVDA: de vuelta a tu pregunta.")
        XCTAssertEqual(HarnessCopy.body(sector), "Semiconductores hoy. NVDA es parte.")
        XCTAssertEqual(HarnessCopy.body(week), "Tu semana: NVDA y 2 más.")
        var seen = Set<String>()
        inEveryLanguage { language in
            for followUp in [asset, later, sector, week, alone] {
                let body = HarnessCopy.body(followUp)
                XCTAssertTrue(body.contains("NVDA"), language)
                XCTAssertFalse(body.contains("{"), "\(language): a placeholder was left in \(body)")
            }
            seen.insert(HarnessCopy.body(asset))
        }
        XCTAssertEqual(seen.count, Self.languages.count, "six languages, six lines")
    }

    func testNothingTheHarnessSaysPromisesOrWatches() {
        let forbidden = ["buy", "sell", "profit", "guarantee", "returns", "advice", "signal", "alert", "watch", "monitor", "detect",
                         "compra", "vende", "ganancia", "garantiz", "rendimiento", "consejo", "señal", "alerta", "vigil", "detect"]
        var said: [String] = []
        inEveryLanguage { _ in
            said += [HarnessCopy.offerLine(symbol: "NVDA"), HarnessCopy.offerButton, HarnessCopy.moveButton, HarnessCopy.switchLabel,
                     HarnessCopy.switchDetail, HarnessCopy.weekTitle, HarnessCopy.sinceAsked, HarnessCopy.last24h, HarnessCopy.boardFoot,
                     HarnessCopy.boardEmpty, HarnessCopy.changedQuestion(symbol: "NVDA"), HarnessCopy.lookQuestion(symbol: "NVDA"),
                     HarnessCopy.moveSeen, HarnessCopy.stopAction, HarnessCopy.hiddenBody(.asset), HarnessCopy.hiddenBody(.week),
                     HarnessCopy.moveLine(symbol: "NVDA", pct: 3, days: 1), HarnessCopy.moveLine(symbol: "NVDA", pct: nil, days: 2),
                     HarnessCopy.body(HarnessFollowUp(step: .asset, fireAt: t0, symbol: "NVDA")),
                     HarnessCopy.body(HarnessFollowUp(step: .sector, fireAt: t0, symbol: "NVDA", sector: "semis")),
                     HarnessCopy.body(HarnessFollowUp(step: .week, fireAt: t0, symbol: "NVDA", others: 1))]
            said += HarnessSectors.all.map(\.title)
        }
        for line in said {
            let lower = line.lowercased()
            for word in forbidden { XCTAssertFalse(lower.contains(word), "“\(line)” says “\(word)”") }
            XCTAssertFalse(line.contains("!"), line)
        }
    }

    func testEveryHarnessStringHasItsFourTranslations() {
        for (key, row) in NativeTranslations18.harness {
            XCTAssertEqual(Set(row.keys), ["fr", "pt", "it", "de"], key)
            for (language, text) in row {
                XCTAssertFalse(text.isEmpty, "\(key) [\(language)]")
                for placeholder in ["{0}", "{1}"] {
                    XCTAssertEqual(key.contains(placeholder), text.contains(placeholder), "\(key) [\(language)] \(placeholder)")
                }
            }
        }
    }

    // MARK: Sectors

    func testEverySectorHasCompanyAndEachAssetOneSector() {
        var seen: [String: String] = [:]
        for sector in HarnessSectors.all {
            XCTAssertGreaterThanOrEqual(sector.members.count, 2, sector.id)
            XCTAssertNotEqual(sector.title, sector.id, "\(sector.id) has a name")
            for member in sector.members {
                XCTAssertNotNil(HarnessLedger.validSymbol(member.symbol), member.symbol)
                XCTAssertNil(seen[member.symbol], "\(member.symbol) is in \(seen[member.symbol] ?? "") and \(sector.id)")
                seen[member.symbol] = sector.id
            }
        }
        XCTAssertEqual(HarnessSectors.sector(of: "nvda")?.id, "semis")
        XCTAssertEqual(HarnessSectors.sector(of: "SOL")?.id, "layer1")
        XCTAssertNil(HarnessSectors.sector(of: "GME"), "an asset that is not listed has no sector: nothing is guessed")
        XCTAssertEqual(HarnessSectors.sector(of: "AMD")?.board(around: "AMD").first?.symbol, "AMD", "the asked asset first")
        XCTAssertEqual(HarnessSectors.sector(of: "AMD")?.board(around: "AMD").count, 5)
    }

    // MARK: The tapped payload

    func testOnlyAFollowUpPayloadIsATap() {
        let at = 1_800_000_000.0, when = Date(timeIntervalSince1970: at)
        func payload(_ step: String, symbol: Any? = nil, sector: String? = nil, kind: String? = "follow-up", owner: Any? = "local", at stamp: Any? = at) -> [AnyHashable: Any] {
            var info: [AnyHashable: Any] = ["step": step]
            if let kind { info["kind"] = kind }
            if let symbol { info["symbol"] = symbol }
            if let sector { info["sector"] = sector }
            if let owner { info["owner"] = owner }
            if let stamp { info["at"] = stamp }
            return info
        }
        XCTAssertEqual(HarnessTap.tap(from: payload("asset", symbol: "NVDA")),
                       HarnessTap(step: .asset, symbol: "NVDA", sector: nil, owner: "local", stamp: when))
        XCTAssertEqual(HarnessTap.tap(from: payload("sector", symbol: "nvda", sector: "semis", owner: "a1b2c3d4e5f60718")),
                       HarnessTap(step: .sector, symbol: "NVDA", sector: "semis", owner: "a1b2c3d4e5f60718", stamp: when))
        XCTAssertEqual(HarnessTap.tap(from: payload("week")), HarnessTap(step: .week, symbol: nil, sector: nil, owner: "local", stamp: when))
        XCTAssertNil(HarnessTap.tap(from: payload("asset", symbol: "NVDA", kind: "thesis-review")))
        XCTAssertNil(HarnessTap.tap(from: payload("asset", symbol: "NVDA", kind: nil)), "no kind: not ours")
        XCTAssertNil(HarnessTap.tap(from: payload("price", symbol: "NVDA")))
        XCTAssertNil(HarnessTap.tap(from: payload("asset")), "an asset follow-up names its asset")
        XCTAssertNil(HarnessTap.tap(from: payload("asset", symbol: "NVDA; drop")))
        XCTAssertNil(HarnessTap.tap(from: payload("sector", symbol: "NVDA", sector: "made-up")))
        XCTAssertNil(HarnessTap.tap(from: payload("asset", symbol: "NVDA", owner: nil)), "it does not say whose it is")
        XCTAssertNil(HarnessTap.tap(from: payload("asset", symbol: "NVDA", at: nil)), "it does not say when it was for")
        XCTAssertNil(HarnessTap.tap(from: ["aps": payload("week")]), "only the top level is read")
        // A follow-up is never mistaken for a reminder or a briefing, nor the other way round.
        XCTAssertNil(ReminderIntent.tap(from: payload("week")))
        XCTAssertNil(BriefingIntent.briefId(from: payload("week")))
        // The tag is a digest: the same reader always gets the same one, and it never holds the account id.
        XCTAssertEqual(HarnessCenter.ownerTag(nil), "local")
        XCTAssertEqual(HarnessCenter.ownerTag("user-1"), HarnessCenter.ownerTag("user-1"))
        XCTAssertNotEqual(HarnessCenter.ownerTag("user-1"), HarnessCenter.ownerTag("user-2"))
        XCTAssertEqual(HarnessCenter.ownerTag("user-1").count, 16)
        XCTAssertFalse(HarnessCenter.ownerTag("user-1").contains("user"))
    }

    // MARK: The nudges

    func testTheOfferComesAfterAReadUntilThePersonDecides() {
        L.select("en")
        let read = NudgeRead(requestId: "r1", symbol: "NVDA", name: "NVIDIA", isEquity: true, verdict: "wait", saved: false, at: t0)
        let fresh = NudgeMoment(signedIn: false, now: t0.addingTimeInterval(60), lastRead: read, readsThisLaunch: 1)
        let offer = HarnessNudges.offer(fresh, mode: .undecided)
        XCTAssertEqual(offer?.id, "harness.offer.v1")
        XCTAssertEqual(offer?.text, "Shall I keep you posted on NVDA?")
        XCTAssertEqual(offer?.cta, "Yes, tell me")
        XCTAssertNil(HarnessNudges.offer(fresh, mode: .on), "they already said yes")
        XCTAssertNil(HarnessNudges.offer(fresh, mode: .off), "they said no: never again")
        XCTAssertNil(HarnessNudges.offer(NudgeMoment(signedIn: false, now: t0, lastRead: nil, readsThisLaunch: 0), mode: .undecided), "no read yet")
        XCTAssertNil(HarnessNudges.offer(NudgeMoment(signedIn: false, now: t0.addingTimeInterval(3_600), lastRead: read, readsThisLaunch: 1), mode: .undecided))
    }

    func testTheMoveHasAnIdPerAssetAndQuestionThatThePageAccepts() {
        let move = HarnessMove(symbol: "PETR4.SA", name: "Petrobras", isEquity: true, askedAt: t0, priceThen: 10, priceNow: 11, days: 1)
        let nudge = HarnessNudges.nudge(move)
        XCTAssertEqual(nudge.id, "harness.move.petr4.sa.20270115")
        XCTAssertNotNil(nudge.id.range(of: NucleoNudge.idPattern, options: .regularExpression))
        let longest = HarnessMove(symbol: "ABCDEFGHIJKLMNOPQRS=", name: "x", isEquity: true, askedAt: t0, priceThen: nil, priceNow: nil, days: 1)
        XCTAssertNotNil(HarnessNudges.moveId(longest).range(of: NucleoNudge.idPattern, options: .regularExpression))
        let next = HarnessMove(symbol: "PETR4.SA", name: "Petrobras", isEquity: true, askedAt: t0.addingTimeInterval(86_400), priceThen: 10, priceNow: 11, days: 1)
        XCTAssertNotEqual(HarnessNudges.moveId(next), nudge.id, "a new question is a new line")
    }

    func testComingBackSpeaksBeforeEverythingElseAndTheOfferBeforeTheOtherOffers() {
        XCTAssertGreaterThan(NudgePriority.followUp, NudgePriority.invite)
        XCTAssertGreaterThan(NudgePriority.invite, NudgePriority.followUpOffer)
        XCTAssertGreaterThan(NudgePriority.followUpOffer, NudgePriority.theses)
    }

    // MARK: The board

    func testASectorBoardStartsWithTheAssetAndReadsTheDay() throws {
        L.select("en")
        let board = HarnessBoard.make(for: HarnessTap(step: .sector, symbol: "AMD", sector: "semis"), ledger: HarnessLedger(), now: t0)
        XCTAssertEqual(board.kind, .sector("semis"))
        XCTAssertEqual(board.title, "Semiconductors")
        XCTAssertEqual(board.basis, "Last 24 hours")
        XCTAssertEqual(board.rows.map(\.symbol), ["AMD", "NVDA", "TSM", "AVGO", "QCOM"])
        let row = try XCTUnwrap(board.rows.first)
        XCTAssertEqual(board.change(for: row, price: 150, changePct: 1.2), 1.2)
        XCTAssertNil(board.change(for: row, price: 150, changePct: nil), "no number is shown for a row that could not be read")
    }

    func testTheWeekBoardComparesWithThePriceAtTheQuestion() throws {
        L.select("en")
        var ledger = HarnessLedger()
        ledger.note(HarnessEvent(kind: .ask, at: t0.addingTimeInterval(-9 * 86_400), symbol: "OLD", name: "Old", isEquity: true, price: 1))
        ledger.note(HarnessEvent(kind: .ask, at: t0.addingTimeInterval(-3 * 86_400), symbol: "NVDA", name: "NVIDIA", isEquity: true, price: 100))
        ledger.note(HarnessEvent(kind: .ask, at: t0.addingTimeInterval(-2 * 86_400), symbol: "BTC", name: "Bitcoin", isEquity: false, price: nil))
        ledger.note(HarnessEvent(kind: .ask, at: t0.addingTimeInterval(-86_400), symbol: "NVDA", name: "NVIDIA", isEquity: true, price: 120))
        var board = HarnessBoard.make(for: HarnessTap(step: .week, symbol: "NVDA", sector: nil), ledger: ledger, now: t0)
        XCTAssertEqual(board.kind, .week)
        XCTAssertEqual(board.title, "Your week")
        XCTAssertEqual(board.basis, "Since you asked")
        XCTAssertEqual(board.rows.map(\.symbol), ["NVDA", "BTC"], "the last seven days, latest first")
        let nvda = try XCTUnwrap(board.rows.first)
        XCTAssertEqual(board.change(for: nvda, price: 110, changePct: -5) ?? 0, 10, accuracy: 0.001, "since the first question of the week, not the day's change")
        XCTAssertNil(board.change(for: board.rows[1], price: 60_000, changePct: 2), "no price at the question: no number")
        board.set(10, for: "NVDA")
        XCTAssertEqual(board.rows.first?.change, 10)
        // With nothing asked this week the board is empty, never invented.
        XCTAssertEqual(HarnessBoard.make(for: nil, ledger: HarnessLedger(), now: t0).rows, [])
    }

    // MARK: The session

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
        // This suite does not test the wait for a page that is waking (NucleoReadStartTests does).
        session.wakeTick = 0
        session.briefingGate = BriefingTapGate(appActive: { true }, signedIn: { false }, deskBusy: { false }, listening: { false }, narrating: { false })
        let recorder = Recorder()
        session.emitter = recorder
        return (session, NucleoBridge(session: session), recorder)
    }

    private func settle() async {
        for _ in 0..<12 { await withCheckedContinuation { c in DispatchQueue.main.async { c.resume() } } }
    }

    private func harness() -> HarnessCenter {
        let center = HarnessCenter(notifier: FakeHarnessNotifier(), defaults: defaults)
        center.consent = { .accepted }
        center.currentUser = { nil }
        center.weeklyCovered = { false }
        center.quote = { _ in nil }
        return center
    }

    func testATappedSectorOpensItsBoardAndATappedAssetStaysOnTheGlass() async {
        let center = harness()
        // A notification only exists for someone who said yes, and only then is its tap written down.
        _ = await center.accept()
        let intent = HarnessIntent(observeAccount: false)
        let (session, bridge, recorder) = makeSession(harness: center, intent: intent)
        defer { session.teardown() }
        _ = await bridge.handle(body: ["v": 1, "method": "session", "params": ["page": "app"]], trusted: true)
        await settle()
        intent.store(HarnessTap(step: .asset, symbol: "NVDA", sector: nil))
        await settle()
        XCTAssertNil(session.sheet, "the asset's follow-up is a line on the glass, not a screen")
        XCTAssertNil(intent.pending, "consumed once")
        XCTAssertEqual(center.ledger.events(.opened).map(\.step), [.asset])
        // A notification planned for another reader of this phone opens nothing and is still consumed.
        intent.store(HarnessTap(step: .sector, symbol: "NVDA", sector: "semis", owner: HarnessCenter.ownerTag("someone-else"), stamp: t0))
        await settle()
        XCTAssertNil(session.sheet)
        XCTAssertNil(intent.pending)
        intent.store(HarnessTap(step: .sector, symbol: "NVDA", sector: "semis"))
        await settle()
        XCTAssertEqual(session.sheet, .followUp)
        XCTAssertEqual(HarnessBoardFocus.pending, HarnessTap(step: .sector, symbol: "NVDA", sector: "semis"))
        XCTAssertEqual(recorder.named("native.sheet").last?["route"] as? String, "followUp")
        HarnessBoardFocus.pending = nil
    }

    func testAReadStartedFromABoardWaitsForItsSheetToClose() async throws {
        let center = harness()
        let (session, bridge, recorder) = makeSession(harness: center, intent: HarnessIntent(observeAccount: false))
        defer { session.teardown() }
        _ = await bridge.handle(body: ["v": 1, "method": "session", "params": ["page": "app"]], trusted: true)
        await settle()
        // From the glass: the page is told at once, with a token and the question native wrote.
        XCTAssertTrue(session.startRead(symbol: "NVDA", name: "NVIDIA", isEquity: true, question: "What changed in NVDA since I asked?"))
        let first = try XCTUnwrap(recorder.named("ask.start").first)
        XCTAssertEqual(first["question"] as? String, "What changed in NVDA since I asked?")
        XCTAssertEqual((first["token"] as? String)?.count, 36)
        // From a sheet: the sheet goes first, then the page hears about the read.
        XCTAssertTrue(session.present(.followUp))
        XCTAssertTrue(session.startRead(symbol: "AMD", name: "AMD", isEquity: true, question: "How does AMD look today?"))
        XCTAssertEqual(recorder.named("ask.start").count, 1, "not while the sheet covers the glass")
        XCTAssertNil(session.sheet)
        session.sheetDismissed()
        await settle()
        let names = recorder.events.map(\.name)
        let closed = try XCTUnwrap(names.lastIndex(of: "native.sheet"))
        let started = try XCTUnwrap(names.lastIndex(of: "ask.start"))
        XCTAssertLessThan(closed, started, "the page hears the sheet closed before it is asked to read")
        XCTAssertEqual(recorder.named("ask.start").last?["question"] as? String, "How does AMD look today?")
        XCTAssertTrue(NucleoRoute.nativeOnly.contains(.followUp), "the page cannot open the board by itself")
        XCTAssertFalse(NucleoRoute.openable.contains("followUp"))
    }
}
