package xyz.bobbyprotocol.android.v18

/**
 * What MainActivity may do with the intent it is handed. Pure, so each rule is a JVM test: the
 * activity only reads its `savedInstanceState`, the intent's flags and the link's path, and asks here.
 */
object LaunchIntent {
    /**
     * `onCreate` acts on its intent only the first time the activity is created. An activity the
     * system rebuilds (a configuration change it does not handle itself, or a process it had killed
     * and now restores) is handed the intent that first started it, exactly as it was delivered
     * then: the link, the sign-in callback or the tapped notice in it was honoured the first time
     * and is never honoured twice. `restored` is `savedInstanceState != null`.
     */
    fun isFirstDelivery(restored: Boolean): Boolean = !restored

    /**
     * A link or a tapped notice that comes back when the system rebuilds a task from the recents
     * list (`FLAG_ACTIVITY_LAUNCHED_FROM_HISTORY`) is not a tap of the person's.
     */
    fun isPersonsTap(fromHistory: Boolean): Boolean = !fromHistory

    /**
     * The one kind of bobbyprotocol.xyz page the manifest opens in the app: an invitation,
     * `/i/CODE`. Any app on the phone can start the activity with another path; it is not forwarded.
     */
    fun isInvitationPath(path: String?): Boolean = path != null && path.startsWith(INVITATION_PREFIX) && path.length > INVITATION_PREFIX.length

    const val INVITATION_PREFIX = "/i/"
}
