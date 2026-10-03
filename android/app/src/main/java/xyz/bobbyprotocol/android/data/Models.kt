package xyz.bobbyprotocol.android.data

import org.json.JSONArray
import org.json.JSONObject
import java.util.Locale

/** Public identity only. Bearer and refresh tokens never reach UI state or the web bridge. */
data class AccountSession(
    val userId: String,
    val displayName: String?,
    val provider: String?,
    val expiresAt: Long,
)

data class MarketSnapshot(
    val symbol: String,
    val name: String? = null,
    val isEquity: Boolean = false,
    val price: Double? = null,
    val changePct: Double? = null,
)

data class AssetResolution(
    val snapshot: MarketSnapshot,
    val needsConfirmation: Boolean,
    val confirmName: String,
    val proxyNote: String? = null,
)

data class Candle(
    val timestampMillis: Long,
    val open: Double,
    val high: Double,
    val low: Double,
    val close: Double,
    val volume: Double,
)

enum class MarketTimeframe(val label: String, val cryptoBar: String, val equityRange: String, val equityInterval: String) {
    FIFTEEN_MINUTES("15M", "15m", "7d", "15m"),
    ONE_HOUR("1H", "1H", "7d", "1h"),
    FOUR_HOURS("4H", "4H", "30d", "1d"),
    ONE_DAY("1D", "1D", "90d", "1d"),
}

class ApiException(
    val status: Int,
    val code: String? = null,
    val payload: JSONObject? = null,
    val retryAfterSeconds: Double? = null,
) : Exception("Bobby API request failed ($status${code?.let { ": $it" } ?: ""})")

class AccountChangedException : Exception("The active account changed")
class SessionUnavailableException : Exception("A current session is unavailable")
class AuthConfigurationException : Exception("Google sign-in is not configured for this build")

data class AudioReply(val bytes: ByteArray, val mediaType: String, val provider: String?) {
    override fun toString(): String = "AudioReply(size=${bytes.size}, mediaType=$mediaType)"
}

object BobbyParsers {
    const val MAX_QUESTION_CODE_POINTS = 1200

    fun questionLength(question: String): Int = question.trim().let { it.codePointCount(0, it.length) }

    fun resolution(json: JSONObject): AssetResolution? {
        // A current server returning resolution:null means that no asset was named. Never guess a ticker.
        val resolution = json.optJSONObject("resolution") ?: return null
        val resolved = json.optJSONObject("resolved") ?: return null
        val symbol = resolved.stringOrNull("baseSymbol") ?: resolved.stringOrNull("symbol") ?: return null
        val aliases = resolved.optJSONArray("aliases")
        val alias = (0 until (aliases?.length() ?: 0)).mapNotNull { aliases?.optString(it)?.takeIf(String::isNotBlank) }
            .firstOrNull { it != symbol }
        return AssetResolution(
            snapshot = MarketSnapshot(symbol, resolved.stringOrNull("displayName"), resolved.optString("assetClass") == "equity"),
            needsConfirmation = resolution.optBoolean("needsConfirmation", false),
            confirmName = prettyName(alias ?: symbol, symbol),
            proxyNote = resolution.stringOrNull("proxyNote"),
        )
    }

    fun candles(json: JSONObject): List<Candle> {
        val rows = json.optJSONArray("candles") ?: json.optJSONArray("data") ?: return emptyList()
        return (0 until rows.length()).mapNotNull { index ->
            val row = rows.optJSONObject(index) ?: return@mapNotNull null
            val timestamp = row.numberOrNull("ts") ?: return@mapNotNull null
            val open = row.numberOrNull("open") ?: return@mapNotNull null
            val high = row.numberOrNull("high") ?: return@mapNotNull null
            val low = row.numberOrNull("low") ?: return@mapNotNull null
            val close = row.numberOrNull("close") ?: return@mapNotNull null
            if (timestamp <= 0 || high < low || open <= 0 || close <= 0) return@mapNotNull null
            Candle(timestamp.toLong(), open, high, low, close, row.numberOrNull("volume")?.coerceAtLeast(0.0) ?: 0.0)
        }.distinctBy { it.timestampMillis }.sortedBy { it.timestampMillis }
    }

    /** A partial response, an error or a global regime string is never a disciplined NO TRADE. */
    fun validDeskAnswer(json: JSONObject): Boolean {
        if (json.has("error") && !json.isNull("error")) return false
        val agents = json.optJSONObject("agents") ?: return false
        return listOf("alpha", "red", "cio").all { agents.stringOrNull(it) != null } &&
            agents.optString("verdict") in setOf("wait", "review")
    }

    fun prettyName(raw: String, symbol: String): String {
        if (raw.isBlank() || raw == symbol) return symbol
        if (raw.any { it.isDigit() || it == '&' }) return raw
        return raw.lowercase(Locale.ROOT).split(' ').filter(String::isNotBlank)
            .joinToString(" ") { it.replaceFirstChar(Char::titlecase) }
    }

    fun machineCode(json: JSONObject?): String? = listOf("code", "errorCode", "error")
        .firstNotNullOfOrNull { json?.stringOrNull(it)?.takeIf { code -> code.matches(Regex("[a-z][a-z0-9_]{0,80}")) } }
}

internal fun JSONObject.stringOrNull(key: String): String? = (opt(key) as? String)?.takeIf { it.isNotBlank() }

internal fun JSONObject.numberOrNull(key: String): Double? = when (val value = opt(key)) {
    is Number -> value.toDouble()
    is String -> value.toDoubleOrNull()
    else -> null
}?.takeIf(Double::isFinite)

internal fun JSONArray.objects(): List<JSONObject> = (0 until length()).mapNotNull(::optJSONObject)
