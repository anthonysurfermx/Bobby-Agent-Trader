package xyz.bobbyprotocol.android.v18.reminders

import xyz.bobbyprotocol.android.v18.SavedThesis
import xyz.bobbyprotocol.android.v18.V18Host
import xyz.bobbyprotocol.android.v18.V18Routes
import xyz.bobbyprotocol.android.v18.notify.LocalNotice
import java.util.Locale

// Thesis reminders (1.8): the tapped notification, a port of
// ios/Bobby/Sources/V18/Reminders/ReminderIntent.swift. A tap can arrive at a cold start, before the
// page is ready or while the mic or a read is busy. On Android the host keeps it
// (`V18Host.onNotificationTap`): in memory only, consumed once, newest wins, dropped when the reader
// changes or when it was planned for another reader, and honoured only when the glass is free. What
// is left here is what a reminder's own payload means and where it leads.

/** What a tapped reminder carries: the one thesis it was set for. */
data class ReminderTap(val thesisId: String)

class ReminderIntent {
    /** The thesis whose review is on screen, as that screen last said (`markOpen`). */
    private var marked: String? = null

    /**
     * The review screen says which thesis it shows, and null when it closes: a reminder for that
     * thesis that comes due now is not shown on top of it.
     */
    fun markOpen(id: String?) {
        marked = thesisId(id)
    }

    /** The thesis under review right now. Never one from a review that is no longer on screen. */
    fun openThesisId(host: V18Host): String? = if (host.sheetRoute == V18Routes.THESIS_REVIEW) marked else null

    /**
     * Opens what a tapped reminder asked for: the review of its thesis, or the list when that thesis
     * is gone or archived (never an empty review). Read against the book of whoever uses the phone
     * now: their account's, or the local one signed out. False when the payload is not a reminder or
     * nothing could open.
     */
    fun open(host: V18Host, payload: Map<String, String>): Boolean {
        val tap = tap(payload) ?: return false
        return when (val destination = destination(tap, host.theses.active(host.owner))) {
            is Destination.Review -> {
                host.focus.thesisId = destination.thesisId
                val opened = host.present(V18Routes.THESIS_REVIEW)
                if (!opened) host.focus.thesisId = null
                opened
            }
            Destination.Theses -> {
                host.focus.thesisId = null
                host.present(V18Routes.THESES)
            }
        }
    }

    /** Where a tap leads. */
    sealed class Destination {
        /** The review of this thesis (the id as the book holds it). */
        data class Review(val thesisId: String) : Destination()

        /** The list: the thesis no longer exists or is archived. */
        data object Theses : Destination()
    }

    companion object {
        private const val SERVICE = "reminders.intent"
        private val UUID_PATTERN = Regex("^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$")

        fun of(host: V18Host): ReminderIntent = host.service(SERVICE) { ReminderIntent() }

        /** A thesis id as the book writes it (a lowercase UUID string), or null. */
        fun thesisId(raw: String?): String? = raw?.takeIf { UUID_PATTERN.matches(it) }?.lowercase(Locale.ROOT)

        /**
         * Reads `{kind: "thesis-review", thesisId: …}`. Anything else (a follow-up, a foreign
         * payload, a malformed id) is not a reminder.
         */
        fun tap(payload: Map<String, String>): ReminderTap? {
            if (payload[LocalNotice.KIND] != ReminderCenter.KIND) return null
            val id = thesisId(payload[ReminderCenter.THESIS_ID]) ?: return null
            return ReminderTap(id)
        }

        /**
         * A reminder that comes due while the app is open is shown, unless that thesis's review is
         * already on screen. Quiet: the person is looking at the app.
         */
        fun presentation(thesisId: String, openThesisId: String?): Boolean = openThesisId == null || !openThesisId.equals(thesisId, ignoreCase = true)

        fun destination(tap: ReminderTap, active: List<SavedThesis>): Destination {
            val thesis = active.firstOrNull { it.id.equals(tap.thesisId, ignoreCase = true) } ?: return Destination.Theses
            return Destination.Review(thesis.id)
        }
    }
}

// The ways into the Reminders screen (ReminderEntry.swift). A reminder the person set must stay
// something they can see, change and remove, so the screen has a door that is always there, not
// only the one-time offer on the glass:
//   - the profile's "Reminders" row opens the route itself;
//   - a thesis screen (the list, the review) calls `ReminderEntry.open(host, thesisId)`.
object ReminderEntry {
    /**
     * Opens the Reminders screen. With a sheet up (a thesis screen) that sheet hands over; with
     * nothing up it presents at once. A thesis id puts that thesis first with its choices open;
     * without one the screen opens on no thesis in particular (an older focus is never inherited).
     */
    fun open(host: V18Host, thesisId: String? = null) {
        host.focus.thesisId = thesisId
        host.switchSheet(V18Routes.REMINDERS)
    }
}
