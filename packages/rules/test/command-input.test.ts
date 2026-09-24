// Commands arrive from untrusted clients (spec §72). The protocol layer only
// checks the envelope, so the engine must answer every malformed payload with
// a structured RuleError, never an exception, and must never keep references
// to caller-owned objects in the state it returns (§106).

import { describe, expect, it } from "vitest";
import { hashState, type CardTarget, type GameCommand, type GameState, type PlayerId } from "../src/index.js";
import { act, cmd, engine, grant, newGame, setupGame, standardRuleset } from "./helpers.js";

const MENACE_RULESET = { ...standardRuleset(2), activeMenaces: ["toll_troll" as const, "young_dragon" as const, "highwayman" as const] };

/** Values a hostile client can put in any JSON field. */
const JUNK: unknown[] = [
  undefined,
  null,
  0,
  42,
  "",
  "R1",
  "__proto__",
  true,
  [],
  [null],
  {},
  { kind: "region" },
  { kind: "bogus" },
  { kind: "__proto__" },
  { kind: "region", regionId: {} },
  // JSON.parse keeps "__proto__" as an own key; the fields under it must never
  // be read as if they were the object's own.
  JSON.parse('{"kind":"region","__proto__":{"regionId":"R1"}}'),
];

function give(s: GameState, p: PlayerId, card: string): GameState {
  const r = engine.applyDebugCommand(s, { type: "debug_draw_card", commandId: "d", matchId: s.matchId, playerId: p, targetPlayerId: p, cardDefId: card });
  if (!r.newState) throw new Error(r.error?.code);
  return r.newState;
}

/** p1 in the Main phase, able to pay for anything, holding `card`. */
function holding(card: string) {
  const { state, p1, p2 } = setupGame(MENACE_RULESET);
  const s = grant(give(state, p1, card), p1, { grain: 5, timber: 5, stone: 5, iron: 5, essence: 5 });
  return { s, p1, p2, cardId: s.players[p1]?.hand[0] as string };
}

function apply(s: GameState, playerId: PlayerId, fields: Record<string, unknown>) {
  return engine.applyCommand(s, cmd(s, playerId, fields as never));
}

describe("malformed card targets", () => {
  const DESTINATION_CARDS: [string, (destination: unknown) => unknown][] = [
    ["knight_errant", (destination) => ({ effect: "knight_errant", menaceId: "menace_toll_troll", destination })],
    ["bribe_the_troll", (destination) => ({ effect: "bribe_the_troll", destination })],
    ["dragon_whisperer", (destination) => ({ effect: "dragon_whisperer", destination })],
  ];

  it.each(DESTINATION_CARDS)("%s rejects malformed destinations", (card, target) => {
    const { s, p1, cardId } = holding(card);
    for (const destination of JUNK) {
      const r = apply(s, p1, { type: "play_card", cardId, target: target(destination) });
      expect(r.accepted, JSON.stringify(destination)).toBe(false);
      expect(r.error?.code).toBe("ILLEGAL_MENACE_TARGET");
    }
  });

  it("rejects malformed Warden and debug Menace destinations", () => {
    const { s, p1 } = holding("knight_errant");
    for (const destination of JUNK) {
      const hire = apply(s, p1, { type: "hire_warden", menaceId: "menace_toll_troll", destination });
      expect(hire.error?.code, JSON.stringify(destination)).toBe("ILLEGAL_MENACE_TARGET");
      const debug = engine.applyDebugCommand(s, {
        type: "debug_move_menace",
        commandId: "d",
        matchId: s.matchId,
        playerId: p1,
        menaceId: "menace_toll_troll",
        destination,
      } as never);
      expect(debug.error?.code, JSON.stringify(destination)).toBe("ILLEGAL_MENACE_TARGET");
    }
  });

  it("rejects missing or non-object targets for every card", () => {
    for (const def of engine.ctx.content.cards.filter((c) => c.timing.includes("main"))) {
      const { s, p1, cardId } = holding(def.id);
      const bare = def.effectId === "very_minor_prophecy" ? [] : [{ effect: def.effectId }];
      for (const target of [...JUNK, ...bare]) {
        const r = apply(s, p1, { type: "play_card", cardId, target });
        expect(r.accepted, `${def.id} ${JSON.stringify(target)}`).toBe(false);
        expect(r.error?.code).toMatch(/^(INVALID_CARD_TARGET|ILLEGAL_MENACE_TARGET|INSUFFICIENT_RESOURCES)$/);
      }
    }
  });
});

describe("own __proto__ keys in payloads", () => {
  function inReactionWindow() {
    const { s, p1, p2, cardId } = holding("arcane_exchange");
    return { s: give(s, p2, "counterspell"), p1, cardId };
  }

  it("never supply a card target's fields", () => {
    const { s, p1, cardId } = inReactionWindow();
    const target = JSON.parse('{"effect":"arcane_exchange","__proto__":{"give":"essence","receive":"iron"}}');
    const r = apply(s, p1, { type: "play_card", cardId, target });
    expect(r.accepted).toBe(false);
    expect(r.error?.code).toBe("INVALID_CARD_TARGET");
  });

  it("stay plain data in an accepted payload", () => {
    const { s, p1, cardId } = inReactionWindow();
    const target = JSON.parse('{"effect":"arcane_exchange","give":"essence","receive":"iron","__proto__":{"receive":"grain"}}');
    const pending = act(s, p1, { type: "play_card", cardId, target }).state.pending;
    const held = pending?.kind === "reaction" ? (pending.target as unknown as Record<string, unknown>) : undefined;
    expect(held && Object.getPrototypeOf(held)).toBe(Object.prototype);
    expect(held?.receive).toBe("iron");
  });
});

describe("hostile command fields", () => {
  // The payload fields of each command type.
  const FIELDS: Record<GameCommand["type"], string[]> = {
    place_initial_manor: ["siteId"],
    place_initial_route: ["routeId"],
    assign_initial_banners: ["assignments"],
    build_route: ["routeId", "tollPayment"],
    build_manor: ["siteId", "extraPayment", "tollPayment"],
    upgrade_holding: ["siteId", "extraPayment"],
    buy_card: [],
    play_card: ["cardId", "target"],
    trade: ["give", "receive", "tradePostSiteId"],
    issue_royal_writ: ["targetBannerId", "bribe"],
    hire_warden: ["menaceId", "destination"],
    claim_quest: ["questId"],
    end_main_phase: [],
    assign_banners: ["assignments"],
    discard_cards: ["cardIds"],
    end_turn: [],
    react: ["cardId"],
    pass_reaction: [],
    resolve_prophecy: ["order"],
  };

  /** Plausible values for every command field, so junk reaches the deep checks. */
  function baseFields(s: GameState, actor: PlayerId): Record<string, unknown> {
    const hand = s.players[actor]?.hand ?? [];
    const card = hand[0];
    const ownBanner = Object.values(s.banners).find((b) => b.ownerId === actor)?.id;
    const otherBanner = Object.values(s.banners).find((b) => b.ownerId !== actor && b.regionId)?.id;
    const destination = { kind: "region", regionId: "R1" };
    return {
      siteId: "s5",
      routeId: "r25",
      assignments: ownBanner ? { [ownBanner]: "R2" } : {},
      tollPayment: "grain",
      extraPayment: "grain",
      cardId: card,
      target: {
        effect: card ? engine.ctx.cardOf(card).effectId : "knight_errant",
        menaceId: "menace_toll_troll",
        menaceIdA: "menace_toll_troll",
        menaceIdB: "menace_young_dragon",
        destination,
        bannerId: otherBanner,
        regionId: "R2",
        give: "essence",
        receive: "iron",
        choice: "iron",
        routeId: "r25",
        take: "grain",
      },
      give: "essence",
      receive: "iron",
      tradePostSiteId: "s7",
      targetBannerId: otherBanner,
      bribe: "grain",
      menaceId: "menace_toll_troll",
      destination,
      questId: s.revealedQuestIds[0],
      cardIds: hand,
      order: s.pending?.kind === "prophecy" ? s.pending.cardIds : [],
    };
  }

  function states(): { name: string; s: GameState; actor: PlayerId }[] {
    const setup = newGame(MENACE_RULESET);
    const { s: main, p1, p2, cardId } = holding("wizard_interference");
    const reaction = act(give(main, p2, "counterspell"), p1, {
      type: "play_card",
      cardId,
      target: {
        effect: "wizard_interference",
        bannerId: Object.values(main.banners).find((b) => b.ownerId === p2 && b.regionId === "R5")?.id as string,
        regionId: "R2",
      },
    }).state;
    const prophecy = act(give(main, p1, "very_minor_prophecy"), p1, {
      type: "play_card",
      cardId: "very_minor_prophecy#1",
      target: { effect: "very_minor_prophecy" },
    }).state;
    const banners = act(main, p1, { type: "end_main_phase" }).state;
    const end = act(banners, p1, { type: "assign_banners", assignments: {} }).state;
    const withCard = engine.ctx.content.cards.filter((c) => c.timing.includes("main")).map((c) => ({ id: c.id, ...holding(c.id) }));
    return [
      { name: "setup", s: setup, actor: setup.activePlayerId },
      { name: "main", s: main, actor: p1 },
      ...withCard.map((c) => ({ name: `main holding ${c.id}`, s: c.s, actor: c.p1 })),
      { name: "reaction", s: reaction, actor: p2 },
      { name: "prophecy", s: prophecy, actor: p1 },
      { name: "banner_assignment", s: banners, actor: p1 },
      { name: "end", s: end, actor: p1 },
    ];
  }

  it("never throws, whatever the payload", () => {
    for (const { name, s, actor } of states()) {
      const base = baseFields(s, actor);
      const target = base.target as Record<string, unknown>;
      // Each payload field, and each card-target field, set to each junk value.
      for (const [type, fields] of Object.entries(FIELDS)) {
        const variants: [string, (v: unknown) => Record<string, unknown>][] = fields.map((k) => [k, (v) => ({ ...base, [k]: v })]);
        if (type === "play_card") for (const k of Object.keys(target)) variants.push([`target.${k}`, (v) => ({ ...base, target: { ...target, [k]: v } })]);
        for (const [field, make] of variants) {
          for (const value of JUNK) {
            const label = `${name} ${type} ${field}=${JSON.stringify(value)}`;
            expect(() => apply(s, actor, { ...make(value), type }), label).not.toThrow();
          }
        }
      }
    }
  });
});

describe("command payloads are copied into the state", () => {
  /** Overwrites every string in a JSON value, in place. */
  function scramble(value: unknown): void {
    if (!value || typeof value !== "object") return;
    for (const [k, v] of Object.entries(value)) {
      if (typeof v === "string" && k !== "kind") (value as Record<string, unknown>)[k] = `${v}-mutated`;
      else scramble(v);
    }
  }

  function expectDetached(s: GameState, command: GameCommand, applyIt = engine.applyCommand): GameState {
    const r = applyIt(s, command as never);
    expect(r.error).toBeUndefined();
    const after = r.newState as GameState;
    const before = hashState(after);
    scramble(command);
    expect(hashState(after)).toBe(before);
    return after;
  }

  it.each<[string, CardTarget]>([
    ["knight_errant", { effect: "knight_errant", menaceId: "menace_toll_troll", destination: { kind: "region", regionId: "R1" } }],
    ["bribe_the_troll", { effect: "bribe_the_troll", destination: { kind: "region", regionId: "R1" } }],
    ["dragon_whisperer", { effect: "dragon_whisperer", destination: { kind: "region", regionId: "R1" } }],
  ])("%s", (card, target) => {
    const { s, p1, cardId } = holding(card);
    const after = expectDetached(s, cmd(s, p1, { type: "play_card", cardId, target }));
    expect(Object.values(after.menaces).some((m) => m.location.kind === "region" && m.location.regionId === "R1")).toBe(true);
  });

  it("a Spell held in a reaction window", () => {
    const { s, p1, p2 } = holding("teleportation_mishap");
    const withCounter = give(s, p2, "counterspell");
    const target = { effect: "teleportation_mishap" as const, menaceIdA: "menace_toll_troll", menaceIdB: "menace_young_dragon" };
    const pending = expectDetached(withCounter, cmd(withCounter, p1, { type: "play_card", cardId: "teleportation_mishap#1", target }));
    expect(pending.pending?.kind).toBe("reaction");
  });

  it("Warden and debug Menace moves", () => {
    const { s, p1 } = holding("knight_errant");
    expectDetached(s, cmd(s, p1, { type: "hire_warden", menaceId: "menace_toll_troll", destination: { kind: "region", regionId: "R1" } }));
    const debug = {
      type: "debug_move_menace",
      commandId: "d",
      matchId: s.matchId,
      playerId: p1,
      menaceId: "menace_toll_troll",
      destination: { kind: "region", regionId: "R1" },
    };
    expectDetached(s, debug as never, engine.applyDebugCommand as never);
  });

  it("Banner assignments and Prophecy orders", () => {
    const { s, p1 } = holding("very_minor_prophecy");
    const prophecy = act(s, p1, { type: "play_card", cardId: "very_minor_prophecy#1", target: { effect: "very_minor_prophecy" } }).state;
    const order = prophecy.pending?.kind === "prophecy" ? [...prophecy.pending.cardIds].reverse() : [];
    const resolved = expectDetached(prophecy, cmd(prophecy, p1, { type: "resolve_prophecy", order }));
    const phase = act(resolved, p1, { type: "end_main_phase" }).state;
    const banner = Object.values(phase.banners).find((b) => b.ownerId === p1 && b.regionId === "R1")?.id as string;
    expectDetached(phase, cmd(phase, p1, { type: "assign_banners", assignments: { [banner]: null } }));
  });
});
