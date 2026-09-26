import { createDecipheriv, createECDH, hkdfSync } from "node:crypto";
import { mkdtempSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import WebSocket from "ws";
import { chooseAction, fallbackIntents } from "@manors-menaces/ai";
import type { GuestSessionResponse, MatchNotice, MatchView, SubmitCommandsResponse } from "@manors-menaces/protocol";
import { createRng, seedRng, type GameCommand, type GameState } from "@manors-menaces/rules";
import { createApp } from "../src/app.js";
import { engineFor } from "./engines.js";

// Spec §85: a player hears that it is their turn even when that match is not
// open: over their WebSocket while the app is open anywhere, else by Web Push.

let app: ReturnType<typeof createApp>;
let base = "";
let pushes: { url: string; headers: Record<string, string>; body: Buffer }[] = [];
let pushStatus = 201;

async function start(dbPath = ":memory:") {
  const fakeFetch = (async (url: string | URL, init?: RequestInit) => {
    pushes.push({ url: String(url), headers: init?.headers as Record<string, string>, body: Buffer.from(init?.body as Uint8Array) });
    return new Response(null, { status: pushStatus });
  }) as typeof fetch;
  app = createApp({ dbPath, webDist: null, aiDelayMs: 5, rateLimitPerSecond: 10_000, push: { subject: "mailto:test@example.org", fetch: fakeFetch } });
  await new Promise<void>((r) => app.server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
}

beforeEach(async () => {
  pushes = [];
  pushStatus = 201;
  await start();
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

const guest = async (name: string) => (await api<GuestSessionResponse>("/api/guest", null, { displayName: name })).data;

async function match() {
  const alice = await guest("Alice");
  const bob = await guest("Bob");
  const created = await api<{ matchId: string; inviteCode: string }>("/api/matches", alice.token, { displayName: "Alice", seatCount: 2, rulesetName: "standard" });
  await api("/api/matches/join", bob.token, { inviteCode: created.data.inviteCode, displayName: "Bob" });
  const matchId = created.data.matchId;
  const aliceId = (await api<MatchView>(`/api/matches/${matchId}`, alice.token)).data.youAre as string;
  const byPlayer: Record<string, GuestSessionResponse> = { [aliceId]: alice, [aliceId === "P1" ? "P2" : "P1"]: bob };
  return { alice, bob, matchId, byPlayer };
}

const actorOf = (s: GameState) => (s.pending?.kind === "reaction" ? s.pending.eligiblePlayerIds[0] : s.pending?.kind === "prophecy" ? s.pending.playerId : s.activePlayerId) as string;

let seq = 0;
/** Plays until the turn passes to `playerId` from someone else; returns that player's user. */
async function playUntilTurnOf(matchId: string, byPlayer: Record<string, GuestSessionResponse>, playerId: string): Promise<void> {
  const rng = createRng(seedRng("notices"));
  let sawOther = false;
  for (let i = 0; i < 200; i++) {
    const seen = (await api<MatchView>(`/api/matches/${matchId}`, Object.values(byPlayer)[0]!.token)).data;
    const engine = engineFor(seen.mapId);
    const any = seen.state as GameState;
    const actor = actorOf(any);
    if (actor === playerId && sawOther) return;
    if (actor !== playerId) sawOther = true;
    const token = byPlayer[actor]!.token;
    const mine = (await api<MatchView>(`/api/matches/${matchId}`, token)).data.state as GameState;
    const intents = [chooseAction(engine, mine, actor, { level: "easy", rng }), ...fallbackIntents(engine.ctx, mine, actor)].filter(Boolean);
    for (const intent of intents) {
      const command = { ...intent, commandId: `n-${++seq}`, matchId, playerId: actor } as GameCommand;
      const res = await api<SubmitCommandsResponse>(`/api/matches/${matchId}/commands`, token, { matchId, expectedRevision: mine.revision, commands: [command] });
      if (res.data.accepted) break;
    }
  }
  throw new Error(`the turn never passed to ${playerId}`);
}

async function listen(token: string): Promise<{ notices: MatchNotice[]; close: () => void }> {
  const ws = new WebSocket(`${base.replace("http", "ws")}/api/ws?token=${token}`);
  const notices: MatchNotice[] = [];
  ws.on("message", (raw) => {
    const msg = JSON.parse(String(raw));
    if (msg.type === "notice") notices.push(msg.notice);
  });
  await new Promise<void>((r) => ws.on("open", () => r()));
  return { notices, close: () => ws.close() };
}

/** A browser's push keys (RFC 8291 receiver). */
function browserKeys() {
  const ecdh = createECDH("prime256v1");
  ecdh.generateKeys();
  const auth = Buffer.from("0123456789abcdef");
  return { ecdh, auth, keys: { p256dh: ecdh.getPublicKey().toString("base64url"), auth: auth.toString("base64url") } };
}

function decrypt(body: Buffer, ecdh: ReturnType<typeof createECDH>, auth: Buffer): unknown {
  const salt = body.subarray(0, 16);
  const asPublic = body.subarray(21, 21 + body.readUInt8(20));
  const data = body.subarray(21 + asPublic.length);
  const ikm = Buffer.from(hkdfSync("sha256", ecdh.computeSecret(asPublic), auth, Buffer.concat([Buffer.from("WebPush: info\0"), ecdh.getPublicKey(), asPublic]), 32));
  const key = (info: string, n: number) => Buffer.from(hkdfSync("sha256", ikm, salt, Buffer.from(`Content-Encoding: ${info}\0`), n));
  const decipher = createDecipheriv("aes-128-gcm", key("aes128gcm", 16), key("nonce", 12));
  decipher.setAuthTag(data.subarray(-16));
  const plain = Buffer.concat([decipher.update(data.subarray(0, -16)), decipher.final()]);
  return JSON.parse(plain.subarray(0, -1).toString());
}

/** For "nothing more arrives": give stragglers time to show up. */
const settle = (ms = 200) => new Promise((r) => setTimeout(r, ms));
/** For "this arrives": poll instead of guessing how long delivery takes. */
async function waitFor(ok: () => boolean, ms = 3000): Promise<void> {
  for (const end = Date.now() + ms; !ok() && Date.now() < end; ) await new Promise((r) => setTimeout(r, 20));
  if (!ok()) throw new Error(`waitFor: still not true after ${ms} ms`);
}

describe("turn notices", () => {
  it("tell a player whose app is open that it is their turn, over their socket", async () => {
    const { matchId, byPlayer } = await match();
    const [first, second] = Object.keys(byPlayer).sort() as [string, string];
    const sockets = { [first]: await listen(byPlayer[first]!.token), [second]: await listen(byPlayer[second]!.token) };
    // From `first`'s turn, whoever started, so only the hand-over to `second` counts.
    await playUntilTurnOf(matchId, byPlayer, first);
    await settle();
    for (const s of Object.values(sockets)) s.notices.length = 0;
    await playUntilTurnOf(matchId, byPlayer, second);
    await waitFor(() => sockets[second]!.notices.length > 0);
    await settle();

    expect(sockets[second]!.notices.at(-1)).toMatchObject({ matchId, kind: "your_turn", title: "Your turn" });
    expect(sockets[second]!.notices.at(-1)?.body).toContain(byPlayer[first]!.displayName);
    // The player who ended their turn is not told about it.
    expect(sockets[first]!.notices.filter((n) => n.kind === "your_turn")).toHaveLength(0);
    expect(pushes).toHaveLength(0);
    Object.values(sockets).forEach((s) => s.close());
  });

  it("push to a player whose app is closed, encrypted for their browser and signed", async () => {
    const { matchId, byPlayer } = await match();
    const [, second] = Object.keys(byPlayer).sort() as [string, string];
    const browser = browserKeys();
    const endpoint = "https://fcm.googleapis.com/fcm/send/bob-browser";
    expect((await api(`/api/push/subscribe`, byPlayer[second]!.token, { endpoint, keys: browser.keys })).status).toBe(200);
    const { publicKey } = (await api<{ publicKey: string }>("/api/push/key", byPlayer[second]!.token)).data;

    await playUntilTurnOf(matchId, byPlayer, second);
    await waitFor(() => pushes.some((p) => p.url === endpoint));

    const sent = pushes.filter((p) => p.url === endpoint);
    expect(sent.length).toBeGreaterThan(0);
    const last = sent.at(-1)!;
    expect(last.headers["Content-Encoding"]).toBe("aes128gcm");
    expect(last.headers.Authorization).toMatch(new RegExp(`^vapid t=[\\w-]+\\.[\\w-]+\\.[\\w-]+, k=${publicKey}$`));
    expect(decrypt(last.body, browser.ecdh, browser.auth)).toMatchObject({ matchId, kind: "your_turn", title: "Your turn" });
  });

  it("forget a browser the push service says has unsubscribed", async () => {
    const { matchId, byPlayer } = await match();
    const [, second] = Object.keys(byPlayer).sort() as [string, string];
    await api(`/api/push/subscribe`, byPlayer[second]!.token, { endpoint: "https://fcm.googleapis.com/fcm/send/gone", keys: browserKeys().keys });
    pushStatus = 410;
    await playUntilTurnOf(matchId, byPlayer, second);
    await waitFor(() => app.store.pushSubscriptions(byPlayer[second]!.userId).length === 0);
    expect(pushes.length).toBeGreaterThan(0);
    expect(app.store.pushSubscriptions(byPlayer[second]!.userId)).toEqual([]);
  });
});

describe("match start", () => {
  it("tells the first player to act that the match has begun", async () => {
    const alice = await guest("Alice");
    const bob = await guest("Bob");
    const sockets = { alice: await listen(alice.token), bob: await listen(bob.token) };
    const created = await api<{ matchId: string; inviteCode: string }>("/api/matches", alice.token, { displayName: "Alice", seatCount: 2, rulesetName: "standard" });
    await api("/api/matches/join", bob.token, { inviteCode: created.data.inviteCode, displayName: "Bob" });
    const state = (await api<MatchView>(`/api/matches/${created.data.matchId}`, alice.token)).data;
    const firstIsAlice = state.state?.activePlayerId === state.youAre;
    const first = firstIsAlice ? sockets.alice : sockets.bob;
    const other = firstIsAlice ? sockets.bob : sockets.alice;

    await waitFor(() => first.notices.length > 0);
    expect(first.notices).toEqual([expect.objectContaining({ matchId: created.data.matchId, kind: "your_turn" })]);
    expect(other.notices).toEqual([]);
    Object.values(sockets).forEach((s) => s.close());
  });
});

describe("push subscriptions", () => {
  it("are refused unless they point at a known push service over HTTPS, and can be removed", async () => {
    const carol = await guest("Carol");
    const keys = browserKeys().keys;
    for (const endpoint of ["http://fcm.googleapis.com/fcm/send/x", "https://internal.example/hook", "https://127.0.0.1:8787/api/health"]) {
      expect((await api("/api/push/subscribe", carol.token, { endpoint, keys })).status, endpoint).toBe(400);
    }
    expect((await api("/api/push/subscribe", null, { endpoint: "https://fcm.googleapis.com/fcm/send/x", keys })).status).toBe(401);
    expect((await api("/api/push/subscribe", carol.token, { endpoint: "https://fcm.googleapis.com/fcm/send/x", keys })).status).toBe(200);
    expect(app.store.pushSubscriptions(carol.userId)).toHaveLength(1);
    expect((await api("/api/push/unsubscribe", carol.token, { endpoint: "https://fcm.googleapis.com/fcm/send/x" })).status).toBe(200);
    expect(app.store.pushSubscriptions(carol.userId)).toEqual([]);
  });

  it("follow a browser to a new guest, but cannot be claimed by someone else's keys", async () => {
    const [carol, dave] = [await guest("Carol"), await guest("Dave")];
    const endpoint = "https://fcm.googleapis.com/fcm/send/shared";
    const keys = browserKeys().keys;
    await api("/api/push/subscribe", carol.token, { endpoint, keys });
    // Only the browser knows its keys; a stranger with the endpoint alone gets nowhere.
    expect((await api("/api/push/subscribe", dave.token, { endpoint, keys: browserKeys().keys })).status).toBe(409);
    expect(app.store.pushSubscriptions(carol.userId).map((s) => s.endpoint)).toEqual([endpoint]);
    expect(app.store.pushSubscriptions(dave.userId)).toEqual([]);
    // The same browser signing in as another guest takes its subscription along.
    expect((await api("/api/push/subscribe", dave.token, { endpoint, keys })).status).toBe(200);
    expect(app.store.pushSubscriptions(carol.userId)).toEqual([]);
    expect(app.store.pushSubscriptions(dave.userId).map((s) => s.endpoint)).toEqual([endpoint]);
  });

  it("keep working after a restart: the server keeps its VAPID key", async () => {
    await app.close();
    const db = join(mkdtempSync(join(tmpdir(), "mm-vapid-")), "db.sqlite");
    await start(db);
    const dave = await guest("Dave");
    const first = (await api<{ publicKey: string }>("/api/push/key", dave.token)).data.publicKey;
    expect(Buffer.from(first, "base64url")).toHaveLength(65);
    await app.close();
    await start(db);
    expect((await api<{ publicKey: string }>("/api/push/key", dave.token)).data.publicKey).toBe(first);
  });
});
