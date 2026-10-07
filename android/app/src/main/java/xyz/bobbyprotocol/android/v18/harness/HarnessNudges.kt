package xyz.bobbyprotocol.android.v18.harness

import kotlinx.coroutines.launch
import kotlinx.coroutines.yield
import xyz.bobbyprotocol.android.v18.NucleoNudge
import xyz.bobbyprotocol.android.v18.NudgeMoment
import xyz.bobbyprotocol.android.v18.NudgePriority
import xyz.bobbyprotocol.android.v18.NudgeSource
import xyz.bobbyprotocol.android.v18.V18Host
import java.time.Instant
import java.time.ZoneOffset
import java.util.Locale

// The harness on the glass (1.8). Two lines, both written here and drawn by the page:
//  - the offer, once a read has been delivered and the person has not decided yet:
//    "Shall I keep you posted on NVDA?" · "Yes, tell me". The tap is the person's own request, so
//    it is the one place (with the Follow-ups switch) where the system may be asked for permission;
//  - the move, when they come back (on their own or through a follow-up) to an asset they asked
//    about at least a day ago: "NVDA +2.3% since you asked" · "What changed?". The number costs
//    nothing; the button asks Bobby, which is a read like any other.
// A port of ios/Bobby/Sources/V18/Harness/HarnessNudges.swift.
object HarnessNudges {
    const val OFFER_KEY = "harness.offer"
    const val MOVE_KEY = "harness.move"
    const val OFFER_ID = "harness.offer.v1"
    /** How long after a read the offer makes sense. */
    const val FRESH_WINDOW_MS = 30 * 60_000L

    /** Once per activity: the centre starts keeping itself true, and its two lines join the glass. */
    fun register(host: V18Host) {
        val harness = Harness.center(host)
        host.nudges.register(moveSource(host, harness))
        host.nudges.register(offerSource(host, harness))
    }

    // The offer

    fun offerSource(host: V18Host, harness: HarnessCenter): NudgeSource = NudgeSource(
        OFFER_KEY, NudgePriority.FOLLOW_UP_OFFER,
        { moment -> offer(moment, harness.mode, harness.copy) },
        { _ -> if (harness.accept() != HarnessCenter.Outcome.CONSENT_REQUIRED) host.haptic("success") },
    )

    fun offer(moment: NudgeMoment, mode: HarnessMode, copy: HarnessCopy): NucleoNudge? {
        val read = moment.lastRead ?: return null
        if (mode != HarnessMode.UNDECIDED || moment.nowMillis - read.atMillis > FRESH_WINDOW_MS) return null
        return NucleoNudge(OFFER_ID, copy.offerLine(read.symbol), copy.offerButton)
    }

    // The move

    fun moveSource(host: V18Host, harness: HarnessCenter): NudgeSource = NudgeSource(
        MOVE_KEY, NudgePriority.FOLLOW_UP,
        { _ ->
            // The app speaks another language since the lock-screen lines were written: they are
            // written again, after this turn (a candidate only ever reads).
            if (harness.wordsAreStale) {
                host.scope.launch {
                    yield()
                    harness.rewriteWords()
                }
            }
            harness.moveOnGlass()?.let { nudge(it, harness.copy) }
        },
        { nudge ->
            val move = harness.moveOnGlass()
            if (move != null && moveId(move) == nudge.id) {
                harness.notePicked(move.symbol)
                host.startRead(move.symbol, move.name, move.isEquity, harness.copy.changedQuestion(move.symbol))
            }
        },
    )

    fun nudge(move: HarnessMove, copy: HarnessCopy): NucleoNudge =
        NucleoNudge(moveId(move), copy.moveLine(move.symbol, move.pct, move.days), copy.moveButton)

    /** `harness.move.<symbol>.<day asked>`: one line per asset per question, however often it is drawn. */
    fun moveId(move: HarnessMove): String {
        val symbol = move.symbol.lowercase(Locale.ROOT).filter { it in 'a'..'z' || it in '0'..'9' || it == '.' || it == '-' }
        return "harness.move.$symbol.${dayStamp(move.askedAt)}"
    }

    private fun dayStamp(at: Long): String {
        val day = Instant.ofEpochMilli(at).atZone(ZoneOffset.UTC).toLocalDate()
        return String.format(Locale.ROOT, "%04d%02d%02d", day.year, day.monthValue, day.dayOfMonth)
    }
}
