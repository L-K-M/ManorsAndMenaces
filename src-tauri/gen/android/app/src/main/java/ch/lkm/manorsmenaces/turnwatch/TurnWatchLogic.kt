// The parts of turn watching that are plain logic, kept apart from Android
// so they run as JVM unit tests (src/test).

package ch.lkm.manorsmenaces.turnwatch

import java.net.URI
import java.net.URLEncoder
import org.json.JSONObject

/** A notice as the server sends it (MatchNotice in packages/protocol). */
data class Notice(val matchId: String, val kind: String, val title: String, val body: String, val revision: Int)

const val KIND_YOUR_TURN = "your_turn"

/**
 * Decides which notices the phone shows, so each turn is announced once
 * however it arrives: live over the connection, or in the list of waiting
 * turns the server sends on every (re)connect. That list catches notices the
 * server sent into a connection the mobile network had silently dropped.
 *
 * `announced` maps a match to the revision of the turn last announced (or
 * already known) for it.
 */
class NoticeLedger(announced: Map<String, Int> = emptyMap(), baselined: Boolean = false) {
  private val announced = announced.toMutableMap()

  /** Whether a waiting list has been seen since the player turned notices on. */
  var hasBaseline = baselined
    private set

  fun snapshot(): Map<String, Int> = announced.toMap()

  /** A live notice: shown unless this very turn was announced already. */
  fun onLive(notice: Notice): Boolean {
    if (notice.kind != KIND_YOUR_TURN) {
      announced.remove(notice.matchId) // the match is over
      return true
    }
    if (announced[notice.matchId] == notice.revision) return false
    announced[notice.matchId] = notice.revision
    return true
  }

  /**
   * The turns waiting when the connection opens; returns those to show. The
   * first list after the player turned notices on is only remembered: they
   * just used the app, which shows those turns already.
   */
  fun onPending(pending: List<Notice>): List<Notice> {
    val fresh = if (hasBaseline) pending.filter { announced[it.matchId] != it.revision } else emptyList()
    announced.clear()
    for (notice in pending) announced[notice.matchId] = notice.revision
    hasBaseline = true
    return fresh
  }
}

object TurnWatchTiming {
  /**
   * How often the server usually sends a background connection a keepalive
   * (BACKGROUND_HEARTBEAT_MS in apps/server/src/app.ts); each server says its
   * own in the waiting list it sends on connecting.
   */
  const val SERVER_HEARTBEAT_MS = 10 * 60_000L
  private const val STALE_SLACK_MS = 2 * 60_000L
  /** How often the watchdog alarm checks; Android may run it later while the phone dozes. */
  const val CHECK_EVERY_MS = 15 * 60_000L
  private const val FIRST_RETRY_MS = 5_000L
  private const val LONGEST_RETRY_MS = 10 * 60_000L

  /** Waits after the `attempt`-th failure in a row: 5 s, 10 s, 20 s, ... up to 10 minutes. */
  fun reconnectDelayMs(attempt: Int): Long = minOf(FIRST_RETRY_MS shl minOf(attempt, 10), LONGEST_RETRY_MS)

  /** Two keepalives in a row missing (plus slack) means the network dropped the connection. */
  fun isStale(lastHeardAt: Long, now: Long, keepaliveMs: Long): Boolean = now - lastHeardAt > 2 * keepaliveMs + STALE_SLACK_MS
}

/** The background WebSocket address for a server the player signed in to, or null if it is not an http(s) address. */
fun socketUrl(serverUrl: String, token: String): String? {
  if (token.isEmpty()) return null
  val uri = try {
    URI(serverUrl.trim())
  } catch (e: Exception) {
    return null
  }
  val scheme = when (uri.scheme) {
    "https" -> "wss"
    "http" -> "ws"
    else -> return null
  }
  if (uri.host.isNullOrEmpty() || uri.rawQuery != null || uri.rawFragment != null) return null
  val base = uri.toString().trimEnd('/').replaceFirst(uri.scheme, scheme)
  return "$base/api/ws?token=${URLEncoder.encode(token, "UTF-8")}&mode=background"
}

/** What a message from the server means for the watcher. */
sealed class ServerEvent {
  data class Live(val notice: Notice) : ServerEvent()
  data class Pending(val notices: List<Notice>, val keepaliveMs: Long) : ServerEvent()
  /** Proof that the connection survived an idle stretch, unlike a fresh "hello". */
  object Keepalive : ServerEvent()
  /** Anything else, which still shows that the connection works. */
  object Heard : ServerEvent()
}

fun parseServerMessage(text: String): ServerEvent {
  val message = try {
    JSONObject(text)
  } catch (e: Exception) {
    return ServerEvent.Heard
  }
  return when (message.optString("type")) {
    "notice" -> message.optJSONObject("notice")?.let(::parseNotice)?.let { ServerEvent.Live(it) } ?: ServerEvent.Heard
    "pending_notices" -> {
      val list = message.optJSONArray("notices")
      val keepaliveMs = (message.opt("keepaliveMs") as? Number)?.toLong()?.takeIf { it > 0 } ?: TurnWatchTiming.SERVER_HEARTBEAT_MS
      ServerEvent.Pending((0 until (list?.length() ?: 0)).mapNotNull { list?.optJSONObject(it)?.let(::parseNotice) }, keepaliveMs)
    }
    "keepalive" -> ServerEvent.Keepalive
    else -> ServerEvent.Heard
  }
}

private fun parseNotice(json: JSONObject): Notice? {
  val matchId = json.opt("matchId") as? String ?: return null
  val kind = json.opt("kind") as? String ?: return null
  val revision = json.opt("revision") as? Number ?: return null
  return Notice(matchId, kind, json.optString("title"), json.optString("body"), revision.toInt())
}
