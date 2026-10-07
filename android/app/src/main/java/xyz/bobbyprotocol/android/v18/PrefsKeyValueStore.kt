package xyz.bobbyprotocol.android.v18

import android.annotation.SuppressLint
import android.content.Context

/**
 * Plain preferences (`bobby.v18`): what a person was shown and tapped, and the theses they wrote.
 * Writes are synchronous, like the app's other account data: a tap that retires a nudge must
 * survive the process dying right after it.
 */
class PrefsKeyValueStore(context: Context, name: String = "bobby.v18") : KeyValueStore {
    private val prefs = context.applicationContext.getSharedPreferences(name, Context.MODE_PRIVATE)

    override fun getString(key: String): String? = prefs.getString(key, null)

    @SuppressLint("ApplySharedPref")
    override fun putString(key: String, value: String) { prefs.edit().putString(key, value).commit() }

    @SuppressLint("ApplySharedPref")
    override fun remove(key: String) { prefs.edit().remove(key).commit() }
}
