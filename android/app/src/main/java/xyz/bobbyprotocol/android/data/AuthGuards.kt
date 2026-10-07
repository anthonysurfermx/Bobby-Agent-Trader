package xyz.bobbyprotocol.android.data

import java.net.URI
import java.net.URLDecoder
import java.nio.charset.StandardCharsets
import java.security.MessageDigest
import java.security.SecureRandom
import java.util.Base64

/** Pure JVM guards also used before Android Uri parsing. Tokens in implicit fragments are rejected. */
object AuthGuards {
    const val CALLBACK = "bobby://auth/callback"
    const val ATTEMPT_MAX_AGE_MILLIS = 10 * 60 * 1000L

    fun randomToken(bytes: Int = 32): String = ByteArray(bytes).also { SecureRandom().nextBytes(it) }
        .let { Base64.getUrlEncoder().withoutPadding().encodeToString(it) }

    fun challenge(verifier: String): String = Base64.getUrlEncoder().withoutPadding()
        .encodeToString(MessageDigest.getInstance("SHA-256").digest(verifier.toByteArray(StandardCharsets.US_ASCII)))

    fun callbackParameters(raw: String, expectedState: String): Map<String, String>? {
        val uri = try { URI(raw) } catch (_: Exception) { return null }
        if (uri.scheme != "bobby" || uri.host != "auth" || uri.rawPath != "/callback" ||
            uri.port != -1 || uri.userInfo != null || uri.fragment != null) return null
        val values = linkedMapOf<String, String>()
        for (pair in (uri.rawQuery ?: return null).split('&')) {
            val pieces = pair.split('=', limit = 2)
            if (pieces.size != 2) return null
            val key = try { URLDecoder.decode(pieces[0], "UTF-8") } catch (_: Exception) { return null }
            val value = try { URLDecoder.decode(pieces[1], "UTF-8") } catch (_: Exception) { return null }
            if (values.put(key, value) != null) return null
        }
        if (!MessageDigest.isEqual(expectedState.toByteArray(), (values["state"] ?: "").toByteArray())) return null
        if (values.containsKey("access_token") || values.containsKey("refresh_token")) return null
        return values
    }

    fun validApiPath(path: String): Boolean {
        val route = path.substringBefore('?').removePrefix("/")
        return route.matches(Regex("api/[A-Za-z0-9_-]+(?:/[A-Za-z0-9_-]+)*")) &&
            !path.contains('#') && !path.contains('\\') && !path.contains('\n') && !path.contains('\r')
    }

    fun uuid(value: String): String? = value.takeIf {
        it.matches(Regex("[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}"))
    }?.lowercase()
}
