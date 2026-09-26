package ch.lkm.manorsmenaces.turnwatch

import android.app.AlarmManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.net.ConnectivityManager
import android.net.Network
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.PowerManager
import android.os.SystemClock
import android.util.Log
import androidx.core.content.ContextCompat
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.ProcessLifecycleOwner
import java.util.concurrent.TimeUnit
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener

/**
 * Keeps one WebSocket to the game server open while the app is closed, so the
 * player hears when it is their turn (docs/notifications.md). Battery use
 * comes down to how often the radio wakes: the server pings this connection
 * every 10 minutes (with a keepalive message), the app sends nothing on its
 * own, and nothing else runs until a message arrives.
 *
 * Android runs it as a foreground service of type specialUse, which has no
 * daily time limit and may restart after a reboot (TurnWatchBootReceiver).
 * It needs the battery optimization exemption to keep network access while
 * the phone dozes. All state lives on the main thread; OkHttp's callbacks are
 * posted there.
 */
class TurnWatchService : Service() {
  private val main = Handler(Looper.getMainLooper())
  private val http = OkHttpClient.Builder()
    .connectTimeout(20, TimeUnit.SECONDS)
    .readTimeout(0, TimeUnit.MILLISECONDS) // silence between keepalives is normal
    .build()
  private lateinit var settings: TurnWatchSettings
  private lateinit var ledger: NoticeLedger
  private var target: TurnWatchSettings.Target? = null
  private var socket: WebSocket? = null
  private var open = false
  private var failures = 0
  private var lastHeardAt = 0L
  /** The server's keepalive interval, as it said on connecting. */
  private var keepaliveMs = TurnWatchTiming.SERVER_HEARTBEAT_MS
  /** The network the current connection was opened on. */
  private var network: Network? = null
  private var wakeLock: PowerManager.WakeLock? = null
  private val reconnect = Runnable { connect() }
  private val networkCallback = object : ConnectivityManager.NetworkCallback() {
    // Called for the current network when registered, and again whenever the
    // default network changes (Wi-Fi to mobile data, or back after none).
    override fun onAvailable(network: Network) {
      main.post { if (network != this@TurnWatchService.network) connect() }
    }
  }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onCreate() {
    super.onCreate()
    settings = TurnWatchSettings(this)
    ledger = settings.loadLedger()
    TurnNotifications.createChannels(this)
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    // Every start must promise the notification within seconds, even one that stops at once.
    if (!goForeground()) {
      stopSelf()
      return START_NOT_STICKY
    }
    val wanted = settings.target()
    if (wanted == null) {
      stopSelf()
      return START_NOT_STICKY
    }
    if (wanted != target) {
      // First start, or the player signed in as another guest or to another server.
      target = wanted
      ledger = settings.loadLedger()
      connect()
      watchNetwork()
    } else if (socket == null || (open && TurnWatchTiming.isStale(lastHeardAt, SystemClock.elapsedRealtime(), keepaliveMs))) {
      // The watchdog, or the app starting it again: waiting out a retry, or
      // no keepalive for a while. A handshake in progress is left alone.
      Log.i(TAG, "connection down or quiet: reconnecting")
      connect()
    }
    scheduleCheck()
    return START_STICKY
  }

  override fun onDestroy() {
    main.removeCallbacksAndMessages(null)
    cancelCheck()
    runCatching { getSystemService(ConnectivityManager::class.java).unregisterNetworkCallback(networkCallback) }
    socket?.close(1000, null)
    socket = null
    releaseWakeLock()
    super.onDestroy()
  }

  private fun goForeground(): Boolean = try {
    val notification = TurnNotifications.connection(this)
    if (Build.VERSION.SDK_INT >= 34) startForeground(TurnNotifications.CONNECTION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE)
    else startForeground(TurnNotifications.CONNECTION_ID, notification)
    true
  } catch (e: IllegalStateException) {
    // Android 12+ refuses some starts from the background (for one, without
    // the battery exemption); the app starts it again when next opened.
    Log.w(TAG, "cannot run in the foreground now", e)
    false
  }

  private fun connect() {
    main.removeCallbacks(reconnect)
    socket?.cancel()
    open = false
    val url = target?.let { socketUrl(it.serverUrl, it.token) }
    if (url == null) {
      stopSelf()
      return
    }
    network = getSystemService(ConnectivityManager::class.java).activeNetwork
    // The phone may be dozing (a watchdog alarm or a network change woke it):
    // stay awake until the handshake is done, at most half a minute.
    acquireWakeLock()
    socket = http.newWebSocket(Request.Builder().url(url).build(), Listener())
  }

  private inner class Listener : WebSocketListener() {
    override fun onOpen(webSocket: WebSocket, response: Response) {
      main.post { if (webSocket == socket) opened() }
    }

    override fun onMessage(webSocket: WebSocket, text: String) {
      main.post { if (webSocket == socket) received(parseServerMessage(text)) }
    }

    override fun onClosing(webSocket: WebSocket, code: Int, reason: String) {
      webSocket.close(1000, null) // completes the close the server began
    }

    override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
      main.post { if (webSocket == socket) lost() }
    }

    override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
      main.post {
        if (webSocket != socket) return@post
        if (response?.code == 401) signedOut() else lost()
      }
    }
  }

  private fun opened() {
    open = true
    lastHeardAt = SystemClock.elapsedRealtime()
    releaseWakeLock()
  }

  private fun received(event: ServerEvent) {
    lastHeardAt = SystemClock.elapsedRealtime()
    val show = when (event) {
      is ServerEvent.Live -> if (ledger.onLive(event.notice)) listOf(event.notice) else emptyList()
      is ServerEvent.Pending -> {
        keepaliveMs = event.keepaliveMs
        ledger.onPending(event.notices)
      }
      ServerEvent.Keepalive -> {
        // Only a connection that outlived an idle stretch counts as working:
        // one that a proxy keeps cutting early backs off to a try every 10
        // minutes instead of waking the phone again and again.
        failures = 0
        return
      }
      ServerEvent.Heard -> return
    }
    settings.saveLedger(ledger)
    // With the app on screen, its own banner shows the notice.
    if (appInForeground()) return
    for (notice in show) TurnNotifications.show(this, notice)
  }

  private fun lost() {
    open = false
    socket = null
    releaseWakeLock()
    val delay = TurnWatchTiming.reconnectDelayMs(failures++)
    // A handler pauses while the phone sleeps; the watchdog alarm and the
    // network callback cover that.
    main.postDelayed(reconnect, delay)
  }

  /** The server no longer knows this guest session: stop until the app signs in again. */
  private fun signedOut() {
    Log.i(TAG, "session refused by the server: turning off")
    settings.disable()
    stopSelf()
  }

  private fun acquireWakeLock() {
    val lock = wakeLock ?: getSystemService(PowerManager::class.java).newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "ManorsMenaces:TurnWatch").also {
      it.setReferenceCounted(false)
      wakeLock = it
    }
    lock.acquire(WAKE_LOCK_MS)
  }

  private fun releaseWakeLock() {
    wakeLock?.takeIf { it.isHeld }?.release()
  }

  private fun appInForeground(): Boolean = ProcessLifecycleOwner.get().lifecycle.currentState.isAtLeast(Lifecycle.State.STARTED)

  private fun watchNetwork() {
    val connectivity = getSystemService(ConnectivityManager::class.java)
    runCatching { connectivity.unregisterNetworkCallback(networkCallback) }
    connectivity.registerDefaultNetworkCallback(networkCallback)
  }

  /** The watchdog: an alarm that may fire while the phone dozes, at most every few minutes. */
  private fun scheduleCheck() {
    val alarms = getSystemService(AlarmManager::class.java)
    alarms.setAndAllowWhileIdle(AlarmManager.ELAPSED_REALTIME_WAKEUP, SystemClock.elapsedRealtime() + TurnWatchTiming.CHECK_EVERY_MS, checkIntent())
  }

  private fun cancelCheck() {
    getSystemService(AlarmManager::class.java).cancel(checkIntent())
  }

  private fun checkIntent(): PendingIntent {
    val intent = Intent(this, TurnWatchService::class.java).setAction(ACTION_CHECK)
    val flags = PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
    return if (Build.VERSION.SDK_INT >= 26) PendingIntent.getForegroundService(this, 0, intent, flags) else PendingIntent.getService(this, 0, intent, flags)
  }

  companion object {
    private const val TAG = "TurnWatch"
    private const val ACTION_CHECK = "ch.lkm.manorsmenaces.turnwatch.CHECK"
    private const val WAKE_LOCK_MS = 30_000L

    fun start(context: Context) {
      ContextCompat.startForegroundService(context, Intent(context, TurnWatchService::class.java))
    }

    fun stop(context: Context) {
      context.stopService(Intent(context, TurnWatchService::class.java))
    }
  }
}
