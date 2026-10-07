package xyz.bobbyprotocol.android.data

import org.junit.Assert.assertEquals
import org.junit.Test

class BobbyLocalesTest {
    @Test fun regionalVoiceLocalesPreserveLanguageAndApprovedRegion() {
        assertEquals("es" to "es-MX", BobbyLocales.voice("es-MX", "en", "en-US"))
        assertEquals("pt" to "pt-PT", BobbyLocales.voice("pt-PT", "en", "en-US"))
        assertEquals("pt" to "pt-BR", BobbyLocales.voice("pt_BR", "pt", "pt-PT"))
        assertEquals("en" to "en-GB", BobbyLocales.voice("en-GB", "es", "es-MX"))
    }
    @Test fun baseLanguageUsesSelectedMatchingLocaleAndInvalidRegionFallsBack() {
        assertEquals("es" to "es-ES", BobbyLocales.voice("es", "es", "es-ES"))
        assertEquals("es" to "es-MX", BobbyLocales.voice("es-AR", "en", "en-US"))
        assertEquals("de" to "de-DE", BobbyLocales.voice("de", "pt", "pt-PT"))
    }
}
