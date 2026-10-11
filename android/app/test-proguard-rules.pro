# AndroidX Test references build-time-only Error Prone annotations; neither is a runtime dependency.
# This applies to the instrumentation APK only, not to the shipping optimized app.
-dontwarn com.google.errorprone.annotations.CanIgnoreReturnValue
-dontwarn com.google.errorprone.annotations.MustBeClosed
