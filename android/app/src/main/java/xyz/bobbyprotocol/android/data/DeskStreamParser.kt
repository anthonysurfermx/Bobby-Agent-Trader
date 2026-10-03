package xyz.bobbyprotocol.android.data

import org.json.JSONObject

/** Accepts the production NDJSON stream and SSE envelopes without interpreting provider prose. */
class DeskStreamParser(private val isSse: Boolean = false) {
    private val pendingData = StringBuilder()

    fun line(raw: String): JSONObject? {
        if (raw.length > MAX_LINE_CHARACTERS) throw ApiException(502, "stream_event_too_large")
        if (!isSse) return parse(raw.trim())
        if (raw.isEmpty()) {
            val value = pendingData.toString()
            pendingData.setLength(0)
            return parse(value)
        }
        if (raw.startsWith("data:")) {
            if (pendingData.isNotEmpty()) pendingData.append('\n')
            pendingData.append(raw.removePrefix("data:").removePrefix(" "))
            if (pendingData.length > MAX_LINE_CHARACTERS) throw ApiException(502, "stream_event_too_large")
        }
        return null
    }

    fun finish(): JSONObject? = if (pendingData.isEmpty()) null else line("")

    private fun parse(text: String): JSONObject? {
        if (text.isBlank() || text == "[DONE]" || text.startsWith(':')) return null
        return try { JSONObject(text).takeIf { it.stringOrNull("type") != null } } catch (_: Exception) { null }
    }

    companion object { const val MAX_LINE_CHARACTERS = 256 * 1024 }
}
