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

/**
 * The rival playing a seat. Saves from before rivals existed, the tutorial
 * and online matches carry no rival id, so an AI seat whose name matches a
 * rival's name is treated as that rival.
 */
export function seatRival(seat: SeatConfig | undefined): RivalDefinition | undefined {
  if (seat?.kind !== "ai") return undefined;
  return rivalById(seat.rivalId) ?? RIVALS.find((r) => rivalName(r) === seat.displayName);
}
