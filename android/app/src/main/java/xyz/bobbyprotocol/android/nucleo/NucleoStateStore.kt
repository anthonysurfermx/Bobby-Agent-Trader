package xyz.bobbyprotocol.android.nucleo

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject

/** Private, per-account storage. Guest records never become another account's saved-thesis history. */
internal class NucleoStateStore(context: Context) {
    private val preferences = context.getSharedPreferences("bobby.nucleo", Context.MODE_PRIVATE)
    private var profileOwner: String? = null
    private fun profileKey(field: String) = "profile." + (profileOwner ?: "local") + "." + field
    fun bindOwner(owner: String?, inheritGuest: Boolean = false) {
        if (owner != null && inheritGuest && !preferences.contains("profile.$owner.riskVersion")) {
            val editor = preferences.edit()
            editor.putString("profile.$owner.companion", preferences.getString("profile.local.companion", null))
                .putBoolean("profile.$owner.onboarded", preferences.getBoolean("profile.local.onboarded", false))
                .putInt("profile.$owner.riskVersion", preferences.getInt("profile.local.riskVersion", 0)).commit()
        }
        profileOwner = owner
    }
    var companionId: String?
        get() = preferences.getString(profileKey("companion"), null)
        set(value) { preferences.edit().putString(profileKey("companion"), value).apply() }
    var onboarded: Boolean
        get() = preferences.getBoolean(profileKey("onboarded"), false)
        set(value) { preferences.edit().putBoolean(profileKey("onboarded"), value).apply() }
    var riskVersion: Int
        get() = preferences.getInt(profileKey("riskVersion"), 0)
        set(value) { preferences.edit().putInt(profileKey("riskVersion"), value).apply() }
    var muted: Boolean
        get() = preferences.getBoolean("muted", false)
        set(value) { preferences.edit().putBoolean("muted", value).apply() }
    var voicePreference: String
        get() = preferences.getString("voicePreference", "companion") ?: "companion"
        set(value) { preferences.edit().putString("voicePreference", value).apply() }
    var language: String
        get() = preferences.getString("language", "system") ?: "system"
        set(value) { preferences.edit().putString("language", value).apply() }
    var analysisLevel: String
        get() = preferences.getString("analysisLevel", "rapido") ?: "rapido"
        set(value) { preferences.edit().putString("analysisLevel", value).apply() }

    private fun key(owner: String?) = "owner." + (owner ?: "local")
    fun state(owner: String?): JSONObject = runCatching {
        JSONObject(preferences.getString(key(owner), "{}") ?: "{}")
    }.getOrDefault(JSONObject())
    fun write(owner: String?, state: JSONObject) { preferences.edit().putString(key(owner), state.toString()).apply() }
    fun forget(owner: String) { preferences.edit().remove(key(owner)).remove("profile.$owner.companion").remove("profile.$owner.onboarded").remove("profile.$owner.riskVersion").apply() }

    fun counters(owner: String?): NucleoPolicy.Counters {
        val s = state(owner)
        return NucleoPolicy.Counters(s.optInt("xp"), s.optInt("streak"), s.nullableString("lastDay"), s.optInt("dailyAwards"), s.nullableString("dailyAwardsDay"))
    }
    fun saveCounters(owner: String?, counters: NucleoPolicy.Counters) {
        val s = state(owner)
        s.put("xp", counters.xp).put("streak", counters.streak).put("lastDay", counters.lastDay ?: JSONObject.NULL)
            .put("dailyAwards", counters.dailyAwards).put("dailyAwardsDay", counters.dailyAwardsDay ?: JSONObject.NULL)
        write(owner, s)
    }
    fun aura(owner: String?): Int? = ProfileProgressPolicy.aura(state(owner))
    fun syncedAt(owner: String?): String? = state(owner).nullableString("syncedAt")
    fun saveServerMetrics(owner: String?, progress: JSONObject) {
        val s = state(owner); ProfileProgressPolicy.applyMetrics(s, progress); write(owner, s)
    }
    fun pending(owner: String?): JSONArray = state(owner).optJSONArray("pending") ?: JSONArray()
    fun setPending(owner: String?, pending: JSONArray) { val s = state(owner); s.put("pending", pending); write(owner, s) }
    /** What the glass offers and what an account's sync sends: the reader's row, or the default tickers when they keep none (QuickAccess.kt). */
    fun quickAccess(owner: String?): JSONArray = JSONArray(QuickAccess.shown(state(owner)))
    /** What the reader kept, newest first: never the default row standing in for nothing. */
    fun keptQuickAccess(owner: String?): List<String> = QuickAccess.kept(state(owner))
    /** Keeps these symbols. None removes the stored row (as iOS does), so the glass falls back to its default tickers. */
    fun setQuickAccess(owner: String?, symbols: JSONArray) { val s = state(owner); QuickAccess.keep(s, QuickAccess.symbols(symbols)); write(owner, s) }
    fun ledger(owner: String?): JSONArray = state(owner).optJSONArray("theses") ?: JSONArray()
    fun saveThesis(owner: String?, thesis: JSONObject) {
        val list = ledger(owner)
        val next = JSONArray().put(thesis)
        for (i in 0 until list.length()) {
            val item = list.optJSONObject(i) ?: continue
            if (item.optString("id") != thesis.optString("id") && next.length() < 20) next.put(item)
        }
        val s = state(owner); s.put("theses", next); write(owner, s)
    }
    /** One durable write fences a saved read, its cap counters and its idempotent pending event. */
    fun recordAward(owner: String?, counters: NucleoPolicy.Counters, thesis: JSONObject, event: JSONObject?) {
        val s = state(owner)
        s.put("xp", counters.xp).put("streak", counters.streak).put("lastDay", counters.lastDay ?: JSONObject.NULL)
            .put("dailyAwards", counters.dailyAwards).put("dailyAwardsDay", counters.dailyAwardsDay ?: JSONObject.NULL)
        val ledger = s.optJSONArray("theses") ?: JSONArray()
        val list = JSONArray().put(thesis)
        for (i in 0 until ledger.length()) ledger.optJSONObject(i)?.let { if (it.optString("id") != thesis.optString("id") && list.length() < 20) list.put(it) }
        s.put("theses", list)
        if (event != null) s.put("pending", (s.optJSONArray("pending") ?: JSONArray()).put(event))
        preferences.edit().putString(key(owner), s.toString()).commit()
    }
    fun applySync(owner: String?, progress: JSONObject, results: JSONArray) {
        val s = state(owner)
        for (field in listOf("xp", "streak", "lastDay", "dailyAwards", "dailyAwardsDay", "quickAccess")) if (progress.has(field)) s.put(field, progress.get(field))
        ProfileProgressPolicy.applyMetrics(s, progress)
        val acknowledgments = (0 until results.length()).mapNotNull { results.optJSONObject(it) }.associateBy { it.optString("id") }
        val pending = s.optJSONArray("pending") ?: JSONArray()
        val remaining = JSONArray()
        for (i in 0 until pending.length()) pending.optJSONObject(i)?.let { if (it.optString("id") !in acknowledgments) remaining.put(it) }
        s.put("pending", remaining)
        val ledger = s.optJSONArray("theses") ?: JSONArray()
        for (i in 0 until ledger.length()) {
            val thesis = ledger.optJSONObject(i) ?: continue
            val receipt = acknowledgments[thesis.optString("eventId")] ?: continue
            thesis.put("synced", true)
            if (!receipt.optBoolean("duplicate")) thesis.put("points", receipt.optInt("awarded"))
        }
        s.put("theses", ledger)
        preferences.edit().putString(key(owner), s.toString()).commit()
    }
    fun hints(): JSONObject = runCatching { JSONObject(preferences.getString("hints", "{}") ?: "{}") }.getOrDefault(JSONObject())
    fun markHint(id: String, count: Int) { preferences.edit().putString("hints", hints().put(id, count).toString()).apply() }
}

internal fun JSONObject.nullableString(key: String): String? = opt(key)?.takeIf { it != JSONObject.NULL }?.toString()?.takeIf { it.isNotEmpty() }
internal fun json(vararg entries: Pair<String, Any?>): JSONObject = JSONObject().also { o -> entries.forEach { (k, v) -> o.put(k, v ?: JSONObject.NULL) } }
