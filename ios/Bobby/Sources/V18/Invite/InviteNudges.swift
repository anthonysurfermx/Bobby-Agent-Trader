// Invitations on the glass (1.8). One line, only while an invitation waits and nobody is signed in:
// "A friend invited you to Bobby" → Accept → Sign in with Apple → the claim. With an account the
// claim simply happens (InviteLinkCenter), so there is nothing to say on the glass.
import Foundation

@MainActor
enum InviteNudges {
    static let key = "invite"

    static func register(_ center: NudgeCenter) {
        center.register(source())
    }

    /// The centre is read when the glass asks, never at registration (suites register with their own).
    static func source(invites: @escaping @MainActor () -> InviteLinkCenter = { .shared }) -> NudgeSource {
        NudgeSource(key: key, priority: NudgePriority.invite,
                    candidate: { moment in nudge(signedIn: moment.signedIn, pendingCode: invites().pendingCode) },
                    act: { _, session in await accept(invites(), session: session) })
    }

    /// The id carries the code, so another friend's invitation is a new nudge.
    static func nudge(signedIn: Bool, pendingCode: String?) -> NucleoNudge? {
        guard !signedIn, let code = pendingCode else { return nil }
        return NucleoNudge(id: "invite.\(code.lowercased())",
                           text: L.t("A friend invited you to Bobby", "Un amigo te invitó a Bobby"),
                           cta: L.t("Accept", "Aceptar"))
    }

    /// Accept: sign in, claim, then the invite sheet says in words what happened. A person who
    /// closes Apple's sheet is left alone (the invitation keeps waiting); when sign-in cannot
    /// start, the invite sheet shows the saved invitation and its own way to sign in.
    static func accept(_ invites: InviteLinkCenter, session: NucleoSession) async {
        switch await session.signIn() {
        case "signedIn":
            await invites.acceptPending()
            if invites.notice != nil { session.present(.invite) }
        case "cancelled":
            break
        default:
            session.present(.invite)
        }
    }
}
