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

    /// `observe: true` is the app's own centre: it listens for sign-ins and activations and tries once at launch.
    private func center(_ world: World, observe: Bool = false) -> InviteLinkCenter {
        InviteLinkCenter(defaults: defaults, now: { world.now }, riskAccepted: { world.risk }, auth: .none,
                         currentUser: { world.user }, currentGeneration: { world.generation }, observe: observe,
                         send: { path, method, body, _, generation in
                             world.sent.append((path, method, body, generation))
                             return try await world.answer()
                         },
                         afterClaim: { world.refreshed += 1 })
    }

    private func link(_ code: String) -> URL { URL(string: "https://bobbyprotocol.xyz/i/\(code)")! }
    private func reply(_ result: String, status: Int = 200) -> InviteLinkCenter.Reply { .init(json: ["result": result], status: status) }
    private var stored: [String: Any]? { defaults.dictionary(forKey: InviteLinkCenter.storeKey) }
    private var storedAnswer: [String: Any]? { defaults.dictionary(forKey: InviteLinkCenter.answerKey) }

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
        XCTAssertEqual(typed, .consentNeeded, "a typed code is told why nothing happened")
        XCTAssertTrue(world.sent.isEmpty, "signed in with an invitation waiting, and still nothing leaves before consent")
        XCTAssertEqual(center.pendingCode, "WXYZ6789", "the code waits for the consent")
        XCTAssertEqual(center.notice, .consentNeeded)
        XCTAssertEqual(center.notice?.text, L.t("Accept the risk notice first: until then Bobby sends nothing to its servers.",
                                                "Primero acepta el aviso de riesgo: hasta entonces Bobby no envía nada a sus servidores."),
                       "the sentence the memory and briefing screens already use")
        XCTAssertNil(storedAnswer, "it is not an answer from the server")
        XCTAssertEqual(world.refreshed, 0)

        world.user = nil
        let signedOut = await center.submit(code: "WXYZ6789")
        XCTAssertEqual(signedOut, .consentNeeded, "signed out it is still the consent that is missing first")
        XCTAssertTrue(world.sent.isEmpty)
        world.user = "account-a"

        world.risk = true
        center.appBecameActive()
        await center.idle()
        XCTAssertEqual(world.codes, ["WXYZ6789"])
        XCTAssertNil(center.pendingCode)
        XCTAssertEqual(center.notice, .accepted, "the consent line is gone once the consent is there")
    }

    func testTheConsentLineDoesNotOutliveTheConsentWhenTheServerCannotBeReached() async {
        let world = World()
        world.risk = false
        world.answer = { throw URLError(.timedOut) }
        let center = center(world)
        let typed = await center.submit(code: "ABCD2345")
        XCTAssertEqual(typed, .consentNeeded)
        world.risk = true
        center.appBecameActive()
        await center.idle()
        XCTAssertEqual(world.sent.count, 1)
        XCTAssertEqual(center.pendingCode, "ABCD2345")
        XCTAssertNil(center.notice, "an out-of-date reason is not left on the sheet")
    }

    // MARK: A launch

    func testAKeptInvitationIsTriedAgainAtLaunchWithoutAnyOtherEvent() async {
        let world = World()
        world.answer = { self.reply("server_error", status: 502) }
        let first = center(world)
        let typed = await first.submit(code: "ABCD2345")
        XCTAssertEqual(typed, .savedForLater, "the person was told it will be tried again")
        XCTAssertEqual(world.sent.count, 1)
        XCTAssertEqual(stored?["code"] as? String, "ABCD2345")

        // The app is quit and opened again: no link, no sign-in, no return from the background.
        world.answer = { self.reply("claimed") }
        let relaunched = center(world, observe: true)
        await relaunched.idle()
        XCTAssertEqual(world.codes, ["ABCD2345", "ABCD2345"], "the launch itself is the next try")
        XCTAssertEqual(world.sent.last?.generation, world.generation)
        XCTAssertNil(relaunched.pendingCode)
        XCTAssertNil(stored)
        XCTAssertEqual(relaunched.notice, .accepted)
        XCTAssertEqual(world.refreshed, 1)

        let again = center(world, observe: true)
        await again.idle()
        XCTAssertEqual(world.sent.count, 2, "nothing waits any more: a later launch sends nothing")
    }

    func testALaunchSendsNothingWithoutTheConsentOrAnAccount() async {
        let world = World()
        world.user = nil
        center(world).receive(link("ABCD2345"))
        let signedOut = center(world, observe: true)
        await signedOut.idle()
        XCTAssertTrue(world.sent.isEmpty, "nobody is signed in")

        world.switchTo("account-a")
        world.risk = false
        let noConsent = center(world, observe: true)
        await noConsent.idle()
        XCTAssertTrue(world.sent.isEmpty, "the risk notice is not accepted")
        XCTAssertEqual(noConsent.pendingCode, "ABCD2345")

        let suites = center(world)
        world.risk = true
        await suites.idle()
        XCTAssertTrue(world.sent.isEmpty, "a centre that observes nothing (the unit-test host's) starts nothing by itself")
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

    func testTheBackOffBelongsToTheAccountThatFailed() async {
        let world = World()
        world.answer = { .init(json: ["error": "Sign in"], status: 401) }
        let center = center(world)
        center.receive(link("ABCD2345"))
        await center.idle()
        XCTAssertEqual(world.sent.count, 1, "account A's session was refused")

        // Twenty seconds later another account signs in: it has not been refused anything.
        world.now.addTimeInterval(20)
        world.answer = { self.reply("claimed") }
        world.switchTo("account-b")
        center.accountDidChange()
        await center.idle()
        XCTAssertEqual(world.sent.count, 2, "account B's sign-in sends its own attempt inside A's minute")
        XCTAssertEqual(world.sent.last?.generation, world.generation)
        XCTAssertEqual(center.notice, .accepted)
        XCTAssertNil(center.pendingCode)
    }

    func testATypedCodeIsTriedForTheAccountThatSignedInAfterAnotherOnesFailure() async {
        let world = World()
        world.answer = { self.reply("server_error", status: 500) }
        let center = center(world)
        center.receive(link("ABCD2345"))
        await center.idle()
        XCTAssertEqual(world.sent.count, 1)

        world.now.addTimeInterval(5)
        world.switchTo("account-b")
        world.answer = { self.reply("not_new") }
        // No notification yet: the typed code itself notices the new account.
        let typed = await center.submit(code: "ABCD2345")
        XCTAssertEqual(typed, .notNew, "never \"could not check\" for an account nothing was tried for")
        XCTAssertEqual(world.sent.count, 2)
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
        let firstId = "invite.abcd2345.\(InviteNudges.stamp(world.now))"
        XCTAssertEqual(first?.id, firstId, "the code in lowercase, then when it arrived")
        XCTAssertEqual(first?.text, L.t("A friend invited you to Bobby", "Un amigo te invitó a Bobby"))
        XCTAssertEqual(first?.cta, L.t("Accept", "Aceptar"))
        XCTAssertNotNil(first?.id.range(of: NucleoNudge.idPattern, options: .regularExpression))
        XCTAssertNil(glass.current(glass.moment(signedIn: true)), "with an account the claim just happens")
        let waiting = InvitePending(code: "ABCD2345", at: world.now)
        XCTAssertNil(InviteNudges.nudge(signedIn: true, waiting: waiting, answer: nil))
        XCTAssertNil(InviteNudges.nudge(signedIn: false, waiting: nil, answer: nil))
        XCTAssertNil(InviteNudges.nudge(signedIn: false, waiting: nil, answer: InviteAnswer(code: "ABCD2345", notice: .notNew, at: world.now)),
                     "an answer is only for the account it was given to")

        glass.retire(firstId)
        XCTAssertNil(glass.current(glass.moment(signedIn: false)), "an invitation the person already answered stays quiet")
        world.now.addTimeInterval(60)
        center.receive(link("WXYZ6789"))
        XCTAssertEqual(glass.current(glass.moment(signedIn: false))?.id, "invite.wxyz6789.\(InviteNudges.stamp(world.now))",
                       "a new invitation is a new nudge")

        world.now.addTimeInterval(31 * 86_400)
        XCTAssertNil(glass.current(glass.moment(signedIn: false)), "an expired invitation says nothing")
        await center.idle()
        XCTAssertTrue(world.sent.isEmpty, "the candidate never touches the network")
    }

    func testTheNudgeFitsTheGlassInEveryLanguage() {
        let lines = [("A friend invited you to Bobby", "Un amigo te invitó a Bobby"),
                     ("The invitation you received was accepted", "La invitación que recibiste fue aceptada"),
                     ("The invitation you received was not accepted", "La invitación que recibiste no fue aceptada")]
        let buttons = [("Accept", "Aceptar"), ("See details", "Ver detalles"), ("See why", "Ver por qué")]
        for (texts, limit) in [(lines, NucleoNudge.textLimit), (buttons, 22)] {
            for (english, spanish) in texts {
                XCTAssertLessThanOrEqual(english.count, limit, english)
                XCTAssertLessThanOrEqual(spanish.count, limit, spanish)
                for language in ["fr", "pt", "it", "de"] {
                    let text = NativeTranslations.rows[english]?[language] ?? ""
                    XCTAssertFalse(text.isEmpty, "\(language): \(english)")
                    XCTAssertLessThanOrEqual(text.count, limit, "\(language): \(text)")
                }
            }
        }
        XCTAssertEqual(NudgePriority.invite, 90)
    }

    func testAcceptOnTheGlassOpensTheInviteSheetWhenSignInCannotStartAndKeepsTheInvitation() async throws {
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
        let id = try XCTUnwrap(nudge?.id)
        XCTAssertTrue(id.hasPrefix("invite.abcd2345."), id)
        let status = await glass.act(id, session: session)
        XCTAssertEqual(status, "done")
        XCTAssertEqual(session.sheet, .invite, "the sheet shows the saved invitation and its own way to sign in")
        XCTAssertEqual(center.pendingCode, "ABCD2345")
        XCTAssertTrue(glass.isRetired(id))
        await center.idle()
        XCTAssertTrue(world.sent.isEmpty)
    }

    func testClosingApplesSheetAfterAcceptStillShowsTheSavedInvitationAndOpeningTheLinkAgainBringsTheLineBack() async throws {
        NucleoFixtures.activate(scenario: "default", timeScale: 0.01)
        defer { NucleoFixtures.deactivate() }
        let world = World()
        world.user = nil
        let center = center(world)
        center.receive(link("ABCD2345"))
        let glass = NudgeCenter(defaults: defaults)
        glass.now = { world.now }
        var cancelled = false
        // The app's own source, with Apple's sheet answered by hand: the person closes it.
        let own = InviteNudges.source(invites: { center })
        glass.register(NudgeSource(key: own.key, priority: own.priority, candidate: own.candidate, act: { _, session in
            cancelled = true
            await InviteNudges.finish(signIn: "cancelled", invites: center) { session.present(.invite) }
        }))
        let session = NucleoSession(fixtures: true, defaults: defaults)
        defer { session.teardown() }
        let id = try XCTUnwrap(glass.current(glass.moment(signedIn: false))?.id)
        let status = await glass.act(id, session: session)
        XCTAssertEqual(status, "done")
        XCTAssertTrue(cancelled)
        XCTAssertTrue(glass.isRetired(id), "the tap retired the line on the glass")
        XCTAssertEqual(session.sheet, .invite, "so the sheet with the saved invitation, its sign-in and Remove is what is left to show")
        XCTAssertEqual(center.pendingCode, "ABCD2345", "the invitation keeps waiting")
        XCTAssertNil(center.notice)

        // Later the person opens the same friend's link again.
        session.sheet = nil
        world.now.addTimeInterval(3_600)
        XCTAssertNil(glass.current(glass.moment(signedIn: false)), "until then the retired line stays quiet")
        XCTAssertTrue(center.receive(link("ABCD2345")))
        let again = try XCTUnwrap(glass.current(glass.moment(signedIn: false)))
        XCTAssertNotEqual(again.id, id, "opening the link again is the person's own act: the line comes back")
        XCTAssertTrue(again.id.hasPrefix("invite.abcd2345."))
        XCTAssertFalse(glass.isRetired(again.id))
        await center.idle()
        XCTAssertTrue(world.sent.isEmpty)
    }

    func testEverySignInAnswerExceptSignedInOpensTheSheetAndSignedInClaimsFirst() async {
        for status in ["cancelled", "failed", "unavailable"] {
            defaults.removeObject(forKey: InviteLinkCenter.storeKey)
            let world = World()
            world.user = nil
            let center = center(world)
            center.receive(link("ABCD2345"))
            var presented = 0
            await InviteNudges.finish(signIn: status, invites: center) { presented += 1 }
            XCTAssertEqual(presented, 1, status)
            XCTAssertEqual(center.pendingCode, "ABCD2345", status)
            XCTAssertTrue(world.sent.isEmpty, status)
        }
        defaults.removeObject(forKey: InviteLinkCenter.storeKey)
        let world = World()
        world.user = nil
        world.answer = { self.reply("not_new") }
        let center = center(world)
        center.receive(link("ABCD2345"))
        world.switchTo("account-a")
        var presented = 0
        await InviteNudges.finish(signIn: "signedIn", invites: center) { presented += 1 }
        XCTAssertEqual(world.codes, ["ABCD2345"])
        XCTAssertEqual(center.notice, .notNew)
        XCTAssertEqual(presented, 1, "the sheet says in words what the server answered")
    }

    // MARK: The answer, for a person who already has an account

    func testALinkOpenedWithAnAccountLeavesItsAnswerForTheGlassUntilTheSheetHasShownIt() async throws {
        NucleoFixtures.activate(scenario: "default", timeScale: 0.01)
        defer { NucleoFixtures.deactivate() }
        let world = World()
        world.answer = { self.reply("not_new") }
        let center = center(world)
        let glass = NudgeCenter(defaults: defaults)
        glass.now = { world.now }
        glass.register(InviteNudges.source(invites: { center }))
        XCTAssertNil(glass.current(glass.moment(signedIn: true)), "nothing to report yet")

        XCTAssertTrue(center.receive(link("ABCD2345")))
        await center.idle()
        XCTAssertEqual(center.notice, .notNew)
        XCTAssertEqual(center.answer, InviteAnswer(code: "ABCD2345", notice: .notNew, at: world.now))
        XCTAssertEqual(center.unreadAnswer, center.answer)
        XCTAssertEqual(storedAnswer?["code"] as? String, "ABCD2345")
        XCTAssertEqual(storedAnswer?["result"] as? String, "notNew")
        XCTAssertEqual(storedAnswer?["user"] as? String, "account-a")
        XCTAssertEqual(storedAnswer?["at"] as? Double, world.now.timeIntervalSince1970)
        XCTAssertEqual(storedAnswer?.count, 4, "the code, the answer, when, and whose it is: nothing else is kept")

        let nudge = try XCTUnwrap(glass.current(glass.moment(signedIn: true)))
        XCTAssertEqual(nudge.id, "invite.result.abcd2345.\(InviteNudges.stamp(world.now))")
        XCTAssertNotNil(nudge.id.range(of: NucleoNudge.idPattern, options: .regularExpression))
        XCTAssertEqual(nudge.text, L.t("The invitation you received was not accepted", "La invitación que recibiste no fue aceptada"))
        XCTAssertEqual(nudge.cta, L.t("See why", "Ver por qué"))
        XCTAssertNil(glass.current(glass.moment(signedIn: false)), "never for someone who is not that account")
        XCTAssertEqual(glass.current(glass.moment(signedIn: true)), nudge, "and still on the glass for the account it belongs to")

        // The tap opens the invite sheet, where the reason is in words; closing it is "read".
        let session = NucleoSession(fixtures: true, defaults: defaults)
        defer { session.teardown() }
        let status = await glass.act(nudge.id, session: session)
        XCTAssertEqual(status, "done")
        XCTAssertEqual(session.sheet, .invite)
        XCTAssertEqual(center.notice?.text, InviteNotice.notNew.text)
        XCTAssertEqual(world.sent.count, 1, "the tap sends nothing")
        center.acknowledgeNotice()
        XCTAssertNil(center.answer)
        XCTAssertNil(center.notice)
        XCTAssertNil(storedAnswer, "read once, then gone from the phone")
        world.now.addTimeInterval(3_600)
        XCTAssertNil(glass.current(glass.moment(signedIn: true)))
    }

    func testAnAcceptedInvitationIsReportedOnTheGlassInItsOwnWords() async throws {
        let world = World()
        let center = center(world)
        center.receive(link("ABCD2345"))
        await center.idle()
        let nudge = try XCTUnwrap(InviteNudges.nudge(signedIn: true, waiting: center.waiting, answer: center.unreadAnswer))
        XCTAssertTrue(nudge.id.hasPrefix(InviteNudges.resultPrefix))
        XCTAssertEqual(nudge.text, L.t("The invitation you received was accepted", "La invitación que recibiste fue aceptada"))
        XCTAssertEqual(nudge.cta, L.t("See details", "Ver detalles"))
    }

    func testTheUnreadAnswerSurvivesARelaunchForItsAccountOnly() async {
        let world = World()
        world.answer = { self.reply("inviter_full") }
        let first = center(world)
        first.receive(link("ABCD2345"))
        await first.idle()
        XCTAssertEqual(first.answer?.notice, .inviterFull)

        // Quit before anything was read; the same account opens the app the next day.
        world.now.addTimeInterval(86_400)
        let relaunched = center(world, observe: true)
        await relaunched.idle()
        XCTAssertEqual(relaunched.unreadAnswer?.notice, .inviterFull, "the person is still owed the answer")
        XCTAssertEqual(relaunched.unreadAnswer?.code, "ABCD2345")
        XCTAssertEqual(relaunched.notice, .inviterFull, "and the invite sheet shows it in words")
        XCTAssertEqual(world.sent.count, 1, "a settled invitation is not sent again")

        // A week after the answer it is not news any more.
        world.now.addTimeInterval(6 * 86_400)
        XCTAssertNil(relaunched.unreadAnswer)
        relaunched.appBecameActive()
        await relaunched.idle()
        XCTAssertNil(relaunched.answer)
        XCTAssertNil(relaunched.notice)
        XCTAssertNil(storedAnswer)
    }

    func testAnAnswerNeverReachesAnotherAccountOrASignedOutPhone() async {
        let world = World()
        world.answer = { self.reply("already_claimed") }
        let first = center(world)
        first.receive(link("ABCD2345"))
        await first.idle()
        XCTAssertNotNil(storedAnswer)

        // Another account on a relaunch: the record is removed, not shown.
        world.switchTo("account-b")
        let other = center(world)
        XCTAssertNil(other.answer)
        XCTAssertNil(other.notice)
        XCTAssertNil(storedAnswer)

        // Signing out (or deleting the account) in a running app.
        world.switchTo("account-a")
        let running = center(world)
        running.receive(link("WXYZ6789"))
        await running.idle()
        XCTAssertEqual(running.unreadAnswer?.code, "WXYZ6789")
        world.switchTo(nil)
        XCTAssertNil(running.unreadAnswer, "not even before the centre hears of the account change")
        running.accountDidChange()
        await running.idle()
        XCTAssertNil(running.answer)
        XCTAssertNil(storedAnswer, "the answer belonged to the account that left")

        // A record that is broken, or that carries a line the server never gives as final, is not an answer.
        world.switchTo("account-a")
        for record: [String: Any] in [["code": "ABCD2345", "result": "savedForLater", "at": world.now.timeIntervalSince1970, "user": "account-a"],
                                       ["code": "ABCDI345", "result": "notNew", "at": world.now.timeIntervalSince1970, "user": "account-a"],
                                       ["code": "ABCD2345", "result": "notNew", "at": Double.infinity, "user": "account-a"],
                                       ["code": "ABCD2345", "result": "notNew", "at": world.now.timeIntervalSince1970, "user": ""],
                                       ["code": "ABCD2345", "result": "notNew", "at": world.now.timeIntervalSince1970]] {
            defaults.set(record, forKey: InviteLinkCenter.answerKey)
            let center = center(world)
            XCTAssertNil(center.answer, "\(record)")
            XCTAssertNil(center.notice, "\(record)")
            XCTAssertNil(storedAnswer, "\(record)")
        }
    }

    func testANewerInvitationOrRemoveDropsTheOlderAnswer() async {
        let world = World()
        world.answer = { self.reply("not_new") }
        let center = center(world)
        center.receive(link("ABCD2345"))
        await center.idle()
        XCTAssertEqual(center.answer?.code, "ABCD2345")
        world.answer = { throw URLError(.timedOut) }
        center.receive(link("WXYZ6789"))
        XCTAssertNil(center.answer, "the new invitation gets its own answer")
        XCTAssertNil(storedAnswer)
        await center.idle()
        XCTAssertNil(center.answer, "an attempt that could not be settled is not an answer")

        world.now.addTimeInterval(61)
        world.answer = { self.reply("self") }
        center.appBecameActive()
        await center.idle()
        XCTAssertEqual(center.answer?.notice, .ownInvitation)
        center.forget()
        XCTAssertNil(center.answer)
        XCTAssertNil(storedAnswer)
    }

    func testEveryIdTheSourceCanProduceFitsTheBridge() {
        let alphabet = Array("ABCDEFGHJKLMNPQRSTUVWXYZ23456789")
        let dates = [Date(timeIntervalSince1970: 0), Date(timeIntervalSince1970: -5), Date(timeIntervalSince1970: 1_800_000_000),
                     Date(timeIntervalSince1970: 1e300), Date(timeIntervalSince1970: .infinity), Date(timeIntervalSince1970: .nan)]
        for start in stride(from: 0, to: alphabet.count, by: 8) {
            let code = String(alphabet[start..<start + 8])
            for date in dates {
                let waiting = InviteNudges.nudge(signedIn: false, waiting: InvitePending(code: code, at: date), answer: nil)
                XCTAssertNotNil(waiting?.id.range(of: NucleoNudge.idPattern, options: .regularExpression), waiting?.id ?? "nil")
                for notice in InviteNotice.final {
                    let result = InviteNudges.nudge(signedIn: true, waiting: nil, answer: InviteAnswer(code: code, notice: notice, at: date))
                    XCTAssertNotNil(result?.id.range(of: NucleoNudge.idPattern, options: .regularExpression), result?.id ?? "nil")
                    XCTAssertLessThanOrEqual(result?.id.count ?? 99, 48)
                }
            }
        }
        XCTAssertNotEqual(InviteNudges.stamp(Date(timeIntervalSince1970: 1_800_000_000)), InviteNudges.stamp(Date(timeIntervalSince1970: 1_800_000_001)))
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
        for (key, row) in NativeTranslations18.invite {
            XCTAssertEqual(Set(row.keys), ["fr", "pt", "it", "de"], key)
            XCTAssertEqual(NativeTranslations.rows[key], row, "an older row with the same key would win: \(key)")
        }
        // Every sentence the feature says exists in the four languages, whichever table holds its row
        // (a row another feature also needs, such as "Remove", may move to the shared table).
        let said = ["A friend invited you to Bobby", "Accept", "The invitation you received was accepted",
                    "The invitation you received was not accepted", "See details", "See why",
                    "Invitation accepted. It counts for the friend who invited you.", "That is your own invitation.",
                    "Invitations work for new accounts, during their first week.", "This account already accepted an invitation.",
                    "Your friend already invited all the friends allowed.", "That invitation code is not valid.",
                    "That invitation could not be applied.", "Sign in to accept an invitation.",
                    "Bobby could not check that code right now. It is saved and will be tried again.",
                    "Accept the risk notice first: until then Bobby sends nothing to its servers.",
                    "Have a code?", "Invitation code", "Apply", "Applying…", "Saved on this iPhone.", "Invitation ready",
                    "Remove", "Remove the saved invitation", "Your invitation code", "Copy code", "Share",
                    "You get {0} Pro days per new account.", "New accounts only, within their first week.",
                    "You get {0} days of Bobby Pro for each friend who creates an account with your invitation, up to {1} friends.",
                    "My invitation code: {0}"]
        for english in said {
            let row = NativeTranslations.rows[english] ?? [:]
            for language in ["fr", "pt", "it", "de"] {
                XCTAssertFalse((row[language] ?? "").isEmpty, "\(language): \(english)")
            }
        }
        // The button's "in progress" label reads as an action, not as the noun "app".
        XCTAssertEqual(NativeTranslations.rows["Applying…"]?["fr"], "Vérification…")
        XCTAssertEqual(NativeTranslations.rows["Applying…"]?["it"], "Verifica in corso…")
    }

#if DEBUG
    func testEveryScreenStateHasAReviewFixture() {
        let names = Set(V18QA.fixtures.keys)
        for name in ["invite-sheet", "invite-sheet-plain", "invite-signed-out", "invite-pending", "invite-result-saved",
                     "invite-consent-needed"] {
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
