import { describe, expect, it } from "vitest";
import { clone, manorSiteClosedReason, standardRuleset, type GameState, type PlayerId } from "@manors-menaces/rules";
import { mapFor } from "../src/lib/game/engine.js";
import { describePick, type ManorClosedOf } from "../src/lib/game/inspect.js";
import { t } from "../src/lib/i18n.js";
import { engine, playGame } from "./helpers.js";

// Tapping an empty Site says whether a Manor may still go there, the same
// answer the board's open-Site ring gives (spacing, §10.3), so the ring
// explains itself.

const ctx = engine.ctx;
const map = mapFor();

/** A few rounds in: Holdings on the board, some Sites closed by them. */
const base: GameState = (() => {
  const { initial, commands } = playGame(standardRuleset(3), "open-sites", 3, 400);
  let s = initial;
  for (const c of commands) {
    const next = engine.applyCommand(s, c).newState;
    if (!next) break;
    s = next;
    if (s.round >= 3 && s.phase === "main" && !s.pending) return s;
  }
  throw new Error("the AI game never reached a Main phase in round 3");
})();

const closedFor =
  (s: GameState, viewer: PlayerId | null): ManorClosedOf =>
  (id) =>
    manorSiteClosedReason(ctx, s, viewer, id);
const siteLines = (s: GameState, id: string, viewer: PlayerId | null) =>
  describePick(map, s, { kind: "site", id }, undefined, closedFor(s, viewer))?.lines ?? [];
const holdingSites = (s: GameState) => new Set(Object.values(s.holdings).map((h) => h.siteId));

describe("the Site inspector", () => {
  it("says whether each empty Site can still take a Manor", () => {
    const viewer = base.turnOrder[0] as PlayerId;
    const held = holdingSites(base);
    const seen = new Set<string>();
    for (const { id } of map.sites) {
      const lines = siteLines(base, id, viewer);
      const open = lines.includes(t("inspect.site_open"));
      const tooClose = lines.includes(t("inspect.site_too_close"));
      if (held.has(id)) {
        expect(open || tooClose, id).toBe(false);
        continue;
      }
      const reason = manorSiteClosedReason(ctx, base, viewer, id);
      expect(open, id).toBe(reason === null);
      expect(tooClose, id).toBe(reason === "SITE_TOO_CLOSE");
      seen.add(open ? "open" : "too close");
    }
    expect([...seen].sort()).toEqual(["open", "too close"]);
  });

  it("says nothing of Manors without the rules' answer", () => {
    const empty = map.sites.find((x) => !holdingSites(base).has(x.id))!;
    const lines = describePick(map, base, { kind: "site", id: empty.id })?.lines ?? [];
    expect(lines).not.toContain(t("inspect.site_open"));
    expect(lines).not.toContain(t("inspect.site_too_close"));
  });

  it("explains a Site closed by a razed neighbour, and leaves the razed Site to its own line", () => {
    // Raiders burn p1's Manor: its Site and the empty Sites around it are
    // p1's alone until the end of p1's next turn (§19.24).
    const [p1, p2] = base.turnOrder as [PlayerId, PlayerId];
    const manor = Object.values(base.holdings).find((h) => h.ownerId === p1 && h.type === "manor")!;
    const s = clone(base);
    delete s.holdings[manor.id];
    s.activeEffects.push({ kind: "razed", siteId: manor.siteId, ownerId: p1, sourcePlayerId: p2 });
    const near = ctx.board.neighbours(manor.siteId).find((n) => manorSiteClosedReason(ctx, s, p2, n) === "SITE_RAZED")!;
    expect(near).toBeDefined();

    expect(siteLines(s, near, p2)).toContain(t("inspect.site_near_razed"));
    const razedLines = siteLines(s, manor.siteId, p2);
    expect(razedLines).not.toContain(t("inspect.site_near_razed"));
    expect(razedLines.some((l) => l.startsWith("Razed"))).toBe(true);
    // Its owner may rebuild there.
    expect(siteLines(s, manor.siteId, p1)).toContain(t("inspect.site_open"));
  });
});
