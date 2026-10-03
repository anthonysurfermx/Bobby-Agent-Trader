package xyz.bobbyprotocol.android.ui

import okhttp3.HttpUrl.Companion.toHttpUrl
import xyz.bobbyprotocol.android.data.BobbyLocales
import java.util.Locale

/** Public pages carry interface context, never account or payment identifiers. */
internal object BobbySupportLinks {
    enum class Page(val path: String) { PRIVACY("privacy"), SUPPORT("support") }

    private val origin = "https://bobbyprotocol.xyz/".toHttpUrl()
    private val countries = Locale.getISOCountries().toSet()

    fun url(page: Page, language: String, locale: String, country: String?): String {
        val (selectedLanguage, selectedLocale) = BobbyLocales.voice(language, language, locale)
        val selectedCountry = country?.trim()?.uppercase(Locale.ROOT)?.takeIf { it in countries }
        return origin.newBuilder().addPathSegment(page.path)
            .addQueryParameter("platform", "android")
            .addQueryParameter("lang", selectedLanguage)
            .addQueryParameter("locale", selectedLocale)
            .apply { selectedCountry?.let { addQueryParameter("country", it) } }
            .build().toString()
    }
}
