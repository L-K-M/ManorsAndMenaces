fn main() {
    // The turn-watch and licenses plugins are inlined in src/lib.rs, their
    // Android sides in gen/android/app/src/main/java/ch/lkmc/manorsmenaces.
    tauri_build::try_build(
        tauri_build::Attributes::new()
            .plugin(
                "turn-watch",
                tauri_build::InlinedPlugin::new()
                    .commands(&["start", "stop", "status", "request_battery_exemption", "take_opened_match"])
                    .default_permission(tauri_build::DefaultPermissionRule::AllowAllCommands),
            )
            .plugin(
                "licenses",
                tauri_build::InlinedPlugin::new()
                    .commands(&["open"])
                    .default_permission(tauri_build::DefaultPermissionRule::AllowAllCommands),
            ),
    )
    .expect("failed to run tauri-build");
}
