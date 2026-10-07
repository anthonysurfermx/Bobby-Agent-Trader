package xyz.bobbyprotocol.android.nucleo

import org.junit.Assert.*
import org.junit.Test
import java.time.Instant

class NucleoPolicyTest {
    @Test fun `question length matches server code points rather than UTF16 units`() {
        assertEquals(1, NucleoPolicy.questionLength("🌊"))
        assertEquals(1200, NucleoPolicy.questionLength("🌊".repeat(1200)))
        assertEquals(1201, NucleoPolicy.questionLength("🌊".repeat(1201)))
    }

    @Test fun `invalid evidence is refused before metering`() {
        val now = 1_800_000_000_000L
        val fresh = (0 until 60).map { now - (59 - it) * 3_600_000L }
        assertNull(NucleoPolicy.preflight("crypto", "BTC", fresh, now))
        assertEquals("thin_data", NucleoPolicy.preflight("crypto", "BTC", fresh.take(58), now))
        assertEquals("stale_data", NucleoPolicy.preflight("crypto", "BTC", fresh.map { it - 4 * 3_600_000 }, now))
        assertEquals("symbol_format", NucleoPolicy.preflight("equity", "BRK.B", fresh, now))
        assertEquals("asset_class", NucleoPolicy.preflight("commodity", "XAU", fresh, now))
        assertEquals("stale_data", NucleoPolicy.preflight("crypto", "BTC", fresh.dropLast(1) + (now + 6 * 60_000), now))
        assertNull(NucleoPolicy.preflight("equity", "NVDA", listOf(now - 4 * 86_400_000L), now))
        assertEquals("stale_data", NucleoPolicy.preflight("equity", "NVDA", listOf(now - 6 * 86_400_000L), now))
    }

    @Test fun `resolved regional cash listings pass the same freshness guard as US stocks`() {
        val now = 1_800_000_000_000L
        for (symbol in listOf("MC.PA", "OR.PA", "EDP.LS", "GALP.LS", "PETR4.SA", "VALE3.SA", "ENEL.MI", "ISP.MI", "SAP.DE", "SIE.DE")) {
            assertTrue(symbol, NucleoPolicy.supportsEquitySymbol(symbol))
            assertNull(symbol, NucleoPolicy.preflight("equity", symbol, listOf(now - 4 * 86_400_000L), now))
            assertEquals("stale_data", NucleoPolicy.preflight("equity", symbol, listOf(now - 6 * 86_400_000L), now))
            assertEquals("thin_data", NucleoPolicy.preflight("equity", symbol, emptyList(), now))
            assertEquals("stale_data", NucleoPolicy.preflight("equity", symbol, listOf(now + 6 * 60_000), now))
        }
    }

    @Test fun `cash ticker support remains bounded and cannot accept URL steering or substitutes`() {
        val now = 1_800_000_000_000L
        for (symbol in listOf("BRK.B", "MC.L", "mc.pa", "SAP.DE&symbol=BTC", "EDP.LS?range=1d", "../MC.PA", "MC%2EPA", "A".repeat(18) + ".DE")) {
            assertFalse(symbol, NucleoPolicy.supportsEquitySymbol(symbol))
            assertEquals("symbol_format", NucleoPolicy.preflight("equity", symbol, listOf(now), now))
        }
        assertEquals("asset_class", NucleoPolicy.preflight("commodity", "MC.PA", listOf(now), now))
        assertTrue(NucleoPolicy.supportsEquitySymbol("NVDA"))
    }

    @Test fun `booleans and nonfinite values never become market prices`() {
        assertNull(NucleoPolicy.number(true))
        assertNull(NucleoPolicy.number("NaN"))
        assertNull(NucleoPolicy.number(Double.POSITIVE_INFINITY))
        assertEquals(123.5, NucleoPolicy.number("123.5")!!, 0.0)
    }

    @Test fun `genuine offline discipline is capped and respects local dates`() {
        val now = Instant.parse("2026-10-03T23:30:00Z").toEpochMilli()
        var state = NucleoPolicy.Counters()
        repeat(3) { state = NucleoPolicy.award(state, true, now, -60).counters }
        assertEquals(60, state.xp)
        assertEquals("2026-10-04", state.lastDay)
        assertEquals(0, NucleoPolicy.award(state, true, now, -60).points)
        assertEquals(1, state.streak)
        val next = NucleoPolicy.award(state, false, now + 86_400_000, -60)
        assertEquals(10, next.points)
        assertEquals(2, next.counters.streak)
        val grace = NucleoPolicy.award(next.counters, false, now + 3 * 86_400_000, -60)
        assertEquals(2, grace.counters.streak)
        val broken = NucleoPolicy.award(grace.counters, false, now + 7 * 86_400_000, -60)
        assertEquals(1, broken.counters.streak)
    }
}
