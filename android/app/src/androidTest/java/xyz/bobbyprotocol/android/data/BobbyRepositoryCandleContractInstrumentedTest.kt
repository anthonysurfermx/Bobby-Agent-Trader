package xyz.bobbyprotocol.android.data

import android.os.Build
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import kotlinx.coroutines.runBlocking
import okhttp3.HttpUrl.Companion.toHttpUrl
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Protocol
import okhttp3.Request
import okhttp3.Response
import okhttp3.ResponseBody.Companion.toResponseBody
import org.junit.Assert.*
import org.junit.Assume.assumeTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import xyz.bobbyprotocol.android.BuildConfig
import java.util.concurrent.CopyOnWriteArrayList

/** Emulator-only request inspection. Every call is refused before DNS; no market data or preferences are injected. */
@RunWith(AndroidJUnit4::class)
class BobbyRepositoryCandleContractInstrumentedTest {
    private lateinit var repository: BobbyRepository
    private val requests = CopyOnWriteArrayList<Request>()

    @Before fun setUp() {
        val emulator = Build.FINGERPRINT.startsWith("generic") || Build.FINGERPRINT.contains("emulator") ||
            Build.MODEL.contains("Emulator") || Build.MODEL.contains("sdk_gphone") || Build.HARDWARE in setOf("ranchu", "goldfish")
        assumeTrue("Request inspection must not touch a physical installation", emulator)
        repository = BobbyRepository(InstrumentationRegistry.getInstrumentation().targetContext)
        assumeTrue("Request inspection preserves signed-in installations", repository.session.value == null)
        val refusalClient = OkHttpClient.Builder().addInterceptor { chain ->
            val request = chain.request()
            requests.add(request)
            Response.Builder().request(request).protocol(Protocol.HTTP_1_1).code(503).message("Local request inspection refused")
                .body("{\"error\":\"Local request inspection refused\"}".toResponseBody("application/json".toMediaType())).build()
        }.build()
        // Match the existing isolated Activity acceptance interceptor without changing production transport.
        BobbyRepository::class.java.getDeclaredField("client").apply { isAccessible = true }.set(repository, refusalClient)
    }

    @Test fun equityEvidenceUsesTheBackendMonthlyKeyWithHourlyCandlesAndEncodedListing() = runBlocking {
        val symbols = listOf("SAP.DE", "SAP.DE&range=7d&interval=1d#https://other.invalid")
        for (symbol in symbols) {
            refuseEvidence(symbol, true)
            val request = requests.last()
            assertApprovedRequest(request, "/api/stock-candles")
            assertEquals(symbol, request.url.queryParameter("symbol"))
            assertEquals("30d", request.url.queryParameter("range"))
            assertEquals("1h", request.url.queryParameter("interval"))
            assertEquals(setOf("symbol", "range", "interval"), request.url.queryParameterNames)
            assertEquals(1, request.url.queryParameterValues("range").size)
        }
        assertEquals(symbols.size, requests.size)
    }

    @Test fun cryptoEvidenceRetainsOneHundredHourlyCandlesWithoutEquityParameters() = runBlocking {
        refuseEvidence("BTC", false)
        val request = requests.single()
        assertApprovedRequest(request, "/api/okx-candles")
        assertEquals("BTC-USDT", request.url.queryParameter("instId"))
        assertEquals("1H", request.url.queryParameter("bar"))
        assertEquals("100", request.url.queryParameter("limit"))
        assertEquals(setOf("instId", "bar", "limit"), request.url.queryParameterNames)
    }

    private suspend fun refuseEvidence(symbol: String, isEquity: Boolean) {
        try {
            repository.readCandleEvidence(symbol, isEquity)
            fail("The isolated interceptor must refuse every request")
        } catch (error: ApiException) {
            assertEquals(503, error.status)
        }
    }

    private fun assertApprovedRequest(request: Request, path: String) {
        val origin = BuildConfig.API_BASE_URL.toHttpUrl()
        assertEquals("GET", request.method)
        assertTrue(request.url.isHttps)
        assertEquals(origin.host, request.url.host)
        assertEquals(origin.port, request.url.port)
        assertEquals(path, request.url.encodedPath)
        assertNull(request.url.fragment)
        assertNull(request.header("Authorization"))
        assertEquals("android", request.header("x-bobby-platform"))
    }
}
