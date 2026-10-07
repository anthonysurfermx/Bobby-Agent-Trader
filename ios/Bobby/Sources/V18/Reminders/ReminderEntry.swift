// Reminders (1.8): the ways into the screen. A reminder the person set must stay something they can
// see, change and remove (it is stored on this phone: thesis id, symbol and date), so the screen
// needs a door that is always there, not only the one-time offer on the glass:
//   - the profile: a "Reminders" row (AccountSheet) calls `session.openReminders()`;
//   - a thesis screen (list, review): its reminder button calls `session.openReminders(thesisId:)`.
// Both rows live in files other tracks own; this is the one call they make.
import Foundation

extension NucleoSession {
    /// Opens the Reminders screen. With a sheet up (the profile, a thesis screen) that sheet hands
    /// over; with nothing up it presents at once. A thesis id puts that thesis first with its
    /// choices open; without one the screen opens on no thesis in particular (an older focus is
    /// never inherited).
    func openReminders(thesisId: String? = nil) {
        V18Focus.thesisId = thesisId
        switchSheet(to: .reminders)
    }
}
