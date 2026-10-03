package xyz.bobbyprotocol.android.equipment

import android.content.Context
import org.json.JSONObject
import java.security.MessageDigest

class EquipmentStore(context: Context) {
    private val preferences = context.applicationContext.getSharedPreferences("bobby.equipment", Context.MODE_PRIVATE)
    private var owner: String? = null
    private fun scope(value: String?): String = value?.let {
        MessageDigest.getInstance("SHA-256").digest(it.toByteArray()).joinToString("") { byte -> "%02x".format(byte) }
    } ?: "local"
    private fun outfitKey(value: String?) = "unequipped." + scope(value)
    private fun seenKey(value: String?) = "seen." + scope(value)
    private fun storedOutfitKey(logical: String): String = outfitKey(logical.removePrefix("outfit.").takeUnless { it == "local" })
    private val outfits = EquipmentOutfits(object : EquipmentPreferences {
        override fun read(key: String): Set<String>? = preferences.getStringSet(storedOutfitKey(key), null)?.toSet()
        override fun write(key: String, values: Set<String>) {
            check(preferences.edit().putStringSet(storedOutfitKey(key), values).commit()) { "Equipment preferences could not be saved" }
        }
        override fun remove(key: String) { check(preferences.edit().remove(storedOutfitKey(key)).commit()) }
    })

    fun bind(newOwner: String?) {
        val previous = preferences.getString("active-owner", null)
        val incoming = scope(newOwner)
        outfits.bind(newOwner, inheritGuest = previous == "local")
        owner = newOwner
        check(preferences.edit().putString("active-owner", incoming).commit()) { "Equipment preferences could not be saved" }
    }

    fun unequippedIds(): Set<String> = outfits.unequippedIds
    fun toggle(itemId: String, ownedIds: Set<String>): Boolean = outfits.toggle(itemId, ownedIds)

    fun seedSeen(ownedIds: Set<String>) {
        if (!preferences.contains(seenKey(owner))) check(preferences.edit().putStringSet(seenKey(owner), ownedIds).commit())
    }
    fun unseen(ownedIds: Set<String>): Set<String> = ownedIds - (preferences.getStringSet(seenKey(owner), emptySet())?.toSet() ?: emptySet())
    fun markSeen(ids: Set<String>) {
        if (!preferences.contains(seenKey(owner))) return
        val seen = preferences.getStringSet(seenKey(owner), emptySet())?.toSet() ?: emptySet()
        check(preferences.edit().putStringSet(seenKey(owner), seen + ids).commit())
    }
    fun forget(userId: String) {
        outfits.forget(userId)
        val editor = preferences.edit().remove(seenKey(userId))
        if (preferences.getString("active-owner", null) == scope(userId)) editor.remove("active-owner")
        check(editor.commit())
    }

    companion object {
        fun catalog(context: Context): List<EquipmentItem> {
            val json = context.assets.open("equipment/catalog.json").bufferedReader().use { JSONObject(it.readText()) }
            val rows = json.getJSONArray("items")
            return (0 until rows.length()).map { index ->
                val row = rows.getJSONObject(index)
                EquipmentItem(row.getString("id"), row.getString("companionId"), row.getInt("tier"), row.getString("kind") == "pet",
                    row.getInt("unlockXP"), row.getString("slot"), row.getJSONObject("name").getString("en"), row.getJSONObject("name").getString("es"),
                    row.getJSONObject("lore").getString("en"), row.getJSONObject("lore").getString("es"), row.getString("fallback"), row.getString("art"), row.optBoolean("spins"))
            }.also { require(it.size == 72 && it.map(EquipmentItem::id).toSet().size == 72) }
        }
    }
}
