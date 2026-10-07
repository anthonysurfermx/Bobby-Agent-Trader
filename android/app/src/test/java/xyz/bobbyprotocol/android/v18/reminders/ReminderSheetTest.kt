package xyz.bobbyprotocol.android.v18.reminders

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import xyz.bobbyprotocol.android.v18.SavedThesis
import xyz.bobbyprotocol.android.v18.ThesisRevision
import xyz.bobbyprotocol.android.v18.notify.LocalNotifier
import java.util.UUID

/**
 * The reminders screen (1.8), as a pure mapping: which theses it lists, in which order and what is
 * open when it appears. The cases of ios/Bobby/Tests/ReminderSheetTests.swift.
 */
class ReminderSheetTest {
    private val t0 = 1_800_000_000_000L
    private val day = 86_400_000L

    private fun thesis(symbol: String, why: String = "Why I am looking at this"): SavedThesis = SavedThesis(
        id = UUID.randomUUID().toString(), symbol = symbol, name = "$symbol Inc", isEquity = true, status = SavedThesis.Status.ACTIVE, horizon = null,
        hypothesis = why, worry = "", changeMind = "", createdAtMillis = t0, updatedAtMillis = t0, lastReviewedAtMillis = null,
        sourceRequestId = null, revisions = listOf(ThesisRevision(UUID.randomUUID().toString(), t0, ThesisRevision.Kind.CREATED)),
    )

    @Test fun eachThesisShowsItsOwnReminderOrNone() {
        val nvda = thesis("NVDA", "Margins should recover")
        val btc = thesis("BTC")
        val spy = thesis("SPY")
        val fire = t0 + 7 * day
        val model = RemindersModel.make(
            theses = listOf(nvda, btc, spy),
            pending = listOf(PendingReminder(btc.id, "BTC", fire), PendingReminder(UUID.randomUUID().toString(), "ETH", fire)),
            scheduling = setOf(spy.id), permission = LocalNotifier.Permission.ALLOWED,
        )
        assertEquals("the book's order; a reminder without a thesis is not a row", listOf("NVDA", "BTC", "SPY"), model.rows.map { it.symbol })
        assertEquals(listOf(null, fire, null), model.rows.map { it.fireAtMillis })
        assertEquals(listOf(false, false, true), model.rows.map { it.busy })
        assertEquals("the person's own words", "Margins should recover", model.rows[0].why)
        assertEquals("NVDA Inc", model.rows[0].name)
        assertNull(model.focusId)
        assertNull("three theses and no focus: nothing is opened for the person", model.initiallyOpen)
        assertFalse(model.showsBriefingRow)
        assertTrue(model.riskAccepted)
    }

    @Test fun theFocusedThesisComesFirstWithItsChoicesOpen() {
        val nvda = thesis("NVDA")
        val btc = thesis("BTC")
        val spy = thesis("SPY")
        val model = RemindersModel.make(theses = listOf(nvda, btc, spy), pending = emptyList(), focus = spy.id.uppercase(), permission = LocalNotifier.Permission.NOT_DETERMINED)
        assertEquals(listOf("SPY", "NVDA", "BTC"), model.rows.map { it.symbol })
        assertEquals(spy.id, model.focusId)
        assertEquals(spy.id, model.initiallyOpen)
        // A focus that already has a reminder shows the reminder, not the choices.
        val set = RemindersModel.make(theses = listOf(nvda, btc), pending = listOf(PendingReminder(btc.id, "BTC", t0)), focus = btc.id, permission = LocalNotifier.Permission.ALLOWED)
        assertEquals(listOf("BTC", "NVDA"), set.rows.map { it.symbol })
        assertNull(set.initiallyOpen)
        // A focus that is not one of the active theses changes nothing.
        val gone = RemindersModel.make(theses = listOf(nvda, btc), pending = emptyList(), focus = UUID.randomUUID().toString(), permission = LocalNotifier.Permission.ALLOWED)
        assertEquals(listOf("NVDA", "BTC"), gone.rows.map { it.symbol })
        assertNull(gone.focusId)
        assertNull(gone.initiallyOpen)
    }

    @Test fun aSingleThesisWithoutAReminderOpensItsChoices() {
        val nvda = thesis("NVDA")
        assertEquals(nvda.id, RemindersModel.make(theses = listOf(nvda), pending = emptyList(), permission = LocalNotifier.Permission.ALLOWED).initiallyOpen)
        val set = RemindersModel.make(theses = listOf(nvda), pending = listOf(PendingReminder(nvda.id, "NVDA", t0)), permission = LocalNotifier.Permission.ALLOWED)
        assertNull(set.initiallyOpen)
        val empty = RemindersModel.make(theses = emptyList(), pending = emptyList(), permission = LocalNotifier.Permission.DENIED, showsBriefingRow = true, riskAccepted = false)
        assertTrue(empty.rows.isEmpty())
        assertNull(empty.initiallyOpen)
        assertEquals(LocalNotifier.Permission.DENIED, empty.permission)
        assertTrue(empty.showsBriefingRow)
        assertFalse(empty.riskAccepted)
    }

    @Test fun changeNeverLeavesTheReminderInPlaceOutOfReach() {
        val nvda = thesis("NVDA")
        val btc = thesis("BTC")
        val fire = t0 + 7 * day
        val model = RemindersModel.make(theses = listOf(nvda, btc), pending = listOf(PendingReminder(nvda.id, "NVDA", fire)), permission = LocalNotifier.Permission.ALLOWED)
        val set = model.rows[0]
        val unset = model.rows[1]
        // At rest: the date, which changes it, or "Set reminder".
        assertEquals(RemindersModel.Row.Step.PENDING, set.step(null, null))
        assertEquals(RemindersModel.Row.Step.SET, unset.step(null, null))
        // "Change" opens the other days. The reminder in place keeps a way back (to itself and to Remove).
        val changing = set.step(set.id, null)
        assertEquals(RemindersModel.Row.Step.CHOOSING, changing)
        assertTrue("after Change there is a way back to Remove", set.offersWayBack(changing))
        // Going back is the row at rest again.
        assertEquals(RemindersModel.Row.Step.PENDING, set.step(null, null))
        assertFalse(set.offersWayBack(RemindersModel.Row.Step.PENDING))
        // A thesis without a reminder has nothing to go back to.
        val choosing = unset.step(unset.id, null)
        assertEquals(RemindersModel.Row.Step.CHOOSING, choosing)
        assertFalse(unset.offersWayBack(choosing))
        // The day picker has its own Cancel, which returns to the choices (and their way back).
        assertEquals(RemindersModel.Row.Step.PICKING, set.step(set.id, set.id))
        assertFalse(set.offersWayBack(RemindersModel.Row.Step.PICKING))
        // Another row's step never changes this one.
        assertEquals(RemindersModel.Row.Step.PENDING, set.step(unset.id, unset.id))
        // While the phone is asking nothing else is offered.
        val busy = RemindersModel.make(theses = listOf(nvda), pending = listOf(PendingReminder(nvda.id, "NVDA", fire)), scheduling = setOf(nvda.id), permission = LocalNotifier.Permission.ALLOWED).rows[0]
        assertEquals(RemindersModel.Row.Step.BUSY, busy.step(nvda.id, nvda.id))
    }
}
