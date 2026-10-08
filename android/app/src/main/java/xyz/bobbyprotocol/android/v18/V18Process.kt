package xyz.bobbyprotocol.android.v18

import android.content.Context

/**
 * What outlives one MainActivity. A rotation or a font-size change rebuilds the activity, the
 * session and the page, and there is no Application class to hold anything: the nudge centre's
 * moment (the read a line on the glass may talk about), the last reads' summaries and a tapped
 * notification that has not opened yet live here, in the process, and nowhere else. Nothing here
 * is written to disk except through the `bobby.v18` store. Main thread only.
 */
object V18Process {
    private var sharedStore: KeyValueStore? = null
    private var sharedNudges: NudgeCenter? = null

    /** The last reads of the current reader; emptied when the reader changes. */
    val shelf = ReadShelf()
    /** A tapped notification or an opened link waiting for the glass. */
    val taps = V18Taps()
    /** The host on screen, for a notice that comes due while the app is in front. */
    @Volatile var runtime: V18Runtime? = null

    @Synchronized fun store(context: Context): KeyValueStore = sharedStore ?: PrefsKeyValueStore(context).also { sharedStore = it }
    @Synchronized fun nudges(context: Context): NudgeCenter = sharedNudges ?: NudgeCenter(store(context)).also { sharedNudges = it }
}
