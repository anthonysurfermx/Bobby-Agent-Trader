package xyz.bobbyprotocol.android.ui

import org.junit.Assert.*
import org.junit.Test

class TraderLandHelpCopyTest {
    @Test fun everySupportedLanguageHasItsOwnCompleteHelpInsteadOfEnglishFallback() {
        val languages = listOf("en", "es", "fr", "pt", "it", "de")
        val copies = languages.map { TraderLandHelpCopy.forLanguage(it, true) }
        assertEquals(languages.size, copies.map { it.action }.toSet().size)
        assertEquals(languages.size, copies.map { it.title }.toSet().size)
        for (copy in copies) {
            assertEquals(5, copy.steps.size)
            assertTrue(copy.steps.all { it.isNotBlank() })
            assertTrue(copy.controls.isNotBlank())
            assertTrue(copy.done.isNotBlank())
        }
        assertEquals(TraderLandHelpCopy.forLanguage("pt", false), TraderLandHelpCopy.forLanguage("PT_br", false))
        assertEquals(TraderLandHelpCopy.forLanguage("en", false), TraderLandHelpCopy.forLanguage("unsupported", false))
    }

    @Test fun theGuestGuideDoesNotPromiseAccountBuildingAndKeepsTheSameProgressInstructions() {
        for (language in listOf("en", "es", "fr", "pt", "it", "de")) {
            val guest = TraderLandHelpCopy.forLanguage(language, false)
            val account = TraderLandHelpCopy.forLanguage(language, true)
            assertEquals(account.steps.take(3), guest.steps.take(3))
            assertNotEquals(account.steps[3], guest.steps[3])
            assertNotEquals(account.steps[4], guest.steps[4])
            assertNotEquals(account.controls, guest.controls)
            assertFalse(guest.steps[3].contains("16×16"))
            assertTrue(guest.steps[4].contains("XP"))
        }
        assertTrue(TraderLandHelpCopy.forLanguage("fr", false).controls.contains("Tu peux"))
        assertTrue(TraderLandHelpCopy.forLanguage("pt", true).title.contains("tua"))
    }
}
