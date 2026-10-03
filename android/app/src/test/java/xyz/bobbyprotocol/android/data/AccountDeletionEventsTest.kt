package xyz.bobbyprotocol.android.data

import org.junit.Assert.*
import org.junit.Test

class AccountDeletionEventsTest {
    @Test fun failingLegacyPushCleanupDoesNotPreventOtherOwnersLocalCleanup() {
        val events = AccountDeletionEvents()
        val delivered = mutableListOf<String>()
        var currentOwner: String? = "account-a"
        events.legacy = { deleted ->
            delivered.add("push:$deleted")
            currentOwner = "account-b"
            throw IllegalStateException("Push storage unavailable")
        }
        events.add { deleted ->
            delivered.add("journal:$deleted")
            throw IllegalStateException("Journal storage unavailable")
        }
        events.add { deleted -> delivered.add("reminders:$deleted") }

        // The repository has already confirmed this owner before clearing the session.
        val confirmedOwner = requireNotNull(currentOwner)
        currentOwner = null
        events.notifyDeleted(confirmedOwner)

        assertEquals("account-b", currentOwner)
        assertEquals(listOf("push:account-a", "journal:account-a", "reminders:account-a"), delivered)
    }

    @Test fun duplicateSubscriptionRunsOnceAndUnsubscribePreservesLegacyHook() {
        val events = AccountDeletionEvents()
        val delivered = mutableListOf<String>()
        val push: (String) -> Unit = { delivered.add("push:$it") }
        val journal: (String) -> Unit = { delivered.add("journal:$it") }
        events.legacy = push
        events.add(push)
        events.add(journal)
        events.add(journal)
        events.notifyDeleted("account-a")
        assertEquals(listOf("push:account-a", "journal:account-a"), delivered)

        delivered.clear()
        events.remove(journal)
        events.remove(push)
        events.remove(journal)
        events.notifyDeleted("account-b")
        assertEquals(listOf("push:account-b"), delivered)
        assertSame(push, events.legacy)
    }

    @Test fun SubscriptionChangesDuringDeliveryOnlyAffectTheNextConfirmedDeletion() {
        val events = AccountDeletionEvents()
        val delivered = mutableListOf<String>()
        val oldJournal: (String) -> Unit = { delivered.add("old-journal:$it") }
        val replacement: (String) -> Unit = { delivered.add("replacement:$it") }
        val newJournal: (String) -> Unit = { delivered.add("new-journal:$it") }
        events.legacy = { deleted ->
            delivered.add("push:$deleted")
            events.remove(oldJournal)
            events.add(newJournal)
            events.legacy = replacement
        }
        events.add(oldJournal)

        events.notifyDeleted("account-a")
        assertEquals(listOf("push:account-a", "old-journal:account-a"), delivered)
        delivered.clear()
        events.notifyDeleted("account-b")
        assertEquals(listOf("replacement:account-b", "new-journal:account-b"), delivered)
    }
}
