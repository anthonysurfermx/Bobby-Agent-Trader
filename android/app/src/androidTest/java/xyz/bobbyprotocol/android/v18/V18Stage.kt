package xyz.bobbyprotocol.android.v18

import android.content.Context
import android.os.ParcelFileDescriptor
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.test.platform.app.InstrumentationRegistry
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Protocol
import okhttp3.Response
import okhttp3.ResponseBody.Companion.toResponseBody
import okio.Buffer
import org.json.JSONObject
import xyz.bobbyprotocol.android.data.BobbyRepository
import xyz.bobbyprotocol.android.ui.v18.V18Sheets
import xyz.bobbyprotocol.android.v18.memory.FakeMemoryGateway
import xyz.bobbyprotocol.android.v18.memory.MemoryCenter
import java.time.ZoneId
import java.time.ZonedDateTime
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.CopyOnWriteArrayList

// The 1.8 screens on a real Android screen, for the instrumented tests.
//
// What is real: the composables (ui/v18), the sheet around them (V18Sheets), the host (V18Runtime),
// every centre and model behind a screen, the repository and its parsers, and the two catalogs the
// app ships its words in. What is not: the session and the activity (the bench of V18TestKit, in
// memory), the account (a name, no sign-in), and the network: the repository's transport is
// replaced by `StageNetwork`, which answers each route with a body written in V18Fixtures and
// refuses everything else. Nothing leaves the emulator and nothing of a real person is used.

/** The network of a staged screen: one answer per route, written by the test; every other request is refused. */
class StageNetwork {
    class Call(val method: String, val path: String, val body: String?)
    class Reply(val status: Int, val body: String, val type: String = "application/json")

    /** Every request the app made, oldest first. */
    val calls = CopyOnWriteArrayList<Call>()
    private val routes = ConcurrentHashMap<String, (Call) -> Reply>()

    private val client: OkHttpClient = OkHttpClient.Builder().addInterceptor { chain ->
        val request = chain.request()
        val sent = request.body?.let { body -> Buffer().also { body.writeTo(it) }.readUtf8() }
        val call = Call(request.method, request.url.encodedPath, sent)
        calls.add(call)
        val reply = routes[call.method + " " + call.path]?.invoke(call) ?: Reply(503, "{\"error\":\"The staged network has no answer for this request\"}")
        Response.Builder().request(request).protocol(Protocol.HTTP_1_1).code(reply.status)
            .message(if (reply.status in 200..299) "OK" else "Refused")
            // The repository tells a stream from a plain reply by this header, as with a real server.
            .header("Content-Type", reply.type)
            .body(reply.body.toResponseBody(reply.type.toMediaType())).build()
    }.build()

    /** `path` as the server sees it (`/api/bobby-access`). */
    fun answer(method: String, path: String, reply: (Call) -> Reply) {
        routes[method + " " + path] = reply
    }

    fun answer(method: String, path: String, body: JSONObject, status: Int = 200) = answer(method, path) { Reply(status, body.toString()) }

    /** The route is refused again (503), as when Bobby's servers cannot be reached. */
    fun forget(method: String, path: String) {
        routes.remove(method + " " + path)
    }

    fun paths(method: String): List<String> = calls.filter { it.method == method }.map { it.path }

    /**
     * The repository keeps its transport to itself. An instrumented test hands it this one, the way
     * MainActivityAcceptanceInstrumentedTest refuses the network: no request can leave the emulator.
     */
    fun attach(repository: BobbyRepository) {
        BobbyRepository::class.java.getDeclaredField("client").apply { isAccessible = true }.set(repository, client)
    }
}

/** The app's own lookup (`NucleoSession.text`) over the two catalogs it ships, for any of its six languages. */
class CatalogWords(context: Context) {
    private val android = read(context, "native-android-translations.json")
    private val original = read(context, "native-translations.json")

    fun text(language: String, en: String, es: String): String = when (language) {
        "en" -> en
        "es" -> row(android, en, "es") ?: es
        else -> row(android, en, language) ?: row(original, en, language) ?: en
    }

    private fun row(catalog: JSONObject, key: String, language: String): String? {
        val entry = catalog.optJSONObject(key) ?: return null
        if (entry.isNull(language)) return null
        return (entry.opt(language) as? String)?.takeIf { it.isNotEmpty() }
    }

    private fun read(context: Context, name: String): JSONObject =
        context.assets.open("nucleo/$name").bufferedReader().use { JSONObject(it.readText()) }
}

/**
 * One reader, one language, one moment. Build it and call everything on it on the main thread
 * (the host is a main-thread object in the app too).
 */
class V18Stage(context: Context, val language: String = "en", owner: String? = ACCOUNT, risk: RiskNotice = RiskNotice.ACCEPTED) {
    val network = StageNetwork()
    val repository: BobbyRepository = BobbyRepository(context.applicationContext).also {
        network.attach(it)
        // The risk notice on this stage is the desk's; the transport follows it.
        it.allowsExternalProcessing = { desk.riskNotice == RiskNotice.ACCEPTED }
    }
    private val words = CatalogWords(context)
    val desk: FakeDesk = FakeDesk(words = { spoken, en, es -> words.text(spoken, en, es) }, network = repository).also {
        it.language = language
        it.locale = LOCALES[language] ?: "en-US"
        it.owner = owner
        it.riskNotice = risk
    }
    val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    val bench = V18TestBench(scope, desk = desk)
    val host: V18Runtime get() = bench.host
    /** /api/memory for the staged account (the repository has no account of its own to ask for). */
    val memory = FakeMemoryGateway { desk.owner }

    /** The sheet on screen, as the activity's `route`. */
    var route by mutableStateOf<String?>(null)
        private set

    init {
        bench.clock = NOW
        bench.shell.onSheetChanged = { route = it }
    }

    /**
     * What MainActivity does once its screen is attached: every feature registers on the host.
     * Call it after the network's answers are in place, because some features ask at once.
     */
    fun start() {
        host.service(MemoryCenter.SERVICE) { MemoryCenter(host, memory) }
        V18.registerNudges(host)
    }

    fun present(sheet: String) {
        check(host.present(sheet)) { "The sheet $sheet could not open over ${host.sheetRoute}" }
    }

    fun close() {
        host.close()
        scope.cancel()
    }

    companion object {
        /** A name, not an account: nothing signs in. */
        const val ACCOUNT = "stage-reader"
        private val LOCALES = mapOf("en" to "en-US", "es" to "es-MX", "fr" to "fr-FR", "pt" to "pt-BR", "it" to "it-IT", "de" to "de-DE")
        /** Wednesday 7 October 2026 at noon on the phone's own clock: the day the iOS suites are written on. */
        val NOW: Long = at(2026, 10, 7, 12)

        fun at(year: Int, month: Int, day: Int, hour: Int = 12, minute: Int = 0): Long =
            ZonedDateTime.of(year, month, day, hour, minute, 0, 0, ZoneId.systemDefault()).toInstant().toEpochMilli()
    }
}

/**
 * The activity's screen around a staged sheet: the same theme MainActivity sets (its primary colour
 * is mint, so a default Material control would show green here exactly as it would in the app) and
 * the dark glass behind the sheet. A sheet is a window of its own and takes its font size from the
 * system, not from here: a test that wants large type changes the system's setting.
 */
@Composable
fun StageScreen(stage: V18Stage) {
    MaterialTheme(colorScheme = darkColorScheme(primary = Color(0xFF3FE0B5), background = Color(0xFF050505), surface = Color(0xFF111419), onSurface = Color(0xFFF2EDE4))) {
        Surface(modifier = Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
            Box(Modifier.fillMaxSize().background(Color(0xFF050505)))
            val current = stage.route
            // A 1.8 sheet may hand over to a 1.1.4 one (the paywall, a code): those are not staged.
            if (current != null && V18Sheets.draws(current)) {
                key(current) { V18Sheets.Sheet(current, stage.host, onClose = { stage.bench.closeSheet() }) }
            }
        }
    }
}

/** Screenshots of the whole display, system windows included, kept on the device for CI to collect. */
object V18Shots {
    /** The shell may write here and the folder outlives the app (android/tools/run-emulator-tests.sh pulls it). */
    private const val FOLDER = "/data/local/tmp/bobby-shots"

    fun save(name: String) {
        require(Regex("^[a-z0-9][a-z0-9-]{0,100}$").matches(name)) { "A screenshot name is lowercase words and dashes: $name" }
        shell("mkdir -p $FOLDER")
        shell("screencap -p $FOLDER/$name.png")
    }

    /** Runs a command as the shell user and waits for it to end. */
    fun shell(command: String): String {
        val output = InstrumentationRegistry.getInstrumentation().uiAutomation.executeShellCommand(command)
        return ParcelFileDescriptor.AutoCloseInputStream(output).use { it.readBytes().toString(Charsets.UTF_8) }
    }
}
