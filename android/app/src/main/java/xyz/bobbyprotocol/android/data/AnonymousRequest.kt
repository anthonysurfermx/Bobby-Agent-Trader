package xyz.bobbyprotocol.android.data

import okhttp3.HttpUrl
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject

/**
 * A request to Bobby's API that says nothing about who sends it: no account (no bearer), no device
 * (no installation id), no platform. Only where it goes, what it asks and how the answer may come.
 *
 * It exists for the one request Bobby makes without a tap: the price of an asset the person asked
 * about, read to draw "NVDA +2.3% since you asked" on the glass and the rows of the week's board
 * (`BobbyRepository.quote`). ios/Bobby/V18-DESIGN.md: "The request carries the symbol and nothing
 * else (no account, no device, nothing more of the ledger)". Every other request goes through the
 * repository's own builder, which names the installation and, signed in, the account.
 *
 * Pure (no Android classes), so the headers are a unit test.
 */
internal object AnonymousRequest {
    private val JSON = "application/json; charset=utf-8".toMediaType()

    /** Every header such a request sets, lowercase. The body's own type travels with the body. */
    val HEADERS: Set<String> = setOf("origin", "cache-control", "accept")

    fun post(base: HttpUrl, path: String, body: JSONObject): Request {
        require(AuthGuards.validApiPath(path)) { "Only relative Bobby API routes are allowed" }
        val url = base.resolve("/" + path.removePrefix("/")) ?: throw IllegalArgumentException("Invalid API path")
        check(url.host == base.host && url.isHttps && url.port == base.port)
        return Request.Builder().url(url)
            .header("Origin", base.newBuilder().encodedPath("/").query(null).build().toString().trimEnd('/'))
            .header("Cache-Control", "no-store").header("Accept", "application/json")
            .post(body.toString().toRequestBody(JSON)).build()
    }
}
