import XCTest
@testable import Bobby

final class SpeakingDialTests: XCTestCase {
    func withDial(_ test: (SpeakingDial) -> Void) {
        let name = "SpeakingDialTests." + UUID().uuidString
        let defaults = UserDefaults(suiteName: name)!
        defer { defaults.removePersistentDomain(forName: name) }
        test(SpeakingDial(defaults: defaults))
    }
    func testUpgradeDoesNotAskAgainAndFreshInstallDoes() {
        withDial { d in d.prepare(existing: true); XCTAssertEqual(d.json(nil)["offer"] as? Bool, false); d.prepare(existing: false); XCTAssertEqual(d.json(nil)["offer"] as? Bool, false) }
        withDial { d in d.prepare(existing: false); XCTAssertEqual(d.json(nil)["offer"] as? Bool, true); d.choose("plain", owner: nil); XCTAssertEqual(d.json(nil)["offer"] as? Bool, false) }
    }
    func testGuestChoiceSurvivesRestartAndOnlyFirstAccountInherits() {
        withDial { d in d.prepare(existing: false); d.choose("terms", owner: nil); XCTAssertEqual(SpeakingDial(defaults: d.defaults).value(nil), "terms"); d.inheritGuest("a"); XCTAssertEqual(d.value("a"), "terms"); d.inheritGuest("b"); XCTAssertNil(d.value("b")); XCTAssertEqual(d.value(nil), "terms") }
    }
    func testAccountsKeepSeparateChoicesAndUnknownValuesDoNotReplaceThem() {
        withDial { d in d.choose("plain", owner: "a"); d.choose("technical", owner: "b"); d.choose("unknown", owner: "a"); XCTAssertEqual(d.value("a"), "plain"); XCTAssertEqual(d.value("b"), "technical"); XCTAssertNil(d.value(nil)); XCTAssertNotEqual(d.tag("a"), d.tag("b")) }
    }
    func testThirdDistinctReadOffersOneRefinementOnly() {
        withDial { d in d.delivered("1", owner: "a"); d.delivered("1", owner: "a"); d.delivered("2", owner: "a"); XCTAssertEqual(d.json("a")["refine"] as? Bool, false); d.delivered("3", owner: "a"); XCTAssertEqual(d.json("a")["refine"] as? Bool, true); XCTAssertEqual(d.json("b")["refine"] as? Bool, false); d.choose("terms", owner: "a", feedback: true); d.delivered("4", owner: "a"); XCTAssertEqual(d.json("a")["refine"] as? Bool, false) }
    }
}
