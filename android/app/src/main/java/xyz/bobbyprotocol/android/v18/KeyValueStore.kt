package xyz.bobbyprotocol.android.v18

/**
 * The little the 1.8 stores need from the phone: strings by key. Logic stays free of Android
 * classes so it runs in plain JVM unit tests; [PrefsKeyValueStore] is the real one.
 */
interface KeyValueStore {
    fun getString(key: String): String?
    fun putString(key: String, value: String)
    fun remove(key: String)
}

/** For tests, and for a session that must keep nothing. */
class MemoryKeyValueStore : KeyValueStore {
    private val values = HashMap<String, String>()
    override fun getString(key: String): String? = values[key]
    override fun putString(key: String, value: String) { values[key] = value }
    override fun remove(key: String) { values.remove(key) }
}
