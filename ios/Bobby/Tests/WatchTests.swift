// Watches (V19/Watches): what the phone reads from /api/agent-watch, what it sends, what it shows
// when something goes wrong, and its own words in six languages. No network: every answer is scripted.
import XCTest
@testable import Bobby

final class WatchTests: XCTestCase {
    private var previousSelection: String?

    override func setUp() {
        super.setUp()
        previousSelection = UserDefaults.standard.string(forKey: L.preferenceKey)
    }
    override func tearDown() {
        if let previousSelection { UserDefaults.standard.set(previousSelection, forKey: L.preferenceKey) }
        else { UserDefaults.standard.removeObject(forKey: L.preferenceKey) }
        super.tearDown()
    }

    // MARK: fixtures

    private static let activeId = "watch_0123456789abcdef0123456789abcdef"
    private static let metId = "watch_fedcba9876543210fedcba9876543210"
    private static func row(_ id: String, state: String = "active", seen: Bool = false, extra: [String: Any] = [:]) -> [String: Any] {
        var row: [String: Any] = ["id": id, "symbol": "NVDA", "name": "NVIDIA", "direction": "falls", "percent": 5, "days": 7, "state": state,
                                  "label": "NVIDIA · closes 5% lower · until November 14", "seen": seen]
        for (key, value) in extra { row[key] = value }
        return row
    }
    private static func body(_ rows: [[String: Any]], limit: Int = 3) -> [String: Any] {
        ["version": 1, "watches": rows, "limit": limit, "active": rows.filter { $0["state"] as? String == "active" }.count,
         "options": ["symbols": ["BTC", "NVDA"], "directions": ["falls", "rises", "moves"], "percents": [3, 5, 10], "days": [7, 30]]]
    }
    private static let met = row(metId, state: "met", extra: ["result": ["gist": "NVIDIA: -6.2% from the close I started watching at.",
                                                                            "text": "NVIDIA: -6.2% from the close I started watching at. Close of November 12 against the close of November 6."]])

    /// A transport that answers from a script and records what was asked.
    private final class Script: @unchecked Sendable {
        var replies: [BriefingsReply] = []
        var asked: [(path: String, method: String, body: [String: Any]?)] = []
        var transport: BriefingsTransport {
            BriefingsTransport(json: { [self] path, method, body, _, _ in
                asked.append((path, method, body))
                guard !replies.isEmpty else { throw CancellationError() }
                return replies.removeFirst()
            }, bytes: { _ in .unavailable })
        }
        func ok(_ rows: [[String: Any]], status: Int = 200, limit: Int = 3) { replies.append(BriefingsReply(json: WatchTests.body(rows, limit: limit), status: status, headers: [:])) }
        func fail(_ status: Int, code: String? = nil) {
            replies.append(BriefingsReply(json: code.map { ["version": 1, "error": ["code": $0]] } ?? ["error": "Not found"], status: status, headers: [:]))
        }
    }
    @MainActor private func center(_ script: Script, risk: Bool = true, signedIn: Bool = true, notifications: @escaping () async -> Bool = { true }) -> WatchCenter {
        WatchCenter(deps: .init(api: { WatchAPI(transport: script.transport, auth: .none) }, riskAccepted: { risk }, signedIn: { signedIn }, allowNotifications: notifications))
    }

    // MARK: reading

    @MainActor func testABoardIsReadAsTheServerToldIt() throws {
        let board = try XCTUnwrap(WatchBoard(json: Self.body([Self.row(Self.activeId), Self.met, Self.row("watch_00000000000000000000000000000001", state: "expired", extra: ["notice": "It did not happen: NVIDIA."])])))
        XCTAssertEqual(board.active.map(\.id), [Self.activeId])
        XCTAssertEqual(board.ended.map(\.state), [.met, .expired])
        XCTAssertEqual(board.unseen, 1)
        XCTAssertTrue(board.hasRoom)
        XCTAssertTrue(board.canWatch("nvda"))
        XCTAssertFalse(board.canWatch("DOGE"))
        XCTAssertEqual([board.percents, board.days], [[3, 5, 10], [7, 30]])
        XCTAssertEqual(board.ended[0].ending, "NVIDIA: -6.2% from the close I started watching at.")
        XCTAssertEqual(board.ended[1].ending, "It did not happen: NVIDIA.")
        XCTAssertEqual(board.watches[0].label, "NVIDIA · closes 5% lower · until November 14")
    }

    @MainActor func testAListWithARowThePhoneCannotReadIsNotShownAtAll() {
        XCTAssertNil(WatchBoard(json: Self.body([Self.row(Self.activeId), ["id": "watch_x", "state": "weird"]])))
        XCTAssertNil(WatchBoard(json: ["watches": []]))
        XCTAssertNil(WatchBoard(json: nil))
        XCTAssertNil(BobbyWatch(json: Self.row("task_0123", state: "active")))
    }

    @MainActor func testAFullBoardHasNoRoom() throws {
        let rows = (1...3).map { Self.row("watch_0000000000000000000000000000000\($0)") }
        XCTAssertFalse(try XCTUnwrap(WatchBoard(json: Self.body(rows))).hasRoom)
        XCTAssertTrue(try XCTUnwrap(WatchBoard(json: Self.body(rows, limit: 10))).hasRoom)
    }

    @MainActor func testFailuresMapByStatusAndCodeNeverByText() {
        XCTAssertEqual(WatchAPI.error(status: 404, json: ["error": "Not found"]), .notOffered)
        XCTAssertEqual(WatchAPI.error(status: 404, json: ["error": ["code": "not_found"]]), .unavailable)
        XCTAssertEqual(WatchAPI.error(status: 401, json: ["error": ["code": "signin_required"]]), .signInRequired)
        XCTAssertEqual(WatchAPI.error(status: 409, json: ["error": ["code": "watch_limit"]]), .limit)
        XCTAssertEqual(WatchAPI.error(status: 409, json: ["error": ["code": "request_id_reused"]]), .unavailable)
        XCTAssertEqual(WatchAPI.error(status: 503, json: ["error": ["code": "watch_unreadable"]]), .unreadable)
        XCTAssertEqual(WatchAPI.error(status: 503, json: ["error": ["code": "watch_storage_unavailable"]]), .unavailable)
        XCTAssertEqual(WatchAPI.error(status: 429, json: nil), .rateLimited)
    }

    // MARK: the center

    @MainActor func testStartingAWatchSendsTheChoiceAndShowsTheList() async {
        let script = Script()
        script.ok([Self.row(Self.activeId)], status: 201)
        let center = center(script)
        let started = await center.start(symbol: "nvda", direction: .falls, percent: 5, days: 7)
        XCTAssertTrue(started)
        XCTAssertEqual(center.board?.active.count, 1)
        XCTAssertNil(center.problem)
        let sent = script.asked[0]
        XCTAssertEqual([sent.path, sent.method], ["api/agent-watch", "POST"])
        XCTAssertEqual(sent.body?["op"] as? String, "create")
        XCTAssertEqual(sent.body?["symbol"] as? String, "NVDA")
        XCTAssertEqual(sent.body?["direction"] as? String, "falls")
        XCTAssertEqual([sent.body?["percent"] as? Int, sent.body?["days"] as? Int], [5, 7])
        XCTAssertNotNil(UUID(uuidString: sent.body?["requestId"] as? String ?? ""))
        XCTAssertNil(sent.body?["identity"], "the phone never names an account")
    }

    @MainActor func testARetryOfTheSameChoiceCarriesTheSameRequestId() async {
        let script = Script()
        let center = center(script)   // no reply scripted: the first attempt fails in the transport
        let first = await center.start(symbol: "NVDA", direction: .falls, percent: 5, days: 7)
        XCTAssertFalse(first)
        XCTAssertEqual(center.problem, .unavailable)
        script.ok([Self.row(Self.activeId)], status: 200)
        let second = await center.start(symbol: "NVDA", direction: .falls, percent: 5, days: 7)
        XCTAssertTrue(second)
        XCTAssertEqual(script.asked[0].body?["requestId"] as? String, script.asked[1].body?["requestId"] as? String)
        script.ok([Self.row(Self.activeId)], status: 201)
        _ = await center.start(symbol: "NVDA", direction: .falls, percent: 5, days: 7)
        XCTAssertNotEqual(script.asked[1].body?["requestId"] as? String, script.asked[2].body?["requestId"] as? String, "a choice that was answered is over: the next one is a new request")
    }

    @MainActor func testNothingIsAskedWithoutTheRiskNoticeAnAccountOrNotifications() async {
        let script = Script()
        let unread = center(script, risk: false)
        await unread.refresh()
        let refused = await unread.start(symbol: "NVDA", direction: .falls, percent: 5, days: 7)
        XCTAssertFalse(refused)
        let signedOut = center(script, signedIn: false)
        await signedOut.refresh()
        let anonymous = await signedOut.start(symbol: "NVDA", direction: .falls, percent: 5, days: 7)
        XCTAssertFalse(anonymous)
        XCTAssertEqual(signedOut.problem, .signIn)
        var prompted = 0
        let silenced = center(script, notifications: { prompted += 1; return false })
        await silenced.refresh()
        XCTAssertEqual(prompted, 0, "a refresh never asks iOS for anything")
        script.asked.removeAll()
        let muted = await silenced.start(symbol: "NVDA", direction: .falls, percent: 5, days: 7)
        XCTAssertFalse(muted)
        XCTAssertEqual(prompted, 1)
        XCTAssertEqual(silenced.problem, .notifications)
        XCTAssertTrue(script.asked.isEmpty, "a watch is never started for someone iOS will not let Bobby tell")
    }

    @MainActor func testADoorThatIsNotThereHidesTheFeature() async {
        let script = Script()
        script.fail(404)
        let center = center(script)
        await center.refresh()
        XCTAssertFalse(center.offered)
        XCTAssertNil(center.board)
        XCTAssertNil(center.problem, "nothing is said about a feature the person was never shown")
        await center.refresh()
        XCTAssertEqual(script.asked.count, 1, "and it is not asked again")
        center.accountChanged()
        XCTAssertTrue(center.offered, "another account is asked afresh")
    }

    @MainActor func testTheLimitAndAnUnreadableAssetAreSaidPlainly() async {
        let script = Script()
        let rows = (1...3).map { Self.row("watch_0000000000000000000000000000000\($0)") }
        script.ok(rows)
        let center = center(script)
        await center.refresh()
        let full = await center.start(symbol: "BTC", direction: .rises, percent: 10, days: 30)
        XCTAssertFalse(full)
        XCTAssertEqual(center.problem, .limit(3))
        XCTAssertEqual(script.asked.count, 1, "a full board is refused on the phone, before any request")
        let other = Script()
        other.fail(503, code: "watch_unreadable")
        let second = self.center(other)
        _ = await second.start(symbol: "BTC", direction: .rises, percent: 10, days: 30)
        XCTAssertEqual(second.problem, .unreadable)
    }

    @MainActor func testStoppingAndOpening() async {
        let script = Script()
        script.ok([Self.row(Self.activeId), Self.met])
        let center = center(script)
        await center.refresh()
        script.ok([Self.met])
        await center.stop(Self.activeId)
        XCTAssertEqual(script.asked[1].body?["op"] as? String, "cancel")
        XCTAssertEqual(script.asked[1].body?["watchId"] as? String, Self.activeId)
        XCTAssertEqual(center.board?.active.count, 0)
        var seen = Self.met; seen["seen"] = true
        script.ok([seen])
        await center.opened(Self.metId)
        XCTAssertEqual(script.asked[2].body?["op"] as? String, "seen")
        XCTAssertEqual(center.board?.unseen, 0)
        await center.opened(Self.metId)
        XCTAssertEqual(script.asked.count, 3, "an opened watch is not marked again")
    }

    @MainActor func testAnAnswerForThePreviousAccountIsDropped() async {
        let script = Script()
        var release: CheckedContinuation<Void, Never>?
        let center = WatchCenter(deps: .init(api: { WatchAPI(transport: BriefingsTransport(json: { _, _, _, _, _ in
            await withCheckedContinuation { release = $0 }
            return BriefingsReply(json: WatchTests.body([WatchTests.row(WatchTests.activeId)]), status: 200, headers: [:])
        }, bytes: { _ in .unavailable }), auth: .none) }, riskAccepted: { true }, signedIn: { true }, allowNotifications: { true }))
        _ = script
        let asking = Task { await center.refresh() }
        while release == nil { await Task.yield() }
        center.accountChanged()
        release?.resume()
        await asking.value
        XCTAssertNil(center.board, "what arrives late for another account is never shown")
    }

    // MARK: the words

    @MainActor func testEveryWordOfTheScreenExistsInSixLanguages() throws {
        let rows = NativeTranslations18.watches
        XCTAssertFalse(rows.isEmpty)
        for (key, translations) in rows {
            XCTAssertEqual(Set(translations.keys), ["fr", "pt", "it", "de"], key)
            for (language, text) in translations {
                XCTAssertFalse(text.isEmpty, "\(key) \(language)")
                for mark in ["{0}", "{1}"] { XCTAssertEqual(key.contains(mark), text.contains(mark), "\(key) \(language) \(mark)") }
            }
        }
        let problems: [WatchCenter.Problem] = [.signIn, .notifications, .limit(3), .unreadable, .unavailable]
        var seen: [String: Set<String>] = [:]
        for language in ["en", "es", "fr", "pt", "it", "de"] {
            L.select(language)
            let said = [WatchCopy.title, WatchCopy.subtitle, WatchCopy.entry, WatchCopy.atClose, WatchCopy.empty, WatchCopy.stop,
                        WatchCopy.start("NVIDIA"), WatchCopy.count(2, 3), WatchCopy.days(7)]
                + WatchDirection.allCases.map(WatchCopy.direction) + problems.map(WatchCopy.problem)
            for text in said {
                XCTAssertFalse(text.isEmpty || text.contains("{") || text.contains("\\("), "\(language): \(text)")
                XCTAssertLessThanOrEqual(text.count, 90, "\(language): the screen's own lines stay short: \(text)")
            }
            XCTAssertTrue(WatchCopy.start("NVIDIA").contains("NVIDIA") && WatchCopy.count(2, 3).contains("2") && WatchCopy.problem(.limit(3)).contains("3"), language)
            XCTAssertTrue(WatchCopy.percent(5).contains("5") && WatchCopy.percent(5).contains("%"), language)
            seen[language] = Set(said)
        }
        for language in ["es", "fr", "pt", "it", "de"] {
            XCTAssertTrue(seen[language]!.isDisjoint(with: seen["en"]!), "\(language) shows no English line: \(seen[language]!.intersection(seen["en"]!))")
        }
    }
}
