# The local rendering engine is bundled as assets. Its bridge uses AndroidX
# WebMessageListener, which does not require JavaScriptInterface reflection.
-keepattributes Signature,InnerClasses,EnclosingMethod

# The device acceptance tests install a fixture transport by field name; production owns this client too.
-keepclassmembers class xyz.bobbyprotocol.android.data.BobbyRepository { okhttp3.OkHttpClient client; }
# Device acceptance inspects the actual activity session and repository, without shipping any fixture hook.
-keepclassmembers class xyz.bobbyprotocol.android.MainActivity { *** repository; *** session; *** web; *** push; *** route$delegate; }
# The device smoke waits for the bundled page's real handshake by this field name.
-keepclassmembers class xyz.bobbyprotocol.android.nucleo.NucleoSession { boolean pageReady; }
