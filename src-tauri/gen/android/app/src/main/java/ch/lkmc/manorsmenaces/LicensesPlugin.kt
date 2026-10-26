package ch.lkmc.manorsmenaces

import android.app.Activity
import android.content.Intent
import app.tauri.annotation.Command
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.Plugin

/**
 * Opens [LicensesActivity] from the web app's Settings > Licenses
 * (apps/web/src/lib/components/LicenseNotices.svelte), registered as the
 * "licenses" plugin in src-tauri/src/lib.rs.
 */
@TauriPlugin
class LicensesPlugin(private val activity: Activity) : Plugin(activity) {
  @Command
  fun open(invoke: Invoke) {
    activity.startActivity(Intent(activity, LicensesActivity::class.java))
    invoke.resolve()
  }
}
