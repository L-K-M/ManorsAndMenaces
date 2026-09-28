import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { CARDS } from "@manors-menaces/content";
import {
  BALANCE,
  checkBuildRoute,
  clone,
  getPlayerBanners,
  getRenown,
  standardRuleset,
  type CommandIntent,
  type GameState,
  type LegalActionSummary,
  type PlayerId,
} from "@manors-menaces/rules";
import { mapFor } from "../src/lib/game/engine.js";
import type { GameSession } from "../src/lib/game/session.svelte.js";
import { hasKey, t } from "../src/lib/i18n.js";
import type { Pick } from "../src/lib/stores/ui.svelte.js";
import { engine, playGame } from "./helpers.js";

// A tap the rules refuse opens the `blocked` dialog saying why: a card that
// can't be played, a build tool on a spot where none may stand, a Writ or a
// Warden on the wrong piece. A tap on another kind of piece still inspects
// it. The ui store is a runes module: outside the Svelte compiler `$state` is
// an ordinary global call, so the identity stands in for it.

type Interaction = typeof import("../src/lib/game/interaction.js");
type UiStore = typeof import("../src/lib/stores/ui.svelte.js");
let ix: Interaction;
let store: UiStore;

beforeAll(async () => {
  vi.stubGlobal("$state", <T>(value: T) => value);
  store = await import("../src/lib/stores/ui.svelte.js");
  ix = await import("../src/lib/game/interaction.js");
});

beforeEach(() => {
  store.resetTool();
  store.ui.dialog = null;
  store.ui.blocked = null;
  store.ui.inspect = null;
});

const ctx = engine.ctx;
const map = mapFor();
type Player = GameState["players"][string];

/** A Main phase a few rounds in: Holdings, Routes and Banners on the board. */
const base: GameState = (() => {
  const { initial, commands } = playGame(standardRuleset(3), "blocked-taps", 3, 400);
  let s = initial;
  for (const c of commands) {
    const next = engine.applyCommand(s, c).newState;
    if (!next) break;
    s = next;
    if (s.round >= 3 && s.phase === "main" && !s.pending) return s;
  }
  throw new Error("the AI game never reached a Main phase in round 3");
})();
const actor = base.activePlayerId;
const rival = base.turnOrder.find((id) => id !== actor) as PlayerId;
const noResources = { grain: 0, timber: 0, stone: 0, iron: 0, essence: 0 };
const plenty = { grain: 9, timber: 9, stone: 9, iron: 9, essence: 9 };

function edit(change: (s: GameState) => void): GameState {
  const s = clone(base);
  change(s);
  return s;
}

function fakeSession(state: GameState): { session: GameSession; performed: CommandIntent[] } {
  const performed: CommandIntent[] = [];
  const session = {
    ctx,
    map,
    draft: state,
    localActor: actor,
    perform: async (intent: CommandIntent) => {
      performed.push(intent);
      return true;
    },
  };
  return { session: session as unknown as GameSession, performed };
}

function legalOf(session: GameSession): LegalActionSummary {
  return ix.legalFor(session) as LegalActionSummary;
}

/** Sets a player's Renown by adjusting their bonus Renown. */
function setRenown(s: GameState, id: PlayerId, renown: number): void {
  const p = s.players[id] as Player;
  p.bonusRenown += renown - getRenown(ctx, s, id);
}

describe("an unplayable card", () => {
  const dealt = (card: string, change: (s: GameState) => void = () => {}): GameState =>
    edit((s) => {
      (s.players[actor] as Player).hand = [card];
      (s.players[actor] as Player).nonReactionCardsPlayedThisTurn = 0;
      change(s);
    });

  it("gets no dialog when it can be played", () => {
    const { session } = fakeSession(dealt("festival_at_the_inn"));
    expect(ix.cardBlockedNotice(session, actor, "festival_at_the_inn")).toBeNull();
  });

  it("says a Counterspell waits for another player's Spell", () => {
    const { session } = fakeSession(dealt("counterspell"));
    const card = t("card.counterspell.name");
    expect(ix.cardBlockedNotice(session, actor, "counterspell")).toEqual({
      title: t("blocked.title.card", { card }),
      text: t("why.card.REACTION_ONLY", { card }),
    });
  });

  it("says cards wait for the holder's own Main phase", () => {
    const s = edit((c) => {
      (c.players[rival] as Player).hand = ["festival_at_the_inn"];
    });
    const { session } = fakeSession(s);
    expect(ix.cardBlockedNotice(session, rival, "festival_at_the_inn")?.text).toBe(t("why.card.WRONG_PHASE"));
  });

  it("says a turn allows one card", () => {
    const s = dealt("festival_at_the_inn", (c) => {
      (c.players[actor] as Player).nonReactionCardsPlayedThisTurn = 1;
    });
    const { session } = fakeSession(s);
    expect(ix.cardBlockedNotice(session, actor, "festival_at_the_inn")?.text).toBe(t("why.card.LIMIT_REACHED"));
  });

  it("names what the card is missing", () => {
    const s = dealt("disgrace", (c) => {
      for (const id of c.turnOrder) setRenown(c, id, id === actor ? 9 : 4);
    });
    const { session } = fakeSession(s);
    expect(ix.cardBlockedNotice(session, actor, "disgrace")?.text).toBe(t("why.card.no_target.disgrace"));
    const bard = dealt("unreliable_bard", (c) => {
      for (const id of c.turnOrder) setRenown(c, id, 5);
    });
    expect(ix.cardBlockedNotice(fakeSession(bard).session, actor, "unreliable_bard")?.text).toBe(
      t("why.card.no_target.unreliable_bard", { gap: BALANCE.underdogGap }),
    );
  });

  it("has words for every card that can lack a target", () => {
    // Festival at the Inn always has one: every player gains Grain.
    const alwaysPlayable = new Set(["festival_at_the_inn"]);
    for (const c of CARDS) {
      if (!c.timing.includes("main") || alwaysPlayable.has(c.effectId)) continue;
      expect(hasKey(`why.card.no_target.${c.effectId}`), c.effectId).toBe(true);
    }
  });
});

describe("a build tool on a spot where it can't build", () => {
  it("says a Route is already owned", async () => {
    const owned = Object.keys(base.routeOwners)[0] as string;
    const { session, performed } = fakeSession(base);
    store.ui.tool = "route";
    await ix.onPick(session, legalOf(session), { kind: "route", id: owned });
    expect(performed).toEqual([]);
    expect(store.ui.dialog).toBe("blocked");
    expect(store.ui.blocked).toEqual({ title: t("blocked.title.route"), text: t("error.ROUTE_OCCUPIED") });
  });

  it("gives the price of a Route the player can't pay for", () => {
    const s = edit((c) => {
      (c.players[actor] as Player).resources = { ...noResources };
    });
    const free = ctx.board.topology.routes.find((r) => {
      const c = checkBuildRoute(ctx, s, actor, r.id);
      return c.legal && !c.needsToll;
    });
    expect(free).toBeDefined();
    const { session } = fakeSession(s);
    store.ui.tool = "route";
    const notice = ix.refusedPick(session, legalOf(session), { kind: "route", id: free?.id as string });
    expect(notice?.text).toBe(t("blocked.cannot_afford", { cost: ix.costText(BALANCE.costs.route) }));
  });

  it("says a Manor can't go on a Site that is built on", () => {
    const s = edit((c) => {
      (c.players[actor] as Player).resources = { ...plenty };
    });
    const taken = Object.values(s.holdings)[0]?.siteId as string;
    const { session } = fakeSession(s);
    store.ui.tool = "manor";
    expect(ix.refusedPick(session, legalOf(session), { kind: "site", id: taken })).toEqual({
      title: t("blocked.title.manor"),
      text: t("error.SITE_OCCUPIED"),
    });
  });

  it("says only the player's own Manors can be upgraded", () => {
    const s = edit((c) => {
      (c.players[actor] as Player).resources = { ...plenty };
    });
    const theirs = Object.values(s.holdings).find((h) => h.ownerId === rival)?.siteId as string;
    const { session } = fakeSession(s);
    store.ui.tool = "upgrade";
    expect(ix.refusedPick(session, legalOf(session), { kind: "site", id: theirs })?.text).toBe(t("blocked.upgrade.UNKNOWN_ENTITY"));
  });

  it("still inspects a piece of another kind", async () => {
    const { session, performed } = fakeSession(base);
    store.ui.tool = "manor";
    const regionId = ctx.board.topology.regions[0]?.id as string;
    await ix.onPick(session, legalOf(session), { kind: "region", id: regionId });
    expect(performed).toEqual([]);
    expect(store.ui.dialog).toBeNull();
    expect(store.ui.inspect).toEqual({ kind: "region", id: regionId });
  });
});

describe("a Writ or a Warden on the wrong piece", () => {
  it("says a Royal Writ never sends the player's own Banner home", () => {
    const own = getPlayerBanners(base, actor).find((b) => b.regionId)?.id as string;
    const { session } = fakeSession(base);
    store.ui.tool = "writ";
    expect(ix.refusedPick(session, legalOf(session), { kind: "banner", id: own })).toEqual({
      title: t("blocked.title.writ"),
      text: t("blocked.writ.own"),
    });
  });

  it("says a rival's Warden guards the Menace", () => {
    const s = edit((c) => {
      const m = Object.values(c.menaces)[0];
      if (m) m.state.guardedBy = rival;
    });
    const guarded = Object.values(s.menaces)[0]?.id as string;
    const { session } = fakeSession(s);
    store.ui.tool = "warden";
    expect(ix.refusedPick(session, legalOf(session), { kind: "menace", id: guarded })).toEqual({
      title: t("blocked.title.warden"),
      text: t("error.MENACE_GUARDED"),
    });
  });
});

describe("a card's board pick on something it can't take", () => {
  it("says the card can't be played on that", async () => {
    // Fire Bolt burns a rival's Route, never the player's own.
    const s = edit((c) => {
      (c.players[actor] as Player).hand = ["fire_bolt"];
      (c.players[actor] as Player).nonReactionCardsPlayedThisTurn = 0;
    });
    const own = Object.entries(s.routeOwners).find(([, owner]) => owner === actor)?.[0] as string;
    const { session, performed } = fakeSession(s);
    await ix.startCard(session, "fire_bolt");
    expect(ix.currentCardStep(session)?.pick).toBe("route");
    await ix.onPick(session, legalOf(session), { kind: "route", id: own } as Pick);
    expect(performed).toEqual([]);
    expect(store.ui.tool).toBe("card");
    expect(store.ui.blocked).toEqual({
      title: t("blocked.title.card_target", { card: t("card.fire_bolt.name") }),
      text: t("blocked.card_target"),
    });
  });
});

describe("setup placements", () => {
  const placer = (state: GameState): GameSession => ({ ...fakeSession(state).session, draft: state, localActor: state.activePlayerId }) as unknown as GameSession;
  const place = (state: GameState, intent: CommandIntent): GameState => {
    const r = engine.applyCommand(state, { ...intent, commandId: `setup-${intent.type}`, matchId: state.matchId, playerId: state.activePlayerId } as never);
    if (!r.newState) throw new Error(`rejected ${intent.type}: ${r.error?.code}`);
    return r.newState;
  };
  const start = playGame(standardRuleset(3), "blocked-setup", 3, 0).initial;
  const site = ctx.board.topology.sites[0]?.id as string;
  const afterManor = place(start, { type: "place_initial_manor", siteId: site });

  it("says why a starting Manor can't go next to a Holding", async () => {
    const route = ctx.board.routesAt(site)[0]?.id as string;
    const next = place(afterManor, { type: "place_initial_route", routeId: route });
    const session = placer(next);
    expect(legalOf(session).mode).toBe("setup_manor");
    await ix.onPick(session, legalOf(session), { kind: "site", id: ctx.board.neighbours(site)[0] as string });
    expect(store.ui.blocked).toEqual({ title: t("blocked.title.setup_manor"), text: t("error.SITE_TOO_CLOSE") });
  });

  it("says a starting Route must lead from the Manor just placed", async () => {
    const session = placer(afterManor);
    expect(legalOf(session).mode).toBe("setup_route");
    const away = ctx.board.topology.routes.find((r) => r.siteA !== site && r.siteB !== site)?.id as string;
    await ix.onPick(session, legalOf(session), { kind: "route", id: away });
    expect(store.ui.blocked).toEqual({ title: t("blocked.title.setup_route"), text: t("blocked.setup_route.NOT_CONNECTED") });
  });
});
