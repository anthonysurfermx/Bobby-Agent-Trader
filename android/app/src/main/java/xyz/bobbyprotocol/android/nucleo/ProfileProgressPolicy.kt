package xyz.bobbyprotocol.android.nucleo

import org.json.JSONObject

/** Unknown server metrics remain unknown; a stale owner's response can never enter the profile. */
internal object ProfileProgressPolicy {
    fun count(value: Any?): Int? = (value as? Number)?.toDouble()?.takeIf {
        it.isFinite() && it >= 0 && it <= Int.MAX_VALUE && it == it.toInt().toDouble()
    }?.toInt()
    fun aura(state: JSONObject): Int? = count(state.opt("aura"))
    fun current(expectedOwner: String?, expectedEpoch: Long, owner: String?, epoch: Long): Boolean =
        expectedOwner == owner && expectedEpoch == epoch
    fun applyMetrics(state: JSONObject, progress: JSONObject) {
        if (progress.has("aura")) {
            val aura = count(progress.opt("aura"))
            if (aura == null) state.remove("aura") else state.put("aura", aura)
        }
        (progress.opt("updatedAt") as? String)?.takeIf(String::isNotBlank)?.let { state.put("syncedAt", it) }
    }
}
