package xyz.bobbyprotocol.android.platform

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.NetworkType
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import org.json.JSONObject
import xyz.bobbyprotocol.android.MainActivity
import xyz.bobbyprotocol.android.R
import xyz.bobbyprotocol.android.data.BobbyRepository
import xyz.bobbyprotocol.android.push.PushPolicy
import java.time.Instant
import java.util.concurrent.TimeUnit

/** Opted-in background inbox checks. Android schedules these; this is not FCM push delivery. */
object BriefingReminders {
    private const val WORK = "bobby-briefing-reminders"
    const val CHANNEL = "bobby-market-briefings"
    private fun preferences(context: Context) = context.getSharedPreferences("bobby.briefingReminders", Context.MODE_PRIVATE)
    fun enabled(context: Context, owner: String?): Boolean = owner != null && preferences(context).getBoolean("enabled.$owner", false)
    fun setEnabled(context: Context, owner: String, enabled: Boolean) {
        preferences(context).edit().putBoolean("enabled.$owner", enabled).apply()
        refresh(context, owner)
    }
    fun forget(context: Context, owner: String) {
        preferences(context).edit().remove("enabled.$owner").remove("last.$owner").apply()
        refresh(context, null)
    }
    fun refresh(context: Context, owner: String?) {
        val manager = WorkManager.getInstance(context)
        if (!enabled(context, owner)) { manager.cancelUniqueWork(WORK); (context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager).cancel(2101); return }
        val work = PeriodicWorkRequestBuilder<BriefingReminderWorker>(15, TimeUnit.MINUTES)
            .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()).build()
        manager.enqueueUniquePeriodicWork(WORK, ExistingPeriodicWorkPolicy.KEEP, work)
    }
    fun permissionGranted(context: Context): Boolean = (Build.VERSION.SDK_INT < 33 || ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED) && NotificationManagerCompat.from(context).areNotificationsEnabled()
    fun currentConsent(context: Context, owner: String): Boolean {
        val version = context.assets.open("nucleo/risk-notice.json").bufferedReader().use { JSONObject(it.readText()).getInt("version") }
        return context.getSharedPreferences("bobby.nucleo", Context.MODE_PRIVATE).getInt("profile.$owner.riskVersion", 0) == version
    }
    fun last(context: Context, owner: String): String? = preferences(context).getString("last.$owner", null)
    fun mark(context: Context, owner: String, id: String) { preferences(context).edit().putString("last.$owner", id).commit() }
}

class BriefingReminderWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {
    override suspend fun doWork(): Result {
        val repository = BobbyRepository(applicationContext)
        val owner = repository.session.value?.userId ?: return Result.success()
        val epoch = repository.epoch.value
        if (!BriefingReminders.enabled(applicationContext, owner) || !BriefingReminders.permissionGranted(applicationContext) || !BriefingReminders.currentConsent(applicationContext, owner)) return Result.success()
        repository.allowsExternalProcessing = { BriefingReminders.currentConsent(applicationContext, owner) }
        return try {
            if (!PushPolicy.serverOptIn(repository.requestForAccount(owner, epoch, "api/briefing-settings"))) {
                (applicationContext.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager).cancel(2101)
                return Result.success()
            }
            val items = repository.briefings(limit = 1).optJSONArray("items") ?: return Result.success()
            val report = items.optJSONObject(0) ?: return Result.success()
            val id = report.optString("id").takeIf { it.matches(Regex("[0-9a-f-]{36}")) } ?: return Result.success()
            if (BriefingReminders.last(applicationContext, owner) == id) return Result.success()
            val scheduled = runCatching { Instant.parse(report.getString("scheduledAt")).toEpochMilli() }.getOrNull()
            if (scheduled == null || System.currentTimeMillis() - scheduled !in 0..(7 * 86_400_000L)) return Result.success()
            // Reload persisted identity, consent and device preference immediately before posting.
            val current = BobbyRepository(applicationContext)
            if (current.session.value?.userId != owner || current.epoch.value != epoch || !BriefingReminders.enabled(applicationContext, owner) || !BriefingReminders.currentConsent(applicationContext, owner)) return Result.success()
            current.allowsExternalProcessing = { BriefingReminders.currentConsent(applicationContext, owner) }
            if (!PushPolicy.serverOptIn(current.requestForAccount(owner, epoch, "api/briefing-settings"))) return Result.success()
            val selected = applicationContext.getSharedPreferences("bobby.nucleo", Context.MODE_PRIVATE).getString("language", "system")
            val language = xyz.bobbyprotocol.android.data.BobbyLocales.language(if (selected == "system" || selected == null) java.util.Locale.getDefault().toLanguageTag() else selected)
            val channelName = when (language) {
                "es" -> "Informes Bobby"; "fr" -> "Rapports Bobby"; "pt" -> "Relatórios Bobby"; "it" -> "Report Bobby"; "de" -> "Bobby-Berichte"; else -> "Bobby briefings"
            }
            val readyText = when (language) {
                "es" -> "Tu informe de mercado está disponible."; "fr" -> "Votre rapport de marché est disponible."; "pt" -> "O seu relatório de mercado está disponível."; "it" -> "Il tuo report di mercato è disponibile."; "de" -> "Dein Marktbericht ist verfügbar."; else -> "Your market briefing is ready."
            }
            val manager = applicationContext.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            manager.createNotificationChannel(NotificationChannel(BriefingReminders.CHANNEL, channelName, NotificationManager.IMPORTANCE_DEFAULT))
            val tap = PendingIntent.getActivity(applicationContext, 2101, Intent(applicationContext, MainActivity::class.java).putExtra("openBriefings", true), PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
            val notification = NotificationCompat.Builder(applicationContext, BriefingReminders.CHANNEL)
                .setSmallIcon(R.drawable.ic_notification)
                .setContentTitle("Bobby")
                .setContentText(readyText)
                .setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
                .setAutoCancel(true).setOnlyAlertOnce(true).setContentIntent(tap).build()
            val latest = BobbyRepository(applicationContext)
            if (latest.session.value?.userId != owner || latest.epoch.value != epoch ||
                !BriefingReminders.enabled(applicationContext, owner) || !BriefingReminders.currentConsent(applicationContext, owner) ||
                !BriefingReminders.permissionGranted(applicationContext)) return Result.success()
            manager.notify(2101, notification)
            BriefingReminders.mark(applicationContext, owner, id)
            Result.success()
        } catch (failure: xyz.bobbyprotocol.android.data.ApiException) {
            if (failure.status in setOf(401, 402, 403, 404)) Result.success() else Result.retry()
        } catch (_: Exception) { Result.retry() }
    }
}
