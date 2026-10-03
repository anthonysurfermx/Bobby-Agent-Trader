package xyz.bobbyprotocol.android.data

import java.util.Locale

/** One device preference, independent of account identity and dictation permissions. */
enum class VoicePreference(val value: String) {
    COMPANION("companion"), FEMALE("female"), MALE("male");

    fun requestVoice(companionPersona: String): String = if (this == COMPANION) companionPersona else value
    fun usesBundledClip(language: String): Boolean = this == COMPANION && language.substringBefore('-') in setOf("en", "es")

    companion object {
        fun parse(value: String?): VoicePreference = entries.firstOrNull { it.value == value } ?: COMPANION
    }
}

/** Android Voice has no gender field. Prefer explicit engine names, otherwise retain the local language voice. */
internal object VoicePreviewPolicy {
    data class Candidate(val name: String, val locale: String, val requiresNetwork: Boolean)
    fun choose(candidates: List<Candidate>, locale: String, preference: VoicePreference): String? {
        val wanted = Locale.forLanguageTag(locale)
        val languageVoices = candidates.filter { !it.requiresNetwork && Locale.forLanguageTag(it.locale).language == wanted.language }
        val exact = languageVoices.filter { Locale.forLanguageTag(it.locale).toLanguageTag().equals(wanted.toLanguageTag(), true) }
        val ordered = exact.sortedBy { it.name } + (languageVoices - exact.toSet()).sortedBy { it.name }
        if (preference != VoicePreference.COMPANION) {
            val explicit = Regex("(^|[-_ \t])" + if (preference == VoicePreference.FEMALE) "(female|feminine|woman)([-_ \t]|$)" else "(male|masculine|man)([-_ \t]|$)", RegexOption.IGNORE_CASE)
            ordered.firstOrNull { explicit.containsMatchIn(it.name) }?.let { return it.name }
        }
        return ordered.firstOrNull()?.name
    }
}

/** The same guard is checked before fetching and before starting each audio segment. */
internal object NativeNarrationPolicy {
    fun allowed(muted: Boolean, processingAllowed: Boolean, ownerCurrent: Boolean): Boolean =
        !muted && processingAllowed && ownerCurrent
}
