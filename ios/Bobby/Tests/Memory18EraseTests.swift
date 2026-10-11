import Foundation
import XCTest
@testable import Bobby

/// Deletion is complete (1.8): "Forget" also takes the asset out of this phone's shortcuts, and
/// "Delete everything" also clears the shortcuts and the theses written on this phone, for the
/// account that asked and for nobody else. The phone's part never depends on the network, and the
/// screen is told honestly when the server did not confirm its part.
@MainActor
final class Memory18EraseTests: XCTestCase {
    private var suiteName = ""
    private var defaults: UserDefaults!
    private var user: String? = "a"
    private var generation = UUID()
    private var calls: [(path: String, method: String)] = []
    private var clock = Date(timeIntervalSince1970: 1_800_000_000)
    private var previousLanguage: Any?

    override func setUp() async throws {
        try await super.setUp()
        suiteName = "memory18.erase.tests.\(UUID().uuidString)"
        defaults = UserDefaults(suiteName: suiteName)
        user = "a"; generation = UUID(); calls = []
        clock = Date(timeIntervalSince1970: 1_800_000_000)
        previousLanguage = UserDefaults.standard.object(forKey: L.preferenceKey)
        UserDefaults.standard.set("en", forKey: L.preferenceKey)
    }

    override func tearDown() async throws {
        if let previousLanguage { UserDefaults.standard.set(previousLanguage, forKey: L.preferenceKey) }
        else { UserDefaults.standard.removeObject(forKey: L.preferenceKey) }
        defaults.removePersistentDomain(forName: suiteName)
        try await super.tearDown()
    }

    private func memoryJSON(_ symbols: [String] = ["NVDA", "BTC"], enabled: Bool = true) -> [String: Any] {
        ["enabled": enabled, "prefs": [String: Any](),
         "assets": symbols.map { ["symbol": $0, "asks": 2, "lastAskedAt": "2026-10-01T12:00:00.000Z", "lastHorizon": "week"] },
         "retentionDays": 90]
    }

    private func center(reply: @escaping (String, String) throws -> (json: Any?, status: Int)) -> MemoryCenter {
        let c = MemoryCenter(observeAccount: false, defaults: defaults)
        c.eraseCompanionNotes = {}
        c.currentUser = { [unowned self] in self.user }
        c.currentGeneration = { [unowned self] in self.generation }
        c.riskAccepted = { true }
        c.now = { [unowned self] in self.clock }
        c.send = { [unowned self] path, method, _ in
            self.calls.append((path, method))
            return try reply(path, method)
        }
        c.accountChanged(force: true)
        return c
    }

    private func online() -> MemoryCenter {
        center { [unowned self] path, method in
            guard method == "DELETE" else { return (self.memoryJSON(), 200) }
            let left: [String] = path.contains("symbol=") ? ["BTC"] : []
            return (self.memoryJSON(left), 200)
        }
    }

    private func offline() -> MemoryCenter { center { _, _ in throw URLError(.notConnectedToInternet) } }

    /// Shortcuts and theses for A, B and the signed-out phone.
    private func seed() throws {
        for owner in ["a", "b", nil] as [String?] {
            DeskMemory.setOwner(owner, defaults: defaults)
            let desk = DeskMemory(defaults: defaults)
            desk.recordQuery(symbol: "BTC", isEquity: false, now: clock.addingTimeInterval(-200))
            desk.recordQuery(symbol: "NVDA", isEquity: true, now: clock.addingTimeInterval(-100))
            desk.recordVisit(now: clock)
            try ThesisBook(defaults: defaults).create(
                ThesisDraft(symbol: "NVDA", name: "NVIDIA", isEquity: true, hypothesis: "Mine, \(owner ?? "local")"), owner: owner, now: clock)
        }
        DeskMemory.setOwner("a", defaults: defaults)
    }

    private func shortcuts(_ owner: String?) -> [String] { DeskMemory.watchlist(owner: owner, defaults: defaults).map(\.symbol) }
    private func theses(_ owner: String?) -> Int { ThesisBook(defaults: defaults).all(owner: owner).count }

    // MARK: The shortcut row

    func testDeskMemoryForgetsOneSymbolOrTheWholeRowForOneOwnerOnly() throws {
        try seed()
        XCTAssertEqual(shortcuts("a"), ["NVDA", "BTC"])
        XCTAssertTrue(DeskMemory.forget(symbol: "nvda", owner: "a", defaults: defaults), "tickers are stored uppercased")
        XCTAssertFalse(DeskMemory.forget(symbol: "NVDA", owner: "a", defaults: defaults), "it was already gone")
        XCTAssertEqual(shortcuts("a"), ["BTC"])
        XCTAssertEqual(shortcuts("b"), ["NVDA", "BTC"])
        XCTAssertEqual(shortcuts(nil), ["NVDA", "BTC"])
        DeskMemory.forgetWatchlist(owner: "a", defaults: defaults)
        XCTAssertTrue(shortcuts("a").isEmpty)
        XCTAssertEqual(shortcuts("b"), ["NVDA", "BTC"])
        XCTAssertEqual(shortcuts(nil), ["NVDA", "BTC"])
        XCTAssertEqual(DeskMemory(defaults: defaults).streak, 1, "the streak counts days, not assets: it stays")

        // The same two for whoever is current on this phone.
        DeskMemory.setOwner("b", defaults: defaults)
        let current = DeskMemory(defaults: defaults)
        XCTAssertTrue(current.forget(symbol: "BTC"))
        XCTAssertEqual(current.watchlist.map(\.symbol), ["NVDA"])
        XCTAssertEqual(current.quickAccess(fallback: ["ETH"], limit: 3), ["NVDA", "ETH"], "the forgotten asset is no longer a shortcut")
        current.forgetWatchlist()
        XCTAssertTrue(current.watchlist.isEmpty)
        XCTAssertEqual(shortcuts(nil), ["NVDA", "BTC"], "the signed-out row is not B's")
        DeskMemory.setOwner(nil, defaults: defaults)
        DeskMemory(defaults: defaults).forgetWatchlist()
        XCTAssertTrue(shortcuts(nil).isEmpty)
    }

    // MARK: Forget one

    func testForgetAlsoTakesTheAssetOutOfThisAccountsShortcuts() async throws {
        try seed()
        let c = online()
        await c.refresh()
        XCTAssertEqual(c.local, LocalMemory(shortcuts: ["NVDA", "BTC"], theses: 1))
        calls = []
        let ok = await c.forget("NVDA")
        XCTAssertTrue(ok)
        XCTAssertEqual(calls.map(\.path), ["api/memory?symbol=NVDA"])
        XCTAssertEqual(calls.map(\.method), ["DELETE"])
        XCTAssertEqual(shortcuts("a"), ["BTC"])
        XCTAssertEqual(c.local.shortcuts, ["BTC"])
        XCTAssertEqual(shortcuts("b"), ["NVDA", "BTC"], "B's phone-side memory is B's")
        XCTAssertEqual(shortcuts(nil), ["NVDA", "BTC"])
        XCTAssertEqual(theses("a"), 1, "forgetting one asset does not touch the theses")
        XCTAssertNil(c.notice, "the server confirmed: nothing to explain")
        XCTAssertEqual(c.snapshot?.assets.map(\.symbol), ["BTC"])
    }

    func testForgetStillClearsThePhoneWhenTheServerDoesNotAnswerAndSaysSo() async throws {
        try seed()
        let c = online()
        await c.refresh()
        c.send = { _, _, _ in throw URLError(.notConnectedToInternet) }
        let ok = await c.forget("NVDA")
        XCTAssertFalse(ok)
        XCTAssertEqual(shortcuts("a"), ["BTC"], "the phone's part needs no network")
        XCTAssertEqual(c.notice, .forgotOnPhoneOnly(symbol: "NVDA"))
        XCTAssertTrue(c.notice?.message.contains("NVDA") ?? false)
        XCTAssertEqual(c.snapshot?.assets.map(\.symbol), ["NVDA", "BTC"], "the list still shows what the server holds")
        XCTAssertEqual(c.lastError, .unavailable)
        let malformed = await c.forget("NVDA&symbol=")
        XCTAssertFalse(malformed)
        XCTAssertEqual(shortcuts("a"), ["BTC"], "a malformed symbol deletes nothing anywhere")
    }

    // MARK: Delete everything

    func testDeleteEverythingClearsServerShortcutsAndThesesForThisAccountOnly() async throws {
        try seed()
        let c = online()
        await c.refresh()
        calls = []
        var erasedNotes = 0
        c.eraseCompanionNotes = { erasedNotes += 1 }
        let unconfirmed = await c.confirmForgetAll()
        XCTAssertFalse(unconfirmed)
        XCTAssertEqual(erasedNotes, 0)
        XCTAssertEqual(shortcuts("a"), ["NVDA", "BTC"], "nothing is deleted without the confirmation")
        XCTAssertEqual(theses("a"), 1)
        c.requestForgetAll()
        c.cancelForgetAll()
        XCTAssertEqual(theses("a"), 1, "asking and cancelling delete nothing")
        XCTAssertTrue(calls.isEmpty)
        c.requestForgetAll()
        let ok = await c.confirmForgetAll()
        XCTAssertEqual(erasedNotes, 1)
        XCTAssertTrue(ok)
        XCTAssertEqual(calls.map(\.method), ["DELETE"])
        XCTAssertEqual(calls.first?.path, "api/memory", "a bare DELETE: the contract iOS 1.7 already uses")
        XCTAssertTrue(shortcuts("a").isEmpty)
        XCTAssertEqual(theses("a"), 0)
        XCTAssertEqual(c.local, LocalMemory())
        XCTAssertEqual(c.notice, .erasedEverything)
        XCTAssertEqual(c.snapshot?.assets.count, 0)
        XCTAssertEqual(shortcuts("b"), ["NVDA", "BTC"], "another account's shortcuts stay")
        XCTAssertEqual(theses("b"), 1, "another account's theses stay")
        XCTAssertEqual(shortcuts(nil), ["NVDA", "BTC"], "the signed-out row stays")
        XCTAssertEqual(theses(nil), 1)
        XCTAssertEqual(DeskMemory(defaults: defaults).streak, 1)
    }

    func testDeleteEverythingWorksOnThePhoneWhenTheServerIsUnreachableOrMemoryIsOff() async throws {
        // The server never answered: there is no snapshot, and the phone's part is still erasable.
        try seed()
        var c = offline()
        let loaded = await c.refresh()
        XCTAssertFalse(loaded)
        XCTAssertNil(c.snapshot)
        XCTAssertEqual(c.local, LocalMemory(shortcuts: ["NVDA", "BTC"], theses: 1), "what the phone keeps shows without the server")
        c.requestForgetAll()
        XCTAssertTrue(c.confirmingForgetAll)
        let confirmed = await c.confirmForgetAll()
        XCTAssertFalse(confirmed, "the server did not confirm")
        XCTAssertTrue(shortcuts("a").isEmpty)
        XCTAssertEqual(theses("a"), 0)
        XCTAssertEqual(c.notice, .erasedOnPhoneOnly, "and the screen says the server part is still there")
        XCTAssertEqual(theses("b"), 1)

        // Memory paused on the account and never turned on for this iPhone: deletion is still there.
        DeskMemory.setOwner("a", defaults: defaults)
        DeskMemory(defaults: defaults).recordQuery(symbol: "ETH", isEquity: false, now: clock)
        c = center { [unowned self] _, _ in (self.memoryJSON([], enabled: false), 200) }
        await c.refresh()
        XCTAssertFalse(c.nativeOptedIn)
        XCTAssertEqual(c.snapshot?.enabled, false)
        c.requestForgetAll()
        let erased = await c.confirmForgetAll()
        XCTAssertTrue(erased)
        XCTAssertTrue(shortcuts("a").isEmpty)
        XCTAssertEqual(c.notice, .erasedEverything)

        // Before the risk notice nothing reaches the network; the phone's part is still the person's to erase.
        DeskMemory(defaults: defaults).recordQuery(symbol: "SOL", isEquity: false, now: clock)
        calls = []
        c = online()
        c.riskAccepted = { false }
        c.requestForgetAll()
        let withoutConsent = await c.confirmForgetAll()
        XCTAssertFalse(withoutConsent)
        XCTAssertTrue(calls.isEmpty, "R11: no call")
        XCTAssertTrue(shortcuts("a").isEmpty)
        XCTAssertEqual(c.notice, .erasedOnPhoneOnly)

        // Signed out: there is no account whose memory this could be.
        user = nil; generation = UUID()
        c.accountChanged()
        c.requestForgetAll()
        XCTAssertFalse(c.confirmingForgetAll)
        XCTAssertEqual(shortcuts(nil), ["NVDA", "BTC"])
    }

    /// A guest asks before having an account: the phone keeps their shortcuts and theses under its own
    /// owner. The memory screen shows them and "Clear" removes the shortcuts, with no account and no call.
    func testSignedOutThePhonesOwnShortcutsShowAndCanBeCleared() async throws {
        try seed()
        user = nil; generation = UUID()
        DeskMemory.setOwner(nil, defaults: defaults)
        let c = online()
        XCTAssertEqual(c.local, LocalMemory(shortcuts: ["NVDA", "BTC"], theses: 1), "what the phone keeps for a guest is visible")
        c.reloadLocal()
        XCTAssertEqual(c.local.shortcuts, ["NVDA", "BTC"])
        c.clearShortcuts()
        XCTAssertTrue(shortcuts(nil).isEmpty, "the guest's row is gone")
        XCTAssertEqual(c.local, LocalMemory(shortcuts: [], theses: 1), "the theses are not shortcuts")
        XCTAssertTrue(calls.isEmpty, "nothing is sent: there is no account and nothing to tell a server")
        XCTAssertEqual(shortcuts("a"), ["NVDA", "BTC"], "an account's row on the same phone stays")
        XCTAssertEqual(shortcuts("b"), ["NVDA", "BTC"])
        XCTAssertEqual(theses("a"), 1)
        let refreshed = await c.refresh()
        XCTAssertFalse(refreshed)
        XCTAssertEqual(c.lastError, .signedOut)
        XCTAssertTrue(calls.isEmpty)
        let forgot = await c.forget("NVDA")
        XCTAssertFalse(forgot, "Forget is the account's: signed out it does nothing")
        // Signing in shows that account's own, not the guest's.
        user = "a"; generation = UUID()
        c.accountChanged()
        XCTAssertEqual(c.local, LocalMemory(shortcuts: ["NVDA", "BTC"], theses: 1))
        user = nil; generation = UUID()
        c.accountChanged()
        XCTAssertEqual(c.local, LocalMemory(shortcuts: [], theses: 1), "and signing out shows the guest's again")
    }

    func testALateDeleteReplyAfterAnAccountSwitchTouchesNothingOfTheNewAccount() async throws {
        try seed()
        let c = online()
        await c.refresh()
        let started = expectation(description: "A's delete is suspended")
        var pending: CheckedContinuation<(json: Any?, status: Int), Error>?
        c.send = { _, _, _ in try await withCheckedThrowingContinuation { pending = $0; started.fulfill() } }
        c.requestForgetAll()
        let task = Task { await c.confirmForgetAll() }
        await fulfillment(of: [started], timeout: 3)
        XCTAssertTrue(shortcuts("a").isEmpty, "A's phone part went first")
        user = "b"; generation = UUID()
        c.accountChanged()
        pending?.resume(returning: (memoryJSON([]), 200))
        let ok = await task.value
        XCTAssertFalse(ok)
        XCTAssertNil(c.notice, "B is not told about A's deletion")
        XCTAssertNil(c.snapshot)
        XCTAssertEqual(shortcuts("b"), ["NVDA", "BTC"])
        XCTAssertEqual(theses("b"), 1)
        XCTAssertEqual(c.local, LocalMemory(shortcuts: ["NVDA", "BTC"], theses: 1), "the screen now shows B's own phone-side memory")
        XCTAssertFalse(c.confirmingForgetAll)
    }

    // MARK: The phone-only section and the receipt

    func testClearingTheShortcutsSendsNothingAndKeepsTheTheses() async throws {
        try seed()
        let c = online()
        c.clearShortcuts()
        XCTAssertTrue(calls.isEmpty, "the shortcuts never were on a server")
        XCTAssertTrue(shortcuts("a").isEmpty)
        XCTAssertEqual(c.local, LocalMemory(shortcuts: [], theses: 1))
        XCTAssertEqual(shortcuts("b"), ["NVDA", "BTC"])
        // A thesis written elsewhere in the app shows after a reload.
        try ThesisBook(defaults: defaults).create(ThesisDraft(symbol: "BTC", name: "Bitcoin", isEquity: false, hypothesis: "Another"), owner: "a", now: clock)
        c.reloadLocal()
        XCTAssertEqual(c.local.theses, 2)
    }

    func testAReceiptStopsBeingTrueOnceItsAssetOrEverythingWasErased() async throws {
        try seed()
        let c = online()
        await c.refresh()
        let readAt = clock
        XCTAssertFalse(c.erased(since: readAt, symbol: "NVDA"))
        clock.addTimeInterval(60)
        await c.forget("BTC")
        XCTAssertTrue(c.erased(since: readAt, symbol: "btc"))
        XCTAssertFalse(c.erased(since: readAt, symbol: "NVDA"), "only the asset that was forgotten")
        XCTAssertFalse(c.erased(since: clock.addingTimeInterval(60), symbol: "BTC"), "a later read speaks again")
        clock.addTimeInterval(60)
        c.requestForgetAll()
        await c.confirmForgetAll()
        XCTAssertTrue(c.erased(since: readAt, symbol: "NVDA"))
        XCTAssertFalse(c.erased(since: clock.addingTimeInterval(1), symbol: "NVDA"))
        user = "b"; generation = UUID()
        XCTAssertFalse(c.erased(since: readAt, symbol: "NVDA"), "B erased nothing")
    }

    func testTheNoticesSayWhatHappenedInTheAppsOwnWords() {
        XCTAssertTrue(MemoryNotice.erasedEverything.message.contains("the shortcuts on this iPhone and the theses you wrote here"))
        XCTAssertTrue(MemoryNotice.erasedEverything.message.contains("follow-up notes"), "what the phone kept for follow-ups goes too, and it says so")
        XCTAssertTrue(MemoryNotice.erasedOnPhoneOnly.message.contains("did not confirm"))
        XCTAssertTrue(MemoryNotice.forgotOnPhoneOnly(symbol: "BRK.B").message.contains("BRK.B"))
    }
}
