package xyz.bobbyprotocol.android.push

import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.withLock

/** Only the strict data-only contract reaches the owner-fenced private local notification. */
class BobbyMessagingService : FirebaseMessagingService() {
    override fun onRegistered(fid: String) {
        PushRuntimeFactory.serviceRuntime(applicationContext)?.registered(fid)
    }

    override fun onMessageReceived(message: RemoteMessage) {
        if (message.notification != null) return
        val payload = PushPolicy.parse(message.data, System.currentTimeMillis() / 1000) ?: return
        FcmWork.scope.launch { FcmWork.mutex.withLock {
            PushNotifications.present(applicationContext, payload)
        } }
    }
}
