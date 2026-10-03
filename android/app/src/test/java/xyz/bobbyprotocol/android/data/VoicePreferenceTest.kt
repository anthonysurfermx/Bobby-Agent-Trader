package xyz.bobbyprotocol.android.data

import org.junit.Assert.*
import org.junit.Test

class VoicePreferenceTest {
    @Test fun absentOrUnrecognizedPreferenceKeepsCompanionVoice() {
        listOf(null, "", "FEMALE", "https://other.invalid", "female&mode=free").forEach {
            assertEquals(VoicePreference.COMPANION, VoicePreference.parse(it))
        }
    }
    @Test fun selectedTypeReplacesPersonaWithoutChangingDefaultIdentity() {
        for (persona in listOf("ash", "coral", "ballad", "sage")) {
            assertEquals(persona, VoicePreference.COMPANION.requestVoice(persona))
            assertEquals("female", VoicePreference.parse("female").requestVoice(persona))
            assertEquals("male", VoicePreference.parse("male").requestVoice(persona))
        }
    }
    @Test fun explicitTypeNeverUsesACompanionRecordingInAnyLanguage() {
        for (locale in listOf("en-US", "es-MX", "fr-FR", "pt-PT", "pt-BR", "it-IT", "de-DE")) {
            assertFalse(VoicePreference.FEMALE.usesBundledClip(locale))
            assertFalse(VoicePreference.MALE.usesBundledClip(locale))
            assertEquals(locale.startsWith("en-") || locale.startsWith("es-"), VoicePreference.COMPANION.usesBundledClip(locale))
        }
    }
    @Test fun offlinePreviewNeverUsesANetworkVoiceOrAnotherLanguage() {
        val candidates = listOf(voice("fr-female-online", "fr-FR", true), voice("english-female", "en-US"), voice("fr-local", "fr-CA"))
        assertEquals("fr-local", VoicePreviewPolicy.choose(candidates, "fr-FR", VoicePreference.FEMALE))
        assertNull(VoicePreviewPolicy.choose(candidates, "de-DE", VoicePreference.MALE))
    }
    @Test fun explicitGenderPrefersTheMatchingRegionalVoiceWhenNamedByTheEngine() {
        val candidates = listOf(voice("female-fr-canada", "fr-CA"), voice("female-fr-france", "fr-FR"), voice("male-fr-france", "fr-FR"))
        assertEquals("female-fr-france", VoicePreviewPolicy.choose(candidates, "fr-FR", VoicePreference.FEMALE))
        assertEquals("male-fr-france", VoicePreviewPolicy.choose(candidates, "fr-FR", VoicePreference.MALE))
    }
    @Test fun maleDoesNotMatchTheFemaleSubstringAndOpaqueNamesKeepTheLocaleFallback() {
        val candidates = listOf(voice("female-fr", "fr-FR"), voice("engine-opaque", "fr-FR"), voice("male-fr", "fr-FR"))
        assertEquals("male-fr", VoicePreviewPolicy.choose(candidates, "fr-FR", VoicePreference.MALE))
        assertEquals("engine-opaque", VoicePreviewPolicy.choose(candidates.dropLast(1), "fr-FR", VoicePreference.MALE))
    }
    @Test fun narrationOnlyStartsWhenAllConsentOwnerAndMuteGatesPermitIt() {
        for (muted in listOf(false, true)) for (processing in listOf(false, true)) for (owner in listOf(false, true)) {
            assertEquals(!muted && processing && owner, NativeNarrationPolicy.allowed(muted, processing, owner))
        }
    }
    private fun voice(name: String, locale: String, network: Boolean = false) = VoicePreviewPolicy.Candidate(name, locale, network)
}
