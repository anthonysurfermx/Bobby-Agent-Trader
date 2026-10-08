package xyz.bobbyprotocol.android.platform

import android.Manifest
import android.annotation.SuppressLint
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import androidx.work.CoroutineWorker
import androidx.work.Data
import androidx.work.ExistingWorkPolicy
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import xyz.bobbyprotocol.android.MainActivity
import xyz.bobbyprotocol.android.R
import xyz.bobbyprotocol.android.data.BobbyLocales
import xyz.bobbyprotocol.android.data.BobbyRepository
import xyz.bobbyprotocol.android.v18.NudgeCenter
import xyz.bobbyprotocol.android.v18.RiskNotice
import xyz.bobbyprotocol.android.v18.V18Process
import xyz.bobbyprotocol.android.v18.V18Reader
import xyz.bobbyprotocol.android.v18.harness.Harness
import xyz.bobbyprotocol.android.v18.harness.HarnessCenter
import xyz.bobbyprotocol.android.v18.harness.HarnessCopy
import xyz.bobbyprotocol.android.v18.harness.HarnessNudges
import xyz.bobbyprotocol.android.v18.harness.HarnessStore
import xyz.bobbyprotocol.android.v18.harness.HarnessTap
import xyz.bobbyprotocol.android.v18.notify.LocalNotice
import xyz.bobbyprotocol.android.v18.notify.LocalNotifier
import xyz.bobbyprotocol.android.v18.notify.NoticePermission
import xyz.bobbyprotocol.android.v18.notify.NoticeTiming
import java.time.ZoneId
import java.util.Locale
import java.util.concurrent.TimeUnit

// The phone's side of v18/notify/LocalNotifier.kt.
//
// WorkManager, not AlarmManager: it is the scheduler this app already uses, it keeps planned work
// across a restart of the phone and an update of the app by itself (so there is no boot receiver
// and no new permission), and it never needs exact-alarm access. The price is punctuality: while
// the phone is idle the system may hold a notice back until its next maintenance window.
//
// What is planned is also written to `bobby.v18.notices`, so `pendingIds()` answers at once and a
// cancelled or replaced notice can never be shown by work that was already queued.
//
// Because the phone can run late, the worker asks `NoticeTiming` before it shows anything: a
// follow-up that runs late and outside 09:00-21:00 waits for the next 09:00 (it stays pending and
// the same work is queued again), one that is more than a day late is dropped unseen, one that
// would land on the day of the last follow-up shown (or within 18 hours of it) waits for the next
// day, and a thesis reminder is shown however late. The decision is tested on the JVM. That
// WorkManager posts a due notice, and that its tap reaches the activity, is checked on an emulator
// (V18DeviceInstrumentedTest); the wait and the drop were never seen on a device.
//
// What was really shown is written to `bobby.v18.shown` at the moment the notice goes up: for a
// follow-up, its id (one per kind of follow-up, never an asset), the moment it was planned for and
// the moment it was shown. The harness writes a follow-up as shown from that and from nothing
// else (`LocalNotifier.shownAt`), and the worker reads the last showing from it. Cancelling an id
// forgets its record, so turning follow-ups off leaves nothing there.
//
// A notice is private (`VISIBILITY_PRIVATE`). One that carries a `publicBody` also has a public
// version: what a locked phone set to hide sensitive content shows instead, so a follow-up's asset
// is never read off a locked screen there. One that carries an `action` has one button, which
// reaches `LocalNoticeActionReceiver` as a broadcast: nothing of the app comes to the front.

/** Plans, lists and clears Bobby's own local notices. `ask` is the activity's permission launcher. */
class AndroidLocalNotifier(context: Context, private val ask: suspend () -> Boolean) : LocalNotifier {
    private val app = context.applicationContext
    private val index = LocalNoticeIndex(app)
    private val shown = LocalNoticeShown(app)

    override fun status(): LocalNotifier.Permission = LocalNotices.status(app)

    /** A kind of notice the person switched off in the system's settings is a no for that kind. */
    override fun status(channel: String): LocalNotifier.Permission = NoticePermission.status(
        BriefingReminders.permissionGranted(app), LocalNotices.runtimeGranted(app), LocalNotices.asked(app), LocalNotices.channelOff(app, channel))

    override fun shownAt(id: String, fireAtEpochMs: Long): Long? = shown.at(id, fireAtEpochMs)

    override suspend fun requestPermission(): Boolean {
        val on = BriefingReminders.permissionGranted(app)
        if (on) return true
        // Before Android 13 there is nothing to ask, and a granted permission with notifications off
        // means they were switched off in the system: the question would change nothing.
        if (!NoticePermission.canAsk(on, LocalNotices.runtimeGranted(app))) return false
        LocalNotices.markAsked(app)
        ask()
        return status() == LocalNotifier.Permission.ALLOWED
    }

    override fun schedule(notice: LocalNotice): Boolean {
        val now = System.currentTimeMillis()
        if (!LocalNotice.valid(notice) || notice.fireAtEpochMs <= now || status() != LocalNotifier.Permission.ALLOWED) return false
        index.put(notice)
        LocalNotices.enqueue(app, notice, notice.fireAtEpochMs - now)
        return true
    }

    override fun cancel(ids: Collection<String>) {
        if (ids.isEmpty()) return
        index.remove(ids)
        // What was shown under these ids is not kept past them.
        shown.remove(ids)
        val manager = WorkManager.getInstance(app)
        for (id in ids) manager.cancelUniqueWork(LocalNotices.workName(id))
    }

    override fun clearDelivered(ids: Collection<String>) {
        val manager = app.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        for (id in ids) manager.cancel(id, LocalNotices.NOTIFICATION_ID)
    }

    override fun pendingIds(): Set<String> = index.ids()
}

/** What is planned, on disk: the one truth for "will the phone still show this". */
internal class LocalNoticeIndex(context: Context) {
    private val prefs = context.applicationContext.getSharedPreferences("bobby.v18.notices", Context.MODE_PRIVATE)

    fun ids(): Set<String> = prefs.all.keys.toSet()

    fun get(id: String): LocalNotice? = prefs.getString(id, null)?.let { raw ->
        try {
            val json = JSONObject(raw)
            val payload = LinkedHashMap<String, String>()
            json.optJSONObject("payload")?.let { map -> for (key in map.keys()) payload[key] = map.optString(key) }
            val channel = json.getString("channel")
            // Absent in what Android 1.2.0's first builds stored: such a notice has neither.
            val hidden = if (json.isNull("publicBody")) null else (json.opt("publicBody") as? String)?.takeIf { it.isNotBlank() }
            val action = json.optJSONObject("action")?.let { stored ->
                val name = stored.opt("name") as? String
                val label = stored.opt("label") as? String
                if (name == null || label == null) null else LocalNotice.Action(name, label).takeIf { it.isValid }
            }
            LocalNotice(id, json.getString("title"), json.getString("body"), json.getLong("fireAt"), channel, payload,
                        LocalNotice.Delivery.fromJson(json.optJSONObject("delivery"), channel), hidden, action)
        } catch (_: Exception) { null }
    }

    @SuppressLint("ApplySharedPref")
    fun put(notice: LocalNotice) {
        val json = JSONObject().put("title", notice.title).put("body", notice.body).put("fireAt", notice.fireAtEpochMs)
            .put("channel", notice.channel).put("payload", LocalNotices.payloadJson(notice.payload)).put("delivery", notice.delivery.toJson())
        if (notice.publicBody != null) json.put("publicBody", notice.publicBody)
        if (notice.action != null) json.put("action", JSONObject().put("name", notice.action.name).put("label", notice.action.label))
        prefs.edit().putString(notice.id, json.toString()).commit()
    }

    @SuppressLint("ApplySharedPref")
    fun remove(ids: Collection<String>) {
        val editor = prefs.edit()
        for (id in ids) editor.remove(id)
        editor.commit()
    }
}

/**
 * What the phone really showed, on disk (`bobby.v18.shown`): per notice id, its last showing. Only
 * follow-ups are written: the moment the notice was planned for, the moment it went up, and its
 * channel. An id names a kind of follow-up (`v18.follow.asset`), never an asset.
 */
internal class LocalNoticeShown(context: Context) {
    private val prefs = context.applicationContext.getSharedPreferences("bobby.v18.shown", Context.MODE_PRIVATE)

    private fun record(id: String): JSONObject? = prefs.getString(id, null)?.let { raw -> try { JSONObject(raw) } catch (_: Exception) { null } }

    /** When the notice `id` planned for `fireAt` was shown, or null when the phone did not show it. */
    fun at(id: String, fireAt: Long): Long? {
        val record = record(id) ?: return null
        if (record.optLong("fireAt", -1L) != fireAt) return null
        return record.optLong("at", -1L).takeIf { it > 0 }
    }

    /** The latest showing of any notice of `channel`, or null. */
    fun last(channel: String): Long? {
        var latest: Long? = null
        for (id in prefs.all.keys) {
            val record = record(id) ?: continue
            if (record.optString("channel") != channel) continue
            val at = record.optLong("at", -1L)
            if (at > 0 && (latest == null || at > latest)) latest = at
        }
        return latest
    }

    @SuppressLint("ApplySharedPref")
    fun put(notice: LocalNotice, at: Long) {
        val json = JSONObject().put("fireAt", notice.fireAtEpochMs).put("at", at).put("channel", notice.channel)
        prefs.edit().putString(notice.id, json.toString()).commit()
    }

    @SuppressLint("ApplySharedPref")
    fun remove(ids: Collection<String>) {
        val editor = prefs.edit()
        for (id in ids) editor.remove(id)
        editor.commit()
    }
}

object LocalNotices {
    /** The extra a tapped notice carries to MainActivity: its payload as a JSON object of strings. */
    const val EXTRA = "v18.notice"
    const val ACTION = "xyz.bobbyprotocol.android.V18_NOTICE"
    /** The broadcast a notice's own button sends (`LocalNoticeActionReceiver`), and what it carries besides the payload. */
    const val ACTION_BUTTON = "xyz.bobbyprotocol.android.V18_NOTICE_ACTION"
    const val EXTRA_ID = "v18.notice.id"
    const val EXTRA_BUTTON = "v18.notice.button"
    internal const val NOTIFICATION_ID = 2180
    internal const val WORK_TAG = "bobby-v18-notice"
    internal const val WORK_ID = "id"
    internal const val WORK_FIRE_AT = "fireAt"
    internal fun workName(id: String) = "bobby-v18-notice:$id"

    /**
     * Queues the work that will show `notice`, `delayMs` from now, in place of whatever was queued
     * under the same id (one piece of work per notice, so cancelling the id cancels a waiting one too).
     */
    internal fun enqueue(context: Context, notice: LocalNotice, delayMs: Long) {
        val work = OneTimeWorkRequestBuilder<LocalNoticeWorker>()
            .setInitialDelay(maxOf(0L, delayMs), TimeUnit.MILLISECONDS)
            .setInputData(Data.Builder().putString(WORK_ID, notice.id).putLong(WORK_FIRE_AT, notice.fireAtEpochMs).build())
            .addTag(WORK_TAG)
            .build()
        WorkManager.getInstance(context).enqueueUniqueWork(workName(notice.id), ExistingWorkPolicy.REPLACE, work)
    }

    fun status(context: Context): LocalNotifier.Permission =
        NoticePermission.status(BriefingReminders.permissionGranted(context), runtimeGranted(context), asked(context))

    /** Always true before Android 13, where there is no runtime question to ask. */
    internal fun runtimeGranted(context: Context): Boolean = Build.VERSION.SDK_INT < 33 ||
        ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED

    private fun permissions(context: Context) = context.getSharedPreferences("bobby_permissions", Context.MODE_PRIVATE)
    internal fun asked(context: Context): Boolean = permissions(context).getBoolean("notificationsAsked", false)

    /**
     * The person switched this kind of notice off in the system's settings (long-press on a notice,
     * "Turn off notifications"): the channel exists and its importance is none. A channel that was
     * never created is not off: it is created with the first notice.
     */
    internal fun channelOff(context: Context, channel: String): Boolean {
        val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        return manager.getNotificationChannel(channel)?.importance == NotificationManager.IMPORTANCE_NONE
    }
    internal fun markAsked(context: Context) { permissions(context).edit().putBoolean("notificationsAsked", true).apply() }

    internal fun payloadJson(payload: Map<String, String>): JSONObject = JSONObject().also { json -> for ((key, value) in payload) json.put(key, value) }

    /** The payload of a tapped notice, or null when the extra is not one of ours. */
    fun payload(raw: String?): Map<String, String>? {
        if (raw.isNullOrEmpty() || raw.length > 8_192) return null
        return try {
            val json = JSONObject(raw)
            val payload = LinkedHashMap<String, String>()
            for (key in json.keys()) {
                val value = json.opt(key) as? String ?: return null
                if (key.length > 40 || value.length > LocalNotice.VALUE_LIMIT) return null
                payload[key] = value
            }
            if (payload.size > LocalNotice.PAYLOAD_LIMIT || payload[LocalNotice.KIND].isNullOrEmpty()) null else payload
        } catch (_: Exception) { null }
    }

    private fun language(context: Context): String {
        val selected = context.getSharedPreferences("bobby.nucleo", Context.MODE_PRIVATE).getString("language", "system")
        return BobbyLocales.language(if (selected == "system" || selected == null) Locale.getDefault().toLanguageTag() else selected)
    }

    /** Channel names as the system's notification settings show them. */
    private fun channelName(channel: String, language: String): String = if (channel == LocalNotice.CHANNEL_FOLLOW_UPS) when (language) {
        "es" -> "Seguimiento"; "fr" -> "Suivis"; "pt" -> "Seguimento"; "it" -> "Aggiornamenti"; "de" -> "Follow-ups"; else -> "Follow-ups"
    } else when (language) {
        "es" -> "Recordatorios"; "fr" -> "Rappels"; "pt" -> "Lembretes"; "it" -> "Promemoria"; "de" -> "Erinnerungen"; else -> "Reminders"
    }

    /**
     * Shows the notice now, unless it should not be shown: notifications are off (Bobby's, or this
     * kind's), it was planned for another reader of this phone, the risk notice was withdrawn, or
     * the app is in front and its feature says the glass already tells it. True only when the
     * notice went up. Called from the worker, off the main thread.
     */
    internal suspend fun post(context: Context, notice: LocalNotice): Boolean {
        if (!BriefingReminders.permissionGranted(context)) return false
        // This kind was switched off in the system's settings: the system would discard it unseen.
        if (channelOff(context, notice.channel)) return false
        // Whoever uses the phone now, read from disk: the activity may not be alive.
        val owner = BobbyRepository(context).session.value?.userId
        val reader = notice.payload[LocalNotice.OWNER]
        if (reader != null && reader != V18Reader.tag(owner)) return false
        if (context.getSharedPreferences("bobby.nucleo", Context.MODE_PRIVATE).getInt("profile." + (owner ?: "local") + ".riskVersion", 0) <= 0) return false
        val allowed = withContext(Dispatchers.Main) { V18Process.runtime?.allowsDueNotice(notice.payload) ?: true }
        if (!allowed) return false
        val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        manager.createNotificationChannel(NotificationChannel(notice.channel, channelName(notice.channel, language(context)), NotificationManager.IMPORTANCE_DEFAULT))
        // Android tells two PendingIntents apart by their intent without its extras: the data makes each notice its own.
        val open = Intent(context, MainActivity::class.java).setAction(ACTION)
            .setData(Uri.parse("bobby-notice://v18/" + Uri.encode(notice.id)))
            .putExtra(EXTRA, payloadJson(notice.payload).toString())
        val tap = PendingIntent.getActivity(context, NOTIFICATION_ID, open, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        val builder = NotificationCompat.Builder(context, notice.channel)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle(notice.title)
            .setContentText(notice.body)
            .setStyle(NotificationCompat.BigTextStyle().bigText(notice.body))
            .setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
            .setAutoCancel(true).setOnlyAlertOnce(true).setContentIntent(tap)
        // The one button: a broadcast to this app, never an activity. It is on the public version too,
        // so saying no does not ask for the phone to be unlocked first.
        val button = notice.action?.let { action ->
            val press = Intent(context, LocalNoticeActionReceiver::class.java).setAction(ACTION_BUTTON)
                .setData(Uri.parse("bobby-notice://v18/" + Uri.encode(notice.id) + "/" + Uri.encode(action.name)))
                .putExtra(EXTRA, payloadJson(notice.payload).toString()).putExtra(EXTRA_ID, notice.id).putExtra(EXTRA_BUTTON, action.name)
            NotificationCompat.Action.Builder(0, action.label,
                PendingIntent.getBroadcast(context, NOTIFICATION_ID, press, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)).build()
        }
        if (button != null) builder.addAction(button)
        // What a locked phone that hides sensitive content shows instead: the same title, the line
        // without the asset, the same tap. Never the body.
        notice.publicBody?.let { hidden ->
            val locked = NotificationCompat.Builder(context, notice.channel)
                .setSmallIcon(R.drawable.ic_notification)
                .setContentTitle(notice.title)
                .setContentText(hidden)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .setAutoCancel(true).setContentIntent(tap)
            if (button != null) locked.addAction(button)
            builder.setPublicVersion(locked.build())
        }
        manager.notify(notice.id, NOTIFICATION_ID, builder.build())
        return true
    }

    /**
     * A notice's own button was pressed. Runs on the main thread, from a broadcast: no activity is
     * started and none needs to exist. The notice leaves the shade, then its feature acts.
     *
     * A follow-up's "Stop" does what the Follow-ups switch does when it is turned off, through the
     * same call (`HarnessCenter.stop` → `turnOff`): with the app alive, on the centre the app is
     * using, so the switch and the glass follow at once; with no app, on a centre built over what
     * is on disk. Either way only for the reader the notice was planned for.
     */
    internal fun pressed(context: Context, id: String, button: String, payload: Map<String, String>) {
        val app = context.applicationContext
        (app.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager).cancel(id, NOTIFICATION_ID)
        if (payload[LocalNotice.KIND] != HarnessCenter.KIND || button != HarnessCenter.STOP_ACTION) return
        val tap = HarnessTap.from(payload) ?: return
        val live = V18Process.runtime
        if (live != null) {
            Harness.center(live).stop(tap)
            return
        }
        // Whoever uses the phone now, read from disk: there is no session to ask.
        val owner = BobbyRepository(app).session.value?.userId
        val store = V18Process.store(app)
        val center = HarnessCenter(AndroidLocalNotifier(app) { false }, HarnessStore(store), HarnessCopy({ "en-US" }) { en, _ -> en })
        center.currentUser = { owner }
        // Saying no needs no consent; nothing else is done with this centre.
        center.consent = { RiskNotice.WITHDRAWN }
        center.forgetLines = { symbol, reader -> NudgeCenter.forget(listOf(HarnessNudges.movePrefix(symbol)), reader, store) }
        center.load(owner)
        center.stop(tap)
    }
}

/**
 * Receives the button of a notice (`LocalNotices.post` builds its intent). Not exported: only this
 * app's own PendingIntent reaches it. It opens nothing.
 */
class LocalNoticeActionReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != LocalNotices.ACTION_BUTTON) return
        val id = intent.getStringExtra(LocalNotices.EXTRA_ID)?.takeIf { LocalNotice.ID_PATTERN.matches(it) } ?: return
        val button = intent.getStringExtra(LocalNotices.EXTRA_BUTTON)?.takeIf { LocalNotice.ACTION_PATTERN.matches(it) } ?: return
        val payload = LocalNotices.payload(intent.getStringExtra(LocalNotices.EXTRA)) ?: return
        try { LocalNotices.pressed(context, id, button, payload) } catch (_: Exception) { }
    }
}

/**
 * Runs when a planned notice comes due, which on an idle phone can be hours after its moment. A
 * notice that was cancelled or replaced meanwhile is not shown; one that asks for allowed hours
 * waits for them; one that has expired is dropped (`NoticeTiming`).
 */
class LocalNoticeWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {
    override suspend fun doWork(): Result {
        val id = inputData.getString(LocalNotices.WORK_ID) ?: return Result.success()
        val index = LocalNoticeIndex(applicationContext)
        val notice = index.get(id) ?: return Result.success()
        if (notice.fireAtEpochMs != inputData.getLong(LocalNotices.WORK_FIRE_AT, -1L)) return Result.success()
        val now = System.currentTimeMillis()
        val shown = LocalNoticeShown(applicationContext)
        // The last notice of its kind this phone really showed: a follow-up keeps its distance from it.
        when (val decision = NoticeTiming.decide(notice, now, ZoneId.systemDefault(), shown.last(notice.channel))) {
            is NoticeTiming.Decision.Wait -> {
                // Still pending: the index keeps it, and the same work asks again at the next allowed hour.
                // Queuing it replaces this run, so it is the last thing done here.
                try { LocalNotices.enqueue(applicationContext, notice, decision.untilEpochMs - now) } catch (_: Exception) { }
            }
            NoticeTiming.Decision.Drop -> index.remove(listOf(id))
            NoticeTiming.Decision.Post -> {
                // From here it is no longer pending, shown or not.
                index.remove(listOf(id))
                val posted = try { LocalNotices.post(applicationContext, notice) } catch (_: Exception) { false }
                // Only what went up is written as shown, with the moment it did.
                if (posted && notice.channel == LocalNotice.CHANNEL_FOLLOW_UPS) shown.put(notice, System.currentTimeMillis())
            }
        }
        return Result.success()
    }
}
