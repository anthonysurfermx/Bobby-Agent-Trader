// Bobby 1.8: the companion that picks the thread back up. Each feature lives in its own folder
// and speaks on the glass through one nudge source (Nucleo/NucleoNudge.swift):
//   Credits/    what you have, how to get more, restore explained
//   Memory/     consent in the conversation, a receipt when something is kept
//   Theses/     write your thesis, come back to it, see what changed (three active at most)
//   Reminders/  a review reminder you asked for, scheduled on this phone
//   Invite/     a link that opens the app and credits the friend who sent it
//   Harness/    from the first question: what you asked about, a follow-up the next day, and
//               what Bobby learns from whether you open it (all of it on this phone)
import Foundation

@MainActor
enum V18 {
    /// Called once when the Núcleo starts (never in the unit-test host, where suites register what they test).
    static func registerNudges(center: NudgeCenter = .shared) {
        InviteNudges.register(center)
        HarnessNudges.register(center)
        MemoryNudges.register(center)
        ThesisNudges.register(center)
        ReminderNudges.register(center)
        CreditsNudges.register(center)
    }
}

/// Priorities of the nudge sources, in one place so two features never fight over the glass.
enum NudgePriority {
    /// Coming back to an asset they asked about (a tapped follow-up lands here): it is why they opened the app.
    static let followUp = 95
    /// An invitation that is waiting for an account: it expires, so it speaks first.
    static let invite = 90
    /// The offer to come back tomorrow, after a read, until the person decides.
    static let followUpOffer = 80
    /// The thesis a person just saved or came back to.
    static let theses = 70
    /// The offer to remember, once, after a useful read.
    static let memory = 60
    /// A reminder offer after a thesis exists.
    static let reminders = 50
    /// Credits running low.
    static let credits = 40
}
