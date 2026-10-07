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
    enum Kind: Equatable { case restored, nothingToRestore, alreadyPro, needsSignIn, pending, cancelled, failed }
    enum Action: Equatable {
        /// Sign in with Apple, then the restore runs.
        case signIn
        case tryAgain
    }
    /// A next step that stays folded under the result ("Used another Apple Account?").
    struct More: Equatable {
        let title: String
        let text: String
    }

    let kind: Kind
    let text: String
    let action: Action?
    var more: More? = nil

    /// The line shown while the risk notice is not accepted (the store starts only after it, R11).
    static func beforeRiskNotice(spanish: Bool? = nil) -> String {
        L.t("Accept the risk notice first.", "Acepta primero el aviso de riesgo.", spanish: spanish)
    }

    /// What to show under the row; nil while idle or running. Every ending has a line, a cancelled one too.
    static func make(_ state: CreditsRestoreState, pro: CreditsProStatus, proPurchasable: Bool, now: Date = .now,
                     spanish: Bool? = nil, timeZone: TimeZone = .current) -> CreditsRestoreNotice? {
        switch state {
        case .idle, .running:
            return nil
        case .signedOut, .done(.needsSignIn):
            return CreditsRestoreNotice(kind: .needsSignIn,
                                        text: L.t("Sign in to restore.", "Inicia sesión para restaurar.", spanish: spanish),
                                        action: .signIn)
        case .done(.subscribed):
            return CreditsRestoreNotice(kind: .restored,
                                        text: L.t("Restored. Bobby Pro is active.", "Restaurado. Bobby Pro está activo.", spanish: spanish),
                                        action: nil)
        case .done(.pending):
            return CreditsRestoreNotice(kind: .pending,
                                        text: L.t("Awaiting App Store confirmation.", "Pendiente de confirmación de App Store.", spanish: spanish),
                                        action: nil)
        case .done(.cancelled):
            return CreditsRestoreNotice(kind: .cancelled,
                                        text: L.t("Restore cancelled.", "Restauración cancelada.", spanish: spanish), action: nil)
        case let .done(.failed(message)):
            // BobbyStore's own sentence (already in the person's language), with a way to ask again.
            return CreditsRestoreNotice(kind: .failed, text: message, action: .tryAgain)
        case .done(.nothingToRestore):
            // The App Store had nothing for this Apple Account. An account that is on Bobby Pro by a
            // gift or a card plan is told it still is (its source is on the Bobby Pro row above).
            if pro.isPro {
                return CreditsRestoreNotice(kind: .alreadyPro,
                                            text: L.t("Bobby Pro remains active. No additional App Store purchase found.",
                                                      "Bobby Pro sigue activo. Sin otra compra de App Store.", spanish: spanish),
                                            action: nil)
            }
            return CreditsRestoreNotice(kind: .nothingToRestore,
                                        text: L.t("No Bobby Pro purchase on this Apple Account.",
                                                  "Sin compra de Bobby Pro en esta cuenta Apple.", spanish: spanish),
                                        action: nil,
                                        more: More(title: L.t("Used another Apple Account?", "¿Usaste otra cuenta Apple?", spanish: spanish),
                                                   text: L.t("Use that Apple Account on this iPhone; retry.",
                                                             "Usa esa cuenta Apple en este iPhone; reintenta.", spanish: spanish)))
        }
    }
}
