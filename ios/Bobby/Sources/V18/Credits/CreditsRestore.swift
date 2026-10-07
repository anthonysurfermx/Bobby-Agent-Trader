// Restore Purchases, in words (1.8). The row says what it is for before it is tapped, and its
// outcome is a sentence with a next step under the row, never a system alert. The store call
// itself is unchanged (`BobbyProRestore.run`); this file only decides what the person reads
// (`CreditsFlow` decides when the store may be asked).
// It also knows what the account already has, so a person who is on Bobby Pro by a gift or by a
// card plan is not told "no active subscription".
import Foundation

/// Where the restore row is.
enum CreditsRestoreState: Equatable {
    case idle
    case running
    /// Nobody is signed in: explain first, the Apple sheet comes after the person asks for it.
    case signedOut
    case done(BobbyStore.Outcome)
}

struct CreditsRestoreNotice: Equatable {
    enum Kind: Equatable { case restored, nothingToRestore, alreadyPro, needsSignIn, pending, failed }
    enum Action: Equatable {
        /// Sign in with Apple, then the restore runs.
        case signIn
        case tryAgain
        /// The Bobby Pro sheet.
        case seePro
    }

    let kind: Kind
    let text: String
    let action: Action?

    /// The line under the row while the risk notice is not accepted. It is there from the start, not
    /// after a tap: the store starts only after the notice (R11), and this says restore works then.
    static func beforeRiskNotice(spanish: Bool? = nil) -> String {
        L.t("Accept the risk notice first; then you can restore here.",
            "Primero acepta el aviso de riesgo; después podrás restaurar aquí.", spanish: spanish)
    }

    /// What to show under the row; nil while idle or running, and after a cancelled Apple sheet.
    static func make(_ state: CreditsRestoreState, pro: CreditsProStatus, proPurchasable: Bool, now: Date = .now,
                     spanish: Bool? = nil, timeZone: TimeZone = .current) -> CreditsRestoreNotice? {
        switch state {
        case .idle, .running:
            return nil
        case .signedOut, .done(.needsSignIn):
            return CreditsRestoreNotice(kind: .needsSignIn,
                                        text: L.t("Sign in with Apple first: Bobby Pro belongs to your Bobby account. Bobby then checks this Apple Account for a purchase.",
                                                  "Primero inicia sesión con Apple: Bobby Pro queda en tu cuenta de Bobby. Después Bobby revisa si esta cuenta de Apple tiene una compra.", spanish: spanish),
                                        action: .signIn)
        case .done(.subscribed):
            return CreditsRestoreNotice(kind: .restored,
                                        text: L.t("Restored. Bobby Pro is active on your account.", "Restaurado. Bobby Pro está activo en tu cuenta.", spanish: spanish),
                                        action: nil)
        case .done(.pending):
            return CreditsRestoreNotice(kind: .pending,
                                        text: L.t("Waiting for approval. Bobby Pro starts as soon as the App Store confirms it.",
                                                  "Esperando aprobación. Bobby Pro empieza en cuanto la App Store lo confirme.", spanish: spanish),
                                        action: nil)
        case .done(.cancelled):
            return nil
        case let .done(.failed(message)):
            // BobbyStore's own sentence (already in the person's language), with a way to ask again.
            return CreditsRestoreNotice(kind: .failed, text: message, action: .tryAgain)
        case .done(.nothingToRestore):
            return nothingToRestore(pro: pro, proPurchasable: proPurchasable, now: now, spanish: spanish, timeZone: timeZone)
        }
    }

    /// The App Store had nothing for this Apple Account. Say what the Bobby account has anyway.
    private static func nothingToRestore(pro: CreditsProStatus, proPurchasable: Bool, now: Date, spanish: Bool?,
                                         timeZone: TimeZone) -> CreditsRestoreNotice {
        let copy = CreditsBalance.Copy(now: now, spanish: spanish, timeZone: timeZone)
        switch pro.plan {
        case .gifted:
            if let until = pro.giftUntil, let source = pro.giftSource {
                let day = copy.short(until)
                let text = source == .invitations
                    ? L.t("Your account already has Bobby Pro until \(day), from an invitation. There is no App Store purchase to restore.",
                          "Tu cuenta ya tiene Bobby Pro hasta el \(day), por una invitación. No hay una compra de la App Store que restaurar.", spanish: spanish)
                    : L.t("Your account already has Bobby Pro until \(day), as a gift from Bobby. There is no App Store purchase to restore.",
                          "Tu cuenta ya tiene Bobby Pro hasta el \(day), como regalo de Bobby. No hay una compra de la App Store que restaurar.", spanish: spanish)
                return CreditsRestoreNotice(kind: .alreadyPro, text: text, action: nil)
            }
            return alreadyPro(spanish: spanish)
        case .card:
            return CreditsRestoreNotice(kind: .alreadyPro,
                                        text: L.t("Your account already has Bobby Pro, paid by card on the web. There is no App Store purchase to restore.",
                                                  "Tu cuenta ya tiene Bobby Pro, pagado con tarjeta en la web. No hay una compra de la App Store que restaurar.", spanish: spanish),
                                        action: nil)
        case .appStore, .active:
            return alreadyPro(spanish: spanish)
        case .none:
            return CreditsRestoreNotice(kind: .nothingToRestore,
                                        text: L.t("No Bobby Pro purchase was found on this Apple Account. If you paid with a different Apple Account, sign in to it on this iPhone and try again.",
                                                  "No se encontró una compra de Bobby Pro en esta cuenta de Apple. Si pagaste con otra cuenta de Apple, inicia sesión con ella en este iPhone e inténtalo de nuevo.", spanish: spanish),
                                        action: proPurchasable ? .seePro : nil)
        }
    }

    private static func alreadyPro(spanish: Bool?) -> CreditsRestoreNotice {
        CreditsRestoreNotice(kind: .alreadyPro,
                             text: L.t("Your account already has Bobby Pro. There is no other App Store purchase to restore.",
                                       "Tu cuenta ya tiene Bobby Pro. No hay otra compra de la App Store que restaurar.", spanish: spanish),
                             action: nil)
    }
}
