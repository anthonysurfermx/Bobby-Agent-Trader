package xyz.bobbyprotocol.android.v18.memory

import org.json.JSONArray
import org.json.JSONObject

/**
 * /api/memory and the stored opt-in switch, in memory. The switch is kept per account, as the
 * repository keeps it, and is exactly what the app's transport reads before it adds the opt-in
 * header to a desk question: a test that looks at `bits` looks at what would be sent.
 */
class FakeMemoryGateway(private val owner: () -> String?) : MemoryGateway {
    class Call(val path: String, val method: String, val body: JSONObject?)

    /** Every call that reached the "server", oldest first. */
    val calls = ArrayList<Call>()
    /** What the server answers. The default is a server that is down. */
    var reply: suspend (path: String, method: String, body: JSONObject?) -> MemoryReply = { _, _, _ -> MemoryReply(JSONObject().put("error", "down"), 503) }
    /** The stored switch of each account. */
    val bits = HashMap<String, Boolean>()

    override suspend fun send(path: String, method: String, body: JSONObject?): MemoryReply {
        calls.add(Call(path, method, body))
        return reply(path, method, body)
    }

    override fun nativeOptIn(): Boolean = owner()?.let { bits[it] } ?: false

    override fun setNativeOptIn(enabled: Boolean) {
        val user = owner() ?: return
        bits[user] = enabled
    }

    fun stored(user: String): Boolean = bits[user] == true
    val methods: List<String> get() = calls.map { it.method }

    companion object {
        /** The body /api/memory answers with. */
        fun memory(symbols: List<String> = emptyList(), enabled: Boolean = true): JSONObject {
            val assets = JSONArray()
            for (symbol in symbols) {
                assets.put(JSONObject().put("symbol", symbol).put("asks", 2).put("lastAskedAt", "2026-10-01T12:00:00.000Z").put("lastHorizon", "week"))
            }
            return JSONObject().put("enabled", enabled).put("prefs", JSONObject()).put("assets", assets).put("retentionDays", 90)
        }

        fun ok(symbols: List<String> = emptyList(), enabled: Boolean = true): MemoryReply = MemoryReply(memory(symbols, enabled), 200)
    }
}
