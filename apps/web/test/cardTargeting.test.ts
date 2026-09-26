import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clone,
  enumerateCardTargets,
  getLegalActions,
  getRenown,
  plagueBanners,
  standardRuleset,
  type CardEffectId,
  type CardTarget,
  type CommandIntent,
  type GameCommand,
  type GameState,
  type MenaceLocation,
  type PlayerId,
} from "@manors-menaces/rules";
import type { GameSession } from "../src/lib/game/session.svelte.js";
import type { Pick } from "../src/lib/stores/ui.svelte.js";
import { engine, playGame } from "./helpers.js";

// Drives the card targeting flow (interaction.ts) the way the board and
// Dialogs.svelte do, against a stand-in session. The ui store is a runes
// module: outside the Svelte compiler `$state` is an ordinary global call,
// so the identity stands in for it.

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
});

const ctx = engine.ctx;
type Player = GameState["players"][string];

/** A Main phase a few rounds in: Holdings, Routes and Banners on the board. */
const base: GameState = (() => {
  const { initial, commands } = playGame(standardRuleset(3), "card-targeting", 3, 400);
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
const rivals = base.turnOrder.filter((id) => id !== actor);
const rival = rivals[0] as PlayerId;

/** A copy of `base` changed by `change`, with `card` dealt to the actor. */
function prepared(card: string, change: (s: GameState, me: Player) => void = () => {}): GameState {
  const s = clone(base);
  const me = s.players[actor] as Player;
  me.hand = [card];
  change(s, me);
  return s;
}

function fakeSession(state: GameState): { session: GameSession; performed: CommandIntent[] } {
  const performed: CommandIntent[] = [];
  const session = {
    ctx,
    draft: state,
    localActor: actor,
    perform: async (intent: CommandIntent) => {
      performed.push(intent);
      return true;
    },
  };
  return { session: session as unknown as GameSession, performed };
}

function boardPick(kind: string, value: unknown): Pick {
  if (kind === "location") return { kind: "location", location: value as MenaceLocation };
  return { kind, id: String(value) } as Pick;
}

/**
 * Plays `card` from `state` by taking the first option of every step: a
 * dialog's choice, a board pick, then the confirmation. Returns the command
 * sent and the dialogs opened on the way.
 */
async function drive(state: GameState, card: string): Promise<{ intent: CommandIntent | undefined; dialogs: string[] }> {
  const { session, performed } = fakeSession(state);
  const dialogs: string[] = [];
  await ix.startCard(session, card);
  for (let i = 0; i < 6 && performed.length === 0 && store.ui.tool === "card"; i++) {
    const dialog = store.ui.dialog;
    if (dialog) dialogs.push(dialog);
    if (dialog === "card_confirm") {
      await ix.playPickedCard(session);
      break;
    }
    const step = ix.currentCardStep(session);
    if (!step) throw new Error(`${card} is stuck without a step`);
    if (!store.isCardDialog(step.pick)) {
      expect(dialog, "a board pick has no dialog open").toBeNull();
      await ix.onPick(session, ix.legalFor(session), boardPick(step.pick, step.options[0]));
      continue;
    }
    expect(dialog).toBe(step.pick);
    // The two-part exchange dialogs pick a whole candidate; the others one field.
    const first = ix.cardCandidates(session)[0] as Record<string, unknown> | undefined;
    const fields = step.pick === "arcane" || step.pick === "transmutation" ? { give: first?.give, receive: first?.receive } : { [step.field]: step.options[0] };
    await ix.finishCardWith(session, fields);
  }
  if (performed.length === 0) throw new Error(`${card} finished its flow without sending a command`);
  return { intent: performed[0], dialogs };
}

/** The engine accepts the command: the flow's target is a legal one. */
function expectAccepted(state: GameState, intent: CommandIntent | undefined): void {
  expect(intent?.type).toBe("play_card");
  const command = { ...intent, commandId: "ui-test", matchId: state.matchId, playerId: actor } as GameCommand;
  const r = engine.applyCommand(state, command);
  expect(r.error).toBeUndefined();
  expect(r.accepted).toBe(true);
}

/** Sets a player's Renown by adjusting their bonus Renown. */
function setRenown(s: GameState, id: PlayerId, renown: number): void {
  const p = s.players[id] as Player;
  p.bonusRenown += renown - getRenown(ctx, s, id);
}

const noResources = { grain: 0, timber: 0, stone: 0, iron: 0, essence: 0 };

/** Each new card, set up so it can be played, and the dialogs its flow opens. */
const NEW_CARDS: { effect: CardEffectId; setup?: (s: GameState, me: Player) => void; dialogs: string[] }[] = [
  {
    effect: "changeling",
    setup: (s) => {
      (s.players[rival] as Player).hand = ["fog_of_confusion#9"];
    },
    dialogs: ["player"],
  },
  { effect: "ragnarok", setup: (s) => setRenown(s, actor, 10), dialogs: ["card_confirm"] },
  { effect: "fire_bolt", dialogs: [] },
  {
    effect: "dragons_landing",
    setup: (s) => {
      const taken = new Set(Object.values(s.holdings).map((h) => h.siteId));
      const site = ctx.board.topology.sites.find((x) => !taken.has(x.id));
      if (!site) throw new Error("no free Site");
      s.holdings.h_extra = { id: "h_extra", siteId: site.id, ownerId: rival, type: "manor" };
      (s.players[rival] as Player).holdingIds.push("h_extra");
    },
    dialogs: ["card_confirm"],
  },
  {
    effect: "transmutation_magic",
    setup: (_, me) => {
      me.resources = { ...noResources, grain: 2 };
    },
    dialogs: ["transmutation"],
  },
  { effect: "the_plague", dialogs: ["card_confirm"] },
  { effect: "royal_insurance_policy", dialogs: [] },
  {
    effect: "robin_of_the_glade",
    setup: (s) => {
      setRenown(s, rival, getRenown(ctx, s, actor) + 1);
      (s.players[rival] as Player).resources = { ...noResources, iron: 2 };
    },
    dialogs: ["resource"],
  },
  { effect: "unreliable_bard", setup: (s) => setRenown(s, rival, getRenown(ctx, s, actor) + 2), dialogs: [] },
  {
    effect: "treasure_hunter",
    setup: (s) => {
      const dragon = Object.values(s.menaces).find((m) => m.type === "young_dragon");
      if (!dragon) throw new Error("no Young Dragon");
      dragon.state.hoard = { grain: 5, stone: 1 };
    },
    dialogs: ["hoard"],
  },
];

describe("card targeting flow", () => {
  it("has a flow test for every card newer than the prototype deck", () => {
    const prototype = new Set<CardEffectId>([
      "wizard_interference",
      "counterspell",
      "knight_errant",
      "druids_blessing",
      "teleportation_mishap",
      "bribe_the_troll",
      "arcane_exchange",
      "festival_at_the_inn",
      "very_minor_prophecy",
      "fog_of_confusion",
      "dragon_whisperer",
    ]);
    const newer = ctx.content.cards.map((c) => c.effectId).filter((e) => !prototype.has(e));
    expect(NEW_CARDS.map((c) => c.effect).sort()).toEqual(newer.sort());
  });

  it.each(NEW_CARDS)("plays $effect through its steps to a legal target", async ({ effect, setup, dialogs }) => {
    const card = `${effect}#1`;
    const s = prepared(card, setup);
    expect(getLegalActions(ctx, s, actor).playableCards, `${effect} is playable`).toContain(card);
    const run = await drive(s, card);
    expect(run.dialogs).toEqual(dialogs);
    expectAccepted(s, run.intent);
    expect(store.ui.tool).toBe("none");
    expect(store.ui.dialog).toBeNull();
  });

  it("opens each older dialog card's own dialog, never the Festival's", async () => {
    const festival = await drive(prepared("festival_at_the_inn#1"), "festival_at_the_inn#1");
    expect(festival.dialogs).toEqual(["resource"]);
    const s = prepared("arcane_exchange#1", (_, me) => {
      me.resources = { ...noResources, essence: 1 };
    });
    const arcane = await drive(s, "arcane_exchange#1");
    expect(arcane.dialogs).toEqual(["arcane"]);
    expectAccepted(s, arcane.intent);
  });

  it("offers Changeling only opponents who hold a card", async () => {
    const s = prepared("changeling#1", (st) => {
      for (const id of rivals) (st.players[id] as Player).hand = [];
      (st.players[rival] as Player).hand = ["fog_of_confusion#9"];
    });
    const { session } = fakeSession(s);
    await ix.startCard(session, "changeling#1");
    expect(store.ui.dialog).toBe("player");
    expect(ix.currentCardStep(session)?.options).toEqual([rival]);
  });

  it("offers Robin of the Glade only resources a richer rival holds, and names who pays", async () => {
    const s = prepared("robin_of_the_glade#1", (st) => {
      setRenown(st, actor, 0);
      setRenown(st, rival, 5);
      (st.players[rival] as Player).resources = { ...noResources, iron: 2, essence: 1 };
      for (const id of rivals.slice(1)) {
        setRenown(st, id, 0);
        (st.players[id] as Player).resources = { ...noResources, grain: 4 };
      }
    });
    const { session } = fakeSession(s);
    await ix.startCard(session, "robin_of_the_glade#1");
    expect(ix.currentCardStep(session)?.options).toEqual(["iron", "essence"]);
    expect(ix.robinPayers(ctx, s, actor, "iron")).toEqual([rival]);
    expect(ix.robinPayers(ctx, s, actor, "grain")).toEqual([]);
  });

  it("asks Treasure Hunter for the Hoard first, then for a Region with one of your Banners", async () => {
    const s = prepared("treasure_hunter#1", NEW_CARDS.find((c) => c.effect === "treasure_hunter")?.setup);
    const { session } = fakeSession(s);
    await ix.startCard(session, "treasure_hunter#1");
    expect(store.ui.dialog).toBe("hoard");
    expect(ix.currentCardStep(session)?.options).toEqual(["grain", "stone"]);
    await ix.finishCardWith(session, { take: "grain" });
    expect(store.ui.dialog).toBeNull();
    const h = ix.computeHighlights(session, ix.legalFor(session));
    expect(h.hint).toBe("hint.card_location");
    const mine = new Set(Object.values(s.banners).filter((b) => b.ownerId === actor && b.regionId).map((b) => `region:${b.regionId}`));
    expect(h.locations.size).toBeGreaterThan(0);
    for (const key of h.locations) expect(mine.has(key), key).toBe(true);
  });

  it("shows The Plague's Sites, then its victims before it is cast, and Back returns to the Sites", async () => {
    const s = prepared("the_plague#1");
    const { session, performed } = fakeSession(s);
    await ix.startCard(session, "the_plague#1");
    const sites = ix.computeHighlights(session, ix.legalFor(session));
    expect(sites.hint).toBe("hint.card_site");
    const siteIds = enumerateCardTargets(ctx, s, actor, "the_plague#1").map((c) => (c.effect === "the_plague" ? c.siteId : ""));
    expect([...sites.sites].sort()).toEqual([...siteIds].sort());

    const siteId = siteIds[0] as string;
    await ix.onPick(session, ix.legalFor(session), { kind: "site", id: siteId });
    expect(store.ui.dialog).toBe("card_confirm");
    expect(performed).toEqual([]);
    const victims = ix.plagueVictims(ctx, s, siteId);
    expect(victims.flatMap((v) => v.ids).sort()).toEqual(plagueBanners(ctx, s, siteId).map((b) => b.id).sort());
    expect(victims.some((v) => v.ownerId !== actor)).toBe(true);
    const shown = ix.computeHighlights(session, ix.legalFor(session));
    expect([...shown.sites]).toEqual([siteId]);
    expect([...shown.banners].sort()).toEqual(victims.flatMap((v) => v.ids).sort());

    ix.backCardStep(session);
    expect(store.ui.dialog).toBeNull();
    expect(store.ui.cardPicks).toEqual({});
    expect(ix.currentCardStep(session)?.pick).toBe("site");
  });

  it("spares an insured owner's Banners in The Plague's preview", async () => {
    const s = prepared("the_plague#1");
    // A Site where a rival and at least one other player would fall sick.
    const siteId = enumerateCardTargets(ctx, s, actor, "the_plague#1")
      .map((c) => (c as Extract<CardTarget, { effect: "the_plague" }>).siteId)
      .find((id) => ix.plagueVictims(ctx, s, id).length >= 2);
    if (!siteId) throw new Error("no Site where two players' Banners would fall sick");
    const victim = ix.plagueVictims(ctx, s, siteId).find((v) => v.ownerId !== actor);
    if (!victim) throw new Error("no rival victim");
    expect(victim.insured).toBe(false);

    (s.players[victim.ownerId] as Player).charters = ["royal_insurance_policy#1"];
    const victims = ix.plagueVictims(ctx, s, siteId);
    expect(victims.find((v) => v.ownerId === victim.ownerId)?.insured).toBe(true);
    const sick = victims.filter((v) => !v.insured).flatMap((v) => v.ids);
    expect(sick.length).toBeGreaterThan(0);

    const { session } = fakeSession(s);
    await ix.startCard(session, "the_plague#1");
    await ix.onPick(session, ix.legalFor(session), { kind: "site", id: siteId });
    expect(store.ui.dialog).toBe("card_confirm");
    const shown = ix.computeHighlights(session, ix.legalFor(session));
    expect([...shown.banners].sort()).toEqual([...sick].sort());
    for (const b of victim.ids) expect(shown.banners.has(b), b).toBe(false);
  });

  it("lists Dragon's Landing risks by owner, the caster's own Holdings included", () => {
    const s = prepared("dragons_landing#1", (st, me) => {
      NEW_CARDS.find((c) => c.effect === "dragons_landing")?.setup?.(st, me);
      const taken = new Set(Object.values(st.holdings).map((h) => h.siteId));
      const site = ctx.board.topology.sites.find((x) => !taken.has(x.id));
      if (!site) throw new Error("no free Site");
      st.holdings.h_mine = { id: "h_mine", siteId: site.id, ownerId: actor, type: "manor" };
      me.holdingIds.push("h_mine");
    });
    const mine = (s.players[actor] as Player).holdingIds;
    expect(mine.length).toBeGreaterThanOrEqual(3);
    const risks = ix.landingRisks(ctx, s);
    expect(risks.map((r) => r.ownerId)).toContain(rival);
    expect(risks.find((r) => r.ownerId === rival)?.ids).toContain("h_extra");
    expect([...(risks.find((r) => r.ownerId === actor)?.ids ?? [])].sort()).toEqual([...mine].sort());
    for (const r of risks) expect((s.players[r.ownerId] as Player).holdingIds.length).toBeGreaterThanOrEqual(3);
  });

  it("closes a card's dialog when the tool is reset", async () => {
    const s = prepared("transmutation_magic#1", (_, me) => {
      me.resources = { ...noResources, grain: 2 };
    });
    const { session } = fakeSession(s);
    await ix.startCard(session, "transmutation_magic#1");
    expect(store.ui.dialog).toBe("transmutation");
    store.resetTool();
    expect(store.ui.dialog).toBeNull();
    store.ui.dialog = "market";
    store.resetTool();
    expect(store.ui.dialog).toBe("market");
  });
});
