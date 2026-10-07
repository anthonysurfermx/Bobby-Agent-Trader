package xyz.bobbyprotocol.android.v18.invite

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withTimeoutOrNull
import kotlinx.coroutines.yield
import org.json.JSONObject
import xyz.bobbyprotocol.android.data.ApiException
import xyz.bobbyprotocol.android.v18.NucleoNudge
import xyz.bobbyprotocol.android.v18.NudgePriority
import xyz.bobbyprotocol.android.v18.NudgeSource
import xyz.bobbyprotocol.android.v18.V18Host
import xyz.bobbyprotocol.android.v18.credits.CreditsCenter
import xyz.bobbyprotocol.android.v18.credits.HostWords
import xyz.bobbyprotocol.android.v18.credits.Referral
import xyz.bobbyprotocol.android.v18.credits.SignInReturn
import xyz.bobbyprotocol.android.v18.credits.Words
import java.io.IOException
import java.util.Locale

// Invitations on the glass (1.8), owned by the `credits-invite` track. A port of
// ios/Bobby/Sources/V18/Invite/InviteNudges.swift. One line, in two moments:
//   nobody signed in, an invitation waiting   "A friend invited you to Bobby" → Accept → the invite
//                                             sheet with the saved invitation and the way to sign in
//   an account, an answer nobody has read     "The invitation you received was (not) accepted" → the
//                                             invite sheet with the reason in words
// With an account the claim simply happens (InviteLinkCenter); the glass only reports its answer.
//
// Where Android differs: on iOS "Accept" raises Apple's sheet over the glass and waits for it. Here
// sign-in is a browser tab with two providers to choose from, so "Accept" opens the invite sheet,
// where the two buttons are; once the account arrives the claim runs and the sheet comes back with
// what the server answered (InviteDesk).

/** The reward sentence and the share text, from the server's own numbers (InviteSheetSections.swift). */
object InviteCopy {
    /** The server's numbers for the reward sentence. */
    data class Terms(val days: Int, val max: Int)

    /** The one line on the face: who gets what, for which accounts. */
    fun rewardShort(days: Int, words: Words): String =
        words.text("You get {0} Pro days per new account.", "Recibes {0} días Pro por cada cuenta nueva.", days)

    /** Who gets what. The friend who sends the invitation is the one rewarded. */
    fun reward(days: Int, max: Int, words: Words): String =
        words.text("You get {0} days of Bobby Pro for each friend who creates an account with your invitation, up to {1} friends.",
                   "Recibes {0} días de Bobby Pro por cada amigo que crea su cuenta con tu invitación, hasta {1} amigos.", days, max)

    /** The text that travels with the link: a friend who installs the app can type the code. */
    fun shareMessage(code: String?, words: Words): String {
        val pitch = words.text("Bobby: three AI agents debate any stock or crypto before you decide.",
                               "Bobby: tres agentes de IA debaten cualquier acción o cripto antes de que decidas.")
        if (code == null) return pitch
        return pitch + "\n" + words.text("My invitation code: {0}", "Mi código de invitación: {0}", code)
    }

    /** The server's numbers, or null while the app does not have them (never a guessed figure). */
    fun rewardTerms(referral: Referral?, planDays: Int?, planMax: Int): Terms? {
        val own = referral?.rewardDays
        if (referral != null && own != null && own > 0 && referral.max > 0) return Terms(own, referral.max)
        if (planDays != null && planDays > 0 && planMax > 0) return Terms(planDays, planMax)
        return null
    }
}

/**
 * The invitation feature as the app runs it: the centre, the host's hooks that feed it, and the
 * sheet that comes back after a sign-in. One per host (`InviteDesk.of(host)`).
 */
class InviteDesk(
    private val host: V18Host,
    credits: CreditsCenter,
    send: suspend (code: String, user: String, epoch: Long) -> InviteReply,
) {
    private val mutableRevision = MutableStateFlow(0)
    /** Changes whenever anything the invite sheet draws from the centre may have changed. */
    val revision: StateFlow<Int> = mutableRevision.asStateFlow()
    private var pageTold = true
    private var started = false

    val back = SignInReturn(host, ROUTE)

    val center = InviteLinkCenter(
        disk = host.store, scope = host.scope, now = { host.now() }, riskAccepted = { host.riskAccepted },
        currentUser = { host.owner }, currentEpoch = { host.accountEpoch }, send = send,
        // Levels and access are read again after an accepted invitation.
        afterClaim = { credits.load() },
        onChange = { changed() },
    )

    /** Once per host: links, account changes and returns to the front reach the centre, and a kept invitation is tried again. */
    fun start() {
        if (started) return
        started = true
        // Only an invitation link is kept; any other link is left for whoever wants it.
        host.onLink { url -> center.receive(url) }
        host.onAccountChanged { accountChanged() }
        host.onAppActive { center.appBecameActive() }
        host.onAccountDeleted { deleted -> center.forgetAccount(deleted) }
        center.wake()
    }

    /** A sign-in asked for from the invite sheet. */
    fun signIn(provider: String) {
        // Nothing of the person's goes to a server before the notice.
        if (!host.riskAccepted) return
        back.arm()
        host.signIn(provider)
    }

    /** The invite sheet left the screen. */
    fun screenGone() {
        // Closed before any account arrived: nothing waits for a sign-in any more.
        if (!host.signedIn) back.disarm()
        // The result line was on screen: it is said once. A sheet that closed only because the
        // account arrived is coming back with its answer, so nothing was read yet.
        if (!back.isPending) center.acknowledgeNotice()
    }

    private fun accountChanged() {
        center.accountDidChange()
        // The person signed in from the invite sheet: claim, then say in words what happened.
        back.accountChanged { center.acceptPending() }
    }

    private fun changed() {
        mutableRevision.value += 1
        // The line on the glass may have changed too. Told once per turn, after the centre has settled.
        if (!pageTold) return
        pageTold = false
        host.scope.launch {
            yield()
            pageTold = true
            host.sessionChanged()
        }
    }

    companion object {
        const val SERVICE = "v18.invite"
        const val ROUTE = "invite"
        const val TIMEOUT = 20_000L

        /** The desk of this host, with the app's own request. */
        fun of(host: V18Host): InviteDesk = host.service(SERVICE) { InviteDesk(host, CreditsCenter.of(host), liveSender(host)) }

        /** A suite's own request. The first call for a host decides which one it gets. */
        fun of(host: V18Host, credits: CreditsCenter, send: suspend (code: String, user: String, epoch: Long) -> InviteReply): InviteDesk =
            host.service(SERVICE) { InviteDesk(host, credits, send) }

        /**
         * POST /api/bobby-access {action: "referral-claim", code} with that account's own bearer. A
         * refusal comes back with its status and whatever the server said; anything else is thrown.
         */
        fun liveSender(host: V18Host): suspend (code: String, user: String, epoch: Long) -> InviteReply = { code, user, epoch ->
            val body = JSONObject().put("action", "referral-claim").put("code", code)
            try {
                val json = withTimeoutOrNull(TIMEOUT) { host.repository.requestForAccount(user, epoch, "api/bobby-access", "POST", body) }
                    ?: throw IOException("The invitation request timed out")
                InviteReply(json, 200)
            } catch (refused: ApiException) {
                InviteReply(refused.payload, refused.status)
            }
        }
    }
}

object InviteNudges {
    const val KEY = "invite"
    const val RESULT_PREFIX = "invite.result."

    /** The app's own: the desk claims through the repository. */
    fun register(host: V18Host) {
        register(host, InviteDesk.of(host))
    }

    /** `desk` is the app's own unless a suite hands its own in. */
    fun register(host: V18Host, desk: InviteDesk) {
        // The Núcleo is starting: an invitation kept from an earlier run is tried again and a
        // sign-in is seen even before the glass first asks.
        desk.start()
        host.nudges.register(source(host, desk))
    }

    /** The centre is read when the glass asks, never when the source is built. */
    fun source(host: V18Host, desk: InviteDesk): NudgeSource {
        val words = HostWords(host)
        return NudgeSource(KEY, NudgePriority.INVITE,
            candidate = { moment -> nudge(moment.signedIn, desk.center.waiting, desk.center.unreadAnswer, words) },
            // Either line opens the invite sheet: the answer in words, or the saved invitation with
            // the way to sign in and "Remove". The tap has already retired the line on the glass,
            // and nothing else would mention the invitation again until its link is opened once more.
            act = { host.present(InviteDesk.ROUTE) })
    }

    /**
     * The id carries the code and the moment the invitation arrived (or was answered): another
     * friend's invitation is a new nudge, and so is the same link opened again by the person.
     */
    fun nudge(signedIn: Boolean, waiting: InvitePending?, answer: InviteAnswer?, words: Words): NucleoNudge? {
        if (signedIn) {
            if (answer == null) return null
            val accepted = answer.notice == InviteNotice.ACCEPTED
            return NucleoNudge(
                RESULT_PREFIX + answer.code.lowercase(Locale.ROOT) + "." + stamp(answer.atMillis),
                if (accepted) words.text("The invitation you received was accepted", "La invitación que recibiste fue aceptada")
                else words.text("The invitation you received was not accepted", "La invitación que recibiste no fue aceptada"),
                if (accepted) words.text("See details", "Ver detalles") else words.text("See why", "Ver por qué"))
        }
        if (waiting == null) return null
        return NucleoNudge("invite." + waiting.code.lowercase(Locale.ROOT) + "." + stamp(waiting.atMillis),
                           words.text("A friend invited you to Bobby", "Un amigo te invitó a Bobby"), words.text("Accept", "Aceptar"))
    }

    /** Seconds in base 36 (lowercase letters and digits): short, and inside the id's alphabet. */
    fun stamp(millis: Long): String = java.lang.Long.toString((millis / 1000L).coerceIn(0L, 99_999_999_999L), 36)
}
