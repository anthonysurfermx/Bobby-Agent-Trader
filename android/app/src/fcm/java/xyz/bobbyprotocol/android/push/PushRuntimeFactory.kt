package xyz.bobbyprotocol.android.push

import android.content.Context
import xyz.bobbyprotocol.android.data.BobbyRepository
import xyz.bobbyprotocol.android.platform.BriefingReminders

/** Configured transport remains dormant until refresh confirms local and real server eligibility. */
object PushRuntimeFactory {
    fun create(dependencies: PushDependencies): PushRuntime {
        FcmWork.active?.close()
        if (!dependencies.configuration.configured || dependencies.context.packageName != dependencies.configuration.packageName) {
            PushStore(dependencies.context).clearConfiguration()
            return DisabledPushRuntime()
        }
        PushStore(dependencies.context).configure(dependencies.configuration)
        return AndroidFcmRuntime(dependencies).also { FcmWork.active = it }
    }

    internal fun serviceRuntime(context: Context): AndroidFcmRuntime? {
        FcmWork.active?.let { return it }
        val configuration = PushStore(context).configuration() ?: return null
        if (context.packageName != configuration.packageName) return null
        val repository = BobbyRepository(context.applicationContext)
        if (!PushDeviceState.eligibility(context, repository).eligible) return null
        repository.allowsExternalProcessing = {
            repository.session.value?.userId?.let { BriefingReminders.currentConsent(context, it) } == true
        }
        // Creating a runtime never initializes Firebase. Cold callbacks repeat all registration gates.
        return AndroidFcmRuntime(PushDependencies(context.applicationContext, repository, FcmWork.scope, configuration), attachHooks = false)
    }
}
