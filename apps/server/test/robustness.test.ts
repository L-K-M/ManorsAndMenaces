// Online server robustness: restart recovery, abuse limits, heartbeats and
// clean error responses.

import { afterEach, describe, expect, it } from "vitest";
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { createServer as createTcpServer, type AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import WebSocket from "ws";
import type { GuestSessionResponse, MatchView, SubmitCommandsResponse } from "@manors-menaces/protocol";
import { chooseAction } from "@manors-menaces/ai";
import { GREENVALE_MAP, rulesContentFor } from "@manors-menaces/content";
import { createRng, createRulesEngine, getLegalActions, seedRng, type CommandIntent, type GameCommand, type GameState } from "@manors-menaces/rules";
import { createApp, type AppOptions } from "../src/app.js";

const engine = createRulesEngine(rulesContentFor());
const opened: ReturnType<typeof createApp>[] = [];

async function start(opts: AppOptions = {}): Promise<{ app: ReturnType<typeof createApp>; base: string }> {
  const app = createApp({ dbPath: ":memory:", webDist: null, aiDelayMs: 5, rateLimitPerSecond: 10_000, ...opts });
  opened.push(app);
  await new Promise<void>((r) => app.server.listen(0, "127.0.0.1", r));
  return { app, base: `http://127.0.0.1:${(app.server.address() as AddressInfo).port}` };
}

async function stop(app: ReturnType<typeof createApp>): Promise<void> {
  opened.splice(opened.indexOf(app), 1);
  await app.close();
}

afterEach(async () => {
  for (const app of opened.splice(0)) await app.close();
});

interface Reply<T> {
  status: number;
  data: T;
}

async function api<T>(base: string, path: string, token: string | null, body?: unknown, headers: Record<string, string> = {}): Promise<Reply<T>> {
  const res = await fetch(base + path, {
    method: body === undefined ? "GET" : "POST",
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: res.status, data: (await res.json()) as T };
}

async function guest(base: string, name: string): Promise<GuestSessionResponse> {
  return (await api<GuestSessionResponse>(base, "/api/guest", null, { displayName: name })).data;
}

function actorOf(s: GameState): string {
  if (s.pending?.kind === "reaction") return s.pending.eligiblePlayerIds[0] as string;
  if (s.pending?.kind === "prophecy") return s.pending.playerId;
  return s.activePlayerId;
}

let seq = 0;
function command(state: GameState, playerId: string, intent: CommandIntent, commandId = `r-${++seq}`): GameCommand {
  return { ...intent, commandId, matchId: state.matchId, playerId } as GameCommand;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function until(check: () => Promise<boolean>, timeoutMs: number): Promise<boolean> {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    if (await check()) return true;
    await sleep(25);
  }
  return false;
}

function openSocket(base: string, token: string, opts: WebSocket.ClientOptions = {}): Promise<WebSocket> {
  const ws = new WebSocket(`${base.replace("http", "ws")}/api/ws?token=${token}`, opts);
  return new Promise((resolve, reject) => {
    ws.once("open", () => resolve(ws));
    ws.once("error", reject);
  });
}

const closeCode = (ws: WebSocket): Promise<number> => new Promise((r) => ws.once("close", (code) => r(code)));

/** Plays the human's setup moves until the match's AI seat is the one to act. */
async function playUntilAiTurn(base: string, token: string, matchId: string): Promise<void> {
  const rng = createRng(seedRng("restart"));
  for (let i = 0; i < 10; i++) {
    const v = (await api<MatchView>(base, `/api/matches/${matchId}`, token)).data;
    const s = v.state as GameState;
    if (actorOf(s) !== v.youAre) return;
    const intent = chooseAction(engine, s, v.youAre, { level: "easy", rng }) as CommandIntent;
    const res = await api<SubmitCommandsResponse>(base, `/api/matches/${matchId}/commands`, token, {
      matchId,
      expectedRevision: s.revision,
      commands: [command(s, v.youAre, intent)],
    });
    expect(res.data.accepted).toBe(true);
  }
}

describe("AI seats after a restart", () => {
  it("resumes an AI seat that was due to move when the server stopped", async () => {
    const dbPath = join(mkdtempSync(join(tmpdir(), "mm-restart-")), "manors.sqlite");
    // An AI delay that never elapses stands in for a deploy landing mid-turn.
    const first = await start({ dbPath, aiDelayMs: 1e9 });
    const alice = await guest(first.base, "Alice");
    const created = await api<{ matchId: string }>(first.base, "/api/matches", alice.token, {
      displayName: "Alice",
      seatCount: 2,
      rulesetName: "standard",
      aiSeats: [{ displayName: "Robo", level: "easy" }],
    });
    const matchId = created.data.matchId;
    const view = async (base: string) => (await api<MatchView>(base, `/api/matches/${matchId}`, alice.token)).data;
    await playUntilAiTurn(first.base, alice.token, matchId);
    const before = await view(first.base);
    expect(actorOf(before.state as GameState)).not.toBe(before.youAre);
    await stop(first.app);

    const second = await start({ dbPath, aiDelayMs: 5 });
    const moved = await until(async () => (await view(second.base)).revision > before.revision, 2_000);
    expect(moved).toBe(true);
  });

  it("keeps the server up and retries when an AI step throws", async () => {
    const { app, base } = await start({ aiDelayMs: 5 });
    // A latent rules or AI bug: every AI command blows up in the engine.
    const aiEngine = (app.service as unknown as { engineFor: (mapId: string) => { applyCommand: (s: GameState, c: GameCommand) => unknown } }).engineFor(GREENVALE_MAP.id);
    const apply = aiEngine.applyCommand.bind(aiEngine);
    let aiAttempts = 0;
    aiEngine.applyCommand = (s, c) => {
      if (!c.commandId.startsWith("ai-")) return apply(s, c);
      aiAttempts++;
      throw new TypeError("simulated engine bug");
    };
    const uncaught: unknown[] = [];
    const onUncaught = (e: unknown) => uncaught.push(e);
    process.on("uncaughtException", onUncaught);
    try {
      const alice = await guest(base, "Alice");
      const created = await api<{ matchId: string }>(base, "/api/matches", alice.token, {
        displayName: "Alice",
        seatCount: 2,
        rulesetName: "standard",
        aiSeats: [{ displayName: "Robo", level: "easy" }],
      });
      const matchId = created.data.matchId;
      await playUntilAiTurn(base, alice.token, matchId);
      expect(await until(async () => aiAttempts > 0, 2_000)).toBe(true);
      await sleep(50);
      expect(uncaught).toEqual([]);
      expect((await api(base, "/api/health", null)).status).toBe(200);
      // The failed step is queued for a retry rather than dropped.
      expect((app.service as unknown as { aiTimers: Map<string, unknown> }).aiTimers.has(matchId)).toBe(true);
    } finally {
      process.off("uncaughtException", onUncaught);
    }
  });
});

describe("WebSocket abuse limits", () => {
  it("answers a repeated subscribe once and closes a flooding socket with 1008", async () => {
    const { base } = await start();
    const alice = await guest(base, "Alice");
    const created = await api<{ matchId: string }>(base, "/api/matches", alice.token, { displayName: "Alice", seatCount: 2, rulesetName: "standard" });
    const ws = await openSocket(base, alice.token);
    let updates = 0;
    ws.on("message", (raw) => {
      if ((JSON.parse(String(raw)) as { type: string }).type === "match_update") updates++;
    });
    const closed = closeCode(ws);
    for (let i = 0; i < 200; i++) ws.send(JSON.stringify({ type: "subscribe", matchId: created.data.matchId }));
    expect(await closed).toBe(1008);
    expect(updates).toBeGreaterThan(0);
    expect(updates).toBeLessThanOrEqual(2);
    expect((await api(base, "/api/health", null)).status).toBe(200);
  });

  it("survives a failing lookup while handling a message", async () => {
    const { app, base } = await start();
    const alice = await guest(base, "Alice");
    app.service.memberPlayerId = () => {
      throw new Error("simulated database error");
    };
    const uncaught: unknown[] = [];
    const onUncaught = (e: unknown) => uncaught.push(e);
    process.on("uncaughtException", onUncaught);
    try {
      const ws = await openSocket(base, alice.token);
      ws.send(JSON.stringify({ type: "subscribe", matchId: "m-1" }));
      await sleep(100);
      expect(uncaught).toEqual([]);
      expect(ws.readyState).toBe(WebSocket.OPEN);
      ws.close();
    } finally {
      process.off("uncaughtException", onUncaught);
    }
  });

  it("closes a socket that sends an oversized frame", async () => {
    const { base } = await start();
    const alice = await guest(base, "Alice");
    const ws = await openSocket(base, alice.token);
    const closed = closeCode(ws);
    ws.send(JSON.stringify({ type: "ping", pad: "x".repeat(5_000) }));
    expect(await closed).toBe(1009);
  });
});

describe("WebSocket heartbeat", () => {
  it("terminates sockets that stop answering pings and updates presence", async () => {
    const { base } = await start({ heartbeatMs: 60 });
    const alice = await guest(base, "Alice");
    const bob = await guest(base, "Bob");
    const created = await api<{ matchId: string; inviteCode: string }>(base, "/api/matches", alice.token, { displayName: "Alice", seatCount: 3, rulesetName: "standard" });
    await api(base, "/api/matches/join", bob.token, { inviteCode: created.data.inviteCode, displayName: "Bob" });
    const seatOf = async (name: string) => (await api<MatchView>(base, `/api/matches/${created.data.matchId}`, alice.token)).data.seats.find((s) => s.displayName === name);

    const healthy = await openSocket(base, alice.token);
    // A half-open connection: the peer never answers pings.
    const dead = await openSocket(base, bob.token, { autoPong: false });
    expect((await seatOf("Bob"))?.connected).toBe(true);
    const closed = closeCode(dead);
    const code = await Promise.race([closed, sleep(1_000).then(() => -1)]);
    expect(code).not.toBe(-1);
    expect((await seatOf("Bob"))?.connected).toBe(false);
    // A client that answers pings stays connected across several intervals.
    await sleep(250);
    expect(healthy.readyState).toBe(WebSocket.OPEN);
    expect((await seatOf("Alice"))?.connected).toBe(true);
    healthy.close();
  });
});

describe("rate limiting behind a reverse proxy", () => {
  // /api/health bypasses the limiter, so probe it through a limited route: an
  // unauthenticated /api/me passes the limiter and then answers 401.
  const probe = (base: string, headers: Record<string, string>) => api(base, "/api/me", null, undefined, headers).then((r) => r.status);

  it("keys buckets on the forwarded client address when trustProxy is set", async () => {
    // One request per second with a burst of five.
    const { base } = await start({ trustProxy: 1, rateLimitPerSecond: 1 });
    for (let i = 0; i < 5; i++) expect(await probe(base, { "x-forwarded-for": "203.0.113.1" })).toBe(401);
    expect(await probe(base, { "x-forwarded-for": "203.0.113.1" })).toBe(429);
    // A spoofed left-most entry does not escape the bucket the proxy appended.
    expect(await probe(base, { "x-forwarded-for": "198.51.100.9, 203.0.113.1" })).toBe(429);
    expect(await probe(base, { "x-forwarded-for": "203.0.113.2" })).toBe(401);
    // Some load balancers append the client port; it must not open a fresh bucket.
    for (let i = 0; i < 4; i++) expect(await probe(base, { "x-forwarded-for": "203.0.113.2" })).toBe(401);
    expect(await probe(base, { "x-forwarded-for": "203.0.113.2:40000" })).toBe(429);
    expect(await probe(base, { forwarded: 'for="[2001:db8::1]:4711"' })).toBe(401);
  });

  it("ignores forwarding headers by default", async () => {
    const { base } = await start({ rateLimitPerSecond: 1 });
    for (let i = 0; i < 5; i++) expect(await probe(base, { "x-forwarded-for": `203.0.113.${i}` })).toBe(401);
    expect(await probe(base, { "x-forwarded-for": "203.0.113.99" })).toBe(429);
  });
});

describe("error responses", () => {
  it("marks unusable sessions with a structured 401 code", async () => {
    const { base } = await start();
    for (const token of [null, "stale-token"]) {
      const res = await api<{ error: string; code?: string }>(base, "/api/matches", token);
      expect(res.status).toBe(401);
      expect(res.data.code).toBe("INVALID_SESSION");
    }
  });

  it("rejects bodies that are not JSON objects with 400", async () => {
    const { base } = await start();
    const alice = await guest(base, "Alice");
    for (const body of [null, [], 42, "text"]) {
      expect((await api(base, "/api/guest", null, body)).status).toBe(400);
      expect((await api(base, "/api/matches", alice.token, body)).status).toBe(400);
      expect((await api(base, "/api/matches/join", alice.token, body)).status).toBe(400);
    }
  });

  it("exits non-zero with a clear message when the port is taken", async () => {
    const blocker = createTcpServer();
    await new Promise<void>((r) => blocker.listen(0, "127.0.0.1", r));
    const port = (blocker.address() as AddressInfo).port;
    const tsx = fileURLToPath(new URL("../../../node_modules/.bin/tsx", import.meta.url));
    const main = fileURLToPath(new URL("../src/main.ts", import.meta.url));
    const child = spawn(tsx, [main], { env: { ...process.env, PORT: String(port), HOST: "127.0.0.1", DB_PATH: ":memory:", WEB_DIST: "/nonexistent" } });
    let stderr = "";
    child.stderr.on("data", (c: Buffer) => (stderr += String(c)));
    const exitCode = await new Promise<number | null>((r) => child.on("exit", (code) => r(code)));
    blocker.close();
    expect(exitCode).toBe(1);
    expect(stderr).toContain(String(port));
    expect(stderr).toContain("EADDRINUSE");
  }, 20_000);
});

describe("command id idempotency", () => {
  async function startedMatch() {
    const { base } = await start();
    const alice = await guest(base, "Alice");
    const bob = await guest(base, "Bob");
    const created = await api<{ matchId: string; inviteCode: string }>(base, "/api/matches", alice.token, { displayName: "Alice", seatCount: 2, rulesetName: "standard" });
    await api(base, "/api/matches/join", bob.token, { inviteCode: created.data.inviteCode, displayName: "Bob" });
    const matchId = created.data.matchId;
    const aliceView = (await api<MatchView>(base, `/api/matches/${matchId}`, alice.token)).data;
    const state = aliceView.state as GameState;
    const token = state.activePlayerId === aliceView.youAre ? alice.token : bob.token;
    const sites = getLegalActions(engine.ctx, state, state.activePlayerId).initialManorSites as string[];
    const submit = (commands: GameCommand[], expectedRevision = state.revision) =>
      api<SubmitCommandsResponse & { error?: unknown; code?: string }>(base, `/api/matches/${matchId}/commands`, token, { matchId, expectedRevision, commands });
    return { state, sites, submit };
  }

  it("replays the original result for an identical retry", async () => {
    const { state, sites, submit } = await startedMatch();
    const cmd = command(state, state.activePlayerId, { type: "place_initial_manor", siteId: sites[0] as string });
    const ok = await submit([cmd]);
    expect(ok.data.accepted).toBe(true);
    expect(ok.data.events.length).toBeGreaterThan(0);
    const retry = await submit([cmd]);
    expect(retry.status).toBe(200);
    expect(retry.data.accepted).toBe(true);
    expect(retry.data.revision).toBe(ok.data.revision);
    expect(retry.data.events).toEqual(ok.data.events);
  });

  it("answers a reused id with a different command with 409", async () => {
    const { state, sites, submit } = await startedMatch();
    const cmd = command(state, state.activePlayerId, { type: "place_initial_manor", siteId: sites[0] as string });
    expect((await submit([cmd])).data.accepted).toBe(true);
    const other = command(state, state.activePlayerId, { type: "place_initial_manor", siteId: sites[1] as string }, cmd.commandId);
    const reused = await submit([other]);
    expect(reused.status).toBe(409);
    expect(reused.data.code).toBe("COMMAND_ID_CONFLICT");
    // Reusing an applied id alongside a new command is a conflict too, never a 500.
    const fresh = command(state, state.activePlayerId, { type: "end_turn" });
    const partial = await submit([cmd, fresh], state.revision + 1);
    expect(partial.status).toBe(409);
    expect(partial.data.code).toBe("COMMAND_ID_CONFLICT");
  });

  it("rejects a batch that repeats a command id with 400", async () => {
    const { state, sites, submit } = await startedMatch();
    const manor = command(state, state.activePlayerId, { type: "place_initial_manor", siteId: sites[0] as string });
    const after = engine.applyCommand(state, manor).newState as GameState;
    const route = getLegalActions(engine.ctx, after, state.activePlayerId).initialRoutes[0] as string;
    const again = command(state, state.activePlayerId, { type: "place_initial_route", routeId: route }, manor.commandId);
    const res = await submit([manor, again]);
    expect(res.status).toBe(400);
    expect(res.data.code).toBe("DUPLICATE_COMMAND_ID");
  });
});
