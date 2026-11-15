// Watches on the glass (V19/Watches): which sentences ask for a watch, in six languages, and which
// do not; the line the glass shows, what its button does, and what a notification tap may open.
import XCTest
@testable import Bobby

final class WatchGlassTests: XCTestCase {
    private var previousSelection: String?

    override func setUp() {
        super.setUp()
        previousSelection = UserDefaults.standard.string(forKey: L.preferenceKey)
        L.select("en")
    }
    override func tearDown() {
        if let previousSelection { UserDefaults.standard.set(previousSelection, forKey: L.preferenceKey) }
        else { UserDefaults.standard.removeObject(forKey: L.preferenceKey) }
        super.tearDown()
    }

    private static let symbols = ["BTC", "ETH", "SOL", "SPY", "QQQ", "NVDA", "AAPL", "TSLA", "META", "MSFT", "GOOGL", "AMZN", "AMD", "COIN"]
    private static func row(_ id: String, symbol: String = "NVDA", state: String = "active", seen: Bool = false) -> [String: Any] {
        ["id": id, "symbol": symbol, "name": symbol, "direction": "falls", "percent": 5, "days": 7, "state": state,
         "label": "\(symbol) · closes 5% lower · until November 21", "seen": seen,
         "result": ["gist": "\(symbol): -6.2%.", "text": "\(symbol): -6.2%. Close against close."]]
    }
    private static func body(_ rows: [[String: Any]] = [], limit: Int = 3) -> [String: Any] {
        ["version": 1, "watches": rows, "limit": limit,
         "options": ["symbols": symbols, "directions": ["falls", "rises", "moves"], "percents": [3, 5, 10], "days": [7, 30]]]
    }
    private static var board: WatchBoard { WatchBoard(json: body())! }

    // MARK: the sentence

    func testASentenceThatAsksToBeToldIsAWatchInSixLanguages() {
        let said: [(String, WatchDraft)] = [
            ("Tell me if Nvidia falls more than 5%", WatchDraft(symbol: "NVDA", name: "NVIDIA", direction: .falls, percent: 5, days: 7)),
            ("let me know when bitcoin rises 10% this month", WatchDraft(symbol: "BTC", name: "Bitcoin", direction: .rises, percent: 10, days: 30)),
            ("Avísame si Nvidia cae más de 5 %", WatchDraft(symbol: "NVDA", name: "NVIDIA", direction: .falls, percent: 5, days: 7)),
            ("avisame cuando Tesla suba un 3 por ciento este mes", WatchDraft(symbol: "TSLA", name: "Tesla", direction: .rises, percent: 3, days: 30)),
            ("Préviens-moi si Apple baisse de 5 %", WatchDraft(symbol: "AAPL", name: "Apple", direction: .falls, percent: 5, days: 7)),
            ("Dis-moi si Ethereum monte de 10 pour cent", WatchDraft(symbol: "ETH", name: "Ethereum", direction: .rises, percent: 10, days: 7)),
            ("Avisa-me se a Nvidia descer 5%", WatchDraft(symbol: "NVDA", name: "NVIDIA", direction: .falls, percent: 5, days: 7)),
            ("Me avisa se o Bitcoin cair 10%", WatchDraft(symbol: "BTC", name: "Bitcoin", direction: .falls, percent: 10, days: 7)),
            ("Avvisami se Nvidia scende del 5%", WatchDraft(symbol: "NVDA", name: "NVIDIA", direction: .falls, percent: 5, days: 7)),
            ("Fammi sapere se Microsoft sale del 3%", WatchDraft(symbol: "MSFT", name: "Microsoft", direction: .rises, percent: 3, days: 7)),
            ("Sag mir Bescheid, wenn Nvidia um 5 % fällt", WatchDraft(symbol: "NVDA", name: "NVIDIA", direction: .falls, percent: 5, days: 7)),
            ("Benachrichtige mich, wenn Amazon 10 Prozent steigt", WatchDraft(symbol: "AMZN", name: "Amazon", direction: .rises, percent: 10, days: 7)),
            // No direction: either way. A size the server does not offer: the nearest one, in plain sight.
            ("tell me if AMD moves 7%", WatchDraft(symbol: "AMD", name: "AMD", direction: .moves, percent: 5, days: 7)),
            ("alert me if coinbase drops", WatchDraft(symbol: "COIN", name: "Coinbase", direction: .falls, percent: 5, days: 7)),
        ]
        for (sentence, wanted) in said {
            XCTAssertEqual(WatchIntent.parse(sentence, board: Self.board), wanted, sentence)
        }
    }

    func testAnOrdinaryQuestionIsNeverAWatch() {
        for sentence in ["How is Nvidia looking?", "¿Cómo ves a Nvidia?", "Nvidia cae 5 %, ¿por qué?", "tell me about Nvidia",
                         "tell me if Nvidia is a good company", "avísame si Nvidia o Tesla caen 5 %", "tell me if Dogecoin falls 5%",
                         "avísame si llueve mañana", "", String(repeating: "tell me if nvidia falls 5% ", count: 12)] {
            XCTAssertNil(WatchIntent.parse(sentence, board: Self.board), sentence)
        }
        // An asset the server does not list for this account is no asset.
        let narrow = WatchBoard(json: ["version": 1, "watches": [], "limit": 3, "options": ["symbols": ["BTC"], "percents": [3, 5, 10], "days": [7, 30]]])!
        XCTAssertNil(WatchIntent.parse("tell me if Nvidia falls 5%", board: narrow))
    }

    // MARK: the glass

    private final class Script: @unchecked Sendable {
        var replies: [BriefingsReply] = []
        var asked: [[String: Any]?] = []
        var transport: BriefingsTransport {
            BriefingsTransport(json: { [self] _, _, body, _, _ in
                asked.append(body)
                guard !replies.isEmpty else { throw CancellationError() }
                return replies.removeFirst()
            }, bytes: { _ in .unavailable })
        }
        func ok(_ rows: [[String: Any]] = []) { replies.append(BriefingsReply(json: WatchGlassTests.body(rows), status: 200, headers: [:])) }
    }
    @MainActor private func center(_ script: Script, notifications: Bool = true) -> WatchCenter {
        WatchCenter(deps: .init(api: { WatchAPI(transport: script.transport, auth: .none) }, riskAccepted: { true }, signedIn: { true },
                                allowNotifications: { notifications }, delivery: {}))
    }

    @MainActor func testTheSentenceLeavesOneLineAndTheTapStartsTheWatch() async {
        let script = Script(); script.ok()
        let center = center(script)
        let glass = WatchGlass(center: { center })
        XCTAssertNil(glass.offer("tell me if Nvidia falls 5%"), "before the server listed the watches there is no door to offer")
        await center.refresh()
        XCTAssertNil(glass.offer("How is Nvidia looking?"))
        let line = glass.offer("tell me if Nvidia falls 5%")
        XCTAssertEqual(line?["status"] as? String, "level_notice")
        XCTAssertEqual(line?["caption"] as? String, "NVIDIA · falls 5% · 7 days")
        XCTAssertEqual(line?["cta"] as? String, "Watch")
        XCTAssertEqual(script.asked.count, 1, "the sentence alone starts nothing")
        let token = line?["token"] as? String ?? ""
        XCTAssertTrue(glass.owns(token))
        XCTAssertFalse(glass.owns("3f0c1f8e-0000-4000-8000-000000000000"))

        let id = "watch_0123456789abcdef0123456789abcdef"
        script.ok([Self.row(id)])
        var opened: [WatchFocus.Entry] = []
        let done = await glass.act(token) { opened.append($0) }
        XCTAssertEqual(done["caption"] as? String, "Done. Bobby tells you when it happens.")
        XCTAssertEqual(done["sub"] as? String, "NVDA · closes 5% lower · until November 21")
        XCTAssertEqual(done["cta"] as? String, "See watches")
        XCTAssertEqual(script.asked.last??["symbol"] as? String, "NVDA")
        XCTAssertEqual(script.asked.last??["direction"] as? String, "falls")
        XCTAssertTrue(opened.isEmpty)
        // The same button twice starts nothing more.
        let again = await glass.act(token) { opened.append($0) }
        XCTAssertEqual(again["status"] as? String, "error")
        XCTAssertEqual(script.asked.count, 2)
        // "See watches" opens the list on the watch that was started, and the line stays.
        let see = done["token"] as? String ?? ""
        let stays = await glass.act(see) { opened.append($0) }
        XCTAssertEqual(opened, [WatchFocus.Entry(startedId: id)])
        XCTAssertEqual(stays["caption"] as? String, "Done. Bobby tells you when it happens.")
        glass.reset()
        let after = await glass.act(see) { opened.append($0) }
        XCTAssertEqual(after["status"] as? String, "error", "another account presses nothing of the previous one")
    }

    @MainActor func testAWatchThatCouldNotStartSaysWhy() async {
        let script = Script(); script.ok()
        let center = center(script, notifications: false)
        let glass = WatchGlass(center: { center })
        await center.refresh()
        let token = glass.offer("avísame si Bitcoin cae 10 %")?["token"] as? String ?? ""
        let refused = await glass.act(token) { _ in }
        XCTAssertEqual(refused["caption"] as? String, WatchCopy.problem(.notifications))
        XCTAssertEqual(refused["cta"] as? String, "See watches")
        XCTAssertEqual(script.asked.count, 1, "nothing is started for someone iOS will not let Bobby tell")
    }

    // MARK: the note

    func testANoteIsShownOnlyWithWhereItWasRead() throws {
        func watch(_ note: [String: Any]) -> BobbyWatch? {
            var row = Self.row("watch_fedcba9876543210fedcba9876543210", state: "met")
            var result = row["result"] as! [String: Any]; result["note"] = note; row["result"] = result
            return BobbyWatch(json: row)
        }
        let source: [String: Any] = ["title": "Nvidia cuts forecast", "url": "https://www.reuters.com/a", "host": "reuters.com"]
        let cited = try XCTUnwrap(watch(["why": "Reuters reported a lower forecast.", "found": true, "sources": [source, ["title": "x", "url": "http://insecure.example/a"], ["title": "", "url": "https://cnbc.com/b"]]])?.note)
        XCTAssertEqual(cited.why, "Reuters reported a lower forecast.")
        XCTAssertEqual(cited.sources.map(\.host), ["reuters.com"], "only an https source with a title is a source")
        XCTAssertNil(try XCTUnwrap(watch(["why": "Something happened.", "found": true, "sources": []])).note, "a reported cause with nowhere it was read is not shown")
        let nothing = try XCTUnwrap(watch(["why": "I found nothing published that clearly explains this move.", "found": false, "sources": []])?.note)
        XCTAssertFalse(nothing.found)
        XCTAssertNil(try XCTUnwrap(BobbyWatch(json: Self.row("watch_fedcba9876543210fedcba9876543210", state: "met"))).note, "a watch with no note is the watch it always was")
    }

    @MainActor func testAThesisIsReadAgainstAMetWatchOnceAndOnlyWhenThereIsOne() async {
        let id = "watch_fedcba9876543210fedcba9876543210"
        var met = Self.row(id, state: "met")
        var result = met["result"] as! [String: Any]
        result["note"] = ["why": "Reuters reported a lower forecast.", "found": true, "sources": [["title": "t", "url": "https://www.reuters.com/a", "host": "reuters.com"]]]
        met["result"] = result
        let plain = Self.row("watch_0123456789abcdef0123456789abcdef", symbol: "BTC", state: "met")
        var words: WatchThesisWords? = WatchThesisWords(hypothesis: "Margins hold", changeMind: "A forecast cut")
        let script = Script(); script.ok([met, plain])
        let center = WatchCenter(deps: .init(api: { WatchAPI(transport: script.transport, auth: .none) }, riskAccepted: { true }, signedIn: { true },
                                             allowNotifications: { true }, delivery: {}, thesis: { _ in words }))
        await center.refresh()
        await center.readAgainstThesis(plain["id"] as! String)
        XCTAssertEqual(script.asked.count, 1, "a watch with no note asks nothing")
        script.replies.append(BriefingsReply(json: ["version": 1, "watchId": id, "paragraph": "It touches what you wrote would change your mind."], status: 200, headers: [:]))
        await center.readAgainstThesis(id)
        XCTAssertEqual(center.thesisRead[id], "It touches what you wrote would change your mind.")
        let sent = script.asked.last ?? nil
        XCTAssertEqual(sent?["op"] as? String, "thesis")
        XCTAssertEqual(sent?["thesis"] as? [String: String], ["hypothesis": "Margins hold", "changeMind": "A forecast cut"], "the words travel as written; an empty field is not sent")
        await center.readAgainstThesis(id)
        XCTAssertEqual(script.asked.count, 2, "asked once per watch")
        center.accountChanged()
        XCTAssertTrue(center.thesisRead.isEmpty, "another account sees nothing of it")
        // No thesis on the asset: nothing leaves the phone.
        words = nil
        script.ok([met]); await center.refresh()
        await center.readAgainstThesis(id)
        XCTAssertEqual(script.asked.count, 3)
        for language in ["en", "es", "fr", "pt", "it", "de"] {
            L.select(language)
            XCTAssertFalse(WatchCopy.why.isEmpty || WatchCopy.forThesis.isEmpty)
            if language != "en" { XCTAssertNotEqual(WatchCopy.why, "What was reported", language); XCTAssertNotEqual(WatchCopy.forThesis, "For your thesis", language) }
        }
    }

    // MARK: the notification and the nudge

    func testOnlyAWatchNotificationOfTheServersShapeOpensAnything() {
        XCTAssertEqual(WatchTapIntent.watchId(from: ["screen": "watch", "watchId": "watch_0123456789abcdef0123456789abcdef"]), "watch_0123456789abcdef0123456789abcdef")
        for info: [AnyHashable: Any] in [["screen": "watch"], ["screen": "watch", "watchId": "watch_1"], ["screen": "language", "watchId": "watch_0123456789abcdef0123456789abcdef"],
                                         ["watchId": "watch_0123456789abcdef0123456789abcdef"], ["screen": "watch", "watchId": "https://example.com"]] {
            XCTAssertNil(WatchTapIntent.watchId(from: info))
        }
    }

    @MainActor func testTheGlassOffersAWatchAfterAReadAndSaysWhenOneWasMet() {
        let now = Date()
        func moment(_ symbol: String?, age: TimeInterval = 60, signedIn: Bool = true) -> NudgeMoment {
            NudgeMoment(signedIn: signedIn, now: now, lastRead: symbol.map {
                NudgeRead(requestId: "r", symbol: $0, name: $0, isEquity: true, verdict: "wait", saved: false, at: now.addingTimeInterval(-age)) }, readsThisLaunch: 1)
        }
        let empty = Self.board
        XCTAssertNil(WatchNudges.candidate(moment("NVDA"), board: nil))
        XCTAssertNil(WatchNudges.candidate(moment("NVDA", signedIn: false), board: empty))
        XCTAssertNil(WatchNudges.candidate(moment("DOGE"), board: empty))
        XCTAssertNil(WatchNudges.candidate(moment("NVDA", age: 3600), board: empty))
        let offer = WatchNudges.candidate(moment("NVDA"), board: empty)
        XCTAssertEqual(offer?.id, "watch.offer.nvda")
        XCTAssertEqual(WatchNudges.entry(offer!, moment: moment("NVDA"), board: empty).draft, WatchDraft(symbol: "NVDA", name: "NVIDIA", direction: .falls, percent: 5, days: 7))
        // Already watched: no second offer. A met watch nobody opened speaks first.
        let watching = WatchBoard(json: Self.body([Self.row("watch_0123456789abcdef0123456789abcdef")]))!
        XCTAssertNil(WatchNudges.candidate(moment("NVDA"), board: watching))
        let metId = "watch_fedcba9876543210fedcba9876543210"
        let met = WatchBoard(json: Self.body([Self.row(metId, symbol: "BTC", state: "met")]))!
        let line = WatchNudges.candidate(moment("NVDA"), board: met)
        XCTAssertEqual(line?.id, "watch.met.ba9876543210")
        XCTAssertEqual(WatchNudges.entry(line!, moment: moment("NVDA"), board: met).openId, metId)
        XCTAssertNil(WatchNudges.candidate(moment(nil), board: WatchBoard(json: Self.body([Self.row(metId, state: "met", seen: true)]))!))
        for language in ["en", "es", "fr", "pt", "it", "de"] {
            L.select(language)
            for text in [WatchCopy.offerLine("GOOGL"), WatchCopy.metLine("GOOGL")] {
                XCTAssertLessThanOrEqual(text.count, NucleoNudge.textLimit, "\(language): \(text)")
                XCTAssertTrue(text.contains("GOOGL") && !text.contains("{"), "\(language): \(text)")
            }
            for cta in [WatchCopy.entry, WatchCopy.metButton, WatchCopy.see, WatchCopy.retry] { XCTAssertLessThanOrEqual(cta.count, NucleoNudge.ctaLimit, "\(language): \(cta)") }
            let draft = WatchDraft(symbol: "NVDA", name: "NVIDIA", direction: .falls, percent: 5, days: 7)
            XCTAssertTrue(WatchCopy.proposal(draft).contains("NVIDIA") && WatchCopy.proposal(draft).contains("5"), language)
            XCTAssertFalse(WatchCopy.done.isEmpty || WatchCopy.row.isEmpty || WatchCopy.rowDetail.isEmpty)
        }
    }
}
