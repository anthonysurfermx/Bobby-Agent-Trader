package xyz.bobbyprotocol.android.v18.reminders

import xyz.bobbyprotocol.android.v18.SavedThesis
import xyz.bobbyprotocol.android.v18.notify.LocalNotifier

// Reminders (1.8): what the screen shows, a port of `RemindersModel` in
// ios/Bobby/Sources/V18/Reminders/RemindersSheet.swift. Pure, so tests pin which theses it lists,
// in which order and what is open when it appears; ui/v18/RemindersSheet.kt only draws it.
// The Follow-ups switch and the "Your week" row are not here: on Android the harness track draws
// them in the slot the sheet leaves at the foot of the list.

data class RemindersModel(
    val rows: List<Row>,
    /** The thesis the screen opens on (a nudge or a thesis screen named it), shown first with its choices open. */
    val focusId: String?,
    val permission: LocalNotifier.Permission,
    /** An eligible paying account with the weekly briefing off: one quiet row at the end. */
    val showsBriefingRow: Boolean,
    val riskAccepted: Boolean,
) {
    data class Row(
        val id: String,
        val symbol: String,
        val name: String,
        /** The person's own first line: why they are looking at this. */
        val why: String,
        /** When the pending reminder fires; null when there is none. */
        val fireAtMillis: Long?,
        /** The phone is being asked, or the notice is being written. */
        val busy: Boolean,
    ) {
        /** What the row shows for the step the person is on. */
        enum class Step {
            BUSY,
            /** No reminder: "Set reminder". */
            SET,
            /** A reminder in place: its date, which changes it, and the menu that removes it. */
            PENDING,
            /** The three presets and "Choose date". */
            CHOOSING,
            /** The day and the time. */
            PICKING,
        }

        fun step(openId: String?, pickingId: String?): Step = when {
            busy -> Step.BUSY
            pickingId == id -> Step.PICKING
            openId == id -> Step.CHOOSING
            fireAtMillis == null -> Step.SET
            else -> Step.PENDING
        }

        /**
         * A reminder in place is never left behind by "Change": while the other days are on screen
         * one button goes back to it, and to Remove, without changing anything.
         */
        fun offersWayBack(step: Step): Boolean = fireAtMillis != null && step == Step.CHOOSING
    }

    /**
     * The row whose choices are open when the screen appears: the focused thesis, or the only
     * thesis when it has no reminder yet.
     */
    val initiallyOpen: String?
        get() {
            if (focusId != null && rows.firstOrNull { it.id == focusId }?.fireAtMillis == null) return focusId
            if (rows.size == 1 && rows[0].fireAtMillis == null) return rows[0].id
            return null
        }

    companion object {
        /** The focused thesis first, then the order of the book (most recently touched first). */
        fun make(
            theses: List<SavedThesis>,
            pending: List<PendingReminder>,
            scheduling: Set<String> = emptySet(),
            focus: String? = null,
            permission: LocalNotifier.Permission,
            showsBriefingRow: Boolean = false,
            riskAccepted: Boolean = true,
        ): RemindersModel {
            val focusId = focus?.let { id -> theses.firstOrNull { it.id.equals(id, ignoreCase = true) }?.id }
            val ordered = theses.filter { it.id == focusId } + theses.filter { it.id != focusId }
            val rows = ordered.map { thesis ->
                Row(
                    id = thesis.id, symbol = thesis.symbol, name = thesis.name, why = thesis.hypothesis,
                    fireAtMillis = pending.firstOrNull { it.thesisId == thesis.id }?.fireAtMillis, busy = thesis.id in scheduling,
                )
            }
            return RemindersModel(rows, focusId, permission, showsBriefingRow, riskAccepted)
        }
    }
}
