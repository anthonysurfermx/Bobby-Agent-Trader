import XCTest
import Combine
@testable import Bobby

@MainActor
final class CompanionStabilityTests: XCTestCase {
    private let epoch = Date(timeIntervalSince1970: 1_792_000_000)
    private var calendar: Calendar { var c=Calendar(identifier:.gregorian);c.timeZone=TimeZone(secondsFromGMT:0)!;return c }
    func testMovingTheClockBackNeverAdvancesTheMemoryDay() {
        var now=epoch
        let store=CompanionContextStore(read:{nil},write:{_ in true},clock:{now})
        store.choose(true,now:now,calendar:calendar);now += 86400;store.opened(now:now,calendar:calendar)
        let day=store.state.day,last=store.state.lastOpen
        now -= 172800;store.opened(now:now,calendar:calendar)
        XCTAssertEqual(store.state.day,day);XCTAssertEqual(store.state.lastOpen,last)
        now += 172800;store.opened(now:now,calendar:calendar);XCTAssertEqual(store.state.day,day)
    }
    func testMovingTheClockBackDoesNotReleaseTheDailyChipBudget() {
        let name="CompanionStabilityTests."+UUID().uuidString;let defaults=UserDefaults(suiteName:name)!;defer{defaults.removePersistentDomain(forName:name)}
        var now=epoch
        let pacing=CompanionPacing(defaults:defaults,clock:{now})
        pacing.shown("question",now:now,calendar:calendar);pacing.shown("question",now:now,calendar:calendar)
        let high=pacing.state.day;now -= 86400
        XCTAssertFalse(pacing.delivered(now:now,calendar:calendar));XCTAssertEqual(pacing.state.day,high)
        now += 86400;XCTAssertFalse(pacing.delivered(now:now,calendar:calendar))
        now += 86400;XCTAssertTrue(pacing.delivered(now:now,calendar:calendar))
    }
    func testExpiredNoteCannotBeRestoredConfirmedOrCorrected() {
        var now=epoch
        let store=CompanionContextStore(read:{nil},write:{_ in true},clock:{now});store.choose(true)
        let note=CompanionContextStore.Note(field:"barrier",value:"words",source:"inferred",createdAt:now,expiresAt:now.addingTimeInterval(1))
        XCTAssertTrue(store.restore(note));now += 2
        XCTAssertFalse(store.confirm(note.field));XCTAssertFalse(store.correct(note.field,value:"unsure"))
        _=store.delete(note.field);XCTAssertFalse(store.restore(note))
    }
    func testExpiredSavedRecordIsRemovedWhenLoadedEvenIfStorageIsUnavailable() throws {
        var state=CompanionContextStore.State();state.notice=CompanionContextStore.notice;state.accepted=true
        state.notes=[.init(field:"interest",value:"crypto",source:"said",createdAt:epoch.addingTimeInterval(-2),expiresAt:epoch)]
        state.asked=["interest"];let data=try JSONEncoder().encode(state)
        let store=CompanionContextStore(read:{data},write:{_ in false},clock:{self.epoch})
        XCTAssertTrue(store.state.notes.isEmpty);XCTAssertFalse(store.state.asked.contains("interest"));XCTAssertTrue(store.storageError)
    }
    func testAVisibleNoteExpiresWithoutASecondOpenOrARequest() async {
        var now=epoch
        let store=CompanionContextStore(read:{nil},write:{_ in true},clock:{now});store.choose(true)
        let note=CompanionContextStore.Note(field:"interest",value:"crypto",source:"said",createdAt:now,expiresAt:now.addingTimeInterval(0.03))
        XCTAssertTrue(store.restore(note));let expired=expectation(description:"live note expires")
        let subscription=store.$state.dropFirst().filter{$0.notes.isEmpty}.prefix(1).sink{_ in expired.fulfill()}
        now += 1
        await fulfillment(of:[expired],timeout:1)
        withExtendedLifetime(subscription){}
        XCTAssertTrue(store.state.notes.isEmpty)
    }
    func testVisibleExpiryDoesNotRenewWhenTheDeviceDateMovesBack() async {
        var now=epoch,tick:Double=0
        let store=CompanionContextStore(read:{nil},write:{_ in true},clock:{now},elapsed:{tick});store.choose(true)
        let note=CompanionContextStore.Note(field:"interest",value:"crypto",source:"said",createdAt:now,expiresAt:now.addingTimeInterval(0.03))
        XCTAssertTrue(store.restore(note));let expired=expectation(description:"monotonic expiry")
        let subscription=store.$state.dropFirst().filter{$0.notes.isEmpty}.prefix(1).sink{_ in expired.fulfill()}
        now -= 86400;tick += 1
        await fulfillment(of:[expired],timeout:1);withExtendedLifetime(subscription){}
        XCTAssertTrue(store.state.notes.isEmpty);XCTAssertFalse(store.restore(note))
    }

    func testExpiredNotesNeverReachTheWireWhenTheDateMovesBackAndStorageFails() {
        var now=epoch,tick:Double=0,writable=true
        let store=CompanionContextStore(read:{nil},write:{_ in writable},clock:{now},elapsed:{tick});store.choose(true)
        let note=CompanionContextStore.Note(field:"barrier",value:"words",source:"inferred",createdAt:now,expiresAt:now.addingTimeInterval(1))
        XCTAssertTrue(store.restore(note));store.answer("barrier",value:nil)
        now -= 86400;tick += 2;writable=false
        let capability=CompanionPilot.Capability(enabled:true,known:true,context:true,catalog:1,notices:[CompanionContextStore.notice])
        let wire=store.wire(capability:capability)!
        XCTAssertEqual((wire["notes"] as? [[String:Any]])?.count,0)
        XCTAssertFalse((wire["asked"] as! [String]).contains("barrier"))
        XCTAssertTrue(store.state.notes.isEmpty);XCTAssertTrue(store.storageError)
    }

    func testBothDisciplineAwardPathsUseTheirInjectedClock() {
        let name="CompanionStabilityTests.awards."+UUID().uuidString,defaults=UserDefaults(suiteName:name)!
        defer {defaults.removePersistentDomain(forName:name)}
        let store=CompanionStore(defaults:defaults,clock:{self.epoch})
        XCTAssertEqual(store.awardDiscipline(10),10)
        XCTAssertEqual(store.awardDisciplineEvent(10).points,10)
        XCTAssertEqual(store.pendingAwards.map(\.at),Array(repeating:ISO8601DateFormatter().string(from:epoch),count:2))
    }

}
