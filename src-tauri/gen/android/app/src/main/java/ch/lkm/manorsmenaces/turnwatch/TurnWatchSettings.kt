package ch.lkm.manorsmenaces.turnwatch

import android.content.Context
import androidx.core.content.edit
import org.json.JSONObject

/**
 * What the watcher needs across restarts and reboots: whether the player
 * turned it on, which server and guest session to listen for, and which
 * turns were already announced. The guest token is the one the app keeps in
 * its WebView storage; it stays in app-private storage here too.
 */
class TurnWatchSettings(context: Context) {
  data class Target(val serverUrl: String, val token: String)

  private val prefs = context.getSharedPreferences("turn_watch", Context.MODE_PRIVATE)

  val enabled: Boolean
    get() = prefs.getBoolean(KEY_ENABLED, false)

  /** The server and session to listen for, or null when turned off. */
  fun target(): Target? {
    if (!enabled) return null
    val serverUrl = prefs.getString(KEY_SERVER, null) ?: return null
    val token = prefs.getString(KEY_TOKEN, null) ?: return null
    return Target(serverUrl, token)
  }

  /** Turns watching on; a different guest or server starts a fresh ledger. */
  fun enable(target: Target) {
    val sameTarget = target == target()
    prefs.edit {
      putBoolean(KEY_ENABLED, true)
      if (!sameTarget) remove(KEY_LEDGER).remove(KEY_BASELINED)
      putString(KEY_SERVER, target.serverUrl).putString(KEY_TOKEN, target.token)
    }
  }

  fun disable() {
    prefs.edit { putBoolean(KEY_ENABLED, false).remove(KEY_TOKEN).remove(KEY_LEDGER).remove(KEY_BASELINED) }
  }

  fun loadLedger(): NoticeLedger {
    val json = prefs.getString(KEY_LEDGER, null)?.let { runCatching { JSONObject(it) }.getOrNull() } ?: JSONObject()
    val announced = json.keys().asSequence().associateWith { json.optInt(it) }
    return NoticeLedger(announced, prefs.getBoolean(KEY_BASELINED, false))
  }

  fun saveLedger(ledger: NoticeLedger) {
    prefs.edit { putString(KEY_LEDGER, JSONObject(ledger.snapshot()).toString()).putBoolean(KEY_BASELINED, ledger.hasBaseline) }
  }

  private companion object {
    const val KEY_ENABLED = "enabled"
    const val KEY_SERVER = "server_url"
    const val KEY_TOKEN = "token"
    const val KEY_LEDGER = "announced"
    const val KEY_BASELINED = "baselined"
  }
}
