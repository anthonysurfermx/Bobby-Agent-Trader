package xyz.bobbyprotocol.android.v18.credits

import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableSharedFlow
import org.json.JSONObject
import xyz.bobbyprotocol.android.v18.V18Text
import java.io.File
import java.io.IOException

// What the credits and invitation suites share: two languages without a catalog, the catalog itself
// for the checks in six languages, and a backend that lives in memory.

/** English or Spanish exactly as written at the call site, with `{0}` filled: what `host.text` does in those two languages. */
class TwoWords(private val spanish: Boolean = false) : Words {
    override fun text(en: String, es: String, vararg args: Any?): String = V18Text.fill(if (spanish) es else en, *args)
}

/** Epoch milliseconds of an ISO-8601 instant. */
fun at(iso: String): Long = CreditsJson.millis(iso) ?: throw IllegalArgumentException(iso)

/** The two catalogs the app ships (French, Portuguese, Italian and German), read from the source tree. */
object V18Catalog {
    val LANGUAGES = listOf("fr", "pt", "it", "de")
    private val added: JSONObject by lazy { read("native-android-translations.json") }
    private val original: JSONObject by lazy { read("native-translations.json") }

    private fun read(name: String): JSONObject {
        for (base in listOf("src/main/assets/nucleo", "app/src/main/assets/nucleo", "android/app/src/main/assets/nucleo")) {
            val file = File(base, name)
            if (file.isFile) return JSONObject(file.readText(Charsets.UTF_8))
        }
        throw IllegalStateException("The catalog $name was not found from " + File(".").absolutePath)
    }

    /** `key` in one language, as `NucleoSession.text` resolves it; null when no catalog has it. */
    fun text(key: String, language: String): String? {
        val mine = (added.optJSONObject(key)?.opt(language) as? String)?.takeIf { it.isNotBlank() }
        return mine ?: (original.optJSONObject(key)?.opt(language) as? String)?.takeIf { it.isNotBlank() }
    }

    /** The four translations of `key`; a language that has none is left out. */
    fun row(key: String): Map<String, String> {
        val out = LinkedHashMap<String, String>()
        for (language in LANGUAGES) text(key, language)?.let { out[language] = it }
        return out
    }

    fun placeholders(text: String): Set<String> = Regex("\\{\\d+\\}").findAll(text).map { it.value }.toSet()
}

/** The network and the app's quota store, in memory. */
class FakeCreditsBackend : CreditsBackend {
    /** What GET /api/bobby-access answers; null means the request fails. */
    var reply: JSONObject? = null
    /** What the app holds (the quota store). */
    var held: HeldMeters? = null
    /** How many times the server was asked. */
    var gets = 0
    /** Runs inside the request, while the caller is waiting for it. */
    var during: () -> Unit = {}
    private val signal = MutableSharedFlow<Unit>(extraBufferCapacity = 16)

    override suspend fun access(): JSONObject {
        gets += 1
        during()
        return reply ?: throw IOException("offline")
    }

    override fun held(): HeldMeters? = held
    override val changes: Flow<Unit> get() = signal

    /** The quota store publishes (a balance read somewhere in the app, a redeemed code). */
    fun publish(next: HeldMeters?) {
        held = next
        signal.tryEmit(Unit)
    }

    companion object {
        /** A free account's reply, as far as these suites look at it. */
        fun reply(remaining: Int = 10, quick: Int = 0, deep: Int = 0, max: Int = 0, signedIn: Boolean = true): JSONObject = JSONObject()
            .put("signedIn", signedIn)
            .put("access", JSONObject().put("tier", "free").put("used", 10 - remaining).put("limit", 10).put("remaining", remaining)
                .put("resetsAt", "2026-10-09T12:00:00Z").put("paywall", true).put("bonus", quick))
            .put("levels", JSONObject().put("tier", "free").put("levels", JSONObject()
                .put("profundo", JSONObject().put("used", 0).put("limit", 3).put("remaining", 3).put("bonus", deep).put("windowDays", 7))
                .put("maximo", JSONObject().put("used", 0).put("limit", 1).put("remaining", 1).put("bonus", max).put("windowDays", 7))))
            .put("plans", JSONObject().put("freeReadsPerWeek", 10).put("referral", JSONObject().put("rewardDays", 30).put("maxFriends", 5)))

        /** The same numbers as the quota store holds them for `owner` at `epoch`. */
        fun held(owner: String?, epoch: Long, remaining: Int = 10, quick: Int = 0, deep: Int = 0, max: Int = 0): HeldMeters = HeldMeters(
            owner, epoch, ReadAccess("free", 10 - remaining, 10, remaining, "2026-10-09T12:00:00Z", true, quick),
            mapOf(CreditsLevel.PROFUNDO to LevelMeter(0, 3, 3, deep, 7, null), CreditsLevel.MAXIMO to LevelMeter(0, 1, 1, max, 7, null)))
    }
}
