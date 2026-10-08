package xyz.bobbyprotocol.android.v18

import org.junit.Assert.assertEquals
import org.junit.Test

/** One formatter for every `{0}` in the catalogs. */
class V18TextTest {
    @Test fun placeholdersAreFilledByPositionInAnyOrder() {
        assertEquals("7 of 10 left this week", V18Text.fill("{0} of {1} left this week", 7, 10))
        assertEquals("Von 10 sind 7 übrig", V18Text.fill("Von {1} sind {0} übrig", 7, 10))
        assertEquals("NVDA, NVDA", V18Text.fill("{0}, {0}", "NVDA"))
    }

    @Test fun aMissingValueLeavesItsPlaceholderAndAValueIsNeverFilledTwice() {
        assertEquals("Review {0}", V18Text.fill("Review {0}"))
        assertEquals("NVDA and {1}", V18Text.fill("{0} and {1}", "NVDA"))
        assertEquals("NVDA and {1}", V18Text.fill("{0} and {1}", "NVDA", null))
        assertEquals("{1} then BTC", V18Text.fill("{0} then {1}", "{1}", "BTC"))
        assertEquals("a price of $131.20 and a \\ slash", V18Text.fill("a price of {0} and a {1} slash", "$131.20", "\\"))
        assertEquals("{x} {} {-1}", V18Text.fill("{x} {} {-1}", "a"))
    }
}
