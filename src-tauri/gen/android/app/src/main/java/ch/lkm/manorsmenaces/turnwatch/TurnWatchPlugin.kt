package ch.lkm.manorsmenaces.turnwatch

import android.annotation.SuppressLint
import android.app.Activity
import android.content.Intent
import android.os.PowerManager
import android.provider.Settings
import android.webkit.WebView
import androidx.core.app.NotificationManagerCompat
import androidx.core.net.toUri
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import org.json.JSONObject

@InvokeArg
class StartArgs {
  lateinit var serverUrl: String
  lateinit var token: String
}

/**
 * The web app's handle on turn watching (apps/web/src/lib/online/push.ts),
 * registered as the "turn-watch" plugin in src-tauri/src/lib.rs.
 */
@TauriPlugin
class TurnWatchPlugin(private val activity: Activity) : Plugin(activity) {
  private val settings = TurnWatchSettings(activity)
  /** The match of a tapped notice, until the web app asks for it. */
  private var openedMatch: String? = null

  override fun load(webView: WebView) {
    openedMatch = activity.intent?.getStringExtra(TurnNotifications.EXTRA_MATCH_ID)
    // Opened by a tapped notice: the app does not need to be told twice.
    activity.intent?.removeExtra(TurnNotifications.EXTRA_MATCH_ID)
  }

  override fun onNewIntent(intent: Intent) {
    intent.getStringExtra(TurnNotifications.EXTRA_MATCH_ID)?.let { openedMatch = it }
  }

  /** Starts watching for this server and guest, or switches to them. */
  @Command
  fun start(invoke: Invoke) {
    val args = invoke.parseArgs(StartArgs::class.java)
    if (socketUrl(args.serverUrl, args.token) == null) return invoke.reject("not an http(s) server address")
    settings.enable(TurnWatchSettings.Target(args.serverUrl, args.token))
    try {
      TurnWatchService.start(activity)
    } catch (e: IllegalStateException) {
      settings.disable()
      return invoke.reject("Android did not allow the background connection: ${e.message}")
    }
    invoke.resolve(status())
  }

  @Command
  fun stop(invoke: Invoke) {
    settings.disable()
    TurnWatchService.stop(activity)
    invoke.resolve(status())
  }

  @Command
  fun status(invoke: Invoke) {
    invoke.resolve(status())
  }

  /**
   * Asks Android to let the app keep its connection while the phone dozes.
   * Google Play restricts this request; this app is not distributed there.
   */
  @SuppressLint("BatteryLife")
  @Command
  fun requestBatteryExemption(invoke: Invoke) {
    if (!batteryUnrestricted()) {
      activity.startActivity(Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, "package:${activity.packageName}".toUri()))
    }
    invoke.resolve(status())
  }

  /** The match of the notice that opened the app, once. */
  @Command
  fun takeOpenedMatch(invoke: Invoke) {
    val matchId = openedMatch
    openedMatch = null
    invoke.resolve(JSObject().put("matchId", matchId ?: JSONObject.NULL))
  }

  private fun status(): JSObject =
    JSObject()
      .put("enabled", settings.enabled)
      .put("notificationsAllowed", NotificationManagerCompat.from(activity).areNotificationsEnabled())
      .put("batteryUnrestricted", batteryUnrestricted())

  private fun batteryUnrestricted(): Boolean = activity.getSystemService(PowerManager::class.java).isIgnoringBatteryOptimizations(activity.packageName)
}
