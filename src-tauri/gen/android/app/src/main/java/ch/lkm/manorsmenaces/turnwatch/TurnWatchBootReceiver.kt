package ch.lkm.manorsmenaces.turnwatch

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log

/** Starts watching again after the phone restarts or the app is updated, if the player had it on. */
class TurnWatchBootReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    if (intent.action != Intent.ACTION_BOOT_COMPLETED && intent.action != Intent.ACTION_MY_PACKAGE_REPLACED) return
    if (!TurnWatchSettings(context).enabled) return
    try {
      TurnWatchService.start(context)
    } catch (e: IllegalStateException) {
      // Android may refuse (the battery exemption was withdrawn, say): the app starts it when next opened.
      Log.w("TurnWatch", "cannot start after boot", e)
    }
  }
}
