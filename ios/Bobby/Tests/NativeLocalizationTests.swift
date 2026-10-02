import AVFoundation
import XCTest
@testable import Bobby

final class NativeLocalizationTests: XCTestCase {
    private var previousSelection: String?
    override func setUp() {
        super.setUp()
        previousSelection = UserDefaults.standard.string(forKey: L.preferenceKey)
    }
    override func tearDown() {
        if let previousSelection { UserDefaults.standard.set(previousSelection, forKey: L.preferenceKey) }
        else { UserDefaults.standard.removeObject(forKey: L.preferenceKey) }
        super.tearDown()
    }

    func testDeviceDetectionAndExplicitPreferenceKeepAllSixLanguages() {
        for language in AppLanguage.allCases {
            let detected = LanguageResolution.resolve(selection: "system", preferredLanguages: [language.rawValue], region: nil)
            XCTAssertEqual(detected.language, language)
            let selected = LanguageResolution.resolve(selection: language.rawValue, preferredLanguages: ["es-MX"], region: "FR")
            XCTAssertEqual(selected.language, language)
            XCTAssertEqual(selected.country, "FR")
        }
        XCTAssertEqual(LanguageResolution.resolve(selection: nil, preferredLanguages: ["zh-Hans", "fr-FR"], region: nil).language, .fr)
        XCTAssertEqual(LanguageResolution.resolve(selection: "invalid", preferredLanguages: ["de-DE"], region: nil).language, .de)
    }

    func testRegionalSpeechNeverFallsThroughToSpanishOrEnglish() {
        let cases: [(String, [String], String?, String)] = [
            ("fr", ["fr-CA"], "CA", "fr-FR"), ("it", ["en-US"], "IT", "it-IT"),
            ("de", ["de-AT"], "AT", "de-DE"), ("pt", ["pt-BR"], "PT", "pt-BR"),
            ("pt", ["pt-PT"], "BR", "pt-PT"), ("pt", ["en-US"], "BR", "pt-BR"),
            ("pt", ["en-US"], nil, "pt-PT")
        ]
        for (language, preferred, country, expected) in cases {
            let resolution = LanguageResolution.resolve(selection: language, preferredLanguages: preferred, region: country)
            XCTAssertEqual(resolution.localeIdentifier, expected)
            XCTAssertTrue(resolution.speechLocaleCandidates.allSatisfy { $0.hasPrefix(language + "-") })
        }
        XCTAssertNil(LanguageResolution.resolve(selection: "fr", preferredLanguages: [], region: "FR&secret=1").country)
    }

    func testPreferencePersistsAndRejectsUnsupportedValues() {
        L.select("fr")
        XCTAssertEqual(UserDefaults.standard.string(forKey: L.preferenceKey), "fr")
        XCTAssertEqual(L.language, "fr")
        L.select("arbitrary")
        XCTAssertEqual(L.selection, "fr")
        L.select("system")
        XCTAssertEqual(L.selection, "system")
    }

    func testInterpolatedTextPreservesNamesNumbersAndPlaceholderLikeUserInput() {
        UserDefaults.standard.set("fr", forKey: L.preferenceKey)
        XCTAssertEqual(L.t("No match for “\("MC.PA {1}")” · try the name or the ticker", "unused"),
                       "Aucun résultat pour « MC.PA {1} » · essaie le nom ou le symbole")
        let text: LocalizedText = "{\("name")}: \(1234.56)"
        XCTAssertEqual(text.render("{1} — {0}"), "1234.56 — name")
        XCTAssertEqual(L.t("Quick", "Rápido", spanish: true), "Rápido")
        XCTAssertEqual(L.t("Quick", "Rápido", spanish: false), "Quick")
    }

    func testEveryCatalogRowHasFourCompleteTranslationsAndSameArguments() throws {
        XCTAssertGreaterThanOrEqual(NativeTranslations.rows.count, 1048)
        let regex = try NSRegularExpression(pattern: "\\{[0-9]+\\}")
        func arguments(_ text: String) -> Set<String> {
            Set(regex.matches(in: text, range: NSRange(text.startIndex..., in: text)).compactMap { Range($0.range, in: text).map { String(text[$0]) } })
        }
        for (key, translations) in NativeTranslations.rows {
            XCTAssertEqual(Set(translations.keys), Set(["fr", "pt", "it", "de"]), key)
            for (language, translation) in translations {
                XCTAssertFalse(translation.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty, "\(language): \(key)")
                XCTAssertEqual(arguments(translation), arguments(key), "\(language): \(key)")
            }
        }
    }

    @MainActor
    func testNewLanguageVoicesAndConsentUseTheirOwnLanguage() {
        for language in ["fr", "pt", "it", "de"] {
            UserDefaults.standard.set(language, forKey: L.preferenceKey)
            XCTAssertNotEqual(RiskNotice.statements().first?.body, RiskNotice.statements(spanish: false).first?.body)
            XCTAssertNotEqual(bobbyCompanions.first?.selectLine, "Ready. We read the market together, calmly.")
            XCTAssertNotEqual(CompanionToolkit.tools(for: "orb").first?.name, "Patience Chronometer")
            if let voice = NeuralVoice.deviceVoice(language: language) { XCTAssertTrue(voice.language.hasPrefix(language + "-")) }
        }
        XCTAssertNil(NeuralVoice.deviceVoice(language: "unsupported"))
        XCTAssertEqual(BriefingSettings.languages, Set(["en", "es", "fr", "pt", "it", "de"]))
        XCTAssertTrue(BriefingSettings.narrationLanguages.contains("pt-BR"))
        let settings = BriefingSettings(json: ["revision": 1, "language": "pt", "locale": "pt-BR"])
        XCTAssertEqual(settings?.language, "pt")
        XCTAssertEqual(settings?.locale, "pt-BR")
        XCTAssertTrue(L.weeklyGreeting(name: "Ana", language: "pt-BR").hasPrefix("Olá, Ana."))
        if let voice = NeuralVoice.deviceVoice(language: "pt-BR") { XCTAssertTrue(voice.language.hasPrefix("pt-")) }
        XCTAssertTrue(L.weeklyGreeting(name: "Marie", language: "fr").hasPrefix("Bonjour, Marie."))
    }

    func testRegionalEquityMetadataSurvivesSearchAndBridgeSerialization() {
        let response: [String: Any] = ["resolution": ["needsConfirmation": false],
                                      "resolved": ["baseSymbol": "MC.PA", "assetClass": "equity", "aliases": ["LVMH"],
                                                   "currency": "EUR", "exchange": "Euronext Paris"]]
        guard case let .resolved(asset, _, _, _) = NucleoDeskIO.parseSearch(response) else { return XCTFail("Regional equity must resolve") }
        XCTAssertEqual(asset.symbol, "MC.PA")
        XCTAssertEqual(asset.json["currency"] as? String, "EUR")
        XCTAssertEqual(asset.json["exchange"] as? String, "Euronext Paris")
        let market = NucleoDeskIO.Market(price: 650, changePct: 1.2, currency: "EUR", exchange: "Euronext Paris", asOf: "2026-10-02T16:00:00Z")
        XCTAssertEqual(market.json["currency"] as? String, "EUR")
        let thesis = AwardThesis.make(symbol: "MC.PA", isEquity: true, direction: "long", price: 650, entry: nil, stop: nil, target: nil)
        XCTAssertFalse(thesis?.line.contains("$") == true, "A saved thesis without currency must not invent USD")
    }
}

/// Regional chips are local suggestions, independent of account/AI consent or device preferences.
final class NativeRegionalQuickAccessTests: XCTestCase {
    private final class MemoryDefaults: UserDefaults {
        private var values: [String: Any] = [:]
        init() { super.init(suiteName: "Bobby.RegionalQuickAccess.TestDouble")! }
        override func object(forKey key: String) -> Any? { values[key] }
        override func set(_ value: Any?, forKey key: String) { values[key] = value }
        override func removeObject(forKey key: String) { values.removeValue(forKey: key) }
        override func string(forKey key: String) -> String? { values[key] as? String }
        override func data(forKey key: String) -> Data? { values[key] as? Data }
        override func bool(forKey key: String) -> Bool { values[key] as? Bool ?? false }
        override func integer(forKey key: String) -> Int { values[key] as? Int ?? 0 }
    }

    func testEmptyHistorySuggestsListedRegionalSymbolsAndRetainsLegacyEnglishSpanish() {
        let cases: [(String, String, String?, [String])] = [
            ("fr", "fr-FR", "FR", ["BTC", "NVDA", "MC.PA", "TTE.PA"]),
            ("pt", "pt-PT", "PT", ["BTC", "NVDA", "EDP.LS", "GALP.LS"]),
            ("pt", "pt-BR", "BR", ["BTC", "NVDA", "PETR4.SA", "VALE3.SA"]),
            ("pt", "en-US", "BR", ["BTC", "NVDA", "PETR4.SA", "VALE3.SA"]),
            ("it", "it-IT", "IT", ["BTC", "NVDA", "ENI.MI", "ENEL.MI"]),
            ("de", "de-DE", "DE", ["BTC", "NVDA", "SAP.DE", "SIE.DE"]),
            ("en", "en-US", "FR", ["BTC", "NVDA", "ETH", "TSLA", "GOLD"]),
            ("es", "es-MX", "DE", ["BTC", "NVDA", "ETH", "TSLA", "ORO"])
        ]
        for (language, preferred, country, expected) in cases {
            let resolution = LanguageResolution.resolve(selection: language, preferredLanguages: [preferred], region: country)
            let defaults = DeskMemory.defaultQuickAccess(for: resolution)
            XCTAssertEqual(defaults, expected)
            XCTAssertEqual(Array(defaults.prefix(2)), ["BTC", "NVDA"], "Common starters must appear before regional padding in every app language")
            XCTAssertEqual(DeskMemory(defaults: MemoryDefaults()).quickAccess(fallback: defaults), expected)
        }
    }

    func testRegionalPaddingNeverRewritesPersonalHistoryOrReplacesFiveCustomSymbols() {
        let memory = DeskMemory(defaults: MemoryDefaults())
        let now = Date(timeIntervalSince1970: 1000)
        memory.recordQuery(symbol: "VOW3.DE", isEquity: true, now: now)
        memory.recordQuery(symbol: "SOL", isEquity: false, now: now.addingTimeInterval(1))
        let original = memory.watchlist
        for language in ["fr", "pt", "it", "de", "en", "es"] {
            let resolution = LanguageResolution.resolve(selection: language, preferredLanguages: ["pt-BR"], region: nil)
            let row = memory.quickAccess(fallback: DeskMemory.defaultQuickAccess(for: resolution))
            XCTAssertEqual(Array(row.prefix(2)), ["SOL", "VOW3.DE"])
            XCTAssertTrue(row.contains("BTC") && row.contains("NVDA"), "Common starters pad history without replacing it")
            XCTAssertEqual(memory.watchlist, original)
            XCTAssertEqual(Set(row).count, row.count)
        }
        for index in 0..<5 {
            memory.recordQuery(symbol: "CUSTOM\(index).PA", isEquity: true, now: now.addingTimeInterval(Double(index + 2)))
        }
        let french = LanguageResolution.resolve(selection: "fr", preferredLanguages: [], region: nil)
        XCTAssertEqual(memory.quickAccess(fallback: DeskMemory.defaultQuickAccess(for: french)),
                       memory.watchlist.prefix(5).map(\.symbol))
    }
}
