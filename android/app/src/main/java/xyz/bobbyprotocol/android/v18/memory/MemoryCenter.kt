package xyz.bobbyprotocol.android.v18.memory

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import org.json.JSONObject
import xyz.bobbyprotocol.android.data.ApiException
import xyz.bobbyprotocol.android.v18.MemoryReceipts
import xyz.bobbyprotocol.android.v18.V18Host
import xyz.bobbyprotocol.android.v18.theses.HostWords
import xyz.bobbyprotocol.android.v18.theses.ThesisCopy
import java.net.URLEncoder
import java.util.Locale
import java.util.WeakHashMap

// Account memory on the phone (1.8), a port of ios/Bobby/Sources/Briefings/MemoryCenter.swift:
// see, correct, pause and delete what Bobby remembers about a signed-in account, through /api/memory:
//   GET → {enabled, prefs:{horizon, experience, risk}, assets:[{symbol, asks, lastAskedAt, lastHorizon}], retentionDays}
//   PATCH {horizon?|experience?|risk?: enum|null, memoryEnabled?: bool} → same body
//   DELETE ?symbol=X → forget one asset; DELETE (no symbol) → forget everything. Both answer the same body.
// Invariants:
//  - Only the native opt-in bit is kept on the phone, per account; memory data stays on the server.
//  - The bit alone affirms nothing. It counts only under this account's accepted record for the
//    consent as it reads today (`MemoryConsent`). A bit without that record (the 1.1.4 switch, or a
//    yes to an older wording) is turned off the moment it is read, so the opt-in header stops and
//    the person is asked again through the consent sheet.
//  - The snapshot is cleared at once on an account change. Every answer is checked against the
//    account it was asked for and late answers are dropped.
//  - Writes are explicit corrections, one at a time, shown only after the server answers.
//  - "Delete everything" needs a confirmation: `requestForgetAll` only arms it; `confirmForgetAll` sends.
//  - Deletion is complete. "Forget" also takes the asset out of this phone's shortcuts, and "Delete
//    everything" also clears them, the theses written on this phone and what the follow-ups learned,
//    for this account only. The phone's part runs first and needs no network; `notice` says
//    honestly whether the server confirmed its part.
//  - No network before the risk notice is accepted; signed out = no calls.
//  - The server's text is never shown; failures map to the app's own copy.

data class RememberedAsset(
    val symbol: String,
    val asks: Int,
    val lastAskedAtMillis: Long?,
    /** `intraday` | `week` | `month` | `long` | `unspecified`. */
    val lastHorizon: String,
)

/** GET/PATCH/DELETE /api/memory body, parsed leniently. */
data class MemorySnapshot(
    val enabled: Boolean = true,
    val horizon: String? = null,
    val experience: String? = null,
    val risk: String? = null,
    val assets: List<RememberedAsset> = emptyList(),
    val retentionDays: Int = 90,
) {
    fun value(field: MemoryPref): String? = when (field) {
        MemoryPref.HORIZON -> horizon
        MemoryPref.EXPERIENCE -> experience
        MemoryPref.RISK -> risk
    }

    companion object {
        val HORIZONS: List<String> = listOf("intraday", "week", "month", "long")
        val EXPERIENCES: List<String> = listOf("new", "some", "experienced")
        val RISKS: List<String> = listOf("low", "medium", "high")
        val SYMBOL_PATTERN = Regex("^[A-Z0-9.^=-]{1,20}$")

        fun fromJson(json: JSONObject?): MemorySnapshot? {
            if (json == null) return null
            val enabled = json.opt("enabled") as? Boolean ?: return null
            val prefs = json.optJSONObject("prefs")
            val assets = ArrayList<RememberedAsset>()
            val array = json.optJSONArray("assets")
            if (array != null) {
                for (index in 0 until array.length()) {
                    val item = array.optJSONObject(index) ?: continue
                    val symbol = string(item, "symbol")?.takeIf { SYMBOL_PATTERN.matches(it) } ?: continue
                    assets.add(RememberedAsset(symbol, MemoryReceipts.count(item.opt("asks")) ?: 0,
                                               string(item, "lastAskedAt")?.let { ThesisCopy.instant(it) }, string(item, "lastHorizon") ?: "unspecified"))
                }
            }
            return MemorySnapshot(
                enabled = enabled,
                horizon = string(prefs, "horizon")?.takeIf { it in HORIZONS },
                experience = string(prefs, "experience")?.takeIf { it in EXPERIENCES },
                risk = string(prefs, "risk")?.takeIf { it in RISKS },
                assets = assets,
                retentionDays = MemoryReceipts.count(json.opt("retentionDays"))?.takeIf { it > 0 } ?: 90,
            )
        }

        private fun string(json: JSONObject?, key: String): String? {
            if (json == null || json.isNull(key)) return null
            return (json.opt(key) as? String)?.takeIf { it.isNotEmpty() }
        }
    }
}

enum class MemoryPref(val raw: String) {
    HORIZON("horizon"), EXPERIENCE("experience"), RISK("risk");

    val allowed: List<String>
        get() = when (this) {
            HORIZON -> MemorySnapshot.HORIZONS
            EXPERIENCE -> MemorySnapshot.EXPERIENCES
            RISK -> MemorySnapshot.RISKS
        }
}

/**
 * What this phone keeps for whoever is using it (the signed-in account, or the signed-out phone)
 * with no copy on Bobby's servers: the recent assets shown as shortcuts and how many theses the
 * person wrote here. A thesis's text does leave the phone inside a review the person starts.
 */
data class LocalMemory(val shortcuts: List<String> = emptyList(), val theses: Int = 0)

/** How the last deletion ended. The phone's part is done before the server is asked. */
sealed class MemoryNotice {
    /** Server memory, shortcuts and theses are gone. */
    data object ErasedEverything : MemoryNotice()
    /** The phone's part is gone; the server did not confirm its part. */
    data object ErasedOnPhoneOnly : MemoryNotice()
    /** The asset left this phone's shortcuts; the server did not confirm it forgot it. */
    data class ForgotOnPhoneOnly(val symbol: String) : MemoryNotice()
}

enum class MemoryError { SIGNED_OUT, UNAVAILABLE, REJECTED }

/** One answer of /api/memory: its body when it had one, and its HTTP status. */
class MemoryReply(val json: JSONObject?, val status: Int)

/** The network and the stored opt-in bit, behind a door a unit test can stand in for. */
interface MemoryGateway {
    /** One call to /api/memory (`path` may carry a query). Throws when no answer came. */
    suspend fun send(path: String, method: String, body: JSONObject?): MemoryReply
    /** The account whose switch the two calls below read and write, or null signed out. */
    fun account(): String?
    /** The stored native opt-in of that account (false signed out). */
    fun nativeOptIn(): Boolean
    /** Stores it for that account. Turning it on throws without the risk notice. */
    fun setNativeOptIn(enabled: Boolean)
}

/** The app's gateway: `BobbyRepository`, which fences every call by the account epoch. */
class RepositoryMemoryGateway(private val host: V18Host) : MemoryGateway {
    override suspend fun send(path: String, method: String, body: JSONObject?): MemoryReply = try {
        MemoryReply(host.repository.request(path, method, body, authenticated = true), 200)
    } catch (refused: ApiException) {
        MemoryReply(refused.payload, refused.status)
    }

    override fun account(): String? = host.repository.session.value?.userId

    override fun nativeOptIn(): Boolean = host.repository.nativeMemoryOptIn()

    override fun setNativeOptIn(enabled: Boolean) {
        host.repository.setNativeMemoryOptIn(enabled)
    }
}

class MemoryCenter(
    private val host: V18Host,
    private val gateway: MemoryGateway,
    /** The consent text this build shows. Tests raise it to stand for a reworded sheet. */
    var consentVersion: Int = MemoryConsent.CURRENT_VERSION,
) {
    /** Goes up on every change the screen should redraw for. */
    val changes = MutableStateFlow(0)

    var snapshot: MemorySnapshot? = null
        private set
    var loading = false
        private set
    /** A write is in flight (one at a time). */
    var saving = false
        private set
    var lastError: MemoryError? = null
        private set
    /** "Delete everything" was asked for and waits for its confirmation. */
    var confirmingForgetAll = false
        private set
    /** Separate from the server's shared web/account preference. Off for every account on this phone until it says yes. */
    var nativeOptedIn = false
        private set
    /** What this phone alone keeps for the reader. Read from the phone; never from the server. */
    var local = LocalMemory()
        private set
    /** How the last "Forget" or "Delete everything" ended, until the next action or account change. */
    var notice: MemoryNotice? = null
        private set

    /** This centre's consent store: the record the capture gate reads and the sheet writes. */
    val consent: MemoryConsent get() = MemoryConsent(host.store, consentVersion)

    fun currentUser(): String? = host.owner
    fun currentEpoch(): Long = host.accountEpoch
    fun now(): Long = host.now()

    private var owner: String? = host.owner
    private var ownerEpoch: Long = host.accountEpoch
    private var generation = 0

    private class Ticket(val generation: Int, val user: String?, val epoch: Long)
    private class Answer(val snapshot: MemorySnapshot?, val error: MemoryError?)

    init {
        nativeOptedIn = owner?.let { consentedOptIn(it) } ?: false
        local = readLocal()
    }

    /** Clears everything when the account (or its epoch) changed. */
    fun accountChanged(force: Boolean = false) {
        if (!force && owner == host.owner && ownerEpoch == host.accountEpoch) return
        owner = host.owner
        ownerEpoch = host.accountEpoch
        generation += 1
        nativeOptedIn = owner?.let { consentedOptIn(it) } ?: false
        snapshot = null
        loading = false
        saving = false
        lastError = null
        confirmingForgetAll = false
        notice = null
        local = readLocal()
        changed()
    }

    /** What the current reader erased during this launch (`erased`); nothing signed out, where there is no memory to erase. */
    private fun erasedMarks(): ErasedThisLaunch.Marks? = host.owner?.let { ErasedThisLaunch.of(host.nudges, it) }

    private fun ticket(): Ticket = Ticket(generation, host.owner, host.accountEpoch)
    private fun isCurrent(ticket: Ticket): Boolean =
        ticket.generation == generation && ticket.user == host.owner && ticket.epoch == host.accountEpoch

    private val canCallServer: Boolean get() = host.riskAccepted && host.owner != null

    /**
     * The stored switch is the repository's, kept for ITS account. For the instant in which the
     * repository already has another account than the reader this centre knows, the switch is not
     * this reader's: it is neither read as theirs nor written for them.
     */
    private fun switchIsOf(user: String?): Boolean = user != null && try {
        gateway.account() == user
    } catch (_: Exception) {
        false
    }

    /** The stored switch of the current reader, as it is (the nudge on the glass reads it with the consent). */
    fun storedNativeOptIn(): Boolean = switchIsOf(host.owner) && try {
        gateway.nativeOptIn()
    } catch (_: Exception) {
        false
    }

    private fun storeNativeOptIn(enabled: Boolean): Boolean {
        if (!switchIsOf(host.owner)) return false
        return try {
            gateway.setNativeOptIn(enabled)
            true
        } catch (_: Exception) {
            false
        }
    }

    /**
     * The switch counts only under a yes to the consent as it reads today. A switch found without
     * one is turned off here: nothing keeps affirming an opt-in the person never gave to this text.
     */
    private fun consentedOptIn(user: String): Boolean {
        if (user != host.owner || !storedNativeOptIn()) return false
        if (!consent.hasAccepted(user)) {
            storeNativeOptIn(false)
            return false
        }
        return true
    }

    /**
     * Reads the switch and the consent again for the current account (the app came to the front, the
     * memory screen appeared), so a stale or missing consent turns capture off before anything is sent.
     */
    private fun reconcileConsent() {
        val on = host.owner?.let { consentedOptIn(it) } ?: false
        if (on != nativeOptedIn) {
            nativeOptedIn = on
            changed()
        }
    }

    private fun revokeNativeCapture() {
        nativeOptedIn = false
        if (host.owner != null) storeNativeOptIn(false)
    }

    /**
     * Whether a desk question of the current account may carry the opt-in. The transport reads the
     * stored switch by itself; this keeps that switch true to the consent and says what it now is.
     */
    fun allowsNativeCapture(): Boolean {
        accountChanged()
        reconcileConsent()
        return nativeOptedIn && host.riskAccepted && owner == host.owner && ownerEpoch == host.accountEpoch
    }

    // Reads

    suspend fun refresh(): Boolean {
        accountChanged()
        reconcileConsent()
        if (!canCallServer) {
            if (host.owner == null) {
                lastError = MemoryError.SIGNED_OUT
                changed()
            }
            return false
        }
        val asked = ticket()
        loading = true
        changed()
        val answer = try {
            call(PATH, "GET", null)
        } catch (cancelled: CancellationException) {
            if (isCurrent(asked)) {
                loading = false
                changed()
            }
            throw cancelled
        }
        if (!isCurrent(asked)) return false
        loading = false
        return absorb(answer)
    }

    // Corrections

    /**
     * Pause (false) or resume (true) shared account memory. Revocation is local before the network
     * call: an offline PATCH cannot leave the phone recording after the person switched it off.
     */
    suspend fun setEnabled(on: Boolean): Boolean {
        accountChanged()
        if (!on) {
            revokeNativeCapture()
            changed()
        }
        return write("PATCH", PATH, JSONObject().put("memoryEnabled", on))
    }

    /**
     * Opt this phone's questions in separately from web memory. Turning it off is immediate and needs
     * no network. A server-side pause always wins; it also clears this switch when seen on refresh.
     */
    fun setNativeCapture(on: Boolean): Boolean {
        accountChanged()
        if (!on) {
            revokeNativeCapture()
            changed()
            return true
        }
        if (!canCallServer || saving || snapshot?.enabled != true || !storeNativeOptIn(true)) {
            lastError = if (host.owner == null) MemoryError.SIGNED_OUT else MemoryError.REJECTED
            changed()
            return false
        }
        nativeOptedIn = true
        lastError = null
        changed()
        return true
    }

    /** Set or clear (null) one preference. Values outside the server's enums are refused locally. */
    suspend fun setPref(field: MemoryPref, value: String?): Boolean {
        if (value != null && value !in field.allowed) return false
        return write("PATCH", PATH, JSONObject().put(field.raw, value ?: JSONObject.NULL))
    }

    /**
     * Forget one remembered asset: first on this phone (its shortcut, no network needed), then on the
     * server. True when the server confirmed; otherwise `notice` says its part is still there.
     */
    suspend fun forget(symbol: String): Boolean {
        if (!MemorySnapshot.SYMBOL_PATTERN.matches(symbol)) return false
        accountChanged()
        val user = host.owner
        if (user == null) {
            lastError = MemoryError.SIGNED_OUT
            changed()
            return false
        }
        if (saving) return false
        val epoch = host.accountEpoch
        notice = null
        host.forgetShortcut(symbol)
        erasedMarks()?.let { it.assets[symbol.uppercase(Locale.ROOT)] = host.now() }
        local = readLocal()
        changed()
        val ok = write("DELETE", PATH + "?symbol=" + URLEncoder.encode(symbol, "UTF-8"), null)
        if (host.owner != user || host.accountEpoch != epoch) return false
        if (!ok) {
            notice = MemoryNotice.ForgotOnPhoneOnly(symbol)
            changed()
        }
        return ok
    }

    /**
     * Arms "Delete everything"; nothing is deleted until `confirmForgetAll`. It needs an account but
     * not a loaded snapshot: the phone's part must be erasable while the server is unreachable.
     */
    fun requestForgetAll() {
        accountChanged()
        if (host.owner == null) return
        confirmingForgetAll = true
        changed()
    }

    fun cancelForgetAll() {
        confirmingForgetAll = false
        changed()
    }

    /**
     * The confirmed "Delete everything": this account's shortcuts and theses on this phone and what
     * every other 1.8 feature keeps for it (`eraseEverything`), then every asset and preference on
     * the server (a paused memory stays paused). True when the server confirmed.
     */
    suspend fun confirmForgetAll(): Boolean {
        accountChanged()
        if (!confirmingForgetAll) return false
        confirmingForgetAll = false
        val user = host.owner
        if (user == null || saving) {
            changed()
            return false
        }
        val epoch = host.accountEpoch
        notice = null
        host.clearShortcuts()
        host.theses.deleteAll(user)
        // What the follow-ups learned on this phone goes too, with what they planned.
        host.eraseEverything()
        erasedMarks()?.all = host.now()
        local = readLocal()
        changed()
        val ok = write("DELETE", PATH, null)
        if (host.owner != user || host.accountEpoch != epoch) return false
        notice = if (ok) MemoryNotice.ErasedEverything else MemoryNotice.ErasedOnPhoneOnly
        changed()
        return ok
    }

    // This phone only

    /** Reads the phone's own caches again (the screen appeared, a thesis was written elsewhere). */
    fun reloadLocal() {
        accountChanged()
        reconcileConsent()
        val fresh = readLocal()
        if (fresh != local) {
            local = fresh
            changed()
        }
    }

    /**
     * Clears the shortcut row of whoever is using this phone (the account, or the signed-out phone's
     * own row). Nothing is sent by this screen, so it needs neither an account nor the network.
     */
    fun clearShortcuts() {
        accountChanged()
        host.clearShortcuts()
        local = readLocal()
        changed()
    }

    /**
     * A receipt on the glass stops being true once the person erased what it names: true when this
     * account erased everything, or this asset, at or after `sinceMillis` during this launch.
     */
    fun erased(sinceMillis: Long, symbol: String): Boolean {
        accountChanged()
        val marks = erasedMarks() ?: return false
        val all = marks.all
        if (all != null && all >= sinceMillis) return true
        val one = marks.assets[symbol.uppercase(Locale.ROOT)]
        return one != null && one >= sinceMillis
    }

    /** Signed out, the phone still keeps a row and theses of its own: they show too. */
    private fun readLocal(): LocalMemory = LocalMemory(host.shortcuts, host.theses.all(host.owner).size)

    private suspend fun write(method: String, path: String, body: JSONObject?): Boolean {
        accountChanged()
        if (!canCallServer) {
            if (host.owner == null) {
                lastError = MemoryError.SIGNED_OUT
                changed()
            }
            return false
        }
        if (saving) return false
        val asked = ticket()
        saving = true
        lastError = null
        changed()
        val answer = try {
            call(path, method, body)
        } catch (cancelled: CancellationException) {
            if (isCurrent(asked)) {
                saving = false
                changed()
            }
            throw cancelled
        }
        if (!isCurrent(asked)) return false
        saving = false
        return absorb(answer)
    }

    // Plumbing

    private suspend fun call(path: String, method: String, body: JSONObject?): Answer = try {
        val reply = gateway.send(path, method, body)
        when (reply.status) {
            in 200..299 -> MemorySnapshot.fromJson(reply.json)?.let { Answer(it, null) } ?: Answer(null, MemoryError.UNAVAILABLE)
            401 -> Answer(null, MemoryError.SIGNED_OUT)
            400, 403, 404, 405, 409, 413, 422 -> Answer(null, MemoryError.REJECTED)
            else -> Answer(null, MemoryError.UNAVAILABLE)
        }
    } catch (cancelled: CancellationException) {
        throw cancelled
    } catch (_: Exception) {
        Answer(null, MemoryError.UNAVAILABLE)
    }

    private fun absorb(answer: Answer): Boolean {
        val loaded = answer.snapshot
        if (loaded == null) {
            lastError = answer.error ?: MemoryError.UNAVAILABLE
            changed()
            return false
        }
        snapshot = loaded
        if (!loaded.enabled) revokeNativeCapture()
        lastError = null
        changed()
        return true
    }

    private fun changed() {
        changes.value = changes.value + 1
    }

    companion object {
        const val PATH = "api/memory"
        const val SERVICE = "memory.center"

        /** The one centre of a host: its nudge source and its two screens share it. */
        fun of(host: V18Host): MemoryCenter = host.service(SERVICE) { MemoryCenter(host, RepositoryMemoryGateway(host)) }
    }
}

/**
 * When each reader erased everything, or one asset, since the app started. It lives with the nudge
 * centre (the process in the app), not with one screen: a rotation rebuilds the memory centre, and
 * a receipt on the glass must still not say "saved" about what the person erased a moment ago.
 * Never written to disk.
 */
internal object ErasedThisLaunch {
    class Marks {
        var all: Long? = null
        val assets = HashMap<String, Long>()
    }

    private val readers = WeakHashMap<Any, HashMap<String, Marks>>()

    fun of(anchor: Any, owner: String): Marks = readers.getOrPut(anchor) { HashMap() }.getOrPut(owner) { Marks() }
}

/** The words of the memory screens that are not on the consent sheet. */
class MemoryCopy(private val words: HostWords) {
    fun error(error: MemoryError): String = when (error) {
        MemoryError.SIGNED_OUT -> words.text("Sign in so Bobby can remember your assets and preferences.",
                                             "Inicia sesión para que Bobby recuerde tus activos y preferencias.")
        MemoryError.UNAVAILABLE -> words.text("Memory is unavailable right now.", "La memoria no está disponible por ahora.")
        MemoryError.REJECTED -> words.text("That did not save. Try again.", "No se guardó. Inténtalo de nuevo.")
    }

    fun notice(notice: MemoryNotice): String = when (notice) {
        is MemoryNotice.ErasedEverything -> words.text(
            "Deleted: what Bobby's servers remembered, the shortcuts on this phone and the theses you wrote here.",
            "Borrado: lo que recordaban los servidores de Bobby, los accesos rápidos de este teléfono y las tesis que escribiste aquí.")
        is MemoryNotice.ErasedOnPhoneOnly -> words.text(
            "Deleted on this phone. Bobby's servers did not confirm, so what they remember is still there. Try again.",
            "Borrado en este teléfono. Los servidores de Bobby no confirmaron, así que lo que recuerdan sigue ahí. Inténtalo de nuevo.")
        is MemoryNotice.ForgotOnPhoneOnly -> words.text(
            "Forgotten on this phone. Bobby's servers did not confirm, so they still remember {0}. Try again.",
            "Olvidado en este teléfono. Los servidores de Bobby no confirmaron, así que aún recuerdan {0}. Inténtalo de nuevo.", notice.symbol)
    }

    val riskRequired: String
        get() = words.text("Accept the risk notice first: until then Bobby sends nothing to its servers.",
                           "Primero acepta el aviso de riesgo: hasta entonces Bobby no envía nada a sus servidores.")

    /** A paused memory says what paused means: the one state that needs a sentence. */
    val paused: String
        get() = words.text("Paused across web and phone: no new asks are saved or personalized.",
                           "En pausa en web y teléfono: no se guardan ni personalizan consultas nuevas.")

    /** The confirmation says exactly what goes: the server's memory and the two things kept on this phone. */
    val deleteEverythingWarning: String
        get() = words.text(
            "This deletes what Bobby's servers remember about your account, the shortcuts on this phone and the theses you wrote here. It cannot be undone.",
            "Esto borra lo que los servidores de Bobby recuerdan de tu cuenta, los accesos rápidos de este teléfono y las tesis que escribiste aquí. No se puede deshacer.")

    val deliveredBriefingsNote: String
        get() = words.text("Memory-based briefings already delivered are removed too. A paused memory stays paused.",
                           "También se eliminan los resúmenes basados en memoria ya entregados. Si la memoria está en pausa, sigue en pausa.")

    /** Where the phone's two lists live, and the one case in which a thesis's text leaves it. */
    val onThisPhoneNote: String
        get() = words.text(
            "Bobby keeps these on this phone, not on its servers. The text of a thesis is sent, with that question, only when you start a review: to Bobby and to the AI providers that write the answer.",
            "Bobby guarda esto en este teléfono, no en sus servidores. El texto de una tesis se envía, junto con esa pregunta, solo cuando inicias una revisión: a Bobby y a los proveedores de IA que escriben la respuesta.")

    /** What each deletion on the memory screen removes from the phone, no more than the code does. */
    val onThisPhoneDeletionNote: String
        get() = words.text("Forget removes an asset's shortcut. Delete everything clears the shortcuts and the theses you wrote.",
                           "Olvidar quita el acceso rápido de un activo. Borrar todo quita los accesos rápidos y las tesis que escribiste.")

    fun prefLabel(field: MemoryPref): String = when (field) {
        MemoryPref.HORIZON -> words.text("Horizon", "Horizonte")
        MemoryPref.EXPERIENCE -> words.text("Experience", "Experiencia")
        MemoryPref.RISK -> words.text("Risk you prefer explained", "Riesgo que prefieres ver explicado")
    }

    fun optionLabel(field: MemoryPref, value: String): String = when (field) {
        MemoryPref.HORIZON -> when (value) {
            "intraday" -> words.text("Today", "Hoy")
            "week" -> words.text("Weeks", "Semanas")
            "month" -> words.text("Months", "Meses")
            "long" -> words.text("Long", "Largo")
            else -> value
        }
        MemoryPref.EXPERIENCE -> when (value) {
            "new" -> words.text("Starting", "Empezando")
            "some" -> words.text("Some", "Algo")
            "experienced" -> words.text("Experienced", "Con experiencia")
            else -> value
        }
        MemoryPref.RISK -> when (value) {
            "low" -> words.text("Low", "Bajo")
            "medium" -> words.text("Medium", "Medio")
            "high" -> words.text("High", "Alto")
            else -> value
        }
    }

    /** "5 times · 2 days ago": the server's count, and whole days since the last question when it sent a date. */
    fun assetLine(asset: RememberedAsset, now: Long): String {
        val times = if (asset.asks == 1) words.text("1 time", "1 vez") else words.text("{0} times", "{0} veces", asset.asks)
        val last = asset.lastAskedAtMillis ?: return times
        return times + " · " + MemoryReceiptLine(words).whenAsked(ThesisCopy.days(last, now)).ago
    }
}
