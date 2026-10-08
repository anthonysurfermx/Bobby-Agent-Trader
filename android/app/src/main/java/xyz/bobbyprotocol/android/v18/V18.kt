package xyz.bobbyprotocol.android.v18

import xyz.bobbyprotocol.android.v18.credits.CreditsNudges
import xyz.bobbyprotocol.android.v18.harness.HarnessNudges
import xyz.bobbyprotocol.android.v18.invite.InviteNudges
import xyz.bobbyprotocol.android.v18.memory.MemoryNudges
import xyz.bobbyprotocol.android.v18.reminders.ReminderNudges
import xyz.bobbyprotocol.android.v18.theses.ThesisEvents
import xyz.bobbyprotocol.android.v18.theses.ThesisNudges

// Bobby 1.8: the companion that picks the thread back up. Each feature lives in its own package
// and speaks on the glass through one nudge source (NudgeCenter.kt):
//   credits/    what you have, how to get more, restore explained
//   memory/     consent in the conversation, a receipt when something is kept
//   theses/     write your thesis, come back to it, see what changed (three active at most)
//   reminders/  a review reminder you asked for, scheduled on this phone
//   invite/     a link that opens the app and credits the friend who sent it
//   harness/    from the first question: what you asked about, a follow-up the next day, and
//               what Bobby learns from whether you open it (all of it on this phone)
object V18 {
    /**
     * Called once per activity, after its screen is attached to the host. Each feature registers
     * its nudge source(s) and its listeners on `host` from its own file; the centre orders them by
     * `NudgePriority`, so the order here is only the order they read in.
     */
    fun registerNudges(host: V18Host) {
        HarnessNudges.register(host)
        InviteNudges.register(host)
        ThesisNudges.register(host)
        MemoryNudges.register(host)
        ReminderNudges.register(host)
        CreditsNudges.register(host)
        connect(host)
    }

    /**
     * What one feature tells another. Each package stays ignorant of the others; what crosses
     * between them is written here, once per activity, where iOS posts a notification.
     */
    private fun connect(host: V18Host) {
        // A thesis just written, or a review just decided (keep, edit or archive): the moment the
        // reminder offer may speak on the glass (`V18.thesisSaved` and `V18.thesisReviewed` on iOS).
        val theses = ThesisEvents.of(host)
        theses.onSaved { thesisId -> ReminderNudges.thesisSaved(host, thesisId) }
        theses.onReviewed { thesisId, _ -> ReminderNudges.thesisReviewed(host, thesisId) }
    }
}

/** The native sheets. */
object V18Routes {
    const val CREDITS = "credits"
    const val THESES = "theses"
    const val THESIS_EDITOR = "thesisEditor"
    const val THESIS_REVIEW = "thesisReview"
    const val MEMORY_CONSENT = "memoryConsent"
    const val REMINDERS = "reminders"
    const val FOLLOW_UP = "followUp"

    /** What the page may open through `openNative`: exactly what 1.1.4 could. A 1.8 screen is never added here. */
    val PAGE_OPENABLE: Set<String> = setOf("squad", "locker", "isla", "account", "riskNotice", "levels", "paywall", "memory",
                                           "briefings", "briefingSettings", "invite", "coupon", "reportContent")

    /** The 1.8 screens: they open from a nudge tap, the profile or a notification tap, never from a page call. */
    val NATIVE_ONLY: Set<String> = setOf(CREDITS, THESES, THESIS_EDITOR, THESIS_REVIEW, MEMORY_CONSENT, REMINDERS, FOLLOW_UP)

    /** Every sheet native code may present. */
    val ALL: Set<String> = PAGE_OPENABLE + NATIVE_ONLY
}
