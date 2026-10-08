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
//    nothing; the button asks Bobby, which is a read. So the button is only there when the phone
//    knows that read is answered (HarnessWall): otherwise the same line carries "Got it", which
//    asks nothing, and Bobby never walks anyone into a sign-in or a paywall.
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
            harness.moveOnGlass()?.let { nudge(it, harness.copy, asks = harness.readsOpen) }
        },
        { nudge ->
            // Decided again at the tap: what was drawn may be older than the last receipt.
            val move = harness.moveOnGlass()
            if (move != null && moveId(move) == nudge.id && harness.readsOpen) {
                harness.notePicked(move.symbol)
                host.startRead(move.symbol, move.name, move.isEquity, harness.copy.changedQuestion(move.symbol))
            }
        },
    )

    /** `asks`: the next read would be answered. Without it the line is the same and its button asks nothing. */
    fun nudge(move: HarnessMove, copy: HarnessCopy, asks: Boolean = true): NucleoNudge =
        NucleoNudge(moveId(move), copy.moveLine(move.symbol, move.pct, move.days), if (asks) copy.moveButton else copy.moveSeen)

    /** `harness.move.<symbol>.<day asked>`: one line per asset per question, however often it is drawn. */
    fun moveId(move: HarnessMove): String = movePrefix(move.symbol) + dayStamp(move.askedAt)

    /** `harness.move.` for every line, `harness.move.<symbol>.` for one asset's. */
    fun movePrefix(symbol: String? = null): String {
        if (symbol == null) return "$MOVE_KEY."
        val safe = symbol.lowercase(Locale.ROOT).filter { it in 'a'..'z' || it in '0'..'9' || it == '.' || it == '-' }
        return "$MOVE_KEY.$safe."
    }

    private fun dayStamp(at: Long): String {
        val day = Instant.ofEpochMilli(at).atZone(ZoneOffset.UTC).toLocalDate()
        return String.format(Locale.ROOT, "%04d%02d%02d", day.year, day.monthValue, day.dayOfMonth)
    }
}
