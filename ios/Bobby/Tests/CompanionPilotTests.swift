import XCTest
@testable import Bobby

@MainActor
final class CompanionPilotTests: XCTestCase {
    func testProbeRunsOnceAnd404IsOff() async {
        let p = CompanionPilot(); var calls = 0
        p.transport = { _, method, _ in calls += 1; XCTAssertEqual(method, "GET"); return (nil, 404) }
        _ = await p.probe(); _ = await p.probe()
        XCTAssertEqual(calls, 1)
        let result = await p.turn(question: "What is investing?", requestId: UUID().uuidString, candidate: nil, speech: "plain")
        XCTAssertEqual(result?["code"] as? String, "explain_off"); XCTAssertEqual(result?["retryable"] as? Bool, false); XCTAssertEqual(calls, 1)
    }
    func testRoutingKeepsSearchAndShortAssetQuestionsOut() {
        XCTAssertTrue(CompanionPilot.shouldRoute(question: "qué opinas de ethereun hoy", needsConfirmation: true, matchKind: "fuzzy"))
        XCTAssertFalse(CompanionPilot.shouldRoute(question: "ethereun", needsConfirmation: true, matchKind: "fuzzy"))
        XCTAssertFalse(CompanionPilot.shouldRoute(question: "qué opinas de ethereum hoy", needsConfirmation: false, matchKind: "exact"))
        XCTAssertFalse(CompanionPilot.shouldRoute(question: "qué opinas de ethereun hoy", needsConfirmation: true, matchKind: "proxy"))
        let firstRow: [String: Any] = ["resolved": NSNull(), "resolution": ["matchKind": "fuzzy"], "results": [["symbol": "ETH"]]]
        if case .unresolved = NucleoDeskIO.parseSearch(firstRow) {} else { XCTFail("pilot off retains today's resolution") }
        let guessed = NucleoDeskIO.parseSearch(["resolved": NSNull(), "resolution": ["matchKind": "fuzzy"],
            "results": [["symbol": "ETH", "assetClass": "crypto", "aliases": ["Ethereum"]]]], includesCandidates: true)
        if case let .resolved(asset, confirmation, kind, _) = guessed {
            XCTAssertEqual(asset.symbol, "ETH"); XCTAssertTrue(confirmation); XCTAssertEqual(kind, "fuzzy")
        } else { XCTFail("a search's first guess is carried as a candidate, never assumed") }
    }
    func testExplanationHasNoReadAndCandidateRequiresExactConfirmation() async {
        let p = CompanionPilot(); var posted: [String: Any]?
        p.transport = { _, method, body in
            if method == "GET" { return (["companion": ["context": false, "catalog": 1]], 405) }
            posted = body
            return (["version": 1, "kind": "explanation", "reply": ["text": "Explanation", "followUp": "How does bitcoin work?"], "nextAction": NSNull()], 200)
        }
        let r = await p.turn(question: "What is investing?", requestId: UUID().uuidString, candidate: nil, speech: "plain")
        XCTAssertEqual(r?["status"] as? String, "companion")
        XCTAssertNil(r?["asset"]); XCTAssertNil(r?["verdict"]); XCTAssertNil(posted?["context"])
        XCTAssertEqual(r?["followUp"] as? String, "How does bitcoin work?")
        let asset = NucleoAsset(symbol: "ETH", name: "Ethereum", isEquity: false, assetClass: "crypto")
        p.transport = { _, _, _ in (["version": 1, "kind": "desk_offer", "nextAction": ["symbol": "BTC", "requiresConfirmation": true]], 200) }
        let wrong = await p.turn(question: "qué opinas de ethereun hoy", requestId: UUID().uuidString, candidate: asset, speech: "plain")
        XCTAssertEqual(wrong?["status"] as? String, "companion_error")
        p.transport = { _, _, _ in (["version": 1, "kind": "desk_offer", "nextAction": ["symbol": "ETH", "requiresConfirmation": true]], 200) }
        let offered = await p.turn(question: "qué opinas de ethereun hoy", requestId: UUID().uuidString, candidate: asset, speech: "plain")
        XCTAssertEqual(offered?["status"] as? String, "companion_offer")
    }
    func testRevocationDiscardsPendingPersonalizedReply() async {
        let p = CompanionPilot(); var revision = UUID(); p.revision = { revision }
        p.transport = { _, method, _ in
            if method == "GET" { return (nil, 405) }
            revision = UUID()
            return (["version": 1, "kind": "explanation", "reply": ["text": "Old reply"], "personalized": true], 200)
        }
        let r = await p.turn(question: "What is investing?", requestId: UUID().uuidString, candidate: nil, speech: "plain")
        XCTAssertEqual(r?["status"] as? String, "cancelled")
    }
    func testTypedAnswerCarriesContextButNoQuestionAndKeepsThePatchSeparate() async {
        let p = CompanionPilot(); var posted: [String: Any]?
        p.context = { ["version": 1, "consent": ["notice": "memory-1", "memory": true, "money": true], "day": 1] }
        p.transport = { _, method, body in
            if method == "GET" { return (["companion": ["context": true, "catalog": 1, "notices": ["memory-1"]]], 405) }
            posted = body
            return (["version": 1, "kind": "noted", "patch": ["notes": [["field": "when", "value": "2_to_7y", "source": "said"]], "asked": ["when"]], "checkIn": ["questionId": "cushion"]], 200)
        }
        let result = await p.answer(questionId: "when", text: "in three years")
        XCTAssertEqual(result["status"] as? String, "noted")
        XCTAssertNil(posted?["question"]); XCTAssertNotNil(posted?["context"])
        XCTAssertEqual((posted?["answer"] as? [String: String])?["text"], "in three years")
        XCTAssertEqual(result["checkIn"] as? String, "cushion")
        XCTAssertNil(result["asset"]); XCTAssertNil(result["text"])
    }
    func testAnswerFailureAndUTF16LimitKeepOptionsAvailable() async {
        let p = CompanionPilot(); var posts = 0
        p.context = { ["version": 1] }
        p.transport = { _, method, _ in
            if method == "GET" { return (["companion": ["context": true]], 405) }
            posts += 1
            return (["version": 1, "kind": "error", "error": ["code": "notes_limit", "message": "Pick an option."]], 429)
        }
        let long = await p.answer(questionId: "interest", text: String(repeating: "🙂", count: 201))
        XCTAssertNotNil(long["message"]); XCTAssertEqual(posts, 0)
        let refused = await p.answer(questionId: "interest", text: "crypto")
        XCTAssertEqual(refused["message"] as? String, "Pick an option."); XCTAssertEqual(posts, 1)
        p.context = { nil }
        _ = await p.answer(questionId: "interest", text: "crypto")
        XCTAssertEqual(posts, 1, "no answer travels without consented context")
    }
    func testRevocationDiscardsPendingNotedPatchAndFactsAreEnvelopeOnly() async {
        let p = CompanionPilot(); var revision = UUID(); p.revision = { revision }; p.context = { ["version": 1] }
        p.transport = { _, method, _ in
            if method == "GET" { return (["companion": ["context": true]], 405) }
            revision = UUID()
            return (["version": 1, "kind": "noted", "patch": ["notes": [], "asked": []]], 200)
        }
        let cancelled = await p.answer(questionId: "interest", text: "crypto")
        XCTAssertEqual(cancelled["status"] as? String, "cancelled")
        p.transport = { _, _, _ in
            (["version": 1, "kind": "explanation", "reply": ["text": "Explanation", "fact": ["text": "Wrong nested card"]], "fact": ["text": "Envelope card", "source": "Source", "year": "2026"]], 200)
        }
        let result = await p.turn(question: "What is investing?", requestId: UUID().uuidString, candidate: nil, speech: nil)
        XCTAssertEqual((result?["fact"] as? [String: String])?["text"], "Envelope card")
        XCTAssertEqual(result?["text"] as? String, "Explanation")
    }

    func testFailedProbeIsNotCachedAndAskWaitsForRateLimit() async {
        let p=CompanionPilot(); var calls=0
        p.transport = { _, method, _ in
            if method == "GET" { calls += 1; return (nil,calls == 1 ? 503 : 405) }
            return (["version":1,"kind":"explanation","reply":["text":"Learning.","gist":"Learning.","followUp":NSNull()]],200)
        }
        let first=await p.probe(); XCTAssertFalse(first.known)
        let started=Date()
        let answer=await p.turn(question:"What is investing?",requestId:UUID().uuidString,candidate:nil,speech:nil)
        XCTAssertEqual(calls,2); XCTAssertGreaterThanOrEqual(Date().timeIntervalSince(started),4.8)
        XCTAssertEqual(answer?["status"] as? String,"companion"); XCTAssertEqual(answer?["gist"] as? String,"Learning.")
        _ = await p.probe(); XCTAssertEqual(calls,2)
        p.invalidateProbe(); _ = await p.probe(); XCTAssertEqual(calls,3)
    }
    func testRoutingCanonicalReadsAndExplanationsInSixLanguages() {
        let asset=NucleoAsset(symbol:"BTC",name:"Bitcoin",isEquity:false,assetClass:"crypto")
        let reads=["en":"Analyze Bitcoin today!","es":"¡Analiza Bitcoin hoy!","fr":"Analyse Bitcoin aujourd’hui","pt":"Analisa Bitcoin hoje","it":"Analizza Bitcoin oggi","de":"Analysiere Bitcoin heute"]
        let explanations=["en":"What is Bitcoin?","es":"¿Qué es Bitcoin?","fr":"C’est quoi Bitcoin ?","pt":"O que é Bitcoin?","it":"Che cos’è Bitcoin?","de":"Was ist Bitcoin?"]
        for language in reads.keys {
            XCTAssertTrue(ConversationRouting.isRead(reads[language]!,asset:asset,language:language),language)
            XCTAssertTrue(ConversationRouting.isRead("BTC",asset:asset,language:language))
            XCTAssertFalse(ConversationRouting.isRead(explanations[language]!,asset:asset,language:language),language)
        }
    }
    func testLimitDatesDoNotInventTimeAndFollowLocalDay() {
        let old=L.language; defer { UserDefaults.standard.set(old,forKey:L.preferenceKey) }
        UserDefaults.standard.set("es",forKey:L.preferenceKey)
        var calendar=Calendar(identifier:.gregorian); calendar.timeZone=TimeZone(secondsFromGMT:0)!
        let now=calendar.date(from:DateComponents(year:2026,month:10,day:10,hour:23,minute:30))!
        let tomorrow=now.addingTimeInterval(6300)
        let when=ConversationCopy.when(tomorrow,now:now,calendar:calendar,locale:Locale(identifier:"es_MX"))
        XCTAssertTrue(when.hasPrefix("mañana a la "),when)
        XCTAssertEqual(ConversationCopy.limit(headers:[:],now:now),ConversationCopy.limitUnknown())
        XCTAssertEqual(ConversationCopy.limit(headers:["Retry-After":"invalid"],now:now),ConversationCopy.limitUnknown())
        XCTAssertEqual(ConversationCopy.limit(headers:["Retry-After":"6300"],now:now,calendar:calendar,locale:Locale(identifier:"es_MX")),ConversationCopy.limitKnown(when))
    }

}
