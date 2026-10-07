import Foundation
import XCTest
@testable import Bobby

/// Reviewing a thesis (1.8). Every desk request here is an injected stub: no network, no account,
/// no read is spent. These pin the promises of a review: it carries the person's words and their
/// level, it is recorded only when an answer was delivered, a refusal says what happens next and
/// records nothing, and a reply for an account that is gone is dropped.
@MainActor
final class ThesisReviewerTests: XCTestCase {
    private final class Identity {
        var user: String? = "account-a"
        var generation = UUID()
        var riskAccepted = true
        var level: NucleoAnalysisLevel = .profundo
    }

    /// A desk request the test completes by hand. Main-actor bound, so "started" and "completed" cannot race.
    @MainActor private final class Deferred {
        private var reply: CheckedContinuation<NucleoDeskIO.DebateOutcome, Never>?
        private var started: CheckedContinuation<Void, Never>?
        private var isStarted = false
        func wait() async -> NucleoDeskIO.DebateOutcome {
            await withCheckedContinuation {
                reply = $0
                isStarted = true
                started?.resume(); started = nil
            }
        }
        func waitForStart() async {
            if isStarted { return }
            await withCheckedContinuation { started = $0 }
        }
        func complete(_ value: NucleoDeskIO.DebateOutcome) { reply?.resume(returning: value); reply = nil }
    }

    private var suiteName = ""
    private var defaults: UserDefaults!
    private var book: ThesisBook!
    private var identity: Identity!
    private var requests: [ThesisReviewRequest] = []
    private var access: [BobbyReadAccess] = []
    private var meters: [NucleoAnalysisLevel] = []
    private var decided: [(id: String, decision: String)] = []
    private var observers: [NSObjectProtocol] = []
    private var language: Any?
    private let t0 = Date(timeIntervalSince1970: 1_800_000_000)
    private var now: Date { t0.addingTimeInterval(9 * 86_400) }

    override func setUp() async throws {
        try await super.setUp()
        suiteName = "thesis.reviewer.tests.\(UUID().uuidString)"
        defaults = UserDefaults(suiteName: suiteName)
        book = ThesisBook(defaults: defaults)
        identity = Identity()
        requests = []; access = []; meters = []; decided = []
        language = UserDefaults.standard.object(forKey: L.preferenceKey)
        UserDefaults.standard.set("en", forKey: L.preferenceKey)
        observers = [NotificationCenter.default.addObserver(forName: ThesisEvents.reviewed, object: nil, queue: nil) { [weak self] note in
            XCTAssertTrue(Thread.isMainThread)
            let id = note.userInfo?[ThesisEvents.idKey] as? String ?? ""
            let decision = note.userInfo?[ThesisEvents.decisionKey] as? String ?? ""
            MainActor.assumeIsolated { self?.decided.append((id, decision)) }
        }]
    }

    override func tearDown() async throws {
        observers.forEach(NotificationCenter.default.removeObserver)
        observers = []
        if let language { UserDefaults.standard.set(language, forKey: L.preferenceKey) } else { UserDefaults.standard.removeObject(forKey: L.preferenceKey) }
        defaults.removePersistentDomain(forName: suiteName)
        try await super.tearDown()
    }

    // MARK: Fixtures

    @discardableResult
    private func seed(_ symbol: String = "NVDA", owner: String? = "account-a", isEquity: Bool = true, price: Double? = 100) throws -> SavedThesis {
        try book.create(ThesisDraft(symbol: symbol, name: symbol, isEquity: isEquity, horizon: .months, hypothesis: "Margins recover as supply eases",
                                    worry: "Demand slows", changeMind: "Two weak quarters", sourceRequestId: "read-1", price: price,
                                    asOf: "2026-10-07T12:00:00Z", verdict: "wait"), owner: owner, now: t0)
    }

    private func reviewer(_ thesisId: String?, send: @escaping ThesisReviewer.Send) -> ThesisReviewer {
        let identity = identity!
        var env = ThesisReviewer.Environment()
        env.book = book
        env.owner = { identity.user }
        env.generation = { identity.generation }
        env.riskAccepted = { identity.riskAccepted }
        env.level = { identity.level }
        env.now = { [unowned self] in self.now }
        env.requestId = { "11111111-2222-4333-8444-555555555555" }
        env.send = { [unowned self] request in
            self.requests.append(request)
            return await send(request)
        }
        env.accessChanged = { [unowned self] in self.access.append($0) }
        env.meterChanged = { [unowned self] level, _ in self.meters.append(level) }
        return ThesisReviewer(thesisId: thesisId, environment: env, observeAccount: false)
    }

    private func reply(_ extra: [String: Any] = [:], verdict: String = "review", price: Any = 108.9) -> NucleoDeskIO.DebateOutcome {
        var body: [String: Any] = [
            "symbol": "NVDA",
            "technicals": ["price": price, "rsi14": 55.0],
            "provenance": ["provider": "Yahoo Finance", "asOf": "2026-10-16T14:30:00Z"],
            "agents": ["alpha": "Alpha says", "red": "Red says", "cio": "CIO says", "verdict": verdict, "direction": "none",
                       "synthesis": ["headline": "Price evidence still leans your way.", "why": "w", "risk": "r", "watch": "x"]],
            "access": ["tier": "free", "used": 4, "limit": 10, "remaining": 6, "resetsAt": NSNull(), "paywall": true, "bonus": 0],
        ]
        body.merge(extra) { _, new in new }
        return NucleoDeskIO.parseDebate(status: 200, json: body, headers: [:])
    }

    private func refusal(_ status: Int, _ body: [String: Any], headers: [String: String] = [:]) -> NucleoDeskIO.DebateOutcome {
        NucleoDeskIO.parseDebate(status: status, json: body, headers: headers)
    }

    private func result(_ reviewer: ThesisReviewer, file: StaticString = #filePath, line: UInt = #line) -> ThesisReviewResult? {
        guard case let .done(result) = reviewer.phase else {
            XCTFail("expected a finished review, got \(reviewer.phase)", file: file, line: line)
            return nil
        }
        return result
    }

    // MARK: A delivered review

    func testAReviewCarriesThePersonsWordsTheirLevelAndTheFixedQuestion() async throws {
        let thesis = try seed()
        let reviewer = reviewer(thesis.id) { [unowned self] _ in self.reply() }
        XCTAssertEqual(reviewer.phase, .ready)
        XCTAssertEqual(reviewer.currentLevel, .profundo)
        await reviewer.review()
        XCTAssertEqual(requests.count, 1, "one review is one desk read")
        let request = try XCTUnwrap(requests.first)
        XCTAssertEqual(request.symbol, "NVDA")
        XCTAssertTrue(request.isEquity)
        XCTAssertEqual(request.level, .profundo, "the level the person picked")
        XCTAssertEqual(request.requestId, "11111111-2222-4333-8444-555555555555")
        XCTAssertEqual(request.question, "Review my thesis on NVDA: what does the latest evidence support, what does it challenge, and what is still unknown?")
        XCTAssertEqual(request.thesis, ThesisContext(thesis))
        XCTAssertEqual(request.thesis.json["hypothesis"] as? String, "Margins recover as supply eases")
        XCTAssertEqual(request.thesis.json["worry"] as? String, "Demand slows")
        XCTAssertEqual(request.thesis.json["changeMind"] as? String, "Two weak quarters")
        XCTAssertEqual(request.thesis.json["horizon"] as? String, "months")
        XCTAssertEqual(request.thesis.json["priceAtSave"] as? Double, 100)
    }

    func testTheDefaultRequestIdIsAFreshUUIDTheServerAccepts() {
        let first = ThesisReviewer.Environment().requestId(), second = ThesisReviewer.Environment().requestId()
        XCTAssertNotEqual(first, second)
        XCTAssertNotNil(first.range(of: NucleoDesk.uuidPattern, options: .regularExpression))
    }

    func testADeliveredReviewIsRecordedWithItsDatedEvidenceAndTheThreeLists() async throws {
        let thesis = try seed()
        let review: [String: Any] = ["supports": ["Above the 50-day average"], "challenges": ["Momentum cooled"],
                                     "unknowns": ["Next earnings"], "notChecked": ["earnings", "news"]]
        let reviewer = reviewer(thesis.id) { [unowned self] _ in self.reply(["review": review]) }
        await reviewer.review()
        let result = try XCTUnwrap(result(reviewer))
        XCTAssertEqual(result.verdict, "review")
        XCTAssertEqual(result.headline, "Price evidence still leans your way.")
        XCTAssertEqual(result.notes, ThesisReviewNotes(supports: ["Above the 50-day average"], challenges: ["Momentum cooled"],
                                                       unknowns: ["Next earnings"], notChecked: ["earnings", "news"]))
        XCTAssertEqual(result.notChecked, ["news", "earnings"], "the server's codes, in the app's fixed order")
        XCTAssertEqual(result.level, .profundo)
        XCTAssertEqual(result.thenNow.thenPrice, 100)
        XCTAssertEqual(result.thenNow.thenDate, t0)
        XCTAssertEqual(result.thenNow.nowPrice, 108.9)
        XCTAssertEqual(result.thenNow.asOf, "2026-10-16T14:30:00Z")
        XCTAssertEqual(try XCTUnwrap(result.thenNow.changePct), 8.9, accuracy: 0.0001)

        let stored = try XCTUnwrap(book.thesis(id: thesis.id, owner: "account-a"))
        XCTAssertEqual(stored, result.thesis)
        XCTAssertEqual(stored.lastReviewedAt, now)
        XCTAssertEqual(stored.revisions.map(\.kind), [.created, .reviewed])
        let entry = try XCTUnwrap(stored.lastReview)
        XCTAssertEqual(entry.price, 108.9)
        XCTAssertEqual(entry.asOf, "2026-10-16T14:30:00Z")
        XCTAssertEqual(entry.verdict, "review")
        XCTAssertEqual(entry.supports, ["Above the 50-day average"])
        XCTAssertEqual(entry.challenges, ["Momentum cooled"])
        XCTAssertEqual(entry.unknowns, ["Next earnings"])
        XCTAssertEqual(reviewer.thesis, stored)
        XCTAssertEqual(access.map(\.remaining), [6], "the credits the app shows follow the server's word")
        XCTAssertEqual(meters, [.profundo])
        XCTAssertTrue(decided.isEmpty, "a review is not yet a decision")
    }

    func testAServerThatIgnoresTheThesisStillGivesARecordedReviewWithEmptyLists() async throws {
        let thesis = try seed()
        let reviewer = reviewer(thesis.id) { [unowned self] _ in self.reply(verdict: "wait") }
        await reviewer.review()
        let result = try XCTUnwrap(result(reviewer))
        XCTAssertNil(result.notes, "the lists are unavailable, never invented")
        XCTAssertEqual(result.verdict, "wait")
        XCTAssertEqual(result.headline, "Price evidence still leans your way.")
        XCTAssertEqual(result.notChecked, ["news", "earnings", "filings", "fundamentals", "macro"], "the whole fixed list")
        let entry = try XCTUnwrap(book.thesis(id: thesis.id, owner: "account-a")?.lastReview)
        XCTAssertEqual(entry.kind, .reviewed)
        XCTAssertEqual([entry.supports, entry.challenges, entry.unknowns], [[], [], []])
        XCTAssertEqual(entry.price, 108.9)
        XCTAssertEqual(entry.verdict, "wait")
    }

    func testAReviewObjectWithNoKnownGapsStillShowsTheWholeFixedList() async throws {
        let thesis = try seed("BTC", isEquity: false)
        let reviewer = reviewer(thesis.id) { [unowned self] _ in
            self.reply(["review": ["supports": ["Holding the weekly trend"], "challenges": [], "unknowns": [], "notChecked": ["the moon"]]])
        }
        await reviewer.review()
        let result = try XCTUnwrap(result(reviewer))
        XCTAssertEqual(result.notes?.supports, ["Holding the weekly trend"])
        XCTAssertEqual(result.notChecked, ["news", "fundamentals", "macro"], "a crypto asset has no earnings or filings to list")
        XCTAssertFalse(requests[0].isEquity)
    }

    func testAnEvidencePriceTheAppCannotUseLeavesTheChangeOut() async throws {
        let thesis = try seed()
        let reviewer = reviewer(thesis.id) { [unowned self] _ in self.reply(price: NSNull()) }
        await reviewer.review()
        let result = try XCTUnwrap(result(reviewer))
        XCTAssertNil(result.thenNow.nowPrice)
        XCTAssertNil(result.thenNow.changePct, "no number is shown in place of a missing price")
        XCTAssertEqual(result.thenNow.thenPrice, 100)
        XCTAssertNil(book.thesis(id: thesis.id, owner: "account-a")?.lastReview?.price)
    }

    func testReviewWithQuickRunsThisOneReviewAtQuickAndLeavesThePickAlone() async throws {
        let thesis = try seed()
        let reviewer = reviewer(thesis.id) { [unowned self] _ in self.reply() }
        await reviewer.review(level: .rapido)
        XCTAssertEqual(requests.map(\.level), [.rapido])
        XCTAssertEqual(identity.level, .profundo)
        XCTAssertEqual(reviewer.currentLevel, .profundo)
        XCTAssertEqual(try XCTUnwrap(result(reviewer)).level, .rapido)
        XCTAssertTrue(meters.isEmpty, "Quick has no premium meter to refresh")
    }

    // MARK: Before anything is sent

    func testNothingIsSentBeforeTheRiskNoticeIsAccepted() async throws {
        let thesis = try seed()
        identity.riskAccepted = false
        let reviewer = reviewer(thesis.id) { [unowned self] _ in self.reply() }
        XCTAssertEqual(reviewer.phase, .refused(.riskNotice))
        await reviewer.review()
        XCTAssertTrue(requests.isEmpty)
        XCTAssertEqual(reviewer.phase, .refused(.riskNotice))
        XCTAssertNil(book.thesis(id: thesis.id, owner: "account-a")?.lastReviewedAt)
        identity.riskAccepted = true
        reviewer.reload()
        XCTAssertEqual(reviewer.phase, .ready, "once accepted the review is offered again")
    }

    func testAMissingAnArchivedOrAnotherAccountsThesisIsNeverSent() async throws {
        let thesis = try seed()
        let other = try seed("BTC", owner: "account-b")
        try book.archive(id: thesis.id, owner: "account-a", now: t0)
        for (id, expected) in [(thesis.id, ThesisReviewer.Refusal.archived), (other.id, .notFound), ("no-such-thesis", .notFound)] {
            let reviewer = reviewer(id) { [unowned self] _ in self.reply() }
            XCTAssertEqual(reviewer.phase, .refused(expected), id)
            await reviewer.review()
            XCTAssertEqual(reviewer.phase, .refused(expected), id)
        }
        let none = reviewer(nil) { [unowned self] _ in self.reply() }
        await none.review()
        XCTAssertEqual(none.phase, .refused(.notFound))
        XCTAssertTrue(requests.isEmpty)
        XCTAssertNil(book.thesis(id: other.id, owner: "account-b")?.lastReviewedAt)
    }

    // MARK: Refusals record nothing

    func testEveryRefusalSaysWhatHappenedAndRecordsNothing() async throws {
        let thesis = try seed()
        let freeAccess: [String: Any] = ["tier": "free", "used": 10, "limit": 10, "remaining": 0, "resetsAt": "2026-10-20T00:00:00Z", "paywall": true]
        let meter: [String: Any] = ["used": 3, "limit": 3, "remaining": 0, "resetsAt": "2026-10-21T00:00:00Z"]
        let resets = BobbyAccessAPI.date("2026-10-20T00:00:00Z"), levelResets = BobbyAccessAPI.date("2026-10-21T00:00:00Z")
        let cases: [(name: String, outcome: NucleoDeskIO.DebateOutcome, expected: ThesisReviewer.Phase)] = [
            ("401", refusal(401, ["code": "signin_required", "error": "x"]), .refused(.signIn(level: nil))),
            ("402", refusal(402, ["code": "subscription_required", "access": freeAccess]), .refused(.subscription(resets: resets))),
            ("402 without a date", refusal(402, ["code": "subscription_required"]), .refused(.subscription(resets: nil))),
            ("403 sign in", refusal(403, ["code": "signin_required", "meter": meter]), .refused(.signIn(level: .profundo))),
            ("403 upgrade", refusal(403, ["code": "upgrade_required", "meter": meter]), .refused(.levelUsed(level: .profundo, resets: levelResets))),
            ("403 exhausted", refusal(403, ["code": "level_exhausted"]), .refused(.levelUsed(level: .profundo, resets: nil))),
            ("503 premium paused", refusal(503, ["code": "budget_paused", "level": "profundo", "quickAvailable": true]), .refused(.paused(level: .profundo, quickWorks: true))),
            ("503 all paused", refusal(503, ["code": "budget_paused", "level": "profundo", "quickAvailable": false]), .refused(.paused(level: .profundo, quickWorks: false))),
            ("429", refusal(429, ["code": "daily_limit"], headers: ["retry-after": "3600"]), .refused(.quota)),
            ("503 failed", refusal(503, ["code": "analysis_failed"]), .refused(.failed)),
            ("503 unavailable", refusal(503, ["code": "desk_unavailable"]), .refused(.failed)),
            ("400 too long", refusal(400, ["code": "question_too_long"]), .refused(.failed)),
            ("timeout", .timeout, .refused(.uncertain)),
            ("network", .network, .refused(.uncertain)),
            ("200 without agents", refusal(200, ["symbol": "NVDA"]), .refused(.unreadable)),
            ("500", refusal(500, [:]), .refused(.unreadable)),
            ("cancelled", .cancelled, .ready),
        ]
        for item in cases {
            let reviewer = reviewer(thesis.id) { _ in item.outcome }
            await reviewer.review()
            XCTAssertEqual(reviewer.phase, item.expected, item.name)
            let stored = try XCTUnwrap(book.thesis(id: thesis.id, owner: "account-a"))
            XCTAssertEqual(stored, thesis, "\(item.name): nothing is recorded")
            XCTAssertNil(stored.lastReviewedAt, item.name)
        }
        XCTAssertEqual(requests.count, cases.count)
        XCTAssertEqual(access.count, 1, "a refusal that carries the access object still updates the credits shown")
        XCTAssertTrue(decided.isEmpty)
    }

    func testARefusalCanBeTriedAgainAndThenRecordsTheReview() async throws {
        let thesis = try seed()
        var answers: [NucleoDeskIO.DebateOutcome] = [.timeout, reply()]
        let reviewer = reviewer(thesis.id) { _ in answers.removeFirst() }
        await reviewer.review()
        XCTAssertEqual(reviewer.phase, .refused(.uncertain))
        await reviewer.review()
        XCTAssertNotNil(result(reviewer))
        XCTAssertEqual(book.thesis(id: thesis.id, owner: "account-a")?.revisions.map(\.kind), [.created, .reviewed])
    }

    func testEachRefusalOffersTheRightNextStepAndOnlyAFailedAnalysisSaysNothingWasUsed() {
        typealias Copy = ThesisRefusalCopy
        XCTAssertEqual(Copy(.signIn(level: nil)).actions, [.signIn])
        XCTAssertEqual(Copy(.signIn(level: .profundo)).actions, [.signIn, .quick], "a premium level a guest cannot use: sign in, or review with Quick")
        XCTAssertTrue(Copy(.signIn(level: .profundo)).text.contains("Deep"))
        let day = Date(timeIntervalSince1970: 1_800_000_000)
        XCTAssertEqual(Copy(.subscription(resets: day)).actions, [.pro])
        XCTAssertEqual(Copy(.subscription(resets: day)).detail, "Free reads come back on \(BobbyAccessAPI.day(day)).")
        XCTAssertNil(Copy(.subscription(resets: nil)).detail, "no date from the server, no date on screen")
        XCTAssertEqual(Copy(.levelUsed(level: .maximo, resets: day)).actions, [.quick])
        XCTAssertTrue(Copy(.levelUsed(level: .maximo, resets: day)).text.contains(BobbyAccessAPI.day(day)))
        XCTAssertEqual(Copy(.levelUsed(level: .maximo, resets: nil)).text, "You used your Max for now.")
        XCTAssertEqual(Copy(.paused(level: .profundo, quickWorks: true)).actions, [.quick])
        XCTAssertTrue(Copy(.paused(level: .rapido, quickWorks: false)).actions.isEmpty, "nothing to try while every level is paused")
        XCTAssertTrue(Copy(.quota).actions.isEmpty)
        XCTAssertEqual(Copy(.failed).text, "The review did not finish. Nothing was used.")
        XCTAssertEqual(Copy(.failed).actions, [.retry])
        XCTAssertEqual(Copy(.uncertain).detail, "It may not have counted; check your credits.")
        XCTAssertEqual(Copy(.uncertain).actions, [.retry, .credits])
        XCTAssertEqual(Copy(.unreadable).actions, [.retry, .credits])
        XCTAssertEqual(Copy(.notFound).actions, [.myTheses])
        XCTAssertEqual(Copy(.archived).actions, [.myTheses])
        XCTAssertTrue(Copy(.riskNotice).actions.isEmpty)
        let all: [ThesisReviewer.Refusal] = [.riskNotice, .notFound, .archived, .signIn(level: nil), .signIn(level: .maximo), .subscription(resets: day),
                                             .levelUsed(level: .profundo, resets: nil), .paused(level: .maximo, quickWorks: true),
                                             .paused(level: .rapido, quickWorks: false), .quota, .failed, .uncertain, .unreadable]
        for refusal in all {
            let copy = Copy(refusal)
            XCTAssertFalse(copy.text.isEmpty, "\(refusal)")
            let claimsNothingUsed = (copy.text + (copy.detail ?? "")).contains("Nothing was used")
            XCTAssertEqual(claimsNothingUsed, refusal == .failed, "\(refusal): only a failure the server refunds may say nothing was used")
        }
    }

    // MARK: Fences

    func testAReplyThatArrivesAfterTheAccountChangedIsDropped() async throws {
        let thesis = try seed()
        let pending = Deferred()
        let reviewer = reviewer(thesis.id) { _ in await pending.wait() }
        let task = Task { await reviewer.review() }
        await pending.waitForStart()
        XCTAssertEqual(reviewer.phase, .running)
        identity.user = "account-b"
        identity.generation = UUID()
        pending.complete(reply(["review": ["supports": ["x"], "challenges": [], "unknowns": []]]))
        await task.value
        XCTAssertEqual(reviewer.phase, .refused(.notFound), "the new account has no such thesis")
        XCTAssertNil(reviewer.thesis)
        XCTAssertEqual(book.thesis(id: thesis.id, owner: "account-a"), thesis, "nothing is written into the previous account's book")
        XCTAssertTrue(book.all(owner: "account-b").isEmpty)
        XCTAssertTrue(access.isEmpty, "nor are that reply's credits shown to the new account")
    }

    func testAReplyIsDroppedWhenOnlyTheBooksOwnerChanged() async throws {
        let thesis = try seed()
        let pending = Deferred()
        let reviewer = reviewer(thesis.id) { _ in await pending.wait() }
        let task = Task { await reviewer.review() }
        await pending.waitForStart()
        identity.user = nil
        pending.complete(reply())
        await task.value
        XCTAssertEqual(reviewer.phase, .refused(.notFound))
        XCTAssertNil(book.thesis(id: thesis.id, owner: "account-a")?.lastReviewedAt)
    }

    func testSigningBackIntoTheSameAccountStillDropsTheOldReply() async throws {
        let thesis = try seed()
        let pending = Deferred()
        let reviewer = reviewer(thesis.id) { _ in await pending.wait() }
        let task = Task { await reviewer.review() }
        await pending.waitForStart()
        identity.generation = UUID()
        pending.complete(reply())
        await task.value
        XCTAssertEqual(reviewer.phase, .ready, "the thesis is still there and can be reviewed again")
        XCTAssertNil(book.thesis(id: thesis.id, owner: "account-a")?.lastReviewedAt)
    }

    func testClosingTheScreenCancelsTheReviewAndALateReplyRecordsNothing() async throws {
        let thesis = try seed()
        let pending = Deferred()
        let reviewer = reviewer(thesis.id) { _ in await pending.wait() }
        reviewer.start()
        await pending.waitForStart()
        XCTAssertTrue(reviewer.isRunning)
        reviewer.cancel()
        XCTAssertEqual(reviewer.phase, .ready)
        pending.complete(reply())
        await Task.yield()
        try await Task.sleep(nanoseconds: 50_000_000)
        XCTAssertEqual(reviewer.phase, .ready)
        XCTAssertEqual(book.thesis(id: thesis.id, owner: "account-a"), thesis)
        XCTAssertTrue(access.isEmpty)
    }

    func testOneReviewAtATime() async throws {
        let thesis = try seed()
        let pending = Deferred()
        let reviewer = reviewer(thesis.id) { _ in await pending.wait() }
        let first = Task { await reviewer.review() }
        await pending.waitForStart()
        await reviewer.review()
        reviewer.start()
        await Task.yield()
        XCTAssertEqual(requests.count, 1, "a second tap while one runs sends nothing")
        pending.complete(reply())
        await first.value
        XCTAssertNotNil(result(reviewer))
        XCTAssertEqual(book.thesis(id: thesis.id, owner: "account-a")?.revisions.filter { $0.kind == .reviewed }.count, 1)
    }

    func testAThesisDeletedWhileTheDeskWorkedHasNoReviewToAttach() async throws {
        let thesis = try seed()
        let pending = Deferred()
        let reviewer = reviewer(thesis.id) { _ in await pending.wait() }
        let task = Task { await reviewer.review() }
        await pending.waitForStart()
        book.delete(id: thesis.id, owner: "account-a")
        pending.complete(reply())
        await task.value
        XCTAssertEqual(reviewer.phase, .refused(.notFound))
        XCTAssertTrue(book.all(owner: "account-a").isEmpty)
    }

    func testAnAccountChangeOnTheScreenResetsItForTheNewAccount() async throws {
        let thesis = try seed()
        let reviewer = reviewer(thesis.id) { [unowned self] _ in self.reply() }
        await reviewer.review()
        XCTAssertNotNil(result(reviewer))
        identity.user = nil
        identity.generation = UUID()
        reviewer.accountChanged()
        XCTAssertEqual(reviewer.phase, .refused(.notFound), "a finished review of the previous account does not stay on screen")
    }

    func testAThesisWrittenBeforeSigningInLeadsToMyThesesAndIsNeverMovedByTheScreen() async throws {
        identity.user = nil
        let local = try seed("BTC", owner: nil)
        let reviewer = reviewer(local.id) { [unowned self] _ in self.refusal(401, ["code": "signin_required", "error": "x"]) }
        XCTAssertEqual(reviewer.phase, .ready)
        await reviewer.review()
        XCTAssertEqual(reviewer.phase, .refused(.signIn(level: nil)), "a guest out of reads is asked to sign in")
        // The person signs in on this screen. Nothing adopts the guest book by itself.
        identity.user = "account-c"
        identity.generation = UUID()
        reviewer.accountChanged()
        XCTAssertEqual(reviewer.phase, .refused(.writtenSignedOut), "not 'unavailable': the thesis waits in the guest book")
        XCTAssertNil(reviewer.thesis)
        XCTAssertTrue(book.all(owner: "account-c").isEmpty, "the review screen moves nothing")
        XCTAssertEqual(book.all(owner: nil).map(\.id), [local.id])
        let copy = ThesisRefusalCopy(.writtenSignedOut)
        XCTAssertEqual(copy.text, "You wrote this thesis before signing in.")
        XCTAssertEqual(copy.detail, "Open My theses to keep it in this account.")
        XCTAssertEqual(copy.actions, [.myTheses], "My theses holds the row that asks")
        await reviewer.review()
        XCTAssertEqual(requests.count, 1, "nothing is sent for a thesis that is not in this account's book")

        // "Keep them" in My theses: the screen picks the thesis up again.
        let guests = ThesisGuestBook(book: book)
        XCTAssertEqual(guests.adoptLocal(into: "account-c"), 1)
        reviewer.reload()
        XCTAssertEqual(reviewer.phase, .ready)
        XCTAssertEqual(reviewer.thesis?.id, local.id)

        // "Not mine" for another account: it is simply not available there.
        let other = try seed("ETH", owner: nil, isEquity: false)
        identity.user = "account-d"
        identity.generation = UUID()
        let declined = self.reviewer(other.id) { [unowned self] _ in self.reply() }
        XCTAssertEqual(declined.phase, .refused(.writtenSignedOut))
        guests.declineLocal(for: "account-d")
        declined.reload()
        XCTAssertEqual(declined.phase, .refused(.notFound))
        XCTAssertEqual(book.all(owner: nil).map(\.id), [other.id], "declined theses stay in the guest book")
    }

    // MARK: Where the thesis started

    func testAThesisWrittenWithoutAPriceNeverBorrowsAReviewsPriceAsItsStart() async throws {
        let thesis = try seed(price: nil)
        var prices: [Double] = [126.1, 131.2]
        let reviewer = reviewer(thesis.id) { [unowned self] _ in self.reply(price: prices.removeFirst()) }

        await reviewer.review()
        let first = try XCTUnwrap(result(reviewer))
        XCTAssertNil(first.thenNow.thenPrice)
        XCTAssertTrue(first.thenNow.missingStart, "the screen says no starting price was saved")
        XCTAssertEqual(first.thenNow.nowPrice, 126.1, "today's price is still shown")
        XCTAssertNil(first.thenNow.changePct)

        await reviewer.review()
        let second = try XCTUnwrap(result(reviewer))
        XCTAssertEqual(second.thesis.revisions.map(\.kind), [.created, .reviewed, .reviewed])
        XCTAssertNil(second.thenNow.thenPrice, "the first review's 126.10 is not where the thesis started")
        XCTAssertNil(second.thenNow.thenDate)
        XCTAssertTrue(second.thenNow.missingStart)
        XCTAssertEqual(second.thenNow.nowPrice, 131.2)
        XCTAssertNil(second.thenNow.changePct, "no change is computed from a review's price")
        XCTAssertNil(ThesisCopy.startingPoint(second.thesis))
        XCTAssertFalse(ThesisCopy.sinceLine(second.thesis, now: now).contains("126"), "nor shown as 'started at' in the list")
        XCTAssertEqual(requests.count, 2)
        XCTAssertNil(requests[1].thesis.priceAtSave, "nor sent to the desk as the price at save")
        XCTAssertNil(requests[1].thesis.json["priceAtSave"])

        // A thesis that has its own starting price keeps it through any number of reviews.
        let priced = try seed("BTC", isEquity: false, price: 100)
        let other = self.reviewer(priced.id) { [unowned self] _ in self.reply(price: 110.0) }
        await other.review()
        await other.review()
        let again = try XCTUnwrap(result(other))
        XCTAssertEqual(again.thenNow.thenPrice, 100)
        XCTAssertEqual(again.thenNow.thenDate, t0)
        XCTAssertFalse(again.thenNow.missingStart)
        XCTAssertEqual(again.thenNow.changePct ?? 0, 10, accuracy: 1e-9)
        XCTAssertEqual(requests.last?.thesis.priceAtSave, 100)
    }

    // MARK: The production wiring

    func testTheLiveEnvironmentIsBoundToTheSessionsConsentItsAccountFenceAndItsBearer() async throws {
        let key = "agent.riskNoticeVersion"
        let savedVersion = UserDefaults.standard.object(forKey: key)
        defer { if let savedVersion { UserDefaults.standard.set(savedVersion, forKey: key) } else { UserDefaults.standard.removeObject(forKey: key) } }
        NucleoFixtures.activate(scenario: "default", timeScale: 0.01)
        defer { NucleoFixtures.deactivate() }

        // The session's profile has NOT accepted the notice, while the stored value a default gate would read says it has.
        UserDefaults.standard.removeObject(forKey: key)
        let profile = AgentProfile()
        UserDefaults.standard.set(RiskNotice.currentVersion, forKey: key)
        XCTAssertFalse(profile.acceptedRiskNotice)
        let session = NucleoSession(fixtures: true, profile: profile, defaults: defaults)
        defer { session.teardown() }
        var deskGeneration = UUID()
        session.desk.generation = { deskGeneration }
        session.desk.meterAuth = BobbyMeterAuth(bearer: { "the-desk-bearer" }, refresh: { _ in nil })

        var sent: [ThesisReviewRequest] = []
        var bearers: [String?] = []
        let pending = Deferred()
        var holds = false
        var env = ThesisReviewer.Environment.live(session) { [unowned self] request, auth in
            sent.append(request)
            bearers.append(await auth.bearer())
            return holds ? await pending.wait() : self.reply()
        }
        env.book = book
        env.now = { [unowned self] in self.now }
        env.accessChanged = { _ in }
        env.meterChanged = { _, _ in }
        XCTAssertEqual(env.owner(), session.desk.thesisOwner)
        XCTAssertEqual(env.generation(), deskGeneration, "the desk's account fence, not a default")

        let thesis = try seed(owner: session.desk.thesisOwner)
        let reviewer = ThesisReviewer(thesisId: thesis.id, environment: env, observeAccount: false)
        XCTAssertEqual(reviewer.phase, .refused(.riskNotice), "the session's own consent gates the review")
        await reviewer.review()
        XCTAssertTrue(sent.isEmpty, "nothing reaches the network before the risk notice is accepted")

        profile.riskNoticeVersion = RiskNotice.currentVersion
        reviewer.reload()
        XCTAssertEqual(reviewer.phase, .ready)
        await reviewer.review()
        XCTAssertEqual(sent.count, 1)
        XCTAssertEqual(sent.first?.thesis.hypothesis, "Margins recover as supply eases")
        XCTAssertEqual(bearers, ["the-desk-bearer"], "the read carries the bearer the desk's reads carry")
        XCTAssertNotNil(result(reviewer))
        XCTAssertEqual(book.thesis(id: thesis.id, owner: session.desk.thesisOwner)?.revisions.map(\.kind), [.created, .reviewed],
                       "recorded in the book of the desk's owner")

        // The desk's account epoch moves while a second review is in flight: its reply is dropped.
        reviewer.accountChanged()
        holds = true
        let task = Task { await reviewer.review() }
        await pending.waitForStart()
        deskGeneration = UUID()
        pending.complete(reply())
        await task.value
        XCTAssertEqual(book.thesis(id: thesis.id, owner: session.desk.thesisOwner)?.revisions.filter { $0.kind == .reviewed }.count, 1)
    }

    // MARK: The decision

    func testKeepEditAndArchiveAreThePersonsDecisionAndTellTheRemindersTrack() async throws {
        let thesis = try seed()
        let reviewer = reviewer(thesis.id) { [unowned self] _ in self.reply() }
        await reviewer.review()
        XCTAssertTrue(reviewer.decide(.keep))
        XCTAssertEqual(book.thesis(id: thesis.id, owner: "account-a")?.revisions.map(\.kind), [.created, .reviewed, .kept])
        XCTAssertTrue(reviewer.decide(.edit))
        XCTAssertEqual(book.thesis(id: thesis.id, owner: "account-a")?.revisions.count, 3, "handing over to the editor writes nothing by itself")
        XCTAssertTrue(reviewer.decide(.archive))
        XCTAssertEqual(book.thesis(id: thesis.id, owner: "account-a")?.status, .archived)
        XCTAssertEqual(decided.map(\.id), [thesis.id, thesis.id, thesis.id])
        XCTAssertEqual(decided.map(\.decision), ["keep", "edit", "archive"])
        book.delete(id: thesis.id, owner: "account-a")
        XCTAssertFalse(reviewer.decide(.keep), "a thesis that is gone cannot be decided on")
        XCTAssertEqual(reviewer.phase, .refused(.notFound))
        XCTAssertEqual(decided.count, 3)
        XCTAssertEqual(ThesisEvents.saved.rawValue, "V18.thesisSaved")
        XCTAssertEqual(ThesisEvents.reviewed.rawValue, "V18.thesisReviewed")
        XCTAssertEqual(ThesisEvents.idKey, "thesisId")
    }

    func testPastReviewsAreNewestFirstAndLeaveOutTheOneOnScreen() async throws {
        let thesis = try seed()
        try book.recordReview(id: thesis.id, owner: "account-a", price: 101, asOf: nil, verdict: "wait", supports: [], challenges: [], unknowns: [],
                              now: t0.addingTimeInterval(2 * 86_400))
        try book.recordReview(id: thesis.id, owner: "account-a", price: 104, asOf: nil, verdict: "review", supports: [], challenges: [], unknowns: [],
                              now: t0.addingTimeInterval(5 * 86_400))
        let reviewer = reviewer(thesis.id) { [unowned self] _ in self.reply() }
        XCTAssertEqual(reviewer.pastReviews().map(\.price), [104, 101])
        await reviewer.review()
        let result = try XCTUnwrap(result(reviewer))
        XCTAssertEqual(reviewer.pastReviews().map(\.price), [108.9, 104, 101])
        XCTAssertEqual(reviewer.pastReviews(excluding: result.thesis.lastReview).map(\.price), [104, 101])
    }

    func testWhatAPastReviewKeptCanBeReadAgain() async throws {
        let thesis = try seed()
        let reviewer = reviewer(thesis.id) { [unowned self] _ in
            self.reply(["review": ["supports": ["Above the 50-day average."], "challenges": [], "unknowns": ["Whether demand holds."], "notChecked": ["news"]]])
        }
        await reviewer.review()
        let kept = try XCTUnwrap(reviewer.pastReviews().first)
        XCTAssertEqual(ThesisReviewer.storedLists(kept),
                       [.init(kind: .supports, items: ["Above the 50-day average."]), .init(kind: .unknowns, items: ["Whether demand holds."])],
                       "the lists the review stored, without the one that held nothing")
        let plain = ThesisRevision(at: t0, kind: .reviewed, price: 101, verdict: "wait")
        XCTAssertTrue(ThesisReviewer.storedLists(plain).isEmpty, "a review that kept no lists says so instead of showing empty ones")
    }
}
