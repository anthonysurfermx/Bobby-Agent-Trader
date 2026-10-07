package xyz.bobbyprotocol.android.v18.harness

import org.json.JSONObject
import xyz.bobbyprotocol.android.v18.KeyValueStore
import java.io.File
import java.time.ZoneId
import java.time.ZonedDateTime

// What the harness suites share: the app's real words in its six languages, a store whose keys can
// be listed, and Wednesday 7 October 2026 in Mexico City (the day the iOS suites are written on).

/** The words as the session resolves them (`NucleoSession.text`), from the two catalogs the app ships. */
internal object HarnessWords {
    val languages = listOf("en", "es", "fr", "pt", "it", "de")
    private val locales = mapOf("en" to "en-US", "es" to "es-MX", "fr" to "fr-FR", "pt" to "pt-BR", "it" to "it-IT", "de" to "de-DE")
    private val android = JSONObject(File("src/main/assets/nucleo/native-android-translations.json").readText())
    private val original = JSONObject(File("src/main/assets/nucleo/native-translations.json").readText())

    private fun row(catalog: JSONObject, key: String, language: String): String? =
        (catalog.optJSONObject(key)?.opt(language) as? String)?.takeIf { it.isNotEmpty() }

    fun text(language: String, en: String, es: String): String = when (language) {
        "en" -> en
        "es" -> row(android, en, "es") ?: es
        else -> row(android, en, language) ?: row(original, en, language) ?: en
    }

    /** The catalog's own row for an English line in fr, pt, it or de, or null when no catalog has one. */
    fun translated(language: String, en: String): String? = row(android, en, language) ?: row(original, en, language)

    fun locale(language: String): String = locales.getValue(language)

    fun copy(language: String = "en"): HarnessCopy = HarnessCopy({ locale(language) }) { en, es -> text(language, en, es) }

    /** The copy of a language chosen later (a test that changes it mid-way). */
    fun copy(language: () -> String): HarnessCopy = HarnessCopy({ locale(language()) }) { en, es -> text(language(), en, es) }
}

/** A store a test can look into. */
internal class OpenStore : KeyValueStore {
    val values = LinkedHashMap<String, String>()
    override fun getString(key: String): String? = values[key]
    override fun putString(key: String, value: String) { values[key] = value }
    override fun remove(key: String) { values.remove(key) }
}

internal object HarnessDays {
    val mexico: ZoneId = ZoneId.of("America/Mexico_City")

    /** October 2026, local time. The 7th is a Wednesday. */
    fun at(day: Int, hour: Int, minute: Int = 0, zone: ZoneId = mexico): Long =
        ZonedDateTime.of(2026, 10, day, hour, minute, 0, 0, zone).toInstant().toEpochMilli()
}
