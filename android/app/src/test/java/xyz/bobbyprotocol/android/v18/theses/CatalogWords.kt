package xyz.bobbyprotocol.android.v18.theses

import org.json.JSONObject
import xyz.bobbyprotocol.android.v18.V18Text
import java.io.File

/**
 * The app's words in any of its six languages, for unit tests: the lookup `NucleoSession.text`
 * does, over the two catalogs the app ships (read from the source tree, so a test sees exactly the
 * rows a phone gets). Change `language` to run the same assertions in another language.
 */
class CatalogWords(var language: String = "en") : HostWords {
    override fun text(en: String, es: String, vararg args: Any?): String = V18Text.fill(lookup(en, es), *args)

    override val locale: String
        get() = when (language) {
            "es" -> "es-MX"
            "fr" -> "fr-FR"
            "pt" -> "pt-PT"
            "it" -> "it-IT"
            "de" -> "de-DE"
            else -> "en-US"
        }

    private fun lookup(en: String, es: String): String = when (language) {
        "en" -> en
        "es" -> row(android, en, "es") ?: es
        else -> row(android, en, language) ?: row(ios, en, language) ?: en
    }

    /** True when the catalogs hold this English key for `language` (English and Spanish are written at the call site). */
    fun translates(en: String): Boolean = language == "en" || language == "es" || row(android, en, language) != null || row(ios, en, language) != null

    /** Runs `body` once per language, then goes back to English. */
    fun inEveryLanguage(body: (String) -> Unit) {
        for (each in LANGUAGES) {
            language = each
            body(each)
        }
        language = "en"
    }

    companion object {
        val LANGUAGES: List<String> = listOf("en", "es", "fr", "pt", "it", "de")

        private val android: JSONObject by lazy { load("native-android-translations.json") }
        private val ios: JSONObject by lazy { load("native-translations.json") }

        private fun row(catalog: JSONObject, key: String, language: String): String? {
            val entry = catalog.optJSONObject(key) ?: return null
            return (entry.opt(language) as? String)?.takeIf { it.isNotEmpty() }
        }

        private fun load(name: String): JSONObject {
            // Gradle runs unit tests from the module (android/app); an IDE may run them from higher up.
            val folders = listOf("src/main/assets/nucleo", "app/src/main/assets/nucleo", "android/app/src/main/assets/nucleo")
            val file = folders.map { File(it, name) }.firstOrNull { it.isFile }
                ?: throw IllegalStateException("Catalog $name not found from " + File(".").absolutePath)
            return JSONObject(file.readText(Charsets.UTF_8))
        }
    }
}
