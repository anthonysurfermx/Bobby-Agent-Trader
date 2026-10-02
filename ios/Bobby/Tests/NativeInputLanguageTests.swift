import Foundation
import XCTest
@testable import Bobby

/// The real native HTTP client/parser with in-process responses, not a fake serialization copy.
@MainActor
final class NativeInputLanguageTests: XCTestCase {
    private var previousSelection: String?
    private static let cases: [(String, String)] = [
        ("en", "What do you think of NVIDIA’s price of $123.45?"),
        ("es", "¿Qué opinas de NVIDIA a 123,45 dólares?"),
        ("fr", "Que penses-tu de l’Ethereum à 1 234,56 € ?"),
        ("pt", "Vale a pena analisar a ação a R$ 123,45?"),
        ("it", "Cosa pensi dell’Ethereum? È già a 1.234,56 €."),
        ("de", "Wie sieht der Bitcoin-Preis aus? Größe: 1.234,56 €.")
    ]

    override func setUp() {
        super.setUp()
        previousSelection = UserDefaults.standard.string(forKey: L.preferenceKey)
        B34Stub.install { _ in .fail }
        URLProtocol.registerClass(B34Stub.self)
    }

    override func tearDown() {
        URLProtocol.unregisterClass(B34Stub.self)
        B34Stub.install(nil)
        if let previousSelection { UserDefaults.standard.set(previousSelection, forKey: L.preferenceKey) }
        else { UserDefaults.standard.removeObject(forKey: L.preferenceKey) }
        super.tearDown()
    }

    private func body(_ seen: B34Stub.Seen) throws -> [String: Any] {
        try XCTUnwrap(try JSONSerialization.jsonObject(with: XCTUnwrap(seen.body)) as? [String: Any])
    }

    func testSearchPreservesUnicodeAndCurrentLanguageInPOSTWithoutLeakingQuestionIntoURL() async throws {
        for (language, text) in Self.cases {
            UserDefaults.standard.set(language, forKey: L.preferenceKey)
            for question in [text, text.decomposedStringWithCanonicalMapping] {
                B34Stub.install { _ in .json(200, #"{"ok":true,"resolved":null,"resolution":null}"#) }
                let result = await BobbyAPI.assetSearch(question, limit: 7)
                XCTAssertNotNil(result)
                let seen = try XCTUnwrap(B34Stub.requests.first)
                let payload = try body(seen)
                XCTAssertEqual(B34Stub.requests.count, 1)
                XCTAssertEqual(seen.method, "POST")
                XCTAssertNil(seen.request.url?.query)
                XCTAssertEqual(payload["q"] as? String, question)
                XCTAssertEqual(payload["language"] as? String, language)
                XCTAssertEqual(payload["locale"] as? String, L.localeIdentifier)
                XCTAssertEqual(payload["country"] as? String, L.country)
                XCTAssertEqual(payload["limit"] as? Int, 7)
            }
        }
    }

    func testDebatePreservesQuestionAndSixLanguageOutputThroughTheNativeClientAndParser() async throws {
        for (language, question) in Self.cases {
            UserDefaults.standard.set(language, forKey: L.preferenceKey)
            let reply: [String: Any] = [
                "agents": ["alpha": question, "red": question + " ⚠️", "cio": question, "verdict": "wait", "direction": "none"],
                "technicals": ["price": 1234.56, "trend": "sideways", "momentum": "neutral"],
                "provenance": ["instrument": "MC.PA", "provider": "yahoo", "currency": "EUR", "exchange": "PAR", "asOf": "2026-10-02T16:00:00Z"]
            ]
            let json = String(decoding: try JSONSerialization.data(withJSONObject: reply), as: UTF8.self)
            B34Stub.install { _ in .json(200, json) }
            let result = await NucleoDeskIO.debate(symbol: "MC.PA", question: question, isEquity: true, auth: .none)
            guard case .ok(let debate) = result else { XCTFail("\(language): native reply was not decoded"); continue }
            XCTAssertEqual(debate.alpha, question)
            XCTAssertEqual(debate.red, question + " ⚠️")
            XCTAssertEqual(debate.cio, question)
            XCTAssertEqual(debate.verdict, "wait")
            XCTAssertEqual(debate.direction, "none")
            XCTAssertEqual(debate.technicals.price, 1234.56)
            XCTAssertEqual(debate.provenance.instrument, "MC.PA")
            let seen = try XCTUnwrap(B34Stub.requests.first)
            let payload = try body(seen)
            XCTAssertEqual(B34Stub.requests.count, 1)
            XCTAssertEqual(seen.method, "POST")
            XCTAssertNil(seen.request.url?.query)
            XCTAssertEqual(payload["question"] as? String, question)
            XCTAssertEqual(payload["language"] as? String, language)
            XCTAssertEqual(payload["locale"] as? String, L.localeIdentifier)
            XCTAssertEqual(payload["country"] as? String, L.country)
            XCTAssertEqual(payload["symbol"] as? String, "MC.PA")
            XCTAssertEqual(payload["assetType"] as? String, "equity")
        }
    }

    func testFailedSearchInEveryLanguageHasNoGETOrCrossLanguageFallback() async {
        for (language, question) in Self.cases {
            UserDefaults.standard.set(language, forKey: L.preferenceKey)
            B34Stub.install { _ in .json(503, "{}") }
            let result = await BobbyAPI.assetSearch(question)
            XCTAssertNil(result)
            XCTAssertEqual(B34Stub.requests.count, 1)
            XCTAssertEqual(B34Stub.requests.first?.method, "POST")
            XCTAssertNil(B34Stub.requests.first?.request.url?.query)
        }
    }

    func testUnicodeLimitMatchesServerCodePointsAndHasLocalizedRefusalInAllSixLanguages() {
        for (language, _) in Self.cases {
            UserDefaults.standard.set(language, forKey: L.preferenceKey)
            XCTAssertEqual(DeskQuestion.length("  \n📈\n  "), 1)
            XCTAssertEqual(DeskQuestion.length("é"), 1)
            XCTAssertEqual(DeskQuestion.length("e\u{0301}"), 2)
            XCTAssertFalse(DeskQuestion.isTooLong(String(repeating: "📈", count: 1200)))
            XCTAssertTrue(DeskQuestion.isTooLong(String(repeating: "📈", count: 1201)))
            XCTAssertFalse(DeskQuestion.isTooLong(String(repeating: "e\u{0301}", count: 600)))
            XCTAssertTrue(DeskQuestion.isTooLong(String(repeating: "e\u{0301}", count: 601)))
            XCTAssertFalse(DeskQuestion.tooLongMessage.isEmpty)
            if language != "en" { XCTAssertFalse(DeskQuestion.tooLongMessage.contains("Your question")) }
        }
    }
}
