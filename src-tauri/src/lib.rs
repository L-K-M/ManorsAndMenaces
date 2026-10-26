// Tauri shell for Manors & Menaces (spec §74). The game itself is the web
// build; this crate only provides the native window, file dialogs for save
// export, notifications, and on Android the turn watcher. Game logic never
// calls into Rust.

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(turn_watch())
        .plugin(licenses())
        .run(tauri::generate_context!())
        .expect("error while running Manors & Menaces");
}

/// Turn notices while the Android app is closed (docs/notifications.md): a
/// foreground service in Kotlin keeps one connection to the game server. Its
/// commands (see build.rs) go straight to TurnWatchPlugin.kt; on other
/// platforms they are not found, which the web app reads as "not available".
fn turn_watch<R: tauri::Runtime>() -> tauri::plugin::TauriPlugin<R> {
    tauri::plugin::Builder::new("turn-watch")
        .setup(|_app, _api| {
            #[cfg(target_os = "android")]
            _api.register_android_plugin("ch.lkmc.manorsmenaces.turnwatch", "TurnWatchPlugin")?;
            Ok(())
        })
        .build()
}

/// The Android app's licenses screen for the Android libraries in the APK
/// (LicensesActivity.kt), opened from Settings > Licenses. Its one command
/// goes straight to LicensesPlugin.kt; the desktop apps do not offer it.
fn licenses<R: tauri::Runtime>() -> tauri::plugin::TauriPlugin<R> {
    tauri::plugin::Builder::new("licenses")
        .setup(|_app, _api| {
            #[cfg(target_os = "android")]
            _api.register_android_plugin("ch.lkmc.manorsmenaces", "LicensesPlugin")?;
            Ok(())
        })
        .build()
}
