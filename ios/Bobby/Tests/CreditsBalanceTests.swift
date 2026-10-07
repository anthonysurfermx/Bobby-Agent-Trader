import Foundation
import XCTest
@testable import Bobby

/// Credits (1.8): one model of what a person has, from the server's word only. These pin every
/// line the profile row and the Credits screen can show, in English and Spanish, and the promise
/// that a number the server did not send is left out instead of shown as zero.
final class CreditsBalanceTests: XCTestCase {
    /// Wednesday 7 October 2026, noon UTC.
    private let now = BobbyAccessAPI.date("2026-10-07T12:00:00Z")!
    private let utc = TimeZone(identifier: "UTC")!

    private func balance(_ snapshot: CreditsSnapshot, spanish: Bool = false) -> CreditsBalance {
        CreditsBalance.make(snapshot, now: now, spanish: spanish, timeZone: utc)
    }

    private func meter(_ json: [String: Any]) throws -> NucleoLevelMeter { try XCTUnwrap(NucleoLevelMeter(json: json)) }

    private func referral(proUntil: String? = nil, source: String? = nil, rewardDays: Int? = 30, max: Int = 5) throws -> NucleoReferral {
        var json: [String: Any] = ["code": "ABCDEFGH", "url": "https://bobbyprotocol.xyz/desk?ref=ABCDEFGH&v=2", "accepted": 1, "max": max]
        if let rewardDays { json["rewardDays"] = rewardDays }
        if let proUntil { json["proUntil"] = proUntil }
        if let source { json["proSource"] = source }
        return try XCTUnwrap(NucleoReferral(json: json))
    }

    private func free(used: Int = 3, remaining: Int? = 7, resetsAt: String? = "2026-10-09T12:00:00Z", paywall: Bool = true, bonus: Int = 0) -> BobbyReadAccess {
        BobbyReadAccess(tier: "free", used: used, limit: 10, remaining: remaining, resetsAt: resetsAt, paywall: paywall, bonus: bonus)
    }

    private var pro: BobbyReadAccess {
        BobbyReadAccess(tier: "pro", used: 40, limit: nil, remaining: nil, resetsAt: nil, paywall: true)
    }

    // MARK: Quick reads

    func testAGuestSeesWhatIsLeftAndWhatAFreeAccountGives() throws {
        let anon = BobbyReadAccess(tier: "anon", used: 1, limit: 3, remaining: nil, resetsAt: nil, paywall: true)
        let guest = CreditsSnapshot(access: anon, signedIn: false, freeReadsPerWeek: 10)
        let en = try XCTUnwrap(balance(guest).line(.quick))
        XCTAssertEqual(en.title, "Quick reads")
        XCTAssertEqual(en.value, "2 of 3 left", "remaining falls back to limit − used; a guest's reads do not reset weekly")
        XCTAssertEqual(en.detail, "Create your free account to get 10 every week")
        let es = try XCTUnwrap(balance(guest, spanish: true).line(.quick))
        XCTAssertEqual(es.title, "Lecturas Rápidas")
        XCTAssertEqual(es.value, "Te quedan 2 de 3")
        XCTAssertEqual(es.detail, "Crea tu cuenta gratis para tener 10 cada semana")

        let unknownPlan = CreditsSnapshot(access: anon, signedIn: false)
        XCTAssertEqual(balance(unknownPlan).line(.quick)?.detail, "Create your free account to keep reading", "no number the server did not send")
        XCTAssertEqual(balance(unknownPlan, spanish: true).line(.quick)?.detail, "Crea tu cuenta gratis para seguir leyendo")
        XCTAssertNil(balance(guest).line(.pro), "Bobby Pro belongs to an account: a guest has no line for it")
        XCTAssertEqual(balance(guest).summary, "2 of 3 reads")
        XCTAssertEqual(balance(guest, spanish: true).summary, "2 de 3 lecturas")
    }

    func testAFreeAccountSeesTheWeekAndTheDayItResets() throws {
        let snapshot = CreditsSnapshot(access: free(), signedIn: true)
        let en = try XCTUnwrap(balance(snapshot).line(.quick))
        XCTAssertEqual(en.value, "7 of 10 left this week")
        XCTAssertEqual(en.detail, "Next read back on Friday")
        let es = try XCTUnwrap(balance(snapshot, spanish: true).line(.quick))
        XCTAssertEqual(es.value, "Te quedan 7 de 10 esta semana")
        XCTAssertEqual(es.detail, "La próxima vuelve el viernes")
        XCTAssertEqual(en.spoken, "Quick reads: 7 of 10 left this week. Next read back on Friday")

        XCTAssertEqual(balance(CreditsSnapshot(access: free(used: 4, remaining: nil), signedIn: true)).line(.quick)?.value, "6 of 10 left this week")
        XCTAssertEqual(balance(CreditsSnapshot(access: free(resetsAt: "2026-10-07T20:00:00Z"), signedIn: true)).line(.quick)?.detail, "Next read back today")
        XCTAssertEqual(balance(CreditsSnapshot(access: free(resetsAt: "2026-10-07T20:00:00Z"), signedIn: true), spanish: true).line(.quick)?.detail, "La próxima vuelve hoy")
        XCTAssertEqual(balance(CreditsSnapshot(access: free(resetsAt: "2026-10-14T11:00:00Z"), signedIn: true)).line(.quick)?.detail,
                       "Next read back October 14", "a weekday a week away would read as today's")
        XCTAssertNil(balance(CreditsSnapshot(access: free(used: 0, remaining: 10, resetsAt: nil), signedIn: true)).line(.quick)?.detail)
        XCTAssertNil(balance(CreditsSnapshot(access: free(resetsAt: "2026-10-01T00:00:00Z"), signedIn: true)).line(.quick)?.detail,
                     "a reset that already happened is not a date to wait for")
    }

    func testProAndAnAccountWithoutTheWeeklyCapReadUnlimited() throws {
        let open = CreditsSnapshot(access: free(paywall: false), signedIn: true)
        XCTAssertEqual(balance(open).line(.quick)?.value, "Unlimited")
        XCTAssertNil(balance(open).line(.quick)?.detail)
        XCTAssertEqual(balance(open, spanish: true).line(.quick)?.value, "Ilimitadas")
        XCTAssertEqual(balance(open).summary, "Unlimited reads")
        XCTAssertEqual(balance(open, spanish: true).summary, "Lecturas ilimitadas")

        let paid = CreditsSnapshot(access: pro, subscription: BobbySubscription(provider: "apple", status: "active", currentPeriodEnd: "2026-10-27T12:00:00Z"), signedIn: true)
        XCTAssertEqual(balance(paid).line(.quick)?.value, "Unlimited")
        XCTAssertEqual(balance(paid).line(.quick)?.detail, "With Bobby Pro, within fair use.")
        XCTAssertEqual(balance(paid, spanish: true).line(.quick)?.detail, "Con Bobby Pro, dentro del uso justo.")
    }

    // MARK: Deep and Max

    func testDeepAndMaxShowWhatIsLeftInTheirOwnWindow() throws {
        let weekly: [NucleoAnalysisLevel: NucleoLevelMeter] = [
            .profundo: try meter(["used": 1, "limit": 3, "remaining": 2, "windowDays": 7, "resetsAt": "2026-10-11T09:00:00Z"]),
            .maximo: try meter(["used": 0, "limit": 1, "windowDays": 7])
        ]
        let account = CreditsSnapshot(access: free(), meters: weekly, signedIn: true)
        let deep = try XCTUnwrap(balance(account).line(.deep))
        XCTAssertEqual(deep.title, "Deep reads")
        XCTAssertEqual(deep.value, "2 of 3 left this week")
        XCTAssertEqual(deep.detail, "Next read back on Sunday")
        let max = try XCTUnwrap(balance(account).line(.max))
        XCTAssertEqual(max.title, "Max reads")
        XCTAssertEqual(max.value, "1 of 1 left this week", "remaining falls back to limit − used")
        XCTAssertNil(max.detail)
        XCTAssertEqual(balance(account, spanish: true).line(.deep)?.title, "Lecturas Profundas")
        XCTAssertEqual(balance(account, spanish: true).line(.deep)?.value, "Te quedan 2 de 3 esta semana")
        XCTAssertEqual(balance(account, spanish: true).line(.deep)?.detail, "La próxima vuelve el domingo")
        XCTAssertEqual(balance(account, spanish: true).line(.max)?.title, "Lecturas Máximas")

        let monthly: [NucleoAnalysisLevel: NucleoLevelMeter] = [
            .profundo: try meter(["used": 12, "limit": 60, "remaining": 48, "windowDays": 30, "resetsAt": "2026-10-25T09:00:00Z"]),
            .maximo: try meter(["used": 0, "limit": 10, "remaining": 10, "windowDays": 30])
        ]
        let paid = CreditsSnapshot(access: pro, meters: monthly, signedIn: true)
        XCTAssertEqual(balance(paid).line(.deep)?.value, "48 of 60 left")
        XCTAssertEqual(balance(paid).line(.deep)?.detail, "Every 30 days · next read back October 25")
        XCTAssertEqual(balance(paid).line(.max)?.detail, "Every 30 days")
        XCTAssertEqual(balance(paid, spanish: true).line(.deep)?.value, "Te quedan 48 de 60")
        XCTAssertEqual(balance(paid, spanish: true).line(.deep)?.detail, "Cada 30 días · la próxima vuelve el 25 de octubre")
        XCTAssertEqual(balance(paid, spanish: true).line(.max)?.detail, "Cada 30 días")
    }

    func testAGuestWithoutMaxReadsIsToldWhereTheyAre() throws {
        let anon = BobbyReadAccess(tier: "anon", used: 0, limit: 3, remaining: 3, resetsAt: nil, paywall: true)
        let meters: [NucleoAnalysisLevel: NucleoLevelMeter] = [
            .profundo: try meter(["used": 0, "limit": 1, "remaining": 1, "windowDays": 30]),
            .maximo: try meter(["used": 0, "limit": 0, "remaining": 0, "windowDays": 30])
        ]
        let guest = CreditsSnapshot(access: anon, meters: meters, signedIn: false)
        XCTAssertEqual(balance(guest).line(.deep)?.value, "1 of 1 left")
        XCTAssertEqual(balance(guest).line(.max)?.value, "With your free account", "never 0 of 0")
        XCTAssertEqual(balance(guest, spanish: true).line(.max)?.value, "Con tu cuenta gratis")
        let account = CreditsSnapshot(access: free(), meters: meters, signedIn: true)
        XCTAssertNil(balance(account).line(.max), "an account whose plan has none simply has no line")
    }

    // MARK: Unknown is not zero

    func testWhatTheServerDidNotSendIsLeftOut() throws {
        let nothing = balance(CreditsSnapshot(access: nil, signedIn: true))
        XCTAssertTrue(nothing.lines.isEmpty)
        XCTAssertNil(nothing.summary)
        XCTAssertFalse(nothing.isKnown)
        XCTAssertEqual(nothing.giftTotal, 0)
        XCTAssertFalse(nothing.manage)

        let noMeters = balance(CreditsSnapshot(access: free(), signedIn: true))
        XCTAssertEqual(noMeters.lines.map(\.kind), [.quick, .pro], "Deep and Max were not loaded: no line, never 0")

        let limitless = try meter(["used": 2])
        let partial = balance(CreditsSnapshot(access: free(), meters: [.profundo: limitless], signedIn: true))
        XCTAssertNil(partial.line(.deep), "a meter without its limit says nothing")

        let noLimit = BobbyReadAccess(tier: "free", used: 2, limit: nil, remaining: nil, resetsAt: nil, paywall: true)
        let unknownQuick = balance(CreditsSnapshot(access: noLimit, signedIn: true))
        XCTAssertNil(unknownQuick.line(.quick))
        XCTAssertNil(unknownQuick.summary)
        XCTAssertNil(unknownQuick.line(.giftQuick), "no gift line for a balance of none")
    }

    // MARK: Gifted reads

    func testGiftedReadsShowPerLevelOnlyWhatExistsAndWhenTheyAreUsed() throws {
        let meters: [NucleoAnalysisLevel: NucleoLevelMeter] = [
            .profundo: try meter(["used": 3, "limit": 3, "remaining": 0, "bonus": 2, "windowDays": 7]),
            .maximo: try meter(["used": 1, "limit": 1, "remaining": 0, "bonus": 0, "windowDays": 7])
        ]
        let account = CreditsSnapshot(access: free(bonus: 3), meters: meters, signedIn: true)
        let en = balance(account)
        XCTAssertEqual(en.lines.map(\.kind), [.quick, .deep, .max, .giftQuick, .giftDeep, .pro])
        XCTAssertEqual(en.line(.giftQuick)?.title, "Gifted Quick reads")
        XCTAssertEqual(en.line(.giftQuick)?.value, "3")
        XCTAssertEqual(en.line(.giftQuick)?.detail, "Used after your plan's reads run out.")
        XCTAssertEqual(en.line(.giftDeep)?.title, "Gifted Deep reads")
        XCTAssertEqual(en.line(.giftDeep)?.value, "2")
        XCTAssertNil(en.line(.giftMax), "a level with no gift has no line")
        XCTAssertEqual(en.giftTotal, 5)
        XCTAssertEqual(en.line(.quick)?.value, "7 of 10 left this week", "gifts never inflate the plan's count")
        XCTAssertEqual(en.summary, "7 of 10 reads · 5 gifted")
        let es = balance(account, spanish: true)
        XCTAssertEqual(es.line(.giftQuick)?.title, "Lecturas Rápidas de regalo")
        XCTAssertEqual(es.line(.giftQuick)?.detail, "Se usan cuando se acaban las lecturas de tu plan.")
        XCTAssertEqual(es.line(.giftDeep)?.title, "Lecturas Profundas de regalo")
        XCTAssertEqual(es.summary, "7 de 10 lecturas · 5 de regalo")

        let one = balance(CreditsSnapshot(access: free(bonus: 1), signedIn: true))
        XCTAssertEqual(one.summary, "7 of 10 reads · 1 gifted")
    }

    func testAProAccountsGiftedQuickReadsAreKeptAndItsPremiumGiftsAreUsedAfterThePlan() throws {
        let access = BobbyReadAccess(tier: "pro", used: 40, limit: nil, remaining: nil, resetsAt: nil, paywall: true, bonus: 20)
        let meters: [NucleoAnalysisLevel: NucleoLevelMeter] = [
            .maximo: try meter(["used": 10, "limit": 10, "remaining": 0, "bonus": 1, "windowDays": 30])
        ]
        let paid = CreditsSnapshot(access: access, meters: meters,
                                   subscription: BobbySubscription(provider: "apple", status: "active", currentPeriodEnd: "2026-10-27T12:00:00Z"), signedIn: true)
        XCTAssertEqual(balance(paid).line(.giftQuick)?.detail, "Kept for when you are not on Bobby Pro.")
        XCTAssertEqual(balance(paid, spanish: true).line(.giftQuick)?.detail, "Se guardan para cuando no tengas Bobby Pro.")
        XCTAssertEqual(balance(paid).line(.giftMax)?.title, "Gifted Max reads")
        XCTAssertEqual(balance(paid).line(.giftMax)?.detail, "Used after your plan's reads run out.")
        XCTAssertEqual(balance(paid).summary, "Bobby Pro active · 21 gifted")
        XCTAssertEqual(balance(paid, spanish: true).summary, "Bobby Pro activo · 21 de regalo")

        let open = CreditsSnapshot(access: free(paywall: false, bonus: 4), signedIn: true)
        XCTAssertEqual(balance(open).line(.giftQuick)?.detail, "Kept for when Quick reads have a weekly limit.")
    }

    // MARK: Bobby Pro

    func testBobbyProSaysWhereItComesFromAndWhenItChanges() throws {
        let account = CreditsSnapshot(access: free(), signedIn: true)
        XCTAssertEqual(balance(account).line(.pro)?.value, "Not active")
        XCTAssertEqual(balance(account, spanish: true).line(.pro)?.value, "No activo")
        XCTAssertFalse(balance(account).pro.isPro)
        XCTAssertTrue(balance(account).pro.offersPro, "no plan: Bobby Pro is offered")

        let apple = BobbySubscription(provider: "apple", status: "active", currentPeriodEnd: "2026-10-27T12:00:00Z")
        let store = balance(CreditsSnapshot(access: pro, subscription: apple, signedIn: true))
        XCTAssertEqual(store.pro.plan, .appStore)
        XCTAssertEqual(store.line(.pro)?.value, "Active · renews October 27")
        XCTAssertNil(store.line(.pro)?.detail)
        XCTAssertTrue(store.manage, "an App Store plan is managed from the phone")
        XCTAssertTrue(store.pro.pays)
        XCTAssertFalse(store.pro.offersPro)
        XCTAssertEqual(store.summary, "Bobby Pro active")
        XCTAssertEqual(balance(CreditsSnapshot(access: pro, subscription: apple, signedIn: true), spanish: true).line(.pro)?.value,
                       "Activo · se renueva el 27 de octubre")

        let card = balance(CreditsSnapshot(access: pro, subscription: BobbySubscription(provider: "stripe", status: "active", currentPeriodEnd: nil), signedIn: true))
        XCTAssertEqual(card.pro.plan, .card)
        XCTAssertEqual(card.line(.pro)?.value, "Active")
        XCTAssertEqual(card.line(.pro)?.detail, "Managed on the web.")
        XCTAssertFalse(card.manage)
        XCTAssertTrue(card.pro.pays)
        XCTAssertFalse(card.pro.offersPro)
        let cardEs = balance(CreditsSnapshot(access: pro, subscription: BobbySubscription(provider: "stripe", status: "active", currentPeriodEnd: nil), signedIn: true), spanish: true)
        XCTAssertEqual(cardEs.line(.pro)?.value, "Activo")
        XCTAssertEqual(cardEs.line(.pro)?.detail, "Se administra en la web.")

        let ending = balance(CreditsSnapshot(access: pro, subscription: BobbySubscription(provider: "apple", status: "canceled", currentPeriodEnd: "2026-10-27T12:00:00Z"), signedIn: true))
        XCTAssertEqual(ending.line(.pro)?.value, "Active · ends October 27")
        XCTAssertEqual(ending.summary, "Bobby Pro until Oct 27")

        let bare = balance(CreditsSnapshot(access: pro, signedIn: true))
        XCTAssertEqual(bare.pro.plan, .active, "the server says Pro and the reason did not reach the app")
        XCTAssertEqual(bare.line(.pro)?.value, "Active")
        XCTAssertFalse(bare.pro.pays)
        XCTAssertFalse(bare.pro.offersPro, "a Pro account is not offered Bobby Pro while its subscription has not been read")
        XCTAssertFalse(bare.manage, "and Manage waits for the word that it is an App Store plan")
    }

    func testGiftedProNamesItsSourceAndItsLastDay() throws {
        let invited = CreditsSnapshot(access: pro, referral: try referral(proUntil: "2026-11-12T12:00:00Z", source: "referral"), signedIn: true)
        let en = balance(invited)
        XCTAssertEqual(en.pro.plan, .gifted)
        XCTAssertEqual(en.line(.pro)?.value, "Gifted until November 12")
        XCTAssertEqual(en.line(.pro)?.detail, "From your invitations.")
        XCTAssertFalse(en.manage)
        XCTAssertFalse(en.pro.pays)
        XCTAssertTrue(en.pro.offersPro, "gifted days can still become a plan: the Bobby Pro offer stays")
        XCTAssertEqual(en.summary, "Bobby Pro until Nov 12")
        let es = balance(invited, spanish: true)
        XCTAssertEqual(es.line(.pro)?.value, "Regalado hasta el 12 de noviembre")
        XCTAssertEqual(es.line(.pro)?.detail, "Por tus invitaciones.")
        XCTAssertTrue(es.summary?.hasPrefix("Bobby Pro hasta el 12 nov") == true, es.summary ?? "")

        let fromBobby = balance(CreditsSnapshot(access: pro, referral: try referral(proUntil: "2027-02-01T12:00:00Z", source: "admin"), signedIn: true))
        XCTAssertEqual(fromBobby.line(.pro)?.detail, "A gift from Bobby.")
        XCTAssertTrue(fromBobby.line(.pro)?.value.contains("2027") == true, "a date in another year says its year")
        XCTAssertEqual(balance(CreditsSnapshot(access: pro, referral: try referral(proUntil: "2027-02-01T12:00:00Z", source: "admin"), signedIn: true), spanish: true)
            .line(.pro)?.detail, "Un regalo de Bobby.")

        let expiredApple = BobbySubscription(provider: "apple", status: "expired", currentPeriodEnd: "2020-01-01T00:00:00Z")
        let afterPaid = balance(CreditsSnapshot(access: pro, referral: try referral(proUntil: "2026-11-12T12:00:00Z", source: "admin"),
                                                subscription: expiredApple, signedIn: true))
        XCTAssertEqual(afterPaid.pro.plan, .gifted, "an expired paid row cannot hide the live grant")

        let apple = BobbySubscription(provider: "apple", status: "active", currentPeriodEnd: "2026-10-27T12:00:00Z")
        let both = balance(CreditsSnapshot(access: pro, referral: try referral(proUntil: "2026-11-30T12:00:00Z", source: "referral"),
                                           subscription: apple, signedIn: true))
        XCTAssertEqual(both.pro.plan, .appStore, "a live paid period keeps its subscription controls")
        XCTAssertEqual(both.line(.pro)?.value, "Active · renews October 27")
        XCTAssertEqual(both.line(.pro)?.detail, "Your gifted days run until November 30.", "gifted days waiting behind a paid period stay visible")

        let lapsed = balance(CreditsSnapshot(access: pro, referral: try referral(proUntil: "2026-10-01T00:00:00Z", source: "referral"), signedIn: true))
        XCTAssertEqual(lapsed.pro.plan, .active, "a grant that already ended is not the reason")
        XCTAssertNil(lapsed.pro.giftUntil)
    }

    // MARK: Getting more

    func testTheInviteRowPromisesOnlyWhatTheServerAndTheBuildCanGive() throws {
        let closed = CreditsSnapshot(access: free(), referral: try referral(), proPurchasable: false, signedIn: true)
        XCTAssertEqual(CreditsBalance.inviteDetail(closed, spanish: false), "Share Bobby with someone you know.",
                       "no Bobby Pro reward where Bobby Pro cannot be had")
        let open = CreditsSnapshot(access: free(), referral: try referral(rewardDays: 30, max: 5), proPurchasable: true, signedIn: true)
        XCTAssertEqual(CreditsBalance.inviteDetail(open, spanish: false),
                       "You get 30 days of Bobby Pro for each friend who joins with your link, up to 5 friends.")
        XCTAssertEqual(CreditsBalance.inviteDetail(open, spanish: true),
                       "Recibes 30 días de Bobby Pro por cada amigo que se una con tu link, hasta 5 amigos.")
        let plansOnly = CreditsSnapshot(access: free(), proPurchasable: true, signedIn: true, rewardDays: 14, maxFriends: 3)
        XCTAssertEqual(CreditsBalance.inviteDetail(plansOnly, spanish: false),
                       "You get 14 days of Bobby Pro for each friend who joins with your link, up to 3 friends.")
        let daysOnly = CreditsSnapshot(access: free(), proPurchasable: true, signedIn: true, rewardDays: 30)
        XCTAssertEqual(CreditsBalance.inviteDetail(daysOnly, spanish: false), "30 days of Bobby Pro for each friend who joins")
        let unknown = CreditsSnapshot(access: free(), proPurchasable: true, signedIn: true)
        XCTAssertEqual(CreditsBalance.inviteDetail(unknown, spanish: false), "Bobby Pro for each friend who joins", "no invented number of days")
    }

    @MainActor func testTheWeeklyPlanNumberComesOnlyFromTheServersPlans() {
        let before = CreditsPlans.freeReadsPerWeek
        defer { CreditsPlans.note(["plans": ["freeReadsPerWeek": before.map { $0 as Any } ?? NSNull()]]) }
        CreditsPlans.note(["plans": ["freeReadsPerWeek": 10]])
        XCTAssertEqual(CreditsPlans.freeReadsPerWeek, 10)
        CreditsPlans.note(["access": ["tier": "free"]])
        XCTAssertEqual(CreditsPlans.freeReadsPerWeek, 10, "a reply without plans says nothing")
        CreditsPlans.note(nil)
        XCTAssertEqual(CreditsPlans.freeReadsPerWeek, 10)
        CreditsPlans.note(["plans": ["freeReadsPerWeek": NSNull()]])
        XCTAssertNil(CreditsPlans.freeReadsPerWeek, "null means there is no weekly cap right now")
        CreditsPlans.note(["plans": ["freeReadsPerWeek": true]])
        XCTAssertNil(CreditsPlans.freeReadsPerWeek, "a boolean is not a count")
    }

    // MARK: Six languages

    func testEveryCreditsRowHasFourTranslationsThatKeepTheirPlaceholders() {
        let rows = NativeTranslations18.credits
        XCTAssertFalse(rows.isEmpty)
        for (key, translations) in rows {
            XCTAssertEqual(Set(translations.keys), ["fr", "pt", "it", "de"], key)
            let placeholders = Set(key.matches(of: /\{\d+\}/).map { String($0.0) })
            for (language, text) in translations {
                XCTAssertFalse(text.trimmingCharacters(in: .whitespaces).isEmpty, "\(key) [\(language)]")
                XCTAssertEqual(Set(text.matches(of: /\{\d+\}/).map { String($0.0) }), placeholders, "\(key) [\(language)]")
                XCTAssertFalse(text.contains("!"), "no exclamation marks: \(key) [\(language)]")
            }
        }
    }
}
