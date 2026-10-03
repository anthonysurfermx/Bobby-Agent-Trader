package xyz.bobbyprotocol.android.data

import java.util.concurrent.CopyOnWriteArraySet

/** Native cleanup only. Each callback receives the confirmed deleted owner, never the next session. */
internal class AccountDeletionEvents {
    @Volatile var legacy: ((String) -> Unit)? = null
    private val listeners = CopyOnWriteArraySet<(String) -> Unit>()

    fun add(listener: (String) -> Unit) { listeners.add(listener) }
    fun remove(listener: (String) -> Unit) { listeners.remove(listener) }

    fun notifyDeleted(ownerUserId: String) {
        // Snapshot before delivery: changing subscriptions inside a callback affects the next event.
        // A callback registered through both APIs still runs once for this event.
        val callbacks = LinkedHashSet<(String) -> Unit>()
        legacy?.let(callbacks::add)
        callbacks.addAll(listeners.toList())
        callbacks.forEach { callback -> runCatching { callback(ownerUserId) } }
    }
}
