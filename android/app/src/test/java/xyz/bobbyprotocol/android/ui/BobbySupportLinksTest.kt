package xyz.bobbyprotocol.android.ui

import okhttp3.HttpUrl
import okhttp3.HttpUrl.Companion.toHttpUrl
import org.junit.Assert.*
import org.junit.Test

class BobbySupportLinksTest {
    @Test fun accountAndPaywallDestinationsPreserveAllSixInterfaceLanguages() {
        val examples = listOf("en" to "en-GB", "es" to "es-ES", "fr" to "fr-FR", "pt" to "pt-BR", "it" to "it-IT", "de" to "de-DE")
        for (page in BobbySupportLinks.Page.entries) for ((language, locale) in examples) {
            val url = BobbySupportLinks.url(page, language, locale, "PT").toHttpUrl()
            assertApprovedDestination(page, url)
            assertEquals(language, url.queryParameter("lang"))
            assertEquals(locale, url.queryParameter("locale"))
            assertEquals("PT", url.queryParameter("country"))
        }
    }

    @Test fun everyNativeRegionalLocaleSurvivesThePublicPageHandoff() {
        val locales = listOf("en-US", "en-GB", "en-AU", "en-CA", "en-IE", "es-MX", "es-ES", "es-US", "fr-FR", "pt-PT", "pt-BR", "it-IT", "de-DE")
        for (locale in locales) {
            val url = BobbySupportLinks.url(BobbySupportLinks.Page.SUPPORT, locale.substringBefore('-'), locale.lowercase().replace('-', '_'), locale.substringAfter('-')).toHttpUrl()
            assertEquals(locale, url.queryParameter("locale"))
            assertEquals(locale.substringBefore('-'), url.queryParameter("lang"))
            assertEquals(locale.substringAfter('-'), url.queryParameter("country"))
        }
    }

    @Test fun mismatchedOrUnapprovedLocaleFallsBackWithinTheSelectedLanguage() {
        val examples = listOf(Triple("fr", "pt-BR", "fr-FR"), Triple("de", "de-AT", "de-DE"), Triple("es", "en-GB", "es-MX"), Triple("pt", "pt-AO", "pt-PT"))
        for ((language, locale, expected) in examples) {
            val url = BobbySupportLinks.url(BobbySupportLinks.Page.PRIVACY, language, locale, "BR").toHttpUrl()
            assertEquals(language, url.queryParameter("lang"))
            assertEquals(expected, url.queryParameter("locale"))
            // The device country is independent of the user's selected interface language.
            assertEquals("BR", url.queryParameter("country"))
        }
    }

    @Test fun countryIsNormalizedOnlyWhenItNamesARealIsoCountry() {
        assertEquals("PT", BobbySupportLinks.url(BobbySupportLinks.Page.SUPPORT, "pt", "pt-PT", " pt ").toHttpUrl().queryParameter("country"))
        for (country in listOf(null, "", "ZZ", "123", "UK", "GB&lang=de", "PT#fragment", "//other.invalid")) {
            val url = BobbySupportLinks.url(BobbySupportLinks.Page.SUPPORT, "en", "en-GB", country).toHttpUrl()
            assertNull(url.queryParameter("country"))
            assertEquals(setOf("platform", "lang", "locale"), url.queryParameterNames)
        }
    }

    @Test fun malformedContextCannotSteerTheOriginPageOrQueryKeys() {
        val inputs = listOf("https://other.invalid/support", "//other.invalid", "fr&redirect=https://other.invalid", "pt-BR&platform=ios", "en-US#fragment", "../privacy", "\r\nHost: other.invalid")
        for (page in BobbySupportLinks.Page.entries) for (input in inputs) {
            val url = BobbySupportLinks.url(page, input, input, input).toHttpUrl()
            assertApprovedDestination(page, url)
            val language = url.queryParameter("lang")!!
            assertTrue(language in setOf("en", "es", "fr", "pt", "it", "de"))
            assertTrue(url.queryParameter("locale")!!.startsWith("$language-"))
            assertEquals(setOf("platform", "lang", "locale"), url.queryParameterNames)
        }
    }

    @Test fun regionalLanguageInputsRemainCanonicalWithoutAddingPrivateContext() {
        val url = BobbySupportLinks.url(BobbySupportLinks.Page.PRIVACY, "PT_br", "pt-PT", "br").toHttpUrl()
        assertApprovedDestination(BobbySupportLinks.Page.PRIVACY, url)
        assertEquals("pt", url.queryParameter("lang"))
        assertEquals("pt-BR", url.queryParameter("locale"))
        assertEquals("BR", url.queryParameter("country"))
        assertEquals(setOf("platform", "lang", "locale", "country"), url.queryParameterNames)
    }

    private fun assertApprovedDestination(page: BobbySupportLinks.Page, url: HttpUrl) {
        assertEquals("https", url.scheme)
        assertEquals("bobbyprotocol.xyz", url.host)
        assertEquals(443, url.port)
        assertEquals("", url.username)
        assertEquals("", url.password)
        assertEquals("/${page.path}", url.encodedPath)
        assertEquals("android", url.queryParameter("platform"))
        assertNull(url.fragment)
        assertEquals(1, url.queryParameterValues("lang").size)
        assertEquals(1, url.queryParameterValues("locale").size)
    }
}
