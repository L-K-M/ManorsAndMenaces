import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { AddressInfo } from "node:net";
import WebSocket from "ws";
import type { GuestSessionResponse, MatchHistoryResponse, MatchView, SubmitCommandsResponse } from "@manors-menaces/protocol";
import { getLegalActions, HIDDEN_CARD, redactEvent, type CommandIntent, type GameCommand, type GameEvent, type GameState } from "@manors-menaces/rules";
import { chooseAction } from "@manors-menaces/ai";
import { createRng, seedRng, createRulesEngine } from "@manors-menaces/rules";
import { rulesContentFor } from "@manors-menaces/content";
import { createApp } from "../src/app.js";

const engine = createRulesEngine(rulesContentFor());
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

async function guest(name: string): Promise<GuestSessionResponse> {
  return (await api<GuestSessionResponse>("/api/guest", null, { displayName: name })).data;
}

let seq = 0;
function command(state: GameState, playerId: string, intent: CommandIntent): GameCommand {
  return { ...intent, commandId: `t-${++seq}`, matchId: state.matchId, playerId } as GameCommand;
}

async function setupTwoPlayerMatch() {
  const alice = await guest("Alice");
  const bob = await guest("Bob");
  const created = await api<{ matchId: string; inviteCode: string }>("/api/matches", alice.token, { displayName: "Alice", seatCount: 2, rulesetName: "standard" });
  expect(created.status).toBe(200);
  const joined = await api<{ matchId: string; seat: number }>("/api/matches/join", bob.token, { inviteCode: created.data.inviteCode, displayName: "Bob" });
  expect(joined.data.matchId).toBe(created.data.matchId);
  return { alice, bob, matchId: created.data.matchId };
}

describe("static files", () => {
  it("refuses traversal to sibling directories and survives malformed paths", async () => {
    const { mkdtempSync, mkdirSync, writeFileSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const root = mkdtempSync(join(tmpdir(), "mm-static-"));
    mkdirSync(join(root, "web"));
    mkdirSync(join(root, "webevil"));
    writeFileSync(join(root, "web", "index.html"), "<!doctype html>ok");
    writeFileSync(join(root, "webevil", "secret.txt"), "secret");
    const app2 = createApp({ dbPath: ":memory:", webDist: join(root, "web") });
    await new Promise<void>((r) => app2.server.listen(0, "127.0.0.1", r));
    const port = (app2.server.address() as AddressInfo).port;
    const { request } = await import("node:http");
    const get = (path: string) =>
      new Promise<{ status: number; body: string }>((resolve) => {
        request({ host: "127.0.0.1", port, path }, (res) => {
          let body = "";
          res.on("data", (c) => (body += c));
          res.on("end", () => resolve({ status: res.statusCode ?? 0, body }));
        }).end();
      });
    const evil = await get("/..%2fwebevil/secret.txt");
    expect(evil.body).not.toContain("secret");
    expect((await get("/%E0%A4%A")).status).toBe(400);
    expect((await get("/")).body).toContain("ok");
    await app2.close();
  });
});

describe("protocol details", () => {
  it("answers OPTIONS with 204 and no body", async () => {
    // 204 must have no body (RFC 9110); check at the HTTP level, since fetch
    // implementations hide the violation rather than reject it.
    const { request } = await import("node:http");
    const res = await new Promise<{ status: number; body: string; allowOrigin: string | null; contentType: string | null }>((resolve) => {
      const req = request(
        { host: "127.0.0.1", port: Number(new URL(base).port), path: "/api/matches", method: "OPTIONS" },
        (r) => {
          let body = "";
          r.on("data", (c: Buffer) => (body += c));
          r.on("end", () => resolve({ status: r.statusCode ?? 0, body, allowOrigin: r.headers["access-control-allow-origin"] ?? null, contentType: r.headers["content-type"] ?? null }));
        },
      );
      req.end();
    });
    expect(res.status).toBe(204);
    expect(res.body).toBe("");
    expect(res.allowOrigin).not.toBeNull();
    expect(res.contentType).toBeNull();
  });
  it("serves /api/health without rate limiting", async () => {
    // A strict limiter must not 429 the Docker HEALTHCHECK (Dockerfile).
    const strict = createApp({ dbPath: ":memory:", webDist: null, rateLimitPerSecond: 1 });
    await new Promise<void>((r) => strict.server.listen(0, "127.0.0.1", r));
    const healthBase = `http://127.0.0.1:${(strict.server.address() as AddressInfo).port}`;
    try {
      const burst = await Promise.all(Array.from({ length: 20 }, () => fetch(healthBase + "/api/health")));
      expect(burst.every((r) => r.status === 200)).toBe(true);
      // The limiter still applies to real API routes.
      const gated = await Promise.all(Array.from({ length: 20 }, () => fetch(healthBase + "/api/guest", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" })));
      expect(gated.some((r) => r.status === 429)).toBe(true);
    } finally {
      await strict.close();
    }
  });
});

describe("server", () => {
  it("rejects unauthenticated and non-member requests", async () => {
    const { matchId } = await setupTwoPlayerMatch();
    expect((await api("/api/matches", null)).status).toBe(401);
    const mallory = await guest("Mallory");
    expect((await api(`/api/matches/${matchId}`, mallory.token)).status).toBe(403);
  });

  it("starts when full and redacts other players' hidden information", async () => {
    const { alice, bob, matchId } = await setupTwoPlayerMatch();
    const view = (await api<MatchView>(`/api/matches/${matchId}`, alice.token)).data;
    expect(view.status).toBe("playing");
    expect(view.state?.seed).toBe("hidden");
    expect(view.state?.cardDeck.every((c) => c === HIDDEN_CARD)).toBe(true);
    const bobView = (await api<MatchView>(`/api/matches/${matchId}`, bob.token)).data;
    expect(bobView.youAre).not.toBe(view.youAre);
  });

  it("plays full games through the API with revision checks", async () => {
    const { alice, bob, matchId } = await setupTwoPlayerMatch();
    const tokens: Record<string, string> = {};
    const aliceView = (await api<MatchView>(`/api/matches/${matchId}`, alice.token)).data;
    tokens[aliceView.youAre as string] = alice.token;
    tokens[aliceView.youAre === "P1" ? "P2" : "P1"] = bob.token;
    const rng = createRng(seedRng("server-test"));
    let steps = 0;
    // Drive both seats with the AI through the public API for a while.
    for (; steps < 300; steps++) {
      const any = (await api<MatchView>(`/api/matches/${matchId}`, alice.token)).data;
      const s = any.state as GameState;
      if (s.status === "finished") break;
      const actor = s.pending?.kind === "reaction" ? s.pending.eligiblePlayerIds[0] : s.pending?.kind === "prophecy" ? s.pending.playerId : s.activePlayerId;
      const token = tokens[actor as string] as string;
      const mine = (await api<MatchView>(`/api/matches/${matchId}`, token)).data.state as GameState;
      // The AI needs no hidden information for its own choices.
      const intent = chooseAction(engine, mine, actor as string, { level: "easy", rng });
      if (!intent) break;
      const legal = getLegalActions(engine.ctx, mine, actor as string);
      const cmd = command(mine, actor as string, intent);
      const res = await api<SubmitCommandsResponse>(`/api/matches/${matchId}/commands`, token, { matchId, expectedRevision: mine.revision, commands: [cmd] });
      if (!res.data.accepted) {
        // Fall back so the test never stalls on an AI choice against redacted state.
        const fallback: CommandIntent =
          legal.mode === "main" ? { type: "end_main_phase" } : legal.mode === "banner_assignment" ? { type: "assign_banners", assignments: {} } : { type: "end_turn" };
        const r2 = await api<SubmitCommandsResponse>(`/api/matches/${matchId}/commands`, token, { matchId, expectedRevision: mine.revision, commands: [command(mine, actor as string, fallback)] });
        expect(r2.data.accepted, JSON.stringify(res.data.error)).toBe(true);
      }
    }
    expect(steps).toBeGreaterThan(20);
    const final = (await api<MatchView>(`/api/matches/${matchId}`, alice.token)).data;
    expect(final.revision).toBeGreaterThan(20);
  }, 60_000);

  it("rejects stale revisions and commands for another seat", async () => {
    const { alice, bob, matchId } = await setupTwoPlayerMatch();
    const view = (await api<MatchView>(`/api/matches/${matchId}`, alice.token)).data;
    const s = view.state as GameState;
    const activeToken = s.activePlayerId === view.youAre ? alice.token : bob.token;
    const otherToken = activeToken === alice.token ? bob.token : alice.token;
    const site = getLegalActions(engine.ctx, s, s.activePlayerId).initialManorSites[0] as string;
    const cmd = command(s, s.activePlayerId, { type: "place_initial_manor", siteId: site });
    // Spoofing the other seat is forbidden.
    expect((await api(`/api/matches/${matchId}/commands`, otherToken, { matchId, expectedRevision: s.revision, commands: [cmd] })).status).toBe(403);
    // Stale revision.
    const stale = await api<SubmitCommandsResponse>(`/api/matches/${matchId}/commands`, activeToken, { matchId, expectedRevision: s.revision + 5, commands: [cmd] });
    expect(stale.data.error?.code).toBe("REVISION_MISMATCH");
    // Correct submission, then an idempotent retry.
    const ok = await api<SubmitCommandsResponse>(`/api/matches/${matchId}/commands`, activeToken, { matchId, expectedRevision: s.revision, commands: [cmd] });
    expect(ok.data.accepted).toBe(true);
    const retry = await api<SubmitCommandsResponse>(`/api/matches/${matchId}/commands`, activeToken, { matchId, expectedRevision: s.revision, commands: [cmd] });
    expect(retry.data.accepted).toBe(true);
    expect(retry.data.revision).toBe(ok.data.revision);
    // Malformed batch.
    expect((await api(`/api/matches/${matchId}/commands`, activeToken, { matchId, expectedRevision: 1, commands: [{ type: "hack" }] })).status).toBe(400);
  });

  it("pushes updates over WebSocket and runs AI seats", async () => {
    const alice = await guest("Alice");
    const created = await api<{ matchId: string }>("/api/matches", alice.token, {
      displayName: "Alice",
      seatCount: 2,
      rulesetName: "mvp",
      aiSeats: [{ displayName: "Robo", level: "easy" }],
    });
    const ws = new WebSocket(`${base.replace("http", "ws")}/api/ws?token=${alice.token}`);
    const updates: MatchView[] = [];
    await new Promise<void>((r) => ws.on("open", () => r()));
    ws.on("message", (raw) => {
      const msg = JSON.parse(String(raw));
      if (msg.type === "match_update") updates.push(msg.match);
    });
    ws.send(JSON.stringify({ type: "subscribe", matchId: created.data.matchId }));
    // Whoever goes first, the AI eventually acts or it is Alice's move.
    await new Promise((r) => setTimeout(r, 400));
    const view = (await api<MatchView>(`/api/matches/${created.data.matchId}`, alice.token)).data;
    expect(view.status).toBe("playing");
    expect(view.seats.find((s) => s.kind === "ai")?.displayName).toBe("Robo");
    expect(updates.length).toBeGreaterThan(0);
    // Hostile messages must not take the server down.
    for (const m of ["null", "[]", "42", '{"type":"subscribe","matchId":{}}']) ws.send(m);
    await new Promise((r) => setTimeout(r, 100));
    expect((await api("/api/health", null)).status).toBe(200);
    ws.close();
  });
});

describe("catching up on missed moves", () => {
  interface Submission {
    playerId: string;
    from: number;
    to: number;
    /** As the submitter saw them. */
    events: GameEvent[];
  }

  /** Both seats play `steps` single-command batches chosen by the AI. */
  async function play(matchId: string, tokens: Record<string, string>, steps: number): Promise<Submission[]> {
    const rng = createRng(seedRng("catch-up-test"));
    const out: Submission[] = [];
    const anyToken = Object.values(tokens)[0] as string;
    for (let i = 0; i < steps; i++) {
      const s = (await api<MatchView>(`/api/matches/${matchId}`, anyToken)).data.state as GameState;
      if (s.status === "finished") break;
      const actor = (s.pending?.kind === "reaction" ? s.pending.eligiblePlayerIds[0] : s.pending?.kind === "prophecy" ? s.pending.playerId : s.activePlayerId) as string;
      const token = tokens[actor] as string;
      const mine = (await api<MatchView>(`/api/matches/${matchId}`, token)).data.state as GameState;
      const legal = getLegalActions(engine.ctx, mine, actor);
      const fallback: CommandIntent =
        legal.mode === "main" ? { type: "end_main_phase" } : legal.mode === "banner_assignment" ? { type: "assign_banners", assignments: {} } : { type: "end_turn" };
      const intents = [chooseAction(engine, mine, actor, { level: "easy", rng }) ?? fallback, fallback];
      for (const intent of intents) {
        const res = await api<SubmitCommandsResponse>(`/api/matches/${matchId}/commands`, token, { matchId, expectedRevision: mine.revision, commands: [command(mine, actor, intent)] });
        if (!res.data.accepted) continue;
        out.push({ playerId: actor, from: mine.revision, to: res.data.revision, events: res.data.events });
        break;
      }
    }
    return out;
  }

  async function twoPlayers() {
    const { alice, bob, matchId } = await setupTwoPlayerMatch();
    const aliceId = (await api<MatchView>(`/api/matches/${matchId}`, alice.token)).data.youAre as string;
    const bobId = aliceId === "P1" ? "P2" : "P1";
    return { alice, bob, matchId, aliceId, bobId, tokens: { [aliceId]: alice.token, [bobId]: bob.token } };
  }

  const eventsBetween = (entries: { revision: number; events: GameEvent[] }[], from: number, to: number): GameEvent[] =>
    entries.filter((e) => e.revision > from && e.revision <= to).flatMap((e) => e.events);

  it("returns every move's events, with other players' hidden cards removed", async () => {
    const { alice, bob, matchId, aliceId, bobId, tokens } = await twoPlayers();
    const played = await play(matchId, tokens, 80);
    expect(played.length).toBeGreaterThan(40);

    const history = await api<MatchHistoryResponse>(`/api/matches/${matchId}/history`, alice.token);
    expect(history.status).toBe(200);
    const { match, entries, complete } = history.data;
    expect(complete).toBe(true);
    expect(match.youAre).toBe(aliceId);
    expect(match.revision).toBe(played.at(-1)?.to);
    // One entry per committed command, in order.
    expect(entries.map((e) => e.revision)).toEqual(Array.from({ length: match.revision }, (_, i) => i + 1));
    for (const p of played) {
      // Alice sees her own moves as she did when she made them, and Bob's as
      // the server would have pushed them to her.
      const expected = p.playerId === aliceId ? p.events : p.events.map((e) => redactEvent(e, aliceId));
      expect(eventsBetween(entries, p.from, p.to)).toEqual(expected);
    }
    const bobHistory = (await api<MatchHistoryResponse>(`/api/matches/${matchId}/history`, bob.token)).data;
    for (const p of played.filter((q) => q.playerId === bobId)) expect(eventsBetween(bobHistory.entries, p.from, p.to)).toEqual(p.events);
  }, 60_000);

  it("is only for the match's players", async () => {
    const { matchId } = await setupTwoPlayerMatch();
    const carol = await guest("Carol");
    expect((await api(`/api/matches/${matchId}/history`, carol.token)).status).toBe(403);
    expect((await api(`/api/matches/${matchId}/history`, null)).status).toBe(401);
  });

  it("sends a resubscribing client the events after the revision it already has", async () => {
    const { alice, matchId, tokens } = await twoPlayers();
    const played = await play(matchId, tokens, 30);
    const history = (await api<MatchHistoryResponse>(`/api/matches/${matchId}/history`, alice.token)).data;
    expect(played.length).toBeGreaterThan(11);
    const since = played[10]!.to;

    const firstUpdate = async (subscribe: object): Promise<{ match: MatchView; events: GameEvent[] }> => {
      const ws = new WebSocket(`${base.replace("http", "ws")}/api/ws?token=${alice.token}`);
      await new Promise<void>((r) => ws.on("open", () => r()));
      const update = new Promise<{ match: MatchView; events: GameEvent[] }>((resolve) =>
        ws.on("message", (raw) => {
          const msg = JSON.parse(String(raw));
          if (msg.type === "match_update") resolve(msg);
        }),
      );
      ws.send(JSON.stringify({ type: "subscribe", matchId, ...subscribe }));
      const got = await update;
      ws.close();
      return got;
    };

    const caughtUp = await firstUpdate({ since });
    expect(caughtUp.match.revision).toBe(history.match.revision);
    expect(caughtUp.events).toEqual(eventsBetween(history.entries, since, history.match.revision));
    expect(caughtUp.events.length).toBeGreaterThan(0);
    // Without `since` (older clients) the first update still carries no events.
    expect((await firstUpdate({})).events).toEqual([]);
  }, 60_000);
});
