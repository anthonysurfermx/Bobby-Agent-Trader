package xyz.bobbyprotocol.android.ui

import org.json.JSONObject

/** Explicit user-written reports only; no account, question, read-model or device identifiers. */
internal object ReportContentPolicy {
    const val MAX_MESSAGE = 2000
    val reasons = listOf("offensive", "misleading", "other")

    fun valid(message: String, reason: String): Boolean {
        val trimmed = message.trim()
        return reason in reasons && trimmed.length <= MAX_MESSAGE &&
            trimmed.codePointCount(0, trimmed.length) >= 3
    }

    fun payload(message: String, reason: String, language: String, version: String): JSONObject {
        require(valid(message, reason))
        require(language in setOf("en", "es", "fr", "pt", "it", "de"))
        return JSONObject().put("type", "general").put("page", "android:ai-content")
            .put("message", message.trim())
            .put("context", JSONObject().put("kind", "ai_content_report").put("reason", reason)
                .put("language", language).put("platform", "android").put("version", version))
    }

    /** HTTP 200 alone, truthy strings and partial acknowledgements are not saved reports. */
    fun saved(status: Int, body: JSONObject?): Boolean =
        status in 200..299 && body?.opt("ok") == true && body.opt("saved") == true
}
