// Spells in online matches (spec §59, §105): the client only ever holds a
// redacted view and computes legal actions and card targets from it, then
// submits commands to the authoritative server. These tests drive that path
// over real HTTP with two seats whose hands are hidden from each other.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { AddressInfo } from "node:net";
import type { GuestSessionResponse, MatchView, SubmitCommandsResponse } from "@manors-menaces/protocol";
import {
  createRng,
  createRulesEngine,
  enumerateCardTargets,
  getLegalActions,
  HIDDEN_CARD,
  seedRng,
  type CardTarget,
  type CommandIntent,
  type GameCommand,
  type GameState,
  type PlayerId,
} from "@manors-menaces/rules";
import { chooseAction } from "@manors-menaces/ai";
import { rulesContentFor } from "@manors-menaces/content";
import { createApp } from "../src/app.js";

const engine = createRulesEngine(rulesContentFor());
const ARCANE_TARGET: CardTarget = { effect: "arcane_exchange", give: "essence", receive: "iron" };

let app: ReturnType<typeof createApp>;
let base = "";

beforeEach(async () => {
  app = createApp({ dbPath: ":memory:", webDist: null, aiDelayMs: 5, rateLimitPerSecond: 10_000 });
  await new Promise<void>((r) => app.server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
});
afterEach(async () => {
  await app.close();
});

async function api<T>(path: string, token: string | null, body?: unknown): Promise<{ status: number; data: T }> {
  const res = await fetch(base + path, {
    method: body === undefined ? "GET" : "POST",
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: res.status, data: (await res.json()) as T };
}

async function guest(name: string): Promise<string> {
  return (await api<GuestSessionResponse>("/api/guest", null, { displayName: name })).data.token;
}

let seq = 0;
function command(state: GameState, playerId: PlayerId, intent: CommandIntent): GameCommand {
  return { ...intent, commandId: `spell-${++seq}`, matchId: state.matchId, playerId } as GameCommand;
}

async function view(matchId: string, token: string): Promise<{ me: PlayerId; state: GameState }> {
  const v = (await api<MatchView>(`/api/matches/${matchId}`, token)).data;
  return { me: v.youAre as PlayerId, state: v.state as GameState };
}

function actorOf(s: GameState): PlayerId {
  if (s.pending?.kind === "reaction") return s.pending.eligiblePlayerIds[0] as PlayerId;
  if (s.pending?.kind === "prophecy") return s.pending.playerId;
  return s.activePlayerId;
}

/**
 * Starts a standard 2-seat match and plays setup through the API. Returns
 * the tokens by player id, with the first player in their Main phase.
 */
async function matchInMainPhase(opts: { ai?: boolean } = {}) {
  const alice = await guest("Alice");
  const created = await api<{ matchId: string; inviteCode: string }>("/api/matches", alice, {
    displayName: "Alice",
    seatCount: 2,
    rulesetName: "standard",
    ...(opts.ai ? { aiSeats: [{ displayName: "Robo", level: "easy" }] } : {}),
  });
  const matchId = created.data.matchId;
  const tokens: Record<PlayerId, string> = { [(await view(matchId, alice)).me]: alice };
  if (!opts.ai) {
    const bob = await guest("Bob");
    await api("/api/matches/join", bob, { inviteCode: created.data.inviteCode, displayName: "Bob" });
    tokens[(await view(matchId, bob)).me] = bob;
  }

  const rng = createRng(seedRng("online-spells"));
  for (let step = 0; step < 200; step++) {
    const { state } = await view(matchId, alice);
    if (state.status === "playing" && state.phase === "main" && !state.pending && tokens[state.activePlayerId]) return { matchId, tokens };
    const actor = actorOf(state);
    const token = tokens[actor];
    if (!token) {
      await new Promise((r) => setTimeout(r, 20)); // the AI seat is acting
      continue;
    }
    const mine = (await view(matchId, token)).state;
    const intent = chooseAction(engine, mine, actor, { level: "easy", rng }) as CommandIntent;
    const res = await api<SubmitCommandsResponse>(`/api/matches/${matchId}/commands`, token, {
      matchId,
      expectedRevision: mine.revision,
      commands: [command(mine, actor, intent)],
    });
    expect(res.data.accepted, JSON.stringify(res.data.error)).toBe(true);
  }
  throw new Error("setup did not reach a human Main phase");
}

/** Test-only shortcut: deal cards and resources on the authoritative state. */
function stage(matchId: string, deal: { playerId: PlayerId; cardDefId: string }[], essenceFor: PlayerId): void {
  const row = app.store.match(matchId);
  if (!row?.state) throw new Error("no state");
  let s = row.state;
  const debug = (c: Record<string, unknown>) => {
    const r = engine.applyDebugCommand(s, { commandId: "stage", matchId, playerId: essenceFor, ...c } as never);
    if (!r.newState) throw new Error(r.error?.code);
    s = r.newState;
  };
  for (const d of deal) debug({ type: "debug_draw_card", targetPlayerId: d.playerId, cardDefId: d.cardDefId });
  debug({ type: "debug_grant", targetPlayerId: essenceFor, resources: { essence: 2 } });
  expect(app.store.commitBatch(matchId, row.revision, s, [])).toBe(true);
}

/**
 * Offers the Spell from legal actions and target enumeration on the redacted
 * view, checks the engine also accepts it there, then submits it. (The web
 * client itself sends locking commands such as play_card straight to the
 * server; the local apply here proves the rules work on a redacted view.)
 */
async function playSpellLikeTheClient(matchId: string, token: string, cardDefId = "arcane_exchange", target: CardTarget = ARCANE_TARGET) {
  const { me, state } = await view(matchId, token);
  const opponent = state.turnOrder.find((p) => p !== me) as PlayerId;
  expect(state.players[opponent]?.hand.length).toBeGreaterThan(0);
  expect(state.players[opponent]?.hand.every((c) => c === HIDDEN_CARD)).toBe(true);

  const spell = state.players[me]?.hand.find((c) => c.startsWith(`${cardDefId}#`)) as string;
  expect(getLegalActions(engine.ctx, state, me).playableCards).toContain(spell);
  expect(enumerateCardTargets(engine.ctx, state, me, spell)).toContainEqual(target);
  const cmd = command(state, me, { type: "play_card", cardId: spell, target });
  const local = engine.applyCommand(state, cmd);
  expect(local.error).toBeUndefined();

  const res = await api<SubmitCommandsResponse>(`/api/matches/${matchId}/commands`, token, { matchId, expectedRevision: state.revision, commands: [cmd] });
  expect(res.status).toBe(200);
  expect(res.data.accepted, JSON.stringify(res.data.error)).toBe(true);
  return { me, opponent, spell, before: state, after: res.data.state as GameState, events: res.data.events };
}

describe("online Spells", () => {
  it("resolve when the opponent's hidden card is not a reaction", async () => {
    const { matchId, tokens } = await matchInMainPhase();
    const first = (await view(matchId, Object.values(tokens)[0] as string)).state.activePlayerId;
    const other = Object.keys(tokens).find((p) => p !== first) as PlayerId;
    stage(
      matchId,
      [
        { playerId: first, cardDefId: "arcane_exchange" },
        { playerId: other, cardDefId: "knight_errant" },
      ],
      first,
    );

    const { me, before, after, events } = await playSpellLikeTheClient(matchId, tokens[first] as string);
    expect(events.map((e) => e.type)).toContain("card_resolved");
    expect(after.players[me]?.resources.iron).toBe((before.players[me]?.resources.iron ?? 0) + 1);
    expect(after.players[me]?.hand).toEqual([]);
  });

  it("open a reaction window when the opponent secretly holds a Counterspell", async () => {
    const { matchId, tokens } = await matchInMainPhase();
    const first = (await view(matchId, Object.values(tokens)[0] as string)).state.activePlayerId;
    const other = Object.keys(tokens).find((p) => p !== first) as PlayerId;
    stage(
      matchId,
      [
        { playerId: first, cardDefId: "arcane_exchange" },
        { playerId: other, cardDefId: "counterspell" },
      ],
      first,
    );

    const { after } = await playSpellLikeTheClient(matchId, tokens[first] as string);
    expect(after.pending?.kind).toBe("reaction");

    // The opponent sees their own Counterspell and can decline to use it.
    const opp = await view(matchId, tokens[other] as string);
    const legal = getLegalActions(engine.ctx, opp.state, other);
    expect(legal.mode).toBe("reaction");
    expect(legal.reactionCards).toHaveLength(1);
    const pass = command(opp.state, other, { type: "pass_reaction" });
    const res = await api<SubmitCommandsResponse>(`/api/matches/${matchId}/commands`, tokens[other] as string, {
      matchId,
      expectedRevision: opp.state.revision,
      commands: [pass],
    });
    expect(res.data.accepted, JSON.stringify(res.data.error)).toBe(true);
    expect(res.data.events.map((e) => e.type)).toContain("card_resolved");
  });

  it("let the caster reorder the deck with Very Minor Prophecy", async () => {
    const { matchId, tokens } = await matchInMainPhase();
    const first = (await view(matchId, Object.values(tokens)[0] as string)).state.activePlayerId;
    const other = Object.keys(tokens).find((p) => p !== first) as PlayerId;
    stage(
      matchId,
      [
        { playerId: first, cardDefId: "very_minor_prophecy" },
        { playerId: other, cardDefId: "knight_errant" },
      ],
      first,
    );

    const token = tokens[first] as string;
    const { after } = await playSpellLikeTheClient(matchId, token, "very_minor_prophecy", { effect: "very_minor_prophecy" });
    const pending = after.pending;
    if (pending?.kind !== "prophecy") throw new Error("expected a Prophecy decision");
    expect(pending.cardIds.every((c) => c !== HIDDEN_CARD)).toBe(true);

    // Only the server knows the deck, so the client submits the order without
    // validating it against its redacted view.
    const order = [...pending.cardIds].reverse();
    const res = await api<SubmitCommandsResponse>(`/api/matches/${matchId}/commands`, token, {
      matchId,
      expectedRevision: after.revision,
      commands: [command(after, first, { type: "resolve_prophecy", order })],
    });
    expect(res.data.accepted, JSON.stringify(res.data.error)).toBe(true);
    expect(app.store.match(matchId)?.state?.cardDeck.slice(0, order.length)).toEqual(order);
  });

  it("let a human cast at an AI seat that holds a card", async () => {
    const { matchId, tokens } = await matchInMainPhase({ ai: true });
    const [human] = Object.keys(tokens) as [PlayerId];
    const { state } = await view(matchId, tokens[human] as string);
    const aiSeat = state.turnOrder.find((p) => p !== human) as PlayerId;
    stage(
      matchId,
      [
        { playerId: human, cardDefId: "arcane_exchange" },
        { playerId: aiSeat, cardDefId: "counterspell" },
      ],
      human,
    );

    await playSpellLikeTheClient(matchId, tokens[human] as string);
    // The AI answers the reaction window on its own; the turn returns to the caster.
    for (let i = 0; i < 100; i++) {
      const s = (await view(matchId, tokens[human] as string)).state;
      if (!s.pending) {
        expect(s.activePlayerId).toBe(human);
        expect(s.discardPile.some((c) => c.startsWith("arcane_exchange#"))).toBe(true);
        return;
      }
      await new Promise((r) => setTimeout(r, 20));
    }
    throw new Error("the AI never answered the reaction window");
  });
});

describe("malformed card targets online", () => {
  it("are rejected with a rule error, not a server error", async () => {
    const { matchId, tokens } = await matchInMainPhase();
    const first = (await view(matchId, Object.values(tokens)[0] as string)).state.activePlayerId;
    const other = Object.keys(tokens).find((p) => p !== first) as PlayerId;
    stage(
      matchId,
      [
        { playerId: first, cardDefId: "knight_errant" },
        { playerId: other, cardDefId: "arcane_exchange" },
      ],
      first,
    );
    const token = tokens[first] as string;
    const { state } = await view(matchId, token);
    const knight = state.players[first]?.hand[0] as string;
    const menaceId = Object.keys(state.menaces)[0] as string;
    // A legal target whose destination fields hide under an own "__proto__" key.
    const legal = enumerateCardTargets(engine.ctx, state, first, knight)[0] as { destination: Record<string, unknown> };
    const { kind, ...fields } = legal.destination;
    const protoDestination = JSON.parse(`{"kind":${JSON.stringify(kind)},"__proto__":${JSON.stringify(fields)}}`);

    const targets: unknown[] = [
      { ...legal, destination: protoDestination },
      { effect: "knight_errant", menaceId },
      { effect: "knight_errant", menaceId, destination: null },
      { effect: "knight_errant", menaceId, destination: { kind: "region" } },
      { effect: "knight_errant", menaceId, destination: { kind: "bogus" } },
      null,
      "knight_errant",
    ];
    for (const target of targets) {
      const cmd = { ...command(state, first, { type: "play_card", cardId: knight, target: target as CardTarget }) };
      const res = await api<SubmitCommandsResponse>(`/api/matches/${matchId}/commands`, token, { matchId, expectedRevision: state.revision, commands: [cmd] });
      expect(res.status, JSON.stringify(target)).toBe(200);
      expect(res.data.accepted).toBe(false);
      expect(res.data.error?.code).toMatch(/^(ILLEGAL_MENACE_TARGET|INVALID_CARD_TARGET)$/);
    }
    expect((await view(matchId, token)).state.revision).toBe(state.revision);
  });
});
