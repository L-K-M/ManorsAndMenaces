import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runAiUntilHuman } from "@manors-menaces/ai";
import { isWellFormedCommand, type CreateMatchRequest } from "@manors-menaces/protocol";
import { RULESET_VERSION, clone, createRng, seedRng, standardRuleset } from "@manors-menaces/rules";
import { Store, type UserRow } from "../src/store.js";
import { HttpError, MatchService } from "../src/service.js";
import { engineFor } from "./engines.js";

// The Renown needed to win is chosen when a match is created (spec §7). The
// server checks it against the goals the rules offer and stores it in the
// match's ruleset, so every player plays to the same goal.

let store: Store;
let service: MatchService;
let alice: UserRow;
let bob: UserRow;
beforeEach(() => {
  store = new Store();
  service = new MatchService(store);
  alice = service.authenticate(service.createGuest("Alice").token);
  bob = service.authenticate(service.createGuest("Bob").token);
});
afterEach(() => {
  service.shutdown();
  store.db.close();
});

function create(req: Record<string, unknown>) {
  return service.createMatch(alice, { displayName: "Alice", seatCount: 2, rulesetName: "standard", ...req } as CreateMatchRequest);
}

function refusal(req: Record<string, unknown>): HttpError | undefined {
  try {
    create(req);
  } catch (e) {
    if (e instanceof HttpError) return e;
    throw e;
  }
  return undefined;
}

describe("creating a match with a Renown goal", () => {
  it("stores the chosen goal and plays to it for the player who joins", () => {
    const { matchId, inviteCode } = create({ rulesetName: "async", targetRenown: 25 });
    expect(service.view(matchId, alice).ruleset.targetRenown).toBe(25);
    service.joinMatch(bob, inviteCode, "Bob");
    const view = service.view(matchId, bob);
    expect(view.status).toBe("playing");
    expect(view.ruleset.targetRenown).toBe(25);
    expect(view.state?.ruleset.targetRenown).toBe(25);
    expect(view.ruleset.enableReactionCards).toBe(false);
  });

  it.each([
    ["standard", 2, 15],
    ["standard", 3, 15],
    ["standard", 4, 13],
    ["async", 4, 13],
    ["mvp", 4, 10],
  ] as const)("uses the %s default with %i seats when none is chosen", (rulesetName, seatCount, target) => {
    const { matchId } = create({ rulesetName, seatCount });
    expect(service.view(matchId, alice).ruleset.targetRenown).toBe(target);
  });

  it.each([
    ["standard", 2, 30],
    ["standard", 4, 13],
    ["mvp", 3, 10],
    ["mvp", 2, 25],
  ] as const)("accepts a %s goal offered with %i seats: %i", (rulesetName, seatCount, targetRenown) => {
    const { matchId } = create({ rulesetName, seatCount, targetRenown });
    expect(service.view(matchId, alice).ruleset.targetRenown).toBe(targetRenown);
  });

  it.each([
    ["standard", 2, 10],
    ["standard", 3, 13],
    ["standard", 4, 18],
    ["async", 2, 17],
    ["mvp", 2, 12],
    ["standard", 2, 35],
    ["standard", 2, 20.5],
    ["standard", 2, -20],
    ["standard", 2, "20"],
    ["standard", 2, true],
    ["standard", 2, { value: 20 }],
    ["standard", 2, [20]],
  ] as const)("refuses a %s goal with %i seats of %j", (rulesetName, seatCount, targetRenown) => {
    const before = service.listMatches(alice).length;
    const error = refusal({ rulesetName, seatCount, targetRenown });
    expect(error?.status).toBe(400);
    expect(error?.message).toMatch(/targetRenown/);
    expect(service.listMatches(alice)).toHaveLength(before);
  });
});

describe("the Crown's Levy online (§27.3)", () => {
  it.each([
    ["standard", 15, 1],
    ["standard", 20, 1],
    ["async", 25, 2],
    ["standard", 30, 2],
  ] as const)("runs in a %s match to %i Renown, paying %i Renown", (rulesetName, targetRenown, renown) => {
    const { matchId } = create({ rulesetName, targetRenown });
    expect(service.view(matchId, alice).ruleset.crownLevy).toEqual({ price: 5, renown, proclaimByRound: 15 });
  });

  it("is not part of the Core rules", () => {
    const { matchId } = create({ rulesetName: "mvp" });
    expect(service.view(matchId, alice).ruleset.crownLevy).toBeUndefined();
  });

  it("accepts an answer from the player whose turn it is", () => {
    const { matchId, inviteCode } = create({});
    service.joinMatch(bob, inviteCode, "Bob");
    const match = store.match(matchId);
    if (!match?.state) throw new Error("match not started");
    // The AI plays the setup; then this round's Levy names Grain.
    const engine = engineFor(match.map_id);
    const rng = createRng(seedRng("levy-online"));
    let s = match.state;
    while (s.status === "setup") s = runAiUntilHuman(engine, s, () => true, () => ({ level: "normal", rng }), 1).state;
    s = clone(s);
    s.crownLevy = { current: "grain", next: "stone", called: ["grain", "stone"], answeredBy: [] };
    const active = s.players[s.activePlayerId];
    if (!active) throw new Error("no active player");
    active.resources.grain = 5;
    store.startMatch(matchId, s);

    const user = service.memberPlayerId(matchId, alice.id) === s.activePlayerId ? alice : bob;
    const command = { type: "answer_levy" as const, resource: "grain" as const, commandId: "levy-1", matchId, playerId: s.activePlayerId };
    expect(isWellFormedCommand(command)).toBe(true);
    const r = service.submit(user, { matchId, expectedRevision: s.revision, commands: [command] });
    expect(r.error).toBeUndefined();
    expect(r.accepted).toBe(true);
    expect(r.events).toContainEqual({ type: "levy_answered", playerId: s.activePlayerId, resource: "grain", amount: 5, renown: 1 });
    expect(r.state?.players[s.activePlayerId]?.levyRenown).toBe(1);
  });
});

describe("matches created before the goal changed", () => {
  it("start with the goal saved in their lobby", () => {
    // A lobby created when the 2-player Standard goal was 20.
    store.createMatch({ id: "old", ruleset: { ...standardRuleset(2), targetRenown: 20 }, rulesVersion: RULESET_VERSION, mapId: "greenvale", seed: "old-goal", inviteCode: "OLDGOAL" });
    for (let seat = 0; seat < 2; seat++) {
      store.addSeat({ match_id: "old", seat, player_id: `P${seat + 1}`, user_id: seat === 0 ? alice.id : null, display_name: seat === 0 ? "Alice" : "Open seat", kind: "human", ai_level: null });
    }
    service.joinMatch(bob, "OLDGOAL", "Bob");
    const view = service.view("old", bob);
    expect(view.status).toBe("playing");
    expect(view.state?.ruleset.targetRenown).toBe(20);
  });
});
