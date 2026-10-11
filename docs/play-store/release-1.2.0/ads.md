# Ads — Bobby Android 1.2.0 (10)

Console answer: **No, my app does not contain ads.** No ad placements, AdMob/advertising SDK, advertising identifier access or ad-tracking consent flow is configured in the shipping Android sources. Invitations share the app/service reads and do not display third-party advertisements.

Source evidence: `android/app/build.gradle.kts` dependency list; `android/app/src/main/AndroidManifest.xml`; bundled `android/nucleo/src/` page. Verify the final merged manifest against the CI bundle evidence before publishing. An uninitialized billing dependency is not an advertisement. FCM-on compile compatibility is not the supplied FCM-off release.
