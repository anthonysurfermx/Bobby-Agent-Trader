import java.util.Properties

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
}

val localConfig = Properties().apply {
    val file = rootProject.file("local.properties")
    if (file.exists()) file.inputStream().use { load(it) }
}
fun config(name: String, fallback: String = ""): String =
    providers.environmentVariable(name).orNull ?: localConfig.getProperty(name) ?: fallback
fun quoted(value: String) = "\"" + value.replace("\\", "\\\\").replace("\"", "\\\"").replace("\n", "\\n").replace("\r", "\\r") + "\""
val fcmEnabled = config("BOBBY_FCM_ENABLED").equals("true", ignoreCase = true)

android {
    namespace = "xyz.bobbyprotocol.android"
    compileSdk = 36
    defaultConfig {
        applicationId = "xyz.bobbyprotocol.bobby"
        minSdk = 26
        targetSdk = 36
        versionCode = 10
        versionName = "1.2.0"
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
        buildConfigField("String", "API_BASE_URL", quoted(config("BOBBY_API_BASE_URL", "https://bobbyprotocol.xyz")))
        buildConfigField("String", "SUPABASE_URL", quoted(config("BOBBY_SUPABASE_URL")))
        buildConfigField("String", "SUPABASE_ANON_KEY", quoted(config("BOBBY_SUPABASE_ANON_KEY")))
        buildConfigField("String", "REVENUECAT_ANDROID_API_KEY", quoted(config("REVENUECAT_ANDROID_API_KEY")))
        buildConfigField("String", "ENTITLEMENT_ID", quoted("pro"))
        buildConfigField("boolean", "FCM_ENABLED", fcmEnabled.toString())
        buildConfigField("String", "FCM_PROJECT_ID", quoted(config("BOBBY_FCM_PROJECT_ID")))
        buildConfigField("String", "FCM_APPLICATION_ID", quoted(config("BOBBY_FCM_APPLICATION_ID")))
        buildConfigField("String", "FCM_SENDER_ID", quoted(config("BOBBY_FCM_SENDER_ID")))
        buildConfigField("String", "FCM_API_KEY", quoted(config("BOBBY_FCM_API_KEY")))
    }
    buildFeatures { compose = true; buildConfig = true }
    compileOptions { sourceCompatibility = JavaVersion.VERSION_17; targetCompatibility = JavaVersion.VERSION_17 }
    kotlinOptions { jvmTarget = "17" }
    val uploadKeystore = config("BOBBY_ANDROID_KEYSTORE")
    if (uploadKeystore.isNotBlank()) {
        signingConfigs.create("upload") {
            storeFile = file(uploadKeystore)
            storePassword = config("BOBBY_ANDROID_STORE_PASSWORD")
            keyAlias = config("BOBBY_ANDROID_KEY_ALIAS")
            keyPassword = config("BOBBY_ANDROID_KEY_PASSWORD")
        }
    }
    buildTypes {
        release {
            if (uploadKeystore.isNotBlank()) signingConfig = signingConfigs.getByName("upload")
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
        }
    }
    packaging { resources.excludes += "/META-INF/{AL2.0,LGPL2.1}" }
    testOptions { unitTests.isReturnDefaultValues = true }
    sourceSets.getByName("main").java.srcDir(if (fcmEnabled) "src/fcm/java" else "src/noFcm/java")
    // What the JVM tests and the instrumented tests both stand on (the 1.8 host over a desk and a
    // screen in memory, the memory gateway): one copy, compiled into both, shipped in neither APK.
    sourceSets.getByName("test").java.srcDir("src/sharedTest/java")
    sourceSets.getByName("androidTest").java.srcDir("src/sharedTest/java")
    if (fcmEnabled) {
        // Build-type manifests merge with main; the OAuth Activity remains in the main manifest.
        sourceSets.getByName("debug").manifest.srcFile("src/fcm/AndroidManifest.xml")
        sourceSets.getByName("release").manifest.srcFile("src/fcm/AndroidManifest.xml")
    }
}

dependencies {
    val composeBom = platform("androidx.compose:compose-bom:2025.08.01")
    implementation(composeBom)
    androidTestImplementation(composeBom)
    implementation("androidx.activity:activity-compose:1.10.1")
    implementation("androidx.fragment:fragment-ktx:1.8.9")
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.ui:ui-tooling-preview")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.lifecycle:lifecycle-runtime-compose:2.9.4")
    implementation("androidx.webkit:webkit:1.14.0")
    implementation("androidx.browser:browser:1.8.0")
    implementation("androidx.core:core-ktx:1.16.0")
    implementation("androidx.work:work-runtime-ktx:2.10.5")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.9.0")
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
    implementation("com.revenuecat.purchases:purchases:10.15.1")
    if (fcmEnabled) implementation("com.google.firebase:firebase-messaging:25.1.3")
    debugImplementation("androidx.compose.ui:ui-tooling")
    debugImplementation("androidx.compose.ui:ui-test-manifest")
    testImplementation("junit:junit:4.13.2")
    testImplementation("org.json:json:20240303")
    testImplementation("org.jetbrains.kotlinx:kotlinx-coroutines-test:1.9.0")
    testImplementation("com.squareup.okhttp3:mockwebserver:4.12.0")
    androidTestImplementation("androidx.test.ext:junit:1.2.1")
    androidTestImplementation("androidx.test:runner:1.6.2")
    androidTestImplementation("androidx.compose.ui:ui-test-junit4")
    // The system's own windows (the permission question, the notification shade) for the emulator tests.
    androidTestImplementation("androidx.test.uiautomator:uiautomator:2.3.0")
}

tasks.register("validateReleaseConfig") {
    doLast {
        require(config("BOBBY_API_BASE_URL", "https://bobbyprotocol.xyz").startsWith("https://")) { "Release API URL must use HTTPS" }
        require(config("BOBBY_SUPABASE_URL").startsWith("https://")) { "Set BOBBY_SUPABASE_URL for release" }
        require(config("BOBBY_SUPABASE_ANON_KEY").isNotBlank()) { "Set the public BOBBY_SUPABASE_ANON_KEY for release" }
        require(config("REVENUECAT_ANDROID_API_KEY").startsWith("goog_")) { "Set a Google Play public RevenueCat key for release" }
    }
}
tasks.matching { it.name == "preReleaseBuild" }.configureEach { dependsOn("validateReleaseConfig") }

// Publishing is a separate, explicit task. Ordinary release compilation may remain unsigned.
tasks.register("validateUploadSigning") {
    doLast {
        require(config("BOBBY_ANDROID_KEYSTORE").isNotBlank()) { "Set BOBBY_ANDROID_KEYSTORE to your private upload keystore" }
        require(file(config("BOBBY_ANDROID_KEYSTORE")).isFile) { "Upload keystore was not found" }
        for (name in listOf("BOBBY_ANDROID_STORE_PASSWORD", "BOBBY_ANDROID_KEY_ALIAS", "BOBBY_ANDROID_KEY_PASSWORD")) {
            require(config(name).isNotBlank()) { "Missing private signing configuration: $name" }
        }
    }
}
tasks.register("playBundle") {
    dependsOn("validateUploadSigning", "bundleRelease")
}
