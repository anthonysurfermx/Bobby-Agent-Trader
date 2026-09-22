import XCTest
@testable import Bobby

final class CompanionEquipmentTests: XCTestCase {
    private var defaults: UserDefaults!
    private var suite: String!

    override func setUp() {
        suite = "equipment-tests-\(UUID().uuidString)"
        defaults = UserDefaults(suiteName: suite)!
        defaults.set("momo", forKey: "companion.id")
        defaults.set(2000, forKey: "companion.disciplineXP")
    }
    override func tearDown() { defaults.removePersistentDomain(forName: suite) }
    private var momo: Companion { bobbyCompanions.first { $0.id == "momo" }! }
    private var binoculars: CatalogItem { LockerLedger.items(for: momo)[1] }
    private func server(_ xp: Int, companion: String = "momo") -> ServerProgress {
        ServerProgress(xp: xp, streak: 0, aura: 0, routeIndex: 0, lastDay: nil, dailyAwards: 0, dailyAwardsDay: nil, companionId: companion)
    }

    func testEveryCompanionCanStoreAndReequipEveryEarnedItemWithoutLosingInventory() {
        let store = CompanionStore(defaults: defaults)
        let owned = LockerLedger.ownedIds(ownId: store.companionId, xp: store.disciplineXP)
        for companion in bobbyCompanions {
            for item in LockerLedger.items(for: companion) {
                XCTAssertTrue(store.isEquipped(item), item.id)
                store.setEquipped(false, item: item)
                XCTAssertFalse(store.isEquipped(item), item.id)
                XCTAssertFalse(store.wornGear(for: companion.id).contains { $0.id == item.id })
                if item.isPet { XCTAssertNil(store.wornPet(for: companion.id)) }
                store.setEquipped(true, item: item)
                XCTAssertTrue(store.isEquipped(item), item.id)
            }
        }
        XCTAssertEqual(store.disciplineXP, 2000)
        XCTAssertEqual(LockerLedger.ownedIds(ownId: store.companionId, xp: store.disciplineXP), owned)
        XCTAssertTrue(store.pendingAwards.isEmpty)
    }

    func testMomoChoiceSurvivesRelaunchAvatarChangesAndServerReconciliation() {
        let store = CompanionStore(defaults: defaults)
        store.setEquipped(false, item: binoculars)
        store.companionId = "byte"
        store.applyServer(server(2300, companion: "byte"), acknowledged: [])
        let restored = CompanionStore(defaults: defaults)
        restored.companionId = "momo"
        XCTAssertFalse(restored.isEquipped(binoculars))
        XCTAssertEqual(restored.wornGear(for: "momo").map(\.id), ["momo-1", "momo-3"])
        XCTAssertEqual(restored.wornGear(for: "byte").count, 3)
        XCTAssertEqual(restored.disciplineXP, 2300)
    }

    func testLockedItemsCannotBeEquippedOrStoredBeforeBeingEarned() {
        defaults.set(0, forKey: "companion.disciplineXP")
        let store = CompanionStore(defaults: defaults)
        store.setEquipped(true, item: binoculars)
        store.setEquipped(false, item: binoculars)
        XCTAssertFalse(store.isEquipped(binoculars))
        XCTAssertTrue(store.unequippedItemIDs.isEmpty)
        XCTAssertTrue(store.wornGear(for: "momo").isEmpty)
        XCTAssertNil(store.wornPet(for: "momo"))
        store.applyServer(server(100), acknowledged: [])
        XCTAssertTrue(store.isEquipped(binoculars))
    }

    func testOutfitsFollowTheLocalAccountAndDeletionForgetsItsChoice() {
        let store = CompanionStore(defaults: defaults)
        store.setEquipped(false, item: binoculars)
        store.bind(to: "account-a")
        XCTAssertFalse(store.isEquipped(binoculars), "First sign-in adopts the guest outfit")
        store.bind(to: "account-b")
        store.applyServer(server(2000), acknowledged: [])
        XCTAssertTrue(store.isEquipped(binoculars), "Another account has its own outfit")
        store.bind(to: "account-a")
        store.applyServer(server(2000), acknowledged: [])
        XCTAssertFalse(store.isEquipped(binoculars))
        store.unbind()
        store.bind(to: "account-a")
        store.applyServer(server(2000), acknowledged: [])
        XCTAssertFalse(store.isEquipped(binoculars), "Signing back in restores the saved choice")
        store.forgetAccount("account-a")
        XCTAssertNil(defaults.object(forKey: "companion.unequippedItems.v1.account-a"))
    }

    func testAnEntireOutfitCanBeEmptyWhileItsCollectionRemainsOwned() {
        let store = CompanionStore(defaults: defaults)
        for item in LockerLedger.items(for: momo) { store.setEquipped(false, item: item) }
        XCTAssertTrue(store.wornGear(for: "momo").isEmpty)
        XCTAssertNil(store.wornPet(for: "momo"))
        XCTAssertTrue(LockerLedger.items(for: momo).allSatisfy { LockerLedger.state($0, ownId: "momo", xp: store.disciplineXP) == .owned })
    }
}
