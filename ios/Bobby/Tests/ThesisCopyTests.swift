import Foundation
import SwiftUI
import XCTest
@testable import Bobby

/// The words and the numbers of the thesis screens (1.8): arithmetic done on the phone and left
/// out when a price is missing, the "not checked" list that is always shown, the two verdict
/// words, and a review question that names no time span in any of the six languages.
@MainActor
final class ThesisCopyTests: XCTestCase {
    private static let languages = ["en", "es", "fr", "pt", "it", "de"]
    private var language: Any?
    private let t0 = Date(timeIntervalSince1970: 1_791_374_400)

    override func setUp() async throws {
        try await super.setUp()
        language = UserDefaults.standard.object(forKey: L.preferenceKey)
        UserDefaults.standard.set("en", forKey: L.preferenceKey)
    }

    override func tearDown() async throws {
        if let language { UserDefaults.standard.set(language, forKey: L.preferenceKey) } else { UserDefaults.standard.removeObject(forKey: L.preferenceKey) }
        try await super.tearDown()
    }

    private func inEveryLanguage(_ body: (String) -> Void) {
        for language in Self.languages {
            UserDefaults.standard.set(language, forKey: L.preferenceKey)
            body(language)
        }
        UserDefaults.standard.set("en", forKey: L.preferenceKey)
    }

    // MARK: Then and now

    func testTheChangeIsArithmeticOnTheTwoPrices() throws {
        let up = ThesisThenNow(thenPrice: 100, thenDate: t0, nowPrice: 108.9, asOf: "2026-10-16T14:30:00Z")
        XCTAssertEqual(try XCTUnwrap(up.changePct), 8.9, accuracy: 1e-9)
        let down = ThesisThenNow(thenPrice: 120.5, thenDate: t0, nowPrice: 96.4, asOf: nil)
        XCTAssertEqual(try XCTUnwrap(down.changePct), -20.0, accuracy: 1e-9)
        let flat = ThesisThenNow(thenPrice: 64_250, thenDate: t0, nowPrice: 64_250, asOf: nil)
        XCTAssertEqual(flat.changePct, 0)
        let small = ThesisThenNow(thenPrice: 0.0004, thenDate: t0, nowPrice: 0.0005, asOf: nil)
        XCTAssertEqual(try XCTUnwrap(small.changePct), 25, accuracy: 1e-6)
        XCTAssertEqual(up.asOfDate, BobbyAccessAPI.date("2026-10-16T14:30:00Z"))
        XCTAssertFalse(up.isEmpty)
    }

    func testAMissingOrUnusablePriceMeansNoChangeIsShown() {
        XCTAssertNil(ThesisThenNow(thenPrice: nil, thenDate: t0, nowPrice: 108.9, asOf: nil).changePct)
        XCTAssertNil(ThesisThenNow(thenPrice: 100, thenDate: t0, nowPrice: nil, asOf: nil).changePct)
        for bad in [0, -5, Double.nan, Double.infinity] {
            let then = ThesisThenNow(thenPrice: bad, thenDate: t0, nowPrice: 100, asOf: nil)
            XCTAssertNil(then.thenPrice, "\(bad) is not a price")
            XCTAssertNil(then.thenDate, "a starting date without its price is not shown either")
            XCTAssertNil(then.changePct)
            let now = ThesisThenNow(thenPrice: 100, thenDate: t0, nowPrice: bad, asOf: nil)
            XCTAssertNil(now.nowPrice)
            XCTAssertNil(now.changePct)
        }
        let nothing = ThesisThenNow(thenPrice: nil, thenDate: nil, nowPrice: nil, asOf: "")
        XCTAssertTrue(nothing.isEmpty, "with neither price the block is left out")
        XCTAssertNil(nothing.asOf)
        XCTAssertNil(ThesisThenNow(thenPrice: 1, thenDate: nil, nowPrice: 2, asOf: "last Tuesday").asOfDate, "an unreadable date is not shown as one")
    }

    func testThenComesFromTheFirstDatedEntryOfTheThesis() {
        var thesis = SavedThesis(id: "t1", symbol: "NVDA", name: "NVIDIA", isEquity: true, status: .active, horizon: nil, hypothesis: "Why",
                                 worry: "", changeMind: "", createdAt: t0, updatedAt: t0, lastReviewedAt: nil, sourceRequestId: nil,
                                 revisions: [ThesisRevision(at: t0, kind: .created, price: 120.5),
                                             ThesisRevision(at: t0.addingTimeInterval(86_400), kind: .reviewed, price: 130)])
        let numbers = ThesisThenNow(thesis: thesis, nowPrice: 132.55, asOf: nil)
        XCTAssertEqual(numbers.thenPrice, 120.5, "where it started, not the last review")
        XCTAssertEqual(numbers.thenDate, t0)
        XCTAssertEqual(numbers.changePct ?? 0, 10, accuracy: 1e-9)
        thesis.revisions = [ThesisRevision(at: t0, kind: .created)]
        XCTAssertNil(ThesisThenNow(thesis: thesis, nowPrice: 132.55, asOf: nil).changePct, "a thesis written from a read without a price has no change")
    }

    func testNumbersAreWrittenForPeople() {
        XCTAssertEqual(ThesisCopy.percent(8.94), "+8.9%")
        XCTAssertEqual(ThesisCopy.percent(-3.06), "-3.1%")
        XCTAssertEqual(ThesisCopy.percent(0.04), "0%", "a rounding crumb is not a move")
        XCTAssertEqual(ThesisCopy.percent(-0.04), "0%")
        XCTAssertEqual(ThesisCopy.percent(125), "+125%")
        XCTAssertEqual(ThesisCopy.price(120.5), "120.50")
        XCTAssertEqual(ThesisCopy.price(64_250), "64,250.00")
        XCTAssertEqual(ThesisCopy.price(0.000423), "0.000423")
        UserDefaults.standard.set("de", forKey: L.preferenceKey)
        XCTAssertEqual(ThesisCopy.price(1_234.5), "1.234,50", "in the app's locale")
        XCTAssertEqual(ThesisCopy.days(from: t0, to: t0.addingTimeInterval(8.9 * 86_400)), 8)
        XCTAssertEqual(ThesisCopy.days(from: t0, to: t0.addingTimeInterval(-86_400)), 0, "never negative")
    }

    // MARK: Not checked

    func testWhatBobbyDidNotCheckIsAlwaysListed() {
        let all = ["news", "earnings", "filings", "fundamentals", "macro"]
        XCTAssertEqual(ThesisCopy.notCheckedCodes(nil, isEquity: true), all, "a server that sends nothing: the whole fixed list")
        XCTAssertEqual(ThesisCopy.notCheckedCodes([], isEquity: true), all)
        XCTAssertEqual(ThesisCopy.notCheckedCodes(["the moon", ""], isEquity: true), all, "codes the app cannot word do not empty the list")
        XCTAssertEqual(ThesisCopy.notCheckedCodes(["macro", "news"], isEquity: true), ["news", "macro"], "the server's codes, in the app's order")
        XCTAssertEqual(ThesisCopy.notCheckedCodes(["earnings", "earnings"], isEquity: false), ["earnings"])
        XCTAssertEqual(ThesisCopy.notCheckedCodes(nil, isEquity: false), ["news", "fundamentals", "macro"])
        XCTAssertEqual(Set(all), ThesisReviewNotes.notCheckedCodes, "every code the wire accepts has words here")
        XCTAssertEqual(ThesisCopy.notCheckedWords(nil, isEquity: true),
                       ["News", "Earnings reports", "Company filings", "Company fundamentals", "The wider economy"])
        XCTAssertEqual(ThesisCopy.notCheckedWords(nil, isEquity: false), ["News", "Project fundamentals", "The wider economy"])
        XCTAssertNil(ThesisCopy.notCheckedWord("the moon", isEquity: true))
    }

    func testTheNotCheckedListAndItsSentenceExistInSixLanguages() {
        var sentences = Set<String>()
        inEveryLanguage { language in
            for equity in [true, false] {
                let words = ThesisCopy.notCheckedWords(nil, isEquity: equity)
                XCTAssertEqual(words.count, equity ? 5 : 3, language)
                XCTAssertEqual(Set(words).count, words.count, "\(language): each gap has its own words")
                XCTAssertFalse(words.contains { $0.isEmpty }, language)
                sentences.insert(ThesisCopy.priceOnlyLine(isEquity: equity))
            }
            sentences.insert(ThesisCopy.footer)
        }
        XCTAssertEqual(sentences.count, 18, "two price-only sentences and the footer, translated in each language")
        XCTAssertEqual(ThesisCopy.priceOnlyLine(isEquity: true), "Bobby read price evidence only. This is not a view on the company itself.")
        XCTAssertEqual(ThesisCopy.footer, "Educational read · not financial advice")
    }

    // MARK: Verdict and horizon

    func testAVerdictIsOnlyEverWaitOrReview() {
        XCTAssertEqual(ThesisCopy.verdictWord("wait"), "Wait")
        XCTAssertEqual(ThesisCopy.verdictWord("review"), "Review")
        for other in ["buy", "sell", "long", "", "WAIT"] { XCTAssertNil(ThesisCopy.verdictWord(other), other) }
        XCTAssertNil(ThesisCopy.verdictWord(nil))
        var words = Set<String>()
        inEveryLanguage { _ in
            words.insert(ThesisCopy.verdictWord("wait") ?? "")
            words.insert(ThesisCopy.verdictWord("review") ?? "")
        }
        XCTAssertEqual(words, ["Wait", "Review", "Espera", "Revisa", "Attendre", "Réexaminer", "Esperar", "Rever", "Aspetta", "Riesamina", "Abwarten", "Prüfen"],
                       "the same two words the read uses in each language")
    }

    func testTheFourHorizonsAreThePersonsChoicesInSixLanguages() {
        XCTAssertEqual(ThesisHorizon.allCases.map(ThesisCopy.horizon), ["A few weeks", "A few months", "About a year", "Several years"])
        var labels = Set<String>()
        inEveryLanguage { _ in ThesisHorizon.allCases.forEach { labels.insert(ThesisCopy.horizon($0)) } }
        XCTAssertEqual(labels.count, 24)
    }

    // MARK: The review question

    func testTheReviewQuestionNamesTheAssetAndNoTimeSpanInAnyLanguage() {
        // Words the desk reads a horizon out of (api/_lib/desk-debate.ts horizonOf), accents removed.
        let horizonWords = ["ano", "anos", "year", "years", "ans", "annee", "annees", "anno", "anni", "jahr", "jahre", "jahren", "meses", "months", "mesi",
                            "monate", "monaten", "mes", "month", "monthly", "mensual", "mois", "mese", "mensile", "monat", "monats", "monatlich",
                            "semanas", "weeks", "semaines", "settimane", "wochen", "trimestre", "quarter", "semana", "week", "semaine", "settimana",
                            "woche", "semanal", "weekly", "settimanale", "wochentlich", "dias", "jours", "giorni", "tage", "hoy", "today", "hoje",
                            "ahora", "agora", "maintenant", "oggi", "adesso", "ora", "heute", "jetzt", "hora", "horas", "hour", "hours", "heure",
                            "heures", "stunde", "stunden", "intradia", "intraday", "an", "langfristig"]
        var questions = Set<String>()
        inEveryLanguage { language in
            let question = ThesisCopy.reviewQuestion(symbol: "NVDA")
            questions.insert(question)
            XCTAssertTrue(question.contains("NVDA"), language)
            XCTAssertFalse(question.contains("{"), language)
            XCTAssertLessThanOrEqual(question.count, 1_200, "\(language): the desk's question limit")
            let plain = question.lowercased().folding(options: .diacriticInsensitive, locale: nil)
            let words = Set(plain.components(separatedBy: CharacterSet.letters.inverted).filter { !$0.isEmpty })
            XCTAssertTrue(words.isDisjoint(with: horizonWords), "\(language): \(words.intersection(horizonWords)) would be read as a horizon")
            for phrase in ["largo plazo", "long term", "long-term", "longo prazo", "long terme", "lungo termine", "lungo periodo", "right now",
                           "aujourd", "next days", "proximos dias", "plusieurs mois"] {
                XCTAssertFalse(plain.contains(phrase), "\(language): \(phrase)")
            }
        }
        XCTAssertEqual(questions.count, 6, "one sentence per language")
    }

    // MARK: Screens

#if DEBUG
    func testEveryReviewFixtureBuildsAndLaysOutWithoutAnAccountOrANetwork() {
        let fixtures = ThesesQA.fixtures
        let required = ["theses-empty", "theses-three", "theses-editor-draft", "theses-editor-limit", "theses-review-before", "theses-review-running",
                        "theses-review-after", "theses-review-after-plain", "theses-review-signin", "theses-review-signin-level", "theses-review-pro",
                        "theses-review-level", "theses-review-paused", "theses-review-paused-all", "theses-review-quota", "theses-review-failed",
                        "theses-review-timeout", "theses-review-unreadable", "theses-review-risk"]
        for name in required { XCTAssertNotNil(fixtures[name], name) }
        XCTAssertTrue(fixtures.keys.allSatisfy { $0.hasPrefix("theses-") }, "names are <feature>-<state>")
        for (name, make) in fixtures.sorted(by: { $0.key < $1.key }) {
            for language in ["en", "de"] {
                UserDefaults.standard.set(language, forKey: L.preferenceKey)
                let host = UIHostingController(rootView: make().environment(\.sizeCategory, language == "de" ? .accessibilityLarge : .large))
                host.view.frame = CGRect(x: 0, y: 0, width: 390, height: 844)
                host.view.layoutIfNeeded()
                XCTAssertGreaterThan(host.sizeThatFits(in: CGSize(width: 390, height: 10_000)).height, 100, "\(name) (\(language)) shows something")
            }
        }
        UserDefaults.standard.removePersistentDomain(forName: "qa.v18.theses")
    }
#endif
}
