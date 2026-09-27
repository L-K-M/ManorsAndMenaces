import { describe, expect, it } from "vitest";
import { clone, createRng, seedRng, type CommandIntent, type GameState, type PlayerId, type ResourceType, type Resources } from "@manors-menaces/rules";
import { chooseAction, resourceNeeds } from "../src/index.js";
import { engine, setupGame, standardRuleset } from "../../rules/test/helpers.js";

// The Crown's Levy (§27.3) on the rules test board. The Levy is written
// straight into the state, as the AI only ever reads it: this round's names
// Grain, the next round's Stone.

const NONE: Resources = { grain: 0, timber: 0, stone: 0, iron: 0, essence: 0 };

/** p1's turn 1 with only `resources` and no cards, the Levy in force unless `levy` is false. */
function position(resources: Partial<Resources>, opts: { targetRenown?: number; levy?: boolean } = {}): { state: GameState; p1: PlayerId } {
  const rules = { ...standardRuleset(2, opts.targetRenown ? { targetRenown: opts.targetRenown } : {}), initialCards: 0, cardDrawEveryRounds: 0 };
  const { state, p1, p2 } = setupGame(rules);
  const s = clone(state);
  for (const id of [p1, p2]) {
    const p = s.players[id];
    if (!p) throw new Error("no player");
    p.hand = [];
    p.resources = { ...NONE };
  }
  (s.players[p1] as GameState["players"][string]).resources = { ...NONE, ...resources };
  if (opts.levy !== false) s.crownLevy = { current: "grain", next: "stone", called: ["grain", "stone"], answeredBy: [] };
  expect(s.activePlayerId).toBe(p1);
  return { state: s, p1 };
}

function decide(state: GameState, playerId: PlayerId): CommandIntent | null {
  return chooseAction(engine, state, playerId, { level: "normal", rng: createRng(seedRng("levy")) });
}

/** The AI's moves until it ends its Main phase. */
function mainPhase(state: GameState, playerId: PlayerId): CommandIntent[] {
  const moves: CommandIntent[] = [];
  let s = state;
  for (let i = 0; i < 12; i++) {
    const intent = decide(s, playerId);
    if (!intent) break;
    moves.push(intent);
    if (intent.type === "end_main_phase") break;
    const r = engine.applyCommand(s, { ...intent, commandId: `levy-${i}`, matchId: s.matchId, playerId } as never);
    if (!r.newState) throw new Error(`rejected ${intent.type}: ${r.error?.code}`);
    s = r.newState;
  }
  return moves;
}

describe("the AI and the Crown's Levy (§27.3)", () => {
  it("answers the Levy when it can pay", () => {
    const { state, p1 } = position({ grain: 5 });
    expect(decide(state, p1)).toEqual({ type: "answer_levy", resource: "grain" });
  });

  it("saves toward this round's Levy and the next", () => {
    const { state, p1 } = position({});
    const without = resourceNeeds(engine.ctx, position({}, { levy: false }).state, p1);
    const need = resourceNeeds(engine.ctx, state, p1);
    const more = (r: ResourceType) => need[r] - without[r];
    expect(more("grain")).toBeGreaterThan(0);
    expect(more("stone")).toBeGreaterThan(0);
    // This round's Levy weighs more than the next one.
    expect(more("grain")).toBeGreaterThan(more("stone"));
    expect(more("iron")).toBe(0);
    // Once answered, only the next Levy is saved for.
    const answered = clone(state);
    answered.crownLevy?.answeredBy.push(p1);
    expect(resourceNeeds(engine.ctx, answered, p1).grain).toBe(without.grain);
  });

  // Regression: in the last round the AI still saved for the next round's
  // Levy, which the game never reaches.
  it("saves for no next Levy in the last round", () => {
    const { state, p1 } = position({});
    const last = { ...state, ruleset: { ...state.ruleset, lastRound: state.round } };
    const without = resourceNeeds(engine.ctx, position({}, { levy: false }).state, p1);
    const need = resourceNeeds(engine.ctx, last, p1);
    expect(need.grain).toBeGreaterThan(without.grain);
    expect(need.stone).toBe(without.stone);
  });

  it("trades at the Market, then answers", () => {
    const { state, p1 } = position({ grain: 4, timber: 3 });
    expect(mainPhase(state, p1).slice(0, 2)).toEqual([
      { type: "trade", give: "timber", receive: "grain" },
      { type: "answer_levy", resource: "grain" },
    ]);
  });

  it("upgrades rather than answer when it cannot do both, even for 2 Renown", () => {
    const { state, p1 } = position({ grain: 5, iron: 2 }, { targetRenown: 25 });
    expect(state.ruleset.crownLevy?.renown).toBe(2);
    const moves = mainPhase(state, p1).map((m) => m.type);
    expect(moves).toContain("upgrade_holding");
    expect(moves).not.toContain("answer_levy");
  });
});
