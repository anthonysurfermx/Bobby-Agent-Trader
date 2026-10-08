package xyz.bobbyprotocol.android.nucleo

import org.json.JSONArray
import org.json.JSONObject
import xyz.bobbyprotocol.android.v18.MemoryReceipts

/** Normalizes real API evidence for the renderer. Missing evidence remains null; errors never become Wait. */
object NucleoReadModel {
    fun candles(body: JSONObject): JSONArray {
        val source = body.optJSONArray("candles")?.takeIf { it.length() > 0 } ?: body.optJSONArray("data") ?: JSONArray()
        val rows = mutableListOf<JSONObject>()
        for (i in 0 until source.length()) {
            val row = source.optJSONObject(i) ?: continue
            val time = NucleoPolicy.number(row.opt("ts"))?.takeIf { kotlin.math.abs(it) < 1e15 } ?: continue
            val open = NucleoPolicy.number(row.opt("open")) ?: continue
            val high = NucleoPolicy.number(row.opt("high")) ?: continue
            val low = NucleoPolicy.number(row.opt("low")) ?: continue
            val close = NucleoPolicy.number(row.opt("close")) ?: continue
            rows.add(json("t" to time.toLong(), "o" to open, "h" to high, "l" to low, "c" to close, "v" to (NucleoPolicy.number(row.opt("volume")) ?: 0.0)))
        }
        return JSONArray(rows.sortedBy { it.getLong("t") })
    }

    fun validDebate(body: JSONObject): Boolean {
        if (body.has("error")) return false
        val agents = body.optJSONObject("agents") ?: return false
        return listOf("alpha", "red", "cio").all { (agents.opt(it) as? String)?.isNotBlank() == true } && agents.optString("verdict") in setOf("wait", "review")
    }

    fun read(requestId: String, question: String, asset: JSONObject, market: JSONObject, candles: JSONArray, debate: JSONObject, language: String, locale: String, started: Long, requestedLevel: String = "rapido"): JSONObject {
        require(validDebate(debate)) { "Incomplete analysis" }
        val technicals = JSONObject()
        val rawTechnicals = debate.optJSONObject("technicals") ?: JSONObject()
        for (key in listOf("price", "rsi14", "ema20", "ema50", "support", "resistance", "atrPct")) technicals.put(key, NucleoPolicy.number(rawTechnicals.opt(key)) ?: JSONObject.NULL)
        val trend = mapOf("alcista" to "up", "bajista" to "down", "lateral" to "sideways", "up" to "up", "down" to "down", "sideways" to "sideways")
        val momentum = mapOf("sobrecompra" to "overbought", "sobreventa" to "oversold", "neutral" to "neutral", "overbought" to "overbought", "oversold" to "oversold")
        technicals.put("trend", trend[rawTechnicals.optString("trend")] ?: JSONObject.NULL)
        technicals.put("momentum", momentum[rawTechnicals.optString("momentum")] ?: JSONObject.NULL)
        val agents = JSONObject(debate.getJSONObject("agents").toString())
        if (agents.optString("direction") !in setOf("long", "short", "none")) agents.put("direction", "none")
        val now = System.currentTimeMillis()
        val rawPulse = debate.optJSONObject("technical_pulse")
        val pulse = rawPulse?.let { p -> json("signal" to p.nullableString("signal"), "direction" to p.nullableString("direction"), "convictionPct" to NucleoPolicy.number(p.opt("conviction_pct")), "agreementPct" to NucleoPolicy.number(p.opt("agreement_pct")), "overview" to p.nullableString("overview"), "source" to p.nullableString("source"), "instrument" to p.nullableString("instrument"), "plan" to p.optJSONObject("trade_plan")) }
        val out = json("v" to 1, "status" to "ok", "requestId" to requestId, "question" to question, "language" to language, "locale" to locale,
            "asset" to asset, "market" to market, "technicals" to technicals, "pulse" to pulse, "agents" to agents,
            "provenance" to (debate.optJSONObject("provenance") ?: JSONObject()), "candles" to candles, "receivedAt" to now, "elapsedMs" to (now - started).coerceAtLeast(0), "fixture" to false,
            "level" to debate.optString("level").takeIf { it in setOf("rapido", "profundo", "maximo") }.orEmpty().ifEmpty { requestedLevel })
        for (key in listOf("access", "sufficiency", "evidenceUsed")) debate.optJSONObject(key)?.let { out.put(key, it) }
        (agents.optJSONObject("synthesis") ?: debate.optJSONObject("synthesis"))?.let { out.put("synthesis", it) }
        // 1.8: the memory receipt rides the read for native (the page ignores keys it does not know).
        // Facts only, and only a complete receipt: an unknown count never becomes a zero.
        MemoryReceipts.fromJson(debate.optJSONObject("memory"))?.let { out.put("memory", MemoryReceipts.toJson(it)) }
        return out
    }
}
