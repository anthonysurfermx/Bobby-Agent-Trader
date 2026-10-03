package xyz.bobbyprotocol.android.push

import android.content.Context
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import xyz.bobbyprotocol.android.data.BobbyRepository
import xyz.bobbyprotocol.android.platform.BriefingReminders

enum class PushStatus { DISABLED, NOT_ELIGIBLE, NO_GOOGLE_SERVICES, BACKEND_UNAVAILABLE, REGISTERING, REGISTERED, FAILED }

interface PushRuntime {
    val status: StateFlow<PushStatus>
    /** Called after explicit opt-in/permission changes and on an eligible foreground/account change. */
    fun refresh()
    /** Releases Activity observers, retaining an opted-in background binding. */
    fun close()
}

class DisabledPushRuntime : PushRuntime {
    override val status: StateFlow<PushStatus> = MutableStateFlow(PushStatus.DISABLED)
    override fun refresh() = Unit
    override fun close() = Unit
}

data class PushDependencies(
    val context: Context,
    val repository: BobbyRepository,
    val scope: CoroutineScope,
    val configuration: PushConfiguration,
)

/** Cold service and Activity use the same persisted account consent and device opt-in. */
object PushDeviceState {
    fun eligibility(context: Context, repository: BobbyRepository): PushEligibility {
        val owner = repository.session.value?.userId
        return PushEligibility(owner, repository.epoch.value,
            owner != null && runCatching { BriefingReminders.currentConsent(context, owner) }.getOrDefault(false),
            BriefingReminders.enabled(context, owner), BriefingReminders.permissionGranted(context))
    }
}
