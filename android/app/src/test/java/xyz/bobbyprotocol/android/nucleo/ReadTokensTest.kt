package xyz.bobbyprotocol.android.nucleo

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import xyz.bobbyprotocol.android.v18.ReadOrigin

/**
 * The tokens that carry a read on: single use, ten minutes, one account moment, one consent, and
 * who started the read (iOS `NucleoDesk.issueToken(…origin:)`: "a token that carries a read on,
 * a retry, a confirmation, a sign-in, keeps who started it").
 */
class ReadTokensTest {
    private var now = 1_800_000_000_000L
    private var ids = 0
    private val tokens = ReadTokens({ now }) { "token-${++ids}" }
    private val nvda = JSONObject().put("symbol", "NVDA").put("name", "NVIDIA").put("isEquity", true)

    @Test fun aTokenIsUsedOnceAndSaysWhatItWasIssuedWith() {
        val token = tokens.issue(nvda, "What changed in NVDA since I asked?", "rapido", epoch = 4, consent = 2, guest = false, origin = ReadOrigin.FOLLOW_UP)
        assertTrue(tokens.waiting(token, 4, 2))
        val entry = tokens.take(token)
        assertNotNull(entry)
        assertEquals("What changed in NVDA since I asked?", entry?.question)
        assertEquals("NVDA", entry?.asset?.getString("symbol"))
        assertEquals("rapido", entry?.level)
        assertEquals(ReadOrigin.FOLLOW_UP, entry?.origin)
        assertFalse(entry?.persistLevel ?: true)
        assertTrue(tokens.good(entry!!, 4, 2))
        assertNull("single use", tokens.take(token))
        assertFalse(tokens.waiting(token, 4, 2))
        assertNull(tokens.take("never-issued"))
    }

    @Test fun whoStartedAReadSurvivesEveryTokenThatCarriesItOn() {
        // A chip's question that needs confirming, then fails, then is tried again: three tokens, one origin.
        for (origin in ReadOrigin.entries) {
            val confirm = tokens.issue(nvda, "How is NVDA looking?", "profundo", 1, 1, guest = false, origin = origin)
            val confirmed = tokens.take(confirm)!!
            val retry = tokens.issue(confirmed.asset, confirmed.question, confirmed.level, 1, 1, guest = false, origin = confirmed.origin)
            val retried = tokens.take(retry)!!
            val fallback = tokens.issue(retried.asset, retried.question, "rapido", 1, 1, guest = false, persist = true, origin = retried.origin)
            val last = tokens.take(fallback)!!
            assertEquals(origin, last.origin)
            assertEquals("How is NVDA looking?", last.question)
            assertTrue("the level the person chose on the fallback chip is kept", last.persistLevel)
            assertEquals("rapido", last.level)
        }
        assertEquals("a token nobody marked is the person's own question", ReadOrigin.PERSON,
                     tokens.take(tokens.issue(nvda, "q", "rapido", 1, 1, guest = false))?.origin)
    }

    @Test fun theQuestionBehindASignInGoesWithTheReaderIntoTheAccountAndNothingElseDoes() {
        // Signed out, at the wall: the question waits behind the sign-in. It was a chip's (Bobby's words).
        val behindSignIn = tokens.issue(nvda, "How is NVDA looking?", "rapido", epoch = 7, consent = 3, guest = true, signInRetry = true, origin = ReadOrigin.CHIP)
        val confirmation = tokens.issue(nvda, "another question", "rapido", epoch = 7, consent = 3, guest = true, origin = ReadOrigin.PERSON)
        tokens.signedIn(8)
        assertFalse("another account moment: the old one is over", tokens.waiting(behindSignIn, 7, 3))
        assertTrue(tokens.waiting(behindSignIn, 8, 3))
        assertNull("only the sign-in's own question follows", tokens.take(confirmation))
        val carried = tokens.take(behindSignIn)!!
        assertEquals("still Bobby's words, not a question the person asked by themselves", ReadOrigin.CHIP, carried.origin)
        assertEquals(8L, carried.epoch)
        assertTrue(tokens.good(carried, 8, 3))

        // A signed-in reader's retry is not a guest's: it never crosses into another account.
        val account = tokens.issue(nvda, "q", "rapido", epoch = 8, consent = 3, guest = false, signInRetry = true, origin = ReadOrigin.FOLLOW_UP)
        tokens.signedIn(9)
        assertNull(tokens.take(account))
    }

    @Test fun aTokenIsGoodForTenMinutesOneAccountMomentAndOneConsent() {
        val token = tokens.issue(nvda, "q", "rapido", epoch = 1, consent = 1, guest = false)
        assertFalse("another reader", tokens.waiting(token, 2, 1))
        assertFalse("consent withdrawn and given again", tokens.waiting(token, 1, 2))
        now += NucleoPolicy.TOKEN_LIFETIME_MS - 1
        assertTrue(tokens.waiting(token, 1, 1))
        now += 1
        assertFalse("ten minutes", tokens.waiting(token, 1, 1))
        val late = tokens.take(token)!!
        assertFalse(tokens.good(late, 1, 1))
        assertTrue("judged at the moment the ask began", tokens.good(late, 1, 1, now - 1))

        // Issuing sweeps what expired and what belongs to another account moment.
        val old = tokens.issue(nvda, "q", "rapido", epoch = 1, consent = 1, guest = false)
        val other = tokens.issue(nvda, "q", "rapido", epoch = 1, consent = 1, guest = false)
        now += NucleoPolicy.TOKEN_LIFETIME_MS + 1
        tokens.issue(nvda, "q", "rapido", epoch = 1, consent = 1, guest = false)
        assertNull(tokens.take(old))
        assertNull(tokens.take(other))
        val mine = tokens.issue(nvda, "q", "rapido", epoch = 1, consent = 1, guest = false)
        tokens.issue(nvda, "q", "rapido", epoch = 2, consent = 1, guest = false)
        assertNull("issued under a newer account moment: the older reader's token is gone", tokens.take(mine))

        val kept = tokens.issue(nvda, "q", "rapido", epoch = 2, consent = 1, guest = false)
        tokens.clear()
        assertNull(tokens.take(kept))
    }

    @Test fun aSignInRetryThatExpiredWhileTheSheetWasOpenIsNotCarried() {
        val waiting = tokens.issue(nvda, "q", "rapido", epoch = 1, consent = 1, guest = true, signInRetry = true)
        now += NucleoPolicy.TOKEN_LIFETIME_MS + 1
        tokens.signedIn(2)
        assertNull(tokens.take(waiting))
    }
}
