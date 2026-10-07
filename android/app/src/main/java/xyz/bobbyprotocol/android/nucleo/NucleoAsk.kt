package xyz.bobbyprotocol.android.nucleo

import org.json.JSONObject
import xyz.bobbyprotocol.android.v18.ReadOrigin

// What the page may ask, who wrote the words, and the next question Bobby's CIO writes on every
// read. The rules are the iPhone's (ios/Bobby/Nucleo/ARCHITECTURE.md §3.5, NucleoDesk.swift); the
// session only carries them out. Nothing here keeps a question's words.

/**
 * The next question: `synthesis.followUp` in the desk reply. Native carries it to the page, which
 * decides whether it is shown, and tells a tap on it from the person's own words.
 */
internal object NextQuestion {
    /** The server bounds it at 160 characters. A longer one is not a question the page could show: it is dropped whole, never cut. */
    const val LIMIT = 160

    /** The question as it may travel: text, trimmed, not empty, `LIMIT` code points at most. Anything else is null. */
    fun usable(value: Any?): String? {
        val text = (value as? String)?.trim() ?: return null
        if (text.isEmpty() || text.codePointCount(0, text.length) > LIMIT) return null
        return text
    }

    /** Two wordings of one question differ only in their spaces (the page collapses them before it shows or asks it). */
    fun same(a: String, b: String): Boolean = words(a) == words(b)

    private fun words(text: String): List<String> = text.split(Regex("[\\s\\p{Z}]+")).filter { it.isNotEmpty() }

    /** The question the page received with this read, if any. */
    fun offered(read: JSONObject): String? = read.optJSONObject("synthesis")?.opt("followUp") as? String
}

/**
 * The params of `ask`: exactly one of `{question, chip?}` · `{token}` · `{followUpOf, question}`.
 * `chip: true` marks a plain question whose words Bobby wrote and the person only tapped (an asset
 * of the idle home, an asset or a mover of the row after a read, an example of the first question);
 * a boolean, and never with a token or a `followUpOf`.
 */
internal sealed class AskRequest {
    data class Question(val question: String, val chip: Boolean) : AskRequest()
    data class Token(val token: String) : AskRequest()
    data class FollowUp(val previous: String, val question: String) : AskRequest()

    companion object {
        fun parse(params: JSONObject): AskRequest {
            val chip = when {
                !params.has("chip") -> false
                else -> params.opt("chip") as? Boolean ?: throw NucleoFault("invalid_params", "chip must be boolean")
            }
            if (params.has("token")) {
                if (params.has("question") || params.has("followUpOf")) throw NucleoFault("invalid_params", "token takes no question")
                if (params.has("chip")) throw NucleoFault("invalid_params", "chip marks a plain question")
                return Token(text(params, "token", 128))
            }
            if (params.has("followUpOf") && params.has("chip")) throw NucleoFault("invalid_params", "chip marks a plain question")
            val question = text(params, "question", 16_384).trim()
            if (question.isEmpty()) throw NucleoFault("invalid_params", "question is empty")
            return if (params.has("followUpOf")) FollowUp(text(params, "followUpOf", 36), question) else Question(question, chip)
        }

        private fun text(params: JSONObject, key: String, maxLength: Int): String {
            val value = params.opt(key) as? String ?: throw NucleoFault("invalid_params", "$key must be a string")
            if (value.length > maxLength) throw NucleoFault("invalid_params", "$key is too long")
            return value
        }
    }
}

/** Who started a read, and the level it runs at. */
internal data class AskStart(val origin: ReadOrigin, val level: String, val picked: Boolean = false) {
    companion object {
        /** The level a read Bobby started runs at, whatever level is saved: the question was Bobby's, so it never spends, or runs out of, a level the person rations. */
        const val QUICK = "rapido"

        /**
         * A plain question. Typed or spoken it is the person's own; from a chip the person picked
         * the asset and Bobby wrote the words. A chip keeps the level they saved.
         */
        fun question(chip: Boolean, savedLevel: String) = AskStart(if (chip) ReadOrigin.CHIP else ReadOrigin.PERSON, savedLevel)

        /**
         * A second question about the read on screen. `offered` is the next question that read
         * handed the page (null when it had none). The same words: the person picked Bobby's
         * question instead of typing their own, so Bobby started this read and it runs at Quick.
         * Any other words are their own.
         */
        fun followUp(offered: String?, question: String, savedLevel: String): AskStart =
            if (offered != null && NextQuestion.same(offered, question)) AskStart(ReadOrigin.FOLLOW_UP, QUICK, picked = true)
            else AskStart(ReadOrigin.THREAD, savedLevel)

        /** A question native wrote on the person's tap about an asset it already knows (a follow-up's button, a board row). */
        fun native() = AskStart(ReadOrigin.FOLLOW_UP, QUICK)
    }
}
