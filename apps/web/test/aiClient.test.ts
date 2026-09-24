import { describe, expect, it } from "vitest";
import { chooseAction, type AiLevel } from "@manors-menaces/ai";
import { RULESET_VERSION, createRng, seedRng, standardRuleset, type CommandIntent, type GameCommand, type GameState } from "@manors-menaces/rules";
import { AiClient, AiRuntime, type AiWorkerLike, type AiWorkerRequest, type AiWorkerResponse } from "../src/lib/game/aiClient.js";
import { decideAi } from "../src/lib/game/aiDecide.js";
import { engineFor } from "../src/lib/game/engine.js";

const engine = engineFor("greenvale");

const currentActorOf = (s: GameState): string | null =>
  s.pending?.kind === "reaction" ? (s.pending.eligiblePlayerIds[0] ?? null) : s.pending?.kind === "prophecy" ? s.pending.playerId : s.activePlayerId;

function newGame(): GameState {
  return engine.createGame({
    matchId: "ai-client",
    seed: "ai-client",
    rulesetVersion: RULESET_VERSION,
    ruleset: standardRuleset(3),
    players: ["P1", "P2", "P3"].map((id) => ({ id, displayName: id })),
  });
}

const apply = (s: GameState, playerId: string, intent: CommandIntent): GameState => {
  const r = engine.applyCommand(s, { ...intent, commandId: `t-${s.revision}`, matchId: s.matchId, playerId } as GameCommand);
  if (!r.newState) throw new Error(`rejected ${intent.type}: ${r.error?.code}`);
  return r.newState;
};

/** A stand-in worker that answers through structured clones, like the real one. */
class FakeWorker extends EventTarget implements AiWorkerLike {
  terminated = false;
  constructor(private readonly answer: (req: AiWorkerRequest) => AiWorkerResponse | "crash" = (m) => ({ id: m.id, ok: true, decision: decideAi(m.req) })) {
    super();
  }
  postMessage(message: AiWorkerRequest): void {
    const copy = structuredClone(message);
    setTimeout(() => {
      const res = this.answer(copy);
      if (res === "crash") this.dispatchEvent(new Event("error"));
      else this.dispatchEvent(new MessageEvent("message", { data: structuredClone(res) }));
    }, 0);
  }
  terminate(): void {
    this.terminated = true;
  }
}

/** Plays `steps` AI decisions through the client and directly, side by side. */
async function compare(client: AiClient, steps: number, level: AiLevel = "normal") {
  let s = newGame();
  let rngState = seedRng("ai-client:ai:0");
  const direct = createRng(rngState);
  for (let i = 0; i < steps; i++) {
    const actor = currentActorOf(s) as string;
    const expected = chooseAction(engine, s, actor, { level, rng: direct });
    const got = await client.choose({ mapId: "greenvale", state: s, playerId: actor, level, rngState });
    expect(got.intent).toEqual(expected);
    expect(got.rngState).toEqual(direct.state);
    rngState = got.rngState;
    s = apply(s, actor, got.intent as CommandIntent);
  }
}

describe("AiClient", () => {
  it("decides in-thread, identically to chooseAction, where workers are unavailable", async () => {
    const client = new AiClient(() => null);
    await compare(client, 30, "easy");
    expect(client.runtime).toBe(AiRuntime.Inline);
  });

  it("gives the same decisions through a worker", async () => {
    const client = new AiClient(() => new FakeWorker());
    await compare(client, 30);
    expect(client.runtime).toBe(AiRuntime.Worker);
  });

  it("falls back to in-thread decisions when the worker breaks", async () => {
    const worker = new FakeWorker(() => "crash");
    const client = new AiClient(() => worker);
    await compare(client, 3);
    expect(worker.terminated).toBe(true);
    expect(client.runtime).toBe(AiRuntime.Inline);
  });

  it("reports an error thrown by the AI instead of hanging", async () => {
    const client = new AiClient(() => new FakeWorker((m) => ({ id: m.id, ok: false, message: "boom" })));
    const s = newGame();
    await expect(client.choose({ mapId: "greenvale", state: s, playerId: currentActorOf(s) as string, level: "normal", rngState: seedRng("x") })).rejects.toThrow("boom");
  });

  it("rejects requests after it is disposed", async () => {
    const client = new AiClient(() => new FakeWorker());
    client.dispose();
    const s = newGame();
    await expect(client.choose({ mapId: "greenvale", state: s, playerId: currentActorOf(s) as string, level: "normal", rngState: seedRng("x") })).rejects.toThrow("disposed");
  });
});
