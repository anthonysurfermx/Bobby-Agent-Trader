package xyz.bobbyprotocol.android.data

import kotlinx.coroutines.sync.Mutex

internal data class AccountVersion(val userId: String?, val epoch: Long)

/** All repositories in this app process share persistence and refresh serialization. */
internal object AccountFence {
    val lock = Any()
    val refreshMutex = Mutex()
    fun requireCurrent(expected: AccountVersion, memory: AccountVersion, persisted: AccountVersion) {
        if (expected != memory || expected != persisted) throw AccountChangedException()
    }
}
