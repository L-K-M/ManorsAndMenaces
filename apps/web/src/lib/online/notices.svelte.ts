// Match notices while the app is open (spec §85): a background connection
// hears "your turn" and "match over" for matches that are not on screen.
// NoticeBanner lists them, and a hidden page also raises a system
// notification. While the app is closed, Web Push brings them instead
// (push.ts, pwa/sw.template.js).

import type { MatchNotice } from "@manors-menaces/protocol";
import { platform } from "../platform/adapter.js";
import { OnlineClient } from "./client.js";
import { withNotice } from "./noticeList.js";
import { watchingInBackground } from "./turnNotices.js";

/** Lines kept for screen readers; only additions are read out, so this is just history. */
const KEPT_ANNOUNCEMENTS = 3;

/**
 * The notices waiting to be opened or dismissed, newest first, and the
 * lines NoticeBanner's always-mounted live region reads out as they arrive.
 */
export const notices: { list: MatchNotice[]; announcements: { id: number; text: string }[] } = $state({ list: [], announcements: [] });
let nextAnnouncementId = 0;

let watching: { token: string; stop: () => void } | null = null;
let openMatchId: () => string | null = () => null;
const listeners = new Set<(notice: MatchNotice) => void>();

/**
 * Listen with this device's guest session, if it has one. Call again after
 * signing in: a new session replaces the old connection. `openMatchId` says
 * which match is on screen; it needs no notice.
 */
export function watchNotices(options: { openMatchId?: () => string | null } = {}): void {
  if (options.openMatchId) openMatchId = options.openMatchId;
  const client = new OnlineClient();
  if (watching && watching.token === client.token) return;
  watching?.stop();
  watching = null;
  if (!client.token) return;
  watching = { token: client.token, stop: client.watch(receive) };
}

function receive(notice: MatchNotice): void {
  for (const fn of listeners) fn(notice);
  const open = openMatchId();
  if (notice.matchId === open) return;
  notices.list = withNotice(notices.list, notice, open);
  notices.announcements = [...notices.announcements, { id: nextAnnouncementId++, text: `${notice.title}. ${notice.body}` }].slice(-KEPT_ANNOUNCEMENTS);
  // The Android app's watcher shows it already when the app is in the background.
  if (document.hidden && !watchingInBackground()) void platform.notify(notice.title, notice.body);
}

export function dismissNotice(matchId: string): void {
  if (!notices.list.some((n) => n.matchId === matchId)) return;
  notices.list = notices.list.filter((n) => n.matchId !== matchId);
}

/** Runs `fn` for every notice, including the open match's; returns the unsubscribe. */
export function onNotice(fn: (notice: MatchNotice) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
