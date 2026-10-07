package xyz.bobbyprotocol.android.data

import java.util.Locale

object BobbyLocales {
    private val approvedLocales = listOf("en-US", "en-GB", "en-AU", "en-CA", "en-IE", "es-MX", "es-ES", "es-US", "fr-FR", "pt-PT", "pt-BR", "it-IT", "de-DE")
    fun language(value: String): String = value.replace('_', '-').substringBefore('-').lowercase(Locale.ROOT)
        .takeIf { it in setOf("en", "es", "pt", "fr", "de", "it") } ?: "en"
    fun defaultLocale(value: String): String = when (language(value)) {
        "es" -> "es-MX"; "pt" -> "pt-PT"; "fr" -> "fr-FR"; "de" -> "de-DE"; "it" -> "it-IT"; else -> "en-US"
    }
    fun voice(value: String, currentLanguage: String, currentLocale: String): Pair<String, String> {
        val resolvedLanguage = language(value)
        val explicitLocale = approvedLocales.firstOrNull { it.equals(value.replace('_', '-'), ignoreCase = true) }
        val selectedLocale = approvedLocales.firstOrNull { it.equals(currentLocale.replace('_', '-'), ignoreCase = true) && language(it) == resolvedLanguage }
        return resolvedLanguage to (explicitLocale ?: selectedLocale.takeIf { language(currentLanguage) == resolvedLanguage } ?: defaultLocale(value))
    }
}
