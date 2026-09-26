package ch.lkm.manorsmenaces.turnwatch

import android.Manifest
import android.app.Notification
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationChannelCompat
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import ch.lkm.manorsmenaces.R

/** The two notification channels, so players can hide the connection one and keep turn notices. */
object TurnNotifications {
  private const val CHANNEL_TURNS = "turn_notices"
  private const val CHANNEL_CONNECTION = "turn_watch_connection"
  const val CONNECTION_ID = 1
  private const val NOTICE_ID = 2
  /** Intent extra that a tapped notice carries: the match to open. */
  const val EXTRA_MATCH_ID = "ch.lkm.manorsmenaces.turnwatch.MATCH_ID"

  fun createChannels(context: Context) {
    val manager = NotificationManagerCompat.from(context)
    manager.createNotificationChannel(
      NotificationChannelCompat.Builder(CHANNEL_TURNS, NotificationManagerCompat.IMPORTANCE_DEFAULT)
        .setName(context.getString(R.string.turn_watch_channel_turns))
        .setDescription(context.getString(R.string.turn_watch_channel_turns_description))
        .build(),
    )
    // Minimum importance: no sound, no status bar icon, folded away in the shade.
    manager.createNotificationChannel(
      NotificationChannelCompat.Builder(CHANNEL_CONNECTION, NotificationManagerCompat.IMPORTANCE_MIN)
        .setName(context.getString(R.string.turn_watch_channel_connection))
        .setDescription(context.getString(R.string.turn_watch_channel_connection_description))
        .setShowBadge(false)
        .build(),
    )
  }

  /** The notification Android requires while the connection is kept open. */
  fun connection(context: Context): Notification =
    NotificationCompat.Builder(context, CHANNEL_CONNECTION)
      .setSmallIcon(R.drawable.ic_stat_turn)
      .setContentTitle(context.getString(R.string.turn_watch_connection_title))
      .setContentText(context.getString(R.string.turn_watch_connection_text))
      .setPriority(NotificationCompat.PRIORITY_MIN)
      .setOngoing(true)
      .setShowWhen(false)
      .setContentIntent(openApp(context, null))
      .build()

  fun show(context: Context, notice: Notice) {
    if (Build.VERSION.SDK_INT >= 33 && ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return
    val notification = NotificationCompat.Builder(context, CHANNEL_TURNS)
      .setSmallIcon(R.drawable.ic_stat_turn)
      .setContentTitle(notice.title)
      .setContentText(notice.body)
      .setStyle(NotificationCompat.BigTextStyle().bigText(notice.body))
      .setCategory(NotificationCompat.CATEGORY_EVENT)
      .setAutoCancel(true)
      .setContentIntent(openApp(context, notice.matchId))
      .build()
    // One per match: a newer notice replaces the older one.
    NotificationManagerCompat.from(context).notify("match-${notice.matchId}", NOTICE_ID, notification)
  }

  /** Opens the app, at `matchId` if given (TurnWatchPlugin hands it to the web app). */
  private fun openApp(context: Context, matchId: String?): PendingIntent? {
    val intent = context.packageManager.getLaunchIntentForPackage(context.packageName) ?: return null
    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
    if (matchId != null) intent.putExtra(EXTRA_MATCH_ID, matchId)
    // A request code per match keeps each notice's extras apart.
    return PendingIntent.getActivity(context, matchId?.hashCode() ?: 0, intent, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
  }
}
