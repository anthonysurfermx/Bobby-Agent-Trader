package xyz.bobbyprotocol.android.platform

import android.Manifest
import android.annotation.SuppressLint
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
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
import xyz.bobbyprotocol.android.v18.V18Process
import xyz.bobbyprotocol.android.v18.V18Reader
import xyz.bobbyprotocol.android.v18.notify.LocalNotice
import xyz.bobbyprotocol.android.v18.notify.LocalNotifier
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
// the same work is queued again), one that is more than a day late is dropped unseen, and a thesis
// reminder is shown however late. The decision is tested on the JVM. That WorkManager posts a due
// notice, and that its tap reaches the activity, is checked on an emulator
// (V18DeviceInstrumentedTest); the wait and the drop were never seen on a device.

/** Plans, lists and clears Bobby's own local notices. `ask` is the activity's permission launcher. */
class AndroidLocalNotifier(context: Context, private val ask: suspend () -> Boolean) : LocalNotifier {
    private val app = context.applicationContext
    private val index = LocalNoticeIndex(app)

    override fun status(): LocalNotifier.Permission = LocalNotices.status(app)

    override suspend fun requestPermission(): Boolean {
        if (status() == LocalNotifier.Permission.ALLOWED) return true
        // Before Android 13 there is nothing to ask: notifications were switched off in the system.
        if (LocalNotices.runtimeGranted(app)) return false
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
            LocalNotice(id, json.getString("title"), json.getString("body"), json.getLong("fireAt"), channel, payload,
                        LocalNotice.Delivery.fromJson(json.optJSONObject("delivery"), channel))
        } catch (_: Exception) { null }
    }

    @SuppressLint("ApplySharedPref")
    fun put(notice: LocalNotice) {
        val json = JSONObject().put("title", notice.title).put("body", notice.body).put("fireAt", notice.fireAtEpochMs)
            .put("channel", notice.channel).put("payload", LocalNotices.payloadJson(notice.payload)).put("delivery", notice.delivery.toJson())
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

    fun status(context: Context): LocalNotifier.Permission = when {
        BriefingReminders.permissionGranted(context) -> LocalNotifier.Permission.ALLOWED
        !runtimeGranted(context) && !asked(context) -> LocalNotifier.Permission.NOT_DETERMINED
        else -> LocalNotifier.Permission.DENIED
    }

    /** Always true before Android 13, where there is no runtime question to ask. */
    internal fun runtimeGranted(context: Context): Boolean = Build.VERSION.SDK_INT < 33 ||
        ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED

    private fun permissions(context: Context) = context.getSharedPreferences("bobby_permissions", Context.MODE_PRIVATE)
    private fun asked(context: Context): Boolean = permissions(context).getBoolean("notificationsAsked", false)
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
     * Shows the notice now, unless it should not be shown: notifications are off, it was planned
     * for another reader of this phone, the risk notice was withdrawn, or the app is in front and
     * its feature says the glass already tells it. Called from the worker, off the main thread.
     */
    internal suspend fun post(context: Context, notice: LocalNotice) {
        if (!BriefingReminders.permissionGranted(context)) return
        // Whoever uses the phone now, read from disk: the activity may not be alive.
        val owner = BobbyRepository(context).session.value?.userId
        val reader = notice.payload[LocalNotice.OWNER]
        if (reader != null && reader != V18Reader.tag(owner)) return
        if (context.getSharedPreferences("bobby.nucleo", Context.MODE_PRIVATE).getInt("profile." + (owner ?: "local") + ".riskVersion", 0) <= 0) return
        val allowed = withContext(Dispatchers.Main) { V18Process.runtime?.allowsDueNotice(notice.payload) ?: true }
        if (!allowed) return
        val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        manager.createNotificationChannel(NotificationChannel(notice.channel, channelName(notice.channel, language(context)), NotificationManager.IMPORTANCE_DEFAULT))
        // Android tells two PendingIntents apart by their intent without its extras: the data makes each notice its own.
        val open = Intent(context, MainActivity::class.java).setAction(ACTION)
            .setData(Uri.parse("bobby-notice://v18/" + Uri.encode(notice.id)))
            .putExtra(EXTRA, payloadJson(notice.payload).toString())
        val tap = PendingIntent.getActivity(context, NOTIFICATION_ID, open, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        val notification = NotificationCompat.Builder(context, notice.channel)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle(notice.title)
            .setContentText(notice.body)
            .setStyle(NotificationCompat.BigTextStyle().bigText(notice.body))
            .setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
            .setAutoCancel(true).setOnlyAlertOnce(true).setContentIntent(tap).build()
        manager.notify(notice.id, NOTIFICATION_ID, notification)
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
        when (val decision = NoticeTiming.decide(notice, now, ZoneId.systemDefault())) {
            is NoticeTiming.Decision.Wait -> {
                // Still pending: the index keeps it, and the same work asks again at the next allowed hour.
                // Queuing it replaces this run, so it is the last thing done here.
                try { LocalNotices.enqueue(applicationContext, notice, decision.untilEpochMs - now) } catch (_: Exception) { }
            }
            NoticeTiming.Decision.Drop -> index.remove(listOf(id))
            NoticeTiming.Decision.Post -> {
                // From here it is no longer pending, shown or not.
                index.remove(listOf(id))
                try { LocalNotices.post(applicationContext, notice) } catch (_: Exception) { }
            }
        }
        return Result.success()
    }
}
