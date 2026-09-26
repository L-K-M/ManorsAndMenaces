package ch.lkm.manorsmenaces.turnwatch

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class NoticeLedgerTest {
  private fun turn(matchId: String, revision: Int) = Notice(matchId, "your_turn", "Your turn", "Your move in the match with Bob.", revision)

  @Test
  fun `the first waiting list is remembered, not shown, since the player just used the app`() {
    val ledger = NoticeLedger()
    assertEquals(emptyList<Notice>(), ledger.onPending(listOf(turn("m1", 4))))
    // Reconnecting later: the same turn is not news.
    assertEquals(emptyList<Notice>(), ledger.onPending(listOf(turn("m1", 4))))
  }

  @Test
  fun `a reconnect shows the turns that came up while the connection was down`() {
    val ledger = NoticeLedger()
    ledger.onPending(listOf(turn("m1", 4)))
    assertEquals(listOf(turn("m1", 9), turn("m2", 2)), ledger.onPending(listOf(turn("m1", 9), turn("m2", 2))))
  }

  @Test
  fun `a turn is announced once, whether it arrives live or in a waiting list`() {
    val ledger = NoticeLedger()
    ledger.onPending(emptyList())
    assertTrue(ledger.onLive(turn("m1", 7)))
    assertFalse(ledger.onLive(turn("m1", 7)))
    assertEquals(emptyList<Notice>(), ledger.onPending(listOf(turn("m1", 7))))
  }

  @Test
  fun `a match that is no longer waiting is forgotten, so its next turn is news`() {
    val ledger = NoticeLedger()
    ledger.onPending(listOf(turn("m1", 7)))
    ledger.onPending(emptyList()) // the player moved in the app
    assertEquals(listOf(turn("m1", 7)), ledger.onPending(listOf(turn("m1", 7))))
  }

  @Test
  fun `the end of a match is always shown and ends its turns`() {
    val ledger = NoticeLedger()
    ledger.onPending(listOf(turn("m1", 7)))
    assertTrue(ledger.onLive(Notice("m1", "match_over", "Match over", "Bob won the match.", 8)))
    assertEquals(emptyMap<String, Int>(), ledger.snapshot())
  }

  @Test
  fun `survives a restart through its snapshot`() {
    val before = NoticeLedger()
    before.onPending(listOf(turn("m1", 4)))
    val after = NoticeLedger(before.snapshot(), before.hasBaseline)
    assertEquals(listOf(turn("m1", 5)), after.onPending(listOf(turn("m1", 5))))
  }
}

class TurnWatchTimingTest {
  @Test
  fun `reconnects soon after a failure, then backs off to ten minutes`() {
    assertEquals(5_000L, TurnWatchTiming.reconnectDelayMs(0))
    assertEquals(10_000L, TurnWatchTiming.reconnectDelayMs(1))
    assertEquals(600_000L, TurnWatchTiming.reconnectDelayMs(10))
    assertEquals(600_000L, TurnWatchTiming.reconnectDelayMs(1_000))
  }

  @Test
  fun `calls a connection dead once two keepalives in a row are missing`() {
    val heardAt = 1_000_000L
    assertFalse(TurnWatchTiming.isStale(heardAt, heardAt + 21 * 60_000L, 10 * 60_000L))
    assertTrue(TurnWatchTiming.isStale(heardAt, heardAt + 23 * 60_000L, 10 * 60_000L))
    // A server behind a proxy with a short idle timeout pings more often.
    assertTrue(TurnWatchTiming.isStale(heardAt, heardAt + 6 * 60_000L, 90_000L))
  }
}

class SocketUrlTest {
  @Test
  fun `turns the server address into its background socket`() {
    assertEquals("wss://play.example.org/api/ws?token=abc%2B%2F%3D&mode=background", socketUrl("https://play.example.org/", "abc+/="))
    assertEquals("ws://10.0.2.2:8787/api/ws?token=t&mode=background", socketUrl("http://10.0.2.2:8787", "t"))
    // A server behind a proxy at a subpath keeps it.
    assertEquals("wss://example.org/game/api/ws?token=t&mode=background", socketUrl("https://example.org/game/", "t"))
  }

  @Test
  fun `refuses anything but an http or https server`() {
    assertNull(socketUrl("ftp://example.org", "t"))
    assertNull(socketUrl("example.org", "t"))
    assertNull(socketUrl("https://play.example.org/?x=1", "t"))
    assertNull(socketUrl("https://play.example.org", ""))
  }
}

class ServerMessageTest {
  @Test
  fun `reads notices, waiting lists and keepalives`() {
    assertEquals(
      ServerEvent.Live(Notice("m1", "your_turn", "Your turn", "Your move.", 3)),
      parseServerMessage("""{"type":"notice","notice":{"matchId":"m1","kind":"your_turn","title":"Your turn","body":"Your move.","revision":3}}"""),
    )
    assertEquals(
      ServerEvent.Pending(listOf(Notice("m2", "your_turn", "Your turn", "Go.", 8)), 90_000L),
      parseServerMessage("""{"type":"pending_notices","keepaliveMs":90000,"notices":[{"matchId":"m2","kind":"your_turn","title":"Your turn","body":"Go.","revision":8}]}"""),
    )
    assertEquals(ServerEvent.Keepalive, parseServerMessage("""{"type":"keepalive"}"""))
    assertEquals(ServerEvent.Heard, parseServerMessage("""{"type":"hello","userId":"u_1"}"""))
  }

  @Test
  fun `hears but ignores anything it cannot read`() {
    assertEquals(ServerEvent.Heard, parseServerMessage("not json"))
    assertEquals(ServerEvent.Heard, parseServerMessage("""{"type":"notice","notice":{"matchId":"m1"}}"""))
    // An older server says nothing about its interval: assume the usual 10 minutes.
    assertEquals(ServerEvent.Pending(emptyList(), TurnWatchTiming.SERVER_HEARTBEAT_MS), parseServerMessage("""{"type":"pending_notices","notices":[{"matchId":5}]}"""))
  }
}
