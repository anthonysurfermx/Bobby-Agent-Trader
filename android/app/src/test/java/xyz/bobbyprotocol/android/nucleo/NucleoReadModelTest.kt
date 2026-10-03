package xyz.bobbyprotocol.android.nucleo

import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test

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
}
