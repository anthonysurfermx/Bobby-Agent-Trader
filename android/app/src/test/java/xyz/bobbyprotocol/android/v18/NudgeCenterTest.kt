package xyz.bobbyprotocol.android.v18

import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** The etiquette of the one line on the glass, the same as on iOS (NucleoNudgeTests.swift). */
class NudgeCenterTest {
    private val store = MemoryKeyValueStore()
    private var clock = 1_800_000_000_000L
    private val minute = 60_000L
    private val day = 86_400_000L

    private fun center(): NudgeCenter = NudgeCenter(store) { clock }

    private fun source(key: String, priority: Int, id: String?, acted: MutableList<String> = ArrayList()): NudgeSource =
        NudgeSource(key, priority, { if (id == null) null else NucleoNudge(id, "A line", "Open") }, { acted.add(it.id) })

    private fun NudgeCenter.show(): NucleoNudge? = current(moment(signedIn = true))

    @Test fun aNudgeShowsTwiceRestsAWeekComesBackOnceMoreAndIsThenSpent() {
        val c = center()
        c.register(source("theses", NudgePriority.THESES, "theses.write.abc"))
        val id = "theses.write.abc"

        assertEquals(id, c.show()?.id)
        assertEquals(1, c.seen(id))
        assertEquals("a redraw inside the same showing is not a second one", 1, c.seen(id))
        clock += 11 * minute
        assertEquals(2, c.seen(id))
        assertTrue("the showing in progress is never pulled from under the reader", c.eligible(id, clock))
        assertEquals(clock + c.policy.showingGapMillis, c.showingEnds(id))

        clock += c.policy.showingGapMillis + 1
        assertFalse("two showings nobody answered: it rests", c.eligible(id, clock))
        assertNull(c.show())
        clock += 6 * day
        assertNull("still resting on the sixth day", c.show())

        clock += 2 * day
        assertEquals("it may come back for one more round", id, c.show()?.id)
        assertEquals(3, c.seen(id))
        clock += 11 * minute
        assertEquals(4, c.seen(id))
        clock += c.policy.showingGapMillis + 1
        assertFalse("four showings ever", c.eligible(id, clock))
        clock += 30 * day
        assertNull("and it never returns", c.show())
        assertEquals(4, c.showings(id))
    }

    @Test fun aTapRetiresTheNudgeForGoodRunsItsSourceAndQuietsTheGlass() = runTest {
        val acted = ArrayList<String>()
        val c = center()
        c.register(source("credits", NudgePriority.CREDITS, "credits.gift.5", acted))
        c.register(source("memory", NudgePriority.MEMORY, "memory.offer.v1"))

        assertEquals("the higher priority speaks first", "memory.offer.v1", c.show()?.id)
        assertEquals("done", c.act("memory.offer.v1"))
        assertTrue(c.isRetired("memory.offer.v1"))
        assertNull("nothing else speaks right after a tap", c.show())

        clock += c.policy.quietAfterTapMillis + 1
        assertEquals("then the next source has its turn", "credits.gift.5", c.show()?.id)
        assertEquals("done", c.act("credits.gift.5"))
        assertEquals(listOf("credits.gift.5"), acted)

        clock += 400 * day
        assertNull("a tapped nudge is gone for good, long after the unanswered ones were pruned", c.show())
    }

    @Test fun onlyTheNudgeOnTheGlassCanBeTapped() = runTest {
        val acted = ArrayList<String>()
        val c = center()
        c.register(source("invite", NudgePriority.INVITE, "invite.abcd2345", acted))

        assertEquals("gone", c.act("invite.abcd2345"))
        assertEquals("invite.abcd2345", c.show()?.id)
        c.withhold()
        assertEquals("a sheet went up: the tap that arrives late changes nothing", "gone", c.act("invite.abcd2345"))
        assertFalse(c.isRetired("invite.abcd2345"))
        assertTrue(acted.isEmpty())

        assertEquals("invite.abcd2345", c.show()?.id)
        assertTrue(c.isCurrent("INVITE.ABCD2345"))
        assertEquals("done", c.act("INVITE.ABCD2345"))
        assertEquals("gone", c.act("invite.abcd2345"))
        assertEquals(1, acted.size)
    }

    @Test fun thePageCannotMintShowingsOrRetireWhatItWasNeverGiven() = runTest {
        val c = center()
        c.register(source("theses", NudgePriority.THESES, "theses.write.abc"))
        assertEquals(0, c.seen("theses.write.abc"))
        assertEquals(0, c.seen("made.up.by.the.page"))
        assertEquals("gone", c.act("made.up.by.the.page"))
        assertEquals(0, c.showings("theses.write.abc"))
    }

    @Test fun idsAreLowercasedAndAnInvalidOneIsNeverServed() {
        val c = center()
        c.register(source("reminders", NudgePriority.REMINDERS, "Reminders.Offer.7AB0EAA5"))
        assertEquals("reminders.offer.7ab0eaa5", c.show()?.id)

        val bad = center()
        bad.register(source("x", 100, "1-starts-with-a-digit"))
        bad.register(NudgeSource("y", 90, { NucleoNudge("has space", "A line", "Open") }, {}))
        bad.register(NudgeSource("z", 80, { NucleoNudge("no.button", "A line", "") }, {}))
        bad.register(source("ok", 10, "credits.low.2026-w41"))
        assertEquals("the first valid candidate by priority", "credits.low.2026-w41", bad.show()?.id)
        assertEquals(listOf("x", "y", "z", "ok"), bad.sourceKeys)
    }

    @Test fun eachAccountHasItsOwnHistoryAndTheQuietPeriodBelongsToThePhone() = runTest {
        val c = center()
        c.register(source("credits", NudgePriority.CREDITS, "credits.gift.5"))
        c.owner = "account-a"
        assertEquals("credits.gift.5", c.show()?.id)
        assertEquals("done", c.act("credits.gift.5"))

        c.owner = "account-b"
        assertNull("the quiet quarter of an hour is the phone's", c.show())
        clock += c.policy.quietAfterTapMillis + 1
        assertEquals("a decision by one person never silences the offer for another", "credits.gift.5", c.show()?.id)

        c.owner = "account-a"
        assertNull(c.show())

        NudgeCenter.forgetOwner("account-a", store)
        assertEquals("deleting the account removes its history from the phone", "credits.gift.5", c.show()?.id)
    }

    @Test fun historySurvivesARelaunchAndTheMomentDoesNot() = runTest {
        val first = center()
        first.register(source("theses", NudgePriority.THESES, "theses.write.abc"))
        first.noteRead(NudgeRead("r1", "NVDA", "NVIDIA", true, "wait", false, clock))
        first.noteSaved("r1")
        assertTrue(first.lastRead?.saved == true)
        assertEquals(1, first.readsThisLaunch)
        assertEquals("theses.write.abc", first.show()?.id)
        assertEquals("done", first.act("theses.write.abc"))

        val second = center()
        second.register(source("theses", NudgePriority.THESES, "theses.write.abc"))
        assertNull(second.lastRead)
        assertEquals(0, second.readsThisLaunch)
        assertNull("the quiet period was written down", second.show())
        clock += second.policy.quietAfterTapMillis + 1
        assertNull("and so was the tap", second.show())
        assertTrue(second.isRetired("theses.write.abc"))
    }

    @Test fun registeringAgainReplacesASourceAndForgetMomentLeavesNothingToTap() = runTest {
        val c = center()
        c.register(source("memory", NudgePriority.MEMORY, "memory.offer.v1"))
        c.register(source("memory", NudgePriority.MEMORY, "memory.offer.v2"))
        assertEquals(listOf("memory"), c.sourceKeys)
        assertEquals("memory.offer.v2", c.show()?.id)
        c.forgetMoment()
        assertEquals("gone", c.act("memory.offer.v2"))
        c.unregisterAll()
        assertNull(c.show())
    }

    @Test fun theNudgeTravelsAsThreeStrings() {
        val json = NucleoNudge("Theses.Write.ABC", "Why are you looking at NVDA?", "Write my thesis").toJson()
        assertEquals("theses.write.abc", json.getString("id"))
        assertEquals("Why are you looking at NVDA?", json.getString("text"))
        assertEquals("Write my thesis", json.getString("cta"))
        assertEquals(3, json.length())
        assertEquals(46, NucleoNudge.TEXT_LIMIT)
        assertEquals(22, NucleoNudge.CTA_LIMIT)
    }
}
