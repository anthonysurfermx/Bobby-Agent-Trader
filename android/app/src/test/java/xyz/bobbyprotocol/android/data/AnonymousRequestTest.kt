package xyz.bobbyprotocol.android.data

import okhttp3.HttpUrl.Companion.toHttpUrl
import okio.Buffer
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The one request Bobby makes without a tap: the price of an asset the person asked about, read to
 * draw the number on the glass and on the week's board. ios/Bobby/V18-DESIGN.md: "The request
 * carries the symbol and nothing else (no account, no device, nothing more of the ledger)".
 * `BobbyRepository.quote` builds it here; HarnessSurfaceTest checks that it does, and that the
 * harness reaches the price through `quote` and nothing else.
 */
class AnonymousRequestTest {
    private val base = "https://bobbyprotocol.xyz/".toHttpUrl()
    private val body = JSONObject().put("tool", "get_market").put("args", JSONObject().put("symbol", "NVDA"))

    @Test fun thePriceReadWithoutATapNamesNeitherTheAccountNorTheDevice() {
        val request = AnonymousRequest.post(base, "api/voice-tool", body)
        assertEquals("POST", request.method)
        assertEquals("https://bobbyprotocol.xyz/api/voice-tool", request.url.toString())
        val sent = request.headers.names().map { it.lowercase() }.toSet()
        assertEquals("where it goes and how the answer may come, and nothing else", AnonymousRequest.HEADERS, sent)
        for (identity in listOf("Authorization", "x-bobby-device", "x-bobby-platform", "x-bobby-memory-opt-in", "Cookie")) {
            assertNull("$identity says who is asking", request.header(identity))
        }
        assertEquals("https://bobbyprotocol.xyz", request.header("Origin"))
        assertEquals("no-store", request.header("Cache-Control"))
        // The body is the symbol and the name of the tool.
        val written = Buffer().also { request.body!!.writeTo(it) }.readUtf8()
        val read = JSONObject(written)
        assertEquals(setOf("tool", "args"), read.keys().asSequence().toSet())
        assertEquals("get_market", read.getString("tool"))
        assertEquals(setOf("symbol"), read.getJSONObject("args").keys().asSequence().toSet())
        assertEquals("NVDA", read.getJSONObject("args").getString("symbol"))
        assertFalse("nothing that looks like a token or an id travels in it", Regex("[0-9a-f]{8}-[0-9a-f]{4}|Bearer|eyJ").containsMatchIn(written))
    }

    @Test fun onlyBobbysOwnApiIsAsked() {
        for (path in listOf("https://example.com/api/voice-tool", "//example.com/api/voice-tool", "api/../secrets", "voice-tool", "api/voice-tool#x")) {
            val refused = try {
                AnonymousRequest.post(base, path, body)
                false
            } catch (_: IllegalArgumentException) {
                true
            } catch (_: IllegalStateException) {
                true
            }
            assertTrue("$path must be refused", refused)
        }
        assertEquals("/api/voice-tool", AnonymousRequest.post(base, "/api/voice-tool", body).url.encodedPath)
    }
}
