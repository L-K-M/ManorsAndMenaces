import { describe, expect, it } from "vitest";
import { chooseAction } from "@manors-menaces/ai";
import { EN } from "@manors-menaces/content";
import { RULESET_VERSION, createRng, seedRng, standardRuleset, type GameEvent, type GameState, type PlayerId } from "@manors-menaces/rules";
import { engineFor } from "../src/lib/game/engine.js";
import { QuipDirector, detectQuipCandidates, type QuipCandidate } from "../src/lib/game/quips.js";

// P1 is human; P2 and P3 are rivals.
const engine = engineFor();
const ctx = engine.ctx;
const rivals: Record<PlayerId, string> = { P2: "grum", P3: "madame_quill" };
const isHuman = (pid: PlayerId) => pid === "P1";

function newGame(): GameState {
  return engine.createGame({
    matchId: "quip-test",
    seed: "quip-seed",
    rulesetVersion: RULESET_VERSION,
    ruleset: standardRuleset(3),
    players: ["P1", "P2", "P3"].map((id) => ({ id, displayName: id })),
  });
}

/** Let the AI play every seat until `done` holds, returning each step. */
function playUntil(start: GameState, done: (s: GameState) => boolean): { before: GameState; after: GameState; events: GameEvent[] }[] {
  const rng = createRng(seedRng("quip-ai"));
  const steps = [];
  let s = start;
  for (let i = 0; i < 400 && !done(s); i++) {
    const actor = s.pending?.kind === "reaction" ? s.pending.eligiblePlayerIds[0] : s.activePlayerId;
    const intent = actor && chooseAction(engine, s, actor, { level: "normal", rng });
    if (!actor || !intent) break;
    const r = engine.applyCommand(s, { ...intent, commandId: `c${i}`, matchId: s.matchId, playerId: actor } as never);
    if (!r.accepted || !r.newState) throw new Error(`rejected ${intent.type}`);
    steps.push({ before: s, after: r.newState, events: r.events });
    s = r.newState;
  }
  return steps;
}

const playing = playUntil(newGame(), (s) => s.status === "playing").at(-1)!.after;
const detect = (events: GameEvent[], after: GameState = playing, before: GameState = playing) =>
  detectQuipCandidates({ ctx, before, after, events, rivals, isHuman });
const holdingOf = (s: GameState, pid: PlayerId) => Object.values(s.holdings).find((h) => h.ownerId === pid)!;

describe("detectQuipCandidates", () => {
  it("introduces a rival with certainty at its first Manor", () => {
    const steps = playUntil(newGame(), (s) => Object.values(s.holdings).some((h) => h.ownerId === "P2"));
    const last = steps.at(-1)!;
    const c = detectQuipCandidates({ ctx, ...last, rivals, isHuman });
    expect(c).toEqual([{ playerId: "P2", rivalId: "grum", trigger: "own_build", chance: 1 }]);
  });

  it("keeps later builds occasional", () => {
    const h = holdingOf(playing, "P2");
    const [c] = detect([{ type: "holding_built", playerId: "P2", holdingId: h.id, siteId: h.siteId, free: false }]);
    expect(c?.trigger).toBe("own_build");
    expect(c?.chance).toBeLessThan(1);
  });

  it("notices a human building next to a rival", () => {
    const rivalSite = ctx.board.site(holdingOf(playing, "P3").siteId);
    const near = ctx.board.topology.sites.find((s) => s.id !== rivalSite.id && s.adjacentRegionIds.some((r) => rivalSite.adjacentRegionIds.includes(r)))!;
    const far = ctx.board.topology.sites.find((s) =>
      Object.values(playing.holdings).every((h) => !ctx.board.site(h.siteId).adjacentRegionIds.some((r) => s.adjacentRegionIds.includes(r))),
    )!;
    const built = (siteId: string): GameEvent => ({ type: "holding_built", playerId: "P1", holdingId: "hx", siteId, free: false });
    expect(detect([built(near.id)]).map((c) => [c.playerId, c.trigger])).toContainEqual(["P3", "near_you"]);
    expect(detect([built(far.id)])).toEqual([]);
  });

  it("reacts to a Writ against a human only", () => {
    const writ = (ownerId: PlayerId): GameEvent => ({ type: "banner_displaced", byPlayerId: "P2", ownerId, bannerId: "b1", fromRegionId: "r1", cause: "royal_writ" }) as GameEvent;
    expect(detect([writ("P1")])).toEqual([{ playerId: "P2", rivalId: "grum", trigger: "writ", chance: 1 }]);
    expect(detect([writ("P3")])).toEqual([]);
  });

  it("complains when someone else moves a Menace onto its Banner", () => {
    const banner = Object.values(playing.banners).find((b) => b.ownerId === "P2" && b.regionId)!;
    const moved = (by: PlayerId): GameEvent => ({ type: "menace_moved", byPlayerId: by, menaceId: "m1", from: { kind: "region", regionId: "x" }, to: { kind: "region", regionId: banner.regionId! } });
    expect(detect([moved("P1")]).map((c) => [c.playerId, c.trigger])).toEqual([["P2", "menace_hit"]]);
    expect(detect([moved("P2")])).toEqual([]);
  });

  it("gives every rival a line at the end", () => {
    const won: GameEvent = { type: "game_won", playerId: "P3", renown: 12 };
    const c = detect([won]).map((x) => [x.playerId, x.trigger]);
    expect(c).toEqual([
      ["P2", "lose"],
      ["P3", "win"],
    ]);
  });

  it("announces a rival taking a clear lead, once", () => {
    const bonus = (s: GameState, pid: PlayerId, value: number) =>
      engine.applyDebugCommand(s, { type: "debug_set_bonus_renown", targetPlayerId: pid, value, commandId: "d", matchId: s.matchId, playerId: pid }).newState!;
    const leads = (after: GameState, before: GameState) => detect([], after, before).filter((c) => c.trigger === "lead").map((c) => c.playerId);
    // Everyone starts level; crossing a third of the target alone is news.
    const ahead = bonus(playing, "P2", 4);
    expect(detect([], ahead, playing)).toContainEqual({ playerId: "P2", rivalId: "grum", trigger: "lead", chance: 1 });
    // Extending a lead is not.
    expect(leads(bonus(ahead, "P2", 5), ahead)).toEqual([]);
    // Nor is pulling ahead again after being caught.
    const caught = bonus(ahead, "P3", 4);
    expect(leads(caught, ahead)).toEqual([]);
    expect(leads(bonus(caught, "P2", 5), caught)).toEqual([]);
    // Overtaking from behind is.
    expect(leads(bonus(caught, "P3", 5), ahead)).toEqual(["P3"]);
    // A human in the lead gets no line.
    expect(leads(bonus(playing, "P1", 4), playing)).toEqual([]);
  });
});

describe("QuipDirector", () => {
  const c = (playerId: PlayerId, trigger: QuipCandidate["trigger"], chance = 1): QuipCandidate => ({ playerId, rivalId: rivals[playerId]!, trigger, chance });

  it("is deterministic for the same match and moment", () => {
    const run = () => {
      const d = new QuipDirector("m1");
      return [1, 2, 3, 4, 5].flatMap((rev) => d.choose([c("P2", "own_build", 0.5)], `t${rev}`, rev).map((q) => q.key));
    };
    expect(run()).toEqual(run());
    expect(run().every((k) => k in EN)).toBe(true);
  });

  it("says at most one line per batch, the weightiest", () => {
    const quips = new QuipDirector("m1").choose([c("P3", "own_build"), c("P2", "writ"), c("P3", "near_you")], "t1", 7);
    expect(quips).toHaveLength(1);
    expect(quips[0]).toMatchObject({ playerId: "P2", trigger: "writ" });
    expect(quips[0]!.key).toMatch(/^rival\.grum\.quip\.writ\.\d$/);
  });

  it("lets each rival speak once per turn", () => {
    const d = new QuipDirector("m1");
    expect(d.choose([c("P2", "writ")], "t1", 1)).toHaveLength(1);
    expect(d.choose([c("P2", "lead")], "t1", 2)).toHaveLength(0);
    expect(d.choose([c("P3", "lead")], "t1", 3)).toHaveLength(1);
    expect(d.choose([c("P2", "lead")], "t2", 4)).toHaveLength(1);
  });

  it("lets every rival answer the end of the game", () => {
    const d = new QuipDirector("m1");
    d.choose([c("P2", "writ")], "t9", 1);
    const quips = d.choose([c("P2", "own_build"), c("P2", "win"), c("P3", "lose")], "t9", 2);
    expect(quips.map((q) => q.trigger)).toEqual(["win", "lose"]);
  });

  it("respects the chance of speaking up", () => {
    const d = new QuipDirector("m1");
    const spoken = (chance: number) => Array.from({ length: 200 }, (_, i) => d.choose([c("P2", "own_build", chance)], `turn${chance}-${i}`, i).length).reduce((a, b) => a + b, 0);
    expect(spoken(0)).toBe(0);
    expect(spoken(1)).toBe(200);
    const some = spoken(0.35);
    expect(some).toBeGreaterThan(40);
    expect(some).toBeLessThan(110);
  });

  it("never repeats a line back to back", () => {
    const d = new QuipDirector("m2");
    const keys = Array.from({ length: 60 }, (_, i) => d.choose([c("P2", "menace_hit")], `t${i}`, i)[0]!.key);
    for (let i = 1; i < keys.length; i++) expect(keys[i]).not.toBe(keys[i - 1]);
    expect(new Set(keys).size).toBeGreaterThan(2);
  });
});
