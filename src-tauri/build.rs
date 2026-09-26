fn main() {
    // The turn-watch plugin is inlined in src/lib.rs, its Android side in
    // gen/android/app/src/main/java/ch/lkm/manorsmenaces/turnwatch.
    tauri_build::try_build(
        tauri_build::Attributes::new().plugin(
            "turn-watch",
            tauri_build::InlinedPlugin::new()
                .commands(&["start", "stop", "status", "request_battery_exemption", "take_opened_match"])
                .default_permission(tauri_build::DefaultPermissionRule::AllowAllCommands),
        ),
    )
    .expect("failed to run tauri-build");
}
