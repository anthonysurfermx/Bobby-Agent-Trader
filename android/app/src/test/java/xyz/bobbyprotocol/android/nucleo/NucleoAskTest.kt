package xyz.bobbyprotocol.android.nucleo

import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test
import xyz.bobbyprotocol.android.v18.ReadOrigin

/**
 * What the page may ask and who wrote the words (iOS ARCHITECTURE.md §3.5; the cases of
 * ios/Bobby/Tests/NextQuestionTests.swift that do not need a desk). The session carries these
 * rules out; the question's words are kept nowhere.
 */
class NucleoAskTest {
    private val offered = "What would have to change in NVDA for this read to change?"

    private fun fault(params: JSONObject): String = try {
        AskRequest.parse(params)
        fail("expected a fault for $params")
        ""
    } catch (fault: NucleoFault) {
        assertEquals("invalid_params", fault.code)
        fault.message
    }

    // The next question

    @Test fun aQuestionNativeCannotCarryIsDroppedWholeNeverCut() {
        assertEquals("trimmed, otherwise as the desk wrote it", offered, NextQuestion.usable("  $offered\n"))
        val atLimit = "Why " + "x".repeat(NextQuestion.LIMIT - 5) + "?"
        assertEquals(160, NextQuestion.LIMIT)
        assertEquals(NextQuestion.LIMIT, atLimit.length)
        assertEquals(atLimit, NextQuestion.usable(atLimit))
        for (bad in listOf<Any?>("$atLimit?", "", "   ", 7, null, JSONObject.NULL, JSONArray().put("a"), JSONObject().put("text", offered), true)) {
            assertNull("$bad", NextQuestion.usable(bad))
        }
        // Counted as the server counts at most: one code point is one character, whatever it takes to store.
        val wide = "Why " + "🌊".repeat(NextQuestion.LIMIT - 5) + "?"
        assertEquals(wide, NextQuestion.usable(wide))
        assertNull(NextQuestion.usable("$wide?"))
    }

    @Test fun theSameQuestionIsToldApartByItsWordsNotItsSpaces() {
        assertTrue(NextQuestion.same(offered, "  What would  have to change in NVDA for this read\nto change? "))
        assertTrue(NextQuestion.same("Pourquoi NVDA monte ?", "Pourquoi NVDA monte ?"))
        assertTrue(NextQuestion.same("Pourquoi NVDA monte ?", "Pourquoi NVDA monte ?"))
        assertFalse(NextQuestion.same(offered, "What would have to change in AMD for this read to change?"))
        assertFalse(NextQuestion.same(offered, offered.lowercase()))
        assertFalse(NextQuestion.same(offered, ""))
    }

    /**
     * The page reads U+FEFF (a byte-order mark a server may leave in a string) as white space: it
     * shows the question without it, and a tap sends the words without it. Native compares the same way.
     */
    @Test fun aByteOrderMarkLeftInTheQuestionIsWhiteSpaceAsItIsForThePage() {
        assertEquals("at either end it goes with the spaces", offered, NextQuestion.usable("\uFEFF$offered \uFEFF"))
        assertNull("alone it is no question", NextQuestion.usable("\uFEFF \uFEFF"))
        assertTrue(NextQuestion.same("\uFEFF$offered", offered))
        assertTrue("inside, it separates two words, as a space does", NextQuestion.same("What changed\uFEFFin NVDA?", "What changed in NVDA?"))
        for (level in listOf("profundo", "maximo")) {
            assertEquals("the tap on that question is still Bobby's read, at Quick",
                         AskStart(ReadOrigin.FOLLOW_UP, "rapido", picked = true), AskStart.followUp("\uFEFF$offered", offered, level))
        }
    }

    @Test fun theQuestionAReadOfferedIsWhatItsSynthesisCarried() {
        assertEquals(offered, NextQuestion.offered(JSONObject().put("synthesis", JSONObject().put("headline", "H.").put("followUp", offered))))
        assertNull(NextQuestion.offered(JSONObject().put("synthesis", JSONObject().put("headline", "H."))))
        assertNull(NextQuestion.offered(JSONObject().put("synthesis", JSONObject().put("followUp", JSONObject.NULL))))
        assertNull(NextQuestion.offered(JSONObject()))
    }

    // The params of `ask`

    @Test fun exactlyOneWayOfAskingAndAChipMarksAPlainQuestionOnly() {
        assertEquals(AskRequest.Question("Is NVDA expensive?", chip = false), AskRequest.parse(JSONObject().put("question", "  Is NVDA expensive?\n")))
        assertEquals(AskRequest.Question("How is BTC looking?", chip = true), AskRequest.parse(JSONObject().put("question", "How is BTC looking?").put("chip", true)))
        assertEquals("a chip that says no is a plain question", AskRequest.Question("How is BTC looking?", chip = false),
                     AskRequest.parse(JSONObject().put("question", "How is BTC looking?").put("chip", false)))
        assertEquals(AskRequest.Token("tok-1"), AskRequest.parse(JSONObject().put("token", "tok-1")))
        val id = "11111111-1111-4111-8111-111111111111"
        assertEquals(AskRequest.FollowUp(id, "And the volume?"), AskRequest.parse(JSONObject().put("followUpOf", id).put("question", " And the volume? ")))

        assertEquals("token takes no question", fault(JSONObject().put("token", "tok-1").put("question", "q")))
        assertEquals("token takes no question", fault(JSONObject().put("token", "tok-1").put("followUpOf", id)))
        assertEquals("chip marks a plain question", fault(JSONObject().put("token", "tok-1").put("chip", true)))
        assertEquals("chip marks a plain question", fault(JSONObject().put("followUpOf", id).put("question", offered).put("chip", true)))
        assertEquals("even a chip that says no", "chip marks a plain question", fault(JSONObject().put("followUpOf", id).put("question", offered).put("chip", false)))
        for (notBoolean in listOf<Any>("true", 1, JSONObject.NULL, JSONObject())) {
            assertEquals("$notBoolean", "chip must be boolean", fault(JSONObject().put("question", "How is BTC looking?").put("chip", notBoolean)))
        }
        assertEquals("question is empty", fault(JSONObject().put("question", "   ")))
        assertEquals("question must be a string", fault(JSONObject()))
        assertEquals("question must be a string", fault(JSONObject().put("question", 7)))
        assertEquals("question must be a string", fault(JSONObject().put("followUpOf", id)))
        assertEquals("followUpOf must be a string", fault(JSONObject().put("followUpOf", 7).put("question", "q")))
        assertEquals("followUpOf is too long", fault(JSONObject().put("followUpOf", "x".repeat(37)).put("question", "q")))
        assertEquals("token must be a string", fault(JSONObject().put("token", 7)))
        assertEquals("token is too long", fault(JSONObject().put("token", "x".repeat(129))))
    }

    // Who started the read, and its level

    @Test fun typedOrSpokenIsThePersonsOwnAndAChipIsNotAtTheLevelTheySaved() {
        for (level in listOf("rapido", "profundo", "maximo")) {
            assertEquals(AskStart(ReadOrigin.PERSON, level), AskStart.question(chip = false, savedLevel = level))
            assertEquals("they picked the asset: the level stays theirs", AskStart(ReadOrigin.CHIP, level), AskStart.question(chip = true, savedLevel = level))
        }
    }

    @Test fun pickingTheQuestionBobbyWroteIsBobbysReadAtQuickAndTypingAnotherIsTheirOwnThread() {
        for (level in listOf("rapido", "profundo", "maximo")) {
            val picked = AskStart.followUp(offered, " What would have to  change in NVDA for this read to change? ", level)
            assertEquals(AskStart(ReadOrigin.FOLLOW_UP, "rapido", picked = true), picked)
            val typed = AskStart.followUp(offered, "And what does the volume say?", level)
            assertEquals(AskStart(ReadOrigin.THREAD, level), typed)
            assertFalse(typed.picked)
            // A read that offered no question has none to pick, even typed word for word.
            assertEquals(AskStart(ReadOrigin.THREAD, level), AskStart.followUp(null, offered, level))
        }
        assertEquals("a follow-up's button, a board row", AskStart(ReadOrigin.FOLLOW_UP, "rapido"), AskStart.native())
        assertEquals("rapido", AskStart.QUICK)
    }
}
