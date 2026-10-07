package xyz.bobbyprotocol.android.v18.invite

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import xyz.bobbyprotocol.android.v18.credits.TwoWords
import xyz.bobbyprotocol.android.v18.credits.V18Catalog

/**
 * Which URLs carry an invitation code (1.8). The cases of ios/Bobby/Tests/InviteLinkTests.swift.
 * Pure parsing: nothing is stored and nothing is sent.
 */
class InviteLinkTest {
    private fun code(text: String): String? = InviteLink.code(text)

    @Test fun theSharedLinkTheLegacyLinkAndTheAppSchemeCarryACode() {
        val accepted = listOf(
            "https://bobbyprotocol.xyz/i/ABCD2345",
            "https://www.bobbyprotocol.xyz/i/ABCD2345",
            "https://bobbyprotocol.xyz/i/ABCD2345/",
            "https://bobbyprotocol.xyz/i/ABCD2345?utm_source=whatsapp&ref=ZZZZZZZZ",
            "https://bobbyprotocol.xyz/i/ABCD2345#top",
            "HTTPS://BobbyProtocol.XYZ/i/ABCD2345",
            "https://bobbyprotocol.xyz/desk?ref=ABCD2345&v=2",
            "https://bobbyprotocol.xyz/desk?v=2&ref=ABCD2345",
            "https://www.bobbyprotocol.xyz/desk?ref=ABCD2345",
            "https://bobbyprotocol.xyz/desk/?ref=ABCD2345",
            "bobbyprotocol://invite/ABCD2345",
            "bobbyprotocol://invite/ABCD2345/")
        for (link in accepted) assertEquals(link, "ABCD2345", code(link))
    }

    @Test fun lowercaseIsAcceptedAndReturnedInCapitals() {
        assertEquals("ABCD2345", code("https://bobbyprotocol.xyz/i/abcd2345"))
        assertEquals("ABCD2345", code("https://bobbyprotocol.xyz/i/AbCd2345"))
        assertEquals("WXYZ6789", code("https://bobbyprotocol.xyz/desk?ref=wxyz6789&v=2"))
        assertEquals("WXYZ6789", code("bobbyprotocol://invite/wxyz6789"))
    }

    @Test fun everyLetterAndDigitOfTheServerAlphabetIsAccepted() {
        val alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
        assertEquals(32, alphabet.length)
        for (start in 0 until alphabet.length step 8) {
            val chunk = alphabet.substring(start, start + 8)
            assertEquals(chunk, code("https://bobbyprotocol.xyz/i/$chunk"))
            assertTrue(chunk, InviteLink.CODE_PATTERN.matches(chunk))
        }
    }

    @Test fun otherHostsSchemesPortsAndCredentialsAreNotInvitations() {
        val refused = listOf(
            "http://bobbyprotocol.xyz/i/ABCD2345",
            "https://bobbyprotocol.xyz.evil.com/i/ABCD2345",
            "https://evil.com/i/ABCD2345",
            "https://evilbobbyprotocol.xyz/i/ABCD2345",
            "https://app.bobbyprotocol.xyz/i/ABCD2345",
            "https://bobbyprotocol.xyz./i/ABCD2345",
            "https://bobbyprotocol.xyz@evil.com/i/ABCD2345",
            "https://evil.com@bobbyprotocol.xyz/i/ABCD2345",
            "https://user:pass@bobbyprotocol.xyz/i/ABCD2345",
            "https://bobbyprotocol.xyz:8443/i/ABCD2345",
            "https://evil.com/?next=https://bobbyprotocol.xyz/i/ABCD2345",
            "https://evil.com/desk?ref=ABCD2345",
            "ftp://bobbyprotocol.xyz/i/ABCD2345",
            "file:///i/ABCD2345",
            "bobby://invite/ABCD2345",
            "bobbyprotocol:invite/ABCD2345",
            "bobbyprotocol://invites/ABCD2345",
            "bobbyprotocol://bobbyprotocol.xyz/i/ABCD2345",
            "https:/bobbyprotocol.xyz/i/ABCD2345",
            "https:\\\\bobbyprotocol.xyz\\i\\ABCD2345",
            "//bobbyprotocol.xyz/i/ABCD2345",
            "/i/ABCD2345",
            " https://bobbyprotocol.xyz/i/ABCD2345")
        for (link in refused) assertNull(link, code(link))
    }

    @Test fun aCodeIsExactlyEightCharactersOfTheAlphabet() {
        val refused = listOf(
            "https://bobbyprotocol.xyz/i/ABCD234",      // seven
            "https://bobbyprotocol.xyz/i/ABCD23456",    // nine
            "https://bobbyprotocol.xyz/i/ABCDI345",     // I
            "https://bobbyprotocol.xyz/i/ABCDO345",     // O
            "https://bobbyprotocol.xyz/i/ABCD0345",     // zero
            "https://bobbyprotocol.xyz/i/ABCD1345",     // one
            "https://bobbyprotocol.xyz/i/abcdi345",
            "https://bobbyprotocol.xyz/i/ABCD-345",
            "https://bobbyprotocol.xyz/i/ABCD_345",
            "https://bobbyprotocol.xyz/i/",
            "https://bobbyprotocol.xyz/i",
            "https://bobbyprotocol.xyz/desk?ref=ABCD234",
            "https://bobbyprotocol.xyz/desk?ref=ABCD23456",
            "https://bobbyprotocol.xyz/desk?ref=ABCDO345",
            "https://bobbyprotocol.xyz/desk?ref=",
            "https://bobbyprotocol.xyz/desk?ref",
            "bobbyprotocol://invite/ABCD234",
            "bobbyprotocol://invite/ABCD23456",
            "bobbyprotocol://invite/ABCD0345")
        for (link in refused) assertNull(link, code(link))
        for (raw in listOf("ABCD234", "ABCD23456", "ABCDI345", "ABCDO345", "ABCD0345", "ABCD1345", "ABCD2345\n", " ABCD234", "ÀBCD2345", "")) {
            assertNull(raw, InviteLink.normalized(raw))
        }
        assertEquals("ABCD2345", InviteLink.normalized("abcd2345"))
    }

    @Test fun percentEncodingAndLookAlikeLettersAreNeverDecodedIntoACode() {
        val refused = listOf(
            "https://bobbyprotocol.xyz/i/%41BCD2345",
            "https://bobbyprotocol.xyz/i/ABCD%32345",
            "https://bobbyprotocol.xyz/%69/ABCD2345",
            "https://bobbyprotocol.xyz/i%2FABCD2345",
            "https://bobbyprotocol.xyz/desk?ref=%41BCD2345",
            "https://bobbyprotocol.xyz/desk?%72ef=ABCD2345",
            "https://bobbyprotocol%2Exyz/i/ABCD2345",
            "bobbyprotocol://invite/%41BCD2345",
            "https://bobbyprotocol.xyz/i/ABCD234K",   // the Kelvin sign folds to "k"
            "https://bobbyprotocol.xyz/i/ＡBCD2345",   // a full-width A
            "https://bobbyprotocol.xyz/i/ABCD234%E2%84%AA",
            "https://bobbyprotocoK.xyz/i/ABCD2345")
        for (link in refused) assertNull(link, code(link))
        assertNull(InviteLink.normalized("ABCD234K"))
        assertNull(InviteLink.normalized("ＡBCD2345"))
    }

    @Test fun onlyTheInvitationPathsCount() {
        val refused = listOf(
            "https://bobbyprotocol.xyz/",
            "https://bobbyprotocol.xyz",
            "https://bobbyprotocol.xyz/?ref=ABCD2345",
            "https://bobbyprotocol.xyz/desk",
            "https://bobbyprotocol.xyz/desk?reference=ABCD2345",
            "https://bobbyprotocol.xyz/desk/more?ref=ABCD2345",
            "https://bobbyprotocol.xyz/desks?ref=ABCD2345",
            "https://bobbyprotocol.xyz/signin?ref=ABCD2345",
            "https://bobbyprotocol.xyz/I/ABCD2345",
            "https://bobbyprotocol.xyz/i/ABCD2345/more",
            "https://bobbyprotocol.xyz/x/i/ABCD2345",
            "https://bobbyprotocol.xyz/invite/ABCD2345",
            "https://bobbyprotocol.xyz/i?ref=ABCD2345",
            "bobbyprotocol://invite",
            "bobbyprotocol://invite/",
            "bobbyprotocol://invite/ABCD2345/more",
            "bobbyprotocol://invite?code=ABCD2345",
            "bobbyprotocol://invite?ref=ABCD2345")
        for (link in refused) assertNull(link, code(link))
    }

    @Test fun theSignInCallbackIsNeverAnInvitation() {
        // Android's sign-in comes back on `bobby://auth/callback`; iOS's on `bobbyprotocol://auth-callback`.
        val callbacks = listOf(
            "bobby://auth/callback",
            "bobby://auth/callback?state=ABCD2345&code=ABCD2345",
            "bobby://auth/callback/ABCD2345",
            "bobby://invite/ABCD2345",
            "bobbyprotocol://auth-callback",
            "bobbyprotocol://auth-callback#access_token=x.y.z&refresh_token=ref-a&expires_in=3600",
            "bobbyprotocol://auth-callback/ABCD2345",
            "bobbyprotocol://auth-callback?ref=ABCD2345",
            "bobbyprotocol://auth-callback?code=ABCD2345#access_token=ABCD2345",
            "bobbyprotocol://auth-callback/invite/ABCD2345")
        for (callback in callbacks) assertNull(callback, code(callback))
    }

    @Test fun aTypedOrPastedEntryBecomesACode() {
        assertEquals("ABCD2345", InviteLink.codeFromEntry("ABCD2345"))
        assertEquals("ABCD2345", InviteLink.codeFromEntry(" abcd 2345 \n"))
        assertEquals("ABCD2345", InviteLink.codeFromEntry("abcd 2345"))
        assertEquals("ABCD2345", InviteLink.codeFromEntry("https://bobbyprotocol.xyz/i/abcd2345"))
        assertEquals("ABCD2345", InviteLink.codeFromEntry("https://bobbyprotocol.xyz/desk?ref=ABCD2345&v=2"))
        assertEquals("ABCD2345", InviteLink.codeFromEntry("bobbyprotocol://invite/ABCD2345"))
        for (raw in listOf("", "   ", "ABCD234", "ABCD23456", "ABCDI345", "hello", "https://evil.com/i/ABCD2345",
                           "bobbyprotocol://auth-callback#access_token=ABCD2345", "A".repeat(600))) {
            assertNull(raw, InviteLink.codeFromEntry(raw))
        }
    }

    @Test fun aPastedShareMessageBecomesItsCodeInEveryLanguage() {
        // What a friend copies from the chat bubble: the pitch, the code line, and the link.
        val message = InviteCopy.shareMessage("ABCD2345", TwoWords())
        assertEquals("ABCD2345", InviteLink.codeFromEntry(message))
        assertEquals("ABCD2345", InviteLink.codeFromEntry(message + "\nhttps://bobbyprotocol.xyz/i/ABCD2345"))
        assertEquals("ABCD2345", InviteLink.codeFromEntry("https://bobbyprotocol.xyz/i/ABCD2345 $message"))
        assertEquals("the field shows the code, not the first eight letters of the pitch", "ABCD2345", InviteLink.tidy(message))
        assertEquals("ABCD2345", InviteLink.tidy(message + "\nhttps://bobbyprotocol.xyz/i/ABCD2345"))

        val pitch = "Bobby: three AI agents debate any stock or crypto before you decide."
        val line = "My invitation code: {0}"
        val messages = ArrayList<String>()
        messages.add(message)
        messages.add(InviteCopy.shareMessage("ABCD2345", TwoWords(spanish = true)))
        assertEquals("Bobby: tres agentes de IA debaten cualquier acción o cripto antes de que decidas.\nMi código de invitación: ABCD2345", messages[1])
        for (language in V18Catalog.LANGUAGES) {
            val translatedPitch = V18Catalog.text(pitch, language) ?: ""
            val translatedLine = V18Catalog.text(line, language) ?: ""
            assertFalse(language, translatedPitch.isEmpty())
            assertFalse(language, translatedLine.isEmpty())
            messages.add(translatedPitch + "\n" + translatedLine.replace("{0}", "ABCD2345"))
        }
        assertEquals(6, messages.size)
        for (text in messages) {
            assertEquals(text, "ABCD2345", InviteLink.codeFromEntry(text))
            assertEquals(text, "ABCD2345", InviteLink.codeFromEntry(text + "\nhttps://bobbyprotocol.xyz/i/ABCD2345"))
            assertEquals(text, "ABCD2345", InviteLink.tidy(text))
            // The code line on its own (the second line of the bubble).
            val second = text.split("\n").last()
            assertEquals(second, "ABCD2345", InviteLink.codeFromEntry(second))
            assertEquals(second, "ABCD2345", InviteLink.tidy(second))
        }
    }

    @Test fun aLinkWithoutItsSchemeAndALinkInsideASentenceCarryTheCode() {
        // The link is often written without "https://".
        assertEquals("ABCD2345", InviteLink.codeFromEntry("bobbyprotocol.xyz/i/ABCD2345"))
        assertEquals("ABCD2345", InviteLink.codeFromEntry("www.bobbyprotocol.xyz/i/abcd2345"))
        assertEquals("ABCD2345", InviteLink.codeFromEntry("BobbyProtocol.xyz/i/ABCD2345/"))
        assertEquals("ABCD2345", InviteLink.codeFromEntry("bobbyprotocol.xyz/desk?ref=ABCD2345&v=2"))
        assertEquals("ABCD2345", InviteLink.codeFromEntry("Try Bobby (https://bobbyprotocol.xyz/i/ABCD2345)."))
        assertEquals("ABCD2345", InviteLink.codeFromEntry("use bobbyprotocol.xyz/i/ABCD2345, it is nice"))
        assertEquals("ABCD2345", InviteLink.codeFromEntry("my code is \"ABCD2345\"."))
        assertEquals("a digit in it: not an ordinary word", "ABCD2345", InviteLink.codeFromEntry("my code is abcd2345"))
        assertEquals("the same invitation twice is one invitation", "ABCD2345", InviteLink.codeFromEntry("ABCD2345 ABCD2345"))
        assertEquals("ABCD2345", InviteLink.tidy("bobbyprotocol.xyz/i/abcd2345"))
    }

    @Test fun aTextWithNoInvitationOrWithTwoIsNotACode() {
        val refused = listOf(
            "ABCD2345 WXYZ6789",                                                     // two codes
            "https://bobbyprotocol.xyz/i/ABCD2345 https://bobbyprotocol.xyz/i/WXYZ6789",
            "please research standard purchase",                                     // eight-letter words are words
            "see you thursday",
            "bobbyprotocol.xyz.evil.com/i/ABCD2345",
            "evil.com/i/ABCD2345",
            "evil.com/bobbyprotocol.xyz/i/ABCD2345",
            "go to https://evil.com/i/ABCD2345 now",
            "https://evil.com/?next=https://bobbyprotocol.xyz/i/ABCD2345",
            "bobbyprotocol.xyz/i/ABCDI345",
            "bobbyprotocol.xyz/@evil.com/i/ABCD2345",
            "code:ABCD234")
        for (text in refused) assertNull(text, InviteLink.codeFromEntry(text))
        // A link says which invitation is meant, even next to a word that could pass for a code.
        assertEquals("ABCD2345", InviteLink.codeFromEntry("PURCHASE https://bobbyprotocol.xyz/i/ABCD2345"))
        // An ordinary word next to the code does not hide it.
        assertEquals("ABCD2345", InviteLink.codeFromEntry("standard ABCD2345"))
    }

    @Test fun theFieldKeepsCapitalsAndEightCharactersAndTurnsAPastedLinkIntoItsCode() {
        assertEquals("ABCD2345", InviteLink.tidy("abcd2345"))
        assertEquals("ABCD23", InviteLink.tidy("ab cd-23"))
        assertEquals("ABCD2345", InviteLink.tidy("abcd2345extra"))
        assertEquals("WXYZ6789", InviteLink.tidy("https://bobbyprotocol.xyz/i/wxyz6789"))
        assertEquals("", InviteLink.tidy(""))
        assertEquals("only plain letters and digits stay in the field", "BC", InviteLink.tidy("á-b_c"))
    }
}
