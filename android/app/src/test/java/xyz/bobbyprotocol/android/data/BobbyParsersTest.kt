package xyz.bobbyprotocol.android.data

import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test

class BobbyParsersTest {
    @Test fun questionLimitCountsUnicodeCodePointsAfterTrimming() {
        assertEquals(1200, BobbyParsers.questionLength("  " + "\uD83D\uDE80".repeat(1200) + " \n"))
        assertEquals(1201, BobbyParsers.questionLength("\uD83D\uDE80".repeat(1201)))
    }

    @Test fun failedOrPartialAnswersNeverBecomeNoTrade() {
        assertFalse(BobbyParsers.validDeskAnswer(JSONObject("""{"regime":"bullish","error":"provider unavailable"}""")))
        assertFalse(BobbyParsers.validDeskAnswer(JSONObject("""{"agents":{"alpha":"A","red":"R","verdict":"wait"}}""")))
        assertTrue(BobbyParsers.validDeskAnswer(JSONObject("""{"agents":{"alpha":"A","red":"R","cio":"C","verdict":"wait"}}""")))
    }

    @Test fun candlesSkipNonFiniteMalformedRowsAndSort() {
        val json = JSONObject("""{"candles":[{"ts":"2000","open":"4","high":5,"low":3,"close":4.5},
            {"ts":1000,"open":3,"high":4,"low":2,"close":3,"volume":"2"},
            {"ts":3000,"open":"NaN","high":4,"low":2,"close":3}]}""")
        val rows = BobbyParsers.candles(json)
        assertEquals(listOf(1000L, 2000L), rows.map { it.timestampMillis })
        assertEquals(0.0, rows.last().volume, 0.0)
    }

    @Test fun nullResolutionNeverGuessesAnUnmentionedInstrument() {
        assertNull(BobbyParsers.resolution(JSONObject("""{"resolution":null,"results":[{"symbol":"SONIC"}]}""")))
        val resolution = BobbyParsers.resolution(JSONObject("""{"resolution":{"needsConfirmation":true,"proxyNote":"Proxy"},
            "resolved":{"baseSymbol":"GLD","assetClass":"equity","displayName":"Gold ETF","aliases":["GLD","GOLD ETF"]}}"""))!!
        assertTrue(resolution.needsConfirmation)
        assertTrue(resolution.snapshot.isEquity)
        assertEquals("GLD", resolution.snapshot.symbol)
    }

    @Test fun streamSupportsNdjsonAndSseAndIgnoresMalformedProgressLines() {
        val ndjson = DeskStreamParser()
        assertNull(ndjson.line("broken"))
        assertEquals("agent", ndjson.line("""{"type":"agent","role":"alpha"}""")?.getString("type"))
        val sse = DeskStreamParser(true)
        assertNull(sse.line("event: final"))
        assertNull(sse.line("data: {\"type\":\"final\",\"data\":{\"ok\":true}}"))
        assertTrue(sse.line("")!!.getJSONObject("data").getBoolean("ok"))
    }
}
