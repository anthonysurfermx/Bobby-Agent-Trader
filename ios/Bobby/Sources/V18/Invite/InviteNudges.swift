// Invitations on the glass (1.8). One line, in two moments:
//   nobody signed in, an invitation waiting   "A friend invited you to Bobby" → Accept → Sign in
//                                             with Apple → the claim → the invite sheet says what happened
//   an account, an answer nobody has read     "The invitation you received was (not) accepted" → the
//                                             invite sheet with the reason in words
// With an account the claim simply happens (InviteLinkCenter); the glass only reports its answer.
import Foundation

@MainActor
enum InviteNudges {
    static let key = "invite"
    static let resultPrefix = "invite.result."

    static func register(_ center: NudgeCenter) {
        // The Núcleo is starting: the centre exists from here on, so an invitation kept from an
        // earlier run is tried again and a sign-in is seen even before the glass first asks.
        InviteLinkCenter.shared.wake()
        center.register(source())
    }

    /// The centre is read when the glass asks, never when the source is built (suites pass their own).
    static func source(invites: @escaping @MainActor () -> InviteLinkCenter = { .shared }) -> NudgeSource {
        NudgeSource(key: key, priority: NudgePriority.invite,
                    candidate: { moment in
                        let center = invites()
                        return nudge(signedIn: moment.signedIn, waiting: center.waiting, answer: center.unreadAnswer)
                    },
                    act: { nudge, session in
                        if nudge.id.hasPrefix(resultPrefix) {
                            // The sheet shows the answer in words and forgets it when it closes.
                            session.present(.invite)
                        } else {
                            await accept(invites(), session: session)
                        }
                    })
    }

    /// The id carries the code and the moment the invitation arrived (or was answered): another
    /// friend's invitation is a new nudge, and so is the same link opened again by the person.
    static func nudge(signedIn: Bool, waiting: InvitePending?, answer: InviteAnswer?) -> NucleoNudge? {
        if signedIn {
            guard let answer else { return nil }
            let accepted = answer.notice == .accepted
            return NucleoNudge(id: "\(resultPrefix)\(answer.code.lowercased()).\(stamp(answer.at))",
                               text: accepted
                                   ? L.t("The invitation you received was accepted", "La invitación que recibiste fue aceptada")
                                   : L.t("The invitation you received was not accepted", "La invitación que recibiste no fue aceptada"),
                               cta: accepted ? L.t("See details", "Ver detalles") : L.t("See why", "Ver por qué"))
        }
        guard let waiting else { return nil }
        return NucleoNudge(id: "invite.\(waiting.code.lowercased()).\(stamp(waiting.at))",
                           text: L.t("A friend invited you to Bobby", "Un amigo te invitó a Bobby"),
                           cta: L.t("Accept", "Aceptar"))
    }

    /// Seconds in base 36 (lowercase letters and digits): short, and inside the id's alphabet.
    static func stamp(_ date: Date) -> String {
        let seconds = date.timeIntervalSince1970
        guard seconds.isFinite else { return "0" }
        return String(Int64(min(max(seconds, 0), 99_999_999_999)), radix: 36)
    }

    /// Accept: sign in, then claim.
    static func accept(_ invites: InviteLinkCenter, session: NucleoSession) async {
        await finish(signIn: await session.signIn(), invites: invites) { session.present(.invite) }
    }

    /// What follows the sign-in's answer. Signed in: the claim, and the invite sheet says in words
    /// what happened. Anything else (Apple's sheet closed, sign-in failed or could not start): the
    /// invite sheet opens with the saved invitation, its own way to sign in and "Remove", because
    /// the tap has already retired the line on the glass and nothing else would mention the
    /// invitation again until its link is opened once more.
    static func finish(signIn status: String, invites: InviteLinkCenter, present: () -> Void) async {
        if status == "signedIn" {
            await invites.acceptPending()
            if invites.notice == nil { return }
        }
        present()
    }
}
