import Foundation
import XCTest
@testable import Bobby

/// Credits (1.8): the rules of the screen, apart from how it is drawn. Nothing is fetched and the
/// store is not started before the risk notice; signed out, Restore explains before any Apple
/// sheet; after the sign in the restore runs and shows as running at once; an answer that arrives
/// for a previous account is dropped.
@MainActor
final class CreditsFlowTests: XCTestCase {
    private var riskAccepted = true
    private var signedIn = true
    private var epoch = UUID()
    private var known = true
    private var outcome: BobbyStore.Outcome = .subscribed
    /// What the flow asked for, in order.
    private var calls: [String] = []
    /// Runs inside the store call, while the flow is waiting for it.
    private var duringRestore: (() -> Void)?
    private var duringLoad: (() -> Void)?
    /// When set, the store call stays open until `gate` is resumed.
    private var holdRestore = false
    private var gate: CheckedContinuation<Void, Never>?

    override func setUp() async throws {
        try await super.setUp()
        riskAccepted = true
        signedIn = true
        epoch = UUID()
        known = true
        outcome = .subscribed
        calls = []
        duringRestore = nil
        duringLoad = nil
        holdRestore = false
        gate = nil
    }

    private func flow() -> CreditsFlow {
        CreditsFlow(CreditsFlow.Environment(
            riskAccepted: { [unowned self] in self.riskAccepted },
            signedIn: { [unowned self] in self.signedIn },
            epoch: { [unowned self] in self.epoch },
            load: { [unowned self] in
                self.calls.append("load")
                self.duringLoad?()
                return self.known
            },
            restore: { [unowned self] in
                self.calls.append("restore")
                self.duringRestore?()
                if self.holdRestore { await withCheckedContinuation { self.gate = $0 } }
                return self.outcome
            },
            afterSignIn: { [unowned self] in self.calls.append("afterSignIn") }))
    }

    // MARK: Before the risk notice

    func testBeforeTheRiskNoticeNothingIsFetchedAndTheStoreIsNotStarted() async {
        riskAccepted = false
        let flow = flow()
        await flow.refresh()
        XCTAssertEqual(calls, [], "no request before the notice (R11)")
        XCTAssertFalse(flow.loading)
        XCTAssertFalse(flow.loadFailed, "nothing was asked, so nothing failed")

        await flow.tapRestore()
        XCTAssertEqual(calls, [], "the store is not started and nothing is sent")
        XCTAssertEqual(flow.restore, .idle, "the reason is already on the screen under the row; the tap changes nothing")

        signedIn = false
        await flow.tapRestore()
        XCTAssertEqual(flow.restore, .idle, "not even the sign-in explanation: the notice comes first")

        var completed = false
        await flow.signIn(thenRestore: true) { completed = true }
        XCTAssertFalse(completed, "an Apple answer is not sent to the server before the notice")
        XCTAssertEqual(calls, [])
        XCTAssertEqual(flow.restore, .idle)
    }

    func testOnceTheNoticeIsAcceptedTheSameTapRestores() async {
        riskAccepted = false
        let flow = flow()
        await flow.tapRestore()
        XCTAssertEqual(calls, [])
        riskAccepted = true
        await flow.tapRestore()
        XCTAssertEqual(calls, ["restore", "load"], "nothing more than the notice and a Bobby account is needed")
        XCTAssertEqual(flow.restore, .done(.subscribed))
    }

    // MARK: Reading the balances

    func testTheBalancesAreReadAndAFailureWithNothingKnownIsSaid() async {
        let flow = flow()
        duringLoad = { XCTAssertTrue(flow.loading, "the screen shows it is reading") }
        await flow.refresh()
        XCTAssertEqual(calls, ["load"])
        XCTAssertFalse(flow.loading)
        XCTAssertFalse(flow.loadFailed)

        known = false
        await flow.refresh()
        XCTAssertTrue(flow.loadFailed, "nothing read and nothing known: the screen says so and offers Try again")
        known = true
        await flow.refresh()
        XCTAssertFalse(flow.loadFailed)
    }

    // MARK: Restore, signed in

    func testSignedInATapRunsTheRestoreThenReadsWhatTheAccountHasNow() async {
        let flow = flow()
        outcome = .nothingToRestore
        duringRestore = { XCTAssertEqual(flow.restore, .running, "the row shows it is working while the store answers") }
        await flow.tapRestore()
        XCTAssertEqual(calls, ["restore", "load"], "the balances are read again before the sentence is chosen")
        XCTAssertEqual(flow.restore, .done(.nothingToRestore))

        // Try again.
        outcome = .failed("Bobby couldn’t confirm your subscription right now.")
        await flow.tapRestore()
        XCTAssertEqual(flow.restore, .done(.failed("Bobby couldn’t confirm your subscription right now.")))
        outcome = .pending
        await flow.tapRestore()
        XCTAssertEqual(flow.restore, .done(.pending))
        XCTAssertEqual(calls.filter { $0 == "restore" }.count, 3)
    }

    func testASecondTapWhileTheStoreIsAnsweringStartsNothing() async {
        let flow = flow()
        holdRestore = true
        let first = Task { @MainActor in await flow.tapRestore() }
        for _ in 0..<200 where gate == nil { await Task.yield() }
        XCTAssertNotNil(gate, "the store call is open")
        XCTAssertEqual(flow.restore, .running)

        await flow.tapRestore()
        XCTAssertEqual(calls, ["restore"], "the store is not asked twice")
        XCTAssertEqual(flow.restore, .running)

        gate?.resume()
        gate = nil
        await first.value
        XCTAssertEqual(calls, ["restore", "load"])
        XCTAssertEqual(flow.restore, .done(.subscribed))
    }

    func testACancelledAppleSheetLeavesTheRowAsItWas() async {
        let flow = flow()
        outcome = .cancelled
        await flow.tapRestore()
        XCTAssertEqual(flow.restore, .idle)
    }

    // MARK: Restore, signed out

    func testSignedOutATapExplainsBeforeAnyAppleSheet() async {
        signedIn = false
        let flow = flow()
        await flow.tapRestore()
        XCTAssertEqual(flow.restore, .signedOut, "the explanation and the sign-in button come first")
        XCTAssertEqual(calls, [], "the store's own Apple sheet is never raised by this tap")
        let notice = CreditsRestoreNotice.make(flow.restore, pro: CreditsProStatus(), proPurchasable: true)
        XCTAssertEqual(notice?.action, .signIn)
    }

    func testAfterTheSignInTheRestoreRunsAndShowsAsRunningAtOnce() async {
        signedIn = false
        let flow = flow()
        await flow.tapRestore()
        XCTAssertEqual(flow.restore, .signedOut)

        var seen: [CreditsRestoreState] = []
        duringLoad = { seen.append(flow.restore) }
        duringRestore = { seen.append(flow.restore) }
        await flow.signIn(thenRestore: true) { [unowned self] in
            // The Apple sheet answered and the account exists; the session publishes on the way.
            self.signedIn = true
            self.epoch = UUID()
            flow.accountChanged()
        }
        XCTAssertEqual(calls, ["afterSignIn", "load", "restore", "load"])
        XCTAssertEqual(seen, [.running, .running, .running], "working from the moment the account exists, not two requests later")
        XCTAssertEqual(flow.restore, .done(.subscribed))
    }

    func testASignInThatDidNotFinishStartsNothing() async {
        signedIn = false
        let flow = flow()
        await flow.tapRestore()
        await flow.signIn(thenRestore: true) { }
        XCTAssertEqual(calls, [], "no account, no restore")
        XCTAssertEqual(flow.restore, .signedOut, "the explanation and the button stay for another try")
    }

    func testASignInFromTheBalanceLinesReadsTheAccountAndDoesNotRestore() async {
        signedIn = false
        let flow = flow()
        await flow.signIn(thenRestore: false) { [unowned self] in self.signedIn = true; self.epoch = UUID() }
        XCTAssertEqual(calls, ["afterSignIn", "load"])
        XCTAssertEqual(flow.restore, .idle)
    }

    // MARK: Whose answer

    func testAnAnswerForAPreviousAccountIsDropped() async {
        let flow = flow()
        duringRestore = { [unowned self] in self.epoch = UUID() }
        await flow.tapRestore()
        XCTAssertEqual(flow.restore, .idle, "the store answered about an account that is no longer the one on screen")
        XCTAssertEqual(calls, ["restore"])

        // The account changes while the balances are read after the store answered.
        calls = []
        duringRestore = nil
        duringLoad = { [unowned self] in self.epoch = UUID() }
        await flow.tapRestore()
        XCTAssertEqual(flow.restore, .idle)
    }

    func testAnotherAccountClearsTheLastAnswerButNotARestoreAtWork() async {
        let flow = flow()
        outcome = .nothingToRestore
        await flow.tapRestore()
        XCTAssertEqual(flow.restore, .done(.nothingToRestore))
        flow.accountChanged()
        XCTAssertEqual(flow.restore, .idle, "the last answer was about someone else")

        duringRestore = {
            flow.accountChanged()
            XCTAssertEqual(flow.restore, .running, "a restore at work is not wiped from under its own answer")
        }
        await flow.tapRestore()
    }
}
