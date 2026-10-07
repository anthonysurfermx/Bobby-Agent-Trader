package xyz.bobbyprotocol.android.v18.theses

import xyz.bobbyprotocol.android.v18.NucleoNudge
import xyz.bobbyprotocol.android.v18.NudgeMoment
import xyz.bobbyprotocol.android.v18.NudgePriority
import xyz.bobbyprotocol.android.v18.NudgeSource
import xyz.bobbyprotocol.android.v18.SavedThesis
import xyz.bobbyprotocol.android.v18.ThesisBook
import xyz.bobbyprotocol.android.v18.V18Host
import xyz.bobbyprotocol.android.v18.V18Routes
import java.time.Instant
import java.time.ZoneOffset
import java.time.temporal.IsoFields
import java.util.Locale

// Theses on the glass (1.8), a port of ios/Bobby/Sources/V18/Theses/ThesisNudges.swift. Two things
// Bobby may say, one at a time (`theses`, priority 70):
//   a. right after the person saved a read on an asset they have no thesis on: write down why;
//   b. a thesis that has gone a week or more without a review: come back to it.
// The candidate reads only the thesis book and the last read of this launch (never the network),
// and the tap opens the editor or the review; nothing is written or sent by the nudge itself.
object ThesisNudges {
    const val KEY = "theses"
    /** A thesis is due when this many days passed since its last review (or since it was written). */
    const val DUE_AFTER_DAYS = 7
    /** "Right after": the saved read is still the one the person has in mind. */
    const val WRITE_WINDOW_MILLIS = 6 * 3_600_000L

    /** What a served nudge opens (nudge id → read or thesis id), so a tap finds it even if the moment moved on. */
    private val targets = HashMap<String, String>()

    fun register(host: V18Host) {
        host.nudges.register(source(host, V18HostWords(host)))
    }

    /**
     * The source as the app registers it. The centre's own rule decides whether the write offer may
     * still speak: a source gives ONE candidate, so an offer the centre would refuse (tapped
     * already, or resting) must not stand in front of the next thing to say.
     */
    fun source(host: V18Host, words: HostWords): NudgeSource = NudgeSource(
        KEY, NudgePriority.THESES,
        { moment -> candidate(moment, host.theses, host.owner, words) { id, at -> host.nudges.eligible(id, at) } },
        { nudge -> act(nudge, host) })

    // Candidates

    /** Writing comes first, while its offer can still be shown; otherwise the most overdue thesis speaks. */
    fun candidate(moment: NudgeMoment, book: ThesisBook, owner: String?, words: HostWords,
                  eligible: (String, Long) -> Boolean = { _, _ -> true }): NucleoNudge? {
        val offer = write(moment, book, owner, words)
        if (offer != null && eligible(offer.id, moment.nowMillis)) return offer
        return due(moment, book, owner, words)
    }

    /** a. The person saved a read and has no active thesis on that asset. */
    fun write(moment: NudgeMoment, book: ThesisBook, owner: String?, words: HostWords): NucleoNudge? {
        val read = moment.lastRead ?: return null
        if (!read.saved || moment.nowMillis < read.atMillis || moment.nowMillis - read.atMillis >= WRITE_WINDOW_MILLIS) return null
        if (book.activeThesis(read.symbol, owner) != null) return null
        val id = writeId(read.requestId) ?: return null
        remember(id, read.requestId)
        return NucleoNudge(id, words.text("Write down why, for next time", "Escribe el porqué, para la próxima"),
                           words.text("Write my thesis", "Escribir mi tesis"))
    }

    /** b. The most overdue active thesis, a week or more since its review (or since it was written). */
    fun due(moment: NudgeMoment, book: ThesisBook, owner: String?, words: HostWords): NucleoNudge? {
        var most: SavedThesis? = null
        var mostDays = 0
        for (thesis in book.active(owner)) {
            val days = daysWaiting(thesis, moment.nowMillis)
            if (days < DUE_AFTER_DAYS) continue
            // The longest wait speaks; a tie goes to the same thesis every time.
            val current = most
            if (current != null && (mostDays > days || (mostDays == days && current.id < thesis.id))) continue
            most = thesis
            mostDays = days
        }
        val overdue = most ?: return null
        val id = dueId(overdue.id, moment.nowMillis) ?: return null
        remember(id, overdue.id)
        return NucleoNudge(id, dueText(overdue.symbol, mostDays, overdue.lastReviewedAtMillis != null, words), words.text("Review", "Revisar"))
    }

    /** Whole days since the last review, or since the thesis was written when it never had one. */
    fun daysWaiting(thesis: SavedThesis, now: Long): Int = ThesisCopy.days(thesis.lastReviewedAtMillis ?: thesis.createdAtMillis, now)

    /** The line names the asset when it fits the glass, and drops the name before it would be cut. */
    fun dueText(symbol: String, days: Int, reviewed: Boolean, words: HostWords): String {
        val named = if (reviewed) words.text("Your {0} thesis: {1} days since review", "Tu tesis de {0}: {1} días sin revisar", symbol, days)
                    else words.text("Your {0} thesis: {1} days, not reviewed yet", "Tu tesis de {0}: {1} días, aún sin revisar", symbol, days)
        if (named.codePointCount(0, named.length) <= NucleoNudge.TEXT_LIMIT) return named
        return if (reviewed) words.text("Your thesis: {0} days since review", "Tu tesis: {0} días sin revisar", days)
               else words.text("Your thesis: {0} days, not reviewed yet", "Tu tesis: {0} días, aún sin revisar", days)
    }

    // Ids

    /** `theses.write.<first 8 of the request id>`: one offer per saved read. */
    fun writeId(requestId: String): String? {
        val head = slug(requestId)
        return if (head.isEmpty()) null else "theses.write.$head"
    }

    /** `theses.due.<first 8 of the thesis id>.<ISO week>`: retired when tapped, back another week. */
    fun dueId(thesisId: String, now: Long): String? {
        val head = slug(thesisId)
        return if (head.isEmpty()) null else "theses.due.$head." + isoWeek(now)
    }

    /** "2026w41": the ISO-8601 week, in UTC so the id does not move with the phone's time zone. */
    fun isoWeek(millis: Long): String {
        val date = Instant.ofEpochMilli(millis).atZone(ZoneOffset.UTC)
        return String.format(Locale.ROOT, "%04dw%02d", date.get(IsoFields.WEEK_BASED_YEAR), date.get(IsoFields.WEEK_OF_WEEK_BASED_YEAR))
    }

    private fun slug(id: String): String = id.lowercase(Locale.ROOT).filter { it in 'a'..'z' || it in '0'..'9' }.take(8)

    private fun remember(nudgeId: String, target: String) {
        if (targets.size > 64) targets.clear()
        targets[nudgeId] = target
    }

    fun target(nudgeId: String): String? = targets[nudgeId]

    // The tap

    fun act(nudge: NucleoNudge, host: V18Host) {
        host.focus.clear()
        val target = targets[nudge.id]
        if (target == null) {
            host.present(V18Routes.THESES)
            return
        }
        if (nudge.id.startsWith("theses.write.")) {
            // The read left memory (or belongs to an account that is gone): the list explains how to start.
            if (host.readSummary(target) == null) {
                host.present(V18Routes.THESES)
                return
            }
            host.focus.draftRequestId = target
            host.present(V18Routes.THESIS_EDITOR)
        } else {
            host.focus.thesisId = target
            host.present(V18Routes.THESIS_REVIEW)
        }
    }
}
