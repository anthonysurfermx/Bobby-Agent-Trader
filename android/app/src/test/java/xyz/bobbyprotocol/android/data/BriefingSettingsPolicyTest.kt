package xyz.bobbyprotocol.android.data

import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test

class BriefingSettingsPolicyTest {
    private val options = JSONObject().put("consentVersions", JSONObject().put("analysis", 7).put("audio", 3))
        .put("assets", JSONArray(listOf("BTC", "ETH", "AAPL", "MSFT", "SPY", "GLD", "SOL")))
        .put("companions", JSONArray(listOf("orb", "byte")))

    @Test fun enablingUsesTheRealCurrentVersionAndExactAcceptedField() {
        val analysis = BriefingSettingsPolicy.consentChange("analysis", true, options, true)
        assertEquals(setOf("analysisConsentEnabled", "acceptedAnalysisConsentVersion"), analysis.keys().asSequence().toSet())
        assertEquals(7, analysis.getInt("acceptedAnalysisConsentVersion"))
        val audio = BriefingSettingsPolicy.consentChange("audio", true, options, true)
        assertEquals(3, audio.getInt("acceptedAudioConsentVersion"))
        assertFalse(audio.has("audioConsentVersion"))
    }

    @Test fun disablingNeedsNeitherLocalAiConsentNorAServerVersion() {
        for (kind in listOf("analysis", "audio")) {
            val body = BriefingSettingsPolicy.consentChange(kind, false, null, false)
            assertEquals(1, body.length())
            assertEquals(false, body.getBoolean("${kind}ConsentEnabled"))
        }
    }

    @Test fun missingStaleMalformedOptionsOrLocalConsentCannotEnableProcessing() {
        rejected { BriefingSettingsPolicy.consentChange("analysis", true, options, false) }
        rejected { BriefingSettingsPolicy.consentChange("analysis", true, null, true) }
        rejected { BriefingSettingsPolicy.consentChange("analysis", true, JSONObject().put("consentVersions", JSONObject().put("analysis", "7")), true) }
        rejected { BriefingSettingsPolicy.consentChange("audio", true, JSONObject().put("consentVersions", JSONObject().put("audio", 0)), true) }
    }

    @Test fun unsupportedFieldsLegacyVersionNamesAndWrongTypesFailBeforeTransport() {
        for (body in listOf(JSONObject(), JSONObject().put("analysisConsentEnabled", true).put("analysisConsentVersion", 1),
            JSONObject().put("audioConsentEnabled", false).put("acceptedAudioConsentVersion", 1),
            JSONObject().put("audioConsentEnabled", true), JSONObject().put("weeklyEnabled", "false"),
            JSONObject().put("openingEnabled", true), JSONObject().put("owner", "other-account"))) {
            rejected { BriefingSettingsPolicy.validate(body) }
        }
    }

    @Test fun reportLanguageIsExplicitAndRejectsUnsupportedOrRegionalLanguageCodes() {
        val settings = JSONObject().put("options", options).put("language", "es")
        val body = BriefingSettingsPolicy.preferences(settings, listOf("BTC"), settings.getString("language"), "orb")
        assertEquals("es", body.getString("language"))
        for (language in listOf("ja", "es-MX", "pt-BR", "FR", "")) {
            rejected { BriefingSettingsPolicy.preferences(settings, listOf("BTC"), language, "orb") }
        }
    }

    @Test fun savedCrossClientReportLanguagesCanChangeAssetsAndVoiceWithoutChangingConsent() {
        for ((language, locale) in listOf("fr" to "fr-FR", "pt" to "pt-PT", "it" to "it-IT", "de" to "de-DE")) {
            val settings = JSONObject().put("options", options).put("language", language).put("locale", locale)
                .put("analysisConsentEnabled", true).put("audioConsentEnabled", true).put("weeklyEnabled", true)
            val body = BriefingSettingsPolicy.preferences(settings, listOf("ETH"), language, "byte")
            assertEquals(language, body.getString("language"))
            assertEquals(locale, body.getString("locale"))
            assertEquals("ETH", body.getJSONArray("assets").getString(0))
            assertEquals("byte", body.getString("companionId"))
            assertEquals(setOf("assets", "language", "locale", "companionId"), body.keys().asSequence().toSet())
        }
    }

    @Test fun brazilianReportLocaleSurvivesAnAssetEditAndSupportsAnExplicitPortugalChoice() {
        val settings = JSONObject().put("options", options).put("language", "pt").put("locale", "pt-BR")
        val unchanged = BriefingSettingsPolicy.preferences(settings, listOf("BTC"), "pt", "orb")
        assertEquals("pt", unchanged.getString("language"))
        assertEquals("pt-BR", unchanged.getString("locale"))
        assertEquals("pt-PT", BriefingSettingsPolicy.preferences(settings, listOf("ETH"), "pt", "byte", "pt-PT").getString("locale"))
        val legacy = JSONObject().put("options", options).put("language", "pt-BR")
        assertEquals("pt-BR", BriefingSettingsPolicy.preferences(legacy, listOf("BTC"), "pt", null).getString("locale"))
    }

    @Test fun changingTheReportLanguageDoesNotCarryAnotherLanguagesLocale() {
        val settings = JSONObject().put("options", options).put("language", "pt").put("locale", "pt-BR")
        val french = BriefingSettingsPolicy.preferences(settings, listOf("BTC"), "fr", "orb")
        assertEquals("fr-FR", french.getString("locale"))
        assertEquals("pt-BR", BriefingSettingsPolicy.reportLocale(settings, "pt"))
        val legacy = JSONObject().put("options", options).put("language", "es")
        assertEquals("es-MX", BriefingSettingsPolicy.preferences(legacy, listOf("BTC"), "es", "orb").getString("locale"))
    }

    @Test fun unsupportedMalformedOrUnpairedReportLocalesFailBeforeTransport() {
        for (body in listOf(JSONObject().put("locale", "pt-BR"),
            JSONObject().put("language", "pt").put("locale", "fr-FR"),
            JSONObject().put("language", "pt").put("locale", "pt_BR"),
            JSONObject().put("language", "pt").put("locale", "pt-AO"),
            JSONObject().put("language", "fr").put("locale", 1))) {
            rejected { BriefingSettingsPolicy.validate(body) }
        }
        val malformedSaved = JSONObject().put("options", options).put("language", "pt").put("locale", "fr-FR")
        rejected { BriefingSettingsPolicy.preferences(malformedSaved, listOf("BTC"), "pt", "orb") }
    }

    @Test fun assetsAndCompanionUseAuthoritativeOptionsAndActualSixAssetLimit() {
        val settings = JSONObject().put("options", options)
        assertEquals(6, BriefingSettingsPolicy.preferences(settings, listOf("BTC", "ETH", "AAPL", "MSFT", "SPY", "GLD"), "en", null).getJSONArray("assets").length())
        assertFalse(BriefingSettingsPolicy.preferences(settings, emptyList(), "en", null).has("companionId"))
        rejected { BriefingSettingsPolicy.preferences(settings, listOf("BTC", "ETH", "AAPL", "MSFT", "SPY", "GLD", "SOL"), "en", "orb") }
        rejected { BriefingSettingsPolicy.preferences(settings, listOf("FAKE"), "en", "orb") }
        rejected { BriefingSettingsPolicy.preferences(settings, listOf("BTC", "BTC"), "en", "orb") }
        rejected { BriefingSettingsPolicy.preferences(settings, listOf("BTC"), "en", "fake-companion") }
    }

    private fun rejected(action: () -> Unit) {
        try { action(); fail("Invalid settings were accepted") } catch (_: ApiException) { }
    }
}
