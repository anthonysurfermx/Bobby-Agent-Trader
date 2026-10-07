import Foundation
import XCTest
@testable import Bobby

/// Restore Purchases, in words (1.8): the answer under the row is a sentence with a next step, and
/// an account that is on Bobby Pro by a gift or by a card plan is never told it has no subscription.
final class CreditsRestoreTests: XCTestCase {
    private let now = BobbyAccessAPI.date("2026-10-07T12:00:00Z")!
    private let utc = TimeZone(identifier: "UTC")!

    private var proAccess: BobbyReadAccess { BobbyReadAccess(tier: "pro", used: 9, limit: nil, remaining: nil, resetsAt: nil, paywall: true) }
    private var freeAccess: BobbyReadAccess { BobbyReadAccess(tier: "free", used: 3, limit: 10, remaining: 7, resetsAt: nil, paywall: true) }

    private func referral(proUntil: String, source: String) throws -> NucleoReferral {
        try XCTUnwrap(NucleoReferral(json: ["code": "ABCDEFGH", "url": "https://bobbyprotocol.xyz/desk?ref=ABCDEFGH&v=2",
                                            "accepted": 2, "max": 5, "rewardDays": 30, "proUntil": proUntil, "proSource": source]))
    }

    private func notice(_ state: CreditsRestoreState, _ snapshot: CreditsSnapshot, spanish: Bool = false) -> CreditsRestoreNotice? {
        CreditsRestoreNotice.make(state, pro: CreditsProStatus.make(snapshot, now: now), proPurchasable: snapshot.proPurchasable,
                                  now: now, spanish: spanish, timeZone: utc)
    }

    func testNothingToRestoreForAnAccountThatIsNotProGivesANextStep() throws {
        let account = CreditsSnapshot(access: freeAccess, proPurchasable: true, signedIn: true)
        let en = try XCTUnwrap(notice(.done(.nothingToRestore), account))
        XCTAssertEqual(en.kind, .nothingToRestore)
        XCTAssertEqual(en.text, "No Bobby Pro purchase on this Apple Account.")
        XCTAssertNil(en.action, "the result is not a place to sell")
        XCTAssertEqual(en.more, .init(title: "Used another Apple Account?", text: "Use that Apple Account on this iPhone; retry."),
                       "the next step is one tap under the result")
        let es = try XCTUnwrap(notice(.done(.nothingToRestore), account, spanish: true))
        XCTAssertEqual(es.text, "Sin compra de Bobby Pro en esta cuenta Apple.")
        XCTAssertEqual(es.more?.title, "¿Usaste otra cuenta Apple?")
        XCTAssertEqual(es.more?.text, "Usa esa cuenta Apple en este iPhone; reintenta.")
    }

    func testAnAccountThatIsProForAnyReasonIsToldItStillIsNeverThatItHasNothing() throws {
        let invited = CreditsSnapshot(access: proAccess, referral: try referral(proUntil: "2026-11-12T12:00:00Z", source: "referral"),
                                      proPurchasable: true, signedIn: true)
        let fromBobby = CreditsSnapshot(access: proAccess, referral: try referral(proUntil: "2026-11-12T12:00:00Z", source: "admin"), signedIn: true)
        let card = CreditsSnapshot(access: proAccess, subscription: BobbySubscription(provider: "stripe", status: "active", currentPeriodEnd: nil),
                                   proPurchasable: true, signedIn: true)
        let apple = CreditsSnapshot(access: proAccess, subscription: BobbySubscription(provider: "apple", status: "active", currentPeriodEnd: "2026-10-27T12:00:00Z"),
                                    proPurchasable: true, signedIn: true)
        let unknownReason = CreditsSnapshot(access: proAccess, proPurchasable: true, signedIn: true)
        for account in [invited, fromBobby, card, apple, unknownReason] {
            let en = try XCTUnwrap(notice(.done(.nothingToRestore), account))
            XCTAssertEqual(en.kind, .alreadyPro)
            XCTAssertEqual(en.text, "Bobby Pro remains active. No additional App Store purchase found.")
            XCTAssertNil(en.action)
            XCTAssertNil(en.more)
            XCTAssertEqual(notice(.done(.nothingToRestore), account, spanish: true)?.text, "Bobby Pro sigue activo. Sin otra compra de App Store.")
        }
        // Where the plan comes from is on the Bobby Pro row, not repeated in the result.
        XCTAssertEqual(CreditsBalance.make(invited, now: now, spanish: false, timeZone: utc).line(.pro)?.face, "Gifted until Nov 12")
    }

    func testEveryEndingHasItsLineAndItsNextStep() throws {
        let account = CreditsSnapshot(access: freeAccess, proPurchasable: true, signedIn: true)
        let restored = try XCTUnwrap(notice(.done(.subscribed), account))
        XCTAssertEqual(restored.kind, .restored)
        XCTAssertEqual(restored.text, "Restored. Bobby Pro is active.")
        XCTAssertNil(restored.action)
        XCTAssertEqual(notice(.done(.subscribed), account, spanish: true)?.text, "Restaurado. Bobby Pro está activo.")

        let pending = try XCTUnwrap(notice(.done(.pending), account))
        XCTAssertEqual(pending.kind, .pending)
        XCTAssertEqual(pending.text, "Awaiting App Store confirmation.")
        XCTAssertNil(pending.action)

        let failed = try XCTUnwrap(notice(.done(.failed("Bobby couldn’t confirm your subscription right now. Tap Restore Purchases in a moment.")), account))
        XCTAssertEqual(failed.kind, .failed)
        XCTAssertEqual(failed.text, "Bobby couldn’t confirm your subscription right now. Tap Restore Purchases in a moment.")
        XCTAssertEqual(failed.action, .tryAgain)

        for state in [CreditsRestoreState.signedOut, .done(.needsSignIn)] {
            let signIn = try XCTUnwrap(notice(state, CreditsSnapshot(access: nil, signedIn: false)))
            XCTAssertEqual(signIn.kind, .needsSignIn)
            XCTAssertEqual(signIn.text, "Sign in to restore.")
            XCTAssertEqual(signIn.action, .signIn, "the line comes with the button, before any Apple sheet")
        }
        XCTAssertEqual(notice(.signedOut, CreditsSnapshot(access: nil), spanish: true)?.text, "Inicia sesión para restaurar.")

        let cancelled = try XCTUnwrap(notice(.done(.cancelled), account), "a cancelled restore is an ending too")
        XCTAssertEqual(cancelled.kind, .cancelled)
        XCTAssertEqual(cancelled.text, "Restore cancelled.")
        XCTAssertEqual(notice(.done(.cancelled), account, spanish: true)?.text, "Restauración cancelada.")

        XCTAssertNil(notice(.idle, account))
        XCTAssertNil(notice(.running, account))
    }

    func testEveryResultIsOneShortLineInSixLanguages() throws {
        let fixed = ["Sign in to restore.", "Restored. Bobby Pro is active.", "Awaiting App Store confirmation.", "Restore cancelled.",
                     "Bobby Pro remains active. No additional App Store purchase found.", "No Bobby Pro purchase on this Apple Account.",
                     "Used another Apple Account?", "Use that Apple Account on this iPhone; retry.", "Accept the risk notice first."]
        for key in fixed {
            let row = try XCTUnwrap(NativeTranslations18.credits[key], key)
            XCTAssertEqual(Set(row.keys), ["fr", "pt", "it", "de"], key)
            for (language, text) in row { XCTAssertLessThanOrEqual(text.count, 70, "\(language): \(text)") }
        }
    }

    func testBeforeTheRiskNoticeTheScreenSaysWhatComesFirst() {
        XCTAssertEqual(CreditsRestoreNotice.beforeRiskNotice(spanish: false), "Accept the risk notice first.")
        XCTAssertEqual(CreditsRestoreNotice.beforeRiskNotice(spanish: true), "Acepta primero el aviso de riesgo.")
    }
}
