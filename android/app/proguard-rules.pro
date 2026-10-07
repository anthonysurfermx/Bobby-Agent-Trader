# The local rendering engine is bundled as assets. Its bridge uses AndroidX
# WebMessageListener, which does not require JavaScriptInterface reflection.
-keepattributes Signature,InnerClasses,EnclosingMethod
