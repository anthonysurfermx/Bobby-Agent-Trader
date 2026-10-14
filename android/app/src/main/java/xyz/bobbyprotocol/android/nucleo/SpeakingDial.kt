package xyz.bobbyprotocol.android.nucleo

import android.content.Context
import org.json.JSONObject
import org.json.JSONArray
import java.security.MessageDigest

internal class SpeakingDial(context: Context) {
    private val prefs = context.getSharedPreferences("bobby.speaking", Context.MODE_PRIVATE)
    fun tag(owner: String?) = MessageDigest.getInstance("SHA-256").digest((owner ?: "guest").toByteArray()).joinToString("") { "%02x".format(it) }
    private fun key(owner: String?, field: String) = tag(owner) + "." + field
    fun prepare(existing: Boolean) { if (!prefs.contains("fresh")) prefs.edit().putBoolean("fresh", !existing).commit() }
    fun value(owner: String?): String? = prefs.getString(key(owner, "value"), null)?.takeIf { it in VALUES }
    fun choose(value: String, owner: String?, feedback: Boolean) {
        require(value in VALUES)
        val e = prefs.edit().putString(key(owner, "value"), value)
        if (feedback) e.putBoolean(key(owner, "refined"), true)
        check(e.commit())
    }
    fun inheritGuest(owner: String) {
        if (prefs.getBoolean("claimed", false)) return
        check(prefs.edit().putBoolean("claimed", true).commit())
        if (value(owner) == null) value(null)?.let { choose(it, owner, false) }
    }
    fun delivered(id: String, owner: String?) {
        val ids = JSONArray(prefs.getString(key(owner, "reads"), "[]"))
        if ((0 until ids.length()).any { ids.optString(it) == id }) return
        ids.put(id)
        while (ids.length() > 32) ids.remove(0)
        check(prefs.edit().putString(key(owner, "reads"), ids.toString()).putInt(key(owner, "count"), minOf(3, prefs.getInt(key(owner, "count"), 0) + 1)).commit())
    }
    fun json(owner: String?) = JSONObject().put("owner", tag(owner)).put("value", value(owner) ?: JSONObject.NULL)
        .put("offer", prefs.getBoolean("fresh", false) && value(owner) == null)
        .put("refine", prefs.getInt(key(owner, "count"), 0) >= 3 && !prefs.getBoolean(key(owner, "refined"), false))
    companion object { val VALUES = listOf("plain", "terms", "technical") }
}
