package xyz.bobbyprotocol.android.equipment

data class EquipmentCompanion(val id: String, val label: String, val requiredLevel: Int)

data class EquipmentItem(
    val id: String,
    val companionId: String,
    val tier: Int,
    val isPet: Boolean,
    val unlockXP: Int,
    val slot: String,
    val nameEnglish: String,
    val nameSpanish: String,
    val loreEnglish: String,
    val loreSpanish: String,
    val fallback: String,
    val art: String,
    val spins: Boolean = false,
) { val isGolden: Boolean get() = !isPet && tier == 3 }

sealed interface EquipmentState {
    data object Owned : EquipmentState
    data object FirstRead : EquipmentState
    data class NeedsXP(val remaining: Int) : EquipmentState
    data class NeedsLevel(val level: Int, val remainingXP: Int) : EquipmentState
}

/** Exact release-54 LockerLedger thresholds. Outfit toggles do not award or spend XP. */
object EquipmentLedger {
    private val levelThresholds = listOf(0, 50, 150, 400, 1000)
    fun level(xp: Int): Int = levelThresholds.indexOfLast { xp >= it }.coerceAtLeast(0) + 1
    fun minXP(level: Int): Int = levelThresholds.getOrNull(level - 1) ?: 0
    fun reachable(companion: EquipmentCompanion, ownId: String?, xp: Int): Boolean =
        companion.id == ownId || level(xp) >= companion.requiredLevel

    fun state(item: EquipmentItem, companion: EquipmentCompanion, ownId: String?, xp: Int): EquipmentState {
        if (!reachable(companion, ownId, xp)) return EquipmentState.NeedsLevel(companion.requiredLevel,
            maxOf(item.unlockXP, minXP(companion.requiredLevel)) - xp)
        if (xp >= item.unlockXP) return EquipmentState.Owned
        if (item.unlockXP == 1 && xp == 0) return EquipmentState.FirstRead
        return EquipmentState.NeedsXP(item.unlockXP - xp)
    }

    fun order(companions: List<EquipmentCompanion>, ownId: String?): List<EquipmentCompanion> =
        companions.filter { it.id == ownId } + companions.withIndex().filter { it.value.id != ownId }
            .sortedWith(compareBy({ it.value.requiredLevel }, { it.index })).map { it.value }

    fun ownedIds(items: List<EquipmentItem>, companions: List<EquipmentCompanion>, ownId: String?, xp: Int): Set<String> {
        val byId = companions.associateBy { it.id }
        return items.filter { item -> byId[item.companionId]?.let { state(item, it, ownId, xp) == EquipmentState.Owned } == true }
            .mapTo(linkedSetOf()) { it.id }
    }

    fun nextProgress(items: List<EquipmentItem>, companion: EquipmentCompanion, ownId: String?, xp: Int): Pair<String, Float>? {
        if (!reachable(companion, ownId, xp)) return null
        val next = items.filter { it.companionId == companion.id && xp < it.unlockXP }.minByOrNull { it.unlockXP } ?: return null
        val previous = listOf(0, 1, 100, 200).lastOrNull { it < next.unlockXP } ?: 0
        return next.id to ((xp - previous).toFloat() / maxOf(1, next.unlockXP - previous)).coerceIn(0f, 1f)
    }

    fun isEquipped(itemId: String, ownedIds: Set<String>, unequippedIds: Set<String>): Boolean =
        itemId in ownedIds && itemId !in unequippedIds

    /** iOS deliberately permits every unlocked piece, including two tools sharing a body slot. */
    fun toggle(itemId: String, ownedIds: Set<String>, unequippedIds: Set<String>): Set<String>? {
        if (itemId !in ownedIds) return null
        return if (itemId in unequippedIds) unequippedIds - itemId else unequippedIds + itemId
    }
}

/** Small storage contract permits JVM tests of account switches without an Android preferences stub. */
interface EquipmentPreferences {
    fun read(key: String): Set<String>?
    fun write(key: String, values: Set<String>)
    fun remove(key: String)
}

class EquipmentOutfits(private val preferences: EquipmentPreferences) {
    private var owner: String? = null
    val unequippedIds: Set<String> get() = preferences.read(key(owner)) ?: emptySet()
    private fun key(owner: String?): String = "outfit." + (owner ?: "local")

    fun bind(newOwner: String?, inheritGuest: Boolean = false) {
        if (owner == null && newOwner != null && inheritGuest) {
            if (preferences.read(key(newOwner)) == null) preferences.write(key(newOwner), unequippedIds)
            preferences.remove(key(null))
        }
        owner = newOwner
    }

    fun toggle(itemId: String, ownedIds: Set<String>): Boolean {
        val updated = EquipmentLedger.toggle(itemId, ownedIds, unequippedIds) ?: return false
        preferences.write(key(owner), updated)
        return true
    }

    fun forget(userId: String) { preferences.remove(key(userId)) }
}
