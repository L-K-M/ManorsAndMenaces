// Match notices while the app is open (spec §85): a background connection
// hears "your turn" and "match over" for matches that are not on screen.
// NoticeBanner lists them, and a hidden page also raises a system
// notification. While the app is closed, Web Push brings them instead
// (push.ts, pwa/sw.template.js).

import type { MatchNotice } from "@manors-menaces/protocol";
import { platform } from "../platform/adapter.js";
import { OnlineClient } from "./client.js";
import { withNotice } from "./noticeList.js";

/** The notices waiting to be opened or dismissed, newest first. */
export const notices: { list: MatchNotice[] } = $state({ list: [] });

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
  if (document.hidden) void platform.notify(notice.title, notice.body);
}

export function dismissNotice(matchId: string): void {
  notices.list = notices.list.filter((n) => n.matchId !== matchId);
}

/** Runs `fn` for every notice, including the open match's; returns the unsubscribe. */
export function onNotice(fn: (notice: MatchNotice) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
