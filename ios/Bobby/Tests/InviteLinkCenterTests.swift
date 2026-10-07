import Foundation
import XCTest
@testable import Bobby

/// The invitation waiting on the phone and its claim (1.8). Every transport is injected and local:
/// no invitation, account or server is touched. The account, the clock and the risk notice are a
/// `World` the test moves by hand.
@MainActor
final class InviteLinkCenterTests: XCTestCase {
    private final class World {
        var user: String? = "account-a"
        var generation = UUID()
        var risk = true
        var now = Date(timeIntervalSince1970: 1_800_000_000)
        var sent: [(path: String, method: String, body: [String: Any], generation: UUID)] = []
        var answer: @MainActor () async throws -> InviteLinkCenter.Reply = { .init(json: ["result": "claimed"], status: 200) }
        var refreshed = 0
        func switchTo(_ user: String?) { self.user = user; generation = UUID() }
        var codes: [String] { sent.compactMap { $0.body["code"] as? String } }
    }

    @MainActor private final class Deferred<Value> {
        private var reply: CheckedContinuation<Value, Error>?
        private var started: CheckedContinuation<Void, Never>?
        private var isStarted = false
        func wait() async throws -> Value {
            try await withCheckedThrowingContinuation {
                reply = $0
                isStarted = true
                started?.resume(); started = nil
            }
        }
        func waitForStart() async {
            if isStarted { return }
            await withCheckedContinuation { started = $0 }
        }
        func complete(_ value: Value) { reply?.resume(returning: value); reply = nil }
        func fail(_ error: Error) { reply?.resume(throwing: error); reply = nil }
    }

    private var suiteName = ""
    private var defaults: UserDefaults!

    override func setUp() async throws {
        try await super.setUp()
        suiteName = "invite.link.tests.\(UUID().uuidString)"
        defaults = UserDefaults(suiteName: suiteName)
    }

    override func tearDown() async throws {
        defaults.removePersistentDomain(forName: suiteName)
        try await super.tearDown()
    }

    private func center(_ world: World) -> InviteLinkCenter {
        InviteLinkCenter(defaults: defaults, now: { world.now }, riskAccepted: { world.risk }, auth: .none,
                         currentUser: { world.user }, currentGeneration: { world.generation }, observe: false,
                         send: { path, method, body, _, generation in
                             world.sent.append((path, method, body, generation))
                             return try await world.answer()
                         },
                         afterClaim: { world.refreshed += 1 })
    }

    private func link(_ code: String) -> URL { URL(string: "https://bobbyprotocol.xyz/i/\(code)")! }
    private func reply(_ result: String, status: Int = 200) -> InviteLinkCenter.Reply { .init(json: ["result": result], status: status) }
    private var stored: [String: Any]? { defaults.dictionary(forKey: InviteLinkCenter.storeKey) }

    // MARK: Storage

    func testAnInvitationIsKeptOnThePhoneWithItsArrivalTimeAndTheNewestWins() async {
        let world = World()
        world.user = nil
        let center = center(world)
        XCTAssertNil(center.pendingCode)
        XCTAssertTrue(center.receive(link("ABCD2345")))
        XCTAssertEqual(center.pending, InvitePending(code: "ABCD2345", at: world.now))
        XCTAssertEqual(stored?["code"] as? String, "ABCD2345")
        XCTAssertEqual(stored?["at"] as? Double, world.now.timeIntervalSince1970)
        XCTAssertEqual(InviteLinkCenter.storeKey, "v18.invite.pending")

        world.now.addTimeInterval(3_600)
        XCTAssertTrue(center.receive(URL(string: "bobbyprotocol://invite/wxyz6789")!))
        XCTAssertEqual(center.pending, InvitePending(code: "WXYZ6789", at: world.now), "the newest invitation replaces the first")
        XCTAssertEqual(stored?["code"] as? String, "WXYZ6789")

        XCTAssertFalse(center.receive(URL(string: "https://bobbyprotocol.xyz/desk")!))
        XCTAssertFalse(center.receive(URL(string: "https://evil.com/i/ABCD2345")!))
        XCTAssertEqual(center.pendingCode, "WXYZ6789", "a URL that is not an invitation changes nothing")

        await center.idle()
        XCTAssertTrue(world.sent.isEmpty, "nobody is signed in: nothing to send")
        XCTAssertEqual(self.center(world).pending, center.pending, "it survives a relaunch")
    }

    func testAUniversalLinkActivityIsAnInvitationAndOtherActivitiesAreNot() async {
        let world = World()
        world.user = nil
        let center = center(world)
        let other = NSUserActivity(activityType: "xyz.bobbyprotocol.bobby.other")
        other.webpageURL = link("ABCD2345")
        XCTAssertFalse(center.receive(activity: other))
        XCTAssertNil(center.pendingCode)
        let web = NSUserActivity(activityType: NSUserActivityTypeBrowsingWeb)
        XCTAssertFalse(center.receive(activity: web), "no page, no invitation")
        web.webpageURL = link("ABCD2345")
        XCTAssertTrue(center.receive(activity: web))
        XCTAssertEqual(center.pendingCode, "ABCD2345")
        await center.idle()
    }

    func testAnInvitationExpiresAfterThirtyDays() async {
        let world = World()
        world.user = nil
        let center = center(world)
        center.receive(link("ABCD2345"))
        world.now.addTimeInterval(30 * 86_400 - 1)
        XCTAssertEqual(center.pendingCode, "ABCD2345")
        XCTAssertEqual(self.center(world).pendingCode, "ABCD2345")
        world.now.addTimeInterval(1)
        XCTAssertNil(center.pendingCode, "thirty days later it is gone")
        XCTAssertNil(self.center(world).pendingCode, "also for a relaunch that finds the old record")
        world.switchTo("account-a")
        center.accountDidChange()
        await center.idle()
        XCTAssertTrue(world.sent.isEmpty, "an expired invitation is never sent")
        XCTAssertNil(center.pending)
        XCTAssertNil(stored, "and the record is removed")
    }

    func testABrokenRecordIsNotAnInvitation() {
        let world = World()
        for record: [String: Any] in [["code": "ABCDI345", "at": world.now.timeIntervalSince1970], ["code": "ABCD2345"],
                                       ["code": "ABCD2345", "at": Double.infinity], ["at": world.now.timeIntervalSince1970],
                                       ["code": "ABCD2345", "at": world.now.timeIntervalSince1970 + 40 * 86_400]] {
            defaults.set(record, forKey: InviteLinkCenter.storeKey)
            XCTAssertNil(center(world).pendingCode, "\(record)")
        }
        defaults.set("ABCD2345", forKey: InviteLinkCenter.storeKey)
        XCTAssertNil(center(world).pendingCode)
    }

    // MARK: Consent and account

    func testNothingIsSentBeforeTheRiskNoticeIsAccepted() async {
        let world = World()
        world.risk = false
        let center = center(world)
        XCTAssertTrue(center.receive(link("ABCD2345")))
        center.appBecameActive()
        center.accountDidChange()
        await center.idle()
        let step = await center.claimIfPossible()
        XCTAssertNil(step)
        let typed = await center.submit(code: "WXYZ6789")
        XCTAssertNil(typed)
        XCTAssertTrue(world.sent.isEmpty, "signed in with an invitation waiting, and still nothing leaves before consent")
        XCTAssertEqual(center.pendingCode, "WXYZ6789", "the code waits for the consent")
        XCTAssertNil(center.notice)
        XCTAssertEqual(world.refreshed, 0)

        world.risk = true
        center.appBecameActive()
        await center.idle()
        XCTAssertEqual(world.codes, ["WXYZ6789"])
        XCTAssertNil(center.pendingCode)
    }

    func testNothingIsSentWithoutAnAccountAndASignInClaims() async {
        let world = World()
        world.user = nil
        let center = center(world)
        center.receive(link("ABCD2345"))
        center.appBecameActive()
        await center.idle()
        XCTAssertTrue(world.sent.isEmpty)
        XCTAssertFalse(center.isSignedIn)

        world.switchTo("account-a")
        center.accountDidChange()
        await center.idle()
        XCTAssertEqual(world.codes, ["ABCD2345"])
        XCTAssertEqual(world.sent.first?.generation, world.generation)
        XCTAssertNil(center.pendingCode)
        XCTAssertNil(stored)
        XCTAssertEqual(center.notice, .accepted)
        XCTAssertEqual(world.refreshed, 1, "levels and access are read again after an accepted invitation")
    }

    func testTheClaimIsOneAuthenticatedPostWithTheCodeAndNothingElse() async {
        let world = World()
        var bearer: String?
        let auth = BobbyMeterAuth(bearer: { "injected-bearer" }, refresh: { _ in nil })
        let center = InviteLinkCenter(defaults: defaults, now: { world.now }, riskAccepted: { true }, auth: auth,
                                      currentUser: { world.user }, currentGeneration: { world.generation }, observe: false,
                                      send: { path, method, body, passedAuth, generation in
                                          XCTAssertEqual(path, "api/bobby-access")
                                          XCTAssertEqual(method, "POST")
                                          XCTAssertEqual(body["action"] as? String, "referral-claim")
                                          XCTAssertEqual(body["code"] as? String, "ABCD2345")
                                          XCTAssertEqual(body.count, 2)
                                          XCTAssertEqual(generation, world.generation)
                                          bearer = await passedAuth.bearer()
                                          return .init(json: ["result": "claimed", "access": NSNull(), "levels": NSNull()], status: 200)
                                      },
                                      afterClaim: { world.refreshed += 1 })
        center.receive(URL(string: "https://www.bobbyprotocol.xyz/desk?ref=abcd2345&v=2")!)
        await center.idle()
        XCTAssertEqual(bearer, "injected-bearer")
        XCTAssertEqual(center.notice, .accepted)
        XCTAssertEqual(world.refreshed, 1)
    }

    // MARK: Results

    func testEveryFinalAnswerClearsTheCodeAndSaysWhyInWordsOnce() async {
        let answers: [(result: String, status: Int, notice: InviteNotice)] = [
            ("claimed", 200, .accepted), ("self", 200, .ownInvitation), ("not_new", 200, .notNew),
            ("already_claimed", 200, .alreadyClaimed), ("inviter_full", 200, .inviterFull),
            ("invalid_code", 200, .invalid), ("invalid_invitee", 200, .invalid),
            ("invalid_code", 400, .invalid), ("a_result_from_the_future", 200, .notApplied),
        ]
        var texts = Set<String>()
        for answer in answers {
            defaults.removeObject(forKey: InviteLinkCenter.storeKey)
            let world = World()
            world.answer = { self.reply(answer.result, status: answer.status) }
            let center = center(world)
            center.receive(link("ABCD2345"))
            await center.idle()
            XCTAssertEqual(world.sent.count, 1, answer.result)
            XCTAssertNil(center.pendingCode, answer.result)
            XCTAssertNil(stored, answer.result)
            XCTAssertEqual(center.notice, answer.notice, answer.result)
            XCTAssertFalse(center.isClaiming)
            XCTAssertEqual(world.refreshed, answer.notice == .accepted ? 1 : 0, answer.result)
            let text = center.notice?.text ?? ""
            XCTAssertFalse(text.isEmpty)
            texts.insert(text)

            center.appBecameActive()
            center.accountDidChange()
            await center.idle()
            XCTAssertEqual(world.sent.count, 1, "a settled invitation is never sent again: \(answer.result)")
            center.acknowledgeNotice()
            XCTAssertNil(center.notice, "said once")
        }
        XCTAssertEqual(texts.count, 7, "each reason has its own words (the two invalid answers share one)")
        // The words exist in every language (the simulator's own language decides which one is read above).
        for english in ["That is your own invitation.", "Invitations work for new accounts, during their first week.",
                        "This account already accepted an invitation.", "That invitation code is not valid."] {
            XCTAssertNotNil(NativeTranslations18.invite[english], english)
        }
    }

    func testAccountRequiredARefusedSessionAFailingServerAndANetworkErrorKeepTheCode() async {
        let answers: [(name: String, answer: @MainActor () async throws -> InviteLinkCenter.Reply)] = [
            ("account_required", { .init(json: ["result": "account_required"], status: 200) }),
            ("401", { .init(json: ["error": "Sign in"], status: 401) }),
            ("401 with a result", { .init(json: ["result": "invalid_code"], status: 401) }),
            ("500", { .init(json: ["error": "boom"], status: 500) }),
            ("503 without a body", { .init(json: nil, status: 503) }),
            ("500 with a result", { .init(json: ["result": "claimed"], status: 500) }),
            ("429", { .init(json: ["error": "slow down"], status: 429) }),
            ("404", { .init(json: nil, status: 404) }),
            ("400 without a result", { .init(json: ["error": "bad"], status: 400) }),
            ("a page instead of an answer", { .init(json: nil, status: 200) }),
            ("a list instead of an answer", { .init(json: ["claimed"], status: 200) }),
            ("timeout", { throw URLError(.timedOut) }),
            ("offline", { throw URLError(.notConnectedToInternet) }),
        ]
        for answer in answers {
            defaults.removeObject(forKey: InviteLinkCenter.storeKey)
            let world = World()
            world.answer = answer.answer
            let center = center(world)
            center.receive(link("ABCD2345"))
            await center.idle()
            XCTAssertEqual(world.sent.count, 1, answer.name)
            XCTAssertEqual(center.pendingCode, "ABCD2345", "kept for a later attempt: \(answer.name)")
            XCTAssertEqual(stored?["code"] as? String, "ABCD2345", answer.name)
            XCTAssertNil(center.notice, "an attempt nobody asked for fails quietly: \(answer.name)")
            XCTAssertFalse(center.isClaiming)
            XCTAssertEqual(world.refreshed, 0, answer.name)
        }
    }

    func testAFailingServerIsAskedAtMostOncePerMinute() async {
        let world = World()
        world.answer = { self.reply("server_error", status: 500) }
        let center = center(world)
        center.receive(link("ABCD2345"))
        await center.idle()
        XCTAssertEqual(world.sent.count, 1)

        center.appBecameActive()
        center.accountDidChange()
        center.receive(link("ABCD2345"))
        await center.idle()
        let direct = await center.claimIfPossible()
        XCTAssertNil(direct)
        XCTAssertEqual(world.sent.count, 1, "no second attempt inside the minute, whatever asks")

        let typed = await center.submit(code: "ABCD2345")
        XCTAssertEqual(typed, .savedForLater, "a typed code is told it waits")
        XCTAssertEqual(world.sent.count, 1)

        world.now.addTimeInterval(59)
        center.appBecameActive()
        await center.idle()
        XCTAssertEqual(world.sent.count, 1)

        world.now.addTimeInterval(1)
        center.appBecameActive()
        await center.idle()
        XCTAssertEqual(world.sent.count, 2, "a minute later the next activation tries again")

        world.answer = { self.reply("claimed") }
        center.appBecameActive()
        await center.idle()
        XCTAssertEqual(world.sent.count, 2, "the second failure started its own minute")
        world.now.addTimeInterval(60)
        center.appBecameActive()
        await center.idle()
        XCTAssertEqual(world.sent.count, 3)
        XCTAssertNil(center.pendingCode)
        XCTAssertEqual(center.notice, .accepted)
    }

    func testAClockSetBackCannotHoldAnInvitationForLongerThanOneBackOff() async {
        let world = World()
        world.answer = { throw URLError(.timedOut) }
        let center = center(world)
        center.receive(link("ABCD2345"))
        await center.idle()
        XCTAssertEqual(world.sent.count, 1)
        world.now.addTimeInterval(-86_400)
        center.appBecameActive()
        await center.idle()
        XCTAssertEqual(world.sent.count, 2)
    }

    func testOnlyOneAttemptIsInTheAirAndASecondCallerWaitsForIt() async {
        let world = World()
        let deferred = Deferred<InviteLinkCenter.Reply>()
        world.answer = { try await deferred.wait() }
        let center = center(world)
        center.receive(link("ABCD2345"))
        await deferred.waitForStart()
        XCTAssertTrue(center.isClaiming)

        let second = Task { await center.claimIfPossible() }
        center.appBecameActive()
        center.accountDidChange()
        await Task.yield()
        await Task.yield()
        XCTAssertEqual(world.sent.count, 1, "the attempt in the air is the only one")

        deferred.complete(reply("claimed"))
        let step = await second.value
        XCTAssertEqual(step, .settled(.accepted), "the second caller got the same answer")
        await center.idle()
        XCTAssertEqual(world.sent.count, 1)
        XCTAssertFalse(center.isClaiming)
        XCTAssertEqual(world.refreshed, 1)
    }

    // MARK: Account fences

    func testAReplyForAPreviousAccountIsDroppedAndTheCodeIsKeptForTheNewOne() async {
        let world = World()
        let deferred = Deferred<InviteLinkCenter.Reply>()
        var calls = 0
        world.answer = {
            calls += 1
            if calls == 1 { return try await deferred.wait() }
            return self.reply("not_new")
        }
        let center = center(world)
        center.receive(link("ABCD2345"))
        await deferred.waitForStart()
        let first = world.generation

        world.switchTo("account-b")
        center.accountDidChange()
        deferred.complete(reply("claimed"))
        await center.idle()

        XCTAssertEqual(world.refreshed, 0, "account A's accepted invitation is not applied to account B")
        XCTAssertEqual(world.sent.count, 2, "the code was kept and account B asked for itself")
        XCTAssertEqual(world.sent[0].generation, first)
        XCTAssertEqual(world.sent[1].generation, world.generation)
        XCTAssertEqual(center.notice, .notNew, "account B reads its own answer, never A's")
        XCTAssertNil(center.pendingCode)
    }

    func testAReplyThatLandsAfterSignOutIsDroppedAndTheCodeStays() async {
        let world = World()
        let deferred = Deferred<InviteLinkCenter.Reply>()
        world.answer = { try await deferred.wait() }
        let center = center(world)
        center.receive(link("ABCD2345"))
        await deferred.waitForStart()

        world.switchTo(nil)
        center.accountDidChange()
        let joined = Task { await center.claimIfPossible() }
        await Task.yield()
        deferred.complete(reply("claimed"))
        let step = await joined.value
        await center.idle()

        XCTAssertEqual(step, .dropped)
        XCTAssertEqual(center.pendingCode, "ABCD2345")
        XCTAssertEqual(stored?["code"] as? String, "ABCD2345")
        XCTAssertNil(center.notice)
        XCTAssertEqual(world.refreshed, 0)
        XCTAssertEqual(world.sent.count, 1, "nobody is signed in: nothing more is sent")
    }

    func testAFailureThatLandsAfterAnAccountChangeDoesNotStartABackOffForTheNewAccount() async {
        let world = World()
        let deferred = Deferred<InviteLinkCenter.Reply>()
        var calls = 0
        world.answer = {
            calls += 1
            if calls == 1 { return try await deferred.wait() }
            return self.reply("claimed")
        }
        let center = center(world)
        center.receive(link("ABCD2345"))
        await deferred.waitForStart()
        world.switchTo("account-b")
        deferred.fail(CancellationError())
        await center.idle()
        XCTAssertEqual(world.sent.count, 2)
        XCTAssertEqual(center.notice, .accepted)
        XCTAssertEqual(world.refreshed, 1)
    }

    func testSigningOutOrDeletingTheAccountKeepsTheWaitingCode() async {
        let world = World()
        world.answer = { self.reply("account_required") }
        let center = center(world)
        let typed = await center.submit(code: "ABCD2345")
        XCTAssertEqual(typed, .signInNeeded)
        XCTAssertEqual(center.pendingCode, "ABCD2345")

        world.switchTo(nil)
        center.accountDidChange()
        await center.idle()
        XCTAssertEqual(center.pendingCode, "ABCD2345", "the invitation belongs to the phone until claimed or expired")
        XCTAssertEqual(stored?["code"] as? String, "ABCD2345")
        XCTAssertNil(center.notice, "the previous account's result line is gone")
        XCTAssertEqual(world.sent.count, 1)
    }

    // MARK: A typed code

    func testATypedCodeGoesThroughTheSameCentre() async {
        let world = World()
        let center = center(world)
        let accepted = await center.submit(code: " abcd 2345 ")
        XCTAssertEqual(accepted, .accepted)
        XCTAssertEqual(world.codes, ["ABCD2345"])
        XCTAssertEqual(world.sent.first?.path, "api/bobby-access")
        XCTAssertNil(center.pendingCode)
        XCTAssertEqual(center.notice, .accepted)
        await center.idle()
        XCTAssertEqual(world.refreshed, 1)

        world.answer = { self.reply("self") }
        let pasted = await center.submit(code: "https://bobbyprotocol.xyz/i/WXYZ6789")
        XCTAssertEqual(pasted, .ownInvitation)
        XCTAssertEqual(world.codes, ["ABCD2345", "WXYZ6789"])
    }

    func testATypedCodeThatIsNotACodeIsRefusedWithoutARequestAndWithoutReplacingAWaitingInvitation() async {
        let world = World()
        world.user = nil
        let center = center(world)
        center.receive(link("ABCD2345"))
        for raw in ["", "ABCD234", "ABCDI345", "ABCD23456", "hello there", "https://evil.com/i/WXYZ6789"] {
            let result = await center.submit(code: raw)
            XCTAssertEqual(result, .invalid, raw)
            XCTAssertEqual(center.notice, .invalid)
        }
        XCTAssertEqual(center.pendingCode, "ABCD2345")
        XCTAssertTrue(world.sent.isEmpty)
    }

    func testATypedCodeWhileSignedOutIsKeptAndAsksForAnAccount() async {
        let world = World()
        world.user = nil
        let center = center(world)
        let result = await center.submit(code: "abcd2345")
        XCTAssertEqual(result, .signInNeeded)
        XCTAssertEqual(center.pendingCode, "ABCD2345")
        XCTAssertTrue(world.sent.isEmpty)

        world.switchTo("account-a")
        center.accountDidChange()
        await center.idle()
        XCTAssertEqual(world.codes, ["ABCD2345"])
        XCTAssertEqual(center.notice, .accepted)
    }

    func testATypedCodeTheServerCouldNotCheckIsSavedAndSaysSo() async {
        let world = World()
        world.answer = { throw URLError(.networkConnectionLost) }
        let center = center(world)
        let result = await center.submit(code: "ABCD2345")
        XCTAssertEqual(result, .savedForLater)
        XCTAssertEqual(center.pendingCode, "ABCD2345")
        XCTAssertEqual(world.sent.count, 1)
        XCTAssertEqual(world.refreshed, 0)

        center.forget()
        XCTAssertNil(center.pendingCode, "the person can remove what the phone keeps")
        XCTAssertNil(stored)
        XCTAssertNil(center.notice)
    }

    func testANewerInvitationThatArrivesDuringAnAttemptGetsItsOwnAnswer() async {
        let world = World()
        let deferred = Deferred<InviteLinkCenter.Reply>()
        var calls = 0
        world.answer = {
            calls += 1
            if calls == 1 { return try await deferred.wait() }
            return self.reply("claimed")
        }
        let center = center(world)
        center.receive(link("ABCD2345"))
        await deferred.waitForStart()
        center.receive(link("WXYZ6789"))
        deferred.complete(reply("invalid_code"))
        await center.idle()
        XCTAssertEqual(world.codes, ["ABCD2345", "WXYZ6789"])
        XCTAssertEqual(center.notice, .accepted, "the first code's answer did not erase or answer for the second")
        XCTAssertNil(center.pendingCode)
    }

    func testAnAcceptedInvitationClearsANewerOneBecauseAnAccountAcceptsOnlyOnce() async {
        let world = World()
        let deferred = Deferred<InviteLinkCenter.Reply>()
        world.answer = { try await deferred.wait() }
        let center = center(world)
        center.receive(link("ABCD2345"))
        await deferred.waitForStart()
        center.receive(link("WXYZ6789"))
        deferred.complete(reply("claimed"))
        await center.idle()
        XCTAssertEqual(world.codes, ["ABCD2345"])
        XCTAssertEqual(center.notice, .accepted)
        XCTAssertNil(center.pendingCode)
    }

    // MARK: The sign-in callback

    func testTheSignInCallbackIsIgnoredByTheCentre() async {
        let world = World()
        let center = center(world)
        for callback in ["bobbyprotocol://auth-callback", "bobbyprotocol://auth-callback#access_token=a.b.c&refresh_token=r&expires_in=3600",
                         "bobbyprotocol://auth-callback/ABCD2345"] {
            XCTAssertFalse(center.receive(URL(string: callback)!), callback)
        }
        await center.idle()
        XCTAssertNil(center.pendingCode)
        XCTAssertNil(stored)
        XCTAssertTrue(world.sent.isEmpty)
    }

    // MARK: The nudge

    func testTheNudgeSpeaksOnlySignedOutWithAWaitingInvitationAndItsIdFollowsTheCode() async {
        let world = World()
        world.user = nil
        let center = center(world)
        let glass = NudgeCenter(defaults: defaults)
        glass.now = { world.now }
        glass.register(InviteNudges.source(invites: { center }))
        XCTAssertEqual(glass.sourceKeys, ["invite"])
        XCTAssertNil(glass.current(glass.moment(signedIn: false)), "no invitation, nothing to say")

        center.receive(link("ABCD2345"))
        let first = glass.current(glass.moment(signedIn: false))
        XCTAssertEqual(first?.id, "invite.abcd2345")
        XCTAssertEqual(first?.text, L.t("A friend invited you to Bobby", "Un amigo te invitó a Bobby"))
        XCTAssertEqual(first?.cta, L.t("Accept", "Aceptar"))
        XCTAssertNotNil(first?.id.range(of: NucleoNudge.idPattern, options: .regularExpression))
        XCTAssertNil(glass.current(glass.moment(signedIn: true)), "with an account the claim just happens")
        XCTAssertNil(InviteNudges.nudge(signedIn: true, pendingCode: "ABCD2345"))
        XCTAssertNil(InviteNudges.nudge(signedIn: false, pendingCode: nil))

        glass.retire("invite.abcd2345")
        XCTAssertNil(glass.current(glass.moment(signedIn: false)), "an invitation the person already answered stays quiet")
        center.receive(link("WXYZ6789"))
        XCTAssertEqual(glass.current(glass.moment(signedIn: false))?.id, "invite.wxyz6789", "a new invitation is a new nudge")

        world.now.addTimeInterval(31 * 86_400)
        XCTAssertNil(glass.current(glass.moment(signedIn: false)), "an expired invitation says nothing")
        await center.idle()
        XCTAssertTrue(world.sent.isEmpty, "the candidate never touches the network")
    }

    func testTheNudgeFitsTheGlassInEveryLanguage() {
        let line = "A friend invited you to Bobby", button = "Accept"
        XCTAssertLessThanOrEqual(line.count, NucleoNudge.textLimit)
        XCTAssertLessThanOrEqual("Un amigo te invitó a Bobby".count, NucleoNudge.textLimit)
        XCTAssertLessThanOrEqual(button.count, 22)
        XCTAssertLessThanOrEqual("Aceptar".count, 22)
        for language in ["fr", "pt", "it", "de"] {
            let text = NativeTranslations.rows[line]?[language] ?? ""
            let cta = NativeTranslations.rows[button]?[language] ?? ""
            XCTAssertFalse(text.isEmpty, language)
            XCTAssertFalse(cta.isEmpty, language)
            XCTAssertLessThanOrEqual(text.count, NucleoNudge.textLimit, "\(language): \(text)")
            XCTAssertLessThanOrEqual(cta.count, 22, "\(language): \(cta)")
        }
        XCTAssertEqual(NudgePriority.invite, 90)
    }

    func testAcceptOnTheGlassOpensTheInviteSheetWhenSignInCannotStartAndKeepsTheInvitation() async {
        NucleoFixtures.activate(scenario: "default", timeScale: 0.01)
        defer { NucleoFixtures.deactivate() }
        let world = World()
        world.user = nil
        let center = center(world)
        center.receive(link("ABCD2345"))
        let glass = NudgeCenter(defaults: defaults)
        glass.register(InviteNudges.source(invites: { center }))
        // Fixture mode is the signed-out path with no Apple sheet: sign-in answers "unavailable".
        let session = NucleoSession(fixtures: true, defaults: defaults)
        defer { session.teardown() }
        let nudge = glass.current(glass.moment(signedIn: false))
        XCTAssertEqual(nudge?.id, "invite.abcd2345")
        let status = await glass.act("invite.abcd2345", session: session)
        XCTAssertEqual(status, "done")
        XCTAssertEqual(session.sheet, .invite, "the sheet shows the saved invitation and its own way to sign in")
        XCTAssertEqual(center.pendingCode, "ABCD2345")
        XCTAssertTrue(glass.isRetired("invite.abcd2345"))
        await center.idle()
        XCTAssertTrue(world.sent.isEmpty)
    }

    // MARK: The sheet's words

    func testTheRewardSentenceUsesTheServersNumbersOrIsNotShown() {
        XCTAssertNil(InviteCopy.rewardTerms(referral: nil, planDays: nil, planMax: 5), "no number of the app's own")
        let plans = InviteCopy.rewardTerms(referral: nil, planDays: 14, planMax: 3)
        XCTAssertEqual(plans?.days, 14)
        XCTAssertEqual(plans?.max, 3)
        let referral = NucleoReferral(json: ["code": "ABCD2345", "url": "https://bobbyprotocol.xyz/i/ABCD2345", "accepted": 1, "max": 4, "rewardDays": 21])
        let own = InviteCopy.rewardTerms(referral: referral, planDays: 14, planMax: 3)
        XCTAssertEqual(own?.days, 21)
        XCTAssertEqual(own?.max, 4)
        let sentence = InviteCopy.reward(days: 21, max: 4)
        XCTAssertTrue(sentence.contains("21") && sentence.contains("4"), sentence)
        XCTAssertFalse(sentence.contains("30"), "never the old fallback")
    }

    func testTheShareTextCarriesTheCodeInPlainWords() {
        let withCode = InviteCopy.shareMessage(code: "ABCD2345")
        XCTAssertTrue(withCode.contains("ABCD2345"))
        XCTAssertTrue(withCode.hasPrefix(InviteCopy.shareMessage(code: nil)))
        XCTAssertFalse(InviteCopy.shareMessage(code: nil).contains("ABCD2345"))
    }

    func testInviteCopyKeepsToTheProductsWords() {
        let english = Array(NativeTranslations18.invite.keys)
        let banned = ["buy", "sell", "profit", "guaranteed", "returns", "advice", "signal", "alert", "!"]
        for text in english {
            let lower = text.lowercased()
            for word in banned { XCTAssertFalse(lower.contains(word), "\(word) in: \(text)") }
        }
        XCTAssertEqual(NativeTranslations18.invite.count, 24)
        for (key, row) in NativeTranslations18.invite {
            XCTAssertEqual(Set(row.keys), ["fr", "pt", "it", "de"], key)
            XCTAssertEqual(NativeTranslations.rows[key], row, "an older row with the same key would win: \(key)")
        }
    }

#if DEBUG
    func testEveryScreenStateHasAReviewFixture() {
        let names = Set(V18QA.fixtures.keys)
        for name in ["invite-sheet", "invite-sheet-plain", "invite-signed-out", "invite-pending", "invite-result-saved"] {
            XCTAssertTrue(names.contains(name), name)
        }
        for result in InviteQA.results { XCTAssertTrue(names.contains("invite-result-\(result.name)"), result.name) }
        XCTAssertEqual(InviteLink.normalized(InviteQA.ownCode), InviteQA.ownCode)
        XCTAssertEqual(InviteLink.normalized(InviteQA.friendCode), InviteQA.friendCode)
        let waiting = InviteQA.invites(signedIn: false, pendingCode: InviteQA.friendCode, notice: nil)
        XCTAssertEqual(waiting.pendingCode, InviteQA.friendCode)
        XCTAssertNil(UserDefaults(suiteName: InviteQA.suite)?.dictionary(forKey: InviteLinkCenter.storeKey), "a fixture stores nothing")
        XCTAssertEqual(InviteQA.levels(referral: true).referral?.code, InviteQA.ownCode)
    }
#endif
}
