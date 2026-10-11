# The local rendering engine is bundled as assets. Its bridge uses AndroidX
# WebMessageListener, which does not require JavaScriptInterface reflection.
-keepattributes Signature,InnerClasses,EnclosingMethod

# The independently compiled instrumentation APK shares the app's Kotlin standard runtime.
# App-only R8 removes/inlines its facades (observed Intrinsics and LazyKt startup failures),
# so preserve this library's ABI across both APKs while Bobby and other libraries stay optimized.
-keep class kotlin.** { *; }

# Compose's external test idling registry shares the shipping coroutine runtime (JobKt was
# removed by app-only shrinking). Preserve that library ABI; Bobby classes remain optimized.
-keep class kotlinx.coroutines.** { *; }

# The independently compiled runner/Compose test clock shares AndroidX with the target APK.
# App-only reachability removed Trace, InfiniteAnimationPolicy and collection factory overloads.
# Preserve that library ABI as one boundary instead of chasing each external-test call. This costs
# library code size; Bobby's own composables/domain and other dependencies still undergo R8.
-keep class androidx.** { *; }

# The external device fixture transport uses interceptor/response-builder APIs absent from app-only
# reachability (observed OkHttp Builder.addInterceptor). Preserve the shared HTTP library ABI.
-keep class okhttp3.** { *; }
# Fixture responses also use the HTTP runtime's shared buffer/source APIs from Okio.
-keep class okio.** { *; }

# The release journey verifies the SDK's actual unconfigured state through Purchases.isConfigured.
# Keep its public entrypoint/companion for that independently compiled assertion, not initialization.
-keep class com.revenuecat.purchases.Purchases** { *; }

# The device acceptance tests install a fixture transport by field name; production owns this client too.
-keepclassmembers class xyz.bobbyprotocol.android.data.BobbyRepository { okhttp3.OkHttpClient client; }
# Device acceptance inspects the actual activity session and repository, without shipping any fixture hook.
-keepclassmembers class xyz.bobbyprotocol.android.MainActivity { *** repository; *** session; *** web; *** push; *** route$delegate; }
# The device smoke waits for the bundled page's real handshake by this field name.
-keepclassmembers class xyz.bobbyprotocol.android.nucleo.NucleoSession { boolean pageReady; }
