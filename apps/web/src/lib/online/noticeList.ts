// The notices waiting for the player (spec §85): newest first, one per match,
// a few at most. The match on screen needs none: it shows its own turn.

import type { MatchNotice } from "@manors-menaces/protocol";

export const MAX_NOTICES = 3;

export function withNotice(list: readonly MatchNotice[], notice: MatchNotice, openMatchId: string | null): MatchNotice[] {
  if (notice.matchId === openMatchId) return [...list];
  return [notice, ...list.filter((n) => n.matchId !== notice.matchId)].slice(0, MAX_NOTICES);
}
