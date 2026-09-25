// Named computer rivals for AI seats: assignment in New Game and lookup for
// a seat. The rival is flavour only; difficulty stays the seat's aiLevel.

import { RIVALS, rivalById, type RivalDefinition } from "@manors-menaces/content";
import type { SeatConfig } from "@manors-menaces/protocol";
import { t } from "../i18n.js";

export type SeatKind = SeatConfig["kind"];

export function rivalName(rival: RivalDefinition): string {
  return t(rival.nameKey);
}

/**
 * The first rival id, in roster order starting at `from` and wrapping, that
 * is not in `taken`; undefined when every rival is taken.
 */
export function freeRival(taken: Iterable<string | undefined>, from = 0): string | undefined {
  const used = new Set(taken);
  const n = RIVALS.length;
  const start = ((from % n) + n) % n;
  for (let i = 0; i < n; i++) {
    const r = RIVALS[(start + i) % n];
    if (r && !used.has(r.id)) return r.id;
  }
  return undefined;
}

/**
 * Distinct rivals for the AI seats, taken in roster order from `offset` so
 * that a random offset gives each new game a different line-up. Human seats
 * get undefined.
 */
export function assignRivals(kinds: readonly SeatKind[], offset = 0): (string | undefined)[] {
  const taken: string[] = [];
  return kinds.map((kind) => {
    if (kind !== "ai") return undefined;
    const id = freeRival(taken, offset + taken.length);
    if (id) taken.push(id);
    return id;
  });
}

export interface RivalSeat {
  kind: SeatKind;
  rivalId?: string | undefined;
}

/** Rivals held by the AI seats in play (the first `count`) other than seat `i`. */
export function rivalsTakenBy(seats: readonly RivalSeat[], i: number, count: number): (string | undefined)[] {
  return seats.slice(0, count).flatMap((s, j) => (j !== i && s.kind === "ai" ? [s.rivalId] : []));
}

/**
 * Rival ids for the seats with every AI seat in play holding its own rival:
 * a seat that has none, or repeats one an earlier seat in play holds, gets a
 * free one. Seats left out of the game keep theirs, so a seat brought back by
 * raising the player count may need this again.
 */
export function distinctRivals(seats: readonly RivalSeat[], count: number): (string | undefined)[] {
  const out = seats.map((s) => s.rivalId);
  for (let i = 0; i < Math.min(count, seats.length); i++) {
    if (seats[i]?.kind !== "ai") continue;
    const earlier = out.slice(0, i).filter((_, j) => seats[j]?.kind === "ai");
    const id = out[i];
    if (id && !earlier.includes(id)) continue;
    out[i] = freeRival(rivalsTakenBy(seats.map((s, j) => ({ kind: s.kind, rivalId: out[j] })), i, count), i);
  }
  return out;
}

/**
 * The rival playing a seat. Saves from before rivals existed, the tutorial
 * and online matches carry no rival id, so an AI seat whose name matches a
 * rival's name is treated as that rival.
 */
export function seatRival(seat: SeatConfig | undefined): RivalDefinition | undefined {
  if (seat?.kind !== "ai") return undefined;
  // Older saves without ids used these names before the storybook art refresh.
  const legacyNames: Record<string, string> = { "Lord Mumble": "lord_mumble", "Sir Brash": "sir_brash" };
  return rivalById(seat.rivalId) ?? RIVALS.find((r) => rivalName(r) === seat.displayName) ?? rivalById(legacyNames[seat.displayName]);
}
