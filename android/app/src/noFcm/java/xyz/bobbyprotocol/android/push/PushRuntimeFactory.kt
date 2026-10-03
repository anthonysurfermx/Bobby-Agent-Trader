package xyz.bobbyprotocol.android.push

/** Default build has no Firebase classes, initialization, registration or provider network traffic. */
object PushRuntimeFactory {
    fun create(dependencies: PushDependencies): PushRuntime = DisabledPushRuntime()
}
