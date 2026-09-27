import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { GREENVALE_MAP as map } from "@manors-menaces/content";
import type { HistoryEntry, SeatConfig } from "@manors-menaces/protocol";
import { RULESET_VERSION, standardRuleset, type GameEvent, type GameState, type PlayerId } from "@manors-menaces/rules";
import { engineFor } from "../src/lib/game/engine.js";
import { EventBus } from "../src/lib/game/eventBus.js";
import { missedPlays, playNoticesFor, type PlayNotice } from "../src/lib/game/plays.js";
import { PrivacyMode } from "../src/lib/game/privacy.js";
import type { PlaySession } from "../src/lib/game/plays.svelte.js";
import type { SessionEvents } from "../src/lib/game/session.svelte.js";

const state: GameState = engineFor(map.id).createGame({
  matchId: "plays-test",
  seed: "plays-test",
  rulesetVersion: RULESET_VERSION,
  ruleset: standardRuleset(3),
  players: [
    { id: "P1", displayName: "Alice" },
    { id: "P2", displayName: "Bertram" },
    { id: "P3", displayName: "Cordelia" },
  ],
});

const played = (playerId: PlayerId, cardId: string): GameEvent => ({ type: "card_played", playerId, cardId });
/** `byPlayerId` plays `counterCardId` and cancels `playerId`'s `cardId`: the engine's two events. */
const countered = (byPlayerId: PlayerId, counterCardId: string, playerId: PlayerId, cardId: string): GameEvent[] => [
  played(byPlayerId, counterCardId),
  { type: "card_cancelled", playerId, cardId, byPlayerId, counterCardId },
];
/** A state in which `asked` must answer `cardId`, which `source` just played. */
const asking = (source: PlayerId, cardId: string, ...asked: PlayerId[]): GameState => ({
  ...state,
  pending: { kind: "reaction", cardId, sourcePlayerId: source, target: { effect: "ragnarok" }, eligiblePlayerIds: asked },
});
const notice = (playerId: PlayerId, cardId: string, counter: { playerId: PlayerId; cardId: string } | null = null): PlayNotice => ({
  playerId,
  cardId,
  countered: counter,
});

describe("playNoticesFor", () => {
  it("leaves out the viewer's own plays and keeps the others in order", () => {
    const events = [played("P2", "festival_at_the_inn#1"), played("P1", "druids_blessing#1"), played("P3", "knight_errant#1")];

    expect(playNoticesFor(events, state, "P1")).toEqual([notice("P2", "festival_at_the_inn#1"), notice("P3", "knight_errant#1")]);
  });

  it("shows nothing without a viewer (a neutral screen, an all-computer game)", () => {
    expect(playNoticesFor([played("P2", "festival_at_the_inn#1")], state, null)).toEqual([]);
  });

  it("tells a Counterspell and the Spell it cancelled as one notice", () => {
    const events = countered("P3", "counterspell#1", "P2", "fire_bolt#1");

    expect(playNoticesFor(events, state, "P1")).toEqual([notice("P3", "counterspell#1", { playerId: "P2", cardId: "fire_bolt#1" })]);
    // The caster of the countered Spell reads it too.
    expect(playNoticesFor(events, state, "P2")).toEqual([notice("P3", "counterspell#1", { playerId: "P2", cardId: "fire_bolt#1" })]);
    // The player who countered it does not.
    expect(playNoticesFor(events, state, "P3")).toEqual([]);
  });

  it("leaves the Spell the viewer is asked to answer to the reaction dialog", () => {
    const events = [played("P2", "fire_bolt#1")];
    const pending = asking("P2", "fire_bolt#1", "P1", "P3");

    expect(playNoticesFor(events, pending, "P1")).toEqual([]);
    // Someone not asked yet reads it now; it has not taken effect.
    expect(playNoticesFor(events, pending, "P3")).toEqual([notice("P2", "fire_bolt#1")]);
  });
});

describe("missedPlays", () => {
  const entries: HistoryEntry[] = [
    { revision: 10, events: [played("P2", "festival_at_the_inn#1")] },
    { revision: 11, events: [played("P1", "druids_blessing#1")] },
    { revision: 12, events: countered("P3", "counterspell#1", "P2", "fire_bolt#1") },
    { revision: 13, events: [played("P3", "knight_errant#1")] },
  ];

  it("lists the others' cards played since the device last showed the match, oldest first", () => {
    expect(missedPlays(entries, 10, state, "P1")).toEqual([
      notice("P3", "counterspell#1", { playerId: "P2", cardId: "fire_bolt#1" }),
      notice("P3", "knight_errant#1"),
    ]);
  });

  it("lists nothing on a first visit, when the Chronicle marks nothing new either", () => {
    expect(missedPlays(entries, null, state, "P1")).toEqual([]);
  });

  it("leaves out a Spell the viewer must answer now", () => {
    const waiting: HistoryEntry[] = [...entries, { revision: 14, events: [played("P2", "the_plague#1")] }];

    expect(missedPlays(waiting, 12, asking("P2", "the_plague#1", "P1"), "P1")).toEqual([notice("P3", "knight_errant#1")]);
  });
});

// ------------------------------------------------------------------ the queue

type Queue = typeof import("../src/lib/game/plays.svelte.js");
let PlayQueue: Queue["PlayQueue"];
let settings: (typeof import("../src/lib/stores/settings.svelte.js"))["settings"];
/** The pause as the settings store loads it, with nothing saved, before any test sets it. */
let pauseAsLoaded: boolean;

beforeAll(async () => {
  // plays.svelte.ts is a runes module: outside the Svelte compiler `$state`
  // is an ordinary global call, so the identity stands in for it.
  const identity = <T>(value: T) => value;
  vi.stubGlobal("$state", Object.assign(identity, { raw: identity }));
  ({ PlayQueue } = await import("../src/lib/game/plays.svelte.js"));
  ({ settings } = await import("../src/lib/stores/settings.svelte.js"));
  pauseAsLoaded = settings.pauseOnCardPlay;
});

beforeEach(() => {
  settings.pauseOnCardPlay = true;
});

const seat = (playerId: PlayerId, kind: "human" | "ai"): SeatConfig => ({ playerId, displayName: playerId, kind, color: 0 });

class FakeSession implements PlaySession {
  readonly events = new EventBus<SessionEvents>();
  viewerId: PlayerId | null = null;
  curtainFor: PlayerId | null = null;
  missedPlays: PlayNotice[] = [];
  resumed = 0;
  holds: (() => boolean)[] = [];
  mode = PrivacyMode.Shared;
  readonly transport: { kind: "local" | "online" };
  readonly onlinePlayerId: PlayerId | null;
  readonly seats: SeatConfig[];

  constructor(opts: { seats: SeatConfig[]; online?: PlayerId }) {
    this.seats = opts.seats;
    this.transport = { kind: opts.online ? "online" : "local" };
    this.onlinePlayerId = opts.online ?? null;
    this.viewerId = opts.online ?? null;
  }

  privacyMode(): PrivacyMode {
    return this.mode;
  }
  holdAi(held: () => boolean): () => void {
    this.holds.push(held);
    return () => (this.holds = this.holds.filter((h) => h !== held));
  }
  resumeAi(): void {
    this.resumed += 1;
  }
  get aiHeld(): boolean {
    return this.holds.some((held) => held());
  }

  /** Publishes a committed batch and lets the queue take it in. */
  async publish(events: GameEvent[], after: GameState = state, own = false): Promise<void> {
    this.events.emit({ events, state: after, provisional: false, own });
    await Promise.resolve();
  }
}

describe("PlayQueue", () => {
  it("holds a computer player until the one human has read its card", async () => {
    const session = new FakeSession({ seats: [seat("P1", "human"), seat("P2", "ai")] });
    session.viewerId = "P1";
    const queue = new PlayQueue(session);

    await session.publish([played("P2", "festival_at_the_inn#1")]);

    expect(queue.current).toEqual(notice("P2", "festival_at_the_inn#1"));
    expect(session.aiHeld).toBe(true);
    queue.acknowledge();
    expect(queue.current).toBeNull();
    expect(session.aiHeld).toBe(false);
    expect(session.resumed).toBe(1);
    queue.destroy();
    expect(session.holds).toEqual([]);
  });

  it("never asks the player who played the card", async () => {
    const session = new FakeSession({ seats: [seat("P1", "human"), seat("P2", "ai")] });
    session.viewerId = "P1";
    const queue = new PlayQueue(session);

    await session.publish([played("P1", "festival_at_the_inn#1")], state, true);

    expect(queue.current).toBeNull();
    expect(session.aiHeld).toBe(false);
  });

  it("ignores provisional batches and shows nothing in an all-computer game", async () => {
    const session = new FakeSession({ seats: [seat("P1", "ai"), seat("P2", "ai")] });
    const queue = new PlayQueue(session);

    session.events.emit({ events: [played("P2", "festival_at_the_inn#1")], state, provisional: true, own: false });
    await session.publish([played("P1", "festival_at_the_inn#2")]);

    expect(queue.current).toBeNull();
    expect(session.aiHeld).toBe(false);
  });

  it("lets each hot-seat human read what others played since they last held the device", async () => {
    const session = new FakeSession({ seats: [seat("P1", "human"), seat("P2", "human"), seat("P3", "ai")] });
    session.mode = PrivacyMode.HotSeat;
    const queue = new PlayQueue(session);

    // Alice plays a card on her turn: only Bertram has it to read.
    session.viewerId = "P1";
    await session.publish([played("P1", "druids_blessing#1")], state, true);
    expect(queue.current).toBeNull();

    // The computer's turn shows a neutral screen: nobody reads, nothing waits.
    session.viewerId = null;
    await session.publish([played("P3", "knight_errant#1")]);
    expect(queue.current).toBeNull();
    expect(session.aiHeld).toBe(false);

    // Behind the curtain nothing shows either, though Bertram's cards wait.
    session.viewerId = "P2";
    session.curtainFor = "P2";
    expect(queue.current).toBeNull();

    // Bertram reveals: both cards, one at a time.
    session.curtainFor = null;
    expect(queue.current).toEqual(notice("P1", "druids_blessing#1"));
    expect([queue.position, queue.total]).toEqual([1, 2]);
    queue.acknowledge();
    expect(queue.current).toEqual(notice("P3", "knight_errant#1"));
    expect([queue.position, queue.total]).toEqual([2, 2]);
    queue.acknowledge();
    expect(queue.current).toBeNull();

    // Alice still has the computer's card to read when she comes back.
    session.viewerId = "P1";
    expect(queue.current).toEqual(notice("P3", "knight_errant#1"));
    expect([queue.position, queue.total]).toEqual([1, 1]);
  });

  it("with the curtain off, only whoever is viewing reads the card", async () => {
    const session = new FakeSession({ seats: [seat("P1", "human"), seat("P2", "human"), seat("P3", "ai")] });
    session.viewerId = "P1";
    const queue = new PlayQueue(session);

    await session.publish([played("P3", "knight_errant#1")]);
    queue.acknowledge();
    session.viewerId = "P2";

    expect(queue.current).toBeNull();
  });

  it("drops a Spell once the viewer is asked to answer it", async () => {
    const session = new FakeSession({ seats: [seat("P1", "human"), seat("P2", "ai"), seat("P3", "ai")] });
    session.viewerId = "P1";
    const queue = new PlayQueue(session);

    // Cordelia is asked first, so Alice reads the Spell now...
    await session.publish([played("P2", "fire_bolt#1")], asking("P2", "fire_bolt#1", "P3", "P1"));
    expect(queue.current).toEqual(notice("P2", "fire_bolt#1"));
    // ...until Cordelia passes and the Counterspell dialog shows it to Alice.
    await session.publish([{ type: "reaction_passed", playerId: "P3" }], asking("P2", "fire_bolt#1", "P1"));
    expect(queue.current).toBeNull();
  });

  it("online, shows the cards missed while away one by one, then those arriving", async () => {
    const session = new FakeSession({ seats: [seat("P1", "human"), seat("P2", "human")], online: "P1" });
    session.missedPlays = [notice("P2", "festival_at_the_inn#1"), notice("P2", "knight_errant#1")];
    const queue = new PlayQueue(session);

    expect(queue.current).toEqual(notice("P2", "festival_at_the_inn#1"));
    expect([queue.position, queue.total]).toEqual([1, 2]);
    queue.acknowledge();
    await session.publish([played("P2", "druids_blessing#1")]);
    expect(queue.current).toEqual(notice("P2", "knight_errant#1"));
    expect([queue.position, queue.total]).toEqual([2, 3]);
    queue.acknowledge();
    queue.acknowledge();
    expect(queue.current).toBeNull();

    // A new run counts from one again.
    await session.publish([played("P2", "fire_bolt#1")]);
    expect([queue.position, queue.total]).toEqual([1, 1]);
  });

  it("pauses by default", () => {
    expect(pauseAsLoaded).toBe(true);
  });

  it("with the pause switched off, shows nothing and never holds a computer player", async () => {
    settings.pauseOnCardPlay = false;
    const session = new FakeSession({ seats: [seat("P1", "human"), seat("P2", "ai")] });
    session.viewerId = "P1";
    const queue = new PlayQueue(session);

    await session.publish([played("P2", "festival_at_the_inn#1")]);

    expect(queue.current).toBeNull();
    expect(session.aiHeld).toBe(false);
    // Nothing piled up meanwhile to show once it is on again.
    settings.pauseOnCardPlay = true;
    expect(queue.current).toBeNull();
  });

  it("switching the pause off while a card waits lets the computer go on", async () => {
    const session = new FakeSession({ seats: [seat("P1", "human"), seat("P2", "ai")] });
    session.viewerId = "P1";
    const queue = new PlayQueue(session);
    await session.publish([played("P2", "festival_at_the_inn#1"), played("P2", "knight_errant#1")]);
    expect(session.aiHeld).toBe(true);

    settings.pauseOnCardPlay = false;
    expect(session.aiHeld).toBe(false);
    queue.release();

    expect(session.resumed).toBe(1);
    settings.pauseOnCardPlay = true;
    expect(queue.current).toBeNull();
  });

  it("online, skips the cards missed while away when the pause is off", () => {
    settings.pauseOnCardPlay = false;
    const session = new FakeSession({ seats: [seat("P1", "human"), seat("P2", "human")], online: "P1" });
    session.missedPlays = [notice("P2", "festival_at_the_inn#1")];
    const queue = new PlayQueue(session);

    settings.pauseOnCardPlay = true;
    expect(queue.current).toBeNull();
  });
});
