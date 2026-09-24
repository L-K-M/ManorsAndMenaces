// Tauri shell for Manors & Menaces (spec §74). The game itself is the web
// build; this crate only provides the native window, file dialogs for save
// export, and notifications. Game logic never calls into Rust.

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_notification::init())
        .run(tauri::generate_context!())
        .expect("error while running Manors & Menaces");
}
