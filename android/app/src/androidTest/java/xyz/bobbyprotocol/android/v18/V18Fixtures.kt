package xyz.bobbyprotocol.android.v18

import org.json.JSONArray
import org.json.JSONObject
import xyz.bobbyprotocol.android.v18.harness.Harness
import xyz.bobbyprotocol.android.v18.harness.HarnessCenter
import xyz.bobbyprotocol.android.v18.memory.MemoryReply
import java.time.Instant

// What the staged screens are fed. The server bodies have the shape production answers with today
// (api/bobby-access.ts, api/_lib/desk-debate.ts, api/memory.ts, api/voice-tool.ts); the numbers and
// the words are invented, belong to nobody, and are written in the language the screen is staged
// in, because a person writes a thesis in their own language and Bobby answers in it.
object V18Fixtures {
    private fun iso(millis: Long): String = Instant.ofEpochMilli(millis).toString()
    private fun day(month: Int, day: Int, hour: Int = 12, minute: Int = 0): Long = V18Stage.at(2026, month, day, hour, minute)

    // ---- GET /api/bobby-access ----

    private fun meter(used: Int, limit: Int, days: Int, back: Long?, bonus: Int): JSONObject = JSONObject()
        .put("used", used).put("limit", limit).put("remaining", maxOf(0, limit - used)).put("windowDays", days)
        .put("resetsAt", if (back == null) JSONObject.NULL else iso(back)).put("bonus", bonus)

    private fun plans(): JSONObject = JSONObject()
        .put("limits", JSONObject()
            .put("anon", JSONObject().put("profundo", JSONArray(listOf(2, 30))).put("maximo", JSONArray(listOf(0, 30))))
            .put("free", JSONObject().put("profundo", JSONArray(listOf(6, 7))).put("maximo", JSONArray(listOf(2, 7))))
            .put("pro", JSONObject().put("profundo", JSONArray(listOf(60, 30))).put("maximo", JSONArray(listOf(10, 30)))))
        .put("referral", JSONObject().put("maxFriends", 5).put("rewardDays", 30))
        .put("freeReadsPerWeek", 20)

    /**
     * The server sells Bobby Pro through the App Store and by card today, and confirms store
     * purchases; it does not sell through Google Play yet (`googlePlay` stands for the day it does).
     */
    private fun payments(body: JSONObject, googlePlay: Boolean): JSONObject {
        val payments = JSONObject().put("stripe", true).put("apple", true).put("revenuecat", true)
        if (googlePlay) {
            payments.put("google", true)
            body.put("purchaseReservationVersion", 1)
        }
        return body.put("payments", payments)
    }

    /** A free account in the middle of its week: 7 of 20 Quick reads left, gifts from a code, two friends invited. */
    fun freeAccount(googlePlay: Boolean = false): JSONObject = payments(JSONObject()
        .put("access", JSONObject().put("tier", "free").put("used", 13).put("limit", 20).put("remaining", 7)
            .put("resetsAt", iso(day(10, 10, 9))).put("paywall", true).put("bonus", 3))
        .put("levels", JSONObject().put("tier", "free").put("levels", JSONObject()
            .put("profundo", meter(used = 4, limit = 6, days = 7, back = day(10, 11, 9), bonus = 2))
            .put("maximo", meter(used = 1, limit = 2, days = 7, back = day(10, 12, 9), bonus = 0))))
        .put("referral", JSONObject().put("code", "K7QM2XWP").put("url", "https://bobbyprotocol.xyz/i/K7QM2XWP").put("accepted", 2).put("max", 5)
            .put("rewardDays", 30).put("proUntil", JSONObject.NULL).put("proSource", JSONObject.NULL)
            .put("friends", JSONArray().put(JSONObject().put("joinedAt", iso(day(9, 28)))).put(JSONObject().put("joinedAt", iso(day(10, 2))))))
        .put("plans", plans()).put("signedIn", true).put("subscription", JSONObject.NULL), googlePlay)

    /**
     * The same free account with its week used up and no gifted read: the Bobby Pro screen stands
     * behind the next read, so Bobby offers none of its own (HarnessWall).
     */
    fun freeAccountAtTheWall(): JSONObject = payments(JSONObject()
        .put("access", JSONObject().put("tier", "free").put("used", 20).put("limit", 20).put("remaining", 0)
            .put("resetsAt", iso(day(10, 10, 9))).put("paywall", true).put("bonus", 0))
        .put("levels", JSONObject().put("tier", "free").put("levels", JSONObject()
            .put("profundo", meter(used = 6, limit = 6, days = 7, back = day(10, 11, 9), bonus = 0))
            .put("maximo", meter(used = 2, limit = 2, days = 7, back = day(10, 12, 9), bonus = 0))))
        .put("referral", JSONObject.NULL).put("plans", plans()).put("signedIn", true).put("subscription", JSONObject.NULL), googlePlay = false)

    /** Nobody signed in: 4 of the 6 reads a phone gets, which do not come back. */
    fun guest(): JSONObject = payments(JSONObject()
        .put("access", JSONObject().put("tier", "anon").put("used", 2).put("limit", 6).put("remaining", 4)
            .put("resetsAt", JSONObject.NULL).put("paywall", true).put("bonus", 0))
        .put("levels", JSONObject().put("tier", "anon").put("levels", JSONObject()
            .put("profundo", meter(used = 0, limit = 2, days = 30, back = null, bonus = 0))
            .put("maximo", meter(used = 0, limit = 0, days = 30, back = null, bonus = 0))))
        .put("referral", JSONObject.NULL).put("plans", plans()).put("signedIn", false).put("subscription", JSONObject.NULL), googlePlay = false)

    // ---- POST /api/voice-tool (get_market): a price that costs no read ----

    private val quotes = mapOf("NVDA" to Pair(131.2, 1.4), "BTC" to Pair(60_480.0, -0.8))

    /** NVDA and BTC have a price; any other symbol is refused, as when the provider does not answer. */
    fun market(call: StageNetwork.Call): StageNetwork.Reply {
        val symbol = try { JSONObject(call.body ?: "{}").optJSONObject("args")?.optString("symbol") } catch (_: Exception) { null }
        val quote = symbol?.let { quotes[it] } ?: return StageNetwork.Reply(503, "{\"error\":\"market_unavailable\"}")
        return StageNetwork.Reply(200, JSONObject().put("symbol", symbol).put("price", quote.first).put("change_24h_pct", quote.second).toString())
    }

    // ---- POST /api/desk-debate: the one read a thesis review spends ----

    /** Production streams NDJSON; the last event carries the answer. */
    fun review(language: String): StageNetwork.Reply {
        val es = language == "es"
        val answer = JSONObject()
            .put("symbol", "NVDA").put("level", "rapido")
            .put("technicals", JSONObject().put("price", 131.2).put("rsi14", 55.0))
            .put("provenance", JSONObject().put("provider", "Yahoo Finance").put("asOf", iso(day(10, 7, 11, 30))))
            .put("agents", JSONObject()
                .put("alpha", if (es) "El precio sigue sobre su media de 50 días." else "Price is still above its 50-day average.")
                .put("red", if (es) "El impulso se enfrió en las últimas dos semanas." else "Momentum has cooled over the last two weeks.")
                .put("cio", if (es) "La tendencia se sostiene con menos fuerza." else "The trend holds with less strength.")
                .put("verdict", "review").put("direction", "none")
                .put("synthesis", JSONObject()
                    .put("headline", if (es) "La evidencia de precio sigue a tu favor, con menos impulso." else "The price evidence still leans your way, with less momentum.")
                    .put("why", if (es) "El precio se sostiene sobre su media de 50 días." else "Price is holding above its 50-day average.")
                    .put("risk", if (es) "El impulso viene bajando." else "Momentum has been fading.")
                    .put("watch", if (es) "La zona de 124." else "The 124 area.")))
            .put("review", JSONObject()
                .put("supports", JSONArray(if (es) listOf("El precio está sobre su media de 50 días.", "Mínimos más altos desde septiembre.")
                                           else listOf("Price is above its 50-day average.", "Higher lows since September.")))
                .put("challenges", JSONArray(if (es) listOf("El impulso se enfrió: el RSI bajó de 68 a 55.") else listOf("Momentum has cooled: RSI fell from 68 to 55.")))
                .put("unknowns", JSONArray(if (es) listOf("Si la demanda supera a la oferta no se lee en el precio.")
                                           else listOf("Whether demand outpaces supply cannot be read from price.")))
                .put("notChecked", JSONArray(listOf("news", "earnings", "filings", "fundamentals", "macro"))))
            .put("access", JSONObject().put("tier", "free").put("used", 14).put("limit", 20).put("remaining", 6)
                .put("resetsAt", iso(day(10, 10, 9))).put("paywall", true).put("bonus", 3))
        return StageNetwork.Reply(200, JSONObject().put("type", "final").put("data", answer).toString() + "\n", "application/x-ndjson")
    }

    // ---- /api/memory ----

    /** Three assets, two preferences, the server's ninety days. */
    fun memory(): MemoryReply = MemoryReply(JSONObject()
        .put("enabled", true)
        .put("prefs", JSONObject().put("horizon", "month").put("experience", "some"))
        .put("assets", JSONArray()
            .put(JSONObject().put("symbol", "NVDA").put("asks", 5).put("lastAskedAt", iso(day(10, 2, 16))).put("lastHorizon", "month"))
            .put(JSONObject().put("symbol", "BTC").put("asks", 3).put("lastAskedAt", iso(day(10, 5, 9))).put("lastHorizon", "week"))
            .put(JSONObject().put("symbol", "AAPL").put("asks", 1).put("lastAskedAt", iso(day(9, 28, 18))).put("lastHorizon", "unspecified")))
        .put("retentionDays", 90), 200)

    // ---- What the phone itself holds ----

    class Theses(val nvda: SavedThesis, val btc: SavedThesis, val archived: SavedThesis)

    /**
     * Two active theses and an archived one, in the reader's book: NVDA written a month ago and
     * reviewed twice, BTC written on Sunday and never reviewed, TSLA archived last week.
     */
    fun theses(stage: V18Stage): Theses {
        val es = stage.language == "es"
        val book = stage.host.theses
        val owner = stage.desk.owner
        val nvda = book.create(ThesisDraft(
            symbol = "NVDA", name = "NVIDIA", isEquity = true, horizon = ThesisHorizon.MONTHS,
            hypothesis = if (es) "La demanda de centros de datos crece más rápido que la oferta y los márgenes aguantan."
                         else "Data center demand keeps growing faster than supply, and margins are holding.",
            worry = if (es) "Que se frene el gasto en la nube." else "A slowdown in cloud spending.",
            changeMind = if (es) "Dos trimestres seguidos con menos ingresos de centros de datos." else "Two quarters in a row of falling data center revenue.",
            price = 120.5, asOf = iso(day(9, 7, 10)), verdict = "wait"), owner, day(9, 7, 10))
        book.recordReview(nvda.id, owner, 118.4, iso(day(9, 16, 17)), "wait",
                          supports = listOf(if (es) "El precio respeta su media de 50 días." else "Price respects its 50-day average."),
                          challenges = listOf(if (es) "Máximos más bajos desde agosto." else "Lower highs since August."),
                          unknowns = emptyList(), now = day(9, 16, 18))
        book.recordReview(nvda.id, owner, 126.1, iso(day(9, 23, 17)), "review",
                          supports = listOf(if (es) "Rompió su máximo de septiembre." else "It broke its September high."),
                          challenges = emptyList(),
                          unknowns = listOf(if (es) "La demanda no se lee en el precio." else "Demand cannot be read from price."), now = day(9, 23, 18))
        val tsla = book.create(ThesisDraft(
            symbol = "TSLA", name = "Tesla", isEquity = true, horizon = null,
            hypothesis = if (es) "Las entregas se recuperan este trimestre." else "Deliveries recover this quarter.",
            price = 238.0, asOf = iso(day(8, 20, 10)), verdict = "wait"), owner, day(8, 20, 10))
        book.archive(tsla.id, owner, day(9, 30, 9))
        val btc = book.create(ThesisDraft(
            symbol = "BTC", name = "Bitcoin", isEquity = false, horizon = ThesisHorizon.YEARS,
            hypothesis = if (es) "Sigue marcando mínimos más altos después de cada caída." else "It keeps making higher lows after each sell-off.",
            price = 61_250.0, asOf = iso(day(10, 4, 9)), verdict = "wait"), owner, day(10, 4, 9))
        return Theses(checkNotNull(book.thesis(nvda.id, owner)), btc, checkNotNull(book.thesis(tsla.id, owner)))
    }

    const val READ_AAPL = "5f0c1a9e-7b2d-4c38-9e61-0a4d2f7b3c10"

    /**
     * A read as the session hands it over once delivered. `withSynthesis` is what Bobby's draft of a
     * thesis is made from; a read without it leaves the editor's fields empty.
     */
    fun read(language: String, requestId: String, symbol: String, name: String, isEquity: Boolean, price: Double, asOf: Long, withSynthesis: Boolean = true): JSONObject {
        val es = language == "es"
        val read = JSONObject().put("v", 1).put("status", "ok").put("requestId", requestId)
            .put("question", if (es) "¿Cómo ves $symbol?" else "How does $symbol look?")
            .put("asset", JSONObject().put("symbol", symbol).put("name", name).put("isEquity", isEquity))
            .put("market", JSONObject().put("price", price))
            .put("technicals", JSONObject().put("price", price))
            .put("agents", JSONObject().put("verdict", "wait").put("direction", "none"))
            .put("provenance", JSONObject().put("asOf", iso(asOf)))
        if (withSynthesis) {
            read.put("synthesis", JSONObject()
                .put("headline", if (es) "$symbol se sostiene, sin una dirección clara todavía." else "$symbol is holding, without a clear direction yet.")
                .put("why", if (es) "El precio se sostiene sobre su media de 50 días y los mínimos vienen subiendo desde agosto."
                            else "Price is holding above its 50-day average and the lows have been rising since August.")
                .put("risk", if (es) "El impulso se enfría cerca del máximo anterior." else "Momentum is cooling near the previous high.")
                .put("watch", if (es) "Un cierre bajo la media de 50 días." else "A close below the 50-day average."))
        }
        return read
    }

    /**
     * What ten days of questions leave in the follow-up notes, for the Memory screen (the iPhone's
     * review fixture `memory-notes-three`): NVDA asked three times, the last one about this week and
     * saved to review in a week; BTC once; TSLA twice, with a thesis that looks weeks ahead. Every
     * read, the save and the thesis go through the host as they do in the app, and the yes is given
     * right after the save, so what that read carried is written. Call it on the stage's own scope.
     */
    suspend fun followUpNotes(stage: V18Stage) {
        val language = stage.language
        val host = stage.host
        fun asked(id: String, symbol: String, name: String, isEquity: Boolean, price: Double, at: Long, horizon: String? = null) {
            stage.bench.clock = at
            val delivered = read(language, id, symbol, name, isEquity, price, at)
            if (horizon != null) delivered.put("sufficiency", JSONObject().put("horizon", horizon))
            host.readDelivered(delivered)
        }
        asked("b7c2f1a0-0000-4000-8000-000000000001", "TSLA", "Tesla", true, 238.0, day(9, 28, 18, 45))
        asked("b7c2f1a0-0000-4000-8000-000000000002", "TSLA", "Tesla", true, 241.5, day(9, 30, 18, 45))
        host.theses.create(ThesisDraft(
            symbol = "TSLA", name = "Tesla", isEquity = true, horizon = ThesisHorizon.WEEKS,
            hypothesis = if (language == "es") "Las entregas se recuperan este trimestre." else "Deliveries recover this quarter.",
            price = 241.5, asOf = iso(day(9, 30, 18, 45)), verdict = "wait"), stage.desk.owner, day(9, 30, 18, 50))
        asked("b7c2f1a0-0000-4000-8000-000000000003", "NVDA", "NVIDIA", true, 124.9, day(10, 1, 14, 10))
        asked("b7c2f1a0-0000-4000-8000-000000000004", "BTC", "Bitcoin", false, 61_250.0, day(10, 3, 9, 30))
        asked("b7c2f1a0-0000-4000-8000-000000000005", "NVDA", "NVIDIA", true, 126.2, day(10, 3, 14, 10))
        asked("b7c2f1a0-0000-4000-8000-000000000006", "NVDA", "NVIDIA", true, 128.4, day(10, 5, 14, 10), horizon = "week")
        stage.bench.clock = day(10, 5, 14, 12)
        host.readSaved("b7c2f1a0-0000-4000-8000-000000000006", "NVDA", 168)
        stage.bench.clock = day(10, 5, 14, 13)
        val center = Harness.center(host)
        check(center.accept() == HarnessCenter.Outcome.ON) { "The staged reader could not say yes to follow-ups" }
        stage.bench.clock = V18Stage.NOW
        center.replan()
    }

    /** The week as the follow-ups know it: three assets asked about on three days, delivered through the host as a read is. */
    fun askedThisWeek(stage: V18Stage) {
        val language = stage.language
        stage.bench.clock = day(10, 5, 10)
        stage.host.readDelivered(read(language, "a3d1e0c2-4b5f-4a67-8c90-1d2e3f4a5b01", "AAPL", "Apple", true, 229.1, day(10, 5, 10)))
        stage.bench.clock = day(10, 6, 16)
        stage.host.readDelivered(read(language, "a3d1e0c2-4b5f-4a67-8c90-1d2e3f4a5b02", "BTC", "Bitcoin", false, 61_250.0, day(10, 6, 16)))
        stage.bench.clock = day(10, 6, 18)
        stage.host.readDelivered(read(language, "a3d1e0c2-4b5f-4a67-8c90-1d2e3f4a5b03", "NVDA", "NVIDIA", true, 128.4, day(10, 6, 18)))
        stage.bench.clock = V18Stage.NOW
    }
}
