package xyz.bobbyprotocol.android.push

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import androidx.core.app.NotificationCompat
import xyz.bobbyprotocol.android.MainActivity
import xyz.bobbyprotocol.android.R
import xyz.bobbyprotocol.android.data.BobbyLocales
import xyz.bobbyprotocol.android.data.BobbyRepository
import xyz.bobbyprotocol.android.platform.BriefingReminders
import java.util.Locale

internal object PushNotifications {
    suspend fun present(context: Context, push: BriefingPush) {
        val binding = PushStore(context).binding() ?: return
        val config = PushStore(context).configuration() ?: return
        if (context.packageName != config.packageName || binding.project != config.projectId) return
        val repository = BobbyRepository(context)
        val eligibility = PushDeviceState.eligibility(context, repository)
        if (!PushPolicy.canPresent(push, binding.id, binding.revision, binding.owner, binding.epoch,
                eligibility, System.currentTimeMillis() / 1000)) return
        if (BriefingReminders.last(context, binding.owner) == push.briefId) return
        // Messages queued before a remote cadence/analysis withdrawal must not announce an old inbox.
        val settings = runCatching { repository.requestForAccount(binding.owner, binding.epoch, "api/briefing-settings") }
            .getOrNull() ?: return
        if (!PushPolicy.serverOptIn(settings)) {
            (context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager).cancel(2101)
            return
        }
        val selected = context.getSharedPreferences("bobby.nucleo", Context.MODE_PRIVATE).getString("language", "system")
        val language = BobbyLocales.language(if (selected == null || selected == "system") Locale.getDefault().toLanguageTag() else selected)
        val name = when (language) {
            "es" -> "Informes Bobby"; "fr" -> "Rapports Bobby"; "pt" -> "Relatórios Bobby";
            "it" -> "Report Bobby"; "de" -> "Bobby-Berichte"; else -> "Bobby briefings"
        }
        val text = when (language) {
            "es" -> "Tu informe de mercado está disponible."; "fr" -> "Votre rapport de marché est disponible.";
            "pt" -> "O seu relatório de mercado está disponível."; "it" -> "Il tuo report di mercato è disponibile.";
            "de" -> "Dein Marktbericht ist verfügbar."; else -> "Your market briefing is ready."
        }
        val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        manager.createNotificationChannel(NotificationChannel(BriefingReminders.CHANNEL, name, NotificationManager.IMPORTANCE_DEFAULT))
        val tap = PendingIntent.getActivity(context, 2101,
            Intent(context, MainActivity::class.java).putExtra("openBriefings", true), PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        val notification = NotificationCompat.Builder(context, BriefingReminders.CHANNEL)
            .setSmallIcon(R.drawable.ic_notification).setContentTitle("Bobby").setContentText(text)
            .setVisibility(NotificationCompat.VISIBILITY_PRIVATE).setAutoCancel(true).setOnlyAlertOnce(true).setContentIntent(tap).build()
        // Reload persisted identity and the exact receipt immediately before showing queued deliveries.
        val current = BobbyRepository(context)
        val receipt = PushStore(context).binding() ?: return
        if (receipt.id != binding.id || receipt.revision != binding.revision || receipt.owner != binding.owner ||
            !PushPolicy.canPresent(push, receipt.id, receipt.revision, receipt.owner, receipt.epoch,
                PushDeviceState.eligibility(context, current), System.currentTimeMillis() / 1000)) return
        manager.notify(2101, notification)
        BriefingReminders.mark(context, binding.owner, push.briefId)
    }
}
