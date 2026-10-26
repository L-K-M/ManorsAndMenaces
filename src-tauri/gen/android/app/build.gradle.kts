import java.util.Properties

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("rust")
    // Third-party notices. AGP 8.11 needs the base plugin, wired into res below.
    id("com.mikepenz.aboutlibraries.plugin") version "15.2.0"
}

val tauriProperties = Properties().apply {
    val propFile = file("tauri.properties")
    if (propFile.exists()) {
        propFile.inputStream().use { load(it) }
    }
}

android {
    compileSdk = 36
    namespace = "ch.lkmc.manorsmenaces"
    defaultConfig {
        manifestPlaceholders["usesCleartextTraffic"] = "false"
        applicationId = "ch.lkmc.manorsmenaces"
        minSdk = 24
        targetSdk = 36
        versionCode = tauriProperties.getProperty("tauri.android.versionCode", "1").toInt()
        versionName = tauriProperties.getProperty("tauri.android.versionName", "1.0")
    }
    buildTypes {
        getByName("debug") {
            manifestPlaceholders["usesCleartextTraffic"] = "true"
            isDebuggable = true
            isJniDebuggable = true
            isMinifyEnabled = false
            packaging {                jniLibs.keepDebugSymbols.add("*/arm64-v8a/*.so")
                jniLibs.keepDebugSymbols.add("*/armeabi-v7a/*.so")
                jniLibs.keepDebugSymbols.add("*/x86/*.so")
                jniLibs.keepDebugSymbols.add("*/x86_64/*.so")
            }
        }
        getByName("release") {
            isMinifyEnabled = true
            proguardFiles(
                *fileTree(".") { include("**/*.pro") }
                    .plus(getDefaultProguardFile("proguard-android-optimize.txt"))
                    .toList().toTypedArray()
            )
        }
    }
    kotlinOptions {
        jvmTarget = "1.8"
    }
    buildFeatures {
        buildConfig = true
    }
}

rust {
    rootDirRel = "../../../"
}

dependencies {
    implementation("androidx.webkit:webkit:1.14.0")
    implementation("androidx.appcompat:appcompat:1.7.1")
    implementation("androidx.activity:activity-ktx:1.10.1")
    implementation("com.google.android.material:material:1.12.0")
    implementation("androidx.lifecycle:lifecycle-process:2.10.0")
    // Turn notices while the app is closed (turnwatch/, docs/notifications.md).
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
    testImplementation("junit:junit:4.13.2")
    // The unit tests run on the JVM, where android.jar's org.json is only a stub.
    testImplementation("org.json:json:20240303")
    androidTestImplementation("androidx.test.ext:junit:1.1.4")
    androidTestImplementation("androidx.test.espresso:espresso-core:3.5.0")
}

// Third-party notices for the Android libraries in the APK
// (res/raw/aboutlibraries.json, shown by LicensesActivity): offline and
// reproducible, from the resolved dependency graph plus config/libraries and
// config/licenses. Fails on a dependency without a license or with one outside
// the allow-list. The Rust crates' and web bundle's notices ship as
// assets/licenses/ (scripts/tauri-notices.mjs).
aboutLibraries {
    offlineMode = true
    collect {
        configPath = file("config")
        fetchRemoteLicense = false
        fetchRemoteFunding = false
    }
    library {
        requireLicense = true
    }
    license {
        strictMode = com.mikepenz.aboutlibraries.plugin.StrictMode.FAIL
        allowedLicenses.addAll("Apache-2.0", "BSD-2-Clause", "MPL-2.0")
    }
    export {
        outputFile = layout.buildDirectory.file("generated/aboutLibraries/res/raw/aboutlibraries.json")
    }
}
android.sourceSets.getByName("main").res.srcDir(layout.buildDirectory.dir("generated/aboutLibraries/res"))
tasks.named("preBuild") { dependsOn("exportLibraryDefinitions") }

apply(from = "tauri.build.gradle.kts")