// Who to tell about a match they may not have open (spec §85): the player who
// must act next, and everyone once the match ends. Nothing for moves that
// leave the same player acting, so a turn of many actions is one notice.

import { EN } from "@manors-menaces/content";
import type { MatchNotice, NoticeKind } from "@manors-menaces/protocol";
import type { GameState, PlayerId } from "@manors-menaces/rules";

/** Who must act next: reaction and prophecy decisions come before the active player. */
export function actorOf(state: GameState): PlayerId | null {
  if (state.status === "finished") return null;
  if (state.pending?.kind === "reaction") return state.pending.eligiblePlayerIds[0] ?? null;
  if (state.pending?.kind === "prophecy") return state.pending.playerId;
  return state.activePlayerId;
}

/**
 * The players to notify after a commit took the match from `before` to
 * `after`; `before` is null when the match has just started.
 */
export function noticesAfter(before: GameState | null, after: GameState): { playerId: PlayerId; kind: NoticeKind }[] {
  if (after.status === "finished") {
    if (before?.status === "finished") return [];
    return Object.keys(after.players).map((playerId) => ({ playerId, kind: "match_over" as const }));
  }
  const actor = actorOf(after);
  return actor && actor !== (before && actorOf(before)) ? [{ playerId: actor, kind: "your_turn" }] : [];
}

export function text(key: string, params: Record<string, string | number> = {}): string {
  return (EN[key] ?? key).replace(/\{(\w+)\}/g, (_, name: string) => String(params[name] ?? `{${name}}`));
}

/** The notice for `playerId`, worded for them (the catalog's English, like the push service's). */
export function noticeFor(matchId: string, kind: NoticeKind, playerId: PlayerId, state: GameState): MatchNotice {
  const others = Object.entries(state.players)
    .filter(([id]) => id !== playerId)
    .map(([, p]) => p.displayName);
  const names = others.join(", ");
  const revision = state.revision;
  if (kind === "your_turn") return { matchId, kind, revision, title: text("notify.your_turn_title"), body: text("notify.your_turn_body", { names }) };
  const winner = state.winnerId ? state.players[state.winnerId] : undefined;
  const body = !winner ? text("notify.match_over_body", { names }) : state.winnerId === playerId ? text("notify.you_won_body", { names }) : text("notify.won_body", { name: winner.displayName });
  return { matchId, kind, revision, title: text("notify.match_over_title"), body };
}
