import XCTest
import UIKit

/// Offline release checks. The runner selects each language, simulator and content size.
final class Accessibility72Shots: ConversationFixtureCase {
    private var firstWords: [String: String] { labels["onboarding"] as! [String: String] }
    private var contentSize: String? {
        guard let value = ProcessInfo.processInfo.environment["REDESIGN_CONTENT_SIZE"],
              !value.isEmpty, value.lowercased() != "default" else { return nil }
        return value.uppercased() == "AX5" ? UIContentSizeCategory.accessibilityExtraExtraExtraLarge.rawValue : value
    }
    private var textScale: CGFloat {
        let category = contentSize.map { UIContentSizeCategory(rawValue: $0) }
            ?? UIApplication.shared.preferredContentSizeCategory
        let traits = UITraitCollection(preferredContentSizeCategory: category)
        return UIFontMetrics(forTextStyle: .body).scaledValue(for: 17, compatibleWith: traits) / 17
    }
    private var explanation: (lead: String, end: String) {
        [
            "en": ("Investing means putting money into something whose value can change.", "You can start by understanding the concepts, without choosing a product yet."),
            "es": ("Invertir significa poner dinero en algo cuyo valor puede cambiar.", "Puedes empezar entendiendo los conceptos, sin elegir todavía un producto."),
            "fr": ("Investir, c’est mettre de l’argent dans quelque chose dont la valeur peut changer.", "Tu peux commencer par comprendre les notions, sans choisir un produit."),
            "pt": ("Investir é colocar dinheiro em algo cujo valor pode mudar.", "Você pode começar entendendo os conceitos, sem escolher um produto ainda."),
            "it": ("Investire significa mettere denaro in qualcosa il cui valore può cambiare.", "Puoi iniziare capendo i concetti, senza scegliere ancora un prodotto."),
            "de": ("Investieren bedeutet, Geld in etwas zu stecken, dessen Wert sich ändern kann.", "Du kannst zuerst die Begriffe verstehen, ohne schon ein Produkt zu wählen.")
        ][language]!
    }
    private var disclosure: (title: String, end: String) {
        [
            "en": ("Allow AI processing of my questions.", "You can withdraw AI consent here at any time."),
            "es": ("Permito que la IA procese mis preguntas.", "Puedes retirar aquí el consentimiento de IA cuando quieras."),
            "fr": ("J’autorise le traitement de mes questions par l’IA.", "Tu peux retirer ce consentement ici à tout moment."),
            "pt": ("Autorizo o processamento das minhas perguntas por IA.", "Podes retirar o consentimento de IA aqui a qualquer momento."),
            "it": ("Consento l’elaborazione delle mie domande tramite IA.", "Puoi revocare il consenso all’IA qui in qualsiasi momento."),
            "de": ("Ich erlaube die Verarbeitung meiner Fragen durch KI.", "Du kannst die KI-Einwilligung hier jederzeit widerrufen.")
        ][language]!
    }

    private func freshFirstRun() {
        app = XCUIApplication()
        let locale = ["en": "en_US", "es": "es_MX", "fr": "fr_FR", "pt": "pt_PT", "it": "it_IT", "de": "de_DE"][language]!
        app.launchArguments = [
            "-nucleo-fixtures", "companion-plain", "-nucleo-page", "onboarding", "-nucleo-reset-onboarding",
            "-qa-speech-fixture", "words", "-qa-speech-permission", "granted",
            "-agent.riskNoticeVersion", "0", "-avatar.voiceMuted", "YES", "-nucleo.voiceMuteReset.v1", "YES",
            "-AppleLanguages", "(\(language))", "-app.language", language, "-AppleLocale", locale
        ]
        if let contentSize { app.launchArguments += ["-UIPreferredContentSizeCategoryName", contentSize] }
        app.launch()
        ready(web.buttons[firstWords["aria.type"]!])
    }

    private func readingRegion(_ label: String) -> XCUIElement {
        // WebKit appends the localized role (for example ", región") to a region's AX label.
        let query = web.descendants(matching: .any).matching(NSPredicate(format: "label == %@ OR label BEGINSWITH %@", label, label + ", "))
        var found: XCUIElement?
        let available = XCTNSPredicateExpectation(predicate: NSPredicate { _, _ in
            found = query.allElementsBoundByIndex.first {
                ($0.elementType == .other || $0.elementType == .scrollView) && !$0.frame.isEmpty
            }
            return found != nil
        }, object: nil)
        XCTAssertEqual(XCTWaiter.wait(for: [available], timeout: 15), .completed, app.debugDescription)
        return found ?? query.firstMatch
    }

    private func assertViewport(_ region: XCUIElement, above controls: [XCUIElement], minimumLine: CGFloat) {
        let frame = region.frame, screen = app.windows.firstMatch.frame
        XCTAssertFalse(frame.isEmpty, region.debugDescription)
        XCTAssertGreaterThanOrEqual(frame.height + 1, minimumLine, "The reading viewport must contain a complete line")
        XCTAssertGreaterThanOrEqual(frame.minX, screen.minX - 1)
        XCTAssertLessThanOrEqual(frame.maxX, screen.maxX + 1)
        XCTAssertGreaterThanOrEqual(frame.minY, screen.minY)
        for control in controls {
            ready(control)
            XCTAssertLessThanOrEqual(frame.maxY, control.frame.minY + 1, "Text must end above the fixed controls")
        }
    }

    /// Drag inside the actual WKWebView region, leaving its consent/retry controls untouched.
    private func revealEnd(of text: XCUIElement, in region: XCUIElement, fixed controls: [XCUIElement]) {
        XCTAssertTrue(text.waitForExistence(timeout: 10), app.debugDescription)
        let original = text.frame
        let anchors = controls.map { $0.frame }
        func endIsVisible() -> Bool {
            !text.frame.isEmpty && text.frame.maxY <= region.frame.maxY + 2 && text.frame.maxY > region.frame.minY + 1
        }
        var dragged = false
        for _ in 0..<16 where !endIsVisible() {
            dragged = true
            let from = region.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.85))
            let to = region.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.15))
            from.press(forDuration: 0.05, thenDragTo: to)
        }
        XCTAssertTrue(endIsVisible(), "The final disclosure/error/answer line must be reachable inside its reading viewport: \(text.debugDescription)")
        if dragged { XCTAssertLessThan(text.frame.minY, original.minY - 1, "The text must really scroll") }
        for (index, control) in controls.enumerated() {
            XCTAssertTrue(control.isHittable, control.debugDescription)
            XCTAssertEqual(control.frame.minY, anchors[index].minY, accuracy: 1, "Scrolling text must not move its controls")
        }
    }

    func test01Consent() {
        freshFirstRun()
        let example = web.buttons.matching(NSPredicate(format: "label IN %@", (1...6).map { firstWords["ex.\($0)"]! })).firstMatch
        ready(example); example.tap()
        let notice = web.buttons[firstWords["risk.notice"]!]
        let accept = web.buttons[firstWords["risk.activate"]!]
        let later = web.buttons[firstWords["risk.notNow"]!]
        ready(notice); ready(accept); ready(later)
        let region = readingRegion(disclosure.title)
        let body = web.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", disclosure.end)).firstMatch
        XCTAssertTrue(body.waitForExistence(timeout: 10), app.debugDescription)
        for provider in ["OpenAI", "Anthropic", "Microsoft"] { XCTAssertTrue(body.label.contains(provider), body.label) }
        assertViewport(region, above: [notice, accept, later], minimumLine: 18 * textScale * min(app.windows.firstMatch.frame.width / 390, app.windows.firstMatch.frame.height / 844))
        revealEnd(of: body, in: region, fixed: [notice, accept, later])
        XCTAssertFalse(button("aria.closeAnswer").exists, "Reading the disclosure cannot accept consent or send the question")
        shot("01-consent", delay: 0)
    }

    func test02FirstExplanation() {
        launch("companion-plain", contentSize: contentSize)
        ask(); answered()
        // Muted narration enters reading; wait for the contextual action to settle its final slot.
        let followPrefix = word("aria.ask").components(separatedBy: "{question}")[0]
        let follow = web.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", followPrefix)).firstMatch
        ready(follow)
        let region = readingRegion(word("aria.answer"))
        let lead = web.staticTexts[explanation.lead]
        let body = web.staticTexts[explanation.end]
        XCTAssertTrue(lead.waitForExistence(timeout: 10), app.debugDescription)
        XCTAssertGreaterThanOrEqual(lead.frame.intersection(region.frame).height + 1, 27 * textScale,
                                    "The first complete line must be readable before scrolling")
        XCTAssertGreaterThan(lead.label.split(separator: " ").count, 1)
        assertViewport(region, above: [follow], minimumLine: 27 * textScale)
        shot("02-first-explanation", delay: 0)
        revealEnd(of: body, in: region, fixed: [follow])
    }

    func test03RetryError() {
        launch("companion-error", contentSize: contentSize)
        ask()
        let retry = button("fail.retry")
        ready(retry)
        let region = readingRegion(word("aria.answer"))
        let error = web.staticTexts[word("fail.answer")]
        XCTAssertTrue(error.waitForExistence(timeout: 10), app.debugDescription)
        assertViewport(region, above: [retry], minimumLine: 27 * textScale)
        revealEnd(of: error, in: region, fixed: [retry])
        XCTAssertFalse(app.keyboards.firstMatch.exists)
        shot("03-retry-error", delay: 0)
    }
}
