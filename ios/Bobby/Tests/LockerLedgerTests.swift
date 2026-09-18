import XCTest
@testable import Bobby

/// The locker's numbers come from the real roster and XP ladder:
/// 18 companions × (3 tools + 1 pet), tools at 1 / 100 / 200 XP, pet at 500,
/// companions reachable by level (0 / 50 / 150 / 400 / 1000 XP) or because they are yours.
final class LockerLedgerTests: XCTestCase {
    private func companion(_ id: String) -> Companion { bobbyCompanions.first { $0.id == id }! }

    func testEveryCompanionHasFourItems() {
        for c in bobbyCompanions {
            XCTAssertEqual(LockerLedger.items(for: c).count, 4, "\(c.id) must have 3 tools and a pet")
        }
        XCTAssertEqual(LockerLedger.count(ownId: "kora", xp: 0).total, 72)
    }

    func testOwnedCountFollowsTheLadder() {
        let expected: [Int: Int] = [0: 0, 1: 10, 50: 12, 100: 24, 150: 30, 200: 45, 400: 51, 500: 68, 1000: 72]
        for (xp, owned) in expected {
            XCTAssertEqual(LockerLedger.count(ownId: "kora", xp: xp).owned, owned, "at \(xp) XP")
        }
    }

    func testYourOwnCompanionIsAlwaysReachable() {
        // GLITCH needs level 2 (50 XP); as your friend it counts from the first read.
        XCTAssertEqual(LockerLedger.count(ownId: "glitch", xp: 1).owned, 11)
    }

    func testLockedCompanionPricesItsLevelFirst() {
        let vega = companion("vega")   // level 3 = 150 XP
        let chips = LockerLedger.items(for: vega).map { LockerLedger.state($0, ownId: "kora", xp: 130) }
        XCTAssertEqual(chips, [.needsLevel(level: 3, xp: 20), .needsLevel(level: 3, xp: 20),
                               .needsLevel(level: 3, xp: 70), .needsLevel(level: 3, xp: 370)])
    }

    func testReachableCompanionPricesXPOnly() {
        let kora = companion("kora")
        let states = LockerLedger.items(for: kora).map { LockerLedger.state($0, ownId: "kora", xp: 130) }
        XCTAssertEqual(states, [.owned, .owned, .needsXP(70), .needsXP(370)])
        XCTAssertEqual(LockerLedger.state(LockerLedger.items(for: kora)[0], ownId: "kora", xp: 0), .firstRead)
    }

    func testNextUpIsTheClosestDrop() {
        let next = LockerLedger.nextUp(companion("kora"), ownId: "kora", xp: 130)
        XCTAssertEqual(next?.id, "kora-3")
        XCTAssertEqual(next?.progress ?? -1, 0.3, accuracy: 0.0001)
        XCTAssertNil(LockerLedger.nextUp(companion("vega"), ownId: "kora", xp: 130), "locked pages have no next-up")
        XCTAssertNil(LockerLedger.nextUp(companion("kora"), ownId: "kora", xp: 1000), "nothing left at max")
    }

    func testOrderIsYoursThenByLevel() {
        XCTAssertEqual(LockerLedger.order(ownId: "kora").map(\.id),
                       ["kora", "orb", "byte", "zip", "iris", "sol", "zuri", "mira", "nalu", "keo",
                        "glitch", "momo", "flux", "rook", "vega", "halo", "noor", "axiom"])
        XCTAssertEqual(LockerLedger.order(ownId: nil).count, 18)
    }

    /// A new phone: the locker is opened at 0 XP, then sign-in restores 1,000 XP.
    /// The account's items are not "new"; a drop in a later sync still is.
    func testFirstServerReconcileRebaselinesTheSeenSet() {
        let d = UserDefaults.standard
        let keys = ["companion.id", "companion.disciplineXP", "companion.syncedAt", "companion.ownerUserId", LockerSeen.key]
        let saved = keys.map { d.object(forKey: $0) }
        defer { for (k, v) in zip(keys, saved) { if let v { d.set(v, forKey: k) } else { d.removeObject(forKey: k) } } }
        keys.forEach { d.removeObject(forKey: $0) }
        d.set("kora", forKey: "companion.id")

        let store = CompanionStore()
        LockerSeen.seedIfNeeded(ownId: "kora", xp: 0)
        func server(_ xp: Int) -> ServerProgress {
            ServerProgress(xp: xp, streak: 0, aura: 0, routeIndex: 0, lastDay: nil, dailyAwards: 0, dailyAwardsDay: nil, companionId: "kora")
        }
        store.applyServer(server(400), acknowledged: [])
        XCTAssertEqual(LockerSeen.unseen(ownId: "kora", xp: 400, raw: d.string(forKey: LockerSeen.key)), [])

        store.applyServer(server(500), acknowledged: [])
        let later = LockerSeen.unseen(ownId: "kora", xp: 500, raw: d.string(forKey: LockerSeen.key))
        XCTAssertEqual(later.count, 17, "the 17 reachable pets drop at 500 XP and stay new")
        XCTAssertTrue(later.allSatisfy { $0.hasPrefix("pet-") })
    }

    func testSeenSetSeedsOnceAndOnlyFlagsLaterDrops() {
        let defaults = UserDefaults(suiteName: "locker-tests-\(UUID().uuidString)")!
        LockerSeen.mark(["kora-1"], defaults: defaults)
        XCTAssertNil(defaults.string(forKey: LockerSeen.key), "mark is a no-op before the first open")
        XCTAssertEqual(LockerSeen.unseen(ownId: "kora", xp: 130, raw: nil), [])

        LockerSeen.seedIfNeeded(ownId: "kora", xp: 130, defaults: defaults)
        let raw = defaults.string(forKey: LockerSeen.key)
        XCTAssertEqual(LockerSeen.unseen(ownId: "kora", xp: 130, raw: raw), [], "a first open shows no NEW")

        // 130 → 200 XP: the 15 reachable golden pieces drop, and level 3 opens
        // FLUX, ROOK and VEGA with their first two pieces already earned.
        let later = LockerSeen.unseen(ownId: "kora", xp: 200, raw: raw)
        XCTAssertEqual(later.count, 21)
        XCTAssertEqual(later.filter { $0.hasSuffix("-3") }.count, 15)
        XCTAssertTrue(later.isSuperset(of: ["flux-1", "flux-2", "rook-1", "rook-2", "vega-1", "vega-2"]))

        LockerSeen.mark(["kora-3"], defaults: defaults)
        XCTAssertFalse(LockerSeen.unseen(ownId: "kora", xp: 200, raw: defaults.string(forKey: LockerSeen.key)).contains("kora-3"))
        LockerSeen.seedIfNeeded(ownId: "kora", xp: 1000, defaults: defaults)
        XCTAssertEqual(LockerSeen.unseen(ownId: "kora", xp: 200, raw: defaults.string(forKey: LockerSeen.key)).count, 20,
                       "seeding never runs twice")
    }
}
