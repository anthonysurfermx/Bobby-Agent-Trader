import Foundation
import XCTest
@testable import Bobby

/// The follow-up planner's contract for every platform: `shared/harness/planner-golden.json`, read
/// from the repository (never copied into the bundle), so the file cannot drift from the iPhone.
///
/// The file:
///   version     1
///   defaults    the planner's options as the app runs them
///   constants   what the cases rest on besides the options (waits per horizon, interest weights…)
///   sectors     the sector of each symbol the cases use (null: none)
///   cases[]     name, now, timeZone, options?, events[], expectedPlan[]
/// A case:
///   now, at, ref, fireAt   ISO 8601 with an offset (an instant)
///   timeZone               IANA name: the calendar the plan is made in
///   options                only what differs from `defaults`, same keys
///   events[]               kind, at, symbol?, name?, isEquity?, price?, step?, sector?, ref?, origin?,
///                          thread?, horizon?, horizonHours?  — written into the ledger in file order
///   expectedPlan[]         step, fireAt, symbol, and days (asset), sector (sector), others (week);
///                          a field that is absent is not compared
/// A port reproduces every case with its own ledger and planner, and checks its own defaults and
/// constants against the file the way the first two tests here do.
final class HarnessGoldenTests: XCTestCase {
    private static let fileURL = URL(fileURLWithPath: #filePath)
        .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
        .appendingPathComponent("shared/harness/planner-golden.json")

    private static let eventKeys: Set<String> = ["kind", "at", "symbol", "name", "isEquity", "price", "step", "sector", "ref", "origin",
                                                 "thread", "horizon", "horizonHours"]
    private static let planKeys: Set<String> = ["step", "fireAt", "symbol", "days", "sector", "others"]
    private static let caseKeys: Set<String> = ["name", "now", "timeZone", "options", "events", "expectedPlan"]

    private struct Malformed: Error, CustomStringConvertible { let description: String }

    private func load() throws -> [String: Any] {
        let data = try Data(contentsOf: Self.fileURL)
        guard let file = try JSONSerialization.jsonObject(with: data) as? [String: Any] else { throw Malformed(description: "not an object") }
        return file
    }

    private func date(_ raw: Any?, _ what: String) throws -> Date {
        guard let text = raw as? String, let date = ISO8601DateFormatter().date(from: text) else { throw Malformed(description: "\(what): not an instant: \(raw ?? "nil")") }
        return date
    }

    private func number(_ raw: Any?, _ what: String) throws -> Double {
        guard let n = raw as? NSNumber, CFGetTypeID(n) != CFBooleanGetTypeID() else { throw Malformed(description: "\(what): not a number") }
        return n.doubleValue
    }

    private func event(_ raw: [String: Any]) throws -> HarnessEvent {
        let unknown = Set(raw.keys).subtracting(Self.eventKeys)
        guard unknown.isEmpty else { throw Malformed(description: "event has \(unknown.sorted())") }
        guard let kind = (raw["kind"] as? String).flatMap(HarnessEvent.Kind.init(rawValue:)) else { throw Malformed(description: "event kind \(raw["kind"] ?? "nil")") }
        var event = HarnessEvent(kind: kind, at: try date(raw["at"], "at"))
        event.symbol = raw["symbol"] as? String
        event.name = raw["name"] as? String ?? event.symbol
        event.isEquity = raw["isEquity"] as? Bool
        event.price = try raw["price"].map { try number($0, "price") }
        if let step = raw["step"] {
            guard let value = (step as? String).flatMap(HarnessStep.init(rawValue:)) else { throw Malformed(description: "step \(step)") }
            event.step = value
        }
        event.sector = raw["sector"] as? String
        event.ref = try raw["ref"].map { try date($0, "ref") }
        if let origin = raw["origin"] {
            guard let value = (origin as? String).flatMap(HarnessEvent.Origin.init(rawValue:)) else { throw Malformed(description: "origin \(origin)") }
            event.origin = value
        }
        event.thread = raw["thread"] as? Bool
        if let horizon = raw["horizon"] {
            guard let value = HarnessHorizon(named: horizon) else { throw Malformed(description: "horizon \(horizon)") }
            event.horizon = value
        }
        event.horizonHours = try raw["horizonHours"].map { Int(try number($0, "horizonHours")) }
        return event
    }

    private func options(_ defaults: [String: Any], _ overrides: [String: Any], sectors: [String: Any]) throws -> HarnessPlanner.Options {
        let unknown = Set(overrides.keys).subtracting(defaults.keys)
        guard unknown.isEmpty else { throw Malformed(description: "options has \(unknown.sorted())") }
        let merged = defaults.merging(overrides) { _, new in new }
        var options = HarnessPlanner.Options()
        guard let chain = merged["chain"] as? [String] else { throw Malformed(description: "chain") }
        options.chain = try chain.map { name in
            guard let step = HarnessStep(rawValue: name) else { throw Malformed(description: "chain step \(name)") }
            return step
        }
        options.maxPerQuestion = Int(try number(merged["maxPerQuestion"], "maxPerQuestion"))
        guard let weeklyCovered = merged["weeklyCovered"] as? Bool else { throw Malformed(description: "weeklyCovered") }
        options.weeklyCovered = weeklyCovered
        options.earliestHour = Int(try number(merged["earliestHour"], "earliestHour"))
        options.latestHour = Int(try number(merged["latestHour"], "latestHour"))
        options.minimumGap = try number(merged["minimumGapHours"], "minimumGapHours") * 3_600
        options.anchorDays = try number(merged["anchorDays"], "anchorDays")
        options.sectorFreshDays = try number(merged["sectorFreshDays"], "sectorFreshDays")
        options.weekFreshDays = try number(merged["weekFreshDays"], "weekFreshDays")
        options.weekWindowDays = Int(try number(merged["weekWindowDays"], "weekWindowDays"))
        options.maxPerWeek = Int(try number(merged["maxPerWeek"], "maxPerWeek"))
        options.quietAfter = Int(try number(merged["quietAfter"], "quietAfter"))
        options.quietDays = try number(merged["quietDays"], "quietDays")
        // The file's own table: a port needs no more of the app's sectors than the cases use.
        options.sectorOf = { sectors[$0] as? String }
        return options
    }

    private func describe(_ plan: [HarnessFollowUp], _ calendar: Calendar) -> String {
        let formatter = ISO8601DateFormatter()
        formatter.timeZone = calendar.timeZone
        return "[" + plan.map { followUp in
            var parts = ["\(followUp.step.rawValue) \(formatter.string(from: followUp.fireAt)) \(followUp.symbol ?? "-")"]
            if followUp.step == .asset { parts.append("days \(followUp.days)") }
            if let sector = followUp.sector { parts.append(sector) }
            if followUp.step == .week { parts.append("others \(followUp.others)") }
            return parts.joined(separator: " ")
        }.joined(separator: "; ") + "]"
    }

    // MARK: The cases

    func testEveryGoldenCasePlansAsWritten() throws {
        let file = try load()
        XCTAssertEqual(file["version"] as? Int, 1, "a new version is a new contract: read it before trusting this suite")
        let defaults = try XCTUnwrap(file["defaults"] as? [String: Any])
        let sectors = try XCTUnwrap(file["sectors"] as? [String: Any])
        let cases = try XCTUnwrap(file["cases"] as? [[String: Any]])
        XCTAssertGreaterThanOrEqual(cases.count, 96, "the contract shrank")
        var names = Set<String>()
        for raw in cases {
            let name = try XCTUnwrap(raw["name"] as? String)
            XCTAssertTrue(names.insert(name).inserted, "two cases are called “\(name)”")
            XCTAssertEqual(Set(raw.keys).subtracting(Self.caseKeys), [], name)
            let zone = try XCTUnwrap((raw["timeZone"] as? String).flatMap(TimeZone.init(identifier:)), name)
            var calendar = Calendar(identifier: .gregorian)
            calendar.timeZone = zone
            let now = try date(raw["now"], "now")
            var ledger = HarnessLedger()
            for item in try XCTUnwrap(raw["events"] as? [[String: Any]], name) { ledger.note(try event(item)) }
            let plan = HarnessPlanner.plan(ledger: ledger, now: now, calendar: calendar,
                                           options: try options(defaults, raw["options"] as? [String: Any] ?? [:], sectors: sectors))
            let expected = try XCTUnwrap(raw["expectedPlan"] as? [[String: Any]], name)
            let got = describe(plan, calendar)
            guard plan.count == expected.count else {
                XCTFail("“\(name)”: \(expected.count) expected, planned \(got)")
                continue
            }
            for (followUp, want) in zip(plan, expected) {
                XCTAssertEqual(Set(want.keys).subtracting(Self.planKeys), [], name)
                XCTAssertEqual(followUp.step.rawValue, want["step"] as? String, "“\(name)”: planned \(got)")
                XCTAssertEqual(followUp.fireAt, try date(want["fireAt"], "fireAt"), "“\(name)”: planned \(got)")
                XCTAssertEqual(followUp.symbol, want["symbol"] as? String, "“\(name)”: planned \(got)")
                if let days = want["days"] { XCTAssertEqual(followUp.days, Int(try number(days, "days")), "“\(name)”: planned \(got)") }
                if let sector = want["sector"] { XCTAssertEqual(followUp.sector, sector as? String, "“\(name)”: planned \(got)") }
                if let others = want["others"] { XCTAssertEqual(followUp.others, Int(try number(others, "others")), "“\(name)”: planned \(got)") }
            }
        }
    }

    // MARK: What the cases rest on

    func testTheGoldenDefaultsAreTheOptionsTheAppRuns() throws {
        let defaults = try XCTUnwrap(try load()["defaults"] as? [String: Any])
        let options = HarnessPlanner.Options()
        XCTAssertEqual(defaults["chain"] as? [String], options.chain.map(\.rawValue), "the chain that ships")
        XCTAssertEqual(defaults["chain"] as? [String], HarnessChain.shipped.steps.map(\.rawValue))
        XCTAssertEqual(defaults["maxPerQuestion"] as? Int, options.maxPerQuestion)
        XCTAssertEqual(defaults["maxPerQuestion"] as? Int, HarnessChain.shipped.maxPerQuestion)
        XCTAssertEqual(defaults["weeklyCovered"] as? Bool, options.weeklyCovered)
        XCTAssertEqual(defaults["earliestHour"] as? Int, options.earliestHour)
        XCTAssertEqual(defaults["latestHour"] as? Int, options.latestHour)
        XCTAssertEqual(try number(defaults["minimumGapHours"], "minimumGapHours") * 3_600, options.minimumGap)
        XCTAssertEqual(try number(defaults["anchorDays"], "anchorDays"), options.anchorDays)
        XCTAssertEqual(try number(defaults["sectorFreshDays"], "sectorFreshDays"), options.sectorFreshDays)
        XCTAssertEqual(try number(defaults["weekFreshDays"], "weekFreshDays"), options.weekFreshDays)
        XCTAssertEqual(defaults["weekWindowDays"] as? Int, options.weekWindowDays)
        XCTAssertEqual(defaults["maxPerWeek"] as? Int, options.maxPerWeek)
        XCTAssertEqual(defaults["quietAfter"] as? Int, options.quietAfter)
        XCTAssertEqual(try number(defaults["quietDays"], "quietDays"), options.quietDays)
        XCTAssertEqual(defaults.count, 13, "an option the file does not name, or one the app does not have")
    }

    func testTheGoldenConstantsAreTheOnesTheAppRuns() throws {
        let constants = try XCTUnwrap(try load()["constants"] as? [String: Any])
        let waits = try XCTUnwrap(constants["waitDays"] as? [String: Any])
        XCTAssertEqual(Set(waits.keys), Set(HarnessHorizon.allCases.map(\.rawValue)), "the desk's five horizons")
        for horizon in HarnessHorizon.allCases {
            XCTAssertEqual(waits[horizon.rawValue] as? Int, horizon.waitDays, horizon.rawValue)
        }
        // A save: the planner's own reading of each choice the page offers.
        let saves = try XCTUnwrap(constants["saveWaitDays"] as? [String: Int])
        let question = HarnessEvent(kind: .ask, at: Date(timeIntervalSince1970: 1_800_000_000), symbol: "NVDA")
        for hours in HarnessLedger.saveHorizons.sorted() {
            var ledger = HarnessLedger()
            ledger.note(question)
            ledger.note(HarnessEvent(kind: .saved, at: question.at.addingTimeInterval(60), symbol: "NVDA", horizonHours: hours))
            let wait = HarnessPlanner.wait(for: question, in: ledger, now: question.at.addingTimeInterval(120))
            if let days = saves[String(hours)] {
                XCTAssertEqual(wait, HarnessPlanner.Wait(days: days, source: .saved), "\(hours) hours")
            } else {
                XCTAssertEqual(wait, HarnessPlanner.Wait(days: 1, source: .standard), "\(hours) hours says nothing")
            }
        }
        XCTAssertEqual(Set(saves.keys), ["72", "168"])
        let theses = try XCTUnwrap(constants["thesisHorizon"] as? [String: String])
        XCTAssertEqual(Set(theses.keys), Set(ThesisHorizon.allCases.map(\.rawValue)))
        for horizon in ThesisHorizon.allCases { XCTAssertEqual(theses[horizon.rawValue], HarnessHorizon(thesis: horizon).rawValue, horizon.rawValue) }
        let weights = try XCTUnwrap(constants["interestWeights"] as? [String: Any])
        XCTAssertEqual(Set(weights.keys), Set(HarnessProfile.weights.keys.map(\.rawValue)))
        for (kind, weight) in HarnessProfile.weights { XCTAssertEqual(try number(weights[kind.rawValue], kind.rawValue), weight, kind.rawValue) }
        XCTAssertEqual(try number(constants["threadWeight"], "threadWeight"), HarnessProfile.threadWeight)
        XCTAssertEqual(try number(constants["thesisWeight"], "thesisWeight"), HarnessProfile.thesisWeight)
        XCTAssertEqual(try number(constants["interestHalfLifeDays"], "interestHalfLifeDays"), HarnessProfile.halfLifeDays)
        XCTAssertEqual(try number(constants["statsDays"], "statsDays"), HarnessProfile.statsDays)
        XCTAssertEqual(constants["ignoredLimit"] as? Int, HarnessProfile.ignoredLimit)
        XCTAssertEqual(constants["hourSamples"] as? Int, HarnessProfile.hourSamples)
        XCTAssertEqual(constants["retentionDays"] as? Int, HarnessLedger.retentionDays)
        XCTAssertEqual(constants["maxEvents"] as? Int, HarnessLedger.maxEvents)
        XCTAssertEqual(constants.count, 12, "a constant the file does not name, or one the app does not have")
    }

    func testTheGoldenSectorsAreTheAppsSectors() throws {
        let file = try load()
        let sectors = try XCTUnwrap(file["sectors"] as? [String: Any])
        for (symbol, sector) in sectors {
            XCTAssertEqual(HarnessSectors.sector(of: symbol)?.id, sector as? String, symbol)
        }
        // Every symbol a case plans a sector for is in the table.
        for raw in try XCTUnwrap(file["cases"] as? [[String: Any]]) {
            for item in raw["events"] as? [[String: Any]] ?? [] {
                guard let symbol = HarnessLedger.validSymbol(item["symbol"] as? String) else { continue }
                XCTAssertNotNil(sectors[symbol], "\(symbol) is used by “\(raw["name"] ?? "")” and has no line in `sectors`")
            }
        }
    }

    /// The owner's two choices are both in the file: the chain that ships, and the one with the sector.
    func testBothChainsAreInTheContract() throws {
        let cases = try XCTUnwrap(try load()["cases"] as? [[String: Any]])
        let withSector = cases.filter { (($0["options"] as? [String: Any])?["chain"] as? [String]) == HarnessChain.withSector.steps.map(\.rawValue) }
        XCTAssertGreaterThanOrEqual(withSector.count, 10)
        for raw in withSector {
            XCTAssertEqual((raw["options"] as? [String: Any])?["maxPerQuestion"] as? Int, HarnessChain.withSector.maxPerQuestion, raw["name"] as? String ?? "")
        }
        let shipped = cases.filter { ($0["options"] as? [String: Any])?["chain"] == nil }
        XCTAssertFalse(shipped.contains { ($0["expectedPlan"] as? [[String: Any]] ?? []).contains { $0["step"] as? String == "sector" } },
                       "the chain that ships never plans a sector")
    }
}
