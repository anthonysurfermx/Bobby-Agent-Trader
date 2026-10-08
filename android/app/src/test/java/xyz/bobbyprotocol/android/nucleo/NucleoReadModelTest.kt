package xyz.bobbyprotocol.android.nucleo

import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import xyz.bobbyprotocol.android.v18.ReadSummary

class NucleoReadModelTest {
    @Test fun `an incomplete provider reply is never rendered as Wait`() {
        assertFalse(NucleoReadModel.validDebate(JSONObject("""{"agents":{"alpha":"case","red":"risk","verdict":"wait"}}""")))
        assertFalse(NucleoReadModel.validDebate(JSONObject("""{"error":"timeout","agents":{"alpha":"case","red":"risk","cio":"call","verdict":"wait"}}""")))
        assertFalse(NucleoReadModel.validDebate(JSONObject("""{"agents":{"alpha":"case","red":"risk","cio":"call","verdict":"buy"}}""")))
        assertTrue(NucleoReadModel.validDebate(JSONObject("""{"agents":{"alpha":"case","red":"risk","cio":"call","verdict":"wait"}}""")))
    }

    @Test fun `chart accepts only numeric complete rows and orders evidence by timestamp`() {
        val rows = NucleoReadModel.candles(JSONObject("""{"candles":[
            {"ts":20,"open":2,"high":3,"low":1,"close":2},
            {"ts":10,"open":"1","high":2,"low":0.5,"close":1.5},
            {"ts":30,"open":true,"high":3,"low":1,"close":2},
            {"ts":40,"open":1,"high":2,"low":0.5}
        ]}"""))
        assertEquals(2, rows.length())
        assertEquals(10, rows.getJSONObject(0).getLong("t"))
        assertEquals(20, rows.getJSONObject(1).getLong("t"))
        assertEquals(0.0, rows.getJSONObject(0).getDouble("v"), 0.0)
    }

    @Test fun `missing conviction and prices stay null rather than invented values`() {
        val raw = JSONObject("""{"agents":{"alpha":"case","red":"risk","cio":"call","verdict":"wait"},"technicals":{"trend":"alcista"},"provenance":{"provider":"OKX"}}""")
        val read = NucleoReadModel.read("read-id", "BTC?", JSONObject("""{"symbol":"BTC","name":"Bitcoin","isEquity":false}"""), JSONObject(), JSONArray(), raw, "es", "es-MX", System.currentTimeMillis(), "maximo")
        assertTrue(read.isNull("pulse"))
        assertTrue(read.getJSONObject("technicals").isNull("price"))
        assertEquals("up", read.getJSONObject("technicals").getString("trend"))
        assertEquals("none", read.getJSONObject("agents").getString("direction"))
        assertEquals("maximo", read.getString("level"))
        assertFalse(read.getBoolean("fixture"))
    }

    // ---- The next question (iOS ARCHITECTURE.md §3.5; ios/Bobby/Tests/NextQuestionTests.swift) ----

    private val offered = "What would have to change in NVDA for this read to change?"
    private val nvda = """{"symbol":"NVDA","name":"NVIDIA","isEquity":true}"""

    private fun debate(synthesis: JSONObject?, inAgents: Boolean = true, access: JSONObject? = null): JSONObject {
        val agents = JSONObject().put("alpha", "Alpha says").put("red", "Red says").put("cio", "CIO says").put("verdict", "wait").put("direction", "none")
        val body = JSONObject().put("symbol", "NVDA").put("technicals", JSONObject().put("price", 120.5)).put("provenance", JSONObject().put("provider", "Yahoo Finance")).put("agents", agents)
        if (synthesis != null) { if (inAgents) agents.put("synthesis", synthesis) else body.put("synthesis", synthesis) }
        if (access != null) body.put("access", access)
        return body
    }

    private fun read(debate: JSONObject, offersOneTap: (JSONObject?) -> Boolean = { true }): JSONObject =
        NucleoReadModel.read("read-id", "Should I look at NVIDIA now?", JSONObject(nvda), JSONObject(), JSONArray(), debate, "en", "en-US", 0L, "rapido", offersOneTap)

    private fun lines(followUp: Any? = null): JSONObject = JSONObject().put("headline", "Mixed evidence.").put("why", "w").put("risk", "r").put("watch", "x").put("watchLevel", 0)
        .also { if (followUp != null) it.put("followUp", followUp) }

    /** Everything but the two clock fields, as text: what the page receives. */
    private fun shape(read: JSONObject): String = JSONObject(read.toString()).apply { remove("receivedAt"); remove("elapsedMs") }.toString()

    @Test fun `the next question travels as written and a reply without it is what it was`() {
        for (inAgents in listOf(true, false)) {
            val plain = read(debate(lines(), inAgents))
            val synthesis = plain.getJSONObject("synthesis")
            assertEquals("no new key for a server that sent none", setOf("headline", "why", "risk", "watch", "watchLevel"), synthesis.keys().asSequence().toSet())
            assertFalse(plain.has("oneTap"))

            val asked = read(debate(lines("  $offered\n"), inAgents)).getJSONObject("synthesis")
            assertEquals("trimmed, otherwise as the desk wrote it", offered, asked.getString("followUp"))
            assertEquals(setOf("headline", "why", "risk", "watch", "watchLevel", "followUp"), asked.keys().asSequence().toSet())
            assertEquals("the lines beside it are untouched", "Mixed evidence.", asked.getString("headline"))
        }
        // The whole read, key for key: a rule that always says yes and no rule at all are the same reply.
        assertEquals(shape(read(debate(lines()))), shape(NucleoReadModel.read("read-id", "Should I look at NVIDIA now?", JSONObject(nvda), JSONObject(), JSONArray(), debate(lines()), "en", "en-US", 0L)))
        // No synthesis, no question: the key has nowhere to ride, and nothing is added.
        val quick = read(debate(null))
        assertFalse(quick.has("synthesis"))
        assertFalse(quick.has("oneTap"))
    }

    @Test fun `a question native cannot carry is dropped whole and the read is served`() {
        val tooLong = "Why " + "x".repeat(NextQuestion.LIMIT - 4) + "?"
        for (bad in listOf<Any>(tooLong, "", "   ", 7, JSONObject.NULL, JSONArray().put("a"), JSONObject().put("text", offered))) {
            for (inAgents in listOf(true, false)) {
                val result = read(debate(lines(bad), inAgents))
                assertEquals("ok", result.getString("status"))
                val synthesis = result.getJSONObject("synthesis")
                assertFalse("$bad: only the chip is lost", synthesis.has("followUp"))
                assertEquals("Mixed evidence.", synthesis.getString("headline"))
                // Nor does it ride inside the copy of the agents the page also receives.
                assertFalse("$bad", result.getJSONObject("agents").optJSONObject("synthesis")?.has("followUp") ?: false)
            }
        }
    }

    @Test fun `the horizon the question named reaches a feature as one of five values and never as words`() {
        // The desk says it in the reply (`sufficiency.horizon`); the read model carries the block to the
        // page untouched, and what a feature is handed about the read (`ReadSummary`) has the horizon only.
        fun summary(sufficiency: JSONObject?): ReadSummary? {
            val reply = debate(lines())
            if (sufficiency != null) reply.put("sufficiency", sufficiency)
            return ReadSummary.from(read(reply))
        }
        assertNotNull(summary(null))
        assertNull("a reply from a server that says none", summary(null)?.horizon)
        for (horizon in listOf("intraday", "week", "month", "long", "unspecified")) {
            assertEquals(horizon, summary(JSONObject().put("level", "ok").put("horizon", horizon))?.horizon)
        }
        assertNull(summary(JSONObject().put("horizon", "for the next two quarters"))?.horizon)
        assertNull(summary(JSONObject().put("horizon", JSONObject.NULL))?.horizon)
        assertNull(summary(JSONObject().put("horizon", 30))?.horizon)
        assertFalse("never the question", summary(JSONObject().put("horizon", "long")).toString().contains("Should I look"))
    }

    @Test fun `at the wall the read says so and hands back no question that asks by itself`() {
        val receipts = ArrayList<JSONObject?>()
        val receipt = JSONObject().put("tier", "free").put("used", 20).put("limit", 20).put("remaining", 0).put("paywall", true)
        val walled = read(debate(lines(offered), access = receipt)) { access -> receipts.add(access); false }
        assertEquals("asked once per read, with that read's own receipt", 1, receipts.size)
        assertEquals(0, receipts.single()?.getInt("remaining"))
        assertEquals(false, walled.get("oneTap"))
        val synthesis = walled.getJSONObject("synthesis")
        assertEquals("the read is whole", "Mixed evidence.", synthesis.getString("headline"))
        assertFalse("the page gets no question: what was not offered cannot be picked", synthesis.has("followUp"))
        assertNull(NextQuestion.offered(walled))
        assertEquals("the receipt still reaches the page", 0, walled.getJSONObject("access").getInt("remaining"))

        // A reply without a receipt asks the rule with nothing; a read without a synthesis still says no.
        receipts.clear()
        val bare = read(debate(null)) { access -> receipts.add(access); false }
        assertEquals(listOf<JSONObject?>(null), receipts)
        assertEquals(false, bare.get("oneTap"))
        assertFalse(bare.has("synthesis"))

        // A yes leaves the reply as it always was.
        val open = read(debate(lines(offered), access = receipt)) { true }
        assertFalse(open.has("oneTap"))
        assertEquals(offered, NextQuestion.offered(open))
    }
}
