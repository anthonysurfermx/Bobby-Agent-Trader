package xyz.bobbyprotocol.android.data

import org.json.JSONArray
import org.json.JSONObject

/** Canonical LIVE settings contract; versions are read from options, never inferred from the response field. */
object BriefingSettingsPolicy {
    val languages = listOf("en", "es", "fr", "pt", "it", "de")
    private val locales = setOf("en-US", "en-GB", "en-AU", "en-CA", "en-IE", "es-MX", "es-ES", "es-US",
        "fr-FR", "pt-PT", "pt-BR", "it-IT", "de-DE")
    private val fields = setOf("openingEnabled", "closeEnabled", "weeklyEnabled", "language", "locale", "companionId", "assets",
        "analysisConsentEnabled", "acceptedAnalysisConsentVersion", "audioConsentEnabled", "acceptedAudioConsentVersion")

    fun consentChange(kind: String, enabled: Boolean, options: JSONObject?, riskAccepted: Boolean): JSONObject {
        require(kind in setOf("analysis", "audio"))
        if (enabled && !riskAccepted) throw ApiException(403, "consent_required")
        val body = JSONObject().put("${kind}ConsentEnabled", enabled)
        if (enabled) {
            val version = options?.optJSONObject("consentVersions")?.opt(kind)
            if (version !is Int || version !in 1..1000) throw ApiException(502, "invalid_briefing_options")
            body.put(if (kind == "analysis") "acceptedAnalysisConsentVersion" else "acceptedAudioConsentVersion", version)
        }
        return validate(body)
    }

    /** Keep a saved report region when changing assets or voice; the app's language does not select it. */
    fun reportLocale(settings: JSONObject, language: String): String {
        if (language !in languages) throw ApiException(400, "invalid_briefing_language")
        val savedLanguage = settings.optString("language")
        if (savedLanguage == language || savedLanguage == "pt-BR" && language == "pt") {
            if (settings.has("locale")) {
                val savedLocale = settings.opt("locale") as? String
                if (savedLocale == null || !validLocale(savedLocale, language)) throw ApiException(400, "invalid_briefing_locale")
                return savedLocale
            }
            if (savedLanguage == "pt-BR") return "pt-BR"
        }
        return BobbyLocales.defaultLocale(language)
    }

    fun preferences(settings: JSONObject, assets: List<String>, language: String, companionId: String?, locale: String? = null): JSONObject {
        val options = settings.optJSONObject("options") ?: throw ApiException(502, "invalid_briefing_options")
        val allowedAssets = strings(options.optJSONArray("assets"))
        if (assets.size > 6 || assets.distinct().size != assets.size || assets.any { it !in allowedAssets }) {
            throw ApiException(400, "invalid_briefing_assets")
        }
        val body = JSONObject().put("assets", JSONArray(assets)).put("language", language)
            .put("locale", locale ?: reportLocale(settings, language))
        if (companionId != null) {
            if (companionId !in strings(options.optJSONArray("companions"))) throw ApiException(400, "invalid_briefing_companion")
            body.put("companionId", companionId)
        }
        return validate(body)
    }

    fun validate(changes: JSONObject): JSONObject {
        val keys = changes.keys().asSequence().toSet()
        if (keys.isEmpty() || !fields.containsAll(keys)) throw ApiException(400, "invalid_briefing_settings")
        for (key in keys.filter { it.endsWith("Enabled") }) {
            if (changes.opt(key) !is Boolean) throw ApiException(400, "invalid_briefing_settings")
        }
        if (changes.opt("openingEnabled") == true || changes.opt("closeEnabled") == true) throw ApiException(400, "invalid_briefing_settings")
        for (kind in listOf("analysis", "audio")) {
            val accepted = if (kind == "analysis") "acceptedAnalysisConsentVersion" else "acceptedAudioConsentVersion"
            val version = changes.opt(accepted)
            val enabled = changes.opt("${kind}ConsentEnabled")
            if ((enabled == false && changes.has(accepted)) || (enabled == true && !changes.has(accepted)) ||
                (changes.has(accepted) && (version !is Int || version !in 1..1000))) throw ApiException(400, "invalid_briefing_settings")
        }
        if (changes.has("language") && changes.opt("language") !in languages) throw ApiException(400, "invalid_briefing_language")
        if (changes.has("locale")) {
            val language = changes.opt("language") as? String
            val locale = changes.opt("locale") as? String
            if (language == null || locale == null || !validLocale(locale, language)) throw ApiException(400, "invalid_briefing_locale")
        }
        if (changes.has("companionId") && changes.opt("companionId") !is String) throw ApiException(400, "invalid_briefing_companion")
        if (changes.has("assets")) {
            val assets = changes.optJSONArray("assets") ?: throw ApiException(400, "invalid_briefing_assets")
            val values = (0 until assets.length()).map { assets.opt(it) }
            if (values.size > 6 || values.distinct().size != values.size || values.any { it !is String || !it.matches(Regex("[A-Z0-9.-]{1,12}")) }) {
                throw ApiException(400, "invalid_briefing_assets")
            }
        }
        return JSONObject(changes.toString())
    }

    private fun strings(array: JSONArray?): Set<String> = (0 until (array?.length() ?: 0))
        .mapNotNull { array?.opt(it) as? String }.toSet()

    private fun validLocale(locale: String, language: String): Boolean = locale in locales && locale.startsWith("$language-")
}
