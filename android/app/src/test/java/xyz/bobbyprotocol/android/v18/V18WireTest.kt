package xyz.bobbyprotocol.android.v18

import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** The additive wire of 1.8, the same as on iOS (V18WireTests.swift). */
class V18WireTest {
    private val t0 = 1_791_374_400_000L // 2026-10-07T12:00:00Z

    @Test fun theThesisContextCarriesExactlyTheKeysTheServerAccepts() {
        val book = ThesisBook(MemoryKeyValueStore())
        val bare = book.create(ThesisDraft("NVDA", "NVIDIA", true, null, "Demand keeps growing"), null, t0 + 999)
        val minimal = ThesisContext(bare).toJson()
        assertEquals(setOf("hypothesis", "savedAt"), minimal.keys().asSequence().toSet())
        assertEquals("2026-10-07T12:00:00Z", minimal.getString("savedAt"))

        val full = book.create(ThesisDraft("BTC", "Bitcoin", false, ThesisHorizon.YEARS, "Scarce", "Sharp drops", "A broken cycle", price = 64_250.0), null, t0)
        val reviewed = book.recordReview(full.id, null, 61_900.0, null, "wait", emptyList(), emptyList(), emptyList(), t0 + 86_400_000L)
        val json = ThesisContext(reviewed).toJson()
        assertEquals(setOf("hypothesis", "savedAt", "worry", "changeMind", "horizon", "priceAtSave", "lastReviewedAt"), json.keys().asSequence().toSet())
        assertEquals("years", json.getString("horizon"))
        assertEquals("the price it was written at, never a later review's", 64_250.0, json.getDouble("priceAtSave"), 0.0)
        assertEquals("2026-10-08T12:00:00Z", json.getString("lastReviewedAt"))
        assertFalse("no symbol and no id travel inside the thesis", json.has("symbol") || json.has("id"))
    }

    @Test fun aReceiptWithoutItsCountIsNoReceipt() {
        fun receipt(json: String) = MemoryReceipts.fromJson(JSONObject(json))
        assertEquals(MemoryReceipt(true, 3, 5, 4.2), receipt("""{"recorded":true,"asks":3,"lastAskedDaysAgo":5,"changeSinceLastAskPct":4.2}"""))
        assertEquals(MemoryReceipt(true, 1), receipt("""{"recorded":true,"asks":1,"lastAskedDaysAgo":null,"changeSinceLastAskPct":null}"""))
        assertEquals("a paused memory is not read: zero is what the server says", MemoryReceipt(false, 0), receipt("""{"recorded":false,"asks":0}"""))
        assertNull("an unknown count is never turned into a zero", receipt("""{"recorded":true}"""))
        assertNull(receipt("""{"recorded":true,"asks":null}"""))
        assertNull("a recorded ask counts itself", receipt("""{"recorded":true,"asks":0}"""))
        assertNull(receipt("""{"recorded":"yes","asks":2}"""))
        assertNull(receipt("""{"asks":2}"""))
        assertNull(MemoryReceipts.fromJson(null))
        assertNull(receipt("""{"recorded":true,"asks":2,"changeSinceLastAskPct":123456}""")?.changeSinceLastAskPct)
        assertNull(receipt("""{"recorded":true,"asks":2,"lastAskedDaysAgo":-1}""")?.lastAskedDaysAgo)
        assertNull(MemoryReceipts.count(true))
        assertNull(MemoryReceipts.count("3"))
        assertEquals(3, MemoryReceipts.count(3.0))
    }

    @Test fun reviewNotesKeepShortListsAndOnlyTheCodesTheAppCanWord() {
        val long = "x".repeat(400)
        val json = JSONObject()
            .put("supports", JSONArray(listOf(" a ", "", "b", "c", "d", "e")))
            .put("challenges", JSONArray(listOf(long, 7, "ok")))
            .put("notChecked", JSONArray(listOf("news", "rumours", "macro", "earnings")))
        val notes = ThesisReviewNotes.fromJson(json)
        assertEquals(listOf("a", "b", "c", "d"), notes?.supports)
        assertEquals(listOf(ThesisReviewNotes.TEXT_LIMIT, 2), notes?.challenges?.map { it.length })
        assertEquals(emptyList<String>(), notes?.unknowns)
        assertEquals(listOf("news", "macro", "earnings"), notes?.notChecked)
        assertFalse(notes?.isEmpty ?: true)
        assertTrue(ThesisReviewNotes.fromJson(JSONObject())?.isEmpty ?: false)
        assertNull("a reply without a review is a plain read", ThesisReviewNotes.fromJson(null))
    }

    @Test fun aHandOffIsConsumedOnce() {
        val focus = V18Focus()
        focus.thesisId = "abc"
        focus.draftRequestId = "req"
        assertEquals("abc", focus.takeThesisId())
        assertNull(focus.takeThesisId())
        assertEquals("req", focus.takeDraftRequestId())
        focus.thesisId = "again"
        focus.clear()
        assertNull(focus.takeThesisId())
    }
}
