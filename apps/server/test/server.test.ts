import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { AddressInfo } from "node:net";
import WebSocket from "ws";
import type { GuestSessionResponse, MatchView, SubmitCommandsResponse } from "@manors-menaces/protocol";
import { getLegalActions, HIDDEN_CARD, type CommandIntent, type GameCommand, type GameState } from "@manors-menaces/rules";
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
    ws.close();
  });
});
