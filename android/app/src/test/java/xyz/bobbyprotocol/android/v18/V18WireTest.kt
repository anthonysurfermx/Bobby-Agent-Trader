package xyz.bobbyprotocol.android.v18

import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import xyz.bobbyprotocol.android.nucleo.NucleoReadModel

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

    private fun reply(extra: JSONObject = JSONObject()): JSONObject {
        val body = JSONObject()
            .put("symbol", "NVDA")
            .put("technicals", JSONObject().put("price", 120.5).put("rsi14", 55.0))
            .put("provenance", JSONObject().put("provider", "Yahoo Finance").put("asOf", "2026-10-07T12:00:00Z"))
            .put("agents", JSONObject().put("alpha", "Alpha says").put("red", "Red says").put("cio", "CIO says").put("verdict", "wait").put("direction", "none"))
        for (key in extra.keys()) body.put(key, extra.get(key))
        return body
    }

    private fun delivered(debate: JSONObject): JSONObject = NucleoReadModel.read("read-1", "the person's question", JSONObject().put("symbol", "NVDA").put("name", "NVIDIA").put("isEquity", true),
        JSONObject().put("price", 121.0), JSONArray(), debate, "en", "en-US", System.currentTimeMillis())

    @Test fun aReplyWithoutThe18FieldsReadsExactlyAsBefore() {
        val answer = DeskAnswer(reply())
        assertNull(answer.memory)
        assertNull(answer.review)
        assertEquals("wait", answer.verdict)
        assertEquals(120.5, answer.price ?: 0.0, 0.0)
        assertEquals("2026-10-07T12:00:00Z", answer.asOf)
        assertNull("no synthesis was sent: no headline is made up", answer.headline)
        val read = delivered(reply())
        assertFalse("a server that knows nothing of memory adds no key to a read", read.has("memory"))
        assertFalse(read.has("review"))
        assertEquals("wait", ReadSummary.from(read)?.verdict)
    }

    @Test fun theMemoryReceiptRidesADeliveredReadAsFactsAndJunkIsDropped() {
        val read = delivered(reply(JSONObject().put("memory", JSONObject().put("recorded", true).put("asks", 3).put("lastAskedDaysAgo", 5).put("changeSinceLastAskPct", 4.25).put("note", "free text"))))
        val memory = read.getJSONObject("memory")
        assertEquals(setOf("recorded", "asks", "lastAskedDaysAgo", "changeSinceLastAskPct"), memory.keys().asSequence().toSet())
        assertEquals(MemoryReceipt(true, 3, 5, 4.25), MemoryReceipts.fromJson(memory))
        val first = delivered(reply(JSONObject().put("memory", JSONObject().put("recorded", true).put("asks", 1)))).getJSONObject("memory")
        assertTrue("an unknown figure stays unknown, never a zero", first.isNull("lastAskedDaysAgo") && first.isNull("changeSinceLastAskPct"))
        assertEquals(MemoryReceipt(true, 1), MemoryReceipts.fromJson(first))
        for (junk in listOf<Any>(JSONObject().put("asks", 2), "yes", 1, JSONObject().put("recorded", "true"), JSONObject().put("recorded", true),
                                 JSONObject().put("recorded", true).put("asks", 0), JSONObject().put("recorded", true).put("asks", -4),
                                 JSONObject().put("recorded", false).put("asks", "many"))) {
            assertFalse("$junk", delivered(reply(JSONObject().put("memory", junk))).has("memory"))
            assertNull("$junk", DeskAnswer(reply(JSONObject().put("memory", junk))).memory)
        }
        assertEquals(MemoryReceipt(false, 2), DeskAnswer(reply(JSONObject().put("memory", JSONObject().put("recorded", false).put("asks", 2).put("lastAskedDaysAgo", "soon").put("changeSinceLastAskPct", 9.9e9)))).memory)
    }

    @Test fun aReviewedReplyExposesItsListsItsPriceAndTheModelsOwnHeadline() {
        val review = JSONObject().put("supports", JSONArray(listOf("  Price holds above the 50-day average  ", "", 7, "b", "c", "d", "e")))
            .put("challenges", JSONArray(listOf("x".repeat(900)))).put("unknowns", "not a list").put("notChecked", JSONArray(listOf("news", "earnings", "the moon", 3, "filings")))
        val synthesis = JSONObject().put("headline", "The price evidence still leans your way.").put("why", "").put("risk", JSONObject.NULL)
        val answer = DeskAnswer(reply(JSONObject().put("review", review).put("synthesis", synthesis).put("level", "profundo").put("access", JSONObject().put("remaining", 6))))
        assertEquals(listOf("Price holds above the 50-day average", "b", "c", "d"), answer.review?.supports)
        assertEquals(ThesisReviewNotes.TEXT_LIMIT, answer.review?.challenges?.first()?.length)
        assertEquals(emptyList<String>(), answer.review?.unknowns)
        assertEquals(listOf("news", "earnings", "filings"), answer.review?.notChecked)
        assertEquals("The price evidence still leans your way.", answer.headline)
        assertNull("an empty line is not a line", answer.why)
        assertNull(answer.risk)
        assertEquals("profundo", answer.level)
        assertEquals(6, answer.access?.getInt("remaining"))
        assertNull(DeskAnswer(reply(JSONObject().put("review", "nope"))).review)
        assertNull("a price the evidence did not carry is not a zero", DeskAnswer(reply(JSONObject().put("technicals", JSONObject()))).price)
    }

    @Test fun every18ScreenIsNativeOnly() {
        for (route in listOf(V18Routes.CREDITS, V18Routes.THESES, V18Routes.THESIS_EDITOR, V18Routes.THESIS_REVIEW, V18Routes.MEMORY_CONSENT, V18Routes.REMINDERS, V18Routes.FOLLOW_UP)) {
            assertFalse(route, route in V18Routes.PAGE_OPENABLE)
            assertTrue(route, route in V18Routes.NATIVE_ONLY && route in V18Routes.ALL)
        }
        assertEquals("the page opens exactly what 1.1.4 could",
                     setOf("squad", "locker", "isla", "account", "riskNotice", "levels", "paywall", "memory", "briefings", "briefingSettings", "invite", "coupon", "reportContent"),
                     V18Routes.PAGE_OPENABLE)
        assertEquals(7, V18Routes.NATIVE_ONLY.size)
        assertEquals(20, V18Routes.ALL.size)
    }

    @Test fun aReaderTagIsStableAndNeverTheAccountId() {
        assertEquals("local", V18Reader.tag(null))
        val tag = V18Reader.tag("3fa85f64-5717-4562-b3fc-2c963f66afa6")
        assertEquals(tag, V18Reader.tag("3fa85f64-5717-4562-b3fc-2c963f66afa6"))
        assertTrue(Regex("^[0-9a-f]{16}$").matches(tag))
        assertFalse(tag == V18Reader.tag("another-account"))
        assertEquals("the first eight bytes of the SHA-256, as iOS writes it", "2c26b46b68ffc68f", V18Reader.tag("foo"))
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
