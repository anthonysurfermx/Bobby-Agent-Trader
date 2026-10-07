package xyz.bobbyprotocol.android.equipment

import org.junit.Assert.*
import org.junit.Test

class EquipmentRulesTest {
    private val orb = EquipmentCompanion("orb", "BOBBY", 1)
    private val rook = EquipmentCompanion("rook", "ROOK", 4)
    private fun tool(id: String = "orb-1", companion: String = "orb", xp: Int = 1, slot: String = "hand") =
        EquipmentItem(id, companion, 1, false, xp, slot, "Tool", "Objeto", "", "", "", "")

    @Test fun firstReadAndActualXpThresholdsUnlockExactly() {
        assertEquals(EquipmentState.FirstRead, EquipmentLedger.state(tool(), orb, "orb", 0))
        assertEquals(EquipmentState.Owned, EquipmentLedger.state(tool(), orb, "orb", 1))
        assertEquals(EquipmentState.NeedsXP(1), EquipmentLedger.state(tool("orb-2", xp = 100), orb, "orb", 99))
        assertEquals(EquipmentState.Owned, EquipmentLedger.state(tool("orb-2", xp = 100), orb, "orb", 100))
        assertEquals(EquipmentState.NeedsXP(1), EquipmentLedger.state(tool("pet-orb", xp = 500), orb, "orb", 499))
    }

    @Test fun ownCompanionBypassesLevelButOtherCompanionsRemainLocked() {
        val item = tool("rook-1", "rook")
        assertEquals(EquipmentState.NeedsLevel(4, 399), EquipmentLedger.state(item, rook, "orb", 1))
        assertEquals(EquipmentState.Owned, EquipmentLedger.state(item, rook, "rook", 1))
        assertEquals(EquipmentState.Owned, EquipmentLedger.state(item, rook, "orb", 400))
    }

    @Test fun allFourItemsCanBeEquippedAndTwoHandToolsDoNotEvictEachOther() {
        val owned = setOf("glitch-1", "glitch-2", "glitch-3", "pet-glitch")
        owned.forEach { assertTrue(EquipmentLedger.isEquipped(it, owned, emptySet())) }
        val disabled = EquipmentLedger.toggle("glitch-1", owned, emptySet())!!
        assertTrue(EquipmentLedger.isEquipped("glitch-2", owned, disabled))
        assertEquals(emptySet<String>(), EquipmentLedger.toggle("glitch-1", owned, disabled))
        assertNull(EquipmentLedger.toggle("unknown", owned, disabled))
    }

    @Test fun accountSwitchDoesNotBorrowOtherOutfitsAndReturningOwnerRestoresOwn() {
        val preferences = MemoryPreferences()
        val outfits = EquipmentOutfits(preferences)
        outfits.bind("A"); assertTrue(outfits.toggle("orb-1", setOf("orb-1")))
        outfits.bind("B"); assertTrue(outfits.unequippedIds.isEmpty())
        outfits.bind("A"); assertEquals(setOf("orb-1"), outfits.unequippedIds)
        outfits.bind(null); assertTrue(outfits.unequippedIds.isEmpty())
        outfits.forget("A"); outfits.bind("A"); assertTrue(outfits.unequippedIds.isEmpty())
    }

    @Test fun guestOutfitTransfersOnlyToNewAccountAndExistingAccountWins() {
        val preferences = MemoryPreferences()
        val outfits = EquipmentOutfits(preferences)
        outfits.toggle("orb-1", setOf("orb-1")); outfits.bind("A", inheritGuest = true)
        assertEquals(setOf("orb-1"), outfits.unequippedIds)
        outfits.bind(null); outfits.toggle("orb-2", setOf("orb-2"))
        outfits.bind("A", inheritGuest = true)
        assertEquals(setOf("orb-1"), outfits.unequippedIds)
        outfits.bind(null); assertTrue(outfits.unequippedIds.isEmpty())
    }

    @Test fun ownPageSortAndNextDropProgressMatchIos() {
        assertEquals(listOf("rook", "orb"), EquipmentLedger.order(listOf(orb, rook), "rook").map { it.id })
        val items = listOf(tool(), tool("orb-2", xp = 100), tool("orb-3", xp = 200))
        val next = EquipmentLedger.nextProgress(items, orb, "orb", 150)!!
        assertEquals("orb-3", next.first); assertEquals(.5f, next.second, 0f)
    }

    private class MemoryPreferences : EquipmentPreferences {
        private val values = mutableMapOf<String, Set<String>>()
        override fun read(key: String): Set<String>? = values[key]
        override fun write(key: String, values: Set<String>) { this.values[key] = values.toSet() }
        override fun remove(key: String) { values.remove(key) }
    }
}
