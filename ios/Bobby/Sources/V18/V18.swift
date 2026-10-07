// Bobby 1.8: the companion that picks the thread back up. Each feature lives in its own folder
// and speaks on the glass through one nudge source (Nucleo/NucleoNudge.swift):
//   Credits/    what you have, how to get more, restore explained
//   Memory/     consent in the conversation, a receipt when something is kept
//   Theses/     write your thesis, come back to it, see what changed (three active at most)
//   Reminders/  a review reminder you asked for, scheduled on this phone
//   Invite/     a link that opens the app and credits the friend who sent it
import Foundation

@MainActor
enum V18 {
    /// Called once when the Núcleo starts (never in the unit-test host, where suites register what they test).
    static func registerNudges(center: NudgeCenter = .shared) {
        InviteNudges.register(center)
        MemoryNudges.register(center)
        ThesisNudges.register(center)
        ReminderNudges.register(center)
        CreditsNudges.register(center)
    }
}

/// Priorities of the nudge sources, in one place so two features never fight over the glass.
enum NudgePriority {
    /// An invitation that is waiting for an account: it expires, so it speaks first.
    static let invite = 90
    /// The thesis a person just saved or came back to.
    static let theses = 70
    /// The offer to remember, once, after a useful read.
    static let memory = 60
    /// A reminder offer after a thesis exists.
    static let reminders = 50
    /// Credits running low.
    static let credits = 40
}
