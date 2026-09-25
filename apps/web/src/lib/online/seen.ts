// The revision of each online match this device last showed, so reopening a
// match can mark the moves made since (see historyLog). Per device, like the
// guest session: another browser counts as a first visit.

const KEY = "mm.online.seen.v1";
/** Matches remembered; the ones seen longest ago are forgotten first. */
const MAX_MATCHES = 50;

interface Seen {
  revision: number;
  /** When it was last updated, for pruning. */
  at: number;
}

function read(): Record<string, Seen> {
  try {
    const data = JSON.parse(localStorage.getItem(KEY) ?? "{}") as unknown;
    return data && typeof data === "object" && !Array.isArray(data) ? (data as Record<string, Seen>) : {};
  } catch {
    return {};
  }
}

export function lastSeenRevision(matchId: string): number | null {
  const revision = read()[matchId]?.revision;
  return typeof revision === "number" ? revision : null;
}

/** Record that `revision` was shown; an older revision arriving late is ignored. */
export function markSeen(matchId: string, revision: number): void {
  const all = read();
  if ((all[matchId]?.revision ?? -1) >= revision) return;
  all[matchId] = { revision, at: Date.now() };
  const kept = Object.entries(all)
    .sort(([, a], [, b]) => b.at - a.at)
    .slice(0, MAX_MATCHES);
  try {
    localStorage.setItem(KEY, JSON.stringify(Object.fromEntries(kept)));
  } catch {
    // Storage blocked (private browsing): every visit then reads as the first.
  }
}

/**
 * Marks what a visible page shows as seen: now, whenever `update()` is
 * called, and when a hidden page becomes visible again. A page in the
 * background has not been read, so its updates stay "since your last visit".
 */
export function watchSeen(matchId: string, revision: () => number): { update(): void; stop(): void } {
  const update = (): void => {
    if (document.visibilityState === "visible") markSeen(matchId, revision());
  };
  document.addEventListener("visibilitychange", update);
  return { update, stop: () => document.removeEventListener("visibilitychange", update) };
}
