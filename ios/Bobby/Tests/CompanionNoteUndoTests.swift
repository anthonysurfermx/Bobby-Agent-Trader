import XCTest
@testable import Bobby

@MainActor
final class CompanionNoteUndoTests: XCTestCase {
    private let epoch = Date(timeIntervalSince1970: 1_790_000_000)
    private func note() -> CompanionContextStore.Note {
        .init(field: "interest", value: "crypto", source: "inferred", createdAt: epoch, expiresAt: epoch.addingTimeInterval(7 * 86400))
    }
    func testDismissalStartsFiveSecondsAndOldTimerCannotClearNewUndo() {
        var now: TimeInterval = 0; let undo = CompanionNoteUndo(elapsed: { now })
        undo.stage(note(), index: 1); now += 20
        XCTAssertNil(undo.note); XCTAssertNil(undo.deadline)
        undo.didDismiss(voiceOver: false); XCTAssertEqual(undo.deadline, now + 5)
        let old = undo.generation; now += 4.999; undo.expire(old); XCTAssertNotNil(undo.note)
        now = undo.deadline!; undo.expire(old); XCTAssertNil(undo.note)
        undo.stage(note(), index: 0); undo.didDismiss(voiceOver: false); now += 10
        undo.expire(old); XCTAssertNotNil(undo.note)
        undo.expire(undo.generation); XCTAssertNil(undo.note)
    }
    func testCloseOrBackgroundDiscardsStagedAndVisibleUndo() {
        let undo = CompanionNoteUndo(elapsed: { 0 })
        undo.stage(note(), index: 0); undo.clear(); undo.didDismiss(voiceOver: false); XCTAssertNil(undo.note)
        undo.stage(note(), index: 0); undo.didDismiss(voiceOver: false); undo.clear(); XCTAssertNil(undo.note)
    }
    func testVoiceOverUndoWaitsForNextActionAndRestoresExactSourceAndExpiry() {
        var now: TimeInterval = 0; let undo = CompanionNoteUndo(elapsed: { now })
        let store = CompanionContextStore(read: { nil }, write: { _ in true }, clock: { self.epoch })
        store.choose(true, now: epoch)
        let neighbor = CompanionContextStore.Note(field:"barrier", value:"words", source:"inferred", createdAt:epoch, expiresAt:epoch.addingTimeInterval(7 * 86400))
        XCTAssertTrue(store.restore(neighbor))
        undo.stage(note(), index: 0); undo.didDismiss(voiceOver: true); now += 600
        undo.expire(undo.generation); XCTAssertEqual(undo.note, note()); XCTAssertNil(undo.deadline)
        XCTAssertTrue(undo.restore(in: store)); XCTAssertEqual(store.state.notes, [note(), neighbor]); XCTAssertNil(undo.note)
    }
    func testFailedRestoreKeepsUndoButExpiredRestoreDoesNotWrite() {
        var now: TimeInterval = 0; var fails = false; var writes = 0
        let store = CompanionContextStore(read: { nil }, write: { _ in writes += 1; return !fails }, clock: { self.epoch })
        store.choose(true, now: epoch); let undo = CompanionNoteUndo(elapsed: { now })
        undo.stage(note(), index: 0); undo.didDismiss(voiceOver: false); fails = true
        XCTAssertFalse(undo.restore(in: store)); XCTAssertNotNil(undo.note)
        fails = false; now += 5; let before = writes
        XCTAssertFalse(undo.restore(in: store)); XCTAssertEqual(writes, before); XCTAssertNil(undo.note)
    }
    func testNewAccountCannotRestoreThePreviousAccountsDeletedNote() {
        let name = "CompanionNoteUndoTests." + UUID().uuidString
        let defaults = UserDefaults(suiteName:name)!; defer { defaults.removePersistentDomain(forName:name) }
        let store = CompanionContextStore(read:{nil},write:{_ in true},clock:{self.epoch})
        _ = store.bindOwner("a", defaults:defaults); store.choose(true,now:epoch)
        let undo = CompanionNoteUndo(elapsed:{0})
        undo.stage(note(),index:0,ownerTag:store.state.ownerTag);undo.didDismiss(voiceOver:true)
        XCTAssertTrue(store.bindOwner("b",defaults:defaults));store.choose(true,now:epoch)
        XCTAssertFalse(undo.restore(in:store));XCTAssertNil(undo.note);XCTAssertTrue(store.state.notes.isEmpty)
    }

}
