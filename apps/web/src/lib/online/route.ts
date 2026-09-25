// The online match on screen lives in the address (#/match/ID), so reloading
// the page, or a link, reopens it (see OnlineLobby). Replaced rather than
// pushed: Back should leave the app, not step between matches.

const PREFIX = "#/match/";

/** The match id in the current address, if any. */
export function matchRoute(): string | null {
  if (!location.hash.startsWith(PREFIX)) return null;
  try {
    return decodeURIComponent(location.hash.slice(PREFIX.length)) || null;
  } catch {
    // A mangled link (a stray %): open the lobby rather than fail to start it.
    return null;
  }
}

export function setMatchRoute(matchId: string): void {
  history.replaceState(history.state, "", PREFIX + encodeURIComponent(matchId));
}

/** Drops the match from the address (only `matchId`'s, when given). */
export function clearMatchRoute(matchId?: string): void {
  const current = matchRoute();
  if (!current || (matchId !== undefined && current !== matchId)) return;
  history.replaceState(history.state, "", location.pathname + location.search);
}
