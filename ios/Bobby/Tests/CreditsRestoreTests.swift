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
        XCTAssertEqual(en.text, "No Bobby Pro purchase was found on this Apple Account. If you paid with a different Apple Account, sign in to it on this iPhone and try again.")
        XCTAssertEqual(en.action, .seePro)
        let es = try XCTUnwrap(notice(.done(.nothingToRestore), account, spanish: true))
        XCTAssertEqual(es.text, "No se encontró una compra de Bobby Pro en esta cuenta de Apple. Si pagaste con otra cuenta de Apple, inicia sesión con ella en este iPhone e inténtalo de nuevo.")

        let closed = CreditsSnapshot(access: freeAccess, proPurchasable: false, signedIn: true)
        XCTAssertNil(notice(.done(.nothingToRestore), closed)?.action, "no Bobby Pro offer where it cannot be had")
    }

    func testAnAccountThatIsProByGiftIsToldSoInsteadOfNoSubscription() throws {
        let invited = CreditsSnapshot(access: proAccess, referral: try referral(proUntil: "2026-11-12T12:00:00Z", source: "referral"),
                                      proPurchasable: true, signedIn: true)
        let en = try XCTUnwrap(notice(.done(.nothingToRestore), invited))
        XCTAssertEqual(en.kind, .alreadyPro)
        XCTAssertEqual(en.text, "Your account already has Bobby Pro until Nov 12, from an invitation. There is no App Store purchase to restore.")
        XCTAssertNil(en.action)
        let es = try XCTUnwrap(notice(.done(.nothingToRestore), invited, spanish: true))
        XCTAssertTrue(es.text.hasPrefix("Tu cuenta ya tiene Bobby Pro hasta el 12 nov"), es.text)
        XCTAssertTrue(es.text.hasSuffix(", por una invitación. No hay una compra de la App Store que restaurar."), es.text)

        let fromBobby = CreditsSnapshot(access: proAccess, referral: try referral(proUntil: "2026-11-12T12:00:00Z", source: "admin"), signedIn: true)
        XCTAssertEqual(notice(.done(.nothingToRestore), fromBobby)?.text,
                       "Your account already has Bobby Pro until Nov 12, as a gift from Bobby. There is no App Store purchase to restore.")
        XCTAssertTrue(notice(.done(.nothingToRestore), fromBobby, spanish: true)?.text.contains("como regalo de Bobby") == true)
    }

    func testAnAccountThatIsProByCardIsToldSo() throws {
        let card = CreditsSnapshot(access: proAccess, subscription: BobbySubscription(provider: "stripe", status: "active", currentPeriodEnd: nil),
                                   proPurchasable: true, signedIn: true)
        let en = try XCTUnwrap(notice(.done(.nothingToRestore), card))
        XCTAssertEqual(en.kind, .alreadyPro)
        XCTAssertEqual(en.text, "Your account already has Bobby Pro, paid by card on the web. There is no App Store purchase to restore.")
        XCTAssertNil(en.action)
        XCTAssertEqual(notice(.done(.nothingToRestore), card, spanish: true)?.text,
                       "Tu cuenta ya tiene Bobby Pro, pagado con tarjeta en la web. No hay una compra de la App Store que restaurar.")
    }

    func testAnAccountThatIsAlreadyProForAnotherReasonIsNotOfferedBobbyPro() throws {
        let apple = CreditsSnapshot(access: proAccess, subscription: BobbySubscription(provider: "apple", status: "active", currentPeriodEnd: "2026-10-27T12:00:00Z"),
                                    proPurchasable: true, signedIn: true)
        let en = try XCTUnwrap(notice(.done(.nothingToRestore), apple))
        XCTAssertEqual(en.kind, .alreadyPro)
        XCTAssertEqual(en.text, "Your account already has Bobby Pro. There is no other App Store purchase to restore.")
        XCTAssertNil(en.action)
        let unknownReason = CreditsSnapshot(access: proAccess, proPurchasable: true, signedIn: true)
        XCTAssertEqual(notice(.done(.nothingToRestore), unknownReason, spanish: true)?.text,
                       "Tu cuenta ya tiene Bobby Pro. No hay otra compra de la App Store que restaurar.")
    }

    func testEveryOtherOutcomeHasItsSentenceAndItsNextStep() throws {
        let account = CreditsSnapshot(access: freeAccess, proPurchasable: true, signedIn: true)
        let restored = try XCTUnwrap(notice(.done(.subscribed), account))
        XCTAssertEqual(restored.kind, .restored)
        XCTAssertEqual(restored.text, "Restored. Bobby Pro is active on your account.")
        XCTAssertNil(restored.action)
        XCTAssertEqual(notice(.done(.subscribed), account, spanish: true)?.text, "Restaurado. Bobby Pro está activo en tu cuenta.")

        let pending = try XCTUnwrap(notice(.done(.pending), account))
        XCTAssertEqual(pending.kind, .pending)
        XCTAssertEqual(pending.text, "Waiting for approval. Bobby Pro starts as soon as the App Store confirms it.")
        XCTAssertNil(pending.action)

        let failed = try XCTUnwrap(notice(.done(.failed("Bobby couldn’t confirm your subscription right now. Tap Restore Purchases in a moment.")), account))
        XCTAssertEqual(failed.kind, .failed)
        XCTAssertEqual(failed.text, "Bobby couldn’t confirm your subscription right now. Tap Restore Purchases in a moment.")
        XCTAssertEqual(failed.action, .tryAgain)

        for state in [CreditsRestoreState.signedOut, .done(.needsSignIn)] {
            let signIn = try XCTUnwrap(notice(state, CreditsSnapshot(access: nil, signedIn: false)))
            XCTAssertEqual(signIn.kind, .needsSignIn)
            XCTAssertEqual(signIn.text, "Sign in with Apple first: Bobby Pro belongs to your Bobby account. Bobby then checks this Apple Account for a purchase.")
            XCTAssertEqual(signIn.action, .signIn, "the explanation comes with the button, before any Apple sheet")
        }
        XCTAssertEqual(notice(.signedOut, CreditsSnapshot(access: nil), spanish: true)?.text,
                       "Primero inicia sesión con Apple: Bobby Pro queda en tu cuenta de Bobby. Después Bobby revisa si esta cuenta de Apple tiene una compra.")

        XCTAssertNil(notice(.idle, account))
        XCTAssertNil(notice(.running, account))
        XCTAssertNil(notice(.done(.cancelled), account), "a cancelled Apple sheet says nothing")
    }

    func testBeforeTheRiskNoticeTheRowSaysWhyAndThatRestoreWorksAfterwards() throws {
        XCTAssertEqual(CreditsRestoreNotice.beforeRiskNotice(spanish: false), "Accept the risk notice first; then you can restore here.")
        XCTAssertEqual(CreditsRestoreNotice.beforeRiskNotice(spanish: true), "Primero acepta el aviso de riesgo; después podrás restaurar aquí.")
        let row = try XCTUnwrap(NativeTranslations18.credits["Accept the risk notice first; then you can restore here."])
        XCTAssertEqual(Set(row.keys), ["fr", "pt", "it", "de"])
    }
}
