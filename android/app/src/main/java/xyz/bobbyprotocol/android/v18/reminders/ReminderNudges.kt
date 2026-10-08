package xyz.bobbyprotocol.android.v18.reminders

import kotlinx.coroutines.launch
import kotlinx.coroutines.yield
import xyz.bobbyprotocol.android.v18.NucleoNudge
import xyz.bobbyprotocol.android.v18.NudgeMoment
import xyz.bobbyprotocol.android.v18.NudgePriority
import xyz.bobbyprotocol.android.v18.NudgeSource
import xyz.bobbyprotocol.android.v18.SavedThesis
import xyz.bobbyprotocol.android.v18.V18Host
import xyz.bobbyprotocol.android.v18.V18Routes
import java.util.Locale

// Reminders on the glass (1.8), a port of ios/Bobby/Sources/V18/Reminders/ReminderNudges.swift: the
// value-first moment. Right after a person writes or reviews a thesis (they have just seen what a
// review gives them) Bobby offers, once, to remind them to come back to it. A quieter second line
// tells an eligible paying account that its Monday briefing is included and still off. The nudge
// only opens a screen: the notification permission is asked later, by the reminder button the
// person taps there, and never from here.
object ReminderNudges {
    const val KEY = "reminders"
    const val BRIEFING_ID = "reminders.briefing.v1"

    /** How long after writing or reviewing a thesis the offer makes sense. */
    const val FRESH_WINDOW_MS = 30 * 60_000L

    private const val RECENT_SERVICE = "reminders.recent"

    /** What the candidates read. The app reads the host's stores; tests replace single pieces. */
    class Sources(
        val owner: () -> String?,
        val activeTheses: (String?) -> List<SavedThesis>,
        val hasReminder: (String) -> Boolean,
        /** What is already held about the weekly briefing (nothing is fetched here). */
        val briefing: () -> BriefingOffer,
    ) {
        companion object {
            fun of(host: V18Host): Sources {
                val center = ReminderCenter.of(host)
                val briefing = BriefingOffers.of(host)
                return Sources({ host.owner }, { owner -> host.theses.active(owner) }, { id -> center.hasReminder(id) }, { briefing.current() })
            }
        }
    }

    /**
     * Theses the app was told were just saved or reviewed (`thesisSaved`, `thesisReviewed`). In
     * memory only: a relaunch falls back to the book's own dates.
     */
    class Recent {
        private val noted = HashMap<String, Long>()

        fun note(thesisId: String, atMillis: Long) {
            if (thesisId.isNotBlank()) noted[thesisId.uppercase(Locale.ROOT)] = atMillis
        }

        fun date(thesisId: String): Long? = noted[thesisId.uppercase(Locale.ROOT)]

        fun clear() {
            noted.clear()
        }
    }

    fun recent(host: V18Host): Recent = host.service(RECENT_SERVICE) { Recent() }

    /** A NEW thesis was saved (the thesis screens call this where iOS posts `V18.thesisSaved`). */
    fun thesisSaved(host: V18Host, thesisId: String) = recent(host).note(thesisId, host.now())

    /** The person decided what to do with a thesis after a review (where iOS posts `V18.thesisReviewed`). */
    fun thesisReviewed(host: V18Host, thesisId: String) = recent(host).note(thesisId, host.now())

    /**
     * Once per screen: reminders keep themselves true from here, a tapped reminder opens its
     * review, and the offer may speak on the glass.
     */
    fun register(host: V18Host) {
        val center = ReminderCenter.of(host)
        val recent = recent(host)
        val briefing = BriefingOffers.of(host)
        val intent = ReminderIntent.of(host)

        // Another reader: what the previous one just wrote is not theirs to be reminded of, and
        // what was known about the previous account's briefing is not theirs either.
        host.onAccountChanged {
            recent.clear()
            briefing.clear()
            readBriefing(host, briefing)
        }
        host.onConsentWithdrawn { briefing.clear() }
        // What the Monday-briefing line reads: the account's settings, after consent only.
        host.onAppActive { if (briefing.stale) readBriefing(host, briefing) }
        readBriefing(host, briefing)

        // Only a reminder with a well-formed thesis id is kept: a malformed tap never replaces one that is waiting.
        host.onNotificationTap(ReminderCenter.KIND, accepts = { payload -> ReminderIntent.tap(payload) != null }) { payload -> intent.open(host, payload) }
        host.onNotificationDue(ReminderCenter.KIND) { payload ->
            // It was delivered (or is about to be): it is no longer pending.
            center.reconcile()
            val tap = ReminderIntent.tap(payload)
            tap == null || ReminderIntent.presentation(tap.thesisId, intent.openThesisId(host))
        }

        host.nudges.register(source(host, Sources.of(host), recent))
    }

    /** A turn later, and only if nothing fresher arrived meanwhile: one read however many triggers asked. */
    private fun readBriefing(host: V18Host, briefing: BriefingOffers) {
        host.scope.launch {
            yield()
            if (briefing.stale && briefing.refresh()) host.sessionChanged()
        }
    }

    fun source(host: V18Host, sources: Sources, recent: Recent): NudgeSource = NudgeSource(
        KEY, NudgePriority.REMINDERS,
        { moment -> candidate(moment, sources, recent, ReminderCopy.of(host)) },
        { nudge -> act(nudge, host, sources) },
    )

    // Candidates

    fun candidate(moment: NudgeMoment, sources: Sources, recent: Recent, copy: ReminderCopy): NucleoNudge? {
        val thesis = freshThesis(moment.nowMillis, sources, recent)
        if (thesis != null) return NucleoNudge(offerId(thesis.id), copy.offerLine, copy.offerButton)
        if (moment.signedIn && sources.briefing().shouldOffer) return NucleoNudge(BRIEFING_ID, copy.briefingLine, copy.briefingButton)
        return null
    }

    /** The active thesis written or reviewed most recently within the window, without a reminder yet. */
    fun freshThesis(nowMillis: Long, sources: Sources, recent: Recent): SavedThesis? {
        fun touched(thesis: SavedThesis): Long =
            listOfNotNull(recent.date(thesis.id), thesis.lastReviewedAtMillis, thesis.createdAtMillis).filter { it <= nowMillis }.maxOrNull() ?: Long.MIN_VALUE
        return sources.activeTheses(sources.owner())
            .filter { touched(it) != Long.MIN_VALUE && nowMillis - touched(it) <= FRESH_WINDOW_MS && !sources.hasReminder(it.id) }
            .maxByOrNull { touched(it) }
    }

    /** `reminders.offer.<first 8 of the thesis id>`: one offer per thesis, ever. */
    fun offerId(thesisId: String): String =
        "reminders.offer." + thesisId.lowercase(Locale.ROOT).filter { it in 'a'..'z' || it in '0'..'9' }.take(8)

    // The tap

    fun act(nudge: NucleoNudge, host: V18Host, sources: Sources) {
        if (nudge.id == BRIEFING_ID) {
            // The person is on their way to change it: what was held is no longer known.
            BriefingOffers.of(host).clear()
            host.present(BriefingOffers.SETTINGS_ROUTE)
            return
        }
        // The thesis the offer was about opens first; when it is gone the screen shows what is left.
        host.focus.thesisId = sources.activeTheses(sources.owner()).firstOrNull { offerId(it.id) == nudge.id }?.id
        if (!host.present(V18Routes.REMINDERS)) host.focus.thesisId = null
    }
}
